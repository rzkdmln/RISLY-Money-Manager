import { APP, CLOUD_PROVIDERS } from './config.js';
import { deepClone, nowISO } from './utils.js';

const FIREBASE_VERSION = '10.12.5';
const FIREBASE_APP_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`;
const FIREBASE_DB_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-database.js`;

function makeEnvelope(data, revision = 1, savedAt = nowISO()) {
  return {
    app: 'risly-money-manager',
    schemaVersion: APP.schemaVersion,
    revision: Math.max(1, Number(revision) || 1),
    savedAt,
    client: getClientId(),
    data,
  };
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
    if (!raw) throw new Error('Konfigurasi Firebase wajib diisi.');
    try {
      this.firebaseConfig = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      throw new Error('Konfigurasi Firebase bukan JSON yang valid.');
    }
    if (!this.firebaseConfig.databaseURL) throw new Error('databaseURL Firebase wajib ada.');
    this.path = String(config.firebase?.path || `households/${APP.householdId}`).replace(/^\/+|\/+$/g, '');
    this.db = null;
    this.modules = null;
    this.app = null;
  }

  async ensure() {
    if (this.db) return;
    const [appModule, dbModule] = await Promise.all([
      import(FIREBASE_APP_URL),
      import(FIREBASE_DB_URL),
    ]);
    const appName = 'risly-sync';
    const existing = appModule.getApps().find((app) => app.name === appName);
    this.app = existing || appModule.initializeApp(this.firebaseConfig, appName);
    this.db = dbModule.getDatabase(this.app);
    this.modules = { ...appModule, ...dbModule };
  }

  async read() {
    await this.ensure();
    const snapshot = await this.modules.get(this.modules.ref(this.db, this.path));
    return extractEnvelope(snapshot.val());
  }

  async write(envelope) {
    await this.ensure();
    await this.modules.set(this.modules.ref(this.db, this.path), envelope);
    return envelope;
  }

  async subscribe(callback) {
    await this.ensure();
    return this.modules.onValue(this.modules.ref(this.db, this.path), (snapshot) => {
      const envelope = extractEnvelope(snapshot.val());
      if (envelope) callback(envelope);
    });
  }

  async destroy() {
    if (this.modules?.off && this.db) {
      try {
        this.modules.off(this.modules.ref(this.db, this.path));
      } catch { /* noop */ }
    }
    if (this.app && this.modules?.deleteApp) {
      try {
        await this.modules.deleteApp(this.app);
      } catch { /* noop */ }
    }
    this.app = null;
    this.db = null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Cloud synchronisation controller                                          */
/* -------------------------------------------------------------------------- */

class CloudSync {
  constructor() {
    this.store = null;
    this.config = this.loadConfig();
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
      if (parsed?.provider) return parsed;
    } catch { /* noop */ }
    return { provider: 'local' };
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

  async bootstrap() {
    if (this.config.provider === 'local') {
      this.state = 'local';
      this.emitStatus();
      return { ok: true, local: true };
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
      this.adapter = this.createAdapter(this.config);
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
      if (!/wajib|valid|JSON|tidak/i.test(error.message)) this.startEngine();
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

  async startEngine() {
    if (!this.adapter) return;
    clearInterval(this.pollTimer);
    if (this.config.provider === 'firebase' && this.adapter.subscribe) {
      try {
        this.unsubscribeRemote = await this.adapter.subscribe((remote) => this.handleRemote(remote, true));
      } catch (error) {
        this.lastError = error.message;
        this.setStatus('error', error.message);
      }
    } else {
      this.pollTimer = setInterval(() => {
        if (!document.hidden) this.pull({ background: true }).catch(() => {});
      }, APP.syncPollMs);
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
      const envelope = makeEnvelope(local, revision, nowISO());
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
    if (!this.connected) {
      return this.connect(this.config);
    }
    await this.pull();
    const result = await this.push({ immediate: true, force: true });
    if (result.ok && !silent) this.setStatus('synced', 'Sinkronisasi selesai.');
    return result;
  }

  async test(config) {
    const adapter = this.createAdapter(config);
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
    const envelope = makeEnvelope(this.store.data, Math.max(1, Number(this.store.data.revision) || 1), nowISO());
    return createJsonBin(config, envelope);
  }
}

export const Cloud = new CloudSync();
