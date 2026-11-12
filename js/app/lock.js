/**
 * RISLY — Lock screen helpers.
 *
 * Saat workspace terenkripsi belum didekripsi, data pengguna belum tersedia.
 * Modul ini menyusun snapshot pengguna dari beberapa sumber (snapshot
 * localStorage, metadata PIN di IndexedDB, registry akun) agar layar kunci
 * tetap bisa ditampilkan meskipun userId di sesi/registry sudah tidak cocok.
 */

import { readLockSnapshot, loadPinMetadata, listPinMetadata } from '../core/auth.js';
import { store } from '../core/store.js';
import { ui } from '../ui/ui.js';
import { renderAuth } from './runtime.js';

/**
 * @param {{userId?: string|null, workspaceId?: string|null, name?: string}} options
 * @returns {Promise<Object|null>} snapshot pengguna untuk layar kunci
 */
export async function resolveLockUser({ userId = null, workspaceId = null, name = '' } = {}) {
  const saved = readLockSnapshot();
  const ids = new Set();
  if (userId) ids.add(String(userId));
  if (saved?.id) ids.add(String(saved.id));
  if (workspaceId) {
    for (const entry of Object.values(store.registry?.accounts || {})) {
      if (entry?.workspaceId === workspaceId && entry.userId) {
        ids.add(String(entry.userId));
      }
    }
  }

  // 1) Metadata PIN yang cocok dengan userId yang kita kenal.
  for (const id of ids) {
    const meta = await loadPinMetadata(id).catch(() => null);
    if (meta?.pinVerifier && meta.pinSalt) {
      return {
        id,
        name: name || saved?.name || 'Pengguna',
        pinSalt: meta.pinSalt,
        pinIterations: Number(meta.pinIterations) || 0,
        pinVerifier: meta.pinVerifier,
        pinHash: saved?.pinHash || '',
        workspaceId: workspaceId || saved?.workspaceId || null,
        updatedAt: meta.updatedAt || '',
      };
    }
  }

  // 2) Fallback: metadata PIN apa pun yang tersimpan (userId di registry bisa
  //    saja sudah berubah karena bug/pemulihan sesi).
  const all = await listPinMetadata();
  if (all.length) {
    const chosen = all
      .slice()
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
    return {
      id: chosen.userId,
      name: name || saved?.name || 'Pengguna',
      pinSalt: chosen.pinSalt,
      pinIterations: Number(chosen.pinIterations) || 0,
      pinVerifier: chosen.pinVerifier,
      pinHash: saved?.pinHash || '',
      workspaceId: workspaceId || saved?.workspaceId || null,
      updatedAt: chosen.updatedAt || '',
    };
  }

  // 3) Snapshot lama (mis. hanya punya pinHash).
  if (saved && (!workspaceId || !saved.workspaceId || saved.workspaceId === workspaceId)) {
    return saved;
  }
  return null;
}

/**
 * Tampilkan layar kunci untuk workspace terenkripsi tanpa membuat workspace baru.
 * @returns {Promise<Object|null>} snapshot yang ditampilkan
 */
export async function showLockedWorkspace(workspaceId, { userId = null, name = '' } = {}) {
  const snapshot = await resolveLockUser({ userId, workspaceId, name });
  store.setLockedWorkspace(workspaceId);
  store.setCurrentUser(snapshot?.id || null);
  ui.currentUser = snapshot;
  ui.selectedUser = snapshot?.id || null;
  ui.locked = Boolean(snapshot);
  ui.appMounted = false;
  renderAuth();
  return snapshot;
}
