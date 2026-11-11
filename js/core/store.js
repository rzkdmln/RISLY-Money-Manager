import { APP } from './config.js';
import { GoogleDrive } from '../services/gdrive.js';
import { Cloud } from '../services/cloud.js';
import {
  createSession,
  getSession,
  verifyPin,
  verifyPinByVerifier,
  savePinMetadata,
  clearEncryptionKey,
  getEncryptionKey,
  setEncryptionKey as storeEncryptionKey,
} from './auth.js';
import { repository, dataURLToBlob, blobToDataUrl } from './repository.js';
import { encryptWorkspace, decryptWorkspace, deriveEncryptionKey, ENC_ITERATIONS } from './crypto.js';

const CONFLICT_LOG_KEY = 'risly.mm.conflicts.v1';
import {
  createDefaultData,
  createSampleData,
  dedupeUsers,
  generateInviteCode,
  initialsFromName,
  migrateData,
} from './data.js';
import {
  advanceDate,
  currentTimeHHMM,
  deepClone,
  formatDate,
  formatMonth,
  localDateISO,
  monthFromDateISO,
  monthKey,
  monthRange,
  normalizeTime,
  nowISO,
  safeNumber,
  shiftMonthKey,
  sortBy,
  sum,
  timeFromISO,
  todayISO,
  uid,
} from './utils.js';

/**
 * Error terstruktur untuk kegagalan penyimpanan lokal (kuota penuh, dll.).
 * UI bisa menangkap ini untuk menampilkan toast/banner yang lebih spesifik.
 */
export class StorageQuotaError extends Error {
  constructor(message, code = 'STORAGE_QUOTA_EXCEEDED') {
    super(message);
    this.name = 'StorageQuotaError';
    this.code = code;
  }
}

function recordStamp(record) {
  if (!record) return 0;
  const raw = record.updatedAt || record.createdAt;
  const stamp = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(stamp) ? stamp : 0;
}

function transactionTime(tx) {
  return normalizeTime(tx?.time, timeFromISO(tx?.createdAt) || '00:00');
}

function pickNewest(localRecord, remoteRecord) {
  if (!localRecord) return remoteRecord;
  if (!remoteRecord) return localRecord;
  return recordStamp(remoteRecord) > recordStamp(localRecord) ? remoteRecord : localRecord;
}

function normalizedMemberName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizePayments(payments) {
  return Array.isArray(payments)
    ? payments
        .map((payment) => ({
          accountId: payment?.accountId || null,
          memberId: payment?.memberId || null,
          amount: Math.max(0, Math.round(safeNumber(payment?.amount))),
        }))
        .filter((payment) => payment.accountId && payment.amount > 0)
    : [];
}

function mergeCollection(localItems, remoteItems) {
  const map = new Map();
  (remoteItems || []).forEach((item) => {
    if (item?.id) map.set(item.id, item);
  });
  (localItems || []).forEach((item) => {
    if (!item?.id) return;
    map.set(item.id, pickNewest(item, map.get(item.id)));
  });
  return [...map.values()];
}

function workspaceStorageKey(workspaceId) {
  return `${APP.workspaceDataPrefix}${workspaceId}`;
}

function readWorkspaceRegistry() {
  try {
    const raw = localStorage.getItem(APP.workspaceRegistryKey);
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      accounts: parsed?.accounts && typeof parsed.accounts === 'object' ? parsed.accounts : {},
      workspaces:
        parsed?.workspaces && typeof parsed.workspaces === 'object' ? parsed.workspaces : {},
      legacyWorkspaceId: parsed?.legacyWorkspaceId || null,
    };
  } catch {
    return { accounts: {}, workspaces: {}, legacyWorkspaceId: null };
  }
}

function writeWorkspaceRegistry(registry) {
  localStorage.setItem(APP.workspaceRegistryKey, JSON.stringify(registry));
}

export class Store {
  constructor() {
    this.data = null;
    this.currentUserId = null;
    this.workspaceId = null;
    this.account = null;
    this.registry = { accounts: {}, workspaces: {}, legacyWorkspaceId: null };
    this.listeners = new Set();
    this.lastError = null;
    this._initialized = false;
    this._uploadTimer = null;
    this._idbReady = false;
    this._receiptUrlCache = new Map();
    this._conflictLog = [];
    this._encryptionKey = null;
    this._encrypted = false;
  }

  async init() {
    if (this._initialized) return this.data;
    this.registry = readWorkspaceRegistry();
    // Keep a lightweight placeholder for the signed-out screen. It is never
    // persisted until a Google account opens or creates a workspace.
    this.data = createDefaultData();

    try {
      await repository._open();
      this._idbReady = true;

      const migrated = await repository.isMigrated();
      if (!migrated) {
        const result = await repository.migrateFromLocalStorage();
        if (result.workspaces > 0 || result.receipts > 0) {
          console.info(
            `IndexedDB migrasi: ${result.workspaces} workspace, ${result.receipts} struk`
          );
        }
      }
    } catch (error) {
      console.warn('IndexedDB tidak tersedia, fallback ke localStorage:', error);
      this._idbReady = false;
    }

    this._initialized = true;
    this._loadConflictLog();
    return this.data;
  }

  persist(data = null) {
    if (!this.workspaceId) return Promise.resolve();
    const payload = data || this.data;
    if (!payload) return Promise.resolve();

    // Fallback localStorage (browser tanpa IndexedDB) — sinkron agar error kuota
    // dapat ditangkap oleh pemanggil (mis. commit).
    if (!this._idbReady) {
      try {
        localStorage.setItem(workspaceStorageKey(this.workspaceId), JSON.stringify(payload));
        this.updateWorkspaceMeta(payload);
        this.lastError = null;
      } catch (error) {
        console.error('Gagal menyimpan data lokal:', error);
        this.lastError = error;
        const isQuota = error.name === 'QuotaExceededError' || /quota/i.test(error.message || '');
        throw isQuota
          ? new StorageQuotaError(
              'Penyimpanan perangkat penuh. Data tidak tersimpan. Backup data atau hapus lampiran struk lalu coba lagi.',
              'STORAGE_QUOTA_EXCEEDED'
            )
          : error;
      }
      return Promise.resolve();
    }

    // IndexedDB — asinkron karena enkripsi AES-GCM dan I/O IndexedDB.
    // Promise dikembalikan agar pemanggil yang butuh kepastian (mis. re-enkripsi
    // setelah ganti PIN) bisa menunggu; pemanggil lain tetap fire-and-forget.
    const clean = deepClone(payload);
    if (Array.isArray(clean.transactions)) {
      clean.transactions.forEach((tx) => {
        if (tx.receiptId) delete tx.receipt;
      });
    }

    return (async () => {
      try {
        let toStore = clean;
        if (this.encryptionEnabled) {
          toStore = await encryptWorkspace(clean, this._encryptionKey);
        }
        await repository.putWorkspace(this.workspaceId, toStore);
        // Setelah data terenkripsi tersimpan di IndexedDB, hapus salinan
        // plaintext lama dari localStorage agar tidak bisa dibaca tanpa PIN.
        if (this.encryptionEnabled) {
          try {
            localStorage.removeItem(workspaceStorageKey(this.workspaceId));
          } catch {
            /* noop */
          }
        }
        this.updateWorkspaceMeta(payload);
        this.lastError = null;
      } catch (error) {
        console.error('Gagal menyimpan ke IndexedDB:', error);
        this.lastError = error;
      }
    })();
  }

  updateWorkspaceMeta(data = null) {
    if (!this.workspaceId || !data) return;
    const meta = this.registry.workspaces[this.workspaceId] || {};
    this.registry.workspaces[this.workspaceId] = {
      ...meta,
      id: this.workspaceId,
      name: data.settings.workspaceName || data.settings.householdName || 'Ruang',
      inviteCode: data.settings.inviteCode || meta.inviteCode || '',
      ownerEmail: data.settings.ownerEmail || meta.ownerEmail || '',
      updatedAt: nowISO(),
    };
    writeWorkspaceRegistry(this.registry);
  }

  async openWorkspace(workspaceId, { account = null } = {}) {
    if (!workspaceId) return false;
    try {
      let raw = null;
      let fromLocalStorage = false;

      if (this._idbReady) {
        try {
          const record = await repository.getWorkspace(workspaceId);
          if (record) {
            let workspaceData = record.data;
            // Jika data terenkripsi (AES-GCM), dekripsi terlebih dahulu menggunakan kunci dari memori.
            if (workspaceData && workspaceData.encrypted) {
              if (!this._encryptionKey) {
                throw new Error('Data terenkripsi tetapi kunci enkripsi tidak tersedia di memori. Unlock dulu.');
              }
              workspaceData = await decryptWorkspace(workspaceData, this._encryptionKey);
            }
            if (workspaceData) {
              raw = JSON.stringify(workspaceData);
            }
          }
        } catch {
          // Abaikan error IDB, coba localStorage
        }
      }

      if (!raw) {
        raw = localStorage.getItem(workspaceStorageKey(workspaceId));
        fromLocalStorage = true;
      }

      if (!raw) return false;

      this.data = migrateData(JSON.parse(raw));
      this.workspaceId = workspaceId;
      this.account = account || this.accountForWorkspace(workspaceId);
      this.currentUserId = null;

      // Jika data masih ada di localStorage tapi IDB sudah siap, lakukan migrasi
      // secara bertahap saat workspace dibuka.
      if (fromLocalStorage && this._idbReady && !(await repository.isMigrated())) {
        const result = await repository.migrateFromLocalStorage();
        if (result.workspaces > 0 || result.receipts > 0) {
          console.info(
            `IndexedDB migrasi saat buka: ${result.workspaces} workspace, ${result.receipts} struk`
          );
        }
      }

      await this.persist();
      return true;
    } catch (error) {
      console.error('Gagal membuka ruang:', error);
      this.lastError = error;
      return false;
    }
  }

  accountForWorkspace(workspaceId) {
    const entry = Object.values(this.registry.accounts).find(
      (item) => item?.workspaceId === workspaceId
    );
    return entry ? { email: entry.email, name: entry.name, picture: entry.picture || '' } : null;
  }

  registerAccount(account, workspaceId) {
    const email = String(account?.email || '')
      .trim()
      .toLowerCase();
    if (!email) return;
    this.registry.accounts[email] = {
      email,
      workspaceId,
      name: String(account.name || email),
      picture: String(account.picture || ''),
      lastLoginAt: nowISO(),
    };
    writeWorkspaceRegistry(this.registry);
    localStorage.setItem(
      APP.lastAccountKey,
      JSON.stringify({
        email,
        workspaceId,
        name: String(account.name || email),
        picture: String(account.picture || ''),
      })
    );
  }

