import {
  describe, it, expect,
} from 'vitest';
import {
  migrateData,
  createDefaultData,
  defaultCategories,
  defaultAccounts,
} from '../../js/core/data.js';
import { APP } from '../../js/core/config.js';

/* -------------------------------------------------------------------------- */
/*  migrateData                                                               */
/* -------------------------------------------------------------------------- */

describe('migrateData', () => {
  it('mengembalikan default data untuk input null', () => {
    const result = migrateData(null);
    expect(result.app).toBe('risly-money-manager');
    expect(result.schemaVersion).toBe(APP.schemaVersion);
    expect(Array.isArray(result.accounts)).toBe(true);
    expect(Array.isArray(result.transactions)).toBe(true);
  });

  it('mengembalikan default data untuk input undefined', () => {
    // @ts-expect-error - testing undefined input intentionally
    const result = migrateData(undefined);
    expect(result.app).toBe('risly-money-manager');
    expect(result.schemaVersion).toBe(APP.schemaVersion);
  });

  it('mengembalikan default data untuk input non-objek (string)', () => {
    // @ts-expect-error - testing string input intentionally
    const result = migrateData('not an object');
    expect(result.app).toBe('risly-money-manager');
    expect(result.schemaVersion).toBe(APP.schemaVersion);
  });

  it('mengembalikan default data untuk objek kosong', () => {
    const result = migrateData({});
    expect(result.app).toBe('risly-money-manager');
    expect(result.schemaVersion).toBe(APP.schemaVersion);
    expect(result.transactions).toEqual([]);
    expect(result.accounts.length).toBeGreaterThan(0);
  });

  it('mengisi schemaVersion yang hilang', () => {
    const result = migrateData({ transactions: [], accounts: [], users: [] });
    expect(result.schemaVersion).toBe(APP.schemaVersion);
    expect(result.app).toBe('risly-money-manager');
  });

  it('mempertahankan transaksi yang ada saat migrasi', () => {
    const raw = {
      app: 'risly-money-manager',
      schemaVersion: 1,
      transactions: [{ id: 'tx-1', date: '2025-01-10', amount: 50000, type: 'expense', accountId: null, categoryId: null, note: 'Test' }],
      accounts: [{ id: 'acc-1', name: 'Tes', type: 'cash', openingBalance: 0 }],
      users: [{ id: 'user-1', name: 'Tester', googleEmail: '' }],
      settings: {},
    };
    const result = migrateData(raw);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].id).toBe('tx-1');
    expect(result.transactions[0].amount).toBe(50000);
  });

  it('menormalisasi tipe transaksi yang tidak dikenal menjadi expense', () => {
    const result = migrateData({
      transactions: [{ id: 'tx-1', date: '2025-01-10', amount: 100, type: 'invalid', accountId: null, categoryId: null }],
      accounts: [],
      users: [],
      settings: {},
    });
    expect(result.transactions[0].type).toBe('expense');
  });

  it('membersihkan splits yang amount-nya 0', () => {
    const result = migrateData({
      transactions: [{
        id: 'tx-1',
        date: '2025-01-10',
        amount: 100,
        type: 'expense',
        accountId: null,
        categoryId: null,
        splits: [
          { categoryId: null, amount: 0, note: 'empty' },
          { categoryId: null, amount: 50, note: 'valid' },
        ],
      }],
      accounts: [],
      users: [],
      settings: {},
    });
    expect(result.transactions[0].splits).toHaveLength(1);
    expect(result.transactions[0].splits[0].amount).toBe(50);
  });

  it('membatasi budgetWarning antara 1 dan 99', () => {
    const result = migrateData({
      transactions: [],
      accounts: [],
      users: [],
      settings: { budgetWarning: 200, budgetDanger: 50 },
    });
    expect(result.settings.budgetWarning).toBeLessThanOrEqual(99);
    expect(result.settings.budgetWarning).toBeGreaterThanOrEqual(1);
  });

  it('membatasi budgetDanger antara budgetWarning+1 dan 100', () => {
    const result = migrateData({
      transactions: [],
      accounts: [],
      users: [],
      settings: { budgetWarning: 80, budgetDanger: 200 },
    });
    expect(result.settings.budgetDanger).toBeLessThanOrEqual(100);
    expect(result.settings.budgetDanger).toBeGreaterThan(result.settings.budgetWarning);
  });

  it('memastikan setidaknya satu user ada setelah migrasi', () => {
    const result = migrateData({
      transactions: [],
      accounts: [],
      users: [],
      settings: {},
    });
    expect(result.users.length).toBeGreaterThan(0);
  });

  it('tidak mengubah objek input asli (tidak mutasi)', () => {
    const input = {
      transactions: [{ id: 'tx-1', amount: 100 }],
      accounts: [],
      users: [],
      settings: {},
    };
    const inputCopy = JSON.parse(JSON.stringify(input));
    migrateData(input);
    expect(input).toEqual(inputCopy);
  });
});

/* -------------------------------------------------------------------------- */
/*  createDefaultData                                                         */
/* -------------------------------------------------------------------------- */

describe('createDefaultData', () => {
  it('membuat data default dengan schema version yang benar', () => {
    const data = createDefaultData();
    expect(data.app).toBe('risly-money-manager');
    expect(data.schemaVersion).toBe(APP.schemaVersion);
    expect(data.settings.currency).toBe('IDR');
    expect(data.settings.locale).toBe('id-ID');
  });

  it('membuat 4 akun default', () => {
    const data = createDefaultData();
    expect(data.accounts).toHaveLength(4);
    const types = data.accounts.map((a) => a.type);
    expect(types).toContain('cash');
    expect(types).toContain('bank');
    expect(types).toContain('ewallet');
    expect(types).toContain('savings');
  });

  it('membuat kategori default', () => {
    const data = createDefaultData();
    expect(data.categories.length).toBeGreaterThan(0);
    const expenseCats = data.categories.filter((c) => c.type === 'expense');
    const incomeCats = data.categories.filter((c) => c.type === 'income');
    expect(expenseCats.length).toBeGreaterThan(0);
    expect(incomeCats.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  defaultCategories / defaultAccounts                                       */
/* -------------------------------------------------------------------------- */

describe('defaultCategories', () => {
  it('membalikan kategori dengan subkategori', () => {
    const cats = defaultCategories();
    const food = cats.find((c) => c.id === 'cat-exp-food');
    expect(food).toBeDefined();
    expect(food.subcategories.length).toBeGreaterThan(0);
  });
});

describe('defaultAccounts', () => {
  it('membalikan akun default dengan openingBalance 0', () => {
    const accs = defaultAccounts();
    accs.forEach((acc) => {
      expect(acc.openingBalance).toBe(0);
      expect(acc.archived).toBe(false);
    });
  });
});
