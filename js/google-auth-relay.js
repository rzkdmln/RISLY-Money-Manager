/**
 * Google login relay for installed iOS PWAs.
 *
 * iOS runs an installed home-screen web app in a storage container that is
 * isolated from Safari. When Google sign-in is opened in a Safari sheet, the
 * result can never be handed back through cookies/localStorage. The sheet does
 * have network access, so the callback page writes a short-lived result to this
 * tiny relay and the PWA polls for it. The PWA never has to leave the app and
 * the result survives a PWA reload.
 */

import { APP, FIREBASE_CONFIG } from './config.js';
import { DRIVE_SCOPE } from './gdrive.js';
import { isIos } from './utils.js';

const RELAY_URL = `${String(FIREBASE_CONFIG.databaseURL).replace(/\/+$/, '')}/oauth_relay.json`;
const RELAY_HEADERS = {
  'Content-Type': 'application/json',
};
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const PENDING_KEY = 'risly.mm.oauth.pending.v1';
const CALLBACK_FILE = 'oauth-callback.html';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

const ACTIVE_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_PENDING_AGE_MS = 15 * 60 * 1000;
const POLL_INTERVALS_MS = [2000, 2500, 3000, 3500, 4000, 5000];

export function shouldUseAuthRelay() {
  // Every iOS browser is WebKit, and the installed PWA is the strictest case.
  // Using the relay everywhere on iOS avoids depending on standalone detection
  // (which is not always reliable) and keeps one code path for all iPhones.
  return isIos();
}

export function currentGoogleRedirectUri() {
  const directory = location.pathname.endsWith('/')
    ? location.pathname
    : location.pathname.replace(/[^/]*$/, '');
  return `${location.origin}${directory}${CALLBACK_FILE}`;
}

