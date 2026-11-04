import { APP, CLOUD_PROVIDERS, FIREBASE_CONFIG } from './config.js';
import { deepClone, nowISO } from './utils.js';

const FIREBASE_VERSION = '10.12.5';
const FIREBASE_APP_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`;
const FIREBASE_DB_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-database.js`;

function makeEnvelope(data, revision = 1, savedAt = nowISO(), owner = null) {
  const envelope = {
    app: 'risly-money-manager',
    schemaVersion: APP.schemaVersion,
    revision: Math.max(1, Number(revision) || 1),
    savedAt,
    client: getClientId(),
    data,
  };
  if (owner) envelope.owner = owner;
  return envelope;
}

function extractEnvelope(value) {
  const candidate = value?.record ?? value;
  if (!candidate || typeof candidate !== 'object') return null;
  const data = candidate.data || (candidate.transactions ? candidate : null);
  if (!data) return null;
  return {
    app: candidate.app || 'risly-money-manager',
    schemaVersion: candidate.schemaVersion || APP.schemaVersion,
    revision: Math.max(1, Number(candidate.revision) || 1),
    savedAt: candidate.savedAt || candidate.updated_at || nowISO(),
    client: candidate.client || null,
    data,
  };
}

function getClientId() {
  let id = localStorage.getItem(APP.clientKey);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `client_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(APP.clientKey, id);
  }
  return id;
}

function timeoutSignal(ms = 16_000) {
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

async function getFirebaseAuth() {
  const appMod = await import(FIREBASE_APP_URL);
  const authMod = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`);
  const { initializeApp, getApps, getApp } = appMod;
  const { getAuth } = authMod;
  const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
  return getAuth(app);
}

async function getFirebaseIdToken(auth) {
  const user = auth?.currentUser;
  if (!user) return null;
  try { return await user.getIdToken(); } catch { return null; }
}

