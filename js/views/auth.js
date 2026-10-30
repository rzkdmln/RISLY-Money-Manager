import { APP } from '../config.js';
import { getLockRemaining, usersNeedingSetup } from '../auth.js';
import { Cloud } from '../cloud.js';
import { icon } from '../icons.js';
import { store } from '../store.js';
import { avatar, ui } from '../ui.js';
import { escapeAttr, escapeHTML, isIos, isStandalone } from '../utils.js';

function storeUsers() {
  return store.activeUsers();
}

function cloudLine() {
  const status = Cloud.getStatus();
  if (status.provider === 'local') {
    return `<button type="button" class="auth-cloud-link" data-action="auth-cloud">
      ${icon('cloud', 'w-3.5 h-3.5')} Hubungkan data cloud
    </button>`;
  }
  const tone = status.state === 'error' ? 'text-red-500' : status.state === 'offline' ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400';
  return `<button type="button" class="auth-cloud-link ${tone}" data-action="sync-now">
    ${icon('cloud', 'w-3.5 h-3.5')} ${escapeHTML(status.providerLabel)} · ${escapeHTML(status.state === 'synced' ? 'tersinkron' : status.state === 'error' ? 'gagal' : status.state)}
  </button>`;
}

export function loginView() {
  const users = storeUsers();
  const available = users.filter((user) => user.pinHash);
  const selected = available.find((user) => user.id === ui.selectedUser) || available[0];
  ui.selectedUser = selected?.id || null;
  const lockRemaining = selected ? getLockRemaining(selected.id) : 0;
  const locked = lockRemaining > 0;
  const expired = ui.locked;
  const installTip = isIos() && !isStandalone()
    ? `<p class="auth-install-tip">${icon('info', 'w-3.5 h-3.5')} Untuk pengalaman layar penuh, buka di Safari lalu pilih <strong>Bagikan → Tambahkan ke Layar Utama</strong>.</p>`
    : '';

  if (!available.length) {
    return setupView(users);
  }

  return `<div class="auth-screen">
    <div class="auth-orb auth-orb-one"></div>
    <div class="auth-orb auth-orb-two"></div>
    <div class="auth-orb auth-orb-three"></div>
    <main class="auth-shell">
      <div class="auth-brand">
        <img src="icons/icon-192.png" alt="RISLY Logo" class="w-12 h-12 rounded-2xl shadow-sm object-cover">
        <div>
          <p class="brand-name">${APP.name}</p>
          <p class="brand-caption">${APP.fullName}</p>
        </div>
      </div>

      <section class="auth-card">
        <div class="auth-heading">
          <span class="auth-kicker">${expired ? 'Sesi terkunci' : 'Selamat datang kembali'}</span>
          <h1>${expired ? 'Aplikasi dikunci' : 'Masuk ke ruang keuangan kalian'}</h1>
          <p>${expired ? 'Masukkan PIN untuk melanjutkan.' : 'Pilih anggota keluarga, lalu masukkan PIN pribadi.'}</p>
        </div>

        <div class="auth-users" role="tablist" aria-label="Pilih pengguna">
          ${available.map((user) => `<button type="button" role="tab" aria-selected="${user.id === selected.id}" class="auth-user ${user.id === selected.id ? 'is-selected' : ''}" data-action="select-user" data-user="${escapeAttr(user.id)}">
            ${avatar(user, 'md')}
            <span>${escapeHTML(user.name)}</span>
          </button>`).join('')}
        </div>

        <form id="login-form" data-form="login" class="auth-form" novalidate>
          <input type="hidden" name="user" value="${escapeAttr(selected.id)}">
          <label class="field-label" for="pin-input">PIN ${escapeHTML(selected.name)}</label>
          <div class="pin-input-wrap ${locked ? 'is-locked' : ''}">
            <input id="pin-input" class="pin-input" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="current-password" aria-label="PIN ${escapeAttr(selected.name)}" ${locked ? 'disabled' : 'autofocus'} placeholder="••••">
            <button type="button" class="pin-eye" data-action="toggle-pin" aria-label="Tampilkan PIN">${icon('eye', 'w-4.5 h-4.5')}</button>
          </div>
          <p id="auth-error" class="auth-error ${locked ? '' : 'hidden'}" data-form-error role="alert">${locked ? `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(lockRemaining / 1000)} detik.` : ''}</p>

          <div class="pin-keypad" aria-label="Papan angka PIN">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => `<button type="button" data-pin-key="${number}">${number}</button>`).join('')}
            <button type="button" class="pin-key-muted" data-pin-key="clear" aria-label="Hapus semua">C</button>
            <button type="button" data-pin-key="0">0</button>
            <button type="button" class="pin-key-muted" data-pin-key="back" aria-label="Hapus satu angka">${icon('delete', 'w-5 h-5')}</button>
          </div>

          <button type="submit" class="btn btn-primary auth-submit" ${locked ? 'disabled' : ''}>
            ${locked ? 'Terkunci sementara' : `Masuk sebagai ${escapeHTML(selected.name)}`}
            ${locked ? icon('lock', 'w-4 h-4') : icon('arrow-right', 'w-4 h-4')}
          </button>
        </form>

        <div class="auth-links">
          <button type="button" data-action="forgot-pin">Lupa PIN?</button>
          ${cloudLine()}
        </div>
        ${installTip}
      </section>

      <footer class="auth-footer">
        <span>${APP.name} v${APP.version}</span>
        <span class="auth-private">${icon('shield', 'w-3 h-3')} Data pribadi Rizki & Shelly</span>
      </footer>
    </main>
  </div>`;
}

