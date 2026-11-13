import { APP } from './config.js';
import { nowISO } from './utils.js';
import {
  createEncryptionCredentials,
  verifyPinAgainstVerifier,
} from './crypto.js';

const PIN_MIN_DIGITS = 6;
const PIN_MAX_DIGITS = 8;
export const PBKDF2_ITERATIONS = 310_000;

// Lockout eksponensial: 1 menit → 5 menit → 15 menit → 15 menit (maksimum).
const LOCKOUT_STAGES_MS = [60_000, 5 * 60_000, 15 * 60_000];
const MAX_ATTEMPTS = 5;

function bytesToBase64(bytes) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
}

function assertPin(pin) {
  const value = String(pin || '');
  if (!/^\d{6,8}$/.test(value)) {
    throw new Error('PIN harus terdiri dari 6–8 angka.');
  }
  return value;
}

async function deriveHash(pin, salt, iterations = PBKDF2_ITERATIONS) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto tidak tersedia. Buka aplikasi melalui HTTPS atau localhost.');
  }
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(String(pin)),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: base64ToBytes(salt),
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

/**
 * Buat kredensial PIN beserta kredensial enkripsi at-rest.
 * Mengembalikan { pinCredentials, encryption }.
 * encryptionCredentials.key (CryptoKey) hanya ada di memori dan tidak dikembalikan
 * untuk disimpan ke disk — caller bertanggung jawab menyimpannya di memori aplikasi.
 */
export async function createPinAndEncryption(pin, userId = null) {
  const value = assertPin(pin);
  const salt = randomSalt();
  const pinHash = await deriveHash(value, salt, PBKDF2_ITERATIONS);
  const pinCredentials = {
    pinHash,
    pinSalt: salt,
    pinIterations: PBKDF2_ITERATIONS,
    updatedAt: nowISO(),
  };
  // Gunakan salt yang sama dengan pinHash agar kunci enkripsi/verifier
  // konsisten dengan salt yang disimpan di profil pengguna.
  const encryption = await createEncryptionCredentials(value, salt, PBKDF2_ITERATIONS);
  // Simpan verifier + salt ke IndexedDB meta agar PIN dapat diverifikasi
  // sebelum kunci enkripsi tersedia (untuk unlock layar kunci).
  if (userId) {
    void savePinMetadata(userId, salt, PBKDF2_ITERATIONS, encryption.verifier).catch(() => {});
  }
  return { pinCredentials, encryption };
}

/**
 * Kompatibilitas lama: hanya kredensial PIN (tanpa enkripsi).
 * Digunakan oleh existing tests.
 */
export async function createPinCredentials(pin) {
  const result = await createPinAndEncryption(pin);
  return result.pinCredentials;
}

