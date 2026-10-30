import { APP } from './config.js';
import {
  addDaysISO,
  addMonthsISO,
  deepClone,
  localDateISO,
  monthKey,
  nowISO,
  shiftMonthKey,
  todayISO,
  uid,
} from './utils.js';

const SEED_DATE = '2025-01-01T00:00:00.000Z';

function category(id, type, name, icon, color, subcategories) {
  return {
    id,
    type,
    name,
    icon,
    color,
    subcategories: subcategories.map(([subId, subName]) => ({
      id: subId,
      name: subName,
      updatedAt: SEED_DATE,
    })),
    createdAt: SEED_DATE,
    updatedAt: SEED_DATE,
  };
}

export function defaultCategories() {
  return [
    category('cat-exp-food', 'expense', 'Makanan & Minuman', 'utensils', '#F97316', [
      ['sub-food-grocery', 'Belanja Harian'],
      ['sub-food-dining', 'Makan di Luar'],
      ['sub-food-coffee', 'Kopi & Jajan'],
      ['sub-food-catering', 'Katering'],
    ]),
    category('cat-exp-transport', 'expense', 'Transportasi', 'car', '#3B82F6', [
      ['sub-transport-fuel', 'Bensin'],
      ['sub-transport-public', 'Transportasi Umum'],
      ['sub-transport-parking', 'Parkir & Tol'],
      ['sub-transport-service', 'Servis Kendaraan'],
    ]),
    category('cat-exp-home', 'expense', 'Rumah Tangga', 'home', '#8B5CF6', [
      ['sub-home-utility', 'Listrik & Air'],
      ['sub-home-internet', 'Internet'],
      ['sub-home-maintenance', 'Perawatan'],
      ['sub-home-furniture', 'Perabotan'],
    ]),
    category('cat-exp-shopping', 'expense', 'Belanja', 'shopping-bag', '#EC4899', [
      ['sub-shop-clothes', 'Pakaian'],
      ['sub-shop-electronics', 'Elektronik'],
      ['sub-shop-household', 'Kebutuhan Rumah'],
      ['sub-shop-other', 'Lainnya'],
    ]),
    category('cat-exp-health', 'expense', 'Kesehatan', 'heart', '#EF4444', [
      ['sub-health-medicine', 'Obat'],
      ['sub-health-doctor', 'Dokter'],
      ['sub-health-insurance', 'Asuransi'],
      ['sub-health-fitness', 'Olahraga'],
    ]),
    category('cat-exp-education', 'expense', 'Pendidikan', 'book', '#6366F1', [
      ['sub-edu-school', 'Sekolah'],
      ['sub-edu-course', 'Kursus'],
      ['sub-edu-books', 'Buku'],
    ]),
    category('cat-exp-fun', 'expense', 'Hiburan', 'gamepad', '#06B6D4', [
      ['sub-fun-subscription', 'Langganan'],
      ['sub-fun-movie', 'Film'],
      ['sub-fun-holiday', 'Liburan'],
      ['sub-fun-hobby', 'Hobi'],
    ]),
    category('cat-exp-family', 'expense', 'Keluarga & Anak', 'users', '#10B981', [
      ['sub-family-kids', 'Kebutuhan Anak'],
      ['sub-family-gift', 'Hadiah'],
      ['sub-family-donation', 'Donasi'],
    ]),
    category('cat-exp-bills', 'expense', 'Tagihan & Cicilan', 'receipt', '#64748B', [
      ['sub-bills-credit', 'Kartu Kredit'],
      ['sub-bills-loan', 'Pinjaman'],
      ['sub-bills-tax', 'Pajak'],
      ['sub-bills-other', 'Lainnya'],
    ]),
    category('cat-exp-other', 'expense', 'Lainnya', 'more-horizontal', '#94A3B8', [
      ['sub-other-misc', 'Tak Terduga'],
    ]),
    category('cat-inc-salary', 'income', 'Gaji', 'briefcase', '#16A34A', [
      ['sub-salary-rizki', 'Gaji Rizki'],
      ['sub-salary-shelly', 'Gaji Shelly'],
      ['sub-salary-bonus', 'Bonus'],
      ['sub-salary-thr', 'THR'],
    ]),
    category('cat-inc-business', 'income', 'Bisnis', 'store', '#0EA5E9', [
      ['sub-business-sales', 'Penjualan'],
      ['sub-business-service', 'Jasa'],
      ['sub-business-commission', 'Komisi'],
    ]),
    category('cat-inc-invest', 'income', 'Investasi', 'trending-up', '#8B5CF6', [
      ['sub-invest-dividend', 'Dividen'],
      ['sub-invest-interest', 'Bunga'],
      ['sub-invest-gain', 'Capital Gain'],
    ]),
    category('cat-inc-gift', 'income', 'Hadiah & Lainnya', 'gift', '#F59E0B', [
      ['sub-gift-gift', 'Hadiah'],
      ['sub-gift-cashback', 'Cashback'],
      ['sub-gift-reimburse', 'Reimburse'],
      ['sub-gift-other', 'Lainnya'],
    ]),
  ];
}

