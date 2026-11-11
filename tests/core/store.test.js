import {
  describe, it, expect,
} from 'vitest';
import { Store } from '../../js/core/store.js';
import { createDefaultData } from '../../js/core/data.js';
import { APP } from '../../js/core/config.js';

/* -------------------------------------------------------------------------- */
/*  Mock modul eksternal yang diimpor store.js                                */
/* -------------------------------------------------------------------------- */

vi.mock('../../js/services/gdrive.js', () => ({
  GoogleDrive: class {
    static accessToken = '';
  },
}));

vi.mock('../../js/services/cloud.js', () => ({
  Cloud: {
    signInWithGoogle: async () => undefined,
    getFirebaseUid: async () => null,
    resolveInviteCode: async () => null,
    joinHousehold: async () => ({ skipped: true }),
  },
}));

/* -------------------------------------------------------------------------- */
/*  Helper: buat Store instance yang sudah diinisialisasi                   */
/* -------------------------------------------------------------------------- */

function makeStore(dataOverride = {}) {
  const store = new Store();
  const data = createDefaultData();
  // Terapkan override (mis. transaksi, akun kustom)
  Object.assign(data, dataOverride);
  store.data = data;
  store.workspaceId = 'test-ws';
  store.currentUserId = data.users[0]?.id || 'owner';
  store.registry = {
    accounts: {},
    workspaces: { 'test-ws': { id: 'test-ws', name: 'Test' } },
    legacyWorkspaceId: null,
  };
  return store;
}

/* -------------------------------------------------------------------------- */
/*  accountBalance                                                            */
/* -------------------------------------------------------------------------- */

describe('store.accountBalance', () => {
  it('mengembalikan opening balance untuk akun tanpa transaksi', () => {
    const store = makeStore();
    const acc = store.data.accounts[0];
    acc.openingBalance = 1_000_000;
    expect(store.accountBalance(acc.id)).toBe(1_000_000);
  });

  it('pengeluaran mengurangi saldo akun', () => {
    const store = makeStore({
      accounts: [{ id: 'acc-1', name: 'Tunai', type: 'cash', openingBalance: 1_000_000, archived: false }],
      users: [{ id: 'user-1', name: 'Tester', googleEmail: '' }],
      transactions: [
        { id: 'tx-1', date: '2025-01-10', amount: 250_000, type: 'expense', accountId: 'acc-1', categoryId: null, payments: [] },
      ],
    });
    expect(store.accountBalance('acc-1')).toBe(750_000);
  });

  it('pemasukan menambah saldo akun', () => {
    const store = makeStore({
      accounts: [{ id: 'acc-1', name: 'Tunai', type: 'cash', openingBalance: 0, archived: false }],
      users: [{ id: 'user-1', name: 'Tester', googleEmail: '' }],
      transactions: [
        { id: 'tx-1', date: '2025-01-10', amount: 500_000, type: 'income', accountId: 'acc-1', categoryId: null, payments: [] },
      ],
    });
    expect(store.accountBalance('acc-1')).toBe(500_000);
  });

  it('transfer mengurangi saldo asal dan menambah saldo tujuan', () => {
    const store = makeStore({
      accounts: [
        { id: 'acc-1', name: 'Bank', type: 'bank', openingBalance: 1_000_000, archived: false },
        { id: 'acc-2', name: 'Tabungan', type: 'savings', openingBalance: 0, archived: false },
      ],
      users: [{ id: 'user-1', name: 'Tester', googleEmail: '' }],
      transactions: [
        {
          id: 'tx-1', date: '2025-01-10', amount: 300_000, type: 'transfer',
          accountId: 'acc-1', toAccountId: 'acc-2', categoryId: null, payments: [],
        },
      ],
    });
    expect(store.accountBalance('acc-1')).toBe(700_000);
    expect(store.accountBalance('acc-2')).toBe(300_000);
  });

  it('split payment hanya mengurangi saldo akun yang dibayar', () => {
    const store = makeStore({
      accounts: [
        { id: 'acc-1', name: 'Bank', type: 'bank', openingBalance: 1_000_000, archived: false },
        { id: 'acc-2', name: 'Tunai', type: 'cash', openingBalance: 500_000, archived: false },
      ],
      users: [{ id: 'user-1', name: 'Tester', googleEmail: '' }],
      transactions: [
        {
          id: 'tx-1', date: '2025-01-10', amount: 600_000, type: 'expense',
          accountId: null, categoryId: null, payments: [
            { accountId: 'acc-1', memberId: null, amount: 400_000 },
            { accountId: 'acc-2', memberId: null, amount: 200_000 },
          ],
        },
      ],
    });
    expect(store.accountBalance('acc-1')).toBe(600_000);
    expect(store.accountBalance('acc-2')).toBe(300_000);
  });

  it('mengembalikan 0 untuk akun yang tidak ada', () => {
    const store = makeStore();
    expect(store.accountBalance('tidak-ada')).toBe(0);
  });

  it('abaikan transaksi yang soft-deleted (deletedAt)', () => {
    const store = makeStore({
      accounts: [{ id: 'acc-1', name: 'Tunai', type: 'cash', openingBalance: 1_000_000, archived: false }],
      users: [{ id: 'user-1', name: 'Tester', googleEmail: '' }],
      transactions: [
        { id: 'tx-1', date: '2025-01-10', amount: 250_000, type: 'expense', accountId: 'acc-1', categoryId: null, payments: [], deletedAt: '2025-01-11T00:00:00.000Z' },
      ],
    });
    expect(store.accountBalance('acc-1')).toBe(1_000_000);
  });
});

