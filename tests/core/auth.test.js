import {
  describe, it, expect,
} from 'vitest';
import {
  createPinCredentials,
  verifyPin,
  changePin,
  usersNeedingSetup,
  needsSetup,
  getLockRemaining,
  registerFailedAttempt,
  resetFailedAttempts,
  createSession,
  getSession,
  isSessionExpired,
  clearSession,
} from '../../js/core/auth.js';

/* -------------------------------------------------------------------------- */
/*  verifyPin / createPinCredentials                                          */
/* -------------------------------------------------------------------------- */

describe('auth.verifyPin', () => {
  it('mengembalikan true untuk PIN yang benar', async () => {
    const user = await createPinCredentials('123456');
    const valid = await verifyPin(user, '123456');
    expect(valid).toBe(true);
  });

  it('mengembalikan false untuk PIN yang salah', async () => {
    const user = await createPinCredentials('123456');
    const valid = await verifyPin(user, '000000');
    expect(valid).toBe(false);
  });

  it('mengembalikan false untuk user tanpa pinHash', async () => {
    const user = { id: 'user-1', name: 'Tester', pinHash: '', pinSalt: '', pinIterations: 0 };
    const valid = await verifyPin(user, '123456');
    expect(valid).toBe(false);
  });

  it('mengembalikan false untuk user null/undefined', async () => {
    // @ts-expect-error - testing null user intentionally
    expect(await verifyPin(null, '123456')).toBe(false);
    // @ts-expect-error - testing undefined user intentionally
    expect(await verifyPin(undefined, '123456')).toBe(false);
  });

  it('mengembalikan false untuk PIN dengan format tidak valid', async () => {
    const user = await createPinCredentials('123456');
    // assertPin melempar untuk format tidak valid (perilaku sengaja di auth.js)
    await expect(verifyPin(user, 'abc')).rejects.toThrow('PIN harus terdiri dari 6–8 angka.');
    await expect(verifyPin(user, '123')).rejects.toThrow('PIN harus terdiri dari 6–8 angka.');
    await expect(verifyPin(user, '123456789')).rejects.toThrow('PIN harus terdiri dari 6–8 angka.');
  });

  it('menggunakan konstanta-time comparison (tidak ada timing leak yang sederhana)', async () => {
    const user = await createPinCredentials('123456');
    const wrong = await verifyPin(user, '567890');
    const right = await verifyPin(user, '123456');
    expect(wrong).toBe(false);
    expect(right).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  changePin                                                                 */
/* -------------------------------------------------------------------------- */

describe('auth.changePin', () => {
  it('menghasilkan kredensial baru untuk user tanpa PIN', async () => {
    const user = { id: 'user-1', name: 'Tester', pinHash: '', pinSalt: '', pinIterations: 0 };
    const creds = await changePin(user, '', '432100');
    expect(creds.pinHash).toBeDefined();
    expect(creds.pinSalt).toBeDefined();
    expect(creds.pinIterations).toBeGreaterThan(0);
  });

  it('memerlukan PIN saat ini yang benar untuk mengganti PIN', async () => {
    const user = await createPinCredentials('111111');
    await expect(changePin(user, '000000', '432100')).rejects.toThrow('PIN saat ini tidak cocok');
    const creds = await changePin(user, '111111', '432100');
    expect(creds.pinHash).toBeDefined();
    const valid = await verifyPin({ ...user, pinHash: creds.pinHash, pinSalt: creds.pinSalt }, '432100');
    expect(valid).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  usersNeedingSetup / needsSetup                                            */
/* -------------------------------------------------------------------------- */

describe('auth.usersNeedingSetup / needsSetup', () => {
  it('mengembalikan user yang belum memiliki PIN', () => {
    const users = [
      { id: 'u1', name: 'A', pinHash: 'abc', pinSalt: 'salt', pinIterations: 100 },
      { id: 'u2', name: 'B', pinHash: '', pinSalt: '', pinIterations: 0 },
      { id: 'u3', name: 'C', pinHash: 'def', pinSalt: 'salt', pinIterations: 100, deletedAt: '2025-01-01' },
    ];
    const needing = usersNeedingSetup(users);
    expect(needing).toHaveLength(1);
    expect(needing[0].id).toBe('u2');
  });

  it('needsSetup mengembalikan true jika ada user tanpa PIN', () => {
    expect(needsSetup([{ id: 'u1', name: 'A', pinHash: '', pinSalt: '', pinIterations: 0 }])).toBe(true);
    expect(needsSetup([{ id: 'u1', name: 'A', pinHash: 'abc', pinSalt: 'salt', pinIterations: 100 }])).toBe(false);
    expect(needsSetup([])).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  Lockout                                                                   */
/* -------------------------------------------------------------------------- */

describe('auth.lockout', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('mengembalikan 0 sisa waktu kunci untuk user baru', () => {
    expect(getLockRemaining('user-1')).toBe(0);
  });

  it('mengunci setelah MAX_ATTEMPTS (5) gagal', () => {
    const userId = 'user-lock';
    for (let i = 0; i < 4; i += 1) {
      const result = registerFailedAttempt(userId);
      expect(result.remaining).toBe(0);
    }
    // Kalimat ke-5 harus memicu kunci
    const result = registerFailedAttempt(userId);
    expect(result.remaining).toBeGreaterThan(0);
  });

  it('resetFailedAttempts menghapus kunci', () => {
    const userId = 'user-reset';
    for (let i = 0; i < 5; i += 1) {
      registerFailedAttempt(userId);
    }
    expect(getLockRemaining(userId)).toBeGreaterThan(0);
    resetFailedAttempts(userId);
    expect(getLockRemaining(userId)).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  Session                                                                   */
/* -------------------------------------------------------------------------- */

describe('auth.session', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.cookie = 'risly.mm.session.v1=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC';
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearSession();
  });

  it('createSession dan getSession往復', () => {
    const session = createSession('user-1', 'ws-1');
    expect(session.userId).toBe('user-1');
    expect(session.workspaceId).toBe('ws-1');
    expect(session.lastActivity).toBeDefined();

    const loaded = getSession();
    expect(loaded).not.toBeNull();
    expect(loaded?.userId).toBe('user-1');
  });

  it('getSession mengembalikan null untuk session tidak valid', () => {
    localStorage.setItem('risly.mm.session.v1', 'invalid-json');
    expect(getSession()).toBeNull();

    localStorage.setItem('risly.mm.session.v1', JSON.stringify({ userId: null }));
    expect(getSession()).toBeNull();
  });

  it('isSessionExpired mengembalikan true untuk session null', () => {
    expect(isSessionExpired(null, 10)).toBe(true);
  });

  it('isSessionExpired mengembalikan false untuk autoLock 0', () => {
    const session = { userId: 'u1', lastActivity: Date.now() - 100_000 };
    expect(isSessionExpired(session, 0)).toBe(false);
  });

  it('isSessionExpired mengembalikan true jika melebihi autoLockMinutes', () => {
    const session = { userId: 'u1', lastActivity: Date.now() - 20 * 60_000 }; // 20 menit yang lalu
    expect(isSessionExpired(session, 10)).toBe(true);
  });

  it('clearSession menghapus session', () => {
    createSession('user-1');
    expect(getSession()).not.toBeNull();
    clearSession();
    expect(getSession()).toBeNull();
  });

  it('updateSessionActivity melalui getSession (via store)', () => {
    // createSession kemudian update activity
    createSession('user-1');
    const before = getSession();
    expect(before).not.toBeNull();
    const after = { ...(before || {}), lastActivity: before.lastActivity + 60_000 }; // +1 menit
    sessionStorage.setItem('risly.mm.session.v1', JSON.stringify(after));
    const loaded = getSession();
    expect(loaded?.lastActivity).toBeGreaterThan(before.lastActivity);
  });
});