async function requestJSON(url, options = {}, timeout = 16_000) {
  const response = await fetch(url, {
    ...options,
    signal: options.signal || timeoutSignal(timeout),
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const detail = typeof body === 'object' ? body?.message || body?.error || JSON.stringify(body) : body;
    throw new Error(`${response.status} ${response.statusText}${detail ? ` — ${detail}` : ''}`);
  }
  return body;
}

/* -------------------------------------------------------------------------- */
/*  JSONBin adapter                                                           */
/* -------------------------------------------------------------------------- */

class JsonBinAdapter {
  constructor(config) {
    this.config = config;
    this.binId = String(config.jsonbin?.binId || '').trim();
    this.masterKey = String(config.jsonbin?.masterKey || '').trim();
    if (!this.binId || !this.masterKey) throw new Error('Bin ID dan Master Key JSONBin wajib diisi.');
  }

  headers(extra = {}) {
    return {
      'X-Master-Key': this.masterKey,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  async read() {
    const body = await requestJSON(`https://api.jsonbin.io/v3/b/${encodeURIComponent(this.binId)}/latest`, {
      method: 'GET',
      headers: this.headers({ 'X-Bin-Meta': 'false' }),
      cache: 'no-store',
    });
    return extractEnvelope(body);
  }

  async write(envelope) {
    await requestJSON(`https://api.jsonbin.io/v3/b/${encodeURIComponent(this.binId)}`, {
      method: 'PUT',
      headers: this.headers({ 'X-Bin-Versioning': 'false' }),
      body: JSON.stringify(envelope),
    });
    return envelope;
  }

  async subscribe() {
    return null;
  }
}

async function createJsonBin(config, envelope) {
  const masterKey = String(config.jsonbin?.masterKey || '').trim();
  if (!masterKey) throw new Error('Master Key JSONBin wajib diisi.');
  const name = String(config.jsonbin?.binName || 'RISLY Money Manager').trim();
  const body = await requestJSON('https://api.jsonbin.io/v3/b', {
    method: 'POST',
    headers: {
      'X-Master-Key': masterKey,
      'X-Bin-Name': name,
      'X-Bin-Private': 'true',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(envelope),
  });
  const id = body?.metadata?.id || body?.id;
  if (!id) throw new Error('JSONBin tidak mengembalikan Bin ID.');
  return id;
}

/* -------------------------------------------------------------------------- */
/*  Supabase REST adapter                                                     */
/* -------------------------------------------------------------------------- */

class SupabaseAdapter {
  constructor(config) {
    this.url = String(config.supabase?.url || '').replace(/\/+$/, '');
    this.anonKey = String(config.supabase?.anonKey || '').trim();
    this.table = String(config.supabase?.table || 'households').replace(/[^a-zA-Z0-9_]/g, '');
    this.rowId = String(config.supabase?.rowId || APP.householdId);
    if (!this.url || !this.anonKey) throw new Error('URL dan anon key Supabase wajib diisi.');
    if (!this.table) throw new Error('Nama tabel Supabase tidak valid.');
  }

  headers(extra = {}) {
    return {
      apikey: this.anonKey,
      Authorization: `Bearer ${this.anonKey}`,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  endpoint() {
    return `${this.url}/rest/v1/${this.table}`;
  }

  async read() {
    const query = `?id=eq.${encodeURIComponent(this.rowId)}&select=payload,revision,updated_at&limit=1`;
    const rows = await requestJSON(`${this.endpoint()}${query}`, {
      method: 'GET',
      headers: this.headers(),
      cache: 'no-store',
    });
    if (!Array.isArray(rows) || !rows.length) return null;
    return extractEnvelope(rows[0].payload);
  }

  async write(envelope) {
    const query = '?on_conflict=id';
    const body = [{
      id: this.rowId,
      payload: envelope,
      revision: envelope.revision,
      updated_at: envelope.savedAt,
    }];
    await requestJSON(`${this.endpoint()}${query}`, {
      method: 'POST',
      headers: this.headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(body),
    });
    return envelope;
  }

  async subscribe() {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Firebase Realtime Database adapter                                        */
/* -------------------------------------------------------------------------- */

class FirebaseAdapter {
  constructor(config) {
    this.config = config;
    const raw = config.firebase?.configJson;
    let parsed = null;
    if (raw) {
      try {
        parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch {
        throw new Error('Konfigurasi Firebase bukan JSON yang valid.');
      }
    } else {
      parsed = FIREBASE_CONFIG;
    }
    if (!parsed || !parsed.databaseURL) throw new Error('databaseURL Firebase wajib ada.');
    this.firebaseConfig = parsed;
    this.databaseURL = String(parsed.databaseURL).replace(/\/+$/, '');
    this.ownerUid = null;
    this.path = String(config.firebase?.path || `households/${APP.householdId}`).replace(/^\/+|\/+$/g, '');
  }

  setOwner(uid) {
    if (!uid) return;
    this.ownerUid = String(uid);
    this.path = `households/${this.ownerUid}`;
  }

  async auth() {
    return getFirebaseAuth();
  }

  async idToken() {
    const auth = await this.auth();
    return getFirebaseIdToken(auth);
  }

  async endpoint() {
    const token = await this.idToken();
    const suffix = token ? `?auth=${encodeURIComponent(token)}` : '';
    return `${this.databaseURL}/${this.path}.json${suffix}`;
  }

  async read() {
    const body = await requestJSON(await this.endpoint(), {
      method: 'GET',
      cache: 'no-store',
    });
    return extractEnvelope(body);
  }

  async write(envelope) {
    const body = await requestJSON(await this.endpoint(), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
    });
    return envelope;
  }

  async subscribe(callback = () => {}) {
    // Use the Firebase SDK so remote changes arrive in real time instead of
    // waiting for the next poll. The SDK is loaded lazily to keep boot fast and
    // the listener is bound to the Firebase Auth instance so it only receives
    // data for the currently signed-in household (auth != null in the rules).
    const [appMod, dbMod, authMod] = await Promise.all([
      import(FIREBASE_APP_URL),
      import(FIREBASE_DB_URL),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
    ]);
    const { initializeApp, getApps, getApp } = appMod;
    const { getDatabase, ref, onValue } = dbMod;
    const { getAuth } = authMod;
    const app = getApps().length ? getApp() : initializeApp(this.firebaseConfig);
    const auth = getAuth(app);
    const db = getDatabase(app, auth);
    const listenerRef = ref(db, this.path);
    this.listenerRef = listenerRef;
    this.unsubscribe = onValue(
      listenerRef,
      (snapshot) => {
        const envelope = extractEnvelope(snapshot.val());
        if (envelope) callback(envelope);
      },
      (error) => console.warn('Firebase realtime listener error:', error),
    );
    return () => {
      try { this.unsubscribe?.(); } catch { /* noop */ }
      this.unsubscribe = null;
    };
  }

  async destroy() {
    try { this.unsubscribe?.(); } catch { /* noop */ }
    this.unsubscribe = null;
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Cloud synchronisation controller                                          */
/* -------------------------------------------------------------------------- */

class CloudSync {
  constructor() {
    this.store = null;
    this.config = this.loadConfig();
    this.firebaseUid = null;
    this.adapter = null;
    this.unsubscribeStore = null;
    this.unsubscribeRemote = null;
    this.pollTimer = null;
    this.pushTimer = null;
    this.syncing = false;
    this.pendingPush = false;
    this.changeCounter = 0;
    this.lastRevision = 0;
    this.lastSyncAt = null;
    this.lastError = null;
    this.connected = false;
    this.destroyed = false;
    this.state = this.config.provider === 'local' ? 'local' : 'idle';
    this.message = '';
    this.listeners = new Set();
    this.meta = this.loadMeta();
    if (this.meta.lastSyncAt) this.lastSyncAt = this.meta.lastSyncAt;
    if (this.meta.lastRevision) this.lastRevision = Number(this.meta.lastRevision) || 0;
    this._networkHandler = () => this.handleNetworkChange();
    window.addEventListener('online', this._networkHandler);
    window.addEventListener('offline', this._networkHandler);
  }

  loadConfig() {
    try {
      const parsed = JSON.parse(localStorage.getItem(APP.cloudKey) || 'null');
      if (parsed?.provider === 'gdrive') {
        // Google Drive is backup-only now. Keep the Google account link but
        // stop the old automatic sync engine.
        const migrated = { provider: 'local' };
        localStorage.setItem(APP.cloudKey, JSON.stringify(migrated));
        return migrated;
      }
      if (parsed?.provider) return parsed;
    } catch { /* noop */ }
    // Default to the built-in Firebase project so sync works out of the box.
    return { provider: 'firebase', firebase: { path: `households/${APP.householdId}` } };
  }

  async getFirebaseUid() {
    if (this.firebaseUid) return this.firebaseUid;
    if (this.config.provider !== 'firebase') return null;
    try {
      const auth = await getFirebaseAuth();
      const user = auth?.currentUser;
      if (user?.uid) {
        this.firebaseUid = user.uid;
        return user.uid;
      }
    } catch (error) {
      console.warn('Firebase auth restore failed:', error);
    }
    return null;
  }

  /**
   * Menunggu hingga Firebase Auth mengonfirmasi status auth (onAuthStateChanged).
   * Hanya mengembalikan uid setelah user != null, atau null bila belum login.
   */
  async waitForFirebaseUser() {
    if (this.config.provider !== 'firebase') return this.firebaseUid || null;
    const auth = await getFirebaseAuth();
    let uid = auth?.currentUser?.uid || this.firebaseUid || null;
    if (uid) {
      this.firebaseUid = uid;
      return uid;
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        try { unsubscribe?.(); } catch { /* noop */ }
        resolve(value);
      };
      let unsubscribe = null;
      try {
        unsubscribe = auth?.onAuthStateChanged?.((user) => {
          if (user?.uid) {
            this.firebaseUid = user.uid;
            finish(user.uid);
            return;
          }
          finish(null);
        });
      } catch {
        return finish(null);
      }
      setTimeout(() => finish(null), 12_000);
    });
  }

  canSync() {
    // Jangan mengirim permintaan sync sebelum Firebase Auth mengonfirmasi user.
    return this.config?.provider === 'local' || Boolean(this.firebaseUid);
  }

  async signInWithGoogle(accessToken) {
    if (!accessToken) return null;
    if (this.config.provider !== 'firebase') return null;
    try {
      const appMod = await import(FIREBASE_APP_URL);
      const authMod = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`);
      const { initializeApp, getApps, getApp } = appMod;
      const { getAuth, GoogleAuthProvider, signInWithCredential } = authMod;
      const app = getApps().length ? getApp() : initializeApp(this.firebaseConfig || FIREBASE_CONFIG);
      const auth = getAuth(app);
      const credential = GoogleAuthProvider.credential(null, accessToken);
      const result = await signInWithCredential(auth, credential);
      const uid = result.user?.uid;
      if (uid) {
        this.firebaseUid = uid;
        await this.applyFirebaseUid(uid);
      }
      return uid;
    } catch (error) {
      console.warn('Firebase sign-in failed:', error);
      return null;
    }
  }

  async applyFirebaseUid(uid) {
    if (!uid || this.config.provider !== 'firebase') return;
    // If there is no saved cloud config yet, use a per-user household path.
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(APP.cloudKey) || 'null'); } catch { saved = null; }
    const hasPath = Boolean(saved?.firebase?.path) && saved.firebase.path !== `households/${APP.householdId}`;
    if (!saved || !saved.firebase?.path || !hasPath) {
      const next = { provider: 'firebase', firebase: { path: `households/${uid}` } };
      localStorage.setItem(APP.cloudKey, JSON.stringify(next));
      this.config = next;
      await this.connect(this.config, { initial: true });
    }
  }

  loadMeta() {
    try {
      return JSON.parse(localStorage.getItem(APP.syncMetaKey) || '{}') || {};
    } catch {
      return {};
    }
  }

  saveMeta(patch = {}) {
    this.meta = { ...this.meta, ...patch };
    localStorage.setItem(APP.syncMetaKey, JSON.stringify(this.meta));
  }

  getConfig() {
    return deepClone(this.config);
  }

  getStatus() {
    return {
      state: navigator.onLine === false && this.config.provider !== 'local' ? 'offline' : this.state,
      provider: this.config.provider,
      providerLabel: CLOUD_PROVIDERS[this.config.provider]?.label || 'Lokal',
      message: this.message,
      error: this.lastError,
      lastSyncAt: this.lastSyncAt,
      revision: this.lastRevision,
      online: navigator.onLine !== false,
      connected: this.connected,
      hasConfig: this.config.provider !== 'local',
    };
  }

  onStatus(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emitStatus() {
    const status = this.getStatus();
    this.listeners.forEach((listener) => {
      try {
        listener(status);
      } catch (error) {
        console.error('Cloud status listener error:', error);
      }
    });
  }

  setStatus(state, message = '') {
    this.state = state;
    this.message = message;
    this.emitStatus();
  }

  init(store) {
    this.store = store;
    this.unsubscribeStore = store.subscribe((event) => {
      if (event.source === 'local') {
        this.changeCounter += 1;
        if (this.connected && this.config.provider !== 'local') this.schedulePush();
      }
    });
    return this;
  }

  async bootstrap({ waitForAuth = false } = {}) {
    if (this.config.provider === 'local') {
      this.state = 'local';
      this.emitStatus();
      return { ok: true, local: true };
    }
    if (this.config.provider === 'firebase') {
      const uid = waitForAuth ? await this.waitForFirebaseUser() : await this.getFirebaseUid();
      if (!uid) {
        // Belum ada pengguna Firebase yang terkonfirmasi. Jangan sentuh RTDB
        // sebelum onAuthStateChanged mengonfirmasi user, karena aturan keamanan
        // saat ini mensyaratkan auth != null.
        this.connected = false;
        this.firebaseUid = null;
        this.adapter = null;
        this.setStatus('idle', 'Menunggu autentikasi Firebase…');
        return { ok: true, skipped: true };
      }
      this.firebaseUid = uid;
      const next = { provider: 'firebase', firebase: { path: `households/${uid}` } };
      const changed = JSON.stringify(this.config) !== JSON.stringify(next);
      this.config = next;
      localStorage.setItem(APP.cloudKey, JSON.stringify(this.config));
      if (this.adapter?.setOwner) this.adapter.setOwner(uid);
    }
    const timeout = new Promise((resolve) => setTimeout(() => resolve({ ok: false, timeout: true }), 8_000));
    const work = this.connect(this.config, { initial: true }).catch((error) => {
      this.lastError = error.message;
      this.setStatus('error', error.message);
      return { ok: false, error };
    });
    const result = await Promise.race([work, timeout]);
    this.emitStatus();
    return result;
  }

  createAdapter(config) {
    switch (config.provider) {
      case 'jsonbin':
        return new JsonBinAdapter(config);
      case 'supabase':
        return new SupabaseAdapter(config);
      case 'firebase':
        return new FirebaseAdapter(config);
      default:
        return null;
    }
  }

  async connect(config, { initial = false } = {}) {
    this.stopEngine();
    if (this.adapter?.destroy) {
      try { await this.adapter.destroy(); } catch { /* noop */ }
    }
    this.adapter = null;
    this.config = deepClone(config);
    localStorage.setItem(APP.cloudKey, JSON.stringify(this.config));
    this.lastError = null;
    if (this.config.provider === 'local') {
      this.connected = false;
      this.setStatus('local', '');
      return { ok: true, local: true };
    }
    this.setStatus('connecting', 'Menghubungkan…');
    try {
      if (this.config.provider === 'firebase') {
        const uid = await this.getFirebaseUid();
        if (uid) {
          this.firebaseUid = uid;
          if (this.adapter) this.adapter.ownerUid = uid;
          let saved = null;
          try { saved = JSON.parse(localStorage.getItem(APP.cloudKey) || 'null'); } catch { saved = null; }
          const hasPath = Boolean(saved?.firebase?.path) && saved.firebase.path !== `households/${APP.householdId}`;
          if (!saved || !saved.firebase?.path || !hasPath) {
            const next = { provider: 'firebase', firebase: { path: `households/${uid}` } };
            localStorage.setItem(APP.cloudKey, JSON.stringify(next));
            this.config = next;
            this.adapter = this.createAdapter(this.config);
          }
        }
      }
      this.adapter = this.createAdapter(this.config);
      if (this.config.provider === 'firebase' && this.firebaseUid && this.adapter?.setOwner) {
        this.adapter.setOwner(this.firebaseUid);
      }
      const remote = await this.adapter.read();
      if (remote?.data) {
        this.lastRevision = remote.revision || 0;
        this.lastSyncAt = remote.savedAt || nowISO();
        const merged = this.store.mergeRemote(remote.data);
        this.saveMeta({
          provider: this.config.provider,
          lastRevision: this.lastRevision,
          lastSyncedAt: this.lastSyncAt,
          lastRemoteSavedAt: remote.savedAt || null,
        });
        if (merged.changed && !initial) {
          this.message = 'Data dari perangkat lain sudah digabungkan.';
        }
      } else {
        // Remote is empty: seed it with the local household snapshot.
        await this.push({ immediate: true, force: true, seed: true });
      }
      this.connected = true;
      this.startEngine();
      if (this.state !== 'synced') this.setStatus('synced', 'Terhubung.');
      else this.emitStatus();
      return { ok: true, remote };
    } catch (error) {
      console.error('Cloud connect failed:', error);
      this.connected = false;
      this.lastError = error.message;
      this.setStatus('error', error.message);
      // Polling can recover from transient network failures, but not config errors.
      if (!/wajib|valid|JSON|tidak|belum diaktifkan|Enable/i.test(error.message)) this.startEngine();
      return { ok: false, error };
    }
  }

  async disconnect() {
    this.stopEngine();
    if (this.adapter?.destroy) await this.adapter.destroy();
    this.adapter = null;
    this.connected = false;
    this.config = { provider: 'local' };
    localStorage.setItem(APP.cloudKey, JSON.stringify(this.config));
    this.lastError = null;
    this.lastRevision = 0;
    this.lastSyncAt = null;
    this.saveMeta({ provider: 'local', lastRevision: 0, lastSyncedAt: null });
    this.setStatus('local', '');
  }

  stopEngine() {
    clearTimeout(this.pushTimer);
    clearInterval(this.pollTimer);
    this.pushTimer = null;
    this.pollTimer = null;
    if (this.unsubscribeRemote) {
      try { this.unsubscribeRemote(); } catch { /* noop */ }
      this.unsubscribeRemote = null;
    }
    if (this.adapter?.destroy) {
      // Firebase app cleanup happens on explicit disconnect; avoid destroying on reconnect too early.
    }
  }

  startPolling() {
    clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      if (!document.hidden) this.pull({ background: true }).catch(() => {});
    }, APP.syncPollMs);
  }

  async startEngine() {
    if (!this.adapter) return;
    clearInterval(this.pollTimer);
    if (this.config.provider === 'firebase' && this.adapter.subscribe) {
      try {
        this.unsubscribeRemote = await this.adapter.subscribe((remote) => this.handleRemote(remote, true));
        if (!this.unsubscribeRemote) this.startPolling();
      } catch (error) {
        // Real-time listener unavailable (e.g. offline or blocked SDK); keep
        // syncing with the previous polling behaviour.
        console.warn('Firebase realtime tidak tersedia, memakai polling:', error);
        this.startPolling();
      }
    } else {
      this.startPolling();
    }
  }

  handleNetworkChange() {
    if (this.config.provider === 'local') return;
    if (navigator.onLine === false) {
      this.setStatus('offline', 'Perangkat sedang offline. Perubahan disimpan lokal.');
      return;
    }
    this.setStatus('syncing', 'Kembali online. Menyinkronkan…');
    this.syncNow({ silent: true }).catch(() => {});
  }

  schedulePush(delay = 900) {
    if (!this.connected || !this.adapter) return;
    this.pendingPush = true;
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      this.push().catch(() => {});
    }, delay);
  }

  async push({ immediate = false, force = false, seed = false } = {}) {
    if (!this.adapter || this.config.provider === 'local') return { ok: false, local: true };
    if (navigator.onLine === false) {
      this.pendingPush = true;
      this.setStatus('offline', 'Offline — perubahan menunggu koneksi.');
      return { ok: false, offline: true };
    }
    if (this.syncing) {
      this.pendingPush = true;
      return { ok: false, busy: true };
    }
    if (immediate) clearTimeout(this.pushTimer);
    this.syncing = true;
    this.pendingPush = false;
    this.setStatus('syncing', 'Menyimpan ke cloud…');
    const counterAtStart = this.changeCounter;
    try {
      let remote = null;
      try {
        remote = await this.adapter.read();
      } catch (error) {
        // A write can still succeed when a read is rate-limited; but do not clobber a live remote.
        if (!seed) throw error;
      }
      if (remote?.data) {
        this.lastRevision = Math.max(this.lastRevision, remote.revision || 0);
        const merged = this.store.mergeRemote(remote.data);
        if (merged.changed) this.message = 'Perubahan dari perangkat lain digabungkan.';
      }
      const local = this.store.data;
      const revision = Math.max(
        Number(this.lastRevision) || 0,
        Number(remote?.revision) || 0,
        Number(local.revision) || 0,
      ) + 1;
      const envelope = makeEnvelope(local, revision, nowISO(), this.firebaseUid);
      await this.adapter.write(envelope);
      this.lastRevision = revision;
      this.lastSyncAt = envelope.savedAt;
      this.lastError = null;
      this.saveMeta({
        provider: this.config.provider,
        lastRevision: revision,
        lastSyncedAt: envelope.savedAt,
        lastRemoteSavedAt: envelope.savedAt,
      });
      this.setStatus('synced', 'Tersinkronisasi.');
      return { ok: true, revision };
    } catch (error) {
      console.error('Cloud push failed:', error);
      this.lastError = error.message;
      this.pendingPush = true;
      this.setStatus('error', error.message);
      return { ok: false, error };
    } finally {
      this.syncing = false;
      if (this.changeCounter !== counterAtStart || this.pendingPush) {
        this.schedulePush(1_500);
      }
    }
  }

  async pull({ background = false } = {}) {
    if (!this.adapter || !this.connected || this.syncing) return { ok: false };
    if (navigator.onLine === false) {
      this.setStatus('offline', 'Perangkat offline.');
      return { ok: false, offline: true };
    }
    try {
      const remote = await this.adapter.read();
      if (!remote?.data) return { ok: true, empty: true };
      this.handleRemote(remote, false);
      return { ok: true };
    } catch (error) {
      this.lastError = error.message;
      if (!background) this.setStatus('error', error.message);
      return { ok: false, error };
    }
  }

  handleRemote(remote, realtime = false) {
    if (!remote?.data) return;
    const remoteSaved = new Date(remote.savedAt || 0).getTime();
    const lastSaved = new Date(this.lastSyncAt || 0).getTime();
    const sameRevision = Number(remote.revision) === Number(this.lastRevision);
    if (sameRevision && remoteSaved <= lastSaved) return;
    this.lastRevision = Math.max(Number(this.lastRevision) || 0, Number(remote.revision) || 0);
    this.lastSyncAt = remote.savedAt || nowISO();
    const result = this.store.mergeRemote(remote.data);
    this.saveMeta({
      provider: this.config.provider,
      lastRevision: this.lastRevision,
      lastSyncedAt: this.lastSyncAt,
      lastRemoteSavedAt: remote.savedAt || null,
    });
    if (result.changed) {
      this.setStatus('synced', 'Diperbarui dari perangkat lain.');
    } else if (realtime) {
      this.setStatus('synced', 'Tersinkronisasi.');
    }
  }

  async syncNow({ silent = false } = {}) {
    if (!this.adapter || this.config.provider === 'local') {
      if (!silent) this.setStatus('local', 'Sinkronisasi cloud belum diaktifkan.');
      return { ok: false, local: true };
    }
    if (this.config.provider === 'firebase' && !this.firebaseUid) {
      // Belum ada Firebase Auth user yang terkonfirmasi; tunda sinkronisasi.
      return { ok: false, skipped: true };
    }
    if (!this.connected) {
      return this.connect(this.config);
    }
    await this.pull();
    const result = await this.push({ immediate: true, force: true });
    if (result.ok && !silent) this.setStatus('synced', 'Sinkronisasi selesai.');
    return result;
  }

  async test(config) {
    let adapter;
    try {
      adapter = this.createAdapter(config);
    } catch (error) {
      return { ok: false, error: error.message };
    }
    if (!adapter) return { ok: true, local: true };
    try {
      const remote = await adapter.read();
      if (adapter.destroy) await adapter.destroy();
      return { ok: true, exists: Boolean(remote?.data) };
    } catch (error) {
      if (adapter.destroy) await adapter.destroy();
      return { ok: false, error: error.message };
    }
  }

  async createJsonBin(config) {
    if (config.provider !== 'jsonbin') throw new Error('Pembuatan bin hanya tersedia untuk JSONBin.');
    const envelope = makeEnvelope(this.store.data, Math.max(1, Number(this.store.data.revision) || 1), nowISO(), this.firebaseUid);
    return createJsonBin(config, envelope);
  }
}

export const Cloud = new CloudSync();