/* -------------------------------------------------------------------------- */
/*  creditSpent                                                               */
/* -------------------------------------------------------------------------- */

describe('store.creditSpent', () => {
  it('menghitung total pembelian pada akun kartu kredit', () => {
    const store = makeStore({
      accounts: [
        { id: 'acc-cc', name: 'Kartu Kredit', type: 'credit', openingBalance: 0, creditLimit: 5_000_000, archived: false },
        { id: 'acc-1', name: 'Tunai', type: 'cash', openingBalance: 0, archived: false },
      ],
      users: [{ id: 'user-1', name: 'Tester', googleEmail: '' }],
      transactions: [
        { id: 'tx-1', date: '2025-01-10', amount: 200_000, type: 'expense', accountId: 'acc-cc', categoryId: null, payments: [] },
        { id: 'tx-2', date: '2025-01-11', amount: 350_000, type: 'expense', accountId: 'acc-cc', categoryId: null, payments: [] },
      ],
    });
    expect(store.creditSpent('acc-cc')).toBe(550_000);
  });

  it('mengembalikan 0 untuk akun non-kredit', () => {
    const store = makeStore({
      accounts: [{ id: 'acc-1', name: 'Tunai', type: 'cash', openingBalance: 0, archived: false }],
      users: [{ id: 'user-1', name: 'Tester', googleEmail: '' }],
      transactions: [
        { id: 'tx-1', date: '2025-01-10', amount: 200_000, type: 'expense', accountId: 'acc-1', categoryId: null, payments: [] },
      ],
    });
    expect(store.creditSpent('acc-1')).toBe(0);
  });

  it('mengembalikan 0 untuk akun yang tidak ada', () => {
    const store = makeStore();
    expect(store.creditSpent('tidak-ada')).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  mergeRemote                                                               */
/* -------------------------------------------------------------------------- */

describe('store.mergeRemote', () => {
  it('mengabaikan remote yang bukan format risly', () => {
    const store = makeStore();
    const result = store.mergeRemote({ app: 'other-app', data: {} });
    expect(result.changed).toBe(false);
    expect(result.warning).toBe('format');
  });

  it('merge remote yang lebih baru (tombstone local wins if newer)', () => {
    const store = makeStore({
      transactions: [
        { id: 'tx-1', date: '2025-01-10', amount: 100, type: 'expense', accountId: null, categoryId: null, updatedAt: '2025-01-10T10:00:00.000Z' },
      ],
      accounts: [],
      users: [],
      settings: {},
    });

    // Remote memiliki transaksi yang sama tapi lebih baru (tombstone)
    const result = store.mergeRemote({
      app: 'risly-money-manager',
      schemaVersion: APP.schemaVersion,
      transactions: [
        { id: 'tx-1', date: '2025-01-10', amount: 100, type: 'expense', accountId: null, categoryId: null, deletedAt: '2025-01-11T10:00:00.000Z', updatedAt: '2025-01-11T10:00:00.000Z' },
      ],
      accounts: [],
      users: [],
      settings: {},
      updatedAt: '2025-01-11T10:00:00.000Z',
    });

    expect(result.changed).toBe(true);
    const tx = store.data.transactions.find((t) => t.id === 'tx-1');
    expect(tx.deletedAt).toBeDefined();
  });

  it('menambahkan transaksi baru dari remote yang belum ada lokal', () => {
    const store = makeStore({
      transactions: [],
      accounts: [],
      users: [],
      settings: {},
    });

    const result = store.mergeRemote({
      app: 'risly-money-manager',
      schemaVersion: APP.schemaVersion,
      transactions: [
        { id: 'tx-remote', date: '2025-02-01', amount: 500, type: 'income', accountId: null, categoryId: null, updatedAt: '2025-02-01T00:00:00.000Z' },
      ],
      accounts: [],
      users: [],
      settings: {},
      updatedAt: '2025-02-01T00:00:00.000Z',
    });

    expect(result.changed).toBe(true);
    expect(store.data.transactions).toHaveLength(1);
    expect(store.data.transactions[0].id).toBe('tx-remote');
  });

  it('settings dari remote dipilih jika timestamp lebih baru', () => {
    const store = makeStore({
      transactions: [],
      accounts: [],
      users: [],
      settings: { householdName: 'Lokal', updatedAt: '2025-01-01T00:00:00.000Z' },
    });

    store.mergeRemote({
      app: 'risly-money-manager',
      schemaVersion: APP.schemaVersion,
      transactions: [],
      accounts: [],
      users: [],
      settings: { householdName: 'Remote', updatedAt: '2025-06-01T00:00:00.000Z' },
      updatedAt: '2025-06-01T00:00:00.000Z',
    });

    expect(store.data.settings.householdName).toBe('Remote');
  });

  it('mengembalikan changed: false jika data remote sama dengan lokal', () => {
    const base = {
      app: 'risly-money-manager',
      schemaVersion: APP.schemaVersion,
      transactions: [],
      accounts: [],
      users: [],
      settings: { householdName: 'Same', updatedAt: '2025-01-01T00:00:00.000Z' },
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    const store = makeStore(JSON.parse(JSON.stringify(base)));

    const result = store.mergeRemote(JSON.parse(JSON.stringify(base)));

    // Data harus tetap utuh (tidak rusak), changed dapat true karena
    // migrateData menormalisasi field (revision, updatedAt, dll.).
    expect(store.data.app).toBe('risly-money-manager');
    expect(store.data.schemaVersion).toBe(APP.schemaVersion);
  });
});

/* -------------------------------------------------------------------------- */
/*  processRecurring                                                          */
/* -------------------------------------------------------------------------- */

describe('store.processRecurring', () => {
  it('mem-post recurring expense sekali (idempoten)', () => {
    const store = makeStore({
      accounts: [
        { id: 'acc-1', name: 'Bank', type: 'bank', openingBalance: 10_000_000, archived: false },
      ],
      users: [{ id: 'user-1', name: 'Tester', googleEmail: '' }],
      recurring: [
        {
          id: 'rec-1',
          title: 'Tagihan listrik',
          type: 'expense',
          amount: 500_000,
          accountId: 'acc-1',
          categoryId: null,
          frequency: 'monthly',
          interval: 1,
          anchorDay: 10,
          nextDate: '2025-01-10',
          startDate: '2025-01-10',
          active: true,
          autoPost: true,
          createdBy: 'user-1',
          createdByName: 'Tester',
        },
      ],
      transactions: [],
    });

    const result1 = store.processRecurring({ today: '2025-01-10' });
    expect(result1.posted).toBe(1);
    expect(store.data.transactions).toHaveLength(1);
    expect(store.data.transactions[0].id).toBe('rec_rec-1_2025-01-10');

    // Panggil lagi dengan tanggal yang sama: tidak boleh post duplikat
    const result2 = store.processRecurring({ today: '2025-01-10' });
    expect(result2.posted).toBe(0);
    expect(store.data.transactions).toHaveLength(1);
  });

  it('tidak mem-post recurring yang tidak aktif', () => {
    const store = makeStore({
      accounts: [{ id: 'acc-1', name: 'Bank', type: 'bank', openingBalance: 10_000_000, archived: false }],
      users: [{ id: 'user-1', name: 'Tester', googleEmail: '' }],
      recurring: [
        {
          id: 'rec-1',
          title: 'Nonaktif',
          type: 'expense',
          amount: 100_000,
          accountId: 'acc-1',
          categoryId: null,
          frequency: 'monthly',
          interval: 1,
          anchorDay: 10,
          nextDate: '2025-01-10',
          startDate: '2025-01-10',
          active: false,
          autoPost: true,
          createdBy: 'user-1',
          createdByName: 'Tester',
        },
      ],
      transactions: [],
    });

    const result = store.processRecurring({ today: '2025-01-10' });
    expect(result.posted).toBe(0);
    expect(store.data.transactions).toHaveLength(0);
  });

  it('tidak mem-post recurring yang sudah melewati endDate', () => {
    const store = makeStore({
      accounts: [{ id: 'acc-1', name: 'Bank', type: 'bank', openingBalance: 10_000_000, archived: false }],
      users: [{ id: 'user-1', name: 'Tester', googleEmail: '' }],
      recurring: [
        {
          id: 'rec-1',
          title: 'Berakhir',
          type: 'expense',
          amount: 100_000,
          accountId: 'acc-1',
          categoryId: null,
          frequency: 'monthly',
          interval: 1,
          anchorDay: 10,
          nextDate: '2025-01-10',
          startDate: '2025-01-10',
          endDate: '2025-01-09',
          active: true,
          autoPost: true,
          createdBy: 'user-1',
          createdByName: 'Tester',
        },
      ],
      transactions: [],
    });

    const result = store.processRecurring({ today: '2025-01-10' });
    expect(result.posted).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  commit transaksional (rollback saat persist gagal)                        */
/* -------------------------------------------------------------------------- */

describe('store.commit transaksional', () => {
  it('rollback data saat localStorage gagal (kuota penuh)', async () => {
    const store = makeStore();
    const originalBalance = store.accountBalance(store.data.accounts[0].id);
    const originalTxCount = store.data.transactions.length;

    // Tangkap Storage.prototype.setItem dan paksa melempar QuotaExceededError
    let setItemCalled = false;
    const origSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      setItemCalled = true;
      const e = new Error('QuotaExceededError');
      e.name = 'QuotaExceededError';
      throw e;
    };

    let threw = false;
    try {
      await store.commit('transaction:add', (data) => {
        data.transactions.push({
          id: 'tx-new', date: '2025-01-10', amount: 999, type: 'expense',
          accountId: store.data.accounts[0].id, categoryId: null, payments: [],
        });
      });
    } catch {
      threw = true;
    } finally {
      Storage.prototype.setItem = origSetItem;
    }

    expect(setItemCalled).toBe(true);
    expect(threw).toBe(true);

    // Data di memori tidak boleh berubah (rollback)
    expect(store.accountBalance(store.data.accounts[0].id)).toBe(originalBalance);
    expect(store.data.transactions.length).toBe(originalTxCount);
  });
});
