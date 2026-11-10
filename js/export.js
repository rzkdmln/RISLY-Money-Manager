/**
 * RISLY Money Manager — Excel & PDF export
 *
 * Handles spreadsheet and PDF report generation for transactions.
 */

/* Imports */
import { store } from './store.js';
import { openModal, toast, ui } from './ui.js';
import { icon } from './icons.js';
import { typeLabel } from './import.js';
import {
  escapeAttr,
  fileSafe,
  formatCurrency,
  formatDate,
  formatMonth,
  monthKey,
  todayISO,
} from './utils.js';

/* ------------------------------------------------------------------------ */
/*  Label helpers                                                           */
/* ------------------------------------------------------------------------ */

function accountPair(tx) {
  if (tx.type === 'transfer') {
    return `${store.accountName(tx.accountId)} → ${store.accountName(tx.toAccountId)}`;
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
  const rows = list.map((tx) => ({
    tanggal: tx.date,
    jenis: typeLabel(tx.type),
    nominal: Number(tx.amount) || 0,
    akun: accountPair(tx),
    kategori: categoryLabel(tx),
    pencatat: tx.createdByName || store.getUser(tx.createdBy)?.name || '—',
    catatan: tx.note || '',
  }));
  const worksheet = window.XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 15 }, { wch: 28 }, { wch: 26 }, { wch: 14 }, { wch: 40 },
  ];
  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, worksheet, month ? `Transaksi ${month}`.slice(0, 31) : 'Semua transaksi');
  const suffix = month || 'semua';
  window.XLSX.writeFile(workbook, `RISLY-transaksi-${fileSafe(suffix)}.xlsx`);
  toast(`${list.length} transaksi berhasil diekspor ke Excel.`, 'success');
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
  const rows = list.map((tx) => ({
    tanggal: tx.date,
    jenis: typeLabel(tx.type),
    nominal: Number(tx.amount) || 0,
    akun: accountPair(tx),
    kategori: categoryLabel(tx),
    pencatat: tx.createdByName || store.getUser(tx.createdBy)?.name || '—',
    catatan: tx.note || '',
  }));
  const worksheet = window.XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 15 }, { wch: 28 }, { wch: 26 }, { wch: 14 }, { wch: 40 },
  ];
  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Transaksi rentang');
  const suffix = `${start}_${end}`;
  window.XLSX.writeFile(workbook, `RISLY-transaksi-${fileSafe(suffix)}.xlsx`);
  toast(`${list.length} transaksi berhasil diekspor ke Excel.`, 'success');
}

/* ------------------------------------------------------------------------ */
/*  PDF helpers                                                             */
/* ------------------------------------------------------------------------ */

