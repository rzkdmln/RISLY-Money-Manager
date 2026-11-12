import { ACCOUNT_TYPES, DEFAULT_CATEGORY_COLORS, ICON_CHOICES } from '../core/config.js';
import { COLOR_HARMONY_MODES, harmonySwatchMarkup, quickSwatchMarkup } from '../ui/colors.js';
import { icon } from '../ui/icons.js';
import { store } from '../core/store.js';
import { escapeAttr, escapeHTML, formatNumber } from '../core/utils.js';

function colorPicker(selected, inputName = 'color') {
  const base = selected || '#3B82F6';
  const quick = [...new Set([selected, ...DEFAULT_CATEGORY_COLORS].filter(Boolean))];
  return `<div class="color-field" data-color-field data-color-base="${escapeAttr(base)}" data-color-harmony="analogous">
    <input type="hidden" name="${escapeAttr(inputName)}" value="${escapeAttr(selected)}">
    <button type="button" class="color-trigger" data-action="toggle-color-picker" aria-expanded="false">
      <span class="color-trigger-chip" style="--pick-color:${escapeAttr(selected)}"></span>
      <span class="min-w-0 flex-1 text-left">
        <span class="color-trigger-label">Warna terpilih</span>
        <span class="color-trigger-value" data-color-label>${escapeAttr(selected)}</span>
      </span>
      ${icon('palette', 'w-4 h-4')}
    </button>
    <div class="color-panel" data-color-panel hidden>
      <div class="color-panel-head">
        <div class="min-w-0">
          <p class="color-panel-kicker">Harmoni warna</p>
          <p class="color-panel-copy">Pilih warna dasar, lalu ambil variasi dari aturan harmoni.</p>
        </div>
        <label class="color-custom">
          <span>Dasar</span>
          <input type="color" data-color-custom value="${escapeAttr(base)}" aria-label="Warna dasar">
        </label>
      </div>
      <div class="color-harmony-modes" role="group" aria-label="Aturan harmoni warna">
        ${COLOR_HARMONY_MODES.map((mode) => `<button type="button" class="${mode.id === 'analogous' ? 'is-active' : ''}" data-action="color-harmony" data-harmony="${mode.id}">${escapeHTML(mode.label)}</button>`).join('')}
      </div>
      <div class="color-swatches" data-color-swatches>${harmonySwatchMarkup(base, 'analogous', selected)}</div>
      <div class="color-quick">
        <span>Warna cepat</span>
        <div class="color-picker">${quickSwatchMarkup(quick, selected)}</div>
      </div>
    </div>
  </div>`;
}

