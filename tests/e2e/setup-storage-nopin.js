// RISLY E2E — localStorage setup script (runs in browser before page load)
// Creates a test workspace with user "Tester" TANPA PIN → langsung dashboard.

(async () => {
  // Hanya setel localStorage jika workspace belum ada (hindari menimpa
  // data setelah reload dalam test yang sama).
  if (localStorage.getItem(`risly.mm.workspace.v1.test-ws-e2e`)) return;

  const now = new Date().toISOString();
  const workspaceId = 'test-ws-e2e';
  const userId = 'test-user-e2e';

  const data = {
    app: 'risly-money-manager',
    schemaVersion: 5,
    revision: 1,
    updatedAt: now,
    settings: {
      householdName: 'Ruang E2E',
      workspaceName: 'Ruang E2E',
      ownerEmail: '',
      inviteCode: 'E2E1234',
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
        pinHash: '',
        pinSalt: '',
        pinIterations: 0,
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
          name: 'Ruang E2E',
          inviteCode: 'E2E1234',
          ownerEmail: '',
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
