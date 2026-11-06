import { APP } from './config.js';
import {
  addDaysISO,
  addMonthsISO,
  deepClone,
  localDateISO,
  monthKey,
  normalizeTime,
  nowISO,
  shiftMonthKey,
  timeFromISO,
  todayISO,
  uid,
} from './utils.js';

const SEED_DATE = '2025-01-01T00:00:00.000Z';

export function initialsFromName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return initials || '?';
}

export function generateInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let code = '';
  bytes.forEach((byte) => { code += alphabet[byte % alphabet.length]; });
  return code;
}

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
      ['sub-salary-rizki', 'Gaji Utama'],
      ['sub-salary-shelly', 'Gaji Pasangan'],
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

export function defaultUsers(owner = null) {
  const name = String(owner?.name || 'Pengguna').trim() || 'Pengguna';
  return [
    {
      id: owner?.id || uid('user'),
      name,
      color: owner?.color || '#2563EB',
      initials: initialsFromName(name),
      googleEmail: String(owner?.email || '').trim().toLowerCase(),
      picture: String(owner?.picture || ''),
      pinHash: '',
      pinSalt: '',
      pinIterations: 0,
      createdAt: SEED_DATE,
      updatedAt: SEED_DATE,
    },
  ];
}

export function createDefaultData(owner = null) {
  const now = nowISO();
  const ownerUser = defaultUsers(owner)[0];
  const workspaceName = ownerUser.googleEmail ? `Ruang ${ownerUser.name}` : 'Keuangan Saya';
  return {
    app: 'risly-money-manager',
    schemaVersion: APP.schemaVersion,
    revision: 1,
    updatedAt: now,
    updatedBy: null,
    settings: {
      householdName: workspaceName,
      workspaceName,
      ownerEmail: ownerUser.googleEmail || '',
      inviteCode: generateInviteCode(),
      currency: 'IDR',
      locale: 'id-ID',
      defaultMonthlyBudget: 0,
      budgetWarning: 75,
      budgetDanger: 90,
      weekStartsOn: 1,
      autoLockMinutes: APP.defaultAutoLockMinutes,
      updatedAt: now,
    },
    users: [ownerUser],
    accounts: defaultAccounts(),
    categories: defaultCategories(),
    transactions: [],
    budgets: [],
    recurring: [],
    notes: [],
    goals: [],
    netWorthHistory: [],
    closedMonths: [],
  };
}

function pickDefined(target, source) {
  Object.keys(source).forEach((key) => {
    if (target[key] === undefined) target[key] = source[key];
  });
}

function normalizedUserName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function userReferenceCount(data, userId) {
  let count = 0;
  (data.accounts || []).forEach((account) => {
    if (account?.owner === userId) count += 1;
  });
  ['transactions', 'recurring', 'notes', 'budgets'].forEach((key) => {
    (data[key] || []).forEach((item) => {
      if (item?.createdBy === userId) count += 1;
      if (item?.updatedBy === userId) count += 1;
    });
  });
  return count;
}

function pickCanonicalUser(candidates) {
  // The choice must be deterministic across devices (same input -> same id),
  // otherwise two devices could tombstone each other's canonical profile.
  return [...candidates].sort((a, b) => {
    const emailDiff = Number(Boolean(b.googleEmail)) - Number(Boolean(a.googleEmail));
    if (emailDiff) return emailDiff;
    const aCreated = new Date(a.createdAt || 0).getTime() || 0;
    const bCreated = new Date(b.createdAt || 0).getTime() || 0;
    if (aCreated !== bCreated) return aCreated - bCreated;
    return String(a.id || '').localeCompare(String(b.id || ''));
  })[0];
}

