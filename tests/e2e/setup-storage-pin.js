// RISLY E2E — localStorage setup script (runs in browser before page load)
// Creates a test workspace WITH PIN "1234" → halaman langsung menampilkan layar PIN.

(async () => {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode('1234'),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 150_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)));
  const saltB64 = btoa(String.fromCharCode(...salt));

  const now = new Date().toISOString();
  const workspaceId = 'test-ws-e2e-pin';
  const userId = 'test-user-e2e-pin';

  const data = {
    app: 'risly-money-manager',
    schemaVersion: 5,
    revision: 1,
    updatedAt: now,
    settings: {
      householdName: 'Ruang E2E PIN',
      workspaceName: 'Ruang E2E PIN',
      ownerEmail: 'tester@e2e.test',
      inviteCode: 'E2EPIN4',
      currency: 'IDR',
      locale: 'id-ID',
      defaultMonthlyBudget: 0,
      budgetWarning: 75,
      budgetDanger: 90,
      weekStartsOn: 1,
      autoLockMinutes: 10,
      updatedAt: now,
    },
    users: [
      {
        id: userId,
        name: 'Tester',
        color: '#2563EB',
        initials: 'TE',
        googleEmail: 'tester@e2e.test',
        picture: '',
        pinHash: hash,
        pinSalt: saltB64,
        pinIterations: 150_000,
        createdAt: now,
        updatedAt: now,
      },
    ],
    accounts: [
      {
        id: 'acc-cash',
        name: 'Dompet Tunai',
        type: 'cash',
        color: '#F59E0B',
        openingBalance: 1_000_000,
        archived: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'acc-bank',
        name: 'Bank BCA',
        type: 'bank',
        color: '#3B82F6',
        openingBalance: 5_000_000,
        archived: false,
        createdAt: now,
        updatedAt: now,
      },
    ],
    categories: [
      {
        id: 'cat-exp-food',
        type: 'expense',
        name: 'Makanan & Minuman',
        icon: 'utensils',
        color: '#F97316',
        subcategories: [
          { id: 'sub-food-grocery', name: 'Belanja Harian', updatedAt: now },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'cat-inc-salary',
        type: 'income',
        name: 'Gaji',
        icon: 'briefcase',
        color: '#16A34A',
        subcategories: [
          { id: 'sub-salary-rizki', name: 'Gaji Utama', updatedAt: now },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ],
    transactions: [],
    budgets: [],
    recurring: [],
    notes: [],
    goals: [],
    netWorthHistory: [],
    closedMonths: [],
  };

  localStorage.setItem(`risly.mm.workspace.v1.${workspaceId}`, JSON.stringify(data));
  localStorage.setItem(
    'risly.mm.workspaces.v1',
    JSON.stringify({
      accounts: {},
      workspaces: {
        [workspaceId]: {
          id: workspaceId,
          name: 'Ruang E2E PIN',
          inviteCode: 'E2EPIN4',
          ownerEmail: 'tester@e2e.test',
          updatedAt: now,
        },
      },
      legacyWorkspaceId: null,
    }),
  );
  localStorage.setItem(
    'risly.mm.lastaccount.v1',
    JSON.stringify({
      email: 'tester@e2e.test',
      workspaceId,
      name: 'Tester',
      picture: '',
    }),
  );
})();
