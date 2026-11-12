/**
 * RISLY Money Manager — Excel & PDF export
 *
 * Handles spreadsheet and PDF report generation for transactions.
 * Output is designed to be clear, complete, and traceable — like a digital
 * bank statement — so every inflow and outflow can be verified.
 */

/* Imports */
import { store } from '../core/store.js';
import { openModal, toast, ui } from '../ui/ui.js';
import { icon } from '../ui/icons.js';
import {
  escapeAttr,
  fileSafe,
  formatCurrency,
  formatDate,
  formatMonth,
  monthKey,
  todayISO,
  safeNumber,
} from '../core/utils.js';

/* ------------------------------------------------------------------------ */
/*  Label helpers                                                           */
/* ------------------------------------------------------------------------ */

function accountPair(tx) {
  if (tx.type === 'transfer') {
    return `${store.accountName(tx.accountId)} -> ${store.accountName(tx.toAccountId)}`;
  }
  if (Array.isArray(tx.payments) && tx.payments.length) {
    return tx.payments.map((payment) => store.accountName(payment.accountId)).join(' + ');
  }
  return store.accountName(tx.accountId);
}

function categoryLabel(tx) {
  if (tx.type === 'transfer') return 'Transfer';
  const category = store.categoryById(tx.categoryId);
  const sub = tx.subcategoryId ? store.subcategoryById(tx.categoryId, tx.subcategoryId) : null;
  if (category && sub) return `${category.name} / ${sub.name}`;
  return category?.name || 'Tanpa kategori';
}

function typeBadgeLabel(type) {
  return type === 'income' ? 'Pemasukan' : type === 'expense' ? 'Pengeluaran' : 'Transfer';
}

/* ------------------------------------------------------------------------ */
/*  Running balance                                                         */
/* ------------------------------------------------------------------------ */

/**
 * Hitung saldo kumulatif (running balance) per transaksi.
 * Saldo dimulai dari 0, ditambahkan pemasukan, dikurangi pengeluaran dan transfer keluar.
 * Transfer masuk ditambahkan, transfer keluar dikurangi.
 */
function buildRunningBalance(list) {
  let balance = 0;
  return list.map((tx) => {
    let delta = 0;
    if (tx.type === 'income') delta = safeNumber(tx.amount);
    else if (tx.type === 'expense') delta = -safeNumber(tx.amount);
    else if (tx.type === 'transfer') {
      // Transfer: keluar dari accountId, masuk ke toAccountId.
      // Untuk representasi per baris, kita hanya mencatat keluar dari accountId.
      delta = -safeNumber(tx.amount);
    }
    balance += delta;
    return { ...tx, runningBalance: balance };
  });
}

/* ------------------------------------------------------------------------ */
/*  Excel export                                                            */
/* ------------------------------------------------------------------------ */

export function exportExcel(month = null) {
  if (!window.XLSX) {
    toast('Pustaka Excel belum siap. Periksa koneksi lalu coba lagi.', 'error');
    return;
  }
  const list = month ? store.transactionsForMonth(month) : store.transactions();
  if (!list.length) {
    toast('Tidak ada transaksi untuk diekspor.', 'info');
    return;
  }
  buildExcelWorkbook(list, month ? `Transaksi ${month}`.slice(0, 31) : 'Semua Transaksi', `RISLY-transaksi-${fileSafe(month || 'semua')}.xlsx`, month ? formatMonth(month) : 'Semua periode');
}

export function exportExcelRange(start, end) {
  if (!window.XLSX) {
    toast('Pustaka Excel belum siap. Periksa koneksi lalu coba lagi.', 'error');
    return;
  }
  if (!start || !end) {
    toast('Pilih rentang tanggal terlebih dahulu.', 'info');
    return;
  }
  const list = store.transactionsBetween(start, end);
  if (!list.length) {
    toast('Tidak ada transaksi pada rentang tersebut.', 'info');
    return;
  }
  buildExcelWorkbook(list, 'Transaksi Rentang', `RISLY-transaksi-${fileSafe(start)}_${fileSafe(end)}.xlsx`, `${start} s/d ${end}`);
}