export function accountForm(account = null, defaultOwner = null) {
  const editing = Boolean(account?.id);
  const type = account?.type || 'cash';
  const color = account?.color || ACCOUNT_TYPES[type]?.color || '#3B82F6';
  const balance = editing ? store.accountBalance(account.id) : 0;
  const users = store.activeUsers();
  const ownerValue = account?.owner || defaultOwner || store.currentUserId || users[0]?.id || '';
  const sharedValue = Array.isArray(account?.sharedWith) ? account.sharedWith : [];
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
        ${editing ? `<label class="field-label">Saldo akun ini
          <div class="input-with-prefix mt-1.5">
            <span>Rp</span>
            <input class="field" type="text" inputmode="numeric" name="balanceTargetDisplay" value="${balance ? formatNumber(balance) : ''}" placeholder="0" autocomplete="off">
            <input type="hidden" name="balanceTarget" value="${Math.round(balance || 0)}">
          </div>
        </label>` : ''}
        <label class="field-label">Limit kredit (opsional, untuk kartu kredit)
          <div class="input-with-prefix mt-1.5">
            <span>Rp</span>
            <input class="field" type="text" inputmode="numeric" name="creditLimitDisplay" value="${account?.creditLimit ? formatNumber(account.creditLimit) : ''}" placeholder="0" autocomplete="off">
            <input type="hidden" name="creditLimit" value="${Math.round(account?.creditLimit || 0)}">
          </div>
        </label>
        <div class="liability-fields col-span-full" data-liability-fields style="${['credit','loan'].includes(type) ? '' : 'display:none'}">
          <div class="form-grid">
            <label class="field-label">Jatuh tempo kredit (opsional)
              <input class="field mt-1.5" type="date" name="creditDueDate" value="${escapeAttr(account?.creditDueDate || '')}">
            </label>
            <label class="field-label">Pokok pinjaman (Rp)
              <div class="input-with-prefix mt-1.5">
                <span>Rp</span>
                <input class="field" type="text" inputmode="numeric" name="loanPrincipalDisplay" value="${account?.loanPrincipal ? formatNumber(account.loanPrincipal) : ''}" placeholder="0" autocomplete="off">
                <input type="hidden" name="loanPrincipal" value="${Math.round(account?.loanPrincipal || 0)}">
              </div>
            </label>
            <label class="field-label">Bunga (%/tahun)
              <input class="field mt-1.5" type="number" name="loanInterestRate" min="0" step="0.01" inputmode="decimal" value="${account?.loanInterestRate || 0}">
            </label>
            <label class="field-label">Tenor (bulan)
              <input class="field mt-1.5" type="number" name="loanTermMonths" min="0" step="1" inputmode="numeric" value="${Math.round(account?.loanTermMonths || 0)}">
            </label>
            <label class="field-label">Cicilan per bulan (Rp, 0 = hitung anuitas)
              <div class="input-with-prefix mt-1.5">
                <span>Rp</span>
                <input class="field" type="text" inputmode="numeric" name="loanMonthlyPaymentDisplay" value="${account?.loanMonthlyPayment ? formatNumber(account.loanMonthlyPayment) : ''}" placeholder="0" autocomplete="off">
                <input type="hidden" name="loanMonthlyPayment" value="${Math.round(account?.loanMonthlyPayment || 0)}">
              </div>
            </label>
            <label class="field-label">Tanggal mulai
              <input class="field mt-1.5" type="date" name="loanStartDate" value="${escapeAttr(account?.loanStartDate || '')}">
            </label>
            <label class="field-label">Jatuh tempo berikutnya
              <input class="field mt-1.5" type="date" name="loanNextDueDate" value="${escapeAttr(account?.loanNextDueDate || '')}">
            </label>
            <label class="field-label">Sisa utang (Rp)
              <div class="input-with-prefix mt-1.5">
                <span>Rp</span>
                <input class="field" type="text" inputmode="numeric" name="loanRemainingDisplay" value="${(account?.loanRemaining ?? account?.loanPrincipal ?? 0) ? formatNumber(account?.loanRemaining ?? account?.loanPrincipal ?? 0) : ''}" placeholder="0" autocomplete="off">
                <input type="hidden" name="loanRemaining" value="${Math.round(account?.loanRemaining ?? account?.loanPrincipal ?? 0)}">
              </div>
            </label>
          </div>
          <p class="text-[11px] text-slate-400 mt-2">Untuk pinjaman anuitas, isi pokok, bunga, dan tenor; cicilan per bulan akan dihitung otomatis jika dibiarkan 0.</p>
        </div>
      ${users.length > 1 ? `<label class="field-label">Pemilik akun
        <select class="field mt-1.5" name="owner">
          ${users.map((u) => `<option value="${escapeAttr(u.id)}" ${ownerValue === u.id ? 'selected' : ''}>${escapeHTML(u.name)}</option>`).join('')}
        </select>
      </label>` : ''}
      ${users.length > 1 ? `<div class="field-label">Bagikan ke (akun bersama)
        <div class="mt-1.5 flex flex-wrap gap-2">
          ${users.filter((u) => u.id !== ownerValue).map((u) => `<label class="inline-flex items-center gap-1.5 text-xs"><input type="checkbox" name="sharedWith" value="${escapeAttr(u.id)}" ${sharedValue.includes(u.id) ? 'checked' : ''}> ${escapeHTML(u.name)}</label>`).join('')}
        </div>
      </div>` : ''}
      </div>
      ${editing ? '<p class="text-[11px] text-slate-400">Perubahan saldo akan dicatat sebagai transaksi penyesuaian.</p>' : ''}
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
      ${editing ? `<div class="subcategory-manager mt-4" data-subcategory-manager="${escapeAttr(category.id)}">
        <p class="field-label">Subkategori</p>
        <div class="subcategory-list mt-2">
          ${(category.subcategories || []).filter((sub) => !sub.deletedAt).map((sub) => `<span class="subcategory-chip">${escapeHTML(sub.name)}<button type="button" class="ml-1" data-action="rename-subcategory" data-category="${escapeAttr(category.id)}" data-subcategory="${escapeAttr(sub.id)}" aria-label="Ubah subkategori ${escapeAttr(sub.name)}">${icon('edit', 'w-2.5 h-2.5')}</button><button type="button" class="ml-1" data-action="delete-subcategory" data-category="${escapeAttr(category.id)}" data-subcategory="${escapeAttr(sub.id)}" aria-label="Hapus subkategori ${escapeAttr(sub.name)}">${icon('x', 'w-2.5 h-2.5')}</button></span>`).join('') || '<p class="text-xs text-slate-500 dark:text-slate-400">Belum ada subkategori.</p>'}
        </div>
        <div class="flex gap-2 mt-3">
          <input class="field min-w-0" type="text" data-subcategory-name placeholder="Nama subkategori baru" maxlength="60">
          <button type="button" class="btn btn-secondary btn-sm shrink-0" data-action="add-subcategory" data-category="${escapeAttr(category.id)}">${icon('plus', 'w-3.5 h-3.5')} Tambah</button>
        </div>
      </div>` : '<p class="text-[11px] text-slate-400 mt-4">Simpan kategori terlebih dahulu untuk menambah subkategori.</p>'}
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
      ${user?.pinHash ? `<label class="field-label">PIN saat ini
        <input class="field mt-1.5" type="password" name="currentPin" inputmode="numeric" maxlength="8" autocomplete="current-password" required>
      </label>` : ''}
      <div class="form-grid">
        <label class="field-label">PIN baru
          <input class="field mt-1.5" type="password" name="newPin" inputmode="numeric" minlength="6" maxlength="8" pattern="[0-9]{6,8}" autocomplete="new-password" required>
        </label>
        <label class="field-label">Ulangi PIN baru
          <input class="field mt-1.5" type="password" name="confirmPin" inputmode="numeric" minlength="6" maxlength="8" pattern="[0-9]{6,8}" autocomplete="new-password" required>
        </label>
      </div>
      <p class="text-[11px] leading-5 text-slate-500 dark:text-slate-400">PIN disimpan sebagai hash PBKDF2-SHA256 dengan salt unik. Setelah diubah, perangkat lain akan menerima hash baru saat sinkronisasi.</p>
      <p class="form-error hidden" data-form-error role="alert"></p>
    </div>
    <footer class="modal-footer">
      <div class="flex gap-2">
        ${user?.pinHash ? `<button type="button" class="btn btn-danger-soft" data-action="remove-pin" data-id="${escapeAttr(user.id)}">${icon('x', 'w-4 h-4')} Hapus PIN</button>` : ''}
      </div>
      <div class="flex gap-2 ml-auto">
        <button type="button" class="btn btn-secondary" data-action="close-modal">Batal</button>
        <button type="submit" class="btn btn-primary">${icon('lock', 'w-4 h-4')} ${user?.pinHash ? 'Ubah PIN' : 'Buat PIN'}</button>
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
      <p class="text-[11px] text-slate-400 mt-4">Nama ini menandai pembuat transaksi dan catatan.</p>
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
