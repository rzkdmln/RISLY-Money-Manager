import { store } from '../store.js';
import { icon } from '../icons.js';
import { badge, emptyState, money, pageHeader } from '../ui.js';
import { escapeAttr, escapeHTML, todayISO } from '../utils.js';
import { recurringRow } from './common.js';

export function recurringView() {
  const rules = store.recurringRules();
  const active = rules.filter((rule) => rule.active);
  const paused = rules.filter((rule) => !rule.active);
  const due = rules.filter((rule) => rule.active && rule.nextDate <= todayISO());
  const monthlyEstimate = active.reduce((total, rule) => {
    if (rule.frequency === 'daily') return total + rule.amount * 30;
    if (rule.frequency === 'weekly') return total + rule.amount * 4.33;
    if (rule.frequency === 'yearly') return total + rule.amount / 12;
    return total + rule.amount / Math.max(1, rule.interval || 1);
  }, 0);

  return `<div class="page-stack">
    ${pageHeader({
      eyebrow: 'Otomatisasi',
      title: 'Transaksi berulang',
      subtitle: 'Tagihan bulanan, gaji, dan transfer rutin dapat dicatat otomatis.',
      actions: `<button type="button" class="btn btn-primary" data-action="add-rec">${icon('plus', 'w-4 h-4')} Jadwal baru</button>`,
    })}

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
      <div class="stat-card stat-green">
        <div class="stat-top"><span>Aktif</span><span class="stat-icon">${icon('repeat', 'w-4 h-4')}</span></div>
        <div class="stat-value">${active.length}</div>
        <div class="stat-hint">jadwal berjalan</div>
      </div>
      <div class="stat-card stat-amber">
        <div class="stat-top"><span>Jatuh tempo</span><span class="stat-icon">${icon('clock', 'w-4 h-4')}</span></div>
        <div class="stat-value">${due.length}</div>
        <div class="stat-hint">perlu diproses</div>
      </div>
      <div class="stat-card stat-blue">
        <div class="stat-top"><span>Estimasi / bulan</span><span class="stat-icon">${icon('calculator', 'w-4 h-4')}</span></div>
        <div class="stat-value text-base sm:text-xl">${money(monthlyEstimate, { compact: true })}</div>
        <div class="stat-hint">perkiraan seluruh jadwal</div>
      </div>
      <div class="stat-card stat-slate">
        <div class="stat-top"><span>Dijeda</span><span class="stat-icon">${icon('pause', 'w-4 h-4')}</span></div>
        <div class="stat-value">${paused.length}</div>
        <div class="stat-hint">tidak diposting</div>
      </div>
    </div>

    ${due.length ? `<div class="recurring-alert">
      <span class="recurring-alert-icon">${icon('bell', 'w-5 h-5')}</span>
      <div class="min-w-0 flex-1">
        <p class="font-semibold text-slate-900 dark:text-white">${due.length} jadwal sudah jatuh tempo</p>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Jadwal otomatis diproses saat aplikasi dibuka. Jadwal manual perlu diposting dari daftar.</p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" data-action="process-recurring">${icon('play', 'w-3.5 h-3.5')} Proses otomatis</button>
    </div>` : ''}

    <section class="card">
      <div class="card-heading">
        <div>
          <p class="card-kicker">Jadwal keluarga</p>
          <h2 class="section-title">Semua transaksi berulang</h2>
        </div>
        ${badge(`${rules.length} jadwal`, 'slate', 'badge-soft')}
      </div>
      ${rules.length ? `<div class="recurring-list">${rules.map((rule) => recurringRow(rule)).join('')}</div>` : emptyState('repeat', 'Belum ada jadwal', 'Buat jadwal untuk tagihan listrik, langganan, gaji, atau transfer tabungan rutin.', `<button type="button" class="btn btn-primary btn-sm" data-action="add-rec">${icon('plus', 'w-3.5 h-3.5')} Buat jadwal</button>`)}
    </section>

    <div class="grid md:grid-cols-2 gap-4">
      <section class="card">
        <div class="card-heading">
          <div>
            <p class="card-kicker">Cara kerja</p>
            <h2 class="section-title">Posting otomatis</h2>
          </div>
          ${icon('zap', 'w-5 h-5 text-amber-500')}
        </div>
        <ol class="recurring-steps">
          <li><span>1</span><div><strong>Tentukan jadwal</strong><p>Tanggal berikutnya, frekuensi, akun, dan kategori.</p></div></li>
          <li><span>2</span><div><strong>Buka aplikasi</strong><p>Saat aplikasi dibuka, semua tanggal yang terlewat diproses.</p></div></li>
          <li><span>3</span><div><strong>Saldo & laporan</strong><p>Transaksi otomatis ikut mengubah saldo dan laporan.</p></div></li>
        </ol>
        <p class="text-[11px] leading-5 text-slate-400 mt-3">PWA tidak dapat membuat transaksi saat aplikasi sepenuhnya tertutup tanpa push/background worker. Jadwal akan diproses segera setelah aplikasi dibuka.</p>
      </section>
      <section class="card">
        <div class="card-heading">
          <div>
            <p class="card-kicker">Tips</p>
            <h2 class="section-title">Jadwal yang rapi</h2>
          </div>
          ${icon('sparkles', 'w-5 h-5 text-violet-500')}
        </div>
        <ul class="space-y-3 text-sm text-slate-600 dark:text-slate-300">
          <li class="flex gap-2.5">${icon('check-circle', 'w-4 h-4 text-emerald-500 shrink-0')} Gunakan tanggal setelah transaksi terakhir agar tidak tercatat ganda.</li>
          <li class="flex gap-2.5">${icon('check-circle', 'w-4 h-4 text-emerald-500 shrink-0')} Untuk gaji, pilih tanggal gajian dan kategori pemasukan yang sesuai.</li>
          <li class="flex gap-2.5">${icon('check-circle', 'w-4 h-4 text-emerald-500 shrink-0')} Transfer tabungan tidak mengurangi arus kas bulanan, hanya memindahkan saldo.</li>
          <li class="flex gap-2.5">${icon('check-circle', 'w-4 h-4 text-emerald-500 shrink-0')} Gunakan mode manual untuk tagihan yang nominalnya berubah setiap bulan.</li>
        </ul>
      </section>
    </div>
  </div>`;
}