function mergeDuplicateUser(data, duplicate, canonical, remap, now) {
  if (!duplicate || !canonical || duplicate.id === canonical.id) return;
  if (duplicate.deletedAt || canonical.deletedAt) return;
  remap.set(duplicate.id, canonical.id);
  duplicate.deletedAt = now;
  duplicate.updatedAt = now;
  duplicate.mergedInto = canonical.id;
  if (!canonical.googleEmail && duplicate.googleEmail) canonical.googleEmail = duplicate.googleEmail;
  if (!canonical.firebaseUid && duplicate.firebaseUid) canonical.firebaseUid = duplicate.firebaseUid;
  if (!canonical.picture && duplicate.picture) canonical.picture = duplicate.picture;
  if (!canonical.pinHash && duplicate.pinHash) {
    canonical.pinHash = duplicate.pinHash;
    canonical.pinSalt = duplicate.pinSalt;
    canonical.pinIterations = duplicate.pinIterations;
  }
  canonical.updatedAt = now;
}

function remapUserReferences(data, remap) {
  if (!remap.size) return;
  const canonicalName = (id) => data.users.find((user) => user.id === id)?.name;
  (data.accounts || []).forEach((account) => {
    if (remap.has(account?.owner)) account.owner = remap.get(account.owner);
  });
  ['transactions', 'recurring', 'notes', 'budgets'].forEach((key) => {
    (data[key] || []).forEach((item) => {
      if (!item) return;
      ['createdBy', 'updatedBy'].forEach((field) => {
        if (remap.has(item[field])) item[field] = remap.get(item[field]);
      });
      const name = item.createdBy ? canonicalName(item.createdBy) : '';
      if (name) item.createdByName = name;
    });
  });
  if (remap.has(data.updatedBy)) data.updatedBy = remap.get(data.updatedBy);
}

/**
 * Fold duplicate/legacy members into a single canonical profile without losing
 * ownership of existing accounts, transactions, schedules, or notes.
 * Duplicates are tombstoned (deletedAt) so the cleanup also propagates on sync.
 */
