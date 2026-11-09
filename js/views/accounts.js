import { ACCOUNT_TYPES } from '../config.js';
import { store } from '../store.js';
import { icon } from '../icons.js';
import { avatar, badge, emptyState, money, pageHeader, prefs, ui } from '../ui.js';
import { escapeAttr, escapeHTML, formatDate, formatPercent, safeNumber } from '../utils.js';
import { accountIcon } from './common.js';

const UNASSIGNED = '__unassigned__';

function accountCard(account, archived = false) {
  const balance = store.accountBalance(account.id);
  const txCount = store.accountTransactions(account.id).length;
  const type = ACCOUNT_TYPES[account.type] || ACCOUNT_TYPES.cash;
  const percent = store.totalBalance() !== 0 ? Math.abs(balance / store.totalBalance()) * 100 : 0;
  return `<article class="account-card ${archived ? 'is-archived' : ''} min-w-0 w-full overflow-hidden" style="--account-color:${escapeAttr(account.color || type.color)}">
    <div class="account-card-top min-w-0 flex items-center gap-2">
      <span class="account-icon shrink-0">${icon(accountIcon(account), 'w-5 h-5')}</span>
      <div class="min-w-0 flex-1">
        <h3 class="account-name truncate">${escapeHTML(account.name)}</h3>
        <p class="account-type truncate">${escapeHTML(type.label)}</p>
      </div>
      ${Array.isArray(account.sharedWith) && account.sharedWith.length ? badge('Bersama', 'blue', 'badge-soft') : ''}
      ${archived ? badge('Arsip', 'slate', 'badge-soft') : ''}
      <button type="button" class="card-icon-btn shrink-0" data-action="edit-account" data-id="${escapeAttr(account.id)}" aria-label="Ubah akun">${icon('edit', 'w-3.5 h-3.5')}</button>
    </div>
    <div class="account-balance truncate ${balance < 0 ? 'is-negative' : ''}">${money(balance)}</div>
    ${account.type === 'loan' ? `<div class="text-[12px] text-red-500 mt-1">Sisa utang ${money(safeNumber(account.loanRemaining))}${account.loanNextDueDate ? ` · jatuh tempo ${escapeHTML(formatDate(account.loanNextDueDate))}` : ''}</div>` : ''}
    ${account.type === 'credit' && account.creditDueDate ? `<div class="text-[11px] text-slate-400 mt-0.5">Jatuh tempo kredit: ${escapeHTML(formatDate(account.creditDueDate))}</div>` : ''}
    ${account.type === 'credit' && safeNumber(account.creditLimit) > 0 ? (() => {
      const creditLimit = safeNumber(account.creditLimit);
      const spent = store.creditSpent(account.id);
      const usedPercent = creditLimit > 0 ? Math.min(100, Math.round((spent / creditLimit) * 100)) : 0;
      const remaining = Math.max(0, creditLimit - spent);
      const tone = usedPercent >= 90 ? 'text-red-500' : usedPercent >= 60 ? 'text-amber-500' : 'text-slate-400';
      return `<div class="min-w-0">
        <div class="text-[12px] ${tone}">Limit ${money(creditLimit)} · Sisa ${money(remaining)} · Terpakai ${usedPercent}%</div>
        <div class="account-bar min-w-0 w-full"><span style="width:${Math.min(100, usedPercent)}%; background:${usedPercent >= 90 ? 'var(--red)' : undefined}"></span></div>
      </div>`;
    })() : ''}
    <div class="account-meta min-w-0 flex justify-end gap-2 text-xs">
      <span class="shrink-0">${txCount} transaksi</span>
    </div>
    <div class="account-bar min-w-0 w-full"><span style="width:${Math.min(100, percent)}%"></span></div>
    <div class="account-actions min-w-0 flex items-center gap-2">
      <button type="button" class="link-button truncate" data-action="filter-account" data-id="${escapeAttr(account.id)}">Lihat transaksi</button>
      ${['credit','loan'].includes(account.type) && safeNumber(account.loanPrincipal || account.creditLimit) > 0 ? `<button type="button" class="link-button shrink-0" data-action="loan-schedule" data-id="${escapeAttr(account.id)}">Jadwal</button>` : ''}
      ${archived
        ? `<button type="button" class="link-button shrink-0" data-action="restore-account" data-id="${escapeAttr(account.id)}">Aktifkan</button>
           <button type="button" class="link-button text-red-500 shrink-0" data-action="delete-account" data-id="${escapeAttr(account.id)}">Hapus</button>`
        : ''}
    </div>
  </article>`;
}

function ownerNetWorth(accounts) {
  return accounts.reduce((total, account) => total + store.accountBalance(account.id), 0);
}