  ensureMember(account) {
    const email = String(account?.email || '')
      .trim()
      .toLowerCase();
    if (!email) return this.data.users.find((item) => !item.deletedAt) || this.data.users[0];
    // Match by googleEmail or firebaseUid only — never by name, to avoid
    // wrongly merging two different people who happen to share a name.
    let user = this.data.users.find(
      (item) => !item.deletedAt && String(item.googleEmail || '').toLowerCase() === email
    );
    if (user) {
      const firebaseUid = String(account?.firebaseUid || '').trim();
      if (firebaseUid && user.firebaseUid !== firebaseUid) {
        user.firebaseUid = firebaseUid;
        user.updatedAt = nowISO();
        this.persist();
      }
      const picture = String(account?.picture || '').trim();
      if (picture && user.picture !== picture) {
        user.picture = picture;
        user.updatedAt = nowISO();
        this.persist();
      }
      return user;
    }
    // Create new user
    const name = String(account?.name || email.split('@')[0] || 'Pengguna').trim() || 'Pengguna';
    user = {
      id: uid('user'),
      name,
      color: '#2563EB',
      initials: initialsFromName(name),
      googleEmail: email,
      picture: String(account?.picture || ''),
      pinHash: '',
      pinSalt: '',
      pinIterations: 0,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    this.data.users.push(user);
    this.data.updatedAt = nowISO();
    this.data.revision = Math.max(1, Number(this.data.revision) || 1) + 1;
    this.persist();
    return user;
  }

  async signInWithGoogle(account) {
    const email = String(account?.email || '')
      .trim()
      .toLowerCase();
    if (!email) throw new Error('Akun Google tidak valid.');
    // Bridge Google login to Firebase Auth so each household is isolated by UID.
    try {
      await Cloud.signInWithGoogle(GoogleDrive.accessToken);
    } catch {
      /* noop */
    }
    const entry = this.registry.accounts[email];
    if (entry?.workspaceId && this.openWorkspace(entry.workspaceId, { account })) {
      const user = await this.attachFirebaseUid(this.ensureMember(account));
      this.currentUserId = user.id;
      this.persist();
      return { user, created: false, workspaceId: this.workspaceId };
    }

    const legacy = this.readLegacyData();
    if (legacy) {
      const match = (legacy.users || []).find(
        (user) => String(user.googleEmail || '').toLowerCase() === email
      );
      if (match) {
        const workspaceId = this.adoptLegacyWorkspace(legacy, account);
        this.openWorkspace(workspaceId, { account });
        const user = await this.attachFirebaseUid(this.ensureMember(account));
        this.currentUserId = user.id;
        this.persist();
        return { user, created: false, adopted: true, workspaceId };
      }
    }

    const workspaceId = uid('ws');
    this.data = createDefaultData(account);
    this.workspaceId = workspaceId;
    this.account = account;
    const user = await this.attachFirebaseUid(this.data.users[0]);
    this.currentUserId = user.id;
    this.data.settings.ownerEmail = email;
    this.updateWorkspaceMeta();
    this.registerAccount(account, workspaceId);
    this.persist();
    return { user, created: true, workspaceId };
  }

  /** Simpan UID Firebase pada profil anggota agar bisa dicabut dari cloud. */
  async attachFirebaseUid(user) {
    if (!user) return user;
    try {
      const uid = await Cloud.getFirebaseUid();
      if (uid) user.firebaseUid = String(uid);
    } catch {
      /* offline / provider lokal */
    }
    return user;
  }

  readLegacyData() {
    try {
      const raw = localStorage.getItem(APP.storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.users)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  adoptLegacyWorkspace(legacy, account) {
    if (
      this.registry.legacyWorkspaceId &&
      localStorage.getItem(workspaceStorageKey(this.registry.legacyWorkspaceId))
    ) {
      return this.registry.legacyWorkspaceId;
    }
    const workspaceId = uid('ws');
    const data = migrateData(legacy);
    data.settings.workspaceName = data.settings.workspaceName || data.settings.householdName;
    data.settings.inviteCode = data.settings.inviteCode || generateInviteCode();
    data.settings.ownerEmail =
      data.settings.ownerEmail ||
      data.users.find((user) => user.googleEmail)?.googleEmail ||
      account.email;
    data.users.forEach((user) => {
      if (!user.googleEmail) return;
      this.registry.accounts[user.googleEmail] = {
        email: user.googleEmail,
        workspaceId,
        name: user.name,
        picture: user.picture || '',
        lastLoginAt: nowISO(),
      };
    });
    this.registry.workspaces[workspaceId] = {
      id: workspaceId,
      name: data.settings.workspaceName,
      inviteCode: data.settings.inviteCode,
      ownerEmail: data.settings.ownerEmail,
      updatedAt: nowISO(),
    };
    this.registry.legacyWorkspaceId = workspaceId;
    localStorage.setItem(workspaceStorageKey(workspaceId), JSON.stringify(data));
    writeWorkspaceRegistry(this.registry);
    return workspaceId;
  }

  async joinWorkspaceByCode(code, account) {
    const normalized = String(code || '')
      .trim()
      .toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(normalized)) {
      throw new Error('Kode undangan tidak valid.');
    }

    // 1. Cari workspace lokal yang memakai kode ini (satu perangkat).
    const localWorkspaceId = Object.keys(this.registry.workspaces).find(
      (id) => String(this.registry.workspaces[id]?.inviteCode || '').toUpperCase() === normalized
    );
    let workspaceId = localWorkspaceId || null;
    let matchedLocally = Boolean(
      workspaceId && localStorage.getItem(workspaceStorageKey(workspaceId))
    );
    if (matchedLocally) {
      matchedLocally = this.openWorkspace(workspaceId, { account });
    }
    if (!matchedLocally) {
      // 2. Tidak ada di perangkat ini: siapkan workspace lokal untuk akun
      //    tersebut. Data lokal ini nanti digabung ke household pemilik.
      const session = await this.signInWithGoogle(account);
      workspaceId = session.workspaceId;
    }

    let user = await this.attachFirebaseUid(this.ensureMember(account));
    this.currentUserId = user.id;
    this.registerAccount(account, workspaceId);
    this.persist();

    // 3. Cari household pemilik lewat index cloud, lalu pindah ke sana.
    let cloudResult = null;
    let cloudError = null;
    try {
      const invite = await Cloud.resolveInviteCode(normalized);
      if (invite?.ownerUid) {
        this.prepareHouseholdJoin();
        cloudResult = await Cloud.joinHousehold(invite.ownerUid, {
          name: user.name,
          email: user.googleEmail || account?.email || '',
          picture: user.picture || '',
        });
        if (!cloudResult?.ok && !cloudResult?.skipped) {
          cloudError = cloudResult?.error || new Error('Gagal bergabung ke cloud keluarga.');
        }
      } else if (!matchedLocally) {
        cloudError = new Error(
          'Kode undangan tidak ditemukan. Pastikan pemilik ruang sudah membuka aplikasi versi terbaru.'
        );
      }
    } catch (error) {
      cloudError = error;
    }

    if (cloudError) {
      console.warn('Gabung household cloud gagal:', cloudError);
      if (!matchedLocally) throw cloudError;
    }

    // Merge/dedupe bisa mengganti profil anggota dengan id kanonik dari
    // perangkat pemilik. Kembalikan profil yang masih aktif.
    const resolved = this.resolveUser(this.currentUserId);
    if (resolved) {
      user = resolved;
      this.currentUserId = resolved.id;
      this.persist();
    }

    return {
      user,
      workspaceId: this.workspaceId,
      cloud: cloudResult,
      localOnly: matchedLocally && !cloudResult?.ok,
    };
  }

  /**
   * Saat anggota bergabung, pengaturan household (nama ruang, kode undangan,
   * anggaran) harus mengikuti data pemilik. Turunkan timestamp lokal agar
   * mergeRemote memilih pengaturan remote, sementara transaksi/akun lokal
   * tetap digabung berdasarkan id.
   */
  prepareHouseholdJoin() {
    if (!this.data?.settings) return;
    this.data.settings.updatedAt = new Date(0).toISOString();
  }

  openLastWorkspace() {
    try {
      const last = JSON.parse(localStorage.getItem(APP.lastAccountKey) || 'null');
      if (!last?.workspaceId) return null;
      if (!this.openWorkspace(last.workspaceId, { account: last })) return null;
      const user = this.data.users.find(
        (item) =>
          !item.deletedAt &&
          String(item.googleEmail || '').toLowerCase() === String(last.email || '').toLowerCase()
      );
      if (!user) return null;
      this.currentUserId = user.id;
      this.account = last;
      return { user, hasPin: Boolean(user.pinHash) };
    } catch {
      return null;
    }
  }

  getWorkspaceCode() {
    return String(this.data?.settings?.inviteCode || '');
  }

  rotateWorkspaceCode() {
    const code = generateInviteCode();
    this.updateSettings({ inviteCode: code });
    return code;
  }

  get hasWorkspace() {
    return Boolean(this.workspaceId && this.data);
  }

  /**
   * Enkripsi at-rest aktif jika pengguna saat ini memiliki PIN (pinHash/pinVerifier)
   * dan kunci enkripsi tersedia di memori.
   */
  get encryptionEnabled() {
    return Boolean(this._encrypted && this._encryptionKey);
  }

  /**
   * Kunci AES-GCM dari memori (hanya tersedia setelah PIN diverifikasi).
   */
  get encryptionKey() {
    return this._encryptionKey;
  }

  /**
   * Kunci enkripsi aktif di memori? (true setelah unlock, false setelah lock)
   */
  get isUnlocked() {
    return Boolean(this._encryptionKey);
  }

  /**
   * Pasang kunci AES-GCM di memori dan aktifkan enkripsi at-rest.
   * Dipakai oleh alur setup/ganti PIN setelah kredensial pengguna disimpan.
   * @param {CryptoKey|null} key
   * @param {string} salt
   */
  setEncryptionKey(key, salt) {
    this._encryptionKey = key || null;
    this._encrypted = Boolean(key);
    storeEncryptionKey(key, salt);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(detail = {}) {
    const event = {
      source: detail.source || 'local',
      reason: detail.reason || 'update',
      silent: Boolean(detail.silent),
      timestamp: Date.now(),
    };
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('Store listener error:', error);
      }
    });
  }

  setCurrentUser(userId) {
    this.currentUserId = userId;
  }

  /**
   * Periksa apakah workspace di IndexedDB tersimpan dalam bentuk terenkripsi.
   * Tidak memerlukan kunci — hanya memeriksa bentuk record.
   * @param {string} workspaceId
   * @returns {Promise<boolean>}
   */
  async isWorkspaceEncrypted(workspaceId) {
    if (!this._idbReady) return false;
    try {
      const record = await repository.getWorkspace(workspaceId);
      return Boolean(record?.data?.encrypted);
    } catch {
      return false;
    }
  }

  /**
   * Kunci aplikasi: hapus kunci enkripsi dari memori dan bersihkan data terdekripsi.
   * Dipanggil saat auto-lock atau logout manual.
   */
  lock() {
    clearEncryptionKey();
    this._encryptionKey = null;
    this._encrypted = false;
    this.data = null;
    this.currentUserId = null;
    this.emit({ source: 'local', reason: 'auth:lock', silent: false });
  }

  /**
   * Unlock dengan PIN. Memverifikasi PIN, menurunkan kunci AES-GCM dari memori,
   * dan memuat ulang workspace dari IndexedDB (terdekripsi).
   * @param {string} pin
   * @returns {Promise<boolean>}
   */
  async unlock(pin) {
    const user = this.currentUser;
    if (!user) throw new Error('Tidak ada pengguna saat ini.');
    if (!user.pinHash && !user.pinVerifier) {
      throw new Error('Pengguna ini tidak memiliki PIN.');
    }

    // Verifikasi PIN via verifier (tidak membuka kunci enkripsi),
    // fallback ke pinHash jika verifier belum tersedia (migrasi).
    let valid = false;
    if (user.pinVerifier && user.pinSalt) {
      valid = await verifyPinByVerifier(user, pin);
    }
    if (!valid) {
      valid = await verifyPin(user, pin);
    }
    if (!valid) throw new Error('PIN salah.');

    // Turunkan kunci AES-GCM dari PIN + salt.
    const salt = user.pinSalt;
    const iterations = Number(user.pinIterations) || ENC_ITERATIONS;
    const key = await deriveEncryptionKey(pin, salt, iterations);

    this.setEncryptionKey(key, salt);

    // Muat ulang workspace dari IndexedDB (akan didekripsi otomatis).
    if (this.workspaceId) {
      await this.openWorkspace(this.workspaceId, { account: this.account });
    }

    this.emit({ source: 'local', reason: 'auth:unlock', silent: false });
    return true;
  }

  get currentUser() {
    return this.resolveUser(this.currentUserId);
  }

  getUser(userId) {
    return this.data.users.find((user) => user.id === userId) || null;
  }