function pdfCurrency(value) {
  return formatCurrency(value, { hide: false }).replace('Rp', 'Rp ');
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
  const doc = new jsPDFCtor({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const summary = store.monthSummary(month);
  const categories = store.expenseByCategory(month);
  const list = store.transactionsForMonth(month);
  const household = store.data.settings.householdName || 'Risly';
  const categoryTotal = categories.reduce((total, item) => total + item.total, 0);
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageWidth, 78, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('RISLY Money Manager', 40, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Laporan keuangan ${formatMonth(month)} · ${household}`, 40, 54);
  doc.text(`Dibuat ${formatDate(todayISO())}`, pageWidth - 40, 54, { align: 'right' });

  doc.setTextColor(15, 23, 42);
  const boxes = [
    { label: 'Pemasukan', value: summary.income, color: [22, 163, 74] },
    { label: 'Pengeluaran', value: summary.expense, color: [240, 68, 82] },
    { label: 'Arus kas', value: summary.net, color: [37, 99, 235] },
    { label: 'Tingkat tabungan', value: `${Math.round(summary.savingsRate)}%`, color: [124, 58, 237] },
  ];
  const boxWidth = (pageWidth - 80 - 3 * 12) / 4;
  boxes.forEach((box, index) => {
    const x = 40 + index * (boxWidth + 12);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, 94, boxWidth, 54, 7, 7, 'F');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(box.label.toUpperCase(), x + 12, 111);
    doc.setFontSize(13);
    doc.setTextColor(...box.color);
    doc.setFont('helvetica', 'bold');
    doc.text(typeof box.value === 'number' ? pdfCurrency(box.value) : box.value, x + 12, 132);
    doc.setFont('helvetica', 'normal');
  });

  if (categories.length) {
    doc.autoTable({
      startY: 166,
      head: [['Kategori pengeluaran', 'Total', 'Porsi']],
      body: categories.map((item) => [
        item.name,
        pdfCurrency(item.total),
        `${categoryTotal ? ((item.total / categoryTotal) * 100).toFixed(1) : '0'}%`,
      ]),
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 40, right: 40 },
      tableWidth: 'wrap',
    });
  }

  doc.autoTable({
    startY: categories.length ? doc.lastAutoTable.finalY + 16 : 166,
    head: [['Tanggal', 'Jenis', 'Keterangan', 'Akun', 'Kategori', 'Nominal', 'Pencatat']],
    body: list.map((tx) => [
      tx.date,
      typeLabel(tx.type),
      tx.note || (tx.type === 'transfer' ? 'Transfer antar akun' : categoryLabel(tx)),
      accountPair(tx),
      categoryLabel(tx),
      `${tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}${pdfCurrency(tx.amount)}`,
      tx.createdByName || '—',
    ]),
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], fontSize: 8 },
    bodyStyles: { fontSize: 7.5, cellPadding: 5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 58 },
      1: { cellWidth: 64 },
      2: { cellWidth: 170 },
      3: { cellWidth: 104 },
      4: { cellWidth: 104 },
      5: { halign: 'right', cellWidth: 82 },
      6: { cellWidth: 60 },
    },
    margin: { left: 40, right: 40, bottom: 38 },
    didDrawPage: (data) => {
      const height = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`RISLY Money Manager · ${household}`, 40, height - 18);
      doc.text(`Halaman ${data.pageNumber}`, pageWidth - 40, height - 18, { align: 'right' });
    },
  });

  if (!list.length) {
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139);
    doc.text('Belum ada transaksi pada bulan ini.', 40, (doc.lastAutoTable?.finalY || 170) + 26);
  }

  doc.save(`RISLY-laporan-${fileSafe(month)}.pdf`);
  toast('Laporan PDF berhasil dibuat.', 'success');
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
  const list = store.transactionsBetween(start, end);
  if (!list.length) {
    toast('Tidak ada transaksi pada rentang tersebut.', 'info');
    return;
  }
  const summary = store.summaryForTransactions(list);
  const household = store.data.settings.householdName || 'Risly';
  const doc = new jsPDFCtor({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageWidth, 78, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('RISLY Money Manager', 40, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Laporan keuangan ${start} s/d ${end} · ${household}`, 40, 54);
  doc.text(`Dibuat ${formatDate(todayISO())}`, pageWidth - 40, 54, { align: 'right' });

  doc.setTextColor(15, 23, 42);
  const boxes = [
    { label: 'Pemasukan', value: summary.income, color: [22, 163, 74] },
    { label: 'Pengeluaran', value: summary.expense, color: [240, 68, 82] },
    { label: 'Arus kas', value: summary.net, color: [37, 99, 235] },
    { label: 'Transaksi', value: String(list.length), color: [124, 58, 237] },
  ];
  const boxWidth = (pageWidth - 80 - 3 * 12) / 4;
  boxes.forEach((box, index) => {
    const x = 40 + index * (boxWidth + 12);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, 94, boxWidth, 54, 7, 7, 'F');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(box.label.toUpperCase(), x + 12, 111);
    doc.setFontSize(13);
    doc.setTextColor(...box.color);
    doc.setFont('helvetica', 'bold');
    doc.text(typeof box.value === 'number' ? pdfCurrency(box.value) : box.value, x + 12, 132);
    doc.setFont('helvetica', 'normal');
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  const headerY = 170;
  doc.text('Tanggal', 40, headerY);
  doc.text('Keterangan', 110, headerY);
  doc.text('Akun', 320, headerY);
  doc.text('Nominal', pageWidth - 40, headerY, { align: 'right' });
  doc.setDrawColor(226, 232, 240);
  doc.line(40, headerY + 6, pageWidth - 40, headerY + 6);

  let y = headerY + 20;
  list.slice(0, 40).forEach((tx) => {
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = 40;
    }
    doc.setTextColor(15, 23, 42);
    doc.text(formatDate(tx.date, { day: '2-digit', month: 'short', year: '2-digit' }), 40, y);
    const label = tx.note || store.categoryById(tx.categoryId)?.name || (tx.type === 'transfer' ? 'Transfer' : 'Transaksi');
    doc.text(String(label).slice(0, 46), 110, y);
    doc.text(String(store.accountName(tx.accountId)).slice(0, 26), 320, y);
    const amount = `${tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}${pdfCurrency(tx.amount)}`;
    doc.text(amount, pageWidth - 40, y, { align: 'right' });
    y += 14;
  });

  if (list.length > 40) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`... dan ${list.length - 40} transaksi lainnya.`, 40, y + 6);
  }

  doc.save(`RISLY-laporan-${fileSafe(start)}_${fileSafe(end)}.pdf`);
  toast('Laporan PDF rentang berhasil dibuat.', 'success');
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