export function dedupeUsers(data) {
  if (!data || !Array.isArray(data.users)) return data;
  const now = nowISO();
  const remap = new Map();
  const activeUsers = () => data.users.filter((user) => !user.deletedAt);

  // 1. The same Google email always means the same person.
  const byEmail = new Map();
  activeUsers().forEach((user) => {
    const email = String(user.googleEmail || '').trim().toLowerCase();
    if (!email) return;
    if (!byEmail.has(email)) byEmail.set(email, []);
    byEmail.get(email).push(user);
  });
  byEmail.forEach((group) => {
    if (group.length < 2) return;
    const canonical = pickCanonicalUser(group);
    group.forEach((user) => mergeDuplicateUser(data, user, canonical, remap, now));
  });

  // 2. A legacy profile without Google data that shares a connected member's
  //    name is the same person (e.g. the old seeded "rizki"/"shelly" users).
  //    Only merge when that name maps to a single connected Google account.
  const connectedByName = new Map();
  activeUsers().forEach((user) => {
    if (!user.googleEmail) return;
    const key = normalizedUserName(user.name);
    if (!key) return;
    if (!connectedByName.has(key)) connectedByName.set(key, []);
    connectedByName.get(key).push(user);
  });
  activeUsers().forEach((user) => {
    if (user.googleEmail) return;
    const candidates = connectedByName.get(normalizedUserName(user.name)) || [];
    if (!candidates.length) return;
    const emails = new Set(candidates.map((item) => String(item.googleEmail || '').toLowerCase()));
    if (emails.size !== 1) return;
    mergeDuplicateUser(data, user, pickCanonicalUser(candidates), remap, now);
  });

  // 3. Duplicate no-email legacy profiles with the same name: only fold the
  //    unreferenced copies so two different people are never merged.
  const legacyByName = new Map();
  activeUsers().forEach((user) => {
    if (user.googleEmail) return;
    const key = normalizedUserName(user.name);
    if (!key) return;
    if (!legacyByName.has(key)) legacyByName.set(key, []);
    legacyByName.get(key).push(user);
  });
  legacyByName.forEach((group) => {
    if (group.length < 2) return;
    const referenced = group.filter((user) => userReferenceCount(data, user.id) > 0);
    if (referenced.length > 1) return;
    const canonical = referenced[0] || pickCanonicalUser(group);
    group.forEach((user) => mergeDuplicateUser(data, user, canonical, remap, now));
  });

  remapUserReferences(data, remap);

  return data;
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
  settings.workspaceName = String(settings.workspaceName || settings.householdName);
  settings.ownerEmail = String(settings.ownerEmail || '').trim().toLowerCase();
  settings.inviteCode = String(settings.inviteCode || defaults.settings.inviteCode).toUpperCase();
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
  const baseUsers = existingUsers.length ? existingUsers : defaults.users;
  data.users = baseUsers.map((user) => {
    const name = String(user?.name || 'Pengguna').trim() || 'Pengguna';
    return {
      id: user?.id || uid('user'),
      name,
      color: user?.color || '#2563EB',
      initials: String(user?.initials || initialsFromName(name)),
      googleEmail: String(user?.googleEmail || '').trim().toLowerCase(),
      picture: String(user?.picture || ''),
      pinHash: String(user?.pinHash || ''),
      pinSalt: String(user?.pinSalt || ''),
      pinIterations: Math.max(0, Number(user?.pinIterations) || 0),
      createdAt: user?.createdAt || data.updatedAt || SEED_DATE,
      updatedAt: user?.updatedAt || data.updatedAt || SEED_DATE,
      ...(user?.deletedAt ? { deletedAt: user.deletedAt } : {}),
      ...(user?.mergedInto ? { mergedInto: user.mergedInto } : {}),
    };
  });
  if (!data.users.length) data.users = defaults.users;
  if (!settings.ownerEmail) {
    settings.ownerEmail = data.users.find((user) => user.googleEmail)?.googleEmail || '';
  }

  const defaultOwner = data.users?.[0]?.id || 'owner';
  data.accounts = Array.isArray(data.accounts) ? data.accounts : defaultAccounts();
  data.accounts = data.accounts.map((account) => ({
    id: account.id || uid('acc'),
    name: String(account.name || 'Akun'),
    type: account.type || 'cash',
    color: account.color || '#3B82F6',
    openingBalance: Number(account.openingBalance) || 0,
    owner: account.owner || defaultOwner,
    sharedWith: Array.isArray(account.sharedWith) ? account.sharedWith : [],
    creditLimit: Number(account.creditLimit) || 0,
    creditDueDate: account.creditDueDate || null,
    loanPrincipal: Number(account.loanPrincipal) || 0,
    loanInterestRate: Number(account.loanInterestRate) || 0,
    loanTermMonths: Number(account.loanTermMonths) || 0,
    loanMonthlyPayment: Number(account.loanMonthlyPayment) || 0,
    loanStartDate: account.loanStartDate || null,
    loanNextDueDate: account.loanNextDueDate || null,
    loanRemaining: account.loanRemaining === undefined ? Number(account.loanPrincipal) || 0 : Number(account.loanRemaining) || 0,
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
    time: normalizeTime(tx.time, timeFromISO(tx.createdAt) || '00:00'),
    type: ['income', 'expense', 'transfer'].includes(tx.type) ? tx.type : 'expense',
    amount: Math.max(0, Number(tx.amount) || 0),
    accountId: tx.accountId || null,
    toAccountId: tx.toAccountId || null,
    categoryId: tx.categoryId || null,
    subcategoryId: tx.subcategoryId || null,
    note: String(tx.note || ''),
    payee: String(tx.payee || '').trim(),
    tags: Array.isArray(tx.tags) ? tx.tags.map(String).map((t) => t.trim()).filter(Boolean).slice(0, 20) : [],
    splits: Array.isArray(tx.splits) ? tx.splits.map((s) => ({
      categoryId: s?.categoryId || null,
      subcategoryId: s?.subcategoryId || null,
      amount: Math.max(0, Number(s?.amount) || 0),
      note: String(s?.note || '').trim(),
    })).filter((s) => s.amount > 0) : [],
    receipt: typeof tx.receipt === 'string' ? tx.receipt : null,
    status: ['pending', 'cleared'].includes(tx.status) ? tx.status : 'cleared',
    createdBy: tx.createdBy || data.users[0]?.id || 'owner',
    createdByName: tx.createdByName || data.users.find((user) => user.id === tx.createdBy)?.name || data.users[0]?.name || 'Pengguna',
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
    createdBy: rule.createdBy || data.users[0]?.id || 'owner',
    createdByName: rule.createdByName || data.users.find((user) => user.id === rule.createdBy)?.name || data.users[0]?.name || 'Pengguna',
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
    createdBy: note.createdBy || data.users[0]?.id || 'owner',
    createdByName: note.createdByName || data.users.find((user) => user.id === note.createdBy)?.name || data.users[0]?.name || 'Pengguna',
    createdAt: note.createdAt || data.updatedAt,
    updatedAt: note.updatedAt || data.updatedAt,
    completedAt: note.completedAt || null,
    ...(note.deletedAt ? { deletedAt: note.deletedAt } : {}),
  }));

  data.goals = Array.isArray(data.goals) ? data.goals : [];
  data.goals = data.goals.map((goal) => ({
    id: goal.id || uid('goal'),
    name: String(goal.name || 'Target baru').trim(),
    targetAmount: Math.max(0, Number(goal.targetAmount) || 0),
    currentAmount: Math.max(0, Number(goal.currentAmount) || 0),
    dueDate: goal.dueDate || null,
    color: goal.color || '#10B981',
    createdBy: goal.createdBy || data.users[0]?.id || 'owner',
    createdAt: goal.createdAt || data.updatedAt,
    updatedAt: goal.updatedAt || data.updatedAt,
    ...(goal.deletedAt ? { deletedAt: goal.deletedAt } : {}),
  }));

  data.netWorthHistory = Array.isArray(data.netWorthHistory) ? data.netWorthHistory : [];
  data.netWorthHistory = data.netWorthHistory.map((entry) => ({
    month: String(entry.month || ''),
    value: Number(entry.value) || 0,
    recordedAt: entry.recordedAt || data.updatedAt,
  })).filter((entry) => /^\d{4}-\d{2}$/.test(entry.month));

  data.closedMonths = Array.isArray(data.closedMonths) ? data.closedMonths : [];
  data.closedMonths = data.closedMonths
    .filter((entry) => entry && typeof entry.month === 'string' && /^\d{4}-\d{2}$/.test(entry.month))
    .map((entry) => ({
      month: String(entry.month || ''),
      closedAt: entry.closedAt || data.updatedAt,
      closedBy: entry.closedBy || null,
      income: Number(entry.income) || 0,
      expense: Number(entry.expense) || 0,
      net: Number(entry.net) || 0,
      savingsRate: Number(entry.savingsRate) || 0,
      transfers: Number(entry.transfers) || 0,
      count: Number(entry.count) || 0,
    }));

  dedupeUsers(data);

  return data;
}