export function setupView(users = storeUsers()) {
  const missing = usersNeedingSetup(users.length ? users : storeUsers());
  const targetUsers = missing.length ? missing : users;
  const cards = targetUsers.map((user) => `<div class="setup-user-card">
    <div class="flex items-center gap-3">
      ${avatar(user, 'md')}
      <div>
        <p class="font-semibold text-slate-900 dark:text-white">${escapeHTML(user.name)}</p>
        <p class="text-xs text-slate-500 dark:text-slate-400">Buat PIN pribadi 4–8 angka</p>
      </div>
    </div>
    <div class="grid sm:grid-cols-2 gap-3 mt-4">
      <label class="field-label">PIN
        <input class="field mt-1.5" type="password" name="pin_${escapeAttr(user.id)}" inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" placeholder="••••" autocomplete="new-password" required>
      </label>
      <label class="field-label">Ulangi PIN
        <input class="field mt-1.5" type="password" name="confirm_${escapeAttr(user.id)}" inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" placeholder="••••" autocomplete="new-password" required>
      </label>
    </div>
  </div>`).join('');

  return `<div class="auth-screen">
    <div class="auth-orb auth-orb-one"></div>
    <div class="auth-orb auth-orb-two"></div>
    <div class="auth-orb auth-orb-three"></div>
    <main class="auth-shell auth-shell-setup">
      <div class="auth-brand">
        <img src="icons/icon-192.png" alt="RISLY Logo" class="w-12 h-12 rounded-2xl shadow-sm object-cover">
        <div>
          <p class="brand-name">${APP.name}</p>
          <p class="brand-caption">${APP.fullName}</p>
        </div>
      </div>
      <section class="auth-card setup-card">
        <div class="auth-heading">
          <span class="auth-kicker">Persiapan pertama</span>
          <h1>Siapkan ruang keuangan kalian</h1>
          <p>Buat PIN untuk setiap anggota. PIN dipakai untuk membuka aplikasi di perangkat ini maupun perangkat yang tersinkron.</p>
        </div>

        <form id="setup-form" data-form="setup" class="space-y-4" novalidate>
          <label class="field-label">Nama keluarga
            <input class="field mt-1.5" name="householdName" maxlength="60" value="${escapeAttr('Rizki & Shelly')}" required>
          </label>
          ${cards}
          <p class="form-error hidden" data-form-error role="alert"></p>
          <label class="setup-check">
            <input type="checkbox" name="acknowledge" required>
            <span>Saya memahami PIN ini adalah kunci tampilan aplikasi, bukan enkripsi data cloud. Saya akan memakai kode perangkat dan penyimpanan cloud yang aman.</span>
          </label>
          <button type="submit" class="btn btn-primary w-full">
            ${icon('shield', 'w-4 h-4')} Aktifkan ${APP.name}
          </button>
        </form>

        <div class="auth-links">
          ${cloudLine()}
          <button type="button" data-action="forgot-pin">Panduan keamanan</button>
        </div>
      </section>
      <footer class="auth-footer">
        <span>${APP.name} v${APP.version}</span>
        <span class="auth-private">${icon('lock', 'w-3 h-3')} PIN disimpan sebagai hash PBKDF2</span>
      </footer>
    </main>
  </div>`;
}
