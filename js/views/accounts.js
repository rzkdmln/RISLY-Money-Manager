import { ACCOUNT_TYPES } from '../config.js';
import { store } from '../store.js';
import { icon } from '../icons.js';
import { badge, emptyState, money, pageHeader } from '../ui.js';
import { escapeAttr, escapeHTML, formatPercent } from '../utils.js';
import { accountIcon } from './common.js';

function accountCard(account, archived = false) {
  const balance = store.accountBalance(account.id);
  const txCount = store.accountTransactions(account.id).length;
  const type = ACCOUNT_TYPES[account.type] || ACCOUNT_TYPES.cash;
  const percent = store.totalBalance() !== 0 ? Math.abs(balance / store.totalBalance()) * 100 : 0;
  return `<article class="account-card ${archived ? 'is-archived' : ''}" style="--account-color:${escapeAttr(account.color || type.color)}">
    <div class="account-card-top">
      <span class="account-icon">${icon(accountIcon(account), 'w-5 h-5')}</span>
      <div class="min-w-0 flex-1">
        <h3 class="account-name">${escapeHTML(account.name)}</h3>
        <p class="account-type">${escapeHTML(type.label)}</p>
      </div>
      ${archived ? badge('Arsip', 'slate', 'badge-soft') : ''}
      <button type="button" class="card-icon-btn" data-action="edit-account" data-id="${escapeAttr(account.id)}" aria-label="Ubah akun">${icon('edit', 'w-3.5 h-3.5')}</button>
    </div>
    <div class="account-balance ${balance < 0 ? 'is-negative' : ''}">${money(balance)}</div>
    <div class="account-meta">
      <span>Saldo awal ${money(account.openingBalance, { compact: Math.abs(account.openingBalance) >= 1_000_000 })}</span>
      <span>${txCount} transaksi</span>
    </div>
    <div class="account-bar"><span style="width:${Math.min(100, percent)}%"></span></div>
    <div class="account-actions">
      <button type="button" class="link-button" data-action="filter-account" data-id="${escapeAttr(account.id)}">Lihat transaksi</button>
      ${archived
        ? `<button type="button" class="link-button" data-action="restore-account" data-id="${escapeAttr(account.id)}">Aktifkan</button>`
        : `<button type="button" class="link-button text-slate-400" data-action="archive-account" data-id="${escapeAttr(account.id)}">Arsipkan</button>`}
    </div>
  </article>`;
}

export function accountsView() {
  const accounts = store.activeAccounts();
  const archived = store.archivedAccounts();
  const netWorth = store.totalBalance();
  const totalOpening = accounts.reduce((sum, account) => sum + Number(account.openingBalance || 0), 0);
  const totalTx = store.transactions().length;

  return `<div class="page-stack">
    ${pageHeader({
      eyebrow: 'Dompet & rekening',
      title: 'Akun',
      subtitle: 'Saldo terhitung otomatis dari setiap transaksi dan transfer.',
      actions: `<button type="button" class="btn btn-secondary" data-action="add-tx" data-type="transfer">${icon('arrow-left-right', 'w-4 h-4')} Transfer</button>
        <button type="button" class="btn btn-primary" data-action="add-account">${icon('plus', 'w-4 h-4')} Akun</button>`,
    })}

    <section class="accounts-hero">
      <div class="relative z-10">
        <p class="networth-label">Total seluruh akun aktif</p>
        <p class="accounts-hero-value">${money(netWorth)}</p>
        <div class="accounts-hero-meta">
          <span>${icon('wallet', 'w-3.5 h-3.5')} ${accounts.length} akun</span>
          <span>${icon('receipt', 'w-3.5 h-3.5')} ${totalTx} transaksi</span>
          <span>${icon('trending-up', 'w-3.5 h-3.5')} ${money(totalOpening, { compact: true })} saldo awal</span>
        </div>
      </div>
      <div class="accounts-hero-ring"></div>
      <div class="accounts-hero-ring accounts-hero-ring-two"></div>
    </section>

    ${accounts.length ? `<div class="accounts-grid">${accounts.map((account) => accountCard(account)).join('')}</div>` : emptyState('wallet', 'Belum ada akun', 'Tambahkan dompet tunai, rekening bank, atau dompet digital untuk mulai mencatat.', `<button type="button" class="btn btn-primary btn-sm" data-action="add-account">${icon('plus', 'w-3.5 h-3.5')} Tambah akun</button>`)}

    <div class="grid lg:grid-cols-3 gap-4">
      <section class="card lg:col-span-2">
        <div class="card-heading">
          <div>
            <p class="card-kicker">Cara kerja saldo</p>
            <h2 class="section-title">Double-entry sederhana</h2>
          </div>
          ${icon('shield', 'w-5 h-5 text-emerald-500')}
        </div>
        <div class="grid sm:grid-cols-3 gap-3">
          <div class="info-tile"><span>${icon('arrow-down-left', 'w-4 h-4')}</span><strong>Pemasukan</strong><p>Menambah saldo akun tujuan.</p></div>
          <div class="info-tile"><span>${icon('arrow-up-right', 'w-4 h-4')}</span><strong>Pengeluaran</strong><p>Mengurangi saldo akun sumber.</p></div>
          <div class="info-tile"><span>${icon('arrow-left-right', 'w-4 h-4')}</span><strong>Transfer</strong><p>Mengurangi satu akun dan menambah akun lain.</p></div>
        </div>
        <p class="text-xs leading-5 text-slate-500 dark:text-slate-400 mt-4">Transfer tidak dihitung sebagai pemasukan atau pengeluaran bulanan. Inilah yang membuat laporan arus kas tetap bersih.</p>
      </section>
      <section class="card">
        <div class="card-heading">
          <div>
            <p class="card-kicker">Distribusi</p>
            <h2 class="section-title">Porsi kekayaan</h2>
          </div>
        </div>
        <div class="space-y-3">
          ${accounts.map((account) => {
            const balance = store.accountBalance(account.id);
            const percent = netWorth !== 0 ? Math.abs(balance / netWorth) * 100 : 0;
            return `<div>
              <div class="flex items-center justify-between text-xs mb-1.5"><span class="text-slate-600 dark:text-slate-300">${escapeHTML(account.name)}</span><span class="font-semibold text-slate-800 dark:text-slate-100">${formatPercent(percent)}</span></div>
              <div class="progress-track progress-thin"><span class="progress-fill" style="width:${Math.min(100, percent)}%;background:${escapeAttr(account.color)}"></span></div>
            </div>`;
          }).join('') || '<p class="text-xs text-slate-500">Belum ada akun.</p>'}
        </div>
      </section>
    </div>

    ${archived.length ? `<section class="card">
      <div class="card-heading">
        <div>
          <p class="card-kicker">Tidak dihitung ke kekayaan bersih</p>
          <h2 class="section-title">Akun diarsipkan</h2>
        </div>
        ${badge(`${archived.length} akun`, 'slate', 'badge-soft')}
      </div>
      <div class="accounts-grid">${archived.map((account) => accountCard(account, true)).join('')}</div>
    </section>` : ''}
  </div>`;
}