  resolveUser(userId) {
    let user = userId ? this.getUser(userId) : null;
    const seen = new Set();
    while (user?.deletedAt && user.mergedInto && !seen.has(user.id)) {
      seen.add(user.id);
      user = this.getUser(user.mergedInto);
    }
    return user && !user.deletedAt ? user : null;
  }

  activeUsers() {
    return this.data.users.filter((user) => !user.deletedAt);
  }

  commit(reason, mutator, options = {}) {
    const { source = 'local', silent = false, emit = true, touchRoot = true } = options;
    const now = nowISO();
    const draft = deepClone(this.data);
    const result = mutator(draft, now);
    if (touchRoot) {
      draft.updatedAt = now;
      draft.revision = Math.max(1, Number(draft.revision) || 1) + 1;
      if (source === 'local') draft.updatedBy = this.currentUserId || draft.updatedBy;
    }
    this.persist(draft);
    // Hapus base64 receipt dari data di memori jika receiptId tersedia,
    // agar tidak menumpuk string besar di RAM.
    if (Array.isArray(draft.transactions)) {
      draft.transactions.forEach((tx) => {
        if (tx.receiptId) delete tx.receipt;
      });
    }
    this.data = draft;
    if (emit) this.emit({ source, reason, silent });
    return result;
  }

  /* ------------------------------------------------------------------------ */
  /*  Transactions                                                            */
  /* ------------------------------------------------------------------------ */

  addTransaction(payload) {
    return this.commit('transaction:add', (data, now) => {
      const user = this.getUser(payload.createdBy || this.currentUserId) || this.currentUser;
      const tx = {
        id: uid('tx'),
        date: payload.date || todayISO(),
        time: normalizeTime(payload.time, currentTimeHHMM()),
        type: ['income', 'expense', 'transfer'].includes(payload.type) ? payload.type : 'expense',
        amount: Math.max(0, Math.round(safeNumber(payload.amount))),
        accountId: payload.accountId || null,
        toAccountId: payload.type === 'transfer' ? payload.toAccountId || null : null,
        categoryId: payload.type === 'transfer' ? null : payload.categoryId || null,
        subcategoryId: payload.type === 'transfer' ? null : payload.subcategoryId || null,
        note: String(payload.note || '').trim(),
        payee: String(payload.payee || '').trim(),
        tags: Array.isArray(payload.tags)
          ? payload.tags
              .map(String)
              .map((t) => t.trim())
              .filter(Boolean)
              .slice(0, 20)
          : [],
        splits: Array.isArray(payload.splits)
          ? payload.splits
              .map((s) => ({
                categoryId: s?.categoryId || null,
                subcategoryId: s?.subcategoryId || null,
                amount: Math.max(0, Math.round(safeNumber(s?.amount))),
                note: String(s?.note || '').trim(),
              }))
              .filter((s) => s.amount > 0)
          : [],
        payments: normalizePayments(payload.payments),
        receiptId: typeof payload.receiptId === 'string' ? payload.receiptId : null,
        receipt:
          !payload.receiptId &&
          typeof payload.receipt === 'string' &&
          payload.receipt.startsWith('data:')
            ? payload.receipt
            : null,
        createdBy: user?.id || this.currentUserId || this.data.users[0]?.id || 'owner',
        createdByName: user?.name || this.data.users[0]?.name || 'Pengguna',
        createdAt: now,
        updatedAt: now,
        updatedBy: user?.id || null,
        recurringId: payload.recurringId || null,
        autoGenerated: Boolean(payload.autoGenerated),
      };
      data.transactions.push(tx);
      return tx;
    });
  }

  updateTransaction(id, payload) {
    return this.commit('transaction:update', (data, now) => {
      const tx = data.transactions.find((item) => item.id === id && !item.deletedAt);
      if (!tx) throw new Error('Transaksi tidak ditemukan.');
      const type = ['income', 'expense', 'transfer'].includes(payload.type)
        ? payload.type
        : tx.type;
      Object.assign(tx, {
        date: payload.date || tx.date,
        time: normalizeTime(
          payload.time,
          tx.time || timeFromISO(tx.createdAt) || currentTimeHHMM()
        ),
        type,
        amount: Math.max(0, Math.round(safeNumber(payload.amount))),
        accountId: payload.accountId || tx.accountId,
        toAccountId: type === 'transfer' ? payload.toAccountId || tx.toAccountId || null : null,
        categoryId: type === 'transfer' ? null : payload.categoryId || null,
        subcategoryId: type === 'transfer' ? null : payload.subcategoryId || null,
        note: String(payload.note || '').trim(),
        payee: payload.payee === undefined ? tx.payee : String(payload.payee || '').trim(),
        tags:
          payload.tags === undefined
            ? Array.isArray(tx.tags)
              ? tx.tags
              : []
            : Array.isArray(payload.tags)
              ? payload.tags
                  .map(String)
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .slice(0, 20)
              : [],
        splits:
          payload.splits === undefined
            ? Array.isArray(tx.splits)
              ? tx.splits
              : []
            : Array.isArray(payload.splits)
              ? payload.splits
                  .map((s) => ({
                    categoryId: s?.categoryId || null,
                    subcategoryId: s?.subcategoryId || null,
                    amount: Math.max(0, Math.round(safeNumber(s?.amount))),
                    note: String(s?.note || '').trim(),
                  }))
                  .filter((s) => s.amount > 0)
              : [],
        payments:
          payload.payments === undefined
            ? Array.isArray(tx.payments)
              ? tx.payments
              : []
            : normalizePayments(payload.payments),
        receiptId: payload.receiptId === undefined ? tx.receiptId : payload.receiptId,
        receipt:
          payload.receipt === undefined
            ? tx.receipt
            : typeof payload.receipt === 'string' && payload.receipt.startsWith('data:')
              ? payload.receipt
              : null,
        updatedAt: now,
        updatedBy: this.currentUserId || tx.updatedBy || null,
      });

      // Hapus blob struk lama jika receiptId berubah atau dihapus.
      const oldReceiptId = tx.receiptId;
      const newReceiptId = tx.receiptId;
      if (oldReceiptId && oldReceiptId !== newReceiptId && this._idbReady) {
        void repository.deleteReceipt(oldReceiptId).catch(() => {});
      }
      return tx;
    });
  }

  deleteTransaction(id) {
    return this.commit('transaction:delete', (data, now) => {
      const tx = data.transactions.find((item) => item.id === id && !item.deletedAt);
      if (!tx) throw new Error('Transaksi tidak ditemukan.');
      tx.deletedAt = now;
      tx.updatedAt = now;
      tx.updatedBy = this.currentUserId || tx.updatedBy || null;
      return tx;
    });
  }

  restoreTransaction(id) {
    return this.commit('transaction:restore', (data, now) => {
      const tx = data.transactions.find((item) => item.id === id);
      if (!tx) throw new Error('Transaksi tidak ditemukan.');
      delete tx.deletedAt;
      tx.updatedAt = now;
      tx.updatedBy = this.currentUserId || tx.updatedBy || null;
      return tx;
    });
  }

  /* ------------------------------------------------------------------------ */
  /*  Receipt (lampiran struk)                                                */
  /* ------------------------------------------------------------------------ */

  /**
   * Ambil data struk dari IndexedDB.
   * @param {string} receiptId
   * @returns {Promise<{id: string, blob: Blob, mimeType: string, size: number, createdAt: string} | null>}
   */
  async getReceipt(receiptId) {
    if (!receiptId || !this._idbReady) return null;
    try {
      return await repository.getReceipt(receiptId);
    } catch (error) {
      console.error('Gagal membaca struk:', error);
      return null;
    }
  }

  /**
   * Simpan blob struk ke IndexedDB.
   * @param {string} receiptId
   * @param {Blob} blob
   * @param {string} mimeType
   */
  async putReceipt(receiptId, blob, mimeType) {
    if (!receiptId || !blob || !this._idbReady) return;
    try {
      await repository.putReceipt(receiptId, blob, mimeType);
      // Revoke URL lama jika ada di cache.
      const oldUrl = this._receiptUrlCache.get(receiptId);
      if (oldUrl) {
        try {
          URL.revokeObjectURL(oldUrl);
        } catch {
          /* noop */
        }
        this._receiptUrlCache.delete(receiptId);
      }
    } catch (error) {
      console.error('Gagal menyimpan struk:', error);
    }
  }

