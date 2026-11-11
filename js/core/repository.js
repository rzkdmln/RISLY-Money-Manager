/**
 * RISLY Money Manager — IndexedDB Repository
 *
 * Penyimpanan terstruktur di IndexedDB dengan tiga object store:
 *  - workspaces  : data kerja per workspace (key: id)
 *  - receipts    : blob struk + metadata (key: id)
 *  - meta        : pasangan nilai kecil, termasuk penanda migrasi
 *
 * IndexedDB dipakai agar data besar (struk) tidak mencurahkan kuota
 * localStorage dan write bisa dilakukan per-koleksi, bukan seluruh dokumen.
 */

const DB_NAME = 'risly-mm';
const DB_VERSION = 2;

const STORE_WORKSPACES = 'workspaces';
const STORE_RECEIPTS = 'receipts';
const STORE_META = 'meta';

const MIGRATION_FLAG = 'risly.mm.migrated.v2';

export { STORE_WORKSPACES, STORE_RECEIPTS, STORE_META, MIGRATION_FLAG };

/* Konversi data URL (base64) -> Blob untuk migrasi struk lama. */
function dataURLToBlob(dataUrl) {
  const parts = String(dataUrl).split(',');
  if (parts.length < 2) return null;
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const bstr = atob(parts[1]);
  const n = bstr.length;
  const u8arr = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) u8arr[i] = bstr.charCodeAt(i);
  return new Blob([u8arr], { type: mime });
}

/* Konversi Blob -> data URL (base64) untuk backup/restore. */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Gagal membaca blob'));
    reader.readAsDataURL(blob);
  });
}

export { dataURLToBlob, blobToDataUrl };

class Repository {
  constructor() {
    this.db = null;
    this._openPromise = null;
  }

  /* ------------------------------------------------------------------------ */
  /*  Koneksi IndexedDB                                                       */
  /* ------------------------------------------------------------------------ */