export async function verifyPin(user, pin) {
  if (!user?.pinHash || !user?.pinSalt) return false;
  const value = assertPin(pin);
  const hash = await deriveHash(value, user.pinSalt, Number(user.pinIterations) || PBKDF2_ITERATIONS);
  if (hash.length !== user.pinHash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i += 1) {
    diff |= hash.charCodeAt(i) ^ user.pinHash.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verifikasi PIN menggunakan verifier (hash terpisah) tanpa membuka kunci enkripsi.
 * Digunakan saat layar kunci (lock screen) agar kunci AES-GCM tidak perlu di-derive
 * sebelum PIN diverifikasi.
 */
export async function verifyPinByVerifier(user, pin) {
  if (!user?.pinVerifier || !user?.pinSalt) return false;
  const value = assertPin(pin);
  return verifyPinAgainstVerifier(value, user.pinVerifier, user.pinSalt, Number(user.pinIterations) || PBKDF2_ITERATIONS);
}

export function usersNeedingSetup(users) {
  return (users || []).filter((user) => !user.deletedAt && !user.pinHash);
}

export function needsSetup(users) {
  return usersNeedingSetup(users).length > 0;
}

/* -------------------------------------------------------------------------- */
/*  Session — sessionStorage + IndexedDB meta (cookie non-HttpOnly dihapus)  */
/* -------------------------------------------------------------------------- */

import { repository } from './repository.js';

const SESSION_META_KEY = 'risly.mm.session.v1';

function writeSessionToMemory(value) {
  try { sessionStorage.setItem(APP.sessionKey, value); } catch { /* storage may be full */ }
}

function readSessionFromMemory() {
  try {
    const raw = sessionStorage.getItem(APP.sessionKey);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function removeSessionFromMemory() {
  try { sessionStorage.removeItem(APP.sessionKey); } catch { /* noop */ }
}

function deleteLegacySessionCookie() {
  document.cookie = `${APP.sessionKey}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 UTC`;
  document.cookie = `${APP.sessionKey}=; path=/; SameSite=None; Secure; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 UTC`;
}

export function getSession() {
  try {
    const session = readSessionFromMemory();
    if (!session) return null;
    if (!session?.userId || !session?.lastActivity) return null;
    return session;
  } catch {
    return null;
  }
}

export function createSession(userId, workspaceId = null) {
  const session = {
    userId,
    workspaceId,
    issuedAt: Date.now(),
    lastActivity: Date.now(),
  };
  writeSessionToMemory(JSON.stringify(session));
  // Simpan ringkasan sesi ke IndexedDB meta agar bertahan iOS restart (hanya ID, bukan token sensitif).
  if (repository && typeof repository.setMeta === 'function') {
    void repository.setMeta(SESSION_META_KEY, JSON.stringify({
      userId,
      workspaceId,
      updatedAt: nowISO(),
    })).catch(() => {});
  }
  return session;
}

export function updateSessionActivity() {
  const session = getSession();
  if (!session) return null;
  session.lastActivity = Date.now();
  writeSessionToMemory(JSON.stringify(session));
  return session;
}

export function clearSession() {
  removeSessionFromMemory();
  deleteLegacySessionCookie();
  try {
    if (repository && typeof repository.setMeta === 'function') {
      void repository.setMeta(SESSION_META_KEY, null).catch(() => {});
    }
  } catch { /* noop */ }
}

export function isSessionExpired(session, autoLockMinutes) {
  if (!session) return true;
  const minutes = Number(autoLockMinutes) || 0;
  if (minutes <= 0) return false;
  return Date.now() - session.lastActivity > minutes * 60_000;
}

/* -------------------------------------------------------------------------- */
/*  Login throttling (eksponensial)                                           */
/* -------------------------------------------------------------------------- */

function readLockouts() {
  try {
    return JSON.parse(localStorage.getItem(APP.lockoutKey) || '{}') || {};
  } catch {
    return {};
  }
}

function writeLockouts(map) {
  localStorage.setItem(APP.lockoutKey, JSON.stringify(map));
}

function nextLockoutMs(count) {
  // count = jumlah kali mencapai ambang MAX_ATTEMPTS (0 = pertama kali)
  const stage = Math.min(count, LOCKOUT_STAGES_MS.length - 1);
  return LOCKOUT_STAGES_MS[stage];
}

export function getLockRemaining(userId) {
  const entry = readLockouts()[userId];
  if (!entry?.until) return 0;
  const remaining = entry.until - Date.now();
  if (remaining <= 0) {
    const map = readLockouts();
    delete map[userId];
    writeLockouts(map);
    return 0;
  }
  return remaining;
}

export function registerFailedAttempt(userId) {
  const map = readLockouts();
  const entry = map[userId] || { count: 0, stage: 0, until: 0 };
  entry.count = (entry.count || 0) + 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.stage = (entry.stage || 0) + 1;
    entry.until = Date.now() + nextLockoutMs(entry.stage - 1);
    entry.count = 0;
  }
  map[userId] = entry;
  writeLockouts(map);
  return {
    remaining: getLockRemaining(userId),
    attemptsLeft: Math.max(0, MAX_ATTEMPTS - entry.count),
    stage: entry.stage || 0,
  };
}

export function resetFailedAttempts(userId) {
  const map = readLockouts();
  delete map[userId];
  writeLockouts(map);
}

/* -------------------------------------------------------------------------- */
/*  Kunci enkripsi di memori (hanya RAM, tidak pernah di disk)                */
/* -------------------------------------------------------------------------- */

/**
 * Simpan kunci enkripsi AES-GCM di memori aplikasi.
 * Kunci ini digunakan untuk enkripsi/dekripsi workspace di IndexedDB.
 * Harus dihapus (clearEncryptionKey) saat auto-lock / logout.
 */
let _encryptionKey = null;
let _encryptionSalt = null;

export function setEncryptionKey(key, salt) {
  _encryptionKey = key;
  _encryptionSalt = salt || null;
}

export function getEncryptionKey() {
  return _encryptionKey;
}

export function getEncryptionSalt() {
  return _encryptionSalt;
}

export function clearEncryptionKey() {
  _encryptionKey = null;
  _encryptionSalt = null;
}

/* -------------------------------------------------------------------------- */
/*  Ganti PIN (dengan enkripsi)                                               */
/* -------------------------------------------------------------------------- */

export async function changePin(user, currentPin, newPin) {
  if (user?.pinHash || user?.pinVerifier) {
    let valid = false;
    if (user.pinHash) valid = await verifyPin(user, currentPin);
    if (!valid && user.pinVerifier) valid = await verifyPinByVerifier(user, currentPin);
    if (!valid) throw new Error('PIN saat ini tidak cocok.');
  }
  const { pinCredentials, encryption } = await createPinAndEncryption(newPin);
  return { ...pinCredentials, encryption };
}

/* -------------------------------------------------------------------------- */
/*  Metadata PIN di IndexedDB meta (untuk verifikasi sebelum dekripsi)        */
/* -------------------------------------------------------------------------- */

const PIN_META_PREFIX = 'risly.mm.pin.meta.v1.';

function pinMetaKey(userId) {
  return `${PIN_META_PREFIX}${userId}`;
}

/**
 * Simpan metadata verifikasi PIN ke IndexedDB meta (terpisah dari workspace terenkripsi).
 * Digunakan untuk memverifikasi PIN sebelum kunci AES-GMC tersedia.
 */
export async function savePinMetadata(userId, pinSalt, pinIterations, pinVerifier) {
  await repository.setMeta(pinMetaKey(userId), JSON.stringify({
    pinSalt,
    pinIterations,
    pinVerifier,
    updatedAt: nowISO(),
  }));
}

/**
 * Muat metadata verifikasi PIN dari IndexedDB meta.
 * @returns {Promise<{pinSalt: string, pinIterations: number, pinVerifier: string} | null>}
 */
export async function loadPinMetadata(userId) {
  try {
    const raw = await repository.getMeta(pinMetaKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      pinSalt: parsed.pinSalt,
      pinIterations: Number(parsed.pinIterations) || 0,
      pinVerifier: parsed.pinVerifier,
      updatedAt: parsed.updatedAt || '',
    };
  } catch {
    return null;
  }
}

/**
 * Cari semua metadata PIN di IndexedDB. Berguna saat snapshot layar kunci
 * hilang atau userId di registry tidak cocok (mis. setelah pemulihan sesi).
 * @returns {Promise<Array<{userId: string, pinSalt: string, pinIterations: number, pinVerifier: string, updatedAt: string}>>}
 */
export async function listPinMetadata() {
  try {
    const keys = await repository.listMetaKeys(PIN_META_PREFIX);
    const items = [];
    for (const key of keys) {
      const raw = await repository.getMeta(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (!parsed?.pinVerifier || !parsed?.pinSalt) continue;
        items.push({
          userId: key.slice(PIN_META_PREFIX.length),
          pinSalt: parsed.pinSalt,
          pinIterations: Number(parsed.pinIterations) || 0,
          pinVerifier: parsed.pinVerifier,
          updatedAt: parsed.updatedAt || '',
        });
      } catch {
        /* skip entri rusak */
      }
    }
    return items;
  } catch {
    return [];
  }
}

/**
 * Hapus metadata PIN dari IndexedDB (saat reset / hapus PIN).
 */
export async function clearPinMetadata(userId) {
  try {
    const store = await repository._store('meta', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(pinMetaKey(userId));
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    /* noop */
  }
}

/* -------------------------------------------------------------------------- */
/*  Snapshot layar kunci                                                      */
/* -------------------------------------------------------------------------- */

const LOCK_SNAPSHOT_KEY = 'risly.mm.lockscreen.v1';

/**
 * Simpan snapshot non-sensitif untuk menampilkan layar kunci saat workspace
 * terenkripsi belum bisa didekripsi. Verifier adalah password hash, bukan
 * kunci enkripsi, sehingga aman disimpan untuk verifikasi PIN.
 */
export function saveLockSnapshot(user, workspaceId = null) {
  try {
    // Simpan juga pinHash untuk kompatibilitas pengguna PIN lama (belum punya
    // verifier). Verifier/hash adalah hash, bukan kunci enkripsi.
    if (!user?.id || (!user.pinVerifier && !user.pinHash) || !user.pinSalt) {
      localStorage.removeItem(LOCK_SNAPSHOT_KEY);
      return;
    }
    localStorage.setItem(
      LOCK_SNAPSHOT_KEY,
      JSON.stringify({
        id: user.id,
        name: user.name || '',
        pinSalt: user.pinSalt,
        pinIterations: Number(user.pinIterations) || 0,
        pinVerifier: user.pinVerifier || '',
        pinHash: user.pinHash || '',
        workspaceId: workspaceId || null,
        updatedAt: nowISO(),
      }),
    );
  } catch {
    /* noop */
  }
}

export function readLockSnapshot() {
  try {
    const raw = localStorage.getItem(LOCK_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.id || (!parsed.pinVerifier && !parsed.pinHash) || !parsed.pinSalt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearLockSnapshot() {
  try {
    localStorage.removeItem(LOCK_SNAPSHOT_KEY);
  } catch {
    /* noop */
  }
}
