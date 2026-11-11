/**
 * RISLY Money Manager — Modul Kriptografi (Fase 7)
 *
 * Menyediakan enkripsi at-rest untuk data workspace menggunakan AES-GCM 256-bit
 * dengan kunci turunan dari PIN (PBKDF2-SHA256, ≥310.000 iterasi). Kunci hanya
 * ada di memori, tidak pernah disimpan ke disk. Verifier (hash terpisah) disimpan
 * bersama profil pengguna untuk memvalidasi PIN tanpa membuka kunci enkripsi.
 *
 * Backup terenkripsi menggunakan passphrase terpisah (AES-GCM + PBKDF2) dan
 * disimpan sebagai file `.risly.enc` agar bisa dipulihkan di perangkat lain.
 */

export const ENC_ITERATIONS = 310_000;
const ENC_KEY_BITS = 256;
const ENC_ALG = { name: 'AES-GCM', length: ENC_KEY_BITS };
const PBKDF2_ALG = { name: 'PBKDF2', hash: 'SHA-256' };

const ENC_SALT_KEY = 'risly.mm.enc.salt.v1';
const ENC_ITER_KEY = 'risly.mm.enc.iterations.v1';

/* -------------------------------------------------------------------------- */
/*  Utilitas bantu                                                            */
/* -------------------------------------------------------------------------- */

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function arrayBufferToBase64(buffer) {
  return bytesToBase64(new Uint8Array(buffer));
}

function base64ToArrayBuffer(base64) {
  return base64ToBytes(base64).buffer;
}

/**
 * Impor PIN sebagai key material PBKDF2.
 */
async function importPinKeyMaterial(pin) {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(String(pin)),
    PBKDF2_ALG,
    false,
    ['deriveBits', 'deriveKey'],
  );
}

/**
 * Turunkan kunci AES-GCM dari PIN + salt + iterasi.
 * @returns {Promise<CryptoKey>} Kunci AES-GCM (hanya di memori).
 */
export async function deriveEncryptionKey(pin, salt, iterations = ENC_ITERATIONS) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto tidak tersedia. Buka aplikasi melalui HTTPS atau localhost.');
  }
  const keyMaterial = await importPinKeyMaterial(pin);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: base64ToBytes(salt),
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    ENC_ALG,
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Turunkan verifier (hash terpisah) dari PIN untuk validasi tanpa membuka kunci.
 * Verifier disimpan bersama profil pengguna.
 * @returns {Promise<string>} Base64 hash.
 */
async function deriveVerifier(pin, salt, iterations = ENC_ITERATIONS) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto tidak tersedia. Buka aplikasi melalui HTTPS atau localhost.');
  }
  const keyMaterial = await importPinKeyMaterial(pin);
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
  return arrayBufferToBase64(bits);
}

/**
 * Enkripsi plaintext (string) dengan AES-GCM.
 * @returns {Promise<{iv: string, ciphertext: string}>}
 */
async function encryptString(plaintext, key) {
  const encoder = new TextEncoder();
  const iv = randomBytes(12);
  const encoded = encoder.encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  );
  return {
    iv: arrayBufferToBase64(iv),
    ciphertext: arrayBufferToBase64(ciphertext),
  };
}

/**
 * Dekripsi ciphertext dengan AES-GCM.
 * @returns {Promise<string>}
 */
async function decryptString({ iv, ciphertext }, key) {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(iv) },
    key,
    base64ToArrayBuffer(ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}

/* -------------------------------------------------------------------------- */
/*  Enkripsi workspace                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Buat kredensial enkripsi dari PIN: salt acak, kunci AES-GCM, dan verifier.
 * Kunci dikembalikan untuk disimpan di memori; verifier untuk disimpan di disk.
 * @returns {Promise<{salt: string, iterations: number, verifier: string, key: CryptoKey}>}
 */
export async function createEncryptionCredentials(pin) {
  const salt = bytesToBase64(randomBytes(16));
  const key = await deriveEncryptionKey(pin, salt, ENC_ITERATIONS);
  const verifier = await deriveVerifier(pin, salt, ENC_ITERATIONS);
  return { salt, iterations: ENC_ITERATIONS, verifier, key };
}

/**
 * Enkripsi payload workspace sebelum ditulis ke IndexedDB.
 * @param {Object} data — data workspace (sudah deep-clone)
 * @param {CryptoKey} key — kunci AES-GCM dari memori
 * @returns {Promise<{encrypted: boolean, iv: string, ciphertext: string, salt: string, iterations: number}>}
 */
export async function encryptWorkspace(data, key) {
  const plaintext = JSON.stringify(data);
  const { iv, ciphertext } = await encryptString(plaintext, key);
  return {
    encrypted: true,
    iv,
    ciphertext,
    salt: '', // disimpan terpisah di user profile / meta
    iterations: ENC_ITERATIONS,
  };
}