export function defaultAccounts() {
  return [
    {
      id: 'acc-cash',
      name: 'Dompet Tunai',
      type: 'cash',
      color: '#F59E0B',
      openingBalance: 0,
      archived: false,
      createdAt: SEED_DATE,
      updatedAt: SEED_DATE,
    },
    {
      id: 'acc-bca',
      name: 'BCA',
      type: 'bank',
      color: '#3B82F6',
      openingBalance: 0,
      archived: false,
      createdAt: SEED_DATE,
      updatedAt: SEED_DATE,
    },
    {
      id: 'acc-ewallet',
      name: 'Dompet Digital',
      type: 'ewallet',
      color: '#8B5CF6',
      openingBalance: 0,
      archived: false,
      createdAt: SEED_DATE,
      updatedAt: SEED_DATE,
    },
    {
      id: 'acc-savings',
      name: 'Tabungan Bersama',
      type: 'savings',
      color: '#10B981',
      openingBalance: 0,
      archived: false,
      createdAt: SEED_DATE,
      updatedAt: SEED_DATE,
    },
  ];
}

export function defaultUsers() {
  return [
    {
      id: 'rizki',
      name: 'Rizki',
      color: '#2563EB',
      initials: 'R',
      pinHash: '',
      pinSalt: '',
      pinIterations: 0,
      createdAt: SEED_DATE,
      updatedAt: SEED_DATE,
    },
    {
      id: 'shelly',
      name: 'Shelly',
      color: '#DB2777',
      initials: 'S',
      pinHash: '',
      pinSalt: '',
      pinIterations: 0,
      createdAt: SEED_DATE,
      updatedAt: SEED_DATE,
    },
  ];
}

export function createDefaultData() {
  const now = nowISO();
  return {
    app: 'risly-money-manager',
    schemaVersion: APP.schemaVersion,
    revision: 1,
    updatedAt: now,
    updatedBy: null,
    settings: {
      householdName: 'Rizki & Shelly',
      currency: 'IDR',
      locale: 'id-ID',
      defaultMonthlyBudget: 0,
      budgetWarning: 75,
      budgetDanger: 90,
      weekStartsOn: 1,
      autoLockMinutes: APP.defaultAutoLockMinutes,
      updatedAt: now,
    },
    users: defaultUsers(),
    accounts: defaultAccounts(),
    categories: defaultCategories(),
    transactions: [],
    budgets: [],
    recurring: [],
    notes: [],
  };
}

function pickDefined(target, source) {
  Object.keys(source).forEach((key) => {
    if (target[key] === undefined) target[key] = source[key];
  });
}

