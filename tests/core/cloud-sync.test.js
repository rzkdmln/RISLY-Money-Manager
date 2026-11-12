/**
 * RISLY — Cloud sync regression tests.
 *
 * Fokus: memastikan perubahan dari anggota household SELALU diterapkan oleh
 * pemilik, termasuk saat revision bertabrakan (race) dan jam perangkat berbeda.
 */

import { describe, it, expect } from 'vitest';
import { Store } from '../../js/core/store.js';
import { Cloud } from '../../js/services/cloud.js';
import { createDefaultData } from '../../js/core/data.js';

vi.mock('../../js/services/gdrive.js', () => ({
  GoogleDrive: class {
    static accessToken = '';
  },
}));

// CloudSync tidak diekspor; ambil kelasnya dari singleton.
const CloudSync = Cloud.constructor;

/* -------------------------------------------------------------------------- */
/*  Fake Firebase RTDB (REST PATCH = shallow merge di level node)             */
/* -------------------------------------------------------------------------- */

class FakeDb {
  constructor() {
    this.node = null;
    this.writes = 0;
  }

  read() {
    return this.node ? JSON.parse(JSON.stringify(this.node)) : null;
  }

  patch(envelope) {
    const next = { ...(this.node || {}) };
    Object.keys(envelope).forEach((key) => {
      if (envelope[key] === null) delete next[key];
      else next[key] = JSON.parse(JSON.stringify(envelope[key]));
    });
    this.node = next;
    this.writes += 1;
  }
}

function makeStore(data) {
  const store = new Store();
  store.data = data;
  store.workspaceId = 'ws-test';
  store.currentUserId = data.users[0]?.id || null;
  store.registry = { accounts: {}, workspaces: {}, legacyWorkspaceId: null };
  store._idbReady = false;
  store.persist = () => Promise.resolve();
  return store;
}

function makeCloud(store, db, { path = 'households/owner', uid = 'owner' } = {}) {
  const cloud = new CloudSync();
  cloud.store = store;
  cloud.config = {
    provider: 'firebase',
    firebase: { path, householdUid: path.split('/')[1], uid },
  };
  cloud.firebaseUid = uid;
  cloud.connected = true;
  cloud.lastRevision = 0;
  cloud.lastSyncAt = null;
  cloud.lastRemoteFingerprint = null;
  cloud.adapter = {
    read: async () => db.read(),
    write: async (envelope) => {
      db.patch(envelope);
      return envelope;
    },
    destroy: async () => null,
  };
  cloud.setStatus = () => {};
  cloud.emitStatus = () => {};
  cloud.saveMeta = () => {};
  cloud.publishInviteCode = async () => ({ ok: true });
  return cloud;
}

function memberTransaction(id, note) {
  return {
    id,
    date: '2026-11-12',
    time: '09:00',
    type: 'expense',
    amount: 222,
    accountId: 'acc-cash',
    categoryId: 'cat-exp-food',
    note,
    createdAt: '2026-11-12T09:00:00.000Z',
    updatedAt: '2026-11-12T09:00:00.000Z',
  };
}

/* -------------------------------------------------------------------------- */
/*  handleRemote                                                              */
/* -------------------------------------------------------------------------- */

