import { APP } from '../core/config.js';
import { getLockRemaining } from '../core/auth.js';
import { googleGlyph } from '../services/gdrive.js';
import { icon } from '../ui/icons.js';
import { store } from '../core/store.js';
import { ui } from '../ui/ui.js';
import { escapeAttr, escapeHTML } from '../core/utils.js';

function lastAccount() {
  try {
    const raw = localStorage.getItem(APP.lastAccountKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.workspaceId ? parsed : null;
  } catch {
    return null;
  }
}

function brandBlock() {
  return `<div class="auth-brand">
    <img src="icons/icon-192.png" alt="RISLY Logo" class="w-12 h-12 rounded-2xl shadow-sm object-cover">
    <div>
      <p class="brand-name">${APP.name}</p>
      <p class="brand-caption">${APP.fullName}</p>
    </div>
  </div>`;
}

function googleButton(label, action = 'google-login', ghost = false) {
  return `<button type="button" class="auth-google ${ghost ? 'is-ghost' : ''}" data-action="${action}">
    ${googleGlyph('w-4.5 h-4.5')}
    <span>${escapeHTML(label)}</span>
  </button>`;
}

function welcomeView() {
  const last = lastAccount();
  return `<div class="auth-screen">
    <div class="auth-orb auth-orb-one"></div>
    <div class="auth-orb auth-orb-two"></div>
    <div class="auth-orb auth-orb-three"></div>
    <main class="auth-shell">
      ${brandBlock()}

      <section class="auth-card">
        <div class="auth-heading">
          <span class="auth-kicker">Selamat datang</span>
          <h1>Masuk ke ${APP.name}</h1>
          <p>Kelola keuangan pribadi atau keluarga dalam satu tempat.</p>
        </div>

        ${googleButton('Masuk dengan Google')}
        <div class="auth-divider"><span>atau</span></div>

        <div class="auth-stack">
          <button type="button" class="auth-google is-ghost" data-action="google-join">
            ${icon('users', 'w-4 h-4')}
            <span>Punya kode undangan?</span>
          </button>
          ${last ? `<button type="button" class="auth-google is-ghost" data-action="offline-open">
            ${icon('device', 'w-4 h-4')}
            <span>Buka data terakhir${last.name ? ` · ${escapeHTML(last.name)}` : ''}</span>
          </button>` : ''}
        </div>

      </section>

      <footer class="auth-footer">
        <span>${APP.name} v${APP.version}</span>
        <span class="auth-private"><a href="./privacy.html" style="color:inherit;text-decoration:underline;">Kebijakan Privasi</a></span>
      </footer>
    </main>
  </div>`;
}

function lockView(user) {
  const lockRemaining = getLockRemaining(user.id);
  const locked = lockRemaining > 0;
  return `<div class="auth-screen">
    <div class="auth-orb auth-orb-one"></div>
    <div class="auth-orb auth-orb-two"></div>
    <div class="auth-orb auth-orb-three"></div>
    <main class="auth-shell">
      ${brandBlock()}

      <section class="auth-card">
        <div class="auth-heading">
          <span class="auth-kicker">Sesi terkunci</span>
          <h1>Masuk sebagai ${escapeHTML(user.name)}</h1>
          <p>Masukkan PIN untuk melanjutkan.</p>
        </div>

        <form id="login-form" data-form="login" class="auth-form" novalidate>
          <input type="hidden" name="user" value="${escapeAttr(user.id)}">
          <label class="field-label" for="pin-input">PIN</label>
          <div class="pin-input-wrap ${locked ? 'is-locked' : ''}">
            <input id="pin-input" class="pin-input" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="current-password" aria-label="PIN" ${locked ? 'disabled' : 'autofocus'} placeholder="••••">
            <button type="button" class="pin-eye" data-action="toggle-pin" aria-label="Tampilkan PIN">${icon('eye', 'w-4.5 h-4.5')}</button>
          </div>
          <p id="auth-error" class="auth-error ${locked ? '' : 'hidden'}" data-form-error role="alert">${locked ? `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(lockRemaining / 1000)} detik.` : ''}</p>

          <button type="submit" class="btn btn-primary auth-submit" ${locked ? 'disabled' : ''}>
            ${locked ? 'Terkunci sementara' : 'Buka aplikasi'}
            ${locked ? icon('lock', 'w-4 h-4') : icon('arrow-right', 'w-4 h-4')}
          </button>
        </form>

        <div class="auth-links">
          <button type="button" data-action="forgot-pin">Lupa PIN?</button>
          <button type="button" data-action="switch-account">Ganti akun</button>
        </div>
      </section>

      <footer class="auth-footer">
        <span>${APP.name} v${APP.version}</span>
        <span class="auth-private"><a href="./privacy.html" style="color:inherit;text-decoration:underline;">Kebijakan Privasi</a></span>
      </footer>
    </main>
  </div>`;
}

export function loginView() {
  if (ui.locked && store.currentUserId) {
    const user = store.getUser(store.currentUserId);
    if (user?.pinHash || user?.pinVerifier) return lockView(user);
    // User sudah login tapi belum punya PIN → tampilkan setup PIN.
    return setupPinView(user);
  }
  return welcomeView();
}

/**
 * Tampilkan layar setup PIN pertama kali dengan kalimat pemulihan.
 * Pengguna harus menyimpan kalimat pemulihan — tanpa PIN, data tidak bisa dibuka.
 */
export function setupPinView(user) {
  return `<div class="auth-screen">
    <div class="auth-orb auth-orb-one"></div>
    <div class="auth-orb auth-orb-two"></div>
    <div class="auth-orb auth-orb-three"></div>
    <main class="auth-shell">
      ${brandBlock()}

      <section class="auth-card">
        <div class="auth-heading">
          <span class="auth-kicker">Atur PIN Aplikasi</span>
          <h1>Buat PIN untuk ${escapeHTML(user?.name || 'Anda')}</h1>
          <p>PIN melindungi data Anda dengan enkripsi. Tanpa PIN yang benar, data lokal tidak bisa dibuka.</p>
        </div>

        <div class="auth-alert warning">
          ${icon('alert-triangle', 'w-4 h-4')}
          <strong>Penting:</strong> Jika lupa PIN, semua data akan hilang permanen. Simpan cadangan terenkripsi di bawah.
        </div>

        <form id="setup-pin-form" data-form="setup-pin" class="auth-form" novalidate>
          <input type="hidden" name="user" value="${escapeAttr(user?.id || '')}">
          <label class="field-label" for="setup-pin-input">PIN (6–8 angka)</label>
          <input id="setup-pin-input" name="pin" type="password" inputmode="numeric" pattern="[0-9]{6,8}" maxlength="8" autocomplete="new-password" autofocus placeholder="••••••">
          <label class="field-label mt-3" for="setup-confirm-input">Ulangi PIN</label>
          <input id="setup-confirm-input" name="confirmPin" type="password" inputmode="numeric" pattern="[0-9]{6,8}" maxlength="8" autocomplete="new-password" placeholder="••••••">
          <p id="setup-pin-error" class="auth-error hidden" data-form-error role="alert"></p>
          <button type="submit" class="btn btn-primary auth-submit" id="setup-pin-submit">
            Buat PIN ${icon('arrow-right', 'w-4 h-4')}
          </button>
        </form>

        <div class="auth-links mt-4">
          <button type="button" data-action="skip-pin">Lewat untuk sekarang (data tidak terenkripsi)</button>
        </div>
      </section>

      <footer class="auth-footer">
        <span>${APP.name} v${APP.version}</span>
      </footer>
    </main>
  </div>`;
}

export function setupView() {
  return loginView();
}