function memberCard({ id, user, name, accounts, netWorth, isCurrent }) {
  const person = user || { name, color: 'var(--muted-2)' };
  return `<button type="button" class="member-card ${isCurrent ? 'is-current' : ''}" data-action="open-member" data-id="${escapeAttr(id)}">
    ${avatar(person, 'md')}
    <span class="member-main">
      <span class="member-name">${escapeHTML(name)}${isCurrent ? '<span class="member-you">Anda</span>' : ''}</span>
      <span class="member-meta">${accounts.length ? `${accounts.length} akun` : 'Belum ada akun'}</span>
    </span>
    <span class="member-value"><strong class="${netWorth < 0 ? 'is-negative' : ''}">${money(netWorth)}</strong></span>
    ${icon('chevron-right', 'w-4 h-4 member-chevron')}
  </button>`;
}

function memberBuckets() {
  const users = store.activeUsers();
  const activeAccounts = store.activeAccounts();
  const archived = store.archivedAccounts();
  const known = new Set(users.map((user) => user.id));

  const buckets = users.map((user) => {
    const accounts = activeAccounts.filter((account) => account.owner === user.id);
    const archivedAccounts = archived.filter((account) => account.owner === user.id);
    return {
      id: user.id,
      user,
      name: user.name,
      accounts,
      archivedAccounts,
      netWorth: ownerNetWorth(accounts),
      isCurrent: user.id === store.currentUserId,
    };
  });

  const unassigned = activeAccounts.filter((account) => !account.owner || !known.has(account.owner));
  if (unassigned.length) {
    buckets.push({
      id: UNASSIGNED,
      user: null,
      name: 'Tanpa pemilik',
      accounts: unassigned,
      archivedAccounts: archived.filter((account) => !account.owner || !known.has(account.owner)),
      netWorth: ownerNetWorth(unassigned),
      isCurrent: false,
    });
  }

  // Members with accounts first, current user always visible, then by wealth.
  return buckets
    .filter((bucket) => bucket.isCurrent || bucket.accounts.length || bucket.archivedAccounts.length)
    .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || b.netWorth - a.netWorth);
}

function memberOverview() {
  const buckets = memberBuckets();
  const activeAccounts = store.activeAccounts();
  const archived = store.archivedAccounts();
  const total = store.totalBalance();
  const totalTx = store.transactions().length;

  const cards = buckets.map((bucket) => memberCard(bucket)).join('');

  return `<div class="page-stack min-w-0 w-full overflow-hidden">
    ${pageHeader({
      title: 'Akun',
      actions: `<div class="flex items-center gap-2 flex-wrap justify-end">
        <button type="button" class="btn btn-secondary" data-action="add-tx" data-type="transfer">${icon('arrow-left-right', 'w-4 h-4')} Transfer</button>
        <button type="button" class="btn btn-primary" data-action="add-account">${icon('plus', 'w-4 h-4')} Akun</button>
      </div>`,
    })}

    <section class="accounts-hero min-w-0 w-full overflow-hidden">
      <div class="relative z-10 min-w-0">
        <p class="networth-label">Kekayaan bersih keluarga</p>
        <p class="accounts-hero-value truncate">${money(total)}</p>
        <div class="accounts-hero-meta min-w-0 flex flex-wrap gap-x-4 gap-y-1 mt-4">
          <span class="truncate">${icon('users', 'w-3.5 h-3.5')} ${buckets.length} anggota</span>
          <span class="truncate">${icon('wallet', 'w-3.5 h-3.5')} ${activeAccounts.length} akun</span>
          <span class="truncate">${icon('receipt', 'w-3.5 h-3.5')} ${totalTx} transaksi</span>
          ${archived.length ? `<span class="truncate">${icon('archive', 'w-3.5 h-3.5')} ${archived.length} diarsipkan</span>` : ''}
        </div>
      </div>
      <div class="accounts-hero-ring"></div>
      <div class="accounts-hero-ring accounts-hero-ring-two"></div>
    </section>

    <section class="card min-w-0 w-full overflow-hidden">
      <div class="card-heading min-w-0">
        <div class="min-w-0 flex-1">
          <p class="card-kicker">Anggota keluarga</p>
          <h2 class="section-title truncate">Kekayaan per anggota</h2>
        </div>
        ${badge(`${buckets.length} anggota`, 'slate', 'badge-soft')}
      </div>
      <div class="members-grid">
        ${cards || '<p class="text-sm text-slate-500">Belum ada anggota.</p>'}
      </div>
    </section>
  </div>`;
}