describe('cloud.handleRemote', () => {
  it('menerapkan perubahan remote walau revision sama dan jam perangkat lebih lambat', () => {
    const ownerData = createDefaultData({ name: 'Owner', email: 'o@x.id' });
    ownerData.users[0].id = 'user-owner';
    const store = makeStore(ownerData);
    const cloud = makeCloud(store, new FakeDb());

    // State sinkron terakhir pemilik: revision 3, jam pemilik lebih baru.
    cloud.lastRevision = 3;
    cloud.lastSyncAt = '2026-11-12T10:00:00.000Z';

    // Anggota menulis revision yang kebetulan sama (race) dan jamnya 5 menit
    // di belakang. Sebelum perbaikan, snapshot ini diabaikan permanen.
    const remoteData = createDefaultData({ name: 'Owner', email: 'o@x.id' });
    remoteData.transactions = [memberTransaction('tx_member_222', 'MEMBER 222')];

    cloud.handleRemote(
      { revision: 3, savedAt: '2026-11-12T09:55:00.000Z', data: remoteData },
      true
    );

    expect(store.transactions().some((tx) => tx.id === 'tx_member_222')).toBe(true);
  });

  it('tidak menggabungkan snapshot yang identik dua kali', () => {
    const ownerData = createDefaultData({ name: 'Owner', email: 'o@x.id' });
    ownerData.users[0].id = 'user-owner';
    const store = makeStore(ownerData);
    const cloud = makeCloud(store, new FakeDb());
    const merge = vi.spyOn(store, 'mergeRemote');

    const remoteData = createDefaultData({ name: 'Owner', email: 'o@x.id' });
    const snapshot = { revision: 7, savedAt: '2026-11-12T09:00:00.000Z', data: remoteData };

    cloud.handleRemote(snapshot, true);
    cloud.handleRemote(snapshot, true);

    expect(merge).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/*  push guard                                                                */
/* -------------------------------------------------------------------------- */

describe('cloud.push', () => {
  it('menolak menulis saat workspace belum siap (mencegah data cloud terhapus)', async () => {
    const store = makeStore(createDefaultData({ name: 'Owner', email: 'o@x.id' }));
    store.data = null;
    store._dataReady = false;
    const db = new FakeDb();
    db.node = { app: 'risly-money-manager', revision: 1, data: { transactions: [] } };
    const cloud = makeCloud(store, db);

    const result = await cloud.push({ immediate: true, force: true });

    expect(result.ok).toBe(false);
    expect(result.notReady).toBe(true);
    expect(db.writes).toBe(0);
    expect(db.node.data).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------- */
/*  Dua perangkat: anggota menambah -> pemilik menerima                       */
/* -------------------------------------------------------------------------- */

describe('sinkronisasi owner <-> anggota', () => {
  it('transaksi anggota sampai ke pemilik', async () => {
    const path = 'households/owner-uid';
    const db = new FakeDb();

    const ownerData = createDefaultData({ name: 'Owner', email: 'o@x.id' });
    ownerData.users[0].id = 'user-owner';
    const ownerStore = makeStore(ownerData);
    const owner = makeCloud(ownerStore, db, { path, uid: 'owner-uid' });
    await owner.push({ immediate: true, force: true, seed: true });

    const memberData = createDefaultData({ name: 'Member', email: 'm@x.id' });
    memberData.users[0].id = 'user-member';
    const memberStore = makeStore(memberData);
    const member = makeCloud(memberStore, db, { path, uid: 'member-uid' });
    memberStore.mergeRemote(db.read().data);
    member.lastRevision = db.read().revision;
    member.lastRemoteFingerprint = null;

    const tx = await memberStore.addTransaction({
      amount: 222,
      type: 'expense',
      categoryId: 'cat-exp-food',
      accountId: 'acc-cash',
      note: 'MEMBER TX 222',
    });
    await member.push({ immediate: true, force: true });

    expect(db.read().data.transactions.some((item) => item.id === tx.id)).toBe(true);

    owner.handleRemote(db.read(), true);
    expect(ownerStore.transactions().some((item) => item.id === tx.id)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  Bootstrap pemilik baru                                                    */
/* -------------------------------------------------------------------------- */

describe('cloud._connect', () => {
  it('pemilik baru men-seed household saat pembacaan ditolak 403', async () => {
    const store = makeStore(createDefaultData({ name: 'Owner', email: 'o@x.id' }));
    const db = new FakeDb();

    const cloud = new CloudSync();
    cloud.store = store;
    cloud.firebaseUid = 'owner-uid';
    cloud.config = {
      provider: 'firebase',
      firebase: { path: 'households/owner-uid', householdUid: 'owner-uid', uid: 'owner-uid' },
    };
    cloud.getFirebaseUid = async () => 'owner-uid';
    cloud.rememberedHousehold = () => '';
    cloud.rememberHousehold = () => {};
    cloud.syncMembershipFromCloud = async () => {};
    cloud.publishInviteCode = async () => ({ ok: true });
    cloud.setStatus = () => {};
    cloud.emitStatus = () => {};
    cloud.saveMeta = () => {};
    cloud.createAdapter = () => ({
      read: async () => {
        throw new Error('403 Forbidden — Permission denied');
      },
      write: async (envelope) => {
        db.patch(envelope);
        return envelope;
      },
      writeMember: async () => ({}),
      destroy: async () => null,
    });

    const result = await cloud._connect(cloud.config);
    cloud.stopEngine();

    expect(result.ok).toBe(true);
    expect(db.node?.owner).toBe('owner-uid');
    expect(Array.isArray(db.node?.data?.transactions)).toBe(true);
  });

  it('tidak membuat household baru saat pemeriksaan keanggotaan gagal', async () => {
    const store = makeStore(createDefaultData({ name: 'Member', email: 'm@x.id' }));
    const db = new FakeDb();

    const cloud = new CloudSync();
    cloud.store = store;
    cloud.firebaseUid = 'member-uid';
    // Path "teracuni" ke UID sendiri, padahal akun ini anggota household lain.
    cloud.config = {
      provider: 'firebase',
      firebase: { path: 'households/member-uid', householdUid: 'member-uid', uid: 'member-uid' },
    };
    cloud.getFirebaseUid = async () => 'member-uid';
    cloud.syncMembershipFromCloud = async () => {
      cloud.membershipChecked = false;
      return { checked: false, householdUid: 'member-uid' };
    };
    cloud.publishInviteCode = async () => ({ ok: true });
    cloud.setStatus = () => {};
    cloud.emitStatus = () => {};
    cloud.saveMeta = () => {};
    cloud.createAdapter = () => ({
      read: async () => {
        throw new Error('403 Forbidden — Permission denied');
      },
      write: async (envelope) => {
        db.patch(envelope);
        return envelope;
      },
      writeMember: async () => ({}),
      destroy: async () => null,
    });

    const result = await cloud._connect(cloud.config);
    cloud.stopEngine();

    expect(result.ok).toBe(true);
    expect(db.writes).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  Pemulihan keanggotaan household                                           */
/* -------------------------------------------------------------------------- */

describe('cloud.syncMembershipFromCloud', () => {
  it('memperbaiki pemetaan lokal yang menunjuk ke UID sendiri', async () => {
    const store = makeStore(createDefaultData({ name: 'Member', email: 'm@x.id' }));
    const cloud = new CloudSync();
    cloud.store = store;
    cloud.config = {
      provider: 'firebase',
      firebase: { path: 'households/member-uid', householdUid: 'member-uid', uid: 'member-uid' },
    };
    cloud.firebaseUid = 'member-uid';
    cloud.rememberedHousehold = () => 'member-uid';
    cloud.rememberHousehold = vi.fn();
    cloud.adapter = { readUserHousehold: async () => 'owner-uid' };

    const result = await cloud.syncMembershipFromCloud('member-uid');

    expect(result).toEqual({ checked: true, householdUid: 'owner-uid' });
    expect(cloud.rememberHousehold).toHaveBeenCalledWith('member-uid', 'owner-uid');
    expect(cloud.membershipChecked).toBe(true);
  });

  it('mempercayai pemetaan anggota yang sudah ada tanpa query ulang', async () => {
    const cloud = new CloudSync();
    cloud.config = {
      provider: 'firebase',
      firebase: { path: 'households/owner-uid', householdUid: 'owner-uid', uid: 'member-uid' },
    };
    cloud.firebaseUid = 'member-uid';
    cloud.rememberedHousehold = () => 'owner-uid';
    cloud.rememberHousehold = vi.fn();
    cloud.adapter = {
      readUserHousehold: vi.fn(async () => {
        throw new Error('tidak boleh dipanggil');
      }),
    };

    const result = await cloud.syncMembershipFromCloud('member-uid');

    expect(result).toEqual({ checked: true, householdUid: 'owner-uid' });
    expect(cloud.adapter.readUserHousehold).not.toHaveBeenCalled();
    expect(cloud.rememberHousehold).not.toHaveBeenCalled();
  });

  it('menandai pemeriksaan gagal saat cloud tidak bisa dibaca', async () => {
    const cloud = new CloudSync();
    cloud.config = {
      provider: 'firebase',
      firebase: { path: 'households/member-uid', householdUid: 'member-uid', uid: 'member-uid' },
    };
    cloud.firebaseUid = 'member-uid';
    cloud.rememberedHousehold = () => '';
    cloud.rememberHousehold = vi.fn();
    cloud.adapter = {
      readUserHousehold: async () => {
        throw new Error('offline');
      },
    };

    const result = await cloud.syncMembershipFromCloud('member-uid');

    expect(result).toEqual({ checked: false, householdUid: '' });
    expect(cloud.membershipChecked).toBe(false);
    expect(cloud.rememberHousehold).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/*  Merge aman: snapshot default tidak boleh menimpa household                */
/* -------------------------------------------------------------------------- */

describe('store.mergeRemote — identitas household', () => {
  function makeMergeStore() {
    const local = createDefaultData({ name: 'Member', email: 'm@x.id' });
    const remote = createDefaultData({ name: 'Owner', email: 'o@x.id' });
    remote.settings.inviteCode = 'OWNER1';
    remote.settings.householdName = 'Ruang Owner';
    remote.settings.workspaceName = 'Ruang Owner';
    return { store: makeStore(local), local, remote };
  }

  it('memilih remote saat timestamp sama (data default tidak menimpa remote)', () => {
    const { store, local, remote } = makeMergeStore();
    const localCat = local.categories.find((item) => item.id === 'cat-exp-food');
    const remoteCat = remote.categories.find((item) => item.id === 'cat-exp-food');
    localCat.name = 'Makanan Default';
    remoteCat.name = 'Makanan Owner';
    localCat.updatedAt = remoteCat.updatedAt = '2025-01-01T00:00:00.000Z';

    store.mergeRemote(remote);

    expect(store.data.categories.find((item) => item.id === 'cat-exp-food').name).toBe(
      'Makanan Owner'
    );
  });

  it('mode preferRemote mengadopsi seluruh data + pengaturan remote', () => {
    const { store, local, remote } = makeMergeStore();
    store._preferRemoteData = true;
    store._preferRemoteSettings = true;
    local.settings.inviteCode = 'LOCAL1';
    local.settings.householdName = 'Keuangan Saya';
    local.settings.updatedAt = '2026-11-12T08:00:00.000Z';
    remote.settings.updatedAt = '2026-11-01T00:00:00.000Z';
    const localCat = local.categories.find((item) => item.id === 'cat-exp-food');
    const remoteCat = remote.categories.find((item) => item.id === 'cat-exp-food');
    localCat.name = 'Default Lokal';
    remoteCat.name = 'Makanan Owner';
    localCat.updatedAt = '2026-11-12T08:00:00.000Z';
    remoteCat.updatedAt = '2026-11-01T00:00:00.000Z';

    store.mergeRemote(remote);

    expect(store.data.settings.inviteCode).toBe('OWNER1');
    expect(store.data.settings.householdName).toBe('Ruang Owner');
    expect(store.data.categories.find((item) => item.id === 'cat-exp-food').name).toBe(
      'Makanan Owner'
    );
    expect(store._preferRemoteData).toBe(false);
  });

  it('anggota tidak bisa mengubah kode undangan pemilik', () => {
    const { store, local, remote } = makeMergeStore();
    local.settings.inviteCode = 'STALE1';
    local.settings.updatedAt = '2026-11-12T08:00:00.000Z';
    remote.settings.updatedAt = '2026-11-01T00:00:00.000Z';

    store.mergeRemote(remote, { isOwner: false });

    expect(store.data.settings.inviteCode).toBe('OWNER1');
  });

  it('log konflik hanya mencatat saat data lokal menimpa remote', () => {
    const { store, local, remote } = makeMergeStore();
    const localCat = local.categories.find((item) => item.id === 'cat-exp-food');
    const remoteCat = remote.categories.find((item) => item.id === 'cat-exp-food');
    remoteCat.name = 'Makanan Owner';
    remoteCat.updatedAt = '2026-11-12T08:00:00.000Z';
    localCat.name = 'Makanan Default';
    localCat.updatedAt = '2026-11-01T00:00:00.000Z';

    store.mergeRemote(remote);
    expect(store.getConflictLog()).toHaveLength(0);

    const fresh = makeMergeStore();
    const freshLocalCat = fresh.local.categories.find((item) => item.id === 'cat-exp-food');
    const freshRemoteCat = fresh.remote.categories.find((item) => item.id === 'cat-exp-food');
    freshRemoteCat.name = 'Makanan Owner';
    freshRemoteCat.updatedAt = '2026-11-01T00:00:00.000Z';
    freshLocalCat.name = 'Makanan Default';
    freshLocalCat.updatedAt = '2026-11-12T08:00:00.000Z';

    fresh.store.mergeRemote(fresh.remote);

    expect(fresh.store.getConflictLog().length).toBeGreaterThan(0);
  });
});