function buildExcelWorkbook(list, sheetName, fileName, periodLabel) {
  const summary = store.summaryForTransactions(list);
  const ordered = buildRunningBalance(
    [...list].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      const ta = safeNumber(timeFromISO(a.time || '00:00'));
      const tb = safeNumber(timeFromISO(b.time || '00:00'));
      return ta - tb;
    }),
  );

  const rows = ordered.map((tx, index) => ({
    'No': index + 1,
    'Tanggal': tx.date,
    'Waktu': tx.time || '',
    'Jenis': typeBadgeLabel(tx.type),
    'Nominal': safeNumber(tx.amount),
    'Saldo': tx.runningBalance,
    'Akun': accountPair(tx),
    'Kategori': categoryLabel(tx),
    'Pencatat': tx.createdByName || store.getUser(tx.createdBy)?.name || '—',
    'Catatan': tx.note || '',
    'Referensi': tx.type === 'transfer' ? 'Transfer antar akun' : '',
  }));

  // Sheet 1: Ringkasan
  const summaryRows = [
    { Item: 'Periode', Value: periodLabel },
    { Item: 'Total Transaksi', Value: summary.count },
    { Item: 'Total Pemasukan', Value: safeNumber(summary.income) },
    { Item: 'Total Pengeluaran', Value: safeNumber(summary.expense) },
    { Item: 'Total Transfer', Value: safeNumber(summary.transfers) },
    { Item: 'Arus Kas Bersih', Value: safeNumber(summary.net) },
    { Item: 'Tingkat Tabungan', Value: summary.savingsRate >= 0 ? `${summary.savingsRate.toFixed(1)}%` : `${summary.savingsRate.toFixed(1)}%` },
    { Item: 'Dibuat Pada', Value: formatDate(todayISO()) },
    { Item: 'Rumah Tangga', Value: store.data.settings.householdName || 'RISLY' },
  ];

  const summarySheet = window.XLSX.utils.json_to_sheet(summaryRows);
  summarySheet['!cols'] = [{ wch: 28 }, { wch: 40 }];

  // Sheet 2: Detail transaksi
  const detailSheet = window.XLSX.utils.json_to_sheet(rows);
  detailSheet['!cols'] = [
    { wch: 5 },   // No
    { wch: 12 },  // Tanggal
    { wch: 8 },   // Waktu
    { wch: 14 },  // Jenis
    { wch: 18 },  // Nominal
    { wch: 18 },  // Saldo
    { wch: 30 },  // Akun
    { wch: 30 },  // Kategori
    { wch: 20 },  // Pencatat
    { wch: 40 },  // Catatan
    { wch: 20 },  // Referensi
  ];

  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, summarySheet, 'Ringkasan');
  window.XLSX.utils.book_append_sheet(workbook, detailSheet, sheetName);
  window.XLSX.writeFile(workbook, fileName);
  toast(`${list.length} transaksi berhasil diekspor ke Excel.`, 'success');
}

/* ------------------------------------------------------------------------ */
/*  PDF helpers                                                             */
/* ------------------------------------------------------------------------ */

function pdfCurrency(value) {
  return formatCurrency(value, { hide: false }).replace('Rp', 'Rp ');
}

function formatTxDate(dateISO) {
  const d = new Date(`${dateISO}T00:00:00`);
  const options = { day: '2-digit', month: 'short', year: 'numeric' };
  return d.toLocaleDateString('id-ID', options);
}

/* ------------------------------------------------------------------------ */
/*  PDF export                                                              */
/* ------------------------------------------------------------------------ */