export function createSampleData(base, actor = {}) {
  const data = deepClone(base);
  const now = nowISO();
  const by = actor.id || data.users[0]?.id || 'owner';
  const byName = actor.name || data.users[0]?.name || 'Pengguna';
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
    time: extra.time || '09:00',
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
    txList.push(tx(incomeDate, 'income', 8_500_000, bank.id, 'cat-inc-salary', 'sub-salary-rizki', 'Gaji utama'));
    txList.push(tx(incomeDate, 'income', 5_750_000, bank.id, 'cat-inc-salary', 'sub-salary-shelly', 'Gaji pasangan'));
    txList.push(tx(`${key}-03`, 'expense', 1_850_000, bank.id, 'cat-exp-home', 'sub-home-utility', 'Listrik, air, dan internet'));
    txList.push(tx(`${key}-05`, 'expense', 1_450_000, bank.id, 'cat-exp-food', 'sub-food-grocery', 'Belanja bulanan'));
    txList.push(tx(`${key}-08`, 'expense', 650_000, cash.id, 'cat-exp-transport', 'sub-transport-fuel', 'Bensin mobil'));
    txList.push(tx(`${key}-11`, 'expense', 425_000, wallet.id, 'cat-exp-food', 'sub-food-dining', 'Makan akhir pekan'));
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
      content: 'Pekerjaan rumah kecil yang perlu diselesaikan.',
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
