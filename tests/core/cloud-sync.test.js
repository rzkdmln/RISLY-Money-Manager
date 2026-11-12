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
});