/** Fill missing fields while preserving every user-created record. */
export function migrateData(raw) {
  if (!raw || typeof raw !== 'object') return createDefaultData();
  const defaults = createDefaultData();
  const data = deepClone(raw);

  data.app = 'risly-money-manager';
  data.schemaVersion = APP.schemaVersion;
  data.revision = Math.max(1, Number(data.revision) || 1);
  data.updatedAt = data.updatedAt || defaults.updatedAt;
  data.updatedBy = data.updatedBy || null;

  const settings = { ...defaults.settings, ...(data.settings || {}) };
  settings.householdName = String(settings.householdName || defaults.settings.householdName);
  settings.currency = 'IDR';
  settings.locale = 'id-ID';
  settings.defaultMonthlyBudget = Math.max(0, Number(settings.defaultMonthlyBudget) || 0);
  settings.budgetWarning = Math.min(99, Math.max(1, Number(settings.budgetWarning) || 75));
  settings.budgetDanger = Math.min(100, Math.max(settings.budgetWarning + 1, Number(settings.budgetDanger) || 90));
  settings.weekStartsOn = Number(settings.weekStartsOn) === 0 ? 0 : 1;
  settings.autoLockMinutes = Math.max(0, Number(settings.autoLockMinutes) || 0);
  settings.updatedAt = settings.updatedAt || data.updatedAt;
  data.settings = settings;

  const existingUsers = Array.isArray(data.users) ? data.users : [];
  data.users = defaults.users.map((base) => {
    const found = existingUsers.find((user) => user?.id === base.id);
    if (!found) return base;
    return {
      ...base,
      ...found,
      id: base.id,
      name: String(found.name || base.name),
      initials: String(found.initials || found.name?.[0] || base.initials),
      updatedAt: found.updatedAt || base.updatedAt,
      createdAt: found.createdAt || base.createdAt,
    };
  });

  data.accounts = Array.isArray(data.accounts) ? data.accounts : defaultAccounts();
  data.accounts = data.accounts.map((account) => ({
    id: account.id || uid('acc'),
    name: String(account.name || 'Akun'),
    type: account.type || 'cash',
    color: account.color || '#3B82F6',
    openingBalance: Number(account.openingBalance) || 0,
    archived: Boolean(account.archived),
    createdAt: account.createdAt || data.updatedAt,
    updatedAt: account.updatedAt || data.updatedAt,
    ...(account.deletedAt ? { deletedAt: account.deletedAt } : {}),
  }));

  data.categories = Array.isArray(data.categories) && data.categories.length
    ? data.categories
    : defaultCategories();
  data.categories = data.categories.map((cat) => ({
    id: cat.id || uid('cat'),
    type: cat.type === 'income' ? 'income' : 'expense',
    name: String(cat.name || 'Kategori'),
    icon: cat.icon || 'tag',
    color: cat.color || '#64748B',
    subcategories: Array.isArray(cat.subcategories)
      ? cat.subcategories.map((sub) => ({
        id: sub.id || uid('sub'),
        name: String(sub.name || 'Subkategori'),
        updatedAt: sub.updatedAt || cat.updatedAt || data.updatedAt,
        ...(sub.deletedAt ? { deletedAt: sub.deletedAt } : {}),
      }))
      : [],
    createdAt: cat.createdAt || data.updatedAt,
    updatedAt: cat.updatedAt || data.updatedAt,
    ...(cat.deletedAt ? { deletedAt: cat.deletedAt } : {}),
  }));

  data.transactions = Array.isArray(data.transactions) ? data.transactions : [];
  data.transactions = data.transactions.map((tx) => ({
    id: tx.id || uid('tx'),
    date: tx.date || todayISO(),
    type: ['income', 'expense', 'transfer'].includes(tx.type) ? tx.type : 'expense',
    amount: Math.max(0, Number(tx.amount) || 0),
    accountId: tx.accountId || null,
    toAccountId: tx.toAccountId || null,
    categoryId: tx.categoryId || null,
    subcategoryId: tx.subcategoryId || null,
    note: String(tx.note || ''),
    createdBy: tx.createdBy || 'rizki',
    createdByName: tx.createdByName || (tx.createdBy === 'shelly' ? 'Shelly' : 'Rizki'),
    createdAt: tx.createdAt || data.updatedAt,
    updatedAt: tx.updatedAt || data.updatedAt,
    updatedBy: tx.updatedBy || tx.createdBy || null,
    recurringId: tx.recurringId || null,
    autoGenerated: Boolean(tx.autoGenerated),
    ...(tx.deletedAt ? { deletedAt: tx.deletedAt } : {}),
  }));

  data.budgets = Array.isArray(data.budgets) ? data.budgets : [];
  data.budgets = data.budgets.map((budget) => ({
    id: budget.id || uid('budget'),
    month: budget.month || monthKey(),
    categoryId: budget.categoryId || '__total__',
    amount: Math.max(0, Number(budget.amount) || 0),
    createdAt: budget.createdAt || data.updatedAt,
    updatedAt: budget.updatedAt || data.updatedAt,
    ...(budget.deletedAt ? { deletedAt: budget.deletedAt } : {}),
  }));

  data.recurring = Array.isArray(data.recurring) ? data.recurring : [];
  data.recurring = data.recurring.map((rule) => ({
    id: rule.id || uid('rec'),
    title: String(rule.title || 'Transaksi berulang'),
    type: ['income', 'expense', 'transfer'].includes(rule.type) ? rule.type : 'expense',
    amount: Math.max(0, Number(rule.amount) || 0),
    accountId: rule.accountId || null,
    toAccountId: rule.toAccountId || null,
    categoryId: rule.categoryId || null,
    subcategoryId: rule.subcategoryId || null,
    note: String(rule.note || ''),
    frequency: ['daily', 'weekly', 'monthly', 'yearly'].includes(rule.frequency) ? rule.frequency : 'monthly',
    interval: Math.max(1, Number(rule.interval) || 1),
    anchorDay: Number(rule.anchorDay) || Number(String(rule.nextDate || rule.startDate || todayISO()).slice(8, 10)) || 1,
    nextDate: rule.nextDate || rule.startDate || todayISO(),
    startDate: rule.startDate || rule.nextDate || todayISO(),
    endDate: rule.endDate || null,
    autoPost: rule.autoPost !== false,
    active: rule.active !== false,
    lastRunDate: rule.lastRunDate || null,
    createdBy: rule.createdBy || 'rizki',
    createdByName: rule.createdByName || (rule.createdBy === 'shelly' ? 'Shelly' : 'Rizki'),
    createdAt: rule.createdAt || data.updatedAt,
    updatedAt: rule.updatedAt || data.updatedAt,
    ...(rule.deletedAt ? { deletedAt: rule.deletedAt } : {}),
  }));

  data.notes = Array.isArray(data.notes) ? data.notes : [];
  data.notes = data.notes.map((note) => ({
    id: note.id || uid('note'),
    kind: note.kind === 'todo' ? 'todo' : 'note',
    title: String(note.title || 'Tanpa judul'),
    content: String(note.content || ''),
    color: note.color || 'yellow',
    pinned: Boolean(note.pinned),
    favorite: Boolean(note.favorite),
    tags: Array.isArray(note.tags) ? note.tags.map(String).filter(Boolean).slice(0, 20) : [],
    items: Array.isArray(note.items)
      ? note.items.map((item) => ({
        id: item.id || uid('item'),
        text: String(item.text || ''),
        done: Boolean(item.done),
      }))
      : [],
    done: Boolean(note.done),
    dueDate: note.dueDate || null,
    reminderAt: note.reminderAt || null,
    lastNotifiedAt: note.lastNotifiedAt || null,
    priority: ['low', 'normal', 'high', 'urgent'].includes(note.priority) ? note.priority : 'normal',
    status: ['active', 'archived', 'trashed'].includes(note.status) ? note.status : 'active',
    order: Number(note.order) || 0,
    createdBy: note.createdBy || 'rizki',
    createdByName: note.createdByName || (note.createdBy === 'shelly' ? 'Shelly' : 'Rizki'),
    createdAt: note.createdAt || data.updatedAt,
    updatedAt: note.updatedAt || data.updatedAt,
    completedAt: note.completedAt || null,
    ...(note.deletedAt ? { deletedAt: note.deletedAt } : {}),
  }));

  return data;
}