  _open() {
    if (this._openPromise) return this._openPromise;
    this._openPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this);
      };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_WORKSPACES)) {
          db.createObjectStore(STORE_WORKSPACES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_RECEIPTS)) {
          db.createObjectStore(STORE_RECEIPTS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'id' });
        }
      };
    });
    return this._openPromise;
  }

  _tx(storeNames, mode = 'readonly') {
    return this._open().then(() => {
      const tx = this.db.transaction(storeNames, mode);
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(tx);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaksi IndexedDB dibatalkan'));
      }).then(() => tx);
    });
  }

  _store(storeName, mode = 'readonly') {
    return this._tx(storeName, mode).then((tx) => tx.objectStore(storeName));
  }

  /* ------------------------------------------------------------------------ */
  /*  Workspaces                                                              */
  /* ------------------------------------------------------------------------ */

  /**
   * Ambil data workspace dari IndexedDB.
   * @returns {Promise<{id: string, data: Object, updatedAt: string} | null>}
   */
  async getWorkspace(id) {
    const store = await this._store(STORE_WORKSPACES, 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Simpan data workspace ke IndexedDB.
   * @param {string} id
   * @param {Object} data
   */
  async putWorkspace(id, data) {
    const store = await this._store(STORE_WORKSPACES, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put({
        id,
        data,
        updatedAt: new Date().toISOString(),
      });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Hapus workspace dari IndexedDB.
   * @param {string} id
   */
  async deleteWorkspace(id) {
    const store = await this._store(STORE_WORKSPACES, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /* ------------------------------------------------------------------------ */
  /*  Receipts (lampiran struk)                                               */
  /* ------------------------------------------------------------------------ */

  /**
   * Ambil data struk dari IndexedDB.
   * @returns {Promise<{id: string, blob: Blob, mimeType: string, size: number, createdAt: string} | null>}
   */
  async getReceipt(id) {
    const store = await this._store(STORE_RECEIPTS, 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Simpan blob struk ke IndexedDB.
   * @param {string} id
   * @param {Blob} blob
   * @param {string} mimeType
   */
  async putReceipt(id, blob, mimeType) {
    const store = await this._store(STORE_RECEIPTS, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put({
        id,
        blob,
        mimeType: mimeType || blob.type || 'application/octet-stream',
        size: blob.size,
        createdAt: new Date().toISOString(),
      });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Hapus struk dari IndexedDB.
   * @param {string} id
   */
  async deleteReceipt(id) {
    const store = await this._store(STORE_RECEIPTS, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Ambil semua data struk untuk pembersihan yatim.
   * @returns {Promise<Array<{id: string, blob: Blob, mimeType: string, size: number, createdAt: string}>>}
   */
  async getAllReceipts() {
    const store = await this._store(STORE_RECEIPTS, 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  /* ------------------------------------------------------------------------ */
  /*  Meta                                                                    */
  /* ------------------------------------------------------------------------ */

  /**
   * Ambil nilai meta.
   * @returns {Promise<any | null>}
   */
  async getMeta(key) {
    const store = await this._store(STORE_META, 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Simpan nilai meta.
   * @param {string} key
   * @param {any} value
   */
  async setMeta(key, value) {
    const store = await this._store(STORE_META, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put({
        id: key,
        value,
        updatedAt: new Date().toISOString(),
      });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /* ------------------------------------------------------------------------ */
  /*  Migrasi dari localStorage                                               */
  /* ------------------------------------------------------------------------ */

  /**
   * Periksa apakah migrasi ke IndexedDB sudah dilakukan.
   * @returns {Promise<boolean>}
   */
  async isMigrated() {
    const flag = await this.getMeta(MIGRATION_FLAG);
    return Boolean(flag);
  }

  /**
   * Tandai bahwa migrasi sudah selesai.
   */
  async markMigrated() {
    await this.setMeta(MIGRATION_FLAG, true);
  }

  /**
   * Migrasi semua data dari localStorage ke IndexedDB.
   * - Baca registry dan setiap workspace dari localStorage
   * - Konversi struk base64 lama menjadi blob di object store receipts
   * - Ganti tx.receipt (base64) dengan tx.receiptId di data workspace
   * - Tulis workspace ke object store workspaces
   * - Tandai migrasi selesai
   * @returns {Promise<{workspaces: number, receipts: number}>}
   */
  async migrateFromLocalStorage() {
    if (await this.isMigrated()) {
      return { workspaces: 0, receipts: 0 };
    }

    // Baca registry dari localStorage (tetap di localStorage, kecil)
    let registryRaw;
    try {
      registryRaw = localStorage.getItem('risly.mm.workspaces.v1');
    } catch {
      registryRaw = null;
    }
    let registry = null;
    if (registryRaw) {
      try {
        registry = JSON.parse(registryRaw);
      } catch {
        registry = null;
      }
    }
    const workspaces = (registry && registry.workspaces) || {};
    const workspaceIds = Object.keys(workspaces);

    let receiptCount = 0;

    for (const workspaceId of workspaceIds) {
      try {
        const key = `risly.mm.workspace.v1.${workspaceId}`;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') continue;

        // Migrasi struk base64 di setiap transaksi -> blob di IDB
        const transactions = Array.isArray(data.transactions) ? data.transactions : [];
        for (const tx of transactions) {
          if (tx.receipt && typeof tx.receipt === 'string' && tx.receipt.startsWith('data:')) {
            const blob = dataURLToBlob(tx.receipt);
            if (blob) {
              const receiptId = `receipt_${workspaceId}_${tx.id}`;
              await this.putReceipt(receiptId, blob, blob.type);
              tx.receiptId = receiptId;
              receiptCount += 1;
            }
            delete tx.receipt;
          } else if (tx.receiptId) {
            // Sudah menggunakan receiptId, biarkan apa adanya
          }
        }

        await this.putWorkspace(workspaceId, data);
      } catch (error) {
        console.warn(`Gagal migrasi workspace ${workspaceId}:`, error);
      }
    }

    await this.markMigrated();
    return { workspaces: workspaceIds.length, receipts: receiptCount };
  }

  /* ------------------------------------------------------------------------ */
  /*  Utilitas                                                                */
  /* ------------------------------------------------------------------------ */

  async close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this._openPromise = null;
  }
}

export const repository = new Repository();