export function exportPdf(month = monthKey()) {
  const jsPDFCtor = window.jspdf?.jsPDF || window.jsPDF;
  if (!jsPDFCtor) {
    toast('Pustaka PDF belum siap. Periksa koneksi lalu coba lagi.', 'error');
    return;
  }
  const summary = store.monthSummary(month);
  const list = buildRunningBalance(
    [...store.transactionsForMonth(month)].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      const ta = safeNumber(timeFromISO(a.time || '00:00'));
      const tb = safeNumber(timeFromISO(b.time || '00:00'));
      return ta - tb;
    }),
  );
  const household = store.data.settings.householdName || 'RISLY';
  const doc = new jsPDFCtor({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  /* ---------- Header ---------- */
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageWidth, 70, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('RISLY Money Manager', 40, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Laporan Keuangan ${formatMonth(month)} · ${household}`, 40, 52);
  doc.text(`Dibuat: ${formatDate(todayISO())}`, pageWidth - 40, 52, { align: 'right' });

  /* ---------- Summary boxes ---------- */
  const boxes = [
    { label: 'Pemasukan', value: pdfCurrency(summary.income), color: [22, 163, 74] },
    { label: 'Pengeluaran', value: pdfCurrency(summary.expense), color: [240, 68, 82] },
    { label: 'Arus Kas', value: pdfCurrency(summary.net), color: [37, 99, 235] },
    { label: 'Tingkat Tabungan', value: `${summary.savingsRate.toFixed(1)}%`, color: [124, 58, 237] },
    { label: 'Jumlah Transaksi', value: String(summary.count), color: [15, 23, 42] },
  ];
  const boxWidth = (pageWidth - 80 - 4 * 10) / 5;
  boxes.forEach((box, index) => {
    const x = 40 + index * (boxWidth + 10);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, 84, boxWidth, 48, 6, 6, 'F');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(box.label.toUpperCase(), x + 8, 98);
    doc.setFontSize(12);
    doc.setTextColor(...box.color);
    doc.setFont('helvetica', 'bold');
    doc.text(box.value, x + 8, 114);
    doc.setFont('helvetica', 'normal');
  });

  /* ---------- Transaction table ---------- */
  const tableStartY = 146;
  const colWidths = [25, 60, 40, 210, 150, 100, 100];
  const headers = ['No', 'Tanggal', 'Jenis', 'Keterangan', 'Akun', 'Nominal', 'Saldo'];
  const tableWidth = pageWidth - 80;

  doc.autoTable({
    startY: tableStartY,
    head: [headers],
    body: list.map((tx, i) => {
      // Nominal selalu punya tanda: + untuk pemasukan, - untuk pengeluaran dan transfer
      const nominalSign = tx.type === 'income' ? '+' : '-';
      const amountLabel = `${nominalSign}${pdfCurrency(tx.amount)}`;
      // Saldo bersih: hanya angka, tanpa tanda plus di depan (minus hanya jika negatif)
      return [
        String(i + 1),
        formatTxDate(tx.date),
        typeBadgeLabel(tx.type),
        tx.note || (tx.type === 'transfer' ? 'Transfer antar akun' : categoryLabel(tx)),
        accountPair(tx),
        amountLabel,
        pdfCurrency(tx.runningBalance),
      ];
    }),
    theme: 'striped',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 9,
      font: 'helvetica',
    },
    bodyStyles: {
      fontSize: 8.5,
      cellPadding: 5,
      font: 'helvetica',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: colWidths[0], halign: 'center' },
      1: { cellWidth: colWidths[1] },
      2: { cellWidth: colWidths[2], halign: 'center' },
      3: { cellWidth: colWidths[3], overflow: 'linebreak' },
      4: { cellWidth: colWidths[4] },
      5: { cellWidth: colWidths[5], halign: 'right' },
      6: { cellWidth: colWidths[6], halign: 'right' },
    },
    tableWidth,
    verticalLines: true,
    margin: { left: 40, right: 40, bottom: 40 },
    didDrawPage: (data) => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`RISLY Money Manager · ${household}`, 40, h - 18);
      doc.text(`Halaman ${data.pageNumber}`, pageWidth - 40, h - 18, { align: 'right' });
    },
  });

  if (!list.length) {
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139);
    doc.text('Belum ada transaksi pada periode ini.', 40, tableStartY + 20);
  }

  doc.save(`RISLY-laporan-${fileSafe(month)}.pdf`);
  toast(`Laporan PDF ${formatMonth(month)} berhasil dibuat.`, 'success');
}

export function exportPdfRange(start, end) {
  const jsPDFCtor = window.jspdf?.jsPDF || window.jsPDF;
  if (!jsPDFCtor) {
    toast('Pustaka PDF belum siap. Periksa koneksi lalu coba lagi.', 'error');
    return;
  }
  if (!start || !end) {
    toast('Pilih rentang tanggal terlebih dahulu.', 'info');
    return;
  }
  const list = buildRunningBalance(
    [...store.transactionsBetween(start, end)].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      const ta = safeNumber(timeFromISO(a.time || '00:00'));
      const tb = safeNumber(timeFromISO(b.time || '00:00'));
      return ta - tb;
    }),
  );
  const summary = store.summaryForTransactions(list);
  const household = store.data.settings.householdName || 'RISLY';
  const doc = new jsPDFCtor({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  /* ---------- Header ---------- */
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageWidth, 70, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('RISLY Money Manager', 40, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Laporan Keuangan ${start} s/d ${end} · ${household}`, 40, 52);
  doc.text(`Dibuat: ${formatDate(todayISO())}`, pageWidth - 40, 52, { align: 'right' });

  /* ---------- Summary boxes ---------- */
  const boxes = [
    { label: 'Pemasukan', value: pdfCurrency(summary.income), color: [22, 163, 74] },
    { label: 'Pengeluaran', value: pdfCurrency(summary.expense), color: [240, 68, 82] },
    { label: 'Arus Kas', value: pdfCurrency(summary.net), color: [37, 99, 235] },
    { label: 'Tingkat Tabungan', value: `${summary.savingsRate.toFixed(1)}%`, color: [124, 58, 237] },
    { label: 'Jumlah Transaksi', value: String(summary.count), color: [15, 23, 42] },
  ];
  const boxWidth = (pageWidth - 80 - 4 * 10) / 5;
  boxes.forEach((box, index) => {
    const x = 40 + index * (boxWidth + 10);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, 84, boxWidth, 48, 6, 6, 'F');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(box.label.toUpperCase(), x + 8, 98);
    doc.setFontSize(12);
    doc.setTextColor(...box.color);
    doc.setFont('helvetica', 'bold');
    doc.text(box.value, x + 8, 114);
    doc.setFont('helvetica', 'normal');
  });

  /* ---------- Transaction table ---------- */
  const tableStartY = 146;
  const colWidths = [25, 60, 40, 210, 150, 100, 100];
  const headers = ['No', 'Tanggal', 'Jenis', 'Keterangan', 'Akun', 'Nominal', 'Saldo'];
  const tableWidth = pageWidth - 80;

  doc.autoTable({
    startY: tableStartY,
    head: [headers],
    body: list.map((tx, i) => {
      // Nominal selalu punya tanda: + untuk pemasukan, - untuk pengeluaran dan transfer
      const nominalSign = tx.type === 'income' ? '+' : '-';
      const amountLabel = `${nominalSign}${pdfCurrency(tx.amount)}`;
      // Saldo bersih: hanya angka, tanpa tanda plus di depan (minus hanya jika negatif)
      return [
        String(i + 1),
        formatTxDate(tx.date),
        typeBadgeLabel(tx.type),
        tx.note || (tx.type === 'transfer' ? 'Transfer antar akun' : categoryLabel(tx)),
        accountPair(tx),
        amountLabel,
        pdfCurrency(tx.runningBalance),
      ];
    }),
    theme: 'striped',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 9,
      font: 'helvetica',
    },
    bodyStyles: {
      fontSize: 8.5,
      cellPadding: 5,
      font: 'helvetica',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: colWidths[0], halign: 'center' },
      1: { cellWidth: colWidths[1] },
      2: { cellWidth: colWidths[2], halign: 'center' },
      3: { cellWidth: colWidths[3], overflow: 'linebreak' },
      4: { cellWidth: colWidths[4] },
      5: { cellWidth: colWidths[5], halign: 'right' },
      6: { cellWidth: colWidths[6], halign: 'right' },
    },
    tableWidth,
    verticalLines: true,
    margin: { left: 40, right: 40, bottom: 40 },
    didDrawPage: (data) => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`RISLY Money Manager · ${household}`, 40, h - 18);
      doc.text(`Halaman ${data.pageNumber}`, pageWidth - 40, h - 18, { align: 'right' });
    },
  });

  if (!list.length) {
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139);
    doc.text('Belum ada transaksi pada periode ini.', 40, tableStartY + 20);
  }

  doc.save(`RISLY-laporan-${fileSafe(start)}_${fileSafe(end)}.pdf`);
  toast(`Laporan PDF ${start} s/d ${end} berhasil dibuat.`, 'success');
}

