/**
 * RISLY — Firebase Realtime Database Security Rules Uji (Emulator Suite)
 *
 * Skenario Fase 6:
 * 1. Owner membuat household baru → diizinkan, menjadi owner
 * 2. Anggota non-owner tidak boleh mengubah settings → ditolak
 * 3. Pengguna luar household tidak boleh baca/tulis → ditolak
 * 4. Anggota boleh menulis subtree data → diizinkan
 * 5. Kode undangan kedaluwarsa tidak boleh dibaca → ditolak
 * 6. Hanya owner yang boleh menulis inviteCodes → anggota ditolak
 *
 * Prasyarat:
 *   npm install --save-dev @firebase/rules-unit-testing
 *   firebase emulators:start --only database
 *   Pastikan firebase.json menunjuk ke firebase-security-rules.json
 *   npx vitest run tests/rules/rules.test.js
 */

import {
  assertFails,
  assertSucceeds,
  initializeTestApp,
} from '@firebase/rules-unit-testing';

const PROJECT_ID = 'risly-rules-test';

function auth(uid, email = null) {
  return uid ? { uid, email: email || `${uid}@example.com` } : null;
}

function getDatabase(auth) {
  const app = initializeTestApp({
    projectId: PROJECT_ID,
    auth: auth(),
  });
  return app.database();
}

describe('Firebase RTDB Security Rules — Fase 6', () => {
  it('owner membuat household baru menjadi owner', async () => {
    const db = getDatabase(auth('owner-1', 'owner@example.com'));
    await assertSucceeds(
      db.ref('households/household-1').set({
        app: 'risly-money-manager',
        schemaVersion: 5,
        data: {
          users: [],
          accounts: [],
          categories: [],
          transactions: [],
          settings: {},
        },
        revision: 1,
        savedAt: new Date().toISOString(),
        owner: 'owner-1',
      })
    );
  });

  it('anggota non-owner tidak boleh mengubah settings', async () => {
    const db = getDatabase(auth('member-1', 'member@example.com'));
    await assertFails(
      db.ref('households/household-1/settings').set({ householdName: 'Diubah' })
    );
  });

  it('pengguna luar household tidak boleh baca', async () => {
    const db = getDatabase(auth('outsider', 'outsider@example.com'));
    await assertFails(db.ref('households/household-1').once('value'));
  });

  it('anggota boleh menulis subtree data', async () => {
    const db = getDatabase(auth('member-1', 'member@example.com'));
    await assertSucceeds(
      db.ref('households/household-1/data').set({
        users: [],
        accounts: [],
        categories: [],
        transactions: [],
        settings: {},
      })
    );
  });

  it('kode undangan kedaluwarsa tidak boleh dibaca', async () => {
    const db = getDatabase(auth('member-1', 'member@example.com'));
    await assertFails(db.ref('inviteCodes/EXPIRED123').once('value'));
  });

  it('hanya owner yang boleh menulis inviteCodes', async () => {
    const db = getDatabase(auth('member-1', 'member@example.com'));
    await assertFails(
      db.ref('inviteCodes/NEWCODE').set({
        ownerUid: 'member-1',
        householdName: 'Test',
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      })
    );
  });
});
