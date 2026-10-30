/**
 * RISLY Money Manager — application constants
 * Keep this file free of DOM access so it can be imported anywhere.
 */

export const APP = Object.freeze({
  name: 'RISLY',
  fullName: 'RISLY Money Manager',
  tagline: 'Keuangan keluarga, rapi untuk berdua.',
  version: '1.0.0',
  schemaVersion: 3,
  storageKey: 'risly.mm.data.v3',
  backupKey: 'risly.mm.backup.v3',
  prefsKey: 'risly.mm.prefs.v1',
  cloudKey: 'risly.mm.cloud.v1',
  syncMetaKey: 'risly.mm.syncmeta.v1',
  sessionKey: 'risly.mm.session.v1',
  lockoutKey: 'risly.mm.lockout.v1',
  reminderKey: 'risly.mm.reminders.v1',
  clientKey: 'risly.mm.client.v1',
  householdId: 'risly-family',
  locale: 'id-ID',
  currency: 'IDR',
  defaultAutoLockMinutes: 15,
  syncPollMs: 20_000,
});

export const ROUTES = Object.freeze({
  dashboard: { label: 'Beranda', icon: 'home' },
  transactions: { label: 'Transaksi', icon: 'receipt' },
  calendar: { label: 'Kalender', icon: 'calendar' },
  notes: { label: 'Catatan', icon: 'sticky-note' },
  accounts: { label: 'Akun', icon: 'wallet' },
  budgets: { label: 'Anggaran', icon: 'chart-pie' },
  reports: { label: 'Laporan', icon: 'file-text' },
  recurring: { label: 'Berulang', icon: 'repeat' },
  categories: { label: 'Kategori', icon: 'tag' },
  settings: { label: 'Pengaturan', icon: 'settings' },
});

export const DESKTOP_NAV = [
  'dashboard',
  'transactions',
  'calendar',
  'notes',
  'accounts',
  'budgets',
  'reports',
  'recurring',
  'settings',
];

export const BOTTOM_NAV = ['dashboard', 'transactions', 'calendar', 'notes'];

export const MORE_NAV = [
  'accounts',
  'budgets',
  'reports',
  'recurring',
  'categories',
  'settings',
];

export const TX_TYPES = Object.freeze({
  expense: {
    label: 'Pengeluaran',
    short: 'Keluar',
    icon: 'arrow-up-right',
    color: '#F04452',
    tone: 'danger',
  },
  income: {
    label: 'Pemasukan',
    short: 'Masuk',
    icon: 'arrow-down-left',
    color: '#16A34A',
    tone: 'success',
  },
  transfer: {
    label: 'Transfer',
    short: 'Transfer',
    icon: 'arrow-left-right',
    color: '#3B82F6',
    tone: 'info',
  },
});

export const ACCOUNT_TYPES = Object.freeze({
  cash: { label: 'Uang Tunai', icon: 'wallet', color: '#F59E0B' },
  bank: { label: 'Rekening Bank', icon: 'landmark', color: '#3B82F6' },
  ewallet: { label: 'Dompet Digital', icon: 'smartphone', color: '#8B5CF6' },
  savings: { label: 'Tabungan', icon: 'piggy-bank', color: '#10B981' },
  investment: { label: 'Investasi', icon: 'trending-up', color: '#06B6D4' },
  credit: { label: 'Kartu Kredit', icon: 'credit-card', color: '#EF4444' },
});

export const NOTE_KINDS = Object.freeze({
  note: { label: 'Catatan', icon: 'sticky-note' },
  todo: { label: 'Tugas', icon: 'check-square' },
});

export const NOTE_STATUS = Object.freeze({
  active: 'Aktif',
  archived: 'Diarsipkan',
  trashed: 'Sampah',
});

export const NOTE_COLORS = Object.freeze({
  yellow: { label: 'Kuning', bg: '#FEF3C7', border: '#FDE68A', ink: '#78350F' },
  pink: { label: 'Merah muda', bg: '#FCE7F3', border: '#FBCFE8', ink: '#831843' },
  blue: { label: 'Biru', bg: '#DBEAFE', border: '#BFDBFE', ink: '#1E3A8A' },
  green: { label: 'Hijau', bg: '#DCFCE7', border: '#BBF7D0', ink: '#14532D' },
  purple: { label: 'Ungu', bg: '#EDE9FE', border: '#DDD6FE', ink: '#4C1D95' },
  orange: { label: 'Oranye', bg: '#FFEDD5', border: '#FED7AA', ink: '#7C2D12' },
  gray: { label: 'Abu-abu', bg: '#F1F5F9', border: '#E2E8F0', ink: '#1E293B' },
});

export const PRIORITIES = Object.freeze({
  low: { label: 'Rendah', color: '#64748B', order: 1 },
  normal: { label: 'Normal', color: '#3B82F6', order: 2 },
  high: { label: 'Tinggi', color: '#F59E0B', order: 3 },
  urgent: { label: 'Mendesak', color: '#EF4444', order: 4 },
});

export const FREQUENCIES = Object.freeze({
  daily: { label: 'Harian', adverb: 'hari' },
  weekly: { label: 'Mingguan', adverb: 'minggu' },
  monthly: { label: 'Bulanan', adverb: 'bulan' },
  yearly: { label: 'Tahunan', adverb: 'tahun' },
});

export const CLOUD_PROVIDERS = Object.freeze({
  local: {
    label: 'Perangkat ini saja',
    description: 'Data hanya tersimpan di browser. Sinkronisasi tidak aktif.',
    icon: 'device',
  },
  jsonbin: {
    label: 'JSONBin',
    description: 'Cepat dipasang, cocok untuk dua perangkat. Sinkronisasi polling.',
    icon: 'database',
  },
  supabase: {
    label: 'Supabase REST',
    description: 'Database Postgres + REST. Sinkronisasi polling.',
    icon: 'database',
  },
  firebase: {
    label: 'Firebase RTDB',
    description: 'Sinkronisasi real-time lewat Firebase Realtime Database.',
    icon: 'zap',
  },
});

export const DEFAULT_CATEGORY_COLORS = [
  '#F97316',
  '#EF4444',
  '#EC4899',
  '#8B5CF6',
  '#6366F1',
  '#3B82F6',
  '#06B6D4',
  '#10B981',
  '#84CC16',
  '#EAB308',
  '#64748B',
  '#0F172A',
];

export const ICON_CHOICES = [
  'utensils',
  'coffee',
  'car',
  'home',
  'shopping-bag',
  'heart',
  'book',
  'gamepad',
  'users',
  'receipt',
  'briefcase',
  'store',
  'trending-up',
  'gift',
  'sparkles',
  'piggy-bank',
  'wallet',
  'smartphone',
  'landmark',
  'tag',
  'plane',
  'paw',
  'baby',
  'dumbbell',
  'wifi',
  'zap',
  'shield',
  'more-horizontal',
];

export const THEME_OPTIONS = [
  { id: 'light', label: 'Terang', icon: 'sun' },
  { id: 'dark', label: 'Gelap', icon: 'moon' },
  { id: 'system', label: 'Sistem', icon: 'monitor' },
];

export const LOCK_OPTIONS = [
  { value: 0, label: 'Tidak pernah' },
  { value: 5, label: '5 menit' },
  { value: 10, label: '10 menit' },
  { value: 15, label: '15 menit' },
  { value: 30, label: '30 menit' },
  { value: 60, label: '1 jam' },
];

export const WEEK_OPTIONS = [
  { value: 1, label: 'Senin' },
  { value: 0, label: 'Minggu' },
];
