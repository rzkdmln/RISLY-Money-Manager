import { ACCOUNT_TYPES, DEFAULT_CATEGORY_COLORS, ICON_CHOICES } from '../config.js';
import { icon } from '../icons.js';
import { store } from '../store.js';
import { money } from '../ui.js';
import { escapeAttr, escapeHTML } from '../utils.js';

function colorPicker(selected, inputName = 'color') {
  const colors = [...new Set([selected, ...DEFAULT_CATEGORY_COLORS].filter(Boolean))];
  return `<div class="color-picker" role="group" aria-label="Pilih warna">
    <input type="hidden" name="${escapeAttr(inputName)}" value="${escapeAttr(selected)}">
    ${colors.map((color) => `<button type="button" class="color-dot ${color === selected ? 'is-active' : ''}" style="--pick-color:${escapeAttr(color)}" data-action="pick-color" data-color="${escapeAttr(color)}" aria-label="Warna ${escapeAttr(color)}"></button>`).join('')}
  </div>`;
}

export function accountForm(account = null) {
  const editing = Boolean(account?.id);
  const type = account?.type || 'cash';
  const color = account?.color || ACCOUNT_TYPES[type]?.color || '#3B82F6';
  const balance = editing ? store.accountBalance(account.id) : 0;
  return `<form data-form="account" data-id="${escapeAttr(account?.id || '')}" class="modal-form" novalidate>
    <header class="modal-header">
      <div>
        <p class="modal-kicker">${editing ? 'Perbarui akun' : 'Sumber dana'}</p>
        <h2 class="modal-title">${editing ? 'Ubah akun' : 'Akun baru'}</h2>
      </div>
      <button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
    </header>
    <div class="modal-body">
      <label class="field-label">Nama akun
        <input class="field mt-1.5" name="name" maxlength="60" value="${escapeAttr(account?.name || '')}" placeholder="Contoh: BCA, GoPay, Dompet Tunai" required>
      </label>
      <div class="form-grid">
        <label class="field-label">Jenis akun
          <select class="field mt-1.5" name="type" data-account-type-select>
            ${Object.entries(ACCOUNT_TYPES).map(([id, item]) => `<option value="${id}" ${type === id ? 'selected' : ''}>${escapeHTML(item.label)}</option>`).join('')}
          </select>
        </label>
        <label class="field-label">Saldo awal
          <div class="input-with-prefix mt-1.5"><span>Rp</span><input class="field" type="number" name="openingBalance" step="1" inputmode="numeric" value="${Number(account?.openingBalance || 0)}"></div>
        </label>
      </div>
      <p class="text-[11px] text-slate-400">Saldo saat ini dihitung dari saldo awal + seluruh pemasukan - pengeluaran + transfer. Untuk kartu kredit, saldo awal boleh negatif.</p>
      ${editing ? `<div class="account-form-balance">
        <span>Saldo terhitung saat ini</span>
        <strong class="${balance < 0 ? 'amount-expense' : ''}">${money(balance)}</strong>
      </div>` : ''}
      <div>
        <p class="field-label">Warna akun</p>
        <div class="mt-2">${colorPicker(color)}</div>
      </div>
      <p class="form-error hidden" data-form-error role="alert"></p>
    </div>
    <footer class="modal-footer">
      ${editing ? `<button type="button" class="btn ${account.archived ? 'btn-secondary' : 'btn-danger-soft'}" data-action="${account.archived ? 'restore-account' : 'archive-account'}" data-id="${escapeAttr(account.id)}">${icon(account.archived ? 'rotate-ccw' : 'archive', 'w-4 h-4')} ${account.archived ? 'Aktifkan' : 'Arsipkan'}</button>` : '<span></span>'}
      <div class="flex gap-2 ml-auto">
        <button type="button" class="btn btn-secondary" data-action="close-modal">Batal</button>
        <button type="submit" class="btn btn-primary">${icon('check', 'w-4 h-4')} Simpan</button>
      </div>
    </footer>
  </form>`;
}

export function categoryForm(category = null, type = 'expense') {
  const editing = Boolean(category?.id);
  const currentType = category?.type || type;
  const color = category?.color || '#64748B';
  const iconName = category?.icon || 'tag';
  return `<form data-form="category" data-id="${escapeAttr(category?.id || '')}" class="modal-form" novalidate>
    <header class="modal-header">
      <div>
        <p class="modal-kicker">${editing ? 'Perbarui kategori' : 'Kelompok transaksi'}</p>
        <h2 class="modal-title">${editing ? 'Ubah kategori' : 'Kategori baru'}</h2>
      </div>
      <button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
    </header>
    <div class="modal-body">
      <label class="field-label">Nama kategori
        <input class="field mt-1.5" name="name" maxlength="60" value="${escapeAttr(category?.name || '')}" placeholder="Contoh: Makanan & Minuman" required>
      </label>
      <div class="form-grid">
        <label class="field-label">Jenis
          <select class="field mt-1.5" name="type" ${editing ? 'disabled' : ''}>
            <option value="expense" ${currentType === 'expense' ? 'selected' : ''}>Pengeluaran</option>
            <option value="income" ${currentType === 'income' ? 'selected' : ''}>Pemasukan</option>
          </select>
          ${editing ? `<input type="hidden" name="type" value="${currentType}">` : ''}
        </label>
        <label class="field-label">Ikon
          <select class="field mt-1.5" name="icon">
            ${ICON_CHOICES.map((name) => `<option value="${name}" ${iconName === name ? 'selected' : ''}>${name}</option>`).join('')}
          </select>
        </label>
      </div>
      <div>
        <p class="field-label">Warna kategori</p>
        <div class="mt-2">${colorPicker(color)}</div>
      </div>
      <div class="category-preview" style="--preview-color:${escapeAttr(color)}">
        <span>${icon(iconName, 'w-5 h-5')}</span>
        <div><strong>${escapeHTML(category?.name || 'Pratinjau kategori')}</strong><small>${currentType === 'income' ? 'Pemasukan' : 'Pengeluaran'}</small></div>
      </div>
      <p class="form-error hidden" data-form-error role="alert"></p>
    </div>
    <footer class="modal-footer">
      <span></span>
      <div class="flex gap-2 ml-auto">
        <button type="button" class="btn btn-secondary" data-action="close-modal">Batal</button>
        <button type="submit" class="btn btn-primary">${icon('check', 'w-4 h-4')} Simpan</button>
      </div>
    </footer>
  </form>`;
}

