/**
 * RISLY Money Manager — Google Drive integration.
 *
 * Everything runs in the browser:
 *  - Google Identity Services (GIS) token flow for OAuth.
 *  - Google Drive REST v3, backups live in the hidden `appDataFolder`.
 *
 * Google is used for sign-in and manual backup/restore only; there is no
 * background sync. Access tokens last about an hour and are refreshed silently
 * whenever Google still has an active session.
 */

import { escapeAttr, escapeHTML } from './utils.js';
import { icon } from './icons.js';
import { APP } from './config.js';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const ACCOUNT_KEY = 'risly.mm.google.v1';
const APP_DATA_FOLDER = 'appDataFolder';

export const DRIVE_SCOPE = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.appdata',
].join(' ');

/** Error raised when Google needs the user to sign in again. */
export class DriveAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DriveAuthError';
    this.code = 'auth';
  }
}

function readAccount() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

let gisLoader = null;

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  if (gisLoader) return gisLoader;
  gisLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.oauth2) resolve(window.google);
      else reject(new Error('Google Sign-In tidak tersedia di browser ini.'));
    };
    script.onerror = () => {
      gisLoader = null;
      reject(new Error('Gagal memuat Google Sign-In. Periksa koneksi internet.'));
    };
    document.head.appendChild(script);
  });
  return gisLoader;
}

/** Turn raw Drive REST failures into messages the user can act on. */
function driveErrorMessage(status, detail) {
  const text = String(detail || '');
  if (/has not been used in project|accessNotConfigured|SERVICE_DISABLED|API has not been used/i.test(text)) {
    const project = text.match(/project\s+(\d+)/i)?.[1];
    return `Google Drive API belum diaktifkan${project ? ` di project ${project}` : ''}. Buka Google Cloud Console → APIs & Services → Library → Google Drive API → Enable, tunggu ±2 menit, lalu coba lagi.`;
  }
  if (/insufficientPermissions|insufficient authentication scopes/i.test(text)) {
    return 'Izin Google Drive kurang. Keluar dari Google lalu masuk lagi agar izin Drive bisa diberikan.';
  }
  if (/rateLimitExceeded|userRateLimitExceeded/i.test(text)) {
    return 'Terlalu banyak permintaan ke Google Drive. Coba lagi beberapa saat.';
  }
  if (/storageQuotaExceeded/i.test(text)) {
    return 'Penyimpanan Google Drive penuh. Kosongkan sebagian ruang lalu coba lagi.';
  }
  return `Google Drive ${status}${text ? ` — ${text}` : ''}`;
}

function authErrorMessage(response) {
  // Jika response/error berupa Error object atau string langsung
  if (response instanceof Error) return response.message;
  if (typeof response === 'string') return response.trim();

  // Ekstrak properti error jika berbentuk object
  const errorValue = response?.error || response?.message || response?.error_description || '';
  const code = typeof errorValue === 'string' ? errorValue.trim() : String(errorValue || '').trim();

  if (code === 'access_denied') {
    return 'Google menolak akses (403). Tambahkan akun ini sebagai Test user di OAuth consent screen, atau klik Publish app di Google Cloud Console.';
  }
  if (code === 'popup_closed' || code === 'popup_closed_by_user') return 'Jendela Google ditutup sebelum selesai.';
  if (code === 'interaction_required') return 'Google meminta konfirmasi ulang. Klik "Masuk dengan Google" lagi.';
  if (code === 'invalid_client') return 'Client ID Google tidak dikenali. Periksa kembali nilainya.';

  return typeof response?.error_description === 'string'
    ? response.error_description
    : (code || 'Masuk dengan Google gagal.');
}

// js/gdrive.js

class GoogleDriveClient {
  constructor() {
    this.account = readAccount();
    // 1. Paksa konversi ke String saat pembacaan awal
    const rawId = this.account?.clientId || APP.googleClientId || '';
    this.clientId = typeof rawId === 'string' ? rawId.trim() : String(rawId || '').trim();
    this.accessToken = '';
    this.expiresAt = 0;
    this.listeners = new Set();
  }

  getAccount() {
    return this.account ? { ...this.account } : null;
  }

  getClientId() {
    return this.clientId;
  }

  isConnected() {
    return Boolean(this.account?.email);
  }

  onAccountChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    const account = this.getAccount();
    this.listeners.forEach((listener) => {
      try {
        listener(account);
      } catch (error) {
        console.error('Google account listener error:', error);
      }
    });
  }

  setClientId(clientId) {
    // 2. Paksa parameter clientId menjadi String sebelum dieksekusi .trim()
    const next = typeof clientId === 'string' ? clientId.trim() : String(clientId || '').trim();
    if (next === this.clientId) return;
    this.clientId = next;
    this.accessToken = '';
    this.expiresAt = 0;
    if (this.account && this.account.clientId !== next) {
      this.account = null;
      localStorage.removeItem(ACCOUNT_KEY);
      this.emit();
    }
  }

  async requestToken(prompt = 'select_account') {
      const validPrompt = typeof prompt === 'string' ? prompt : 'select_account';
      const validClientId = typeof this.clientId === 'string' ? this.clientId.trim() : String(this.clientId || '').trim();
      if (!validClientId) {
        throw new DriveAuthError('Client ID Google belum diisi atau tidak valid.');
      }

      const google = await loadGis();
      return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (fn, value) => {
          if (settled) return;
          settled = true;
          fn(value);
        };

        const client = google.accounts.oauth2.initTokenClient({
          client_id: validClientId,
          scope: DRIVE_SCOPE,
          callback: (response) => {
            if (response?.error) {
              finish(reject, new DriveAuthError(authErrorMessage(response)));
              return;
            }
            this.accessToken = response.access_token;
            this.expiresAt = Date.now() + (Number(response.expires_in) || 3600) * 1000;

            localStorage.setItem('risly_access_token', response.access_token);
            localStorage.setItem('risly_token_expires_at', String(this.expiresAt));

            finish(resolve, response);
          },
          error_callback: (error) => {
            // Tangkap error object agar tidak crash pada .trim()
            const msg = error?.message || (typeof error === 'string' ? error : 'Gagal membuka Google Sign-In.');
            finish(reject, new DriveAuthError(msg));
          },
        });

        try {
          client.requestAccessToken({ prompt: validPrompt });
        } catch (error) {
          finish(reject, new DriveAuthError(error?.message || 'Google Sign-In gagal dibuka.'));
        }
      });
    }

  /**
   * Signs in with Google and returns account information.
   * This gets an OAuth2 token and then uses it to fetch user info.
   */
  async signIn(prompt = 'select_account') {
    const validPrompt = typeof prompt === 'string' ? prompt : 'select_account';
    // 1. Get OAuth2 token
    const tokenResponse = await this.requestToken(validPrompt);

    // 2. Get user info using the access token
    try {
      const userInfoResponse = await fetch(`${USERINFO_URL}`, {
        headers: {
          'Authorization': `Bearer ${tokenResponse.access_token}`
        }
      });

      if (!userInfoResponse.ok) {
        throw new DriveAuthError(`Gagal mengambil info pengguna: ${userInfoResponse.status}`);
      }

      const userInfo = await userInfoResponse.json();

      // 3. Create account object with required fields
      const account = {
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
        clientId: this.clientId,
      };

      // 4. Save account to localStorage
      this.account = account;
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
      this.emit(); // Notify listeners

      return account;
    } catch (error) {
      // Jangan menyimpan akun palsu; lemparkan error agar pengguna tahu
      throw error instanceof DriveAuthError ? error : new DriveAuthError(error?.message || 'Gagal mengambil info pengguna Google.');
    }
  }

  /**
   * Returns a usable access token
   */

  async token() {
    if (!this.account?.email) {
      throw new DriveAuthError('Masuk dengan Google dulu untuk mengakses Drive.');
    }

    // Ambil token tersimpan dari LocalStorage jika memori JS ter-reset saat PWA minimised
    if (!this.accessToken) {
      this.accessToken = localStorage.getItem('risly_access_token') || '';
      this.expiresAt = Number(localStorage.getItem('risly_token_expires_at')) || 0;
    }

    if (this.accessToken && this.expiresAt - 60_000 > Date.now()) return this.accessToken;

    // Jika token kadaluwarsa di iOS PWA, kosongkan token dan minta pengguna menekan tombol login Google lagi
    this.accessToken = '';
    this.expiresAt = 0;
    localStorage.removeItem('risly_access_token');
    localStorage.removeItem('risly_token_expires_at');
    throw new DriveAuthError('Sesi Google berakhir. Klik "Masuk dengan Google" untuk melanjutkan.');
  }

  async signOut() {
    const token = this.accessToken;
    this.accessToken = '';
    this.expiresAt = 0;
    this.account = null;
    localStorage.removeItem(ACCOUNT_KEY);
    this.emit();
    if (token) {
      try {
        await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST' });
      } catch {
        /* revocation is best effort */
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /*  Drive REST v3                                                          */
  /* ---------------------------------------------------------------------- */

  async request(url, { method = 'GET', token, body, headers = {} } = {}) {
    const response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...headers },
      body,
      cache: 'no-store',
    });
    if (response.status === 401) {
      this.accessToken = '';
      this.expiresAt = 0;
      throw new DriveAuthError('Sesi Google berakhir. Masuk dengan Google lagi.');
    }
    if (!response.ok) {
      let detail = '';
      try {
        const parsed = await response.json();
        detail = parsed?.error?.message || '';
      } catch {
        /* response was not JSON */
      }
      throw new Error(driveErrorMessage(response.status, detail));
    }
    return response;
  }

  /** List files inside the hidden app data folder. */
  async listFiles(token, { pageSize = 1000 } = {}) {
    const params = new URLSearchParams({
      spaces: APP_DATA_FOLDER,
      pageSize: String(pageSize),
      fields: 'files(id,name,size,createdTime,modifiedTime)',
    });
    const response = await this.request(`${DRIVE_API}/files?${params}`, { token });
    const body = await response.json();
    const files = Array.isArray(body?.files) ? body.files : [];
    return files.sort((a, b) => new Date(b.createdTime || 0) - new Date(a.createdTime || 0));
  }

  async findFile(token, name) {
    const escaped = String(name).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const params = new URLSearchParams({
      spaces: APP_DATA_FOLDER,
      q: `name = '${escaped}' and trashed = false`,
      fields: 'files(id,name,size,createdTime,modifiedTime)',
      pageSize: '10',
    });
    const response = await this.request(`${DRIVE_API}/files?${params}`, { token });
    const body = await response.json();
    return body?.files?.[0] || null;
  }

  async createFile(token, { name, content, mimeType = 'application/json' }) {
    const boundary = `risly_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const metadata = {
      name,
      mimeType,
      parents: [APP_DATA_FOLDER],
    };
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      `Content-Type: ${mimeType}`,
      '',
      content,
      `--${boundary}--`,
      '',
    ].join('\r\n');
    const response = await this.request(
      `${UPLOAD_API}/files?uploadType=multipart&fields=id,name,size,createdTime,modifiedTime`,
      {
        method: 'POST',
        token,
        body,
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      },
    );
    return response.json();
  }

  async updateFile(token, fileId, content, { mimeType = 'application/json' } = {}) {
    const response = await this.request(
      `${UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,size,modifiedTime`,
      {
        method: 'PATCH',
        token,
        body: content,
        headers: { 'Content-Type': mimeType },
      },
    );
    return response.json();
  }

  /** Create the file when missing, otherwise overwrite its content. */
  async saveFile(token, name, content) {
    const existing = await this.findFile(token, name);
    if (existing) return this.updateFile(token, existing.id, content);
    return this.createFile(token, { name, content });
  }

  async downloadFile(token, fileId) {
    const response = await this.request(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`,
      { token },
    );
    return response.text();
  }

  async deleteFile(token, fileId) {
    await this.request(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      token,
    });
  }
}

export const GoogleDrive = new GoogleDriveClient();

/** Official multicolour Google "G" mark for sign-in buttons. */
export function googleGlyph(className = 'w-4 h-4') {
  return `<svg class="${className}" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>`;
}

/** Small account chip shared by the auth and settings screens. */
export function googleAccountBadge(account) {
  if (!account?.email) {
    return `<span class="gdrive-account is-empty">${icon('cloud-off', 'w-4 h-4')}<span class="min-w-0"><strong>Belum tersambung</strong><small>Masuk untuk mengaktifkan Drive</small></span></span>`;
  }
  const avatar = account.picture
    ? `<img class="gdrive-avatar" src="${escapeAttr(account.picture)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="gdrive-avatar is-fallback">${icon('user', 'w-4 h-4')}</span>`;
  return `<span class="gdrive-account">${avatar}<span class="min-w-0"><strong>${escapeHTML(account.email)}</strong><small>${escapeHTML(account.name || 'Terhubung')}</small></span>${icon('check-circle', 'w-4 h-4 text-emerald-500 shrink-0')}</span>`;
}
