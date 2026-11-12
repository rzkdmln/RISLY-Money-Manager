import { APP, CLOUD_PROVIDERS, FIREBASE_CONFIG } from '../core/config.js';
import { deepClone, nowISO } from '../core/utils.js';

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

function remoteFingerprint(remote) {
  if (!remote) return null;
  return `${remote.revision || 0}|${remote.savedAt || ''}|${remote.client || ''}`;
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
    id = crypto.randomUUID
      ? crypto.randomUUID()
      : `client_${Date.now()}_${Math.random().toString(36).slice(2)}`;
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
  const authMod = await import(
    `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`
  );
  const { initializeApp, getApps, getApp } = appMod;
  const { getAuth, setPersistence, browserLocalPersistence } = authMod;
  const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
  const auth = getAuth(app);
  // Pastikan persistence lokal (localStorage/IndexedDB) aktif sebelum
  // proses sign-in apa pun. Tanpa ini, pada mobile (terutama iOS PWA/Safari)
  // SDK boleh memakai persistence lain sehingga sesi tidak terbawa kembali
  // setelah redirect dari Google.
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (error) {
    console.warn('Gagal set firebase persistence:', error);
  }
  return auth;
}

async function getFirebaseIdToken(auth) {
  const user = auth?.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
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
    const detail =
      typeof body === 'object' ? body?.message || body?.error || JSON.stringify(body) : body;
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
    if (!this.binId || !this.masterKey)
      throw new Error('Bin ID dan Master Key JSONBin wajib diisi.');
  }

  headers(extra = {}) {
    return {
      'X-Master-Key': this.masterKey,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  async read() {
    const body = await requestJSON(
      `https://api.jsonbin.io/v3/b/${encodeURIComponent(this.binId)}/latest`,
      {
        method: 'GET',
        headers: this.headers({ 'X-Bin-Meta': 'false' }),
        cache: 'no-store',
      }
    );
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
    const body = [
      {
        id: this.rowId,
        payload: envelope,
        revision: envelope.revision,
        updated_at: envelope.savedAt,
      },
    ];
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
    this.path = String(config.firebase?.path || `households/${APP.householdId}`).replace(
      /^\/+|\/+$/g,
      ''
    );
  }

  setOwner(uid) {
    if (!uid) return;
    this.ownerUid = String(uid);
    // Jangan menimpa path household. Path menentukan apakah perangkat ini
    // memakai rumah sendiri atau rumah bersama yang sudah diikuti lewat kode
    // undangan; nilainya diatur oleh CloudSync.
  }

  async auth() {
    return getFirebaseAuth();
  }

  async idToken() {
    const auth = await this.auth();
    return getFirebaseIdToken(auth);
  }

  async urlFor(path) {
    const token = await this.idToken();
    const suffix = token ? `?auth=${encodeURIComponent(token)}` : '';
    const clean = String(path || '').replace(/^\/+|\/+$/g, '');
    return `${this.databaseURL}/${clean}.json${suffix}`;
  }

  async endpoint() {
    return this.urlFor(this.path);
  }

  /* --- Indeks kode undangan & keanggotaan (fitur keluarga) ----------------- */

  async readInvite(code) {
    return requestJSON(await this.urlFor(`inviteCodes/${code}`), {
      method: 'GET',
      cache: 'no-store',
    });
  }

  async writeInvite(code, payload) {
    return requestJSON(await this.urlFor(`inviteCodes/${code}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async deleteInvite(code) {
    return requestJSON(await this.urlFor(`inviteCodes/${code}`), { method: 'DELETE' });
  }

  async writeMember(ownerUid, memberUid, profile) {
    return requestJSON(await this.urlFor(`households/${ownerUid}/members/${memberUid}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile || {}),
    });
  }

  async readMember(ownerUid, memberUid) {
    return requestJSON(await this.urlFor(`households/${ownerUid}/members/${memberUid}`), {
      method: 'GET',
      cache: 'no-store',
    });
  }

  async deleteMember(ownerUid, memberUid) {
    return requestJSON(await this.urlFor(`households/${ownerUid}/members/${memberUid}`), {
      method: 'DELETE',
    });
  }

  /* --- Pemetaan akun Google -> household, agar melekat lintas perangkat --- */
  async readUserHousehold(uid) {
    const clean = String(uid || '').trim();
    if (!clean) return null;
    // Jangan menelan error: pemanggil perlu membedakan "belum punya household"
    // (null) dari "gagal memeriksa" (throw) agar tidak salah membuat household
    // baru saat offline.
    const body = await requestJSON(await this.urlFor(`userHouseholds/${clean}`), {
      method: 'GET',
      cache: 'no-store',
    });
    const householdUid = body?.householdUid || body?.household || null;
    return householdUid ? String(householdUid) : null;
  }

  async writeUserHousehold(uid, householdUid) {
    const clean = String(uid || '').trim();
    const target = String(householdUid || '').trim();
    if (!clean || !target) return null;
    return requestJSON(await this.urlFor(`userHouseholds/${clean}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ householdUid: target, updatedAt: nowISO() }),
    });
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
      // PATCH instead of PUT so node `members` (and any future sibling keys)
      // tidak terhapus setiap kali data household disimpan.
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
    });
    return envelope;
  }

  async subscribe(callback = () => {}) {
    // Real-time listener via Firebase SDK. Di-inisialisasi lazily agar boot
    // tetap cepat. Tidak melempar error fatal saat belum ada auth — polling
    // (dengan ?auth=idToken melalui REST) tetap menangani sinkronisasi.
    let listening = false;
    try {
      const [appMod, dbMod] = await Promise.all([
        import(FIREBASE_APP_URL),
        import(FIREBASE_DB_URL),
      ]);
      const { initializeApp, getApps, getApp } = appMod;
      const { getDatabase, ref, onValue } = dbMod;
      const app = getApps().length ? getApp() : initializeApp(this.firebaseConfig);
      const db = getDatabase(app);
      const listenerRef = ref(db, this.path);
      this.listenerRef = listenerRef;
      this.unsubscribe = onValue(
        listenerRef,
        (snapshot) => {
          const envelope = extractEnvelope(snapshot.val());
          if (envelope) callback(envelope);
        },
        (error) => console.warn('Firebase realtime listener error:', error)
      );
      listening = true;
    } catch (error) {
      console.warn('Firebase realtime tidak tersedia, memakai polling:', error);
    }
    // `null` = listener gagal dibuat. Pemanggil bisa mengandalkan polling
    // sebagai gantinya (dulu fungsi ini selalu truthy sehingga polling tidak
    // pernah dinyalakan saat SDK gagal dimuat).
    if (!listening) return null;
    return () => {
      try {
        this.unsubscribe?.();
      } catch {
        /* noop */
      }
      this.unsubscribe = null;
    };
  }

  async destroy() {
    try {
      this.unsubscribe?.();
    } catch {
      /* noop */
    }
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
    this.connectPromise = null;
    this.pendingPush = false;
    this.changeCounter = 0;
    this.lastRevision = 0;
    this.lastSyncAt = null;
    this.lastRemoteFingerprint = null;
    this.lastError = null;
    this.connected = false;
    this.destroyed = false;
    this.reconnectTimer = null;
    this.lastRefreshAt = 0;
    this.state = this.config.provider === 'local' ? 'local' : 'idle';
    this.message = '';
    this.listeners = new Set();
    this.meta = this.loadMeta();
    if (this.meta.lastSyncAt) this.lastSyncAt = this.meta.lastSyncAt;
    if (this.meta.lastRevision) this.lastRevision = Number(this.meta.lastRevision) || 0;
    this._networkHandler = () => this.handleNetworkChange();
    window.addEventListener('online', this._networkHandler);
    window.addEventListener('offline', this._networkHandler);
    // Saat PWA dilanjutkan dari background (umum di HP), koneksi realtime bisa
    // sudah mati tanpa terlihat. Selalu tarik data terbaru ketika aplikasi
    // kembali terlihat/fokus agar perubahan anggota tidak tertinggal.
    this._resumeHandler = () => this.handleResume();
    document.addEventListener('visibilitychange', this._resumeHandler);
    window.addEventListener('focus', this._resumeHandler);
  }

  loadConfig() {
    try {
      const parsed = JSON.parse(localStorage.getItem(APP.cloudKey) || 'null');
      if (parsed?.provider === 'gdrive') {
        // Google Drive is backup-only now. Migrate old sync to Firebase.
        const migrated = { provider: 'firebase', firebase: { path: `households/${APP.householdId}` } };
        localStorage.setItem(APP.cloudKey, JSON.stringify(migrated));
        return migrated;
      }
      if (parsed?.provider) return parsed;
    } catch {
      /* noop */
    }
    // Default to the built-in Firebase project so sync works out of the box.
    return { provider: 'firebase', firebase: { path: `households/${APP.householdId}` } };
  }

  rememberedHousehold(uid) {
    if (!uid) return '';
    try {
      const map = JSON.parse(localStorage.getItem(APP.cloudHouseholdsKey) || '{}') || {};
      return String(map[String(uid)] || '');
    } catch {
      return '';
    }
  }

  rememberHousehold(uid, householdUid) {
    if (!uid || !householdUid) return;
    try {
      const map = JSON.parse(localStorage.getItem(APP.cloudHouseholdsKey) || '{}') || {};
      if (map[String(uid)] === String(householdUid)) return;
      map[String(uid)] = String(householdUid);
      localStorage.setItem(APP.cloudHouseholdsKey, JSON.stringify(map));
    } catch {
      /* noop */
    }
  }

  /**
   * Pulihkan pemetaan household dari cloud agar akun yang sama di perangkat
   * baru langsung masuk ke household yang melekat, bukan membuat ruang baru.
   *
   * Pemetaan lokal yang menunjuk ke UID sendiri juga diperiksa ulang: nilai itu
   * bisa berasal dari fallback sebelum pemeriksaan cloud (mis. setelah registry
   * lokal hilang), dan jika dibiarkan akan membuat household baru.
   */
  async syncMembershipFromCloud(uid) {
    if (!uid || this.config.provider !== 'firebase') {
      return { checked: false, householdUid: '' };
    }
    const remembered = this.rememberedHousehold(uid);
    if (remembered && remembered !== String(uid)) {
      this.membershipChecked = true;
      this.membershipHousehold = remembered;
      return { checked: true, householdUid: remembered };
    }
    try {
      const adapter =
        this.adapter ||
        new FirebaseAdapter(this.config.provider === 'firebase' ? this.config : { provider: 'firebase' });
      const householdUid = await adapter.readUserHousehold(uid);
      if (householdUid) this.rememberHousehold(uid, householdUid);
      this.membershipChecked = true;
      this.membershipHousehold = householdUid || remembered || '';
      return { checked: true, householdUid: this.membershipHousehold };
    } catch {
      this.membershipChecked = false;
      return { checked: false, householdUid: remembered };
    }
  }

  /** Simpan pemetaan household ke cloud (best-effort). */
  writeMembershipToCloud(uid, householdUid) {
    if (!uid || !householdUid || this.config.provider !== 'firebase') return;
    try {
      const adapter =
        this.adapter ||
        new FirebaseAdapter(this.config.provider === 'firebase' ? this.config : { provider: 'firebase' });
      void adapter.writeUserHousehold(uid, householdUid).catch(() => {});
    } catch {
      /* noop */
    }
  }

  /**
   * Bangun konfigurasi Firebase untuk user yang sedang login.
   *
   * `householdUid` adalah pemilik data keluarga. Untuk akun biasa nilainya sama
   * dengan UID sendiri; setelah bergabung lewat kode undangan nilainya adalah
   * UID pemilik ruang. Pemetaan UID -> household disimpan agar bergabung tetap
   * diingat ketika akun lain sempat login di perangkat yang sama.
   */
  firebaseConfigFor(uid, previous = this.config) {
    const current = previous?.firebase || {};
    const sameUser = String(current.uid || '') === String(uid || '');
    const pathMatch = /^households\/([^/]+)$/.exec(String(current.path || ''));
    const previousHousehold = current.householdUid || (pathMatch ? pathMatch[1] : '');
    const householdUid =
      this.rememberedHousehold(uid) || (sameUser && previousHousehold ? previousHousehold : uid);
    this.rememberHousehold(uid, householdUid);
    return {
      provider: 'firebase',
      firebase: {
        path: `households/${householdUid}`,
        householdUid,
        uid,
      },
    };
  }

  getHouseholdUid() {
    const configured = this.config?.firebase?.householdUid;
    if (configured) return String(configured);
    const match = /^households\/([^/]+)$/.exec(String(this.config?.firebase?.path || ''));
    return match ? match[1] : String(this.firebaseUid || APP.householdId);
  }

  isHouseholdOwner() {
    return Boolean(this.firebaseUid) && this.getHouseholdUid() === String(this.firebaseUid);
  }

  async getFirebaseUid() {
    if (this.firebaseUid) return this.firebaseUid;
    if (this.config.provider !== 'firebase') return null;
    try {
      const auth = await getFirebaseAuth();
      const user = auth?.currentUser;
      if (user?.uid) {
        this.firebaseUid = user.uid;
        this.currentFirebaseUser = user;
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
      // Sinkronkan snapshot user juga pada jalur cache agar konsisten dengan
      // listener onAuthStateChanged (tanpa ini, getCurrentFirebaseUser()
      // bisa null padahal uid memang valid).
      this.currentFirebaseUser = auth?.currentUser || null;
      return uid;
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        try {
          unsubscribe?.();
        } catch {
          /* noop */
        }
        resolve(value);
      };
      let unsubscribe = null;
      try {
        unsubscribe = auth?.onAuthStateChanged?.((user) => {
          this.currentFirebaseUser = user || null;
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

  /**
   * Ambil Firebase User object yang sedang login (untuk accessToken, email, displayName, photoURL).
   * Digunakan saat onAuthStateChanged terpicu tapi getRedirectResult() kembali null (ITP iOS).
   */
  getCurrentFirebaseUser() {
    return this.currentFirebaseUser || null;
  }

  /**
   * Keluar penuh dari Firebase Auth (IndexedDB/localStorage) agar login Google
   * berikutnya benar-benar diminta ulang. Dipakai saat "logout" aplikasi.
   */
  async signOutFirebase() {
    try {
      const auth = await getFirebaseAuth();
      const authMod = await import(
        `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`
      );
      const { signOut } = authMod;
      await signOut(auth);
    } catch (error) {
      console.warn('Firebase signOut gagal:', error);
    }
    this.firebaseUid = null;
    this.currentFirebaseUser = null;
    this.adapter = null;
    this.connected = false;
    this.state = 'idle';
    this.message = '';
    this.emitStatus();
  }

  canSync() {
    // Jangan mengirim permintaan sync sebelum Firebase Auth mengonfirmasi user.
    return this.config?.provider === 'local' || Boolean(this.firebaseUid);
  }

  async signInWithGoogle(accessToken) {
    // Masuk dengan Google juga harus mengaktifkan sinkronisasi cloud (Firebase)
    // bila sebelumnya nonaktif, agar backup/sync bisa berjalan otomatis.
    if (this.config.provider === 'local') {
      const next = { provider: 'firebase', firebase: { path: `households/${APP.householdId}` } };
      this.config = next;
      try {
        localStorage.setItem(APP.cloudKey, JSON.stringify(next));
      } catch {
        /* noop */
      }
    }
    if (this.config.provider !== 'firebase') return null;
    try {
      const auth = await getFirebaseAuth();
      const user = auth?.currentUser;
      // Jika Firebase Auth sudah memiliki user (mis. alur redirect selesai),
      // gunakan user tersebut. Jangan tukarkan token akses Google mentah melalui
      // signInWithCredential, karena aud token tersebut mungkin bukan untuk
      // project Firebase ini (auth/invalid-credential).
      if (user?.uid) {
        this.firebaseUid = user.uid;
        await this.applyFirebaseUid(user.uid);
        return user.uid;
      }
      // Validasi ketat: accessToken harus berupa string non-kosong. Jangan
      // melewatkan string kosong ke GoogleAuthProvider.credential karena
      // Firebase akan melempar auth/argument-error.
      if (!accessToken || typeof accessToken !== 'string' || accessToken.trim().length === 0) {
        console.warn('Token akses Google kosong, melewatkan sign-in Firebase.');
        return null;
      }
      // Sebaliknya, tukarkan token akses Google via Firebase credential.
      const appMod = await import(FIREBASE_APP_URL);
      const authMod = await import(
        `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`
      );
      const { initializeApp, getApps, getApp } = appMod;
      const { getAuth, GoogleAuthProvider, signInWithCredential } = authMod;
      const app = getApps().length
        ? getApp()
        : initializeApp(this.firebaseConfig || FIREBASE_CONFIG);
      const authApp = getAuth(app);
      let credential;
      try {
        credential = GoogleAuthProvider.credential(null, accessToken.trim());
      } catch (credError) {
        console.warn('Firebase credential gagal dibuat:', credError);
        return null;
      }
      const result = await signInWithCredential(authApp, credential);
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
    // Catat UID dan path per-rumah tangga. Koneksi sebenarnya dibuat setelah
    // workspace lokal dibuka (lihat syncCloudAfterLogin di app.js), agar data
    // placeholder layar login tidak sempat terunggah ke cloud.
    if (String(this.firebaseUid || '') !== String(uid)) this.membershipChecked = undefined;
    // Periksa pemetaan household di cloud sebelum menentukan path. Ini
    // mencegah akun anggota membuat household baru saat registry lokal hilang.
    await this.syncMembershipFromCloud(uid);
    const next = this.firebaseConfigFor(uid, this.config);
    const changed =
      this.config?.provider !== 'firebase' ||
      this.config?.firebase?.path !== next.firebase.path ||
      this.config?.firebase?.uid !== next.firebase.uid;
    localStorage.setItem(APP.cloudKey, JSON.stringify(next));
    this.config = next;
    this.firebaseUid = uid;
    // Simpan pemetaan household ke cloud agar akun yang sama di perangkat
    // baru langsung masuk ke household ini. Hanya tulis jika pemeriksaan
    // cloud berhasil — jangan menimpa pemetaan yang benar dengan UID sendiri.
    const householdUid = this.getHouseholdUid();
    if (householdUid && this.membershipChecked) {
      this.writeMembershipToCloud(uid, householdUid);
    }
    if (changed) {
      this.connected = false;
      this.setStatus('idle', 'Menunggu sinkronisasi…');
    } else if (this.connected) {
      this.setStatus('synced', 'Terhubung.');
    } else {
      this.setStatus('idle', 'Menunggu sinkronisasi…');
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
      state:
        navigator.onLine === false && this.config.provider !== 'local' ? 'offline' : this.state,
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
      if (event.reason === 'sync:conflict') {
        const count = event.detail?.conflictCount || 0;
        this.setStatus(
          'synced',
          `Sinkronisasi selesai (${count} konflik catat). Lihat Pengaturan › Log Konflik.`
        );
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
      let uid = waitForAuth ? await this.waitForFirebaseUser() : await this.getFirebaseUid();
      if (!uid) {
        try {
          const { GoogleDrive } = await import('./gdrive.js');
          uid = await this.signInWithGoogle(GoogleDrive?.accessToken || '');
        } catch {
          /* noop */
        }
      }
      if (!uid) {
        // Belum ada pengguna Firebase yang terkonfirmasi. Jangan sentuh RTDB
        // sebelum onAuthStateChanged mengonfirmasi user, karena aturan keamanan
        // saat ini mensyaratkan auth != null.
        this.connected = false;
        this.firebaseUid = null;
        this.adapter = null;
        this.setStatus('idle', 'Menunggu autentikasi Firebase…');
        this.scheduleReconnect();
        return { ok: true, skipped: true };
      }
      await this.syncMembershipFromCloud(uid);
      this.firebaseUid = uid;
      const next = this.firebaseConfigFor(uid, this.config);
      const changed = JSON.stringify(this.config) !== JSON.stringify(next);
      this.config = next;
      localStorage.setItem(APP.cloudKey, JSON.stringify(this.config));
      if (this.adapter?.setOwner) this.adapter.setOwner(uid);
    }
    const timeout = new Promise((resolve) =>
      setTimeout(() => resolve({ ok: false, timeout: true }), 8_000)
    );
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

  async connect(config, options = {}) {
    // Cegah dua proses connect berjalan bersamaan (mis. boot + login redirect
    // sama-sama memanggil bootstrap dalam waktu berdekatan).
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this._connect(config, options).finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  async _connect(config, { initial = false } = {}) {
    this.stopEngine();
    if (this.adapter?.destroy) {
      try {
        await this.adapter.destroy();
      } catch {
        /* noop */
      }
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
        let uid = await this.getFirebaseUid();
        if (!uid) {
          try {
            const { GoogleDrive } = await import('./gdrive.js');
            uid = await this.signInWithGoogle(GoogleDrive?.accessToken || '');
          } catch {
            /* noop */
          }
        }
        if (!uid) {
          // Belum ada pengguna Firebase yang terkonfirmasi. Jangan baca RTDB
          // (mis. households/risly-family) tanpa auth — aturan keamanan
          // menolaknya (permission_denied / 401).
          this.connected = false;
          this.firebaseUid = null;
          this.adapter = null;
          this.setStatus('idle', 'Menunggu autentikasi Firebase…');
          // Coba lagi secara berkala: sesi Firebase kadang baru pulih setelah
          // beberapa detik (terutama saat PWA dibuka dari background).
          this.scheduleReconnect();
          return { ok: true, skipped: true };
        }
        await this.syncMembershipFromCloud(uid);
        this.firebaseUid = uid;
        // Path per-rumah tangga. Untuk anggota yang sudah bergabung, path
        // mengarah ke household pemilik (disimpan di config), bukan ke UID
        // anggota itu sendiri.
        const next = this.firebaseConfigFor(uid, this.config);
        localStorage.setItem(APP.cloudKey, JSON.stringify(next));
        this.config = next;
      }
      this.adapter = this.createAdapter(this.config);
      if (this.config.provider === 'firebase' && this.firebaseUid && this.adapter?.setOwner) {
        this.adapter.setOwner(this.firebaseUid);
      }
      // Pemilik perlu memastikan node keanggotaannya ada sebelum membaca
      // household. Anggota sudah didaftarkan oleh joinHousehold(); jangan
      // menulis ulang agar anggota yang dikeluarkan tidak bisa mendaftar
      // sendiri kembali.
      if (
        this.config.provider === 'firebase' &&
        this.firebaseUid &&
        this.adapter?.writeMember &&
        this.isHouseholdOwner()
      ) {
        try {
          const user = this.store?.currentUser || null;
          await this.adapter.writeMember(this.getHouseholdUid(), this.firebaseUid, {
            name: user?.name || this.currentFirebaseUser?.displayName || '',
            email: user?.googleEmail || this.currentFirebaseUser?.email || '',
            role: 'owner',
            joinedAt: nowISO(),
          });
        } catch (error) {
          console.warn('Gagal menulis node anggota Firebase:', error);
        }
      }
      let remote = null;
      let readFailed = false;
      let canSeed = false;
      try {
        remote = await this.adapter.read();
      } catch (error) {
        readFailed = true;
        const message = error.message || '';
        // Pemilik baru belum punya node `owner`/`members` sehingga rules
        // menolak pembacaan. Hanya pemilik yang boleh mencoba inisialisasi.
        if (!this.isHouseholdOwner() || !/401|403|permission|denied/i.test(message)) {
          throw error;
        }
        // 401 = token auth tidak valid; penulisan juga akan ditolak, jadi
        // jangan menulis apa pun. 403 = node belum ada → boleh seed, tetapi
        // hanya jika pemeriksaan keanggotaan cloud tidak gagal (agar akun
        // anggota tidak membuat household baru saat offline/registry hilang).
        canSeed =
          !/^\s*401\b/.test(message) && this.membershipChecked !== false;
        console.warn('Baca household ditolak:', message);
      }
      let pendingLocalPush = false;
      if (readFailed) {
        if (canSeed && this.store?.isDataReady) {
          // Household baru: buat node dengan snapshot lokal.
          await this.push({ immediate: true, force: true, seed: true });
          this.store?.clearPreferRemote?.();
        }
      } else if (remote?.data) {
        // Workspace terkunci / masih placeholder layar login: jangan gabungkan
        // dan jangan simpan fingerprint, agar pull setelah unlock tetap jalan.
        if (this.store?.isDataReady) {
          this.lastRevision = remote.revision || 0;
          this.lastSyncAt = remote.savedAt || nowISO();
          const merged = this.store.mergeRemote(remote.data, {
            isOwner: this.isHouseholdOwner(),
          });
          this.lastRemoteFingerprint = remoteFingerprint(remote);
          this.saveMeta({
            provider: this.config.provider,
            lastRevision: this.lastRevision,
            lastSyncedAt: this.lastSyncAt,
            lastRemoteSavedAt: remote.savedAt || null,
          });
          if (merged.changed && !initial) {
            this.message = 'Data dari perangkat lain sudah digabungkan.';
          }
          // Ada perubahan lokal yang belum ada di cloud (mis. aplikasi
          // di-reload sebelum push sempat berjalan) → dorong setelah engine siap.
          pendingLocalPush = Boolean(merged.localPending);
        }
      } else if (this.store?.isDataReady) {
        // Remote is empty: seed it with the local household snapshot.
        await this.push({ immediate: true, force: true, seed: true });
      }
      // Mode "remote menang" hanya untuk sinkronisasi pertama. Jika pembacaan
      // gagal, biarkan aktif agar pull berikutnya tetap mengadopsi data cloud.
      if (!readFailed) this.store?.clearPreferRemote?.();
      this.connected = true;
      this.startEngine();
      if (pendingLocalPush) this.schedulePush(600);
      if (this.isHouseholdOwner()) {
        // Publikasikan kode undangan agar perangkat lain bisa menemukan
        // household ini lewat kode (bukan hanya lewat localStorage).
        this.publishInviteCode().catch((error) => {
          console.warn('Gagal mempublikasikan kode undangan:', error);
        });
      }
      if (this.state !== 'synced') this.setStatus('synced', 'Terhubung.');
      else this.emitStatus();
      return { ok: true, remote };
    } catch (error) {
      console.error('Cloud connect failed:', error);
      this.connected = false;
      this.lastError = error.message;
      this.setStatus('error', error.message);
      // Polling can recover from transient network failures, but not config errors.
      if (!/wajib|valid|JSON|tidak|belum diaktifkan|Enable/i.test(error.message))
        this.startEngine();
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
    this.lastRemoteFingerprint = null;
    this.saveMeta({ provider: 'local', lastRevision: 0, lastSyncedAt: null });
    this.setStatus('local', '');
  }

  stopEngine() {
    clearTimeout(this.pushTimer);
    clearInterval(this.pollTimer);
    clearTimeout(this.reconnectTimer);
    this.pushTimer = null;
    this.pollTimer = null;
    this.reconnectTimer = null;
    if (this.unsubscribeRemote) {
      try {
        this.unsubscribeRemote();
      } catch {
        /* noop */
      }
      this.unsubscribeRemote = null;
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
    // Polling selalu aktif sebagai jaring pengaman: listener realtime bisa
    // "diam" (socket mati saat PWA di-background) tanpa memicu error apa pun.
    this.startPolling();
    if (this.config.provider === 'firebase' && this.adapter.subscribe) {
      try {
        this.unsubscribeRemote = await this.adapter.subscribe((remote) =>
          this.handleRemote(remote, true)
        );
        if (!this.unsubscribeRemote) {
          console.warn('Firebase realtime tidak tersedia, memakai polling.');
        }
      } catch (error) {
        // Real-time listener unavailable (e.g. offline or blocked SDK); polling
        // above tetap berjalan.
        console.warn('Firebase realtime tidak tersedia, memakai polling:', error);
      }
    }
  }

  /**
   * Tarik data terbaru saat aplikasi kembali terlihat/fokus (khas PWA di HP).
   * Dibatasi agar event `focus` yang bertubi-tubi tidak membanjiri network.
   */
  handleResume() {
    if (this.destroyed || this.config.provider === 'local') return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (navigator.onLine === false) return;
    const now = Date.now();
    if (now - this.lastRefreshAt < 5_000) return;
    this.lastRefreshAt = now;
    this.refreshNow().catch(() => {});
  }

  async refreshNow() {
    if (this.destroyed || this.config.provider === 'local') return { ok: false };
    if (!this.connected) {
      await this.connect(this.config).catch(() => null);
    }
    if (!this.connected) return { ok: false };
    return this.pull({ background: true });
  }

  scheduleReconnect(delay = 15_000) {
    clearTimeout(this.reconnectTimer);
    if (this.destroyed || this.config.provider === 'local') return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.destroyed || this.connected) return;
      if (navigator.onLine === false) {
        this.scheduleReconnect(delay);
        return;
      }
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        this.scheduleReconnect(delay);
        return;
      }
      try {
        await this.connect(this.config);
      } catch {
        /* noop */
      }
      if (!this.connected) this.scheduleReconnect(Math.min(delay * 2, 60_000));
    }, delay);
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
    // Jangan pernah menulis data placeholder/terkunci ke cloud: PATCH dengan
    // `data: null` akan menghapus seluruh data household di Firebase.
    if (!this.store?.data || !this.store.isDataReady) return { ok: false, notReady: true };
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
        const merged = this.store.mergeRemote(remote.data, {
          isOwner: this.isHouseholdOwner(),
        });
        if (merged.changed) this.message = 'Perubahan dari perangkat lain digabungkan.';
      }
      const local = this.store.data;
      const revision =
        Math.max(
          Number(this.lastRevision) || 0,
          Number(remote?.revision) || 0,
          Number(local.revision) || 0
        ) + 1;
      const envelope = makeEnvelope(
        local,
        revision,
        nowISO(),
        this.isHouseholdOwner() ? this.getHouseholdUid() : null
      );
      // Anggota tidak mengirim kolom milik pemilik (owner, members, settings,
      // inviteCode); rules akan menganggapnya tidak berubah (PATCH parsial).
      await this.adapter.write(envelope);
      this.lastRevision = revision;
      this.lastSyncAt = envelope.savedAt;
      // Catat fingerprint tulisan kita sendiri agar gema realtime tidak
      // memicu merge ulang yang tidak perlu.
      this.lastRemoteFingerprint = remoteFingerprint(envelope);
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
      console.warn('Cloud push failed:', error?.message || error);
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
    // Jangan sentuh data placeholder layar login / workspace terkunci.
    if (!this.store?.isDataReady) return;
    // Dedupe berdasarkan identitas snapshot (revision + savedAt + client),
    // BUKAN berdasarkan revision saja. Dua perangkat dapat menghasilkan
    // revision yang sama (race) dan jam perangkat bisa berbeda; perbandingan
    // revision/jam yang lama membuat perubahan anggota diabaikan permanen.
    const fingerprint = remoteFingerprint(remote);
    if (fingerprint && fingerprint === this.lastRemoteFingerprint) return;
    let result;
    try {
      result = this.store.mergeRemote(remote.data, {
        isOwner: this.isHouseholdOwner(),
      });
    } catch (error) {
      // Jangan tandai snapshot sebagai "sudah diterapkan" kalau merge gagal,
      // supaya percobaan berikutnya (polling/resume) masih bisa memperbaikinya.
      console.warn('Gagal menggabungkan data cloud:', error);
      return;
    }
    this.lastRemoteFingerprint = fingerprint;
    this.lastRevision = Math.max(Number(this.lastRevision) || 0, Number(remote.revision) || 0);
    this.lastSyncAt = remote.savedAt || nowISO();
    this.saveMeta({
      provider: this.config.provider,
      lastRevision: this.lastRevision,
      lastSyncedAt: this.lastSyncAt,
      lastRemoteSavedAt: remote.savedAt || null,
    });
    if (result.localPending && this.connected) this.schedulePush(500);
    if (result.changed) {
      this.setStatus('synced', 'Diperbarui dari perangkat lain.');
    } else if (realtime) {
      this.setStatus('synced', 'Tersinkronisasi.');
    }
  }

  async syncNow({ silent = false } = {}) {
    if (this.config.provider === 'local') {
      if (!silent) this.setStatus('local', 'Sinkronisasi cloud belum diaktifkan.');
      return { ok: false, local: true };
    }
    if (this.config.provider === 'firebase' && !this.firebaseUid) {
      // Coba pulihkan user Firebase dari IndexedDB sebelum menyerah. Ini
      // penting setelah login redirect di mana listener auth belum sempat
      // mengisi firebaseUid saat tombol sync pertama kali ditekan.
      try {
        await this.getFirebaseUid();
      } catch {
        /* noop */
      }
      if (!this.firebaseUid) {
        try {
          const { GoogleDrive } = await import('./gdrive.js');
          await this.signInWithGoogle(GoogleDrive?.accessToken || '');
        } catch {
          /* noop */
        }
      }
      if (!this.firebaseUid) return { ok: false, skipped: true };
    }
    if (!this.adapter || !this.connected) {
      // Jangan pernah melaporkan "lokal" hanya karena adapter belum dibuat.
      // Provider Firebase tetap harus mencoba connect secara otomatis.
      const connected = await this.connect(this.config);
      if (connected?.skipped) return { ok: false, skipped: true };
      if (!this.connected) return connected;
    }
    await this.pull();
    const result = await this.push({ immediate: true, force: true });
    if (result.ok) {
      if (this.isHouseholdOwner()) this.publishInviteCode().catch(() => {});
      if (!silent) this.setStatus('synced', 'Sinkronisasi selesai.');
    }
    return result;
  }

  /**
   * Cari household pemilik dari kode undangan. Kode dipublikasikan pemilik ke
   * node `inviteCodes/<KODE>` agar bisa ditemukan lintas perangkat.
   */
  async resolveInviteCode(code) {
    const normalized = String(code || '')
      .trim()
      .toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(normalized)) return null;
    if (this.config.provider !== 'firebase') return null;
    const uid = await this.waitForFirebaseUser();
    if (!uid) return null;
    const adapter = new FirebaseAdapter({
      provider: 'firebase',
      firebase: { path: `households/${uid}` },
    });
    try {
      const body = await adapter.readInvite(normalized);
      if (!body?.ownerUid) return null;
      return { ...body, code: normalized };
    } catch (error) {
      console.warn('Gagal membaca kode undangan:', error);
      return null;
    } finally {
      try {
        await adapter.destroy();
      } catch {
        /* noop */
      }
    }
  }

  /**
   * Pindahkan perangkat ini ke household milik anggota lain.
   * Node keanggotaan ditulis lebih dulu agar rules mengizinkan pembacaan data.
   */
  async joinHousehold(ownerUid, profile = {}) {
    if (this.config.provider !== 'firebase') throw new Error('Sinkronisasi Firebase belum aktif.');
    const target = String(ownerUid || '').trim();
    if (!target) throw new Error('Pemilik ruang tidak ditemukan.');
    const uid = (await this.waitForFirebaseUser()) || (await this.getFirebaseUid());
    if (!uid) throw new Error('Login Firebase belum selesai. Coba lagi.');
    // Pemilik ruang sendiri boleh kembali ke ruang miliknya (mis. setelah
    // sempat berpindah ke ruang lain) tanpa harus mendaftar sebagai anggota.
    if (target === String(uid)) {
      const next = {
        provider: 'firebase',
        firebase: { path: `households/${uid}`, householdUid: uid, uid },
      };
      this.rememberHousehold(uid, uid);
      this.writeMembershipToCloud(uid, uid);
      this.stopEngine();
      if (this.adapter?.destroy) {
        try {
          await this.adapter.destroy();
        } catch {
          /* noop */
        }
      }
      this.config = next;
      this.firebaseUid = uid;
      this.connected = false;
      this.adapter = null;
      const result = await this.connect(next);
      if (result?.ok && !result?.skipped) {
        try {
          await this.push({ immediate: true, force: true });
        } catch {
          /* noop */
        }
      }
      return result;
    }

    // Pastikan konfigurasi memakai identitas Firebase yang baru login, bukan
    // sisa akun sebelumnya di perangkat yang sama.
    this.firebaseUid = uid;
    if (
      this.config.provider === 'firebase' &&
      String(this.config.firebase?.uid || '') !== String(uid)
    ) {
      this.config = this.firebaseConfigFor(uid, this.config);
      localStorage.setItem(APP.cloudKey, JSON.stringify(this.config));
    }

    const previousHousehold = this.getHouseholdUid();
    const previousCode = String(this.store?.getWorkspaceCode?.() || '')
      .trim()
      .toUpperCase();

    // Jika perangkat ini sebelumnya memakai household pribadi, tarik dulu data
    // pribadi dari cloud (mis. saat bergabung dari perangkat baru) agar tidak
    // ada transaksi lama yang tertinggal.
    if (previousHousehold === String(uid) && this.store) {
      const oldAdapter = new FirebaseAdapter({
        provider: 'firebase',
        firebase: { path: `households/${uid}` },
      });
      try {
        const oldRemote = await oldAdapter.read();
        if (oldRemote?.data) {
          this.store.mergeRemote(oldRemote.data);
          // Pengaturan ruang keluarga tetap harus menang saat merge ke target.
          this.store.prepareHouseholdJoin?.();
        }
      } catch {
        /* household pribadi kosong / belum ada */
      } finally {
        try {
          await oldAdapter.destroy();
        } catch {
          /* noop */
        }
      }
    }

    const tempAdapter = new FirebaseAdapter({
      provider: 'firebase',
      firebase: { path: `households/${target}` },
    });
    try {
      // Anggota yang sudah pernah bergabung tidak perlu menulis ulang node.
      // Selain menghindari konflik dengan rules, ini memastikan anggota yang
      // sudah dikeluarkan tidak bisa mendaftarkan diri kembali.
      let alreadyMember = false;
      try {
        const existing = await tempAdapter.readMember(target, uid);
        if (existing?.removed) {
          throw new Error('Anda sudah dikeluarkan dari ruang keluarga ini.');
        }
        alreadyMember = Boolean(existing);
      } catch (error) {
        if (/dikeluarkan/.test(error.message || '')) throw error;
        // Belum menjadi anggota (rules menolak baca) — lanjut mendaftar.
      }
      if (!alreadyMember) {
        try {
          await tempAdapter.writeMember(target, uid, {
            name: profile.name || '',
            email: profile.email || '',
            role: 'member',
            joinedAt: nowISO(),
          });
        } catch (error) {
          if (/40[13]|permission|denied/i.test(error.message || '')) {
            throw new Error('Tidak bisa bergabung. Anda mungkin sudah dikeluarkan dari ruang ini.');
          }
          throw error;
        }
      }
    } finally {
      try {
        await tempAdapter.destroy();
      } catch {
        /* noop */
      }
    }

    const next = {
      provider: 'firebase',
      firebase: { path: `households/${target}`, householdUid: target, uid },
    };
    this.rememberHousehold(uid, target);
    this.writeMembershipToCloud(uid, target);
    this.stopEngine();
    if (this.adapter?.destroy) {
      try {
        await this.adapter.destroy();
      } catch {
        /* noop */
      }
    }
    this.config = next;
    this.firebaseUid = uid;
    this.connected = false;
    this.adapter = null;
    const result = await this.connect(next);
    if (result?.ok && !result?.skipped) {
      // Anggota biasanya membawa transaksi lokal dari workspace lamanya.
      // Unggah hasil gabungan segera agar perangkat pemilik ikut melihatnya.
      try {
        await this.push({ immediate: true, force: true });
      } catch {
        /* noop */
      }
    }

    // Kode undangan household lama (milik sendiri) tidak boleh lagi
    // mengarah ke ruang yang sudah ditinggalkan.
    const currentCode = String(this.store?.getWorkspaceCode?.() || '')
      .trim()
      .toUpperCase();
    if (previousHousehold === String(uid) && previousCode && previousCode !== currentCode) {
      try {
        await this.adapter?.deleteInvite?.(previousCode);
      } catch {
        /* noop */
      }
    }
    return result;
  }

  /**
   * Publikasikan/segarkan index kode undangan milik household ini.
   * Hanya pemilik yang boleh menulis index tersebut.
   */
  async publishInviteCode({ previousCode = null } = {}) {
    if (this.config.provider !== 'firebase' || !this.adapter || !this.connected) {
      return { ok: false, skipped: true };
    }
    if (!this.isHouseholdOwner()) return { ok: false, member: true };
    const code = String(this.store?.getWorkspaceCode?.() || '')
      .trim()
      .toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(code)) return { ok: false, invalid: true };
    const householdName =
      this.store?.data?.settings?.workspaceName || this.store?.data?.settings?.householdName || '';
    await this.adapter.writeInvite(code, {
      ownerUid: this.getHouseholdUid(),
      householdName,
      updatedAt: nowISO(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
    const old = String(previousCode || '')
      .trim()
      .toUpperCase();
    if (old && old !== code) {
      try {
        await this.adapter.deleteInvite(old);
      } catch {
        /* noop */
      }
    }
    return { ok: true, code };
  }

  /** Cabut akses satu anggota dari household (hanya pemilik). */
  async removeHouseholdMember(memberUid) {
    const uid = String(memberUid || '').trim();
    if (!uid) return { ok: false, skipped: true };
    if (this.config.provider !== 'firebase') return { ok: false, skipped: true };
    if (!this.adapter || !this.connected) {
      const connected = await this.connect(this.config);
      if (!connected?.ok || connected?.skipped) return { ok: false, skipped: true };
    }
    if (!this.isHouseholdOwner())
      throw new Error('Hanya pemilik ruang yang bisa mengeluarkan anggota.');
    // Jangan hapus node: penanda `removed` mencegah anggota mendaftar ulang
    // sendiri (rules hanya mengizinkan pendaftaran bila node belum ada).
    // Pertahankan field wajib karena writeMember memakai PUT (replace).
    const existing =
      (await this.adapter.readMember(this.getHouseholdUid(), uid).catch(() => null)) || {};
    await this.adapter.writeMember(this.getHouseholdUid(), uid, {
      name: existing.name || '',
      email: existing.email || '',
      role: existing.role || 'member',
      joinedAt: existing.joinedAt || nowISO(),
      ...existing,
      removed: true,
      removedAt: nowISO(),
    });
    return { ok: true };
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
    if (config.provider !== 'jsonbin')
      throw new Error('Pembuatan bin hanya tersedia untuk JSONBin.');
    const envelope = makeEnvelope(
      this.store.data,
      Math.max(1, Number(this.store.data.revision) || 1),
      nowISO(),
      this.firebaseUid
    );
    return createJsonBin(config, envelope);
  }
}

export const Cloud = new CloudSync();