function memberDetail(bucket) {
  const { name, accounts, archivedAccounts, netWorth } = bucket;
  const view = prefs.accountsView === 'list' ? 'list' : 'grid';
  const gridClass = `accounts-grid ${view === 'list' ? 'accounts-list-view' : ''}`;
  const ownerAttr = bucket.id === UNASSIGNED ? '' : escapeAttr(bucket.id);

  const distribution = accounts.length && netWorth > 0
    ? `<section class="card min-w-0 w-full overflow-hidden">
        <div class="card-heading min-w-0">
          <div class="min-w-0 flex-1">
            <p class="card-kicker">Distribusi</p>
            <h2 class="section-title truncate">Porsi dari kekayaan anggota</h2>
          </div>
        </div>
        <div class="space-y-3 min-w-0 w-full">
          ${accounts.map((account) => {
            const balance = store.accountBalance(account.id);
            const percent = netWorth !== 0 ? Math.abs(balance / netWorth) * 100 : 0;
            return `<div class="min-w-0 w-full">
              <div class="flex items-center justify-between text-xs mb-1.5 min-w-0"><span class="text-slate-600 dark:text-slate-300 truncate mr-2">${escapeHTML(account.name)}</span><span class="font-semibold text-slate-800 dark:text-slate-100 shrink-0">${formatPercent(percent)}</span></div>
              <div class="progress-track progress-thin min-w-0 w-full"><span class="progress-fill" style="width:${Math.min(100, percent)}%;background:${escapeAttr(account.color)}"></span></div>
            </div>`;
          }).join('')}
        </div>
      </section>`
    : '';

  return `<div class="page-stack min-w-0 w-full overflow-hidden">
    <button type="button" class="back-link" data-action="accounts-back">${icon('arrow-left', 'w-3.5 h-3.5')} Semua anggota</button>
    ${pageHeader({
      eyebrow: 'Akun anggota',
      title: name,
      actions: `<div class="flex items-center gap-2 flex-wrap justify-end">
        <div class="view-toggle shrink-0" role="group" aria-label="Tampilan akun">
          <button type="button" class="${view === 'grid' ? 'is-active' : ''}" data-action="set-accounts-view" data-view="grid" aria-label="Tampilan kartu">${icon('layout-grid', 'w-4 h-4')}</button>
          <button type="button" class="${view === 'list' ? 'is-active' : ''}" data-action="set-accounts-view" data-view="list" aria-label="Tampilan daftar">${icon('layout-list', 'w-4 h-4')}</button>
        </div>
        <button type="button" class="btn btn-secondary" data-action="add-tx" data-type="transfer">${icon('arrow-left-right', 'w-4 h-4')} Transfer</button>
        <button type="button" class="btn btn-primary" data-action="add-account" data-owner="${ownerAttr}">${icon('plus', 'w-4 h-4')} Akun</button>
      </div>`,
    })}

    <section class="accounts-hero min-w-0 w-full overflow-hidden">
      <div class="relative z-10 min-w-0">
        <p class="networth-label">Kekayaan bersih</p>
        <p class="accounts-hero-value truncate">${money(netWorth)}</p>
        <div class="accounts-hero-meta min-w-0 flex flex-wrap gap-x-4 gap-y-1 mt-4">
          <span class="truncate">${icon('wallet', 'w-3.5 h-3.5')} ${accounts.length} akun</span>
          ${archivedAccounts.length ? `<span class="truncate">${icon('archive', 'w-3.5 h-3.5')} ${archivedAccounts.length} diarsipkan</span>` : ''}
        </div>
      </div>
      <div class="accounts-hero-ring"></div>
      <div class="accounts-hero-ring accounts-hero-ring-two"></div>
    </section>

    ${accounts.length
      ? `<div class="${gridClass}">${accounts.map((account) => accountCard(account)).join('')}</div>`
      : emptyState('wallet', `Belum ada akun untuk ${name}`, 'Tambahkan dompet, rekening, atau dompet digital milik anggota ini.', `<button type="button" class="btn btn-primary btn-sm" data-action="add-account" data-owner="${ownerAttr}">${icon('plus', 'w-3.5 h-3.5')} Tambah akun</button>`)}

    ${distribution}

    ${archivedAccounts.length ? `<section class="card min-w-0 w-full overflow-hidden">
      <div class="card-heading min-w-0">
        <div class="min-w-0 flex-1">
          <p class="card-kicker">Tidak dihitung ke kekayaan bersih</p>
          <h2 class="section-title truncate">Akun diarsipkan</h2>
        </div>
        ${badge(`${archivedAccounts.length} akun`, 'slate', 'badge-soft')}
      </div>
      <div class="${gridClass}">${archivedAccounts.map((account) => accountCard(account, true)).join('')}</div>
    </section>` : ''}
  </div>`;
}

export function accountsView() {
  const selectedId = ui.accountsMember || null;
  if (selectedId) {
    const bucket = memberBuckets().find((item) => item.id === selectedId);
    if (bucket) {
      // Keep the list-view preference usable inside the detail screen.
      if (!['grid', 'list'].includes(prefs.accountsView)) prefs.accountsView = 'grid';
      return memberDetail(bucket);
    }
    ui.accountsMember = null;
  }
  return memberOverview();
}

