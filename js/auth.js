import { APP } from './config.js';
import { nowISO } from './utils.js';

const PBKDF2_ITERATIONS = 150_000;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 60_000;

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
  if (!/^\d{4,8}$/.test(value)) {
    throw new Error('PIN harus terdiri dari 4–8 angka.');
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

export async function createPinCredentials(pin) {
  const value = assertPin(pin);
  const salt = randomSalt();
  const hash = await deriveHash(value, salt, PBKDF2_ITERATIONS);
  return { pinHash: hash, pinSalt: salt, pinIterations: PBKDF2_ITERATIONS, updatedAt: nowISO() };
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

export function usersNeedingSetup(users) {
  return (users || []).filter((user) => !user.deletedAt && !user.pinHash);
}

export function needsSetup(users) {
  return usersNeedingSetup(users).length > 0;
}

/* -------------------------------------------------------------------------- */
/*  Session — cookie + localStorage so the PWA survives iOS restarts         */
/* -------------------------------------------------------------------------- */

function isSecureContext() {
  return location.protocol === 'https:'
    || location.hostname === 'localhost'
    || location.hostname === '127.0.0.1';
}

function setCookie(name, value, days = 30) {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  const flags = isSecureContext() ? 'SameSite=None; Secure' : 'SameSite=Lax';
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; expires=${expires}; ${flags}`;
}

function getCookie(name) {
  try {
    const pair = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='));
    if (!pair) return null;
    return decodeURIComponent(pair.slice(name.length + 1));
  } catch {
    return null;
  }
}

function deleteCookie(name) {
  document.cookie = `${name}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 UTC`;
  document.cookie = `${name}=; path=/; SameSite=None; Secure; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 UTC`;
}

function writeSession(value) {
  try { localStorage.setItem(APP.sessionKey, value); } catch { /* storage may be full */ }
  try { setCookie(APP.sessionKey, value, 30); } catch { /* cookies may be blocked */ }
}

function readSessionRaw() {
  const cookie = getCookie(APP.sessionKey);
  if (cookie) return cookie;
  try { return localStorage.getItem(APP.sessionKey); } catch { return null; }
}

function removeSession() {
  try { deleteCookie(APP.sessionKey); } catch { /* noop */ }
  try { localStorage.removeItem(APP.sessionKey); } catch { /* noop */ }
}

export function getSession() {
  try {
    const raw = readSessionRaw();
    if (!raw) return null;
    const session = JSON.parse(raw);
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
  writeSession(JSON.stringify(session));
  return session;
}

export function updateSessionActivity() {
  const session = getSession();
  if (!session) return null;
  session.lastActivity = Date.now();
  writeSession(JSON.stringify(session));
  return session;
}

export function clearSession() {
  removeSession();
}

export function isSessionExpired(session, autoLockMinutes) {
  if (!session) return true;
  const minutes = Number(autoLockMinutes) || 0;
  if (minutes <= 0) return false;
  return Date.now() - session.lastActivity > minutes * 60_000;
}

/* -------------------------------------------------------------------------- */
/*  Login throttling                                                          */
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
  const entry = map[userId] || { count: 0, until: 0 };
  entry.count = (entry.count || 0) + 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.until = Date.now() + LOCK_MS;
    entry.count = 0;
  }
  map[userId] = entry;
  writeLockouts(map);
  return {
    remaining: getLockRemaining(userId),
    attemptsLeft: Math.max(0, MAX_ATTEMPTS - entry.count),
  };
}

export function resetFailedAttempts(userId) {
  const map = readLockouts();
  delete map[userId];
  writeLockouts(map);
}

export async function changePin(user, currentPin, newPin) {
  if (user?.pinHash) {
    const valid = await verifyPin(user, currentPin);
    if (!valid) throw new Error('PIN saat ini tidak cocok.');
  }
  return createPinCredentials(newPin);
}
