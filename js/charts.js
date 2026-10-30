import { store } from './store.js';
import { formatCompact, formatCurrency, formatMonthShort, isPrivacyHidden, monthKey } from './utils.js';

const charts = new Map();

function cssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

async function waitForChart(timeout = 6_000) {
  const start = Date.now();
  while (!window.Chart && Date.now() - start < timeout) {
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return window.Chart || null;
}

function destroyCanvas(canvasId) {
  if (charts.has(canvasId)) {
    try { charts.get(canvasId).destroy(); } catch { /* noop */ }
    charts.delete(canvasId);
  }
  if (window.Chart) {
    const existing = window.Chart.getChart(canvasId);
    if (existing) existing.destroy();
  }
}

export function destroyCharts() {
  [...charts.keys()].forEach(destroyCanvas);
}

const emptyTextPlugin = {
  id: 'rislyEmptyText',
  afterDraw(chart, args, options) {
    if (!options?.text) return;
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    ctx.save();
    ctx.fillStyle = options.color || '#94A3B8';
    ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(options.text, (chartArea.left + chartArea.right) / 2, (chartArea.top + chartArea.bottom) / 2);
    ctx.restore();
  },
};

const centerTextPlugin = {
  id: 'rislyCenterText',
  afterDraw(chart, args, options) {
    if (!options?.line1) return;
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    const x = (chartArea.left + chartArea.right) / 2;
    const y = (chartArea.top + chartArea.bottom) / 2;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = options.color || '#0F172A';
    ctx.font = '700 15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(options.line1, x, y - 7);
    ctx.fillStyle = options.subColor || '#94A3B8';
    ctx.font = '600 9px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(options.line2 || '', x, y + 12);
    ctx.restore();
  },
};

function baseOptions(dark) {
  const text = dark ? '#CBD5E1' : '#475569';
  const grid = dark ? 'rgba(148, 163, 184, .14)' : 'rgba(148, 163, 184, .18)';
  return { text, grid };
}

async function renderDonut(month) {
  const canvas = document.getElementById('expense-donut');
  if (!canvas) return;
  const Chart = await waitForChart();
  if (!Chart) return;
  if (charts.has('expense-donut')) destroyCanvas('expense-donut');

  const dark = document.documentElement.classList.contains('dark');
  const palette = baseOptions(dark);
  const spending = store.expenseByCategory(month);
  const total = spending.reduce((acc, item) => acc + item.total, 0);
  const labels = spending.map((item) => item.name);
  const values = spending.map((item) => item.total);
  const background = spending.map((item) => item.color);
  const empty = !spending.length;

  Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
  Chart.defaults.color = palette.text;

  const chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: empty ? ['Belum ada data'] : labels,
      datasets: [{
        data: empty ? [1] : values,
        backgroundColor: empty ? [dark ? '#1E293B' : '#E2E8F0'] : background,
        borderColor: dark ? '#0B1220' : '#FFFFFF',
        borderWidth: 3,
        hoverOffset: empty ? 0 : 5,
        spacing: 1,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      animation: { duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 550 },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: !empty,
          backgroundColor: dark ? '#111C31' : '#0F172A',
          padding: 10,
          cornerRadius: 10,
          callbacks: {
            label(context) {
              const value = context.raw || 0;
              const percent = total > 0 ? (value / total) * 100 : 0;
              return ` ${formatCurrency(value)} · ${percent.toFixed(1)}%`;
            },
          },
        },
        rislyCenterText: empty ? {} : {
          line1: formatCurrency(total, { compact: total >= 10_000_000 }),
          line2: 'PENGELUARAN',
          color: palette.text,
          subColor: dark ? '#64748B' : '#94A3B8',
        },
        rislyEmptyText: empty ? { text: 'Belum ada pengeluaran', color: dark ? '#64748B' : '#94A3B8' } : {},
      },
    },
    plugins: [centerTextPlugin, emptyTextPlugin],
  });
  charts.set('expense-donut', chart);
}

async function renderCashflow() {
  const canvas = document.getElementById('cashflow-bars');
  if (!canvas) return;
  const Chart = await waitForChart();
  if (!Chart) return;
  if (charts.has('cashflow-bars')) destroyCanvas('cashflow-bars');

  const dark = document.documentElement.classList.contains('dark');
  const palette = baseOptions(dark);
  const trend = store.monthlyTrend(6, monthKey());
  const labels = trend.map((item) => formatMonthShort(item.month));
  const isEmpty = trend.every((item) => !item.income && !item.expense);

  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Pemasukan',
          data: trend.map((item) => item.income),
          backgroundColor: dark ? 'rgba(52, 211, 153, .78)' : 'rgba(22, 163, 74, .82)',
          borderRadius: 7,
          borderSkipped: false,
          maxBarThickness: 22,
        },
        {
          label: 'Pengeluaran',
          data: trend.map((item) => item.expense),
          backgroundColor: dark ? 'rgba(248, 113, 113, .76)' : 'rgba(240, 68, 82, .78)',
          borderRadius: 7,
          borderSkipped: false,
          maxBarThickness: 22,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            boxWidth: 8,
            boxHeight: 8,
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 14,
            color: palette.text,
            font: { size: 10, weight: '600' },
          },
        },
        tooltip: {
          backgroundColor: dark ? '#111C31' : '#0F172A',
          padding: 10,
          cornerRadius: 10,
          callbacks: {
            label(context) {
              return ` ${context.dataset.label}: ${formatCurrency(context.raw)}`;
            },
          },
        },
        rislyEmptyText: isEmpty ? { text: 'Belum ada arus kas', color: dark ? '#64748B' : '#94A3B8' } : {},
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: palette.text, font: { size: 10, weight: '600' } },
        },
        y: {
          beginAtZero: true,
          grid: { color: palette.grid, drawTicks: false },
          border: { display: false },
          ticks: {
            color: palette.text,
            font: { size: 9 },
            maxTicksLimit: 5,
            callback(value) {
              if (isPrivacyHidden()) return '•••';
              return formatCompact(value).replace('Rp ', '');
            },
          },
        },
      },
    },
    plugins: [emptyTextPlugin],
  });
  charts.set('cashflow-bars', chart);
}

export async function renderDashboardCharts(month = monthKey()) {
  await Promise.allSettled([renderDonut(month), renderCashflow()]);
}

export function resizeCharts() {
  charts.forEach((chart) => chart.resize());
}