export function subcategoryForm(category) {
  return `<form data-form="subcategory" data-category="${escapeAttr(category.id)}" class="modal-form" novalidate>
    <header class="modal-header">
      <div>
        <p class="modal-kicker">${escapeHTML(category.name)}</p>
        <h2 class="modal-title">Subkategori baru</h2>
      </div>
      <button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
    </header>
    <div class="modal-body">
      <label class="field-label">Nama subkategori
        <input class="field mt-1.5" name="name" maxlength="60" placeholder="Contoh: Belanja Harian" required autofocus>
      </label>
      <p class="form-error hidden" data-form-error role="alert"></p>
    </div>
    <footer class="modal-footer">
      <span></span>
      <div class="flex gap-2 ml-auto">
        <button type="button" class="btn btn-secondary" data-action="close-modal">Batal</button>
        <button type="submit" class="btn btn-primary">${icon('plus', 'w-4 h-4')} Tambah</button>
      </div>
    </footer>
  </form>`;
}

export function changePinForm(user) {
  return `<form data-form="change-pin" data-user="${escapeAttr(user.id)}" class="modal-form" novalidate>
    <header class="modal-header">
      <div>
        <p class="modal-kicker">Keamanan akun</p>
        <h2 class="modal-title">Ubah PIN ${escapeHTML(user.name)}</h2>
      </div>
      <button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
    </header>
    <div class="modal-body">
      <label class="field-label">PIN saat ini
        <input class="field mt-1.5" type="password" name="currentPin" inputmode="numeric" maxlength="8" autocomplete="current-password" required>
      </label>
      <div class="form-grid">
        <label class="field-label">PIN baru
          <input class="field mt-1.5" type="password" name="newPin" inputmode="numeric" minlength="4" maxlength="8" pattern="[0-9]{4,8}" autocomplete="new-password" required>
        </label>
        <label class="field-label">Ulangi PIN baru
          <input class="field mt-1.5" type="password" name="confirmPin" inputmode="numeric" minlength="4" maxlength="8" pattern="[0-9]{4,8}" autocomplete="new-password" required>
        </label>
      </div>
      <p class="text-[11px] leading-5 text-slate-500 dark:text-slate-400">PIN disimpan sebagai hash PBKDF2-SHA256 dengan salt unik. Setelah diubah, perangkat lain akan menerima hash baru saat sinkronisasi.</p>
      <p class="form-error hidden" data-form-error role="alert"></p>
    </div>
    <footer class="modal-footer">
      <span></span>
      <div class="flex gap-2 ml-auto">
        <button type="button" class="btn btn-secondary" data-action="close-modal">Batal</button>
        <button type="submit" class="btn btn-primary">${icon('lock', 'w-4 h-4')} Ubah PIN</button>
      </div>
    </footer>
  </form>`;
}

export function profileForm(user) {
  const colors = ['#2563EB', '#DB2777', '#7C3AED', '#0D9488', '#EA580C', '#475569'];
  return `<form data-form="profile" data-user="${escapeAttr(user.id)}" class="modal-form" novalidate>
    <header class="modal-header">
      <div>
        <p class="modal-kicker">Identitas tampilan</p>
        <h2 class="modal-title">Profil ${escapeHTML(user.name)}</h2>
      </div>
      <button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
    </header>
    <div class="modal-body">
      <label class="field-label">Nama tampilan
        <input class="field mt-1.5" name="name" maxlength="30" value="${escapeAttr(user.name)}" required>
      </label>
      <p class="field-label">Warna avatar</p>
      <div class="color-picker mt-2" role="group" aria-label="Pilih warna avatar">
        <input type="hidden" name="color" value="${escapeAttr(user.color || colors[0])}">
        ${colors.map((color) => `<button type="button" class="color-dot ${color === user.color ? 'is-active' : ''}" style="--pick-color:${color}" data-action="pick-color" data-color="${color}" aria-label="Warna ${color}"></button>`).join('')}
      </div>
      <p class="text-[11px] text-slate-400 mt-4">Nama ini menandai pembuat transaksi dan catatan. ID pengguna tetap Rizki/Shelly agar sinkronisasi tidak berubah.</p>
      <p class="form-error hidden" data-form-error role="alert"></p>
    </div>
    <footer class="modal-footer">
      <span></span>
      <div class="flex gap-2 ml-auto">
        <button type="button" class="btn btn-secondary" data-action="close-modal">Batal</button>
        <button type="submit" class="btn btn-primary">${icon('check', 'w-4 h-4')} Simpan profil</button>
      </div>
    </footer>
  </form>`;
}