  /**
   * Hapus struk dari IndexedDB.
   * @param {string} receiptId
   */
  async deleteReceipt(receiptId) {
    if (!receiptId || !this._idbReady) return;
    try {
      const url = this._receiptUrlCache.get(receiptId);
      if (url) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* noop */
        }
        this._receiptUrlCache.delete(receiptId);
      }
      await repository.deleteReceipt(receiptId);
    } catch (error) {
      console.error('Gagal menghapus struk:', error);
    }
  }

  /**
   * Ambil object URL untuk ditampilkan di <img>. URL di-cache per receiptId.
   * @param {string} receiptId
   * @returns {Promise<string | null>}
   */
  async getReceiptUrl(receiptId) {
    if (!receiptId || !this._idbReady) return null;
    try {
      const cached = this._receiptUrlCache.get(receiptId);
      if (cached) return cached;
      const record = await repository.getReceipt(receiptId);
      if (!record || !record.blob) return null;
      const url = URL.createObjectURL(record.blob);
      this._receiptUrlCache.set(receiptId, url);
      return url;
    } catch (error) {
      console.error('Gagal membuat URL struk:', error);
      return null;
    }
  }

  /**
   * Buang object URL dari cache (untuk mencegah memory leak).
   * @param {string} receiptId
   */
  revokeReceiptUrl(receiptId) {
    if (!receiptId) return;
    const url = this._receiptUrlCache.get(receiptId);
    if (url) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* noop */
      }
      this._receiptUrlCache.delete(receiptId);
    }
  }

  /**
   * Bersihkan struk yatim (blob yang tidak direferensi oleh transaksi mana pun).
   * Dipanggil secara periodik atau saat logout/reset.
   */
  async cleanupOrphanReceipts() {
    if (!this._idbReady) return;
    try {
      const usedIds = new Set();
      (this.data?.transactions || []).forEach((tx) => {
        if (tx.receiptId) usedIds.add(tx.receiptId);
      });

      const records = await repository.getAllReceipts();
      await Promise.allSettled(
        records
          .filter((record) => !usedIds.has(record.id))
          .map((record) => repository.deleteReceipt(record.id))
      );
    } catch (error) {
      console.error('Gagal membersihkan struk yatim:', error);
    }
  }

  transactionById(id) {
    return this.data.transactions.find((item) => item.id === id && !item.deletedAt) || null;
  }

  transactions({ includeDeleted = false } = {}) {
    return this.data.transactions
      .filter((tx) => includeDeleted || !tx.deletedAt)
      .slice()
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        const timeA = transactionTime(a);
        const timeB = transactionTime(b);
        if (timeA !== timeB) return timeA < timeB ? 1 : -1;
        return recordStamp(b) - recordStamp(a);
      });
  }

  transactionsBetween(start, end, { includeDeleted = false } = {}) {
    return this.transactions({ includeDeleted }).filter((tx) => tx.date >= start && tx.date <= end);
  }

  transactionsForMonth(key) {
    const range = monthRange(key);
    return this.transactionsBetween(range.start, range.end);
  }

  transactionsForDate(date) {
    return this.transactions().filter((tx) => tx.date === date);
  }

  summaryForTransactions(list, { accountIds = null } = {}) {
    const scopedAccountIds = accountIds ? new Set(accountIds) : null;
    let income = 0;
    let expense = 0;
    let transfers = 0;
    list.forEach((tx) => {
      let amount = safeNumber(tx.amount);
      if (scopedAccountIds) {
        const payments = Array.isArray(tx.payments)
          ? tx.payments.filter((payment) => safeNumber(payment?.amount) > 0)
          : [];
        if (payments.length) {
          amount = payments
            .filter((payment) => scopedAccountIds.has(payment.accountId))
            .reduce((sum, payment) => sum + safeNumber(payment.amount), 0);
        } else if (!scopedAccountIds.has(tx.accountId) && !scopedAccountIds.has(tx.toAccountId)) {
          amount = 0;
        }
      }
      if (tx.type === 'income') income += amount;
      else if (tx.type === 'expense') expense += amount;
      else if (tx.type === 'transfer') transfers += amount;
    });
    return {
      income,
      expense,
      transfers,
      net: income - expense,
      savingsRate: income > 0 ? ((income - expense) / income) * 100 : 0,
      count: list.length,
    };
  }

  monthSummary(key) {
    return this.summaryForTransactions(this.transactionsForMonth(key));
  }

  rangeSummary(start, end) {
    return this.summaryForTransactions(this.transactionsBetween(start, end));
  }

  daySummary(date) {
    return this.summaryForTransactions(this.transactionsForDate(date));
  }

  closingForMonth(month = monthKey()) {
    const summary = this.monthSummary(month);
    const transactions = this.transactionsForMonth(month);
    const expenseTransactions = transactions.filter((tx) => tx.type === 'expense');
    const average = expenseTransactions.length
      ? expenseTransactions.reduce((total, tx) => total + safeNumber(tx.amount), 0) /
        expenseTransactions.length
      : 0;
    const topCategory = this.expenseByCategory(month)[0] || null;
    return {
      month,
      income: summary.income,
      expense: summary.expense,
      net: summary.net,
      savingsRate: summary.savingsRate,
      transfers: summary.transfers,
      count: summary.count,
      average,
      topCategory,
      closed: this.isMonthClosed(month),
    };
  }

  closingMonths() {
    const list = Array.isArray(this.data.closedMonths) ? this.data.closedMonths : [];
    return list
      .filter((entry) => entry && typeof entry.month === 'string')
      .slice()
      .sort((a, b) => String(b.month).localeCompare(String(a.month)));
  }

  isMonthClosed(month = monthKey()) {
    return this.closingMonths().some((entry) => entry.month === month);
  }

  closeMonth(month = monthKey()) {
    const closing = this.closingForMonth(month);
    const list = this.closingMonths().filter((entry) => entry.month !== month);
    list.unshift({ ...closing, month, closedAt: nowISO(), closedBy: this.currentUserId || null });
    this.data.closedMonths = list.slice(0, 24);
    this.persist();
    this.emit({ source: 'local', reason: 'data:closing' });
    return this.data.closedMonths[0];
  }

  reopenMonth(month = monthKey()) {
    const list = this.closingMonths().filter((entry) => entry.month !== month);
    this.data.closedMonths = list;
    this.persist();
    this.emit({ source: 'local', reason: 'data:closing' });
    return { month };
  }

  lockMonth(month = monthKey(), reason = null) {
    const monthKeyStr = String(month || monthKey());
    const existing = this.closingMonths().find((entry) => entry.month === monthKeyStr);
    const now = nowISO();
    let entry;
    if (existing) {
      entry = existing;
      entry.lockedAt = now;
      entry.lockedBy = this.currentUserId || null;
      entry.lockReason = reason || null;
    } else {
      const closing = this.closingForMonth(monthKeyStr);
      entry = {
        ...closing,
        month: monthKeyStr,
        closedAt: now,
        closedBy: this.currentUserId || null,
        lockedAt: now,
        lockedBy: this.currentUserId || null,
        lockReason: reason || null,
      };
      const list = this.closingMonths().filter((e) => e.month !== monthKeyStr);
      list.unshift(entry);
      this.data.closedMonths = list.slice(0, 24);
    }
    this.persist();
    this.emit({ source: 'local', reason: 'data:closing' });
    return entry;
  }

  unlockMonth(month = monthKey()) {
    const monthKeyStr = String(month || monthKey());
    const list = this.closingMonths().filter((entry) => entry.month !== monthKeyStr);
    this.data.closedMonths = list;
    this.persist();
    this.emit({ source: 'local', reason: 'data:closing' });
    return { month: monthKeyStr };
  }

  isMonthLocked(month = monthKey()) {
    return this.closingMonths().some((entry) => entry.month === String(month));
  }

  lockedMonths() {
    return this.closingMonths().filter((entry) => entry.lockedAt);
  }

  carryBudgets(fromMonth, toMonth) {
    const from = String(fromMonth);
    const to = String(toMonth);
    if (from === to) throw new Error('Bulan tujuan harus berbeda dari bulan asal.');
    const entries = {};
    this.budgetStatus(from).categories.forEach((item) => {
      if (item.limit > 0) entries[item.category.id] = item.limit;
    });
    const total = this.totalBudget(from);
    if (total > 0) entries.__total__ = total;
    if (!Object.keys(entries).length) {
      return { carried: 0, total: 0 };
    }
    const now = nowISO();
    this.commit('budget:carry', (data) => {
      Object.entries(entries).forEach(([categoryId, amount]) => {
        const id = categoryId || '__total__';
        let record = data.budgets.find((budget) => budget.month === to && budget.categoryId === id);
        if (record) {
          record.amount = Math.max(0, Math.round(safeNumber(amount)));
          record.updatedAt = now;
          record.carriedFrom = from;
          record.carriedAt = now;
          delete record.deletedAt;
        } else {
          data.budgets.push({
            id: uid('budget'),
            month: to,
            categoryId: id,
            amount: Math.max(0, Math.round(safeNumber(amount))),
            createdAt: now,
            updatedAt: now,
            carriedFrom: from,
            carriedAt: now,
          });
        }
      });
    });
    this.persist();
    this.emit({ source: 'local', reason: 'budget:carry' });
    return { carried: Object.keys(entries).length, total: safeNumber(total) };
  }

  monthlyTrend(months = 6, endMonth = monthKey()) {
    const [year, month] = endMonth.split('-').map(Number);
    const result = [];
    for (let offset = months - 1; offset >= 0; offset -= 1) {
      const date = new Date(year, month - 1 - offset, 1);
      const key = monthKey(date);
      const summary = this.monthSummary(key);
      result.push({ month: key, ...summary });
    }
    return result;
  }

  transactionCategoryParts(tx) {
    const amount = safeNumber(tx?.amount);
    const splits = Array.isArray(tx?.splits)
      ? tx.splits.filter((split) => safeNumber(split?.amount) > 0)
      : [];
    if (splits.length) {
      return splits.map((split) => ({
        categoryId: split.categoryId || null,
        subcategoryId: split.subcategoryId || null,
        amount: safeNumber(split.amount),
      }));
    }
    return [
      {
        categoryId: tx?.categoryId || null,
        subcategoryId: tx?.subcategoryId || null,
        amount,
      },
    ];
  }

  expenseByCategory(month = monthKey()) {
    const categories = new Map();
    this.transactionsForMonth(month)
      .filter((tx) => tx.type === 'expense')
      .forEach((tx) => {
        this.transactionCategoryParts(tx).forEach((part) => {
          const cat = this.categoryById(part.categoryId);
          const key = part.categoryId || 'uncategorized';
          if (!categories.has(key)) {
            categories.set(key, {
              categoryId: key,
              name: cat?.name || 'Tanpa kategori',
              color: cat?.color || '#94A3B8',
              icon: cat?.icon || 'tag',
              total: 0,
            });
          }
          categories.get(key).total += part.amount;
        });
      });
    return [...categories.values()].sort((a, b) => b.total - a.total);
  }

  creatorBreakdown(month = monthKey()) {
    const map = new Map();
    this.transactionsForMonth(month).forEach((tx) => {
      const key = tx.createdBy || 'unknown';
      if (!map.has(key)) {
        map.set(key, {
          userId: key,
          name: tx.createdByName || this.getUser(key)?.name || 'Tidak diketahui',
          count: 0,
          income: 0,
          expense: 0,
        });
      }
      const entry = map.get(key);
      entry.count += 1;
      if (tx.type === 'income') entry.income += safeNumber(tx.amount);
      if (tx.type === 'expense') entry.expense += safeNumber(tx.amount);
    });
    return [...map.values()].sort((a, b) => b.count - a.count);
  }

  memberSpending(month = monthKey()) {
    const map = new Map();
    this.activeUsers().forEach((user) => {
      map.set(user.id, {
        userId: user.id,
        name: user.name,
        color: user.color,
        count: 0,
        income: 0,
        expense: 0,
      });
    });
    if (!map.has('__unassigned__')) {
      map.set('__unassigned__', {
        userId: '__unassigned__',
        name: 'Tanpa pemilik',
        color: 'var(--muted)',
        count: 0,
        income: 0,
        expense: 0,
      });
    }
    this.transactionsForMonth(month).forEach((tx) => {
      const payments = Array.isArray(tx.payments)
        ? tx.payments.filter((payment) => safeNumber(payment?.amount) > 0)
        : [];
      if (payments.length) {
        payments.forEach((payment) => {
          const paymentAccount = this.accountById(payment.accountId);
          const memberId = payment.memberId || paymentAccount?.owner;
          const targetId = memberId && map.has(memberId) ? memberId : '__unassigned__';
          const paymentEntry = map.get(targetId);
          if (!paymentEntry) return;
          paymentEntry.count += 1;
          if (tx.type === 'income') paymentEntry.income += safeNumber(payment.amount);
          if (tx.type === 'expense') paymentEntry.expense += safeNumber(payment.amount);
        });
        return;
      }
      const account = this.accountById(tx.accountId);
      const ownerId = account?.owner && map.has(account.owner) ? account.owner : '__unassigned__';
      const entry = map.get(ownerId);
      if (!entry) return;
      entry.count += 1;
      if (tx.type === 'income') entry.income += safeNumber(tx.amount);
      if (tx.type === 'expense') entry.expense += safeNumber(tx.amount);
      if (tx.type === 'transfer' && tx.toAccountId) {
        const toAccount = this.accountById(tx.toAccountId);
        const toOwner =
          toAccount?.owner && map.has(toAccount.owner) ? toAccount.owner : '__unassigned__';
        if (toOwner !== ownerId) {
          const toEntry = map.get(toOwner);
          if (toEntry) {
            toEntry.count += 0;
          }
        }
      }
    });
    return [...map.values()].filter((item) => item.count > 0).sort((a, b) => b.expense - a.expense);
  }

  categoryTrend(month = monthKey(), limit = 6) {
    const previous = shiftMonthKey(month, -1);
    const currentMap = new Map();
    const previousMap = new Map();
    this.expenseByCategory(month).forEach((item) => currentMap.set(item.categoryId, item.total));
    this.expenseByCategory(previous).forEach((item) =>
      previousMap.set(item.categoryId, item.total)
    );
    const ids = new Set([...currentMap.keys(), ...previousMap.keys()]);
    const rows = [...ids].map((id) => {
      const cat = this.categoryById(id);
      const current = currentMap.get(id) || 0;
      const prev = previousMap.get(id) || 0;
      const diff = current - prev;
      return {
        categoryId: id,
        name: cat?.name || 'Tanpa kategori',
        color: cat?.color || '#94A3B8',
        icon: cat?.icon || 'tag',
        current,
        previous: prev,
        diff,
        percent: prev > 0 ? (diff / prev) * 100 : current > 0 ? 100 : 0,
      };
    });
    return rows.sort((a, b) => b.current + b.previous - (a.current + a.previous)).slice(0, limit);
  }

  /* ------------------------------------------------------------------------ */
  /*  Accounts                                                                */
  /* ------------------------------------------------------------------------ */

  accountById(id) {
    return this.data.accounts.find((account) => account.id === id) || null;
  }

  activeAccounts() {
    return this.data.accounts.filter((account) => !account.archived && !account.deletedAt);
  }

  archivedAccounts() {
    return this.data.accounts.filter((account) => account.archived && !account.deletedAt);
  }

  accountBalance(accountId) {
    const account = this.accountById(accountId);
    if (!account) return 0;
    let balance = safeNumber(account.openingBalance);
    this.transactions({ includeDeleted: false }).forEach((tx) => {
      const amount = safeNumber(tx.amount);
      const payments = Array.isArray(tx.payments)
        ? tx.payments.filter((payment) => safeNumber(payment?.amount) > 0)
        : [];
      if (tx.type === 'transfer') {
        if (tx.accountId === accountId) balance -= amount;
        if (tx.toAccountId === accountId) balance += amount;
        return;
      }
      if (payments.length) {
        payments.forEach((payment) => {
          if (payment.accountId !== accountId) return;
          const paid = safeNumber(payment.amount);
          if (tx.type === 'income') balance += paid;
          if (tx.type === 'expense') balance -= paid;
        });
        return;
      }
      if (tx.type === 'income' && tx.accountId === accountId) balance += amount;
      if (tx.type === 'expense' && tx.accountId === accountId) balance -= amount;
    });
    return balance;
  }

  accountTransactions(accountId) {
    return this.transactions().filter(
      (tx) =>
        tx.accountId === accountId ||
        tx.toAccountId === accountId ||
        (Array.isArray(tx.payments) &&
          tx.payments.some((payment) => payment.accountId === accountId))
    );
  }

  totalBalance() {
    return sum(this.activeAccounts().map((account) => this.accountBalance(account.id)));
  }

  accountOwners(account) {
    if (!account) return [];
    const owners = [account.owner, ...(Array.isArray(account.sharedWith) ? account.sharedWith : [])]
      .map((id) => String(id || '').trim())
      .filter(Boolean);
    return [...new Set(owners)];
  }

  personalBalance(userId = null) {
    const ownerId = userId || this.currentUserId;
    return sum(
      this.activeAccounts()
        .filter((account) => this.accountOwners(account).includes(ownerId))
        .map((account) => this.accountBalance(account.id))
    );
  }

  accountsByOwner(userId = null) {
    const ownerId = userId || this.currentUserId;
    return this.activeAccounts().filter((account) => this.accountOwners(account).includes(ownerId));
  }

  sharedAccounts() {
    return this.activeAccounts().filter(
      (account) => Array.isArray(account.sharedWith) && account.sharedWith.length > 0
    );
  }

  creditAccounts() {
    return this.activeAccounts().filter((account) => account.type === 'credit');
  }

  creditSpent(accountId) {
    const account = this.accountById(accountId);
    if (!account || account.type !== 'credit') return 0;
    const spent = this.transactions()
      .filter((tx) => tx.type === 'expense' && !tx.adjustment)
      .reduce((total, tx) => {
        const payments = Array.isArray(tx.payments) ? tx.payments : [];
        if (payments.length) {
          return (
            total +
            payments
              .filter((payment) => payment.accountId === accountId)
              .reduce((sum, payment) => sum + safeNumber(payment.amount), 0)
          );
        }
        if (tx.accountId === accountId || tx.toAccountId === accountId) {
          return total + safeNumber(tx.amount);
        }
        return total;
      }, 0);
    const opening = safeNumber(account.openingBalance) || 0;
    return Math.max(0, spent + opening);
  }

  remainingCreditLimit(account) {
    const limit = safeNumber(account?.creditLimit);
    if (!(limit > 0)) return 0;
    const spent = account?.id ? this.creditSpent(account.id) : 0;
    return Math.max(0, limit - spent);
  }

  saveAccount(payload, id = null) {
    return this.commit(id ? 'account:update' : 'account:add', (data, now) => {
      const owner = payload.owner || this.currentUserId || data.users?.[0]?.id || 'owner';
      if (id) {
        const account = data.accounts.find((item) => item.id === id);
        if (!account) throw new Error('Akun tidak ditemukan.');
        const currentBalance = this.accountBalance(id);
        Object.assign(account, {
          name: String(payload.name || account.name).trim(),
          type: payload.type || account.type,
          color: payload.color || account.color,
          openingBalance:
            payload.openingBalance === undefined
              ? safeNumber(account.openingBalance)
              : safeNumber(payload.openingBalance),
          owner: payload.owner || account.owner || owner,
          sharedWith: Array.isArray(payload.sharedWith)
            ? payload.sharedWith
            : account.sharedWith || [],
          creditLimit:
            payload.creditLimit === undefined
              ? safeNumber(account.creditLimit)
              : safeNumber(payload.creditLimit),
          creditDueDate:
            payload.creditDueDate === undefined
              ? account.creditDueDate || null
              : payload.creditDueDate || null,
          loanPrincipal:
            payload.loanPrincipal === undefined
              ? safeNumber(account.loanPrincipal)
              : safeNumber(payload.loanPrincipal),
          loanInterestRate:
            payload.loanInterestRate === undefined
              ? safeNumber(account.loanInterestRate)
              : safeNumber(payload.loanInterestRate),
          loanTermMonths:
            payload.loanTermMonths === undefined
              ? safeNumber(account.loanTermMonths)
              : safeNumber(payload.loanTermMonths),
          loanMonthlyPayment:
            payload.loanMonthlyPayment === undefined
              ? safeNumber(account.loanMonthlyPayment)
              : safeNumber(payload.loanMonthlyPayment),
          loanStartDate:
            payload.loanStartDate === undefined
              ? account.loanStartDate || null
              : payload.loanStartDate || null,
          loanNextDueDate:
            payload.loanNextDueDate === undefined
              ? account.loanNextDueDate || null
              : payload.loanNextDueDate || null,
          loanRemaining:
            payload.loanRemaining === undefined
              ? safeNumber(account.loanRemaining)
              : safeNumber(payload.loanRemaining),
          updatedAt: now,
        });

        // Editing "Saldo akun ini" creates a visible correction transaction
        // instead of silently changing the opening balance.
        const targetBalance = Number(payload.balanceTarget);
        if (payload.balanceTarget !== undefined && Number.isFinite(targetBalance)) {
          const delta = Math.round(targetBalance - Math.round(currentBalance));
          if (delta !== 0) {
            const user = this.currentUser || this.getUser(this.currentUserId);
            data.transactions.push({
              id: uid('tx'),
              date: todayISO(),
              time: currentTimeHHMM(),
              type: delta > 0 ? 'income' : 'expense',
              amount: Math.abs(delta),
              accountId: account.id,
              toAccountId: null,
              categoryId: null,
              subcategoryId: null,
              note: 'Penyesuaian saldo',
              adjustment: true,
              createdBy: user?.id || this.currentUserId || data.users?.[0]?.id || 'owner',
              createdByName: user?.name || data.users?.[0]?.name || 'Pengguna',
              createdAt: now,
              updatedAt: now,
              updatedBy: user?.id || null,
              recurringId: null,
              autoGenerated: false,
            });
          }
        }
        return account;
      }
      const account = {
        id: uid('acc'),
        name: String(payload.name || 'Akun baru').trim(),
        type: payload.type || 'cash',
        color: payload.color || '#3B82F6',
        openingBalance: safeNumber(payload.openingBalance),
        owner: owner,
        sharedWith: Array.isArray(payload.sharedWith) ? payload.sharedWith : [],
        creditLimit: safeNumber(payload.creditLimit),
        creditDueDate: payload.creditDueDate || null,
        loanPrincipal: safeNumber(payload.loanPrincipal),
        loanInterestRate: safeNumber(payload.loanInterestRate),
        loanTermMonths: safeNumber(payload.loanTermMonths),
        loanMonthlyPayment: safeNumber(payload.loanMonthlyPayment),
        loanStartDate: payload.loanStartDate || null,
        loanNextDueDate: payload.loanNextDueDate || null,
        loanRemaining:
          payload.loanRemaining === undefined
            ? safeNumber(payload.loanPrincipal)
            : safeNumber(payload.loanRemaining),
        archived: false,
        createdAt: now,
        updatedAt: now,
      };
      data.accounts.push(account);
      return account;
    });
  }

  deleteAccount(id) {
    return this.commit('account:delete', (data, now) => {
      const account = data.accounts.find((item) => item.id === id);
      if (!account) throw new Error('Akun tidak ditemukan.');
      account.deletedAt = now;
      account.archived = true;
      account.updatedAt = now;
      return account;
    });
  }
  setAccountArchived(id, archived) {
    return this.commit('account:archive', (data, now) => {
      const account = data.accounts.find((item) => item.id === id);
      if (!account) throw new Error('Akun tidak ditemukan.');
      if (!archived && !this.activeAccounts().some((a) => a.id === id)) {
        // Still allowed; this is a user choice.
      }
      account.archived = Boolean(archived);
      account.updatedAt = now;
      return account;
    });
  }

  /* ------------------------------------------------------------------------ */
  /*  Categories & budgets                                                    */
  /* ------------------------------------------------------------------------ */

  categoryById(id) {
    return this.data.categories.find((category) => category.id === id) || null;
  }

  categories(type = null) {
    return this.data.categories
      .filter((category) => !category.deletedAt)
      .filter((category) => !type || category.type === type);
  }

  subcategoryById(categoryId, subcategoryId) {
    const category = this.categoryById(categoryId);
    return category?.subcategories?.find((sub) => sub.id === subcategoryId) || null;
  }

  categoryName(id) {
    return this.categoryById(id)?.name || 'Tanpa kategori';
  }

  accountName(id) {
    return this.accountById(id)?.name || 'Akun terhapus';
  }

  saveCategory(payload, id = null) {
    return this.commit(id ? 'category:update' : 'category:add', (data, now) => {
      if (id) {
        const category = data.categories.find((item) => item.id === id);
        if (!category) throw new Error('Kategori tidak ditemukan.');
        Object.assign(category, {
          name: String(payload.name || category.name).trim(),
          type: payload.type === 'income' ? 'income' : category.type,
          icon: payload.icon || category.icon,
          color: payload.color || category.color,
          updatedAt: now,
        });
        return category;
      }
      const category = {
        id: uid('cat'),
        name: String(payload.name || 'Kategori baru').trim(),
        type: payload.type === 'income' ? 'income' : 'expense',
        icon: payload.icon || 'tag',
        color: payload.color || '#64748B',
        subcategories: [],
        createdAt: now,
        updatedAt: now,
      };
      data.categories.push(category);
      return category;
    });
  }

  deleteCategory(id) {
    return this.commit('category:delete', (data, now) => {
      const category = data.categories.find((item) => item.id === id);
      if (!category) throw new Error('Kategori tidak ditemukan.');
      category.deletedAt = now;
      category.updatedAt = now;
      return category;
    });
  }

  addSubcategory(categoryId, name) {
    return this.commit('subcategory:add', (data, now) => {
      const category = data.categories.find((item) => item.id === categoryId);
      if (!category) throw new Error('Kategori tidak ditemukan.');
      const sub = { id: uid('sub'), name: String(name || 'Subkategori').trim(), updatedAt: now };
      category.subcategories.push(sub);
      category.updatedAt = now;
      return sub;
    });
  }

  renameSubcategory(categoryId, subcategoryId, name) {
    return this.commit('subcategory:update', (data, now) => {
      const category = data.categories.find((item) => item.id === categoryId);
      const sub = category?.subcategories?.find((item) => item.id === subcategoryId);
      if (!category || !sub) throw new Error('Subkategori tidak ditemukan.');
      sub.name = String(name || sub.name).trim();
      sub.updatedAt = now;
      category.updatedAt = now;
      return sub;
    });
  }

  deleteSubcategory(categoryId, subcategoryId) {
    return this.commit('subcategory:delete', (data, now) => {
      const category = data.categories.find((item) => item.id === categoryId);
      const sub = category?.subcategories?.find((item) => item.id === subcategoryId);
      if (!category || !sub) throw new Error('Subkategori tidak ditemukan.');
      sub.deletedAt = now;
      sub.updatedAt = now;
      category.updatedAt = now;
      return sub;
    });
  }

  getBudget(month, categoryId = '__total__') {
    const id = categoryId || '__total__';
    return (
      this.data.budgets.find(
        (budget) => budget.month === month && budget.categoryId === id && !budget.deletedAt
      ) || null
    );
  }

  totalBudget(month = monthKey()) {
    const record = this.getBudget(month, '__total__');
    return record ? safeNumber(record.amount) : safeNumber(this.data.settings.defaultMonthlyBudget);
  }

  categoryBudget(month, categoryId) {
    return safeNumber(this.getBudget(month, categoryId)?.amount || 0);
  }

  setBudget(month, categoryId, amount) {
    return this.commit('budget:set', (data, now) => {
      const id = categoryId || '__total__';
      const value = Math.max(0, Math.round(safeNumber(amount)));
      let record = data.budgets.find(
        (budget) => budget.month === month && budget.categoryId === id
      );
      if (record) {
        record.amount = value;
        record.updatedAt = now;
        delete record.deletedAt;
      } else {
        record = {
          id: uid('budget'),
          month,
          categoryId: id,
          amount: value,
          createdAt: now,
          updatedAt: now,
        };
        data.budgets.push(record);
      }
      return record;
    });
  }

  setBudgets(month, entries) {
    return this.commit('budget:bulk', (data, now) => {
      const results = [];
      Object.entries(entries).forEach(([categoryId, rawAmount]) => {
        const id = categoryId || '__total__';
        const value = Math.max(0, Math.round(safeNumber(rawAmount)));
        let record = data.budgets.find(
          (budget) => budget.month === month && budget.categoryId === id
        );
        if (record) {
          record.amount = value;
          record.updatedAt = now;
          delete record.deletedAt;
        } else {
          record = {
            id: uid('budget'),
            month,
            categoryId: id,
            amount: value,
            createdAt: now,
            updatedAt: now,
          };
          data.budgets.push(record);
        }
        results.push(record);
      });
      return results;
    });
  }

  budgetStatus(month = monthKey()) {
    const total = this.totalBudget(month);
    const summary = this.monthSummary(month);
    const spent = summary.expense;
    const remaining = total - spent;
    const percent = total > 0 ? (spent / total) * 100 : 0;
    const warning = safeNumber(this.data.settings.budgetWarning, 75);
    const danger = safeNumber(this.data.settings.budgetDanger, 90);
    let tone = 'safe';
    if (total > 0 && percent >= 100) tone = 'over';
    else if (total > 0 && percent >= danger) tone = 'danger';
    else if (total > 0 && percent >= warning) tone = 'warning';
    return {
      total,
      spent,
      remaining,
      percent,
      tone,
      warning,
      danger,
      categories: this.categories('expense').map((category) => {
        const spentForCategory = this.transactionsForMonth(month)
          .filter((tx) => tx.type === 'expense')
          .reduce((totalSpent, tx) => {
            const partTotal = this.transactionCategoryParts(tx)
              .filter((part) => part.categoryId === category.id)
              .reduce((sum, part) => sum + part.amount, 0);
            return totalSpent + partTotal;
          }, 0);
        const limit = this.categoryBudget(month, category.id);
        return {
          category,
          spent: spentForCategory,
          limit,
          remaining: limit - spentForCategory,
          percent: limit > 0 ? (spentForCategory / limit) * 100 : 0,
        };
      }),
    };
  }

  /* ------------------------------------------------------------------------ */
  /*  Recurring transactions                                                  */
  /* ------------------------------------------------------------------------ */

  recurringRules({ includeDeleted = false } = {}) {
    const list = Array.isArray(this.data?.recurring) ? this.data.recurring : [];
    return list
      .filter((rule) => includeDeleted || !rule?.deletedAt)
      .slice()
      .sort((a, b) => String(a?.nextDate || '').localeCompare(String(b?.nextDate || '')));
  }

  recurringById(id) {
    return this.data.recurring.find((rule) => rule.id === id && !rule.deletedAt) || null;
  }

  goals({ includeDeleted = false } = {}) {
    const list = Array.isArray(this.data?.goals) ? this.data.goals : [];
    return list.filter((goal) => includeDeleted || !goal?.deletedAt);
  }

  goalById(id) {
    return (this.data.goals || []).find((goal) => goal.id === id && !goal.deletedAt) || null;
  }

  saveGoal(payload, id = null) {
    return this.commit(id ? 'goal:update' : 'goal:add', (data, now) => {
      if (!Array.isArray(data.goals)) data.goals = [];
      const targetAmount = Math.max(0, Number(payload.targetAmount) || 0);
      const currentAmount = Math.max(0, Number(payload.currentAmount) || 0);
      if (id) {
        const goal = data.goals.find((item) => item.id === id);
        if (!goal) throw new Error('Target tidak ditemukan.');
        Object.assign(goal, {
          name: String(payload.name || goal.name).trim() || goal.name,
          targetAmount: payload.targetAmount === undefined ? goal.targetAmount : targetAmount,
          currentAmount: payload.currentAmount === undefined ? goal.currentAmount : currentAmount,
          dueDate: payload.dueDate === undefined ? goal.dueDate : payload.dueDate || null,
          color: payload.color || goal.color,
          updatedAt: now,
        });
        return goal;
      }
      const goal = {
        id: uid('goal'),
        name: String(payload.name || 'Target baru').trim(),
        targetAmount,
        currentAmount,
        dueDate: payload.dueDate || null,
        color: payload.color || '#10B981',
        createdBy: this.currentUserId || data.users?.[0]?.id || 'owner',
        createdAt: now,
        updatedAt: now,
      };
      data.goals.push(goal);
      return goal;
    });
  }

  deleteGoal(id) {
    return this.commit('goal:delete', (data, now) => {
      const goal = data.goals.find((item) => item.id === id);
      if (!goal) throw new Error('Target tidak ditemukan.');
      goal.deletedAt = now;
      goal.updatedAt = now;
      return goal;
    });
  }

  netWorthHistory() {
    return (this.data.netWorthHistory || []).slice().sort((a, b) => a.month.localeCompare(b.month));
  }

  recordNetWorthSnapshot() {
    if (!this.data) return;
    const month = new Date().toISOString().slice(0, 7);
    const value = this.totalBalance();
    if (!Array.isArray(this.data.netWorthHistory)) this.data.netWorthHistory = [];
    const existing = this.data.netWorthHistory.find((entry) => entry.month === month);
    if (existing) {
      existing.value = value;
      existing.recordedAt = new Date().toISOString();
    } else {
      this.data.netWorthHistory.push({ month, value, recordedAt: new Date().toISOString() });
    }
    // keep last 24 months
    this.data.netWorthHistory = this.data.netWorthHistory
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-24);
  }

  saveRecurring(payload, id = null) {
    return this.commit(id ? 'recurring:update' : 'recurring:add', (data, now) => {
      const type = ['income', 'expense', 'transfer'].includes(payload.type)
        ? payload.type
        : 'expense';
      if (id) {
        const rule = data.recurring.find((item) => item.id === id);
        if (!rule) throw new Error('Transaksi berulang tidak ditemukan.');
        const nextDate = payload.nextDate || rule.nextDate;
        Object.assign(rule, {
          title: String(payload.title || rule.title).trim(),
          type,
          amount: Math.max(0, Math.round(safeNumber(payload.amount))),
          accountId: payload.accountId || rule.accountId,
          toAccountId: type === 'transfer' ? payload.toAccountId || null : null,
          categoryId: type === 'transfer' ? null : payload.categoryId || null,
          subcategoryId: type === 'transfer' ? null : payload.subcategoryId || null,
          note: String(payload.note || '').trim(),
          frequency: payload.frequency || rule.frequency,
          interval: Math.max(1, Number(payload.interval) || 1),
          nextDate,
          anchorDay: Number(String(nextDate).slice(8, 10)) || rule.anchorDay || 1,
          endDate: payload.endDate || null,
          autoPost: payload.autoPost !== false,
          active: payload.active !== false,
          updatedAt: now,
        });
        return rule;
      }
      const nextDate = payload.nextDate || todayISO();
      const user = this.getUser(payload.createdBy || this.currentUserId) || this.currentUser;
      const rule = {
        id: uid('rec'),
        title: String(payload.title || 'Transaksi berulang').trim(),
        type,
        amount: Math.max(0, Math.round(safeNumber(payload.amount))),
        accountId: payload.accountId || null,
        toAccountId: type === 'transfer' ? payload.toAccountId || null : null,
        categoryId: type === 'transfer' ? null : payload.categoryId || null,
        subcategoryId: type === 'transfer' ? null : payload.subcategoryId || null,
        note: String(payload.note || '').trim(),
        frequency: payload.frequency || 'monthly',
        interval: Math.max(1, Number(payload.interval) || 1),
        anchorDay: Number(String(nextDate).slice(8, 10)) || 1,
        nextDate,
        startDate: nextDate,
        endDate: payload.endDate || null,
        autoPost: payload.autoPost !== false,
        active: payload.active !== false,
        lastRunDate: null,
        createdBy: user?.id || this.currentUserId || this.data.users[0]?.id || 'owner',
        createdByName: user?.name || this.data.users[0]?.name || 'Pengguna',
        createdAt: now,
        updatedAt: now,
      };
      data.recurring.push(rule);
      return rule;
    });
  }

  setRecurringActive(id, active) {
    return this.commit('recurring:toggle', (data, now) => {
      const rule = data.recurring.find((item) => item.id === id && !item.deletedAt);
      if (!rule) throw new Error('Transaksi berulang tidak ditemukan.');
      rule.active = Boolean(active);
      rule.updatedAt = now;
      return rule;
    });
  }

  deleteRecurring(id) {
    return this.commit('recurring:delete', (data, now) => {
      const rule = data.recurring.find((item) => item.id === id && !item.deletedAt);
      if (!rule) throw new Error('Transaksi berulang tidak ditemukan.');
      rule.deletedAt = now;
      rule.updatedAt = now;
      return rule;
    });
  }

  _postRecurringOccurrence(data, rule, date, now) {
    const transactionId = `rec_${rule.id}_${date}`;
    const exists = data.transactions.some((tx) => tx.id === transactionId);
    if (exists) return false;
    const account = data.accounts.find((item) => item.id === rule.accountId && !item.deletedAt);
    if (!account) return false;
    if (rule.type === 'transfer') {
      const toAccount = data.accounts.find(
        (item) => item.id === rule.toAccountId && !item.deletedAt
      );
      if (!toAccount) return false;
    }
    if (rule.type === 'expense') {
      const creditLimit = safeNumber(account.creditLimit);
      const spent = this.creditSpent(rule.accountId);
      const remaining = Math.max(0, creditLimit - spent);
      if (creditLimit > 0 && safeNumber(rule.amount) > remaining) {
        // Jangan auto-post tagihan yang melebihi sisa limit kredit.
        return false;
      }
    }
    data.transactions.push({
      id: transactionId,
      date,
      time: currentTimeHHMM(),
      type: rule.type,
      amount: Math.max(0, Math.round(safeNumber(rule.amount))),
      accountId: rule.accountId,
      toAccountId: rule.type === 'transfer' ? rule.toAccountId : null,
      categoryId: rule.type === 'transfer' ? null : rule.categoryId,
      subcategoryId: rule.type === 'transfer' ? null : rule.subcategoryId,
      note: rule.note || rule.title,
      createdBy: rule.createdBy,
      createdByName: rule.createdByName,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'system',
      recurringId: rule.id,
      autoGenerated: true,
    });
    return true;
  }

  processRecurring({ today = todayISO(), maxOccurrences = 120 } = {}) {
    let posted = 0;
    let changedRules = false;
    const data = this.data;
    const now = nowISO();
    const generated = [];

    data.recurring
      .filter((rule) => rule.active && !rule.deletedAt && rule.autoPost)
      .forEach((rule) => {
        let guard = 0;
        let nextDate = rule.nextDate || rule.startDate || today;
        while (nextDate <= today && guard < maxOccurrences) {
          guard += 1;
          if (rule.endDate && nextDate > rule.endDate) {
            rule.active = false;
            rule.updatedAt = now;
            changedRules = true;
            break;
          }
          const didPost = this._postRecurringOccurrence(data, rule, nextDate, now);
          if (didPost) {
            posted += 1;
            generated.push(nextDate);
          }
          rule.lastRunDate = nextDate;
          nextDate = advanceDate(nextDate, rule.frequency, rule.interval, rule.anchorDay);
          rule.nextDate = nextDate;
          rule.updatedAt = now;
          changedRules = true;
          if (rule.endDate && nextDate > rule.endDate) {
            rule.active = false;
            break;
          }
        }
      });

    if (posted > 0 || changedRules) {
      data.updatedAt = now;
      data.revision = Math.max(1, Number(data.revision) || 1) + 1;
      this.persist();
      if (posted > 0) this.emit({ source: 'local', reason: 'recurring:auto', silent: false });
      else this.emit({ source: 'local', reason: 'recurring:update', silent: true });
    }
    return { posted, dates: generated };
  }

  postRecurringNow(id, date = null) {
    let posted = false;
    this.commit('recurring:post', (data, now) => {
      const rule = data.recurring.find((item) => item.id === id && !item.deletedAt);
      if (!rule) throw new Error('Transaksi berulang tidak ditemukan.');
      const targetDate = date || rule.nextDate || todayISO();
      posted = this._postRecurringOccurrence(data, rule, targetDate, now);
      rule.lastRunDate = targetDate;
      rule.nextDate = advanceDate(targetDate, rule.frequency, rule.interval, rule.anchorDay);
      rule.updatedAt = now;
      return rule;
    });
    return posted;
  }

  upcomingRecurring(limit = 5, days = 45) {
    const end = addDaysLocal(todayISO(), days);
    return this.recurringRules()
      .filter((rule) => rule.active)
      .filter((rule) => rule.nextDate <= end)
      .sort((a, b) => String(a.nextDate).localeCompare(String(b.nextDate)))
      .slice(0, limit);
  }

  dueRecurring() {
    return this.recurringRules().filter((rule) => rule.active && rule.nextDate <= todayISO());
  }

  /* ------------------------------------------------------------------------ */
  /*  Notes & todos                                                           */
  /* ------------------------------------------------------------------------ */

  notes({ includeDeleted = false } = {}) {
    return this.data.notes
      .filter((note) => includeDeleted || !note.deletedAt)
      .slice()
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (a.order !== b.order) return a.order - b.order;
        return recordStamp(b) - recordStamp(a);
      });
  }

  noteById(id) {
    return this.data.notes.find((note) => note.id === id && !note.deletedAt) || null;
  }

  saveNote(payload, id = null, options = {}) {
    return this.commit(
      id ? 'note:update' : 'note:add',
      (data, now) => {
        if (id) {
          const note = data.notes.find((item) => item.id === id && !item.deletedAt);
          if (!note) throw new Error('Catatan tidak ditemukan.');
          const items = (Array.isArray(payload.items) ? payload.items : note.items)
            .map((item) => ({
              id: item.id || uid('item'),
              text: String(item.text || '').trim(),
              done: Boolean(item.done),
            }))
            .filter((item) => item.text);
          const allItemsDone = items.length > 0 && items.every((item) => item.done);
          Object.assign(note, {
            kind: payload.kind === 'todo' ? 'todo' : note.kind,
            title: String(payload.title ?? note.title).trim() || 'Tanpa judul',
            content: String(payload.content ?? note.content),
            color: payload.color || note.color,
            pinned: payload.pinned ?? note.pinned,
            favorite: payload.favorite ?? note.favorite,
            tags: Array.isArray(payload.tags)
              ? payload.tags.map(String).filter(Boolean).slice(0, 20)
              : note.tags,
            items,
            done: payload.done ?? (items.length ? allItemsDone : note.done),
            dueDate: payload.dueDate ?? note.dueDate,
            reminderAt: payload.reminderAt ?? note.reminderAt,
            priority: payload.priority || note.priority,
            status: payload.status || note.status,
            updatedAt: now,
            completedAt: (payload.done ?? note.done) ? note.completedAt || now : null,
          });
          return note;
        }
        const user = this.getUser(payload.createdBy || this.currentUserId) || this.currentUser;
        const items = Array.isArray(payload.items)
          ? payload.items
              .map((item) => ({
                id: item.id || uid('item'),
                text: String(item.text || '').trim(),
                done: Boolean(item.done),
              }))
              .filter((item) => item.text)
          : [];
        const allItemsDone = items.length > 0 && items.every((item) => item.done);
        const note = {
          id: uid('note'),
          kind: payload.kind === 'todo' ? 'todo' : 'note',
          title: String(payload.title || '').trim() || 'Tanpa judul',
          content: String(payload.content || ''),
          color: payload.color || 'yellow',
          pinned: Boolean(payload.pinned),
          favorite: Boolean(payload.favorite),
          tags: Array.isArray(payload.tags)
            ? payload.tags.map(String).filter(Boolean).slice(0, 20)
            : [],
          items,
          done: Boolean(payload.done ?? allItemsDone),
          dueDate: payload.dueDate || null,
          reminderAt: payload.reminderAt || null,
          lastNotifiedAt: null,
          priority: payload.priority || 'normal',
          status: 'active',
          order: Date.now(),
          createdBy: user?.id || this.currentUserId || this.data.users[0]?.id || 'owner',
          createdByName: user?.name || this.data.users[0]?.name || 'Pengguna',
          createdAt: now,
          updatedAt: now,
          completedAt: payload.done || allItemsDone ? now : null,
        };
        data.notes.push(note);
        return note;
      },
      options
    );
  }

  updateNote(id, patch, options = {}) {
    return this.saveNote(patch, id, options);
  }

  setNoteStatus(id, status) {
    return this.commit(`note:${status}`, (data, now) => {
      const note = data.notes.find((item) => item.id === id && !item.deletedAt);
      if (!note) throw new Error('Catatan tidak ditemukan.');
      note.status = ['active', 'archived', 'trashed'].includes(status) ? status : 'active';
      note.updatedAt = now;
      return note;
    });
  }

  toggleNoteFlag(id, field) {
    if (!['pinned', 'favorite'].includes(field)) throw new Error('Flag tidak dikenal.');
    return this.commit(`note:${field}`, (data, now) => {
      const note = data.notes.find((item) => item.id === id && !item.deletedAt);
      if (!note) throw new Error('Catatan tidak ditemukan.');
      note[field] = !note[field];
      note.updatedAt = now;
      return note;
    });
  }

  toggleTodoDone(id, done = null) {
    return this.commit('note:todo-toggle', (data, now) => {
      const note = data.notes.find((item) => item.id === id && !item.deletedAt);
      if (!note) throw new Error('Tugas tidak ditemukan.');
      const nextDone = done === null ? !note.done : Boolean(done);
      note.done = nextDone;
      if (note.items.length)
        note.items.forEach((item) => {
          item.done = nextDone;
        });
      note.completedAt = nextDone ? now : null;
      note.updatedAt = now;
      return note;
    });
  }

  toggleTodoItem(noteId, itemId) {
    return this.commit('note:item-toggle', (data, now) => {
      const note = data.notes.find((item) => item.id === noteId && !item.deletedAt);
      const item = note?.items?.find((entry) => entry.id === itemId);
      if (!note || !item) throw new Error('Item tugas tidak ditemukan.');
      item.done = !item.done;
      note.done = note.items.length > 0 && note.items.every((entry) => entry.done);
      note.completedAt = note.done ? now : null;
      note.updatedAt = now;
      return note;
    });
  }

  duplicateNote(id) {
    return this.commit('note:duplicate', (data, now) => {
      const source = data.notes.find((item) => item.id === id && !item.deletedAt);
      if (!source) throw new Error('Catatan tidak ditemukan.');
      const copy = deepClone(source);
      copy.id = uid('note');
      copy.title = `${source.title} (salinan)`;
      copy.pinned = false;
      copy.status = 'active';
      copy.order = Date.now();
      copy.createdAt = now;
      copy.updatedAt = now;
      copy.completedAt = null;
      copy.items = copy.items.map((item) => ({ ...item, id: uid('item'), done: false }));
      data.notes.push(copy);
      return copy;
    });
  }

  purgeNote(id) {
    return this.commit('note:purge', (data, now) => {
      const note = data.notes.find((item) => item.id === id && !item.deletedAt);
      if (!note) throw new Error('Catatan tidak ditemukan.');
      note.deletedAt = now;
      note.updatedAt = now;
      return note;
    });
  }

  emptyTrash() {
    return this.commit('note:empty-trash', (data, now) => {
      let count = 0;
      data.notes.forEach((note) => {
        if (!note.deletedAt && note.status === 'trashed') {
          note.deletedAt = now;
          note.updatedAt = now;
          count += 1;
        }
      });
      return count;
    });
  }

  noteTags() {
    return [...new Set(this.notes().flatMap((note) => note.tags || []))].sort((a, b) =>
      a.localeCompare(b, 'id')
    );
  }

  noteCounts() {
    const notes = this.notes();
    return {
      all: notes.filter((note) => note.status === 'active').length,
      note: notes.filter((note) => note.status === 'active' && note.kind === 'note').length,
      todo: notes.filter((note) => note.status === 'active' && note.kind === 'todo').length,
      favorite: notes.filter((note) => note.status === 'active' && note.favorite).length,
      archived: notes.filter((note) => note.status === 'archived').length,
      trashed: notes.filter((note) => note.status === 'trashed').length,
    };
  }

  tasksDue(days = 7) {
    const end = addDaysLocal(todayISO(), days);
    return this.notes()
      .filter((note) => note.status === 'active' && note.kind === 'todo' && !note.done)
      .filter((note) => note.dueDate && note.dueDate <= end)
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  }

  remindersDue(now = new Date()) {
    const stamp = now.getTime();
    return this.notes()
      .filter((note) => note.status === 'active' && note.reminderAt && !note.done)
      .filter((note) => {
        const reminder = new Date(note.reminderAt).getTime();
        if (!Number.isFinite(reminder) || reminder > stamp) return false;
        if (!note.lastNotifiedAt) return true;
        return new Date(note.lastNotifiedAt).getTime() < reminder;
      });
  }

  markReminderNotified(id) {
    return this.commit(
      'note:reminder',
      (data, now) => {
        const note = data.notes.find((item) => item.id === id && !item.deletedAt);
        if (!note) return null;
        note.lastNotifiedAt = now;
        note.updatedAt = now;
        return note;
      },
      { silent: true }
    );
  }

  /* ------------------------------------------------------------------------ */
  /*  Settings & users                                                        */
  /* ------------------------------------------------------------------------ */

  updateSettings(patch) {
    return this.commit('settings:update', (data, now) => {
      Object.assign(data.settings, patch, { updatedAt: now });
      return data.settings;
    });
  }

  updateUser(id, patch) {
    return this.commit('user:update', (data, now) => {
      const user = data.users.find((item) => item.id === id);
      if (!user) throw new Error('Pengguna tidak ditemukan.');
      const allowed = [
        'name',
        'initials',
        'color',
        'googleEmail',
        'firebaseUid',
        'pinHash',
        'pinSalt',
        'pinIterations',
        'pinVerifier',
      ];
      allowed.forEach((key) => {
        if (patch[key] !== undefined) user[key] = patch[key];
      });
      user.updatedAt = now;
      // Simpan metadata PIN ke IndexedDB meta agar tersedia untuk unlock sebelum workspace didekripsi.
      if ((patch.pinHash || patch.pinSalt || patch.pinIterations || patch.pinVerifier) !== undefined) {
        void savePinMetadata(id, user.pinSalt || '', Number(user.pinIterations) || 0, user.pinVerifier || '').catch(() => {});
      }
      return user;
    });
  }

  removeMember(id) {
    return this.commit('user:remove', (data, now) => {
      const user = data.users.find((item) => item.id === id);
      if (!user) throw new Error('Pengguna tidak ditemukan.');
      if (data.users.filter((item) => !item.deletedAt).length <= 1) {
        throw new Error('Minimal satu anggota harus tetap ada.');
      }
      user.deletedAt = now;
      user.updatedAt = now;
      const email = String(user.googleEmail || '')
        .trim()
        .toLowerCase();
      if (email && this.registry?.accounts?.[email]?.workspaceId === this.workspaceId) {
        delete this.registry.accounts[email];
        writeWorkspaceRegistry(this.registry);
      }
      return user;
    });
  }

  userDisplayName(id) {
    return this.getUser(id)?.name || this.data?.users?.[0]?.name || 'Pengguna';
  }

  /* ------------------------------------------------------------------------ */
  /*  Backup, sample data, reset, sync merge                                  */
  /* ------------------------------------------------------------------------ */

  exportSnapshot() {
    return deepClone(this.data);
  }

  /**
   * Ekspor semua struk (blob) sebagai base64 data URL untuk backup.
   * @returns {Promise<Array<{id: string, mimeType: string, size: number, dataUrl: string}>>}
   */
  async exportReceipts() {
    const receipts = [];
    const txs = this.data?.transactions || [];
    for (const tx of txs) {
      if (tx.receiptId) {
        try {
          const record = await repository.getReceipt(tx.receiptId);
          if (record?.blob) {
            const dataUrl = await blobToDataUrl(record.blob);
            receipts.push({
              id: tx.receiptId,
              mimeType: record.mimeType,
              size: record.size,
              dataUrl,
            });
          }
        } catch (error) {
          console.warn(`Gagal ekspor struk ${tx.receiptId}:`, error);
        }
      }
    }
    return receipts;
  }

  /**
   * Impor struk dari backup ke IndexedDB.
   * @param {Array} receipts
   */
  async importReceipts(receipts = []) {
    if (!Array.isArray(receipts) || !this._idbReady) return;
    for (const receipt of receipts) {
      if (!receipt.id || !receipt.dataUrl) continue;
      try {
        const blob = dataURLToBlob(receipt.dataUrl);
        if (blob) {
          await repository.putReceipt(receipt.id, blob, receipt.mimeType);
        }
      } catch (error) {
        console.warn(`Gagal impor struk ${receipt.id}:`, error);
      }
    }
  }

  async importData(raw, { emit = true } = {}) {
    const draft = migrateData(raw);
    if (this.workspaceId) {
      draft.settings.workspaceName =
        draft.settings.workspaceName || draft.settings.householdName || 'Ruang';
      this.updateWorkspaceMeta(draft);
      draft.users.forEach((user) => {
        const email = String(user.googleEmail || '')
          .trim()
          .toLowerCase();
        if (!email) return;
        this.registry.accounts[email] = {
          email,
          workspaceId: this.workspaceId,
          name: user.name,
          picture: user.picture || '',
          lastLoginAt: nowISO(),
        };
      });
      writeWorkspaceRegistry(this.registry);
    }
    this.persist(draft);
    this.data = draft;
    if (emit) this.emit({ source: 'local', reason: 'data:import' });
    return this.data;
  }

  loadSampleData() {
    const actor = this.currentUser ||
      this.activeUsers()[0] || { id: this.currentUserId || 'owner', name: 'Pengguna' };
    const draft = createSampleData(this.data, actor);
    this.persist(draft);
    this.data = draft;
    this.emit({ source: 'local', reason: 'data:sample' });
    return this.data;
  }

  async resetLocalData() {
    const previousData = this.data;
    const previousWorkspaceId = this.workspaceId;
    try {
      if (this.workspaceId) {
        // Hapus semua struk yang direferensi oleh transaksi workspace ini.
        const txIds = new Set();
        (this.data?.transactions || []).forEach((tx) => {
          if (tx.receiptId) txIds.add(tx.receiptId);
        });
        await Promise.allSettled([...txIds].map((id) => repository.deleteReceipt(id)));

        if (this._idbReady) {
          await repository.deleteWorkspace(this.workspaceId);
        } else {
          localStorage.removeItem(workspaceStorageKey(this.workspaceId));
        }
        delete this.registry.workspaces[this.workspaceId];
        Object.keys(this.registry.accounts).forEach((email) => {
          if (this.registry.accounts[email]?.workspaceId === this.workspaceId) {
            delete this.registry.accounts[email];
          }
        });
        if (this.registry.legacyWorkspaceId === this.workspaceId) {
          this.registry.legacyWorkspaceId = null;
        }
        writeWorkspaceRegistry(this.registry);
      }
      if (!this._idbReady) {
        localStorage.removeItem(APP.storageKey);
      }
      this.data = createDefaultData();
      this.workspaceId = null;
      this.account = null;
      this.currentUserId = null;
      this.emit({ source: 'local', reason: 'data:reset' });
      return this.data;
    } catch (error) {
      // Rollback jika sesuatu gagal di tengah jalan
      this.data = previousData;
      this.workspaceId = previousWorkspaceId;
      throw error;
    }
  }

  mergeRemote(remoteRaw) {
    if (!remoteRaw || typeof remoteRaw !== 'object') {
      return { changed: false, data: this.data };
    }
    if (remoteRaw.app && remoteRaw.app !== 'risly-money-manager') {
      return { changed: false, data: this.data, warning: 'format' };
    }
    const remote = migrateData(remoteRaw);
    this._lastRemoteData = remote;
    const draft = deepClone(this.data);

    draft.users = mergeCollection(draft.users, remote.users);
    draft.accounts = mergeCollection(draft.accounts, remote.accounts);
    draft.categories = mergeCollection(draft.categories, remote.categories);
    draft.transactions = mergeCollection(draft.transactions, remote.transactions);
    draft.budgets = mergeCollection(draft.budgets, remote.budgets);
    draft.recurring = mergeCollection(draft.recurring, remote.recurring);
    draft.notes = mergeCollection(draft.notes, remote.notes);
    draft.goals = mergeCollection(draft.goals, remote.goals);
    draft.netWorthHistory = mergeCollection(draft.netWorthHistory, remote.netWorthHistory);

    const remoteClosed = Array.isArray(remote.closedMonths) ? remote.closedMonths : [];
    const localClosed = Array.isArray(draft.closedMonths) ? draft.closedMonths : [];
    const mergedClosed = localClosed.slice();
    remoteClosed.forEach((entry) => {
      const existing = mergedClosed.find((item) => item && item.month === entry?.month);
      if (existing) Object.assign(existing, entry);
      else mergedClosed.push({ ...entry });
    });
    mergedClosed.sort((a, b) => String(b?.month || '').localeCompare(String(a?.month || '')));
    draft.closedMonths = mergedClosed;

    if (recordStamp(remote.settings) > recordStamp(draft.settings)) {
      draft.settings = remote.settings;
    } else if (remote.settings) {
      draft.settings = {
        ...remote.settings,
        ...draft.settings,
        updatedAt: draft.settings.updatedAt,
      };
    }

    draft.revision = Math.max(Number(draft.revision) || 1, Number(remote.revision) || 1);
    if (new Date(remote.updatedAt || 0) > new Date(draft.updatedAt || 0)) {
      draft.updatedAt = remote.updatedAt;
    }
    draft.schemaVersion = APP.schemaVersion;
    dedupeUsers(draft);
    if (this.currentUserId) {
      const resolved = this.resolveUser(this.currentUserId);
      if (resolved) this.currentUserId = resolved.id;
    }

    const before = JSON.stringify(this.data);
    const after = JSON.stringify(draft);
    const changed = before !== after;
    if (changed) {
      this._recordMergeConflicts(draft);
      this.persist(draft);
      this.data = draft;
      this.emit({ source: 'remote', reason: 'sync:merge' });
    }
    return { changed, data: this.data };
  }

  /* ------------------------------------------------------------------------ */
  /*  Conflict log                                                            */
  /* ------------------------------------------------------------------------ */

  _loadConflictLog() {
    try {
      const raw = localStorage.getItem(CONFLICT_LOG_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) this._conflictLog = parsed;
    } catch {
      this._conflictLog = [];
    }
  }

  _saveConflictLog() {
    try {
      localStorage.setItem(CONFLICT_LOG_KEY, JSON.stringify(this._conflictLog));
    } catch {
      /* storage unavailable */
    }
  }

  /**
   * Bandingkan item lokal dan remote per id. Jika sama id namun konten berbeda,
   * catat sebagai konflik dengan pemenang (yang tersisa dalam draft).
   */
  _recordMergeConflicts(draft) {
    const remote = this._lastRemoteData;
    if (!remote) return;

    const collections = [
      'users',
      'accounts',
      'categories',
      'transactions',
      'budgets',
      'recurring',
      'notes',
      'goals',
      'netWorthHistory',
    ];

    const now = nowISO();
    let newConflicts = 0;

    collections.forEach((key) => {
      const localItems = Array.isArray(this.data?.[key]) ? this.data[key] : [];
      const remoteItems = Array.isArray(remote?.[key]) ? remote[key] : [];
      const mergedItems = Array.isArray(draft?.[key]) ? draft[key] : [];

      const localById = new Map();
      localItems.forEach((item) => {
        if (item?.id) localById.set(item.id, item);
      });
      const remoteById = new Map();
      remoteItems.forEach((item) => {
        if (item?.id) remoteById.set(item.id, item);
      });
      const mergedById = new Map();
      mergedItems.forEach((item) => {
        if (item?.id) mergedById.set(item.id, item);
      });

      remoteById.forEach((remoteItem, id) => {
        const localItem = localById.get(id);
        if (!localItem) return; // baru dari remote, bukan konflik

        const localStr = this._stripStamp(localItem);
        const remoteStr = this._stripStamp(remoteItem);
        if (localStr === remoteStr) return; // sama, tidak ada konflik

        const winner = mergedById.get(id);
        if (!winner) return;

        this._conflictLog.unshift({
          id: `conflict_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          collection: key,
          recordId: id,
          localValue: localItem,
          remoteValue: remoteItem,
          resolvedValue: winner,
          resolvedBy: winner.updatedBy || null,
          createdAt: now,
        });
        newConflicts += 1;
      });
    });

    if (newConflicts > 0) {
      // Batasi log agar tidak tumbuh tanpa batas.
      this._conflictLog = this._conflictLog.slice(0, 200);
      this._saveConflictLog();
      this.emit({
        source: 'remote',
        reason: 'sync:conflict',
        silent: false,
        detail: { conflictCount: newConflicts },
      });
    }
  }

  _stripStamp(item) {
    const clone = { ...item };
    delete clone.updatedAt;
    delete clone.updatedBy;
    return JSON.stringify(clone);
  }

  /**
   * Ambil log konflik sinkronisasi.
   */
  getConflictLog() {
    return [...this._conflictLog];
  }

  /**
   * Hapus semua entri log konflik.
   */
  clearConflictLog() {
    this._conflictLog = [];
    this._saveConflictLog();
  }
}

function addDaysLocal(value, days) {
  const [year, month, day] = String(value).split('-').map(Number);
  const d = new Date(year, month - 1, day + Number(days || 0));
  return localDateISO(d);
}

export const store = new Store();