function randomState() {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function buildAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: APP.googleClientId,
    redirect_uri: currentGoogleRedirectUri(),
    response_type: 'token',
    scope: DRIVE_SCOPE,
    state,
    include_granted_scopes: 'true',
    prompt: 'select_account',
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export function readPendingGoogleLogin() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed?.state || !parsed?.createdAt) return null;
    if (Date.now() - parsed.createdAt > MAX_PENDING_AGE_MS) {
      clearPendingGoogleLogin();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingGoogleLogin() {
  try { localStorage.removeItem(PENDING_KEY); } catch { /* storage unavailable */ }
}

function abortError() {
  const error = new Error('Masuk dengan Google dibatalkan.');
  error.name = 'AbortError';
  return error;
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      fn(value);
    };
    const onAbort = () => finish(reject, abortError());
    const timer = setTimeout(() => finish(resolve), ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function readRelay() {
  const response = await fetch(RELAY_URL, {
    headers: RELAY_HEADERS,
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Relay login tidak tersedia (${response.status}).`);
  const payload = await response.json();
  const record = payload?.record ?? payload;
  return record && typeof record === 'object' ? record : {};
}

async function writeRelay(sessions) {
  const response = await fetch(RELAY_URL, {
    method: 'PUT',
    headers: RELAY_HEADERS,
    cache: 'no-store',
    body: JSON.stringify({ sessions }),
  });
  if (!response.ok) throw new Error(`Relay login tidak tersedia (${response.status}).`);
}

function pruneSessions(sessions) {
  const now = Date.now();
  const next = {};
  Object.entries(sessions || {}).forEach(([state, entry]) => {
    if (!entry?.createdAt) return;
    if (now - entry.createdAt > MAX_PENDING_AGE_MS) return;
    next[state] = entry;
  });
  return next;
}

async function readRelaySession(state) {
  const record = await readRelay();
  const entry = record.sessions?.[state];
  if (!entry) return null;
  if (!entry.createdAt || Date.now() - entry.createdAt > MAX_PENDING_AGE_MS) return null;
  return entry;
}

async function deleteRelaySession(state) {
  try {
    const record = await readRelay();
    const sessions = pruneSessions(record.sessions);
    if (!sessions[state]) return;
    delete sessions[state];
    await writeRelay(sessions);
  } catch (error) {
    console.warn('Gagal membersihkan relay login:', error);
  }
}

async function writeRelaySession(state, payload) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const record = await readRelay();
      const sessions = pruneSessions(record.sessions);
      sessions[state] = payload;
      await writeRelay(sessions);
      return;
    } catch (error) {
      lastError = error;
      await wait(700 * (attempt + 1));
    }
  }
  throw new Error(lastError?.message || 'Gagal mengirim hasil login Google.');
}

async function pollForSession(state, { signal = null, deadline = Date.now() + ACTIVE_TIMEOUT_MS } = {}) {
  let attempt = 0;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw abortError();
    let entry = null;
    try {
      entry = await readRelaySession(state);
    } catch (error) {
      // A flaky relay request must not cancel the whole login; try again.
      console.warn('Cek relay login gagal:', error);
    }
    if (entry) {
      // Cleanup is best-effort and must not delay the login.
      deleteRelaySession(state);
      clearPendingGoogleLogin();
      if (entry.error) throw new Error(entry.error);
      if (!entry.account?.email || !entry.accessToken) {
        throw new Error('Hasil login Google tidak lengkap. Silakan coba lagi.');
      }
      return entry;
    }
    const interval = POLL_INTERVALS_MS[Math.min(attempt, POLL_INTERVALS_MS.length - 1)];
    attempt += 1;
    await wait(interval, signal);
  }
  clearPendingGoogleLogin();
  throw new Error('Waktu masuk dengan Google habis. Silakan coba lagi.');
}

/**
 * Opens Google in an in-app sheet and resolves once the callback page has
 * written the result to the relay. Must be called from a click so iOS allows
 * the new window.
 */
export function startGoogleRelayLogin({ signal = null } = {}) {
  const state = randomState();
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ state, createdAt: Date.now() }));
  } catch {
    return Promise.reject(new Error('Penyimpanan perangkat tidak tersedia.'));
  }

  const url = buildAuthUrl(state);
  let popup = null;
  try {
    popup = window.open('about:blank', '_blank');
  } catch {
    popup = null;
  }
  if (popup) {
    try {
      popup.location.href = url;
      popup.focus?.();
    } catch {
      location.assign(url);
    }
  } else {
    location.assign(url);
  }

  return pollForSession(state, { signal });
}

/**
 * Called on boot. Returns a promise when a login was started but the PWA was
 * reloaded/suspended before the result arrived.
 */
export function resumeGoogleRelayLogin({ signal = null } = {}) {
  const pending = readPendingGoogleLogin();
  if (!pending) return null;
  const deadline = pending.createdAt + MAX_PENDING_AGE_MS;
  if (Date.now() >= deadline) {
    clearPendingGoogleLogin();
    return null;
  }
  return pollForSession(pending.state, { signal, deadline });
}

/** Used by oauth-callback.html (runs in the Safari sheet). */
export async function completeGoogleRelayFromFragment() {
  const raw = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
  const params = new URLSearchParams(raw);
  const state = params.get('state');
  if (!state) throw new Error('Parameter login Google tidak ditemukan.');

  const createdAt = Date.now();
  const oauthError = params.get('error');
  if (oauthError) {
    const message = oauthError === 'access_denied'
      ? 'Akses Google dibatalkan.'
      : (params.get('error_description') || oauthError);
    await writeRelaySession(state, { error: message, createdAt });
    return { error: message };
  }

  const accessToken = params.get('access_token');
  if (!accessToken) throw new Error('Google tidak mengirim token masuk.');
  const expiresIn = Number(params.get('expires_in')) || 3600;

  const response = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Gagal mengambil info pengguna Google (${response.status}).`);
  }
  const profile = await response.json();
  if (!profile?.email) throw new Error('Email akun Google tidak tersedia.');

  const account = {
    email: profile.email,
    name: profile.name,
    picture: profile.picture,
    clientId: APP.googleClientId,
  };
  await writeRelaySession(state, {
    account,
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
    createdAt,
  });

  try { history.replaceState(null, '', location.pathname); } catch { /* noop */ }
  return { account };
}