export function createSampleData(base, actor = {}) {
  const data = deepClone(base);
  const now = nowISO();
  const by = actor.id || 'rizki';
  const byName = actor.name || 'Rizki';
  const accounts = data.accounts.filter((account) => !account.archived && !account.deletedAt);
  const cash = accounts.find((a) => a.type === 'cash') || accounts[0];
  const bank = accounts.find((a) => a.type === 'bank') || accounts[1] || cash;
  const wallet = accounts.find((a) => a.type === 'ewallet') || accounts[2] || bank;
  const savings = accounts.find((a) => a.type === 'savings') || accounts[3] || bank;

  const exp = (id) => data.categories.find((c) => c.id === id);
  const inc = (id) => data.categories.find((c) => c.id === id);
  const tx = (date, type, amount, accountId, categoryId, subcategoryId, note, extra = {}) => ({
    id: uid('demo_tx'),
    date,
    type,
    amount,
    accountId,
    toAccountId: extra.toAccountId || null,
    categoryId,
    subcategoryId,
    note,
    createdBy: by,
    createdByName: byName,
    createdAt: `${date}T09:00:00.000Z`,
    updatedAt: `${date}T09:00:00.000Z`,
    updatedBy: by,
    recurringId: null,
    autoGenerated: false,
  });

  const current = monthKey();
  const txList = [];

  // A realistic six-month family cash-flow story.
  for (let offset = 5; offset >= 0; offset -= 1) {
    const key = shiftMonthKey(current, -offset);
    const baseDate = `${key}-01`;
    const incomeDate = offset === 0 ? `${key}-25` : `${key}-25`;
    txList.push(tx(incomeDate, 'income', 8_500_000, bank.id, 'cat-inc-salary', 'sub-salary-rizki', 'Gaji bulanan Rizki'));
    txList.push(tx(incomeDate, 'income', 5_750_000, bank.id, 'cat-inc-salary', 'sub-salary-shelly', 'Gaji bulanan Shelly'));
    txList.push(tx(`${key}-03`, 'expense', 1_850_000, bank.id, 'cat-exp-home', 'sub-home-utility', 'Listrik, air, dan internet'));
    txList.push(tx(`${key}-05`, 'expense', 1_450_000, bank.id, 'cat-exp-food', 'sub-food-grocery', 'Belanja bulanan'));
    txList.push(tx(`${key}-08`, 'expense', 650_000, cash.id, 'cat-exp-transport', 'sub-transport-fuel', 'Bensin mobil'));
    txList.push(tx(`${key}-11`, 'expense', 425_000, wallet.id, 'cat-exp-food', 'sub-food-dining', 'Makan keluarga akhir pekan'));
    txList.push(tx(`${key}-14`, 'transfer', 1_000_000, bank.id, null, null, 'Tabungan rutin', { toAccountId: savings.id }));
    txList.push(tx(`${key}-17`, 'expense', 325_000, wallet.id, 'cat-exp-fun', 'sub-fun-subscription', 'Langganan hiburan'));
    txList.push(tx(`${key}-20`, 'expense', 780_000, bank.id, 'cat-exp-family', 'sub-family-kids', 'Kebutuhan anak'));
    if (offset % 2 === 0) {
      txList.push(tx(`${key}-22`, 'income', 750_000, bank.id, 'cat-inc-business', 'sub-business-commission', 'Komisi proyek'));
      txList.push(tx(`${key}-23`, 'expense', 540_000, bank.id, 'cat-exp-health', 'sub-health-medicine', 'Vitamin dan obat'));
    }
    if (offset === 0) {
      txList.push(tx(`${key}-02`, 'expense', 120_000, cash.id, 'cat-exp-food', 'sub-food-coffee', 'Kopi dan camilan'));
      txList.push(tx(`${key}-06`, 'expense', 95_000, wallet.id, 'cat-exp-transport', 'sub-transport-parking', 'Parkir dan tol'));
      txList.push(tx(`${key}-09`, 'expense', 250_000, wallet.id, 'cat-exp-shopping', 'sub-shop-household', 'Perlengkapan rumah'));
      txList.push(tx(`${key}-12`, 'income', 350_000, bank.id, 'cat-inc-gift', 'sub-gift-cashback', 'Cashback kartu'));
    }
  }

  data.transactions = [...data.transactions.filter((t) => t.deletedAt), ...txList];
  data.budgets = data.budgets.filter((b) => b.deletedAt);
  const currentBudget = 12_000_000;
  data.budgets.push({
    id: uid('demo_budget'),
    month: current,
    categoryId: '__total__',
    amount: currentBudget,
    createdAt: now,
    updatedAt: now,
  });
  [
    ['cat-exp-food', 3_200_000],
    ['cat-exp-home', 2_000_000],
    ['cat-exp-transport', 1_000_000],
    ['cat-exp-fun', 800_000],
    ['cat-exp-family', 1_200_000],
  ].forEach(([categoryId, amount]) => {
    data.budgets.push({
      id: uid('demo_budget'),
      month: current,
      categoryId,
      amount,
      createdAt: now,
      updatedAt: now,
    });
  });

  data.recurring = data.recurring.filter((r) => r.deletedAt);
  data.recurring.push({
    id: uid('demo_rec'),
    title: 'Listrik, air & internet',
    type: 'expense',
    amount: 1_850_000,
    accountId: bank.id,
    toAccountId: null,
    categoryId: 'cat-exp-home',
    subcategoryId: 'sub-home-utility',
    note: 'Tagihan bulanan rumah',
    frequency: 'monthly',
    interval: 1,
    anchorDay: 3,
    nextDate: `${shiftMonthKey(current, 1)}-03`,
    startDate: `${shiftMonthKey(current, 1)}-03`,
    endDate: null,
    autoPost: true,
    active: true,
    lastRunDate: null,
    createdBy: by,
    createdByName: byName,
    createdAt: now,
    updatedAt: now,
  });
  data.recurring.push({
    id: uid('demo_rec'),
    title: 'Tabungan rutin',
    type: 'transfer',
    amount: 1_000_000,
    accountId: bank.id,
    toAccountId: savings.id,
    categoryId: null,
    subcategoryId: null,
    note: 'Transfer otomatis ke tabungan bersama',
    frequency: 'monthly',
    interval: 1,
    anchorDay: 14,
    nextDate: `${shiftMonthKey(current, 1)}-14`,
    startDate: `${shiftMonthKey(current, 1)}-14`,
    endDate: null,
    autoPost: true,
    active: true,
    lastRunDate: null,
    createdBy: by,
    createdByName: byName,
    createdAt: now,
    updatedAt: now,
  });

  data.notes = data.notes.filter((n) => n.deletedAt);
  data.notes.push(
    {
      id: uid('demo_note'),
      kind: 'note',
      title: 'Rencana akhir pekan',
      content: '<div>Sabtu pagi: <strong>belanja bulanan</strong> di pasar.</div><div>Minggu: istirahat dan masak bersama.</div><div><br></div><div>Jangan lupa cek promo supermarket. 🛒</div>',
      color: 'yellow',
      pinned: true,
      favorite: true,
      tags: ['keluarga', 'rencana'],
      items: [],
      done: false,
      dueDate: addDaysISO(todayISO(), 2),
      reminderAt: null,
      priority: 'normal',
      status: 'active',
      order: 1,
      createdBy: by,
      createdByName: byName,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uid('demo_note'),
      kind: 'todo',
      title: 'Urusan rumah tangga',
      content: 'Pekerjaan kecil yang bisa diselesaikan berdua.',
      color: 'blue',
      pinned: true,
      favorite: false,
      tags: ['rumah'],
      items: [
        { id: uid('item'), text: 'Bayar tagihan listrik', done: true },
        { id: uid('item'), text: 'Servis AC', done: false },
        { id: uid('item'), text: 'Beli lampu kamar', done: false },
      ],
      done: false,
      dueDate: addDaysISO(todayISO(), 5),
      reminderAt: null,
      priority: 'high',
      status: 'active',
      order: 2,
      createdBy: by,
      createdByName: byName,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uid('demo_note'),
      kind: 'todo',
      title: 'Target tabungan darurat',
      content: 'Kumpulkan dana darurat 6 bulan pengeluaran.',
      color: 'green',
      pinned: false,
      favorite: true,
      tags: ['keuangan', 'target'],
      items: [
        { id: uid('item'), text: 'Hitung target 6 bulan', done: true },
        { id: uid('item'), text: 'Sisihkan dari gaji', done: false },
      ],
      done: false,
      dueDate: addMonthsISO(todayISO(), 3),
      reminderAt: null,
      priority: 'urgent',
      status: 'active',
      order: 3,
      createdBy: by,
      createdByName: byName,
      createdAt: now,
      updatedAt: now,
    },
  );

  data.updatedAt = now;
  data.updatedBy = by;
  data.revision = Math.max(1, Number(data.revision) || 1) + 1;
  return data;
}