/**
 * Dekripsi payload workspace setelah dibaca dari IndexedDB.
 * @param {Object} record — record dari IndexedDB (bentuk {encrypted, iv, ciphertext, ...} atau data mentah legacy)
 * @param {CryptoKey} key — kunci AES-GCM dari memori
 * @returns {Promise<Object>} Data workspace terdekripsi.
 */
export async function decryptWorkspace(record, key) {
  if (!record) return null;
  // Legacy: data tidak terenkripsi (plain JSON)
  if (!record || !record.encrypted) {
    return record.data || record;
  }
  if (!record.iv || !record.ciphertext) {
    throw new Error('Record terenkripsi tidak lengkap (iv/ciphertext hilang).');
  }
  const plaintext = await decryptString({ iv: record.iv, ciphertext: record.ciphertext }, key);
  return JSON.parse(plaintext);
}

/* -------------------------------------------------------------------------- */
/*  Enkripsi backup dengan passphrase                                         */
/* -------------------------------------------------------------------------- */

const BACKUP_ITERATIONS = 310_000;

/**
 * Turunkan kunci dari passphrase untuk enkripsi backup.
 */
async function deriveBackupKey(passphrase, salt, iterations = BACKUP_ITERATIONS) {
  const keyMaterial = await importPinKeyMaterial(passphrase);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: base64ToBytes(salt), iterations, hash: 'SHA-256' },
    keyMaterial,
    ENC_ALG,
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Enkripsi data backup dengan passphrase. Hasil: string base64 yang bisa
 * disimpan ke file `.risly.enc`.
 * @returns {Promise<string>} Base64: JSON {salt, iterations, iv, ciphertext}
 */
export async function encryptBackup(data, passphrase) {
  const salt = bytesToBase64(randomBytes(16));
  const key = await deriveBackupKey(passphrase, salt, BACKUP_ITERATIONS);
  const plaintext = JSON.stringify(data);
  const { iv, ciphertext } = await encryptString(plaintext, key);
  return arrayBufferToBase64(
    new TextEncoder().encode(
      JSON.stringify({ salt, iterations: BACKUP_ITERATIONS, iv, ciphertext }),
    ),
  );
}

/**
 * Dekripsi backup terenkripsi dengan passphrase.
 * @returns {Promise<Object>} Data backup.
 */
export async function decryptBackup(encryptedBase64, passphrase) {
  const json = new TextDecoder().decode(base64ToBytes(encryptedBase64));
  const parsed = JSON.parse(json);
  if (!parsed || !parsed.salt || !parsed.iv || !parsed.ciphertext) {
    throw new Error('Format backup terenkripsi tidak valid.');
  }
  const key = await deriveBackupKey(passphrase, parsed.salt, parsed.iterations);
  const plaintext = await decryptString({ iv: parsed.iv, ciphertext: parsed.ciphertext }, key);
  return JSON.parse(plaintext);
}

/* -------------------------------------------------------------------------- */
/*  Verifier (validasi PIN tanpa kunci)                                       */
/* -------------------------------------------------------------------------- */

/**
 * Verifikasi PIN terhadap verifier yang disimpan.
 * @returns {Promise<boolean>}
 */
export async function verifyPinAgainstVerifier(pin, verifier, salt, iterations = ENC_ITERATIONS) {
  if (!verifier || !salt) return false;
  const hash = await deriveVerifier(pin, salt, iterations);
  if (hash.length !== verifier.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i += 1) {
    diff |= hash.charCodeAt(i) ^ verifier.charCodeAt(i);
  }
  return diff === 0;
}

/* -------------------------------------------------------------------------- */
/*  Simpan/muat meta enkripsi di IndexedDB                                    */
/* -------------------------------------------------------------------------- */

import { repository } from './repository.js';

/**
 * Simpan parameter enkripsi (salt, iterasi) ke object store meta IndexedDB.
 * Kunci enkripsi sendiri TIDAK disimpan — hanya di memori.
 */
export async function saveEncryptionMeta(salt, iterations) {
  await repository.setMeta(ENC_SALT_KEY, salt);
  await repository.setMeta(ENC_ITER_KEY, String(iterations));
}

/**
 * Muat parameter enkripsi dari IndexedDB meta.
 * @returns {Promise<{salt: string | null, iterations: number | null}>}
 */
export async function loadEncryptionMeta() {
  const [salt, iterationsRaw] = await Promise.all([
    repository.getMeta(ENC_SALT_KEY),
    repository.getMeta(ENC_ITER_KEY),
  ]);
  return {
    salt: salt || null,
    iterations: iterationsRaw ? Number(iterationsRaw) : null,
  };
}

/**
 * Hapus meta enkripsi dari IndexedDB (saat reset / hapus PIN).
 */
export async function clearEncryptionMeta() {
  try {
    const store = await repository._store('meta', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(ENC_SALT_KEY);
      req.onsuccess = () => {
        const req2 = store.delete(ENC_ITER_KEY);
        req2.onsuccess = () => resolve();
        req2.onerror = () => reject(req2.error);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    /* noop */
  }
}