/* ------------------------------------------------------------------------ */
/*  Export modal                                                            */
/* ------------------------------------------------------------------------ */

export function openExportModal() {
  if (!ui.reportRangeStart) ui.reportRangeStart = `${ui.reportMonth || monthKey()}-01`;
  if (!ui.reportRangeEnd) {
    const m = ui.reportMonth || monthKey();
    const [y, mm] = m.split('-');
    const last = new Date(Number(y), Number(mm), 0).getDate();
    ui.reportRangeEnd = `${m}-${String(last).padStart(2, '0')}`;
  }
  openModal({
    size: 'md',
    className: 'form-modal',
    html: `<div class="modal-form">
      <header class="modal-header">
        <div>
          <p class="modal-kicker">Ekspor & cetak</p>
          <h2 class="modal-title">Laporan & data</h2>
        </div>
        <button type="button" class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('x')}</button>
      </header>
      <div class="modal-body">
        <div class="grid grid-cols-2 gap-2 items-end">
          <label class="field-label">Dari
            <input type="date" class="field field-compact" data-filter="report-range-start" value="${escapeAttr(ui.reportRangeStart)}">
          </label>
          <label class="field-label">Sampai
            <input type="date" class="field field-compact" data-filter="report-range-end" value="${escapeAttr(ui.reportRangeEnd)}">
          </label>
        </div>
        <div class="grid grid-cols-2 gap-2 mt-3">
          <button type="button" class="btn btn-success" data-action="export-xlsx-range">${icon('excel', 'w-4 h-4')} EXCEL</button>
          <button type="button" class="btn btn-danger" data-action="export-pdf-range">${icon('pdf', 'w-4 h-4')} PDF</button>
        </div>
      </div>
    </div>`
  });
}

/* ------------------------------------------------------------------------ */
/*  Time helper (inline to avoid extra import)                              */
/* ------------------------------------------------------------------------ */

function timeFromISO(timeString) {
  if (!timeString) return 0;
  const parts = String(timeString).split(':');
  if (parts.length < 2) return 0;
  return Number(parts[0]) * 60 + Number(parts[1]);
}
