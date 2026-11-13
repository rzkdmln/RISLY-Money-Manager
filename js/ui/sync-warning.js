/**
 * Banner status sinkronisasi.
 *
 * Modul ini sengaja bebas DOM agar bisa dipakai oleh view mana pun dan diuji
 * tanpa efek samping inisialisasi UI.
 */

/**
 * Banner "Sinkronisasi belum aktif" hanya boleh muncul setelah percobaan
 * koneksi pertama selesai. Saat handshake awal (initializing/connecting),
 * status belum final sehingga banner akan berkedip lalu hilang.
 */
export function shouldShowSyncWarning(status) {
  if (!status || status.provider === 'local') return false;
  if (status.connected || status.initializing) return false;
  if (status.state === 'connecting' || status.state === 'syncing') return false;
  return true;
}

export function syncWarning(status) {
  if (!shouldShowSyncWarning(status)) return '';
  return `<div class="rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 flex items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="text-sm font-semibold text-amber-800 dark:text-amber-200">Sinkronisasi belum aktif</p>
        <p class="text-xs text-amber-700 dark:text-amber-300/80">Klik tombol di bawah untuk mencoba menyinkronkan ulang dari sini.</p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm shrink-0" data-action="sync-now">Sinkronkan</button>
    </div>`;
}
