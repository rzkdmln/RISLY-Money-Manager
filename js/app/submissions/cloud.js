/**
 * RISLY — Cloud Submissions.
 * Domain: cloud
 */

import { APP } from '../../config.js';
import { Cloud } from '../../cloud.js';
import { store } from '../../store.js';
import { ui, toast, closeModal } from '../../ui.js';
import { renderApplication, renderAuth } from '../runtime.js';

export function parseCloudConfig(form) {
  const fd = new FormData(form);
  const provider = String(fd.get('provider') || 'local');
  if (provider === 'local') return { provider: 'local' };

  if (provider === 'jsonbin') {
    return {
      provider,
      jsonbin: {
        binId: String(fd.get('jsonbinBinId') || '').trim(),
        masterKey: String(fd.get('jsonbinMasterKey') || '').trim(),
        binName: 'RISLY Money Manager',
      },
    };
  }
  if (provider === 'supabase') {
    return {
      provider,
      supabase: {
        url: String(fd.get('supabaseUrl') || '').trim(),
        anonKey: String(fd.get('supabaseAnonKey') || '').trim(),
        table: String(fd.get('supabaseTable') || 'households').trim(),
        rowId: String(fd.get('supabaseRowId') || APP.householdId).trim(),
      },
    };
  }
  if (provider === 'firebase') {
    const raw = String(fd.get('firebaseConfigJson') || '').trim();
    if (!raw) throw new Error('Konfigurasi Firebase wajib diisi.');
    try {
      JSON.parse(raw);
    } catch {
      throw new Error('Konfigurasi Firebase bukan JSON yang valid.');
    }
    return {
      provider,
      firebase: {
        configJson: raw,
        path: String(fd.get('firebasePath') || `households/${APP.householdId}`).trim(),
      },
    };
  }
  throw new Error('Penyedia cloud tidak dikenal.');
}

export async function connectCloudFromForm(form) {
  const config = parseCloudConfig(form);
  const submit = form.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    const result = await Cloud.connect(config);
    if (!result.ok) throw result.error || new Error('Koneksi cloud gagal.');
    toast(config.provider === 'local' ? 'Sinkronisasi cloud dimatikan.' : 'Cloud terhubung dan data sudah digabungkan.', 'success');
    closeModal({ silent: true });
    if (store.currentUser) {
      ui.appMounted = false;
      renderApplication();
    } else {
      renderAuth();
    }
  } finally {
    if (submit) submit.disabled = false;
  }
}

export async function testCloudFromForm(form) {
  const config = parseCloudConfig(form);
  const button = form.querySelector('[data-action="cloud-test"]');
  if (button) button.disabled = true;
  try {
    const result = await Cloud.test(config);
    if (result.ok) {
      toast(result.exists ? 'Koneksi berhasil. Data cloud ditemukan.' : 'Koneksi berhasil. Bin/tabel masih kosong.', 'success');
    } else {
      toast(`Koneksi gagal: ${result.error}`, 'error');
    }
  } finally {
    if (button) button.disabled = false;
  }
}

export async function createJsonBinFromForm(form) {
  const config = parseCloudConfig(form);
  if (config.provider !== 'jsonbin') {
    toast('Pembuatan bin otomatis hanya tersedia untuk JSONBin.', 'info');
    return;
  }
  const button = form.querySelector('[data-action="create-jsonbin"]');
  if (button) button.disabled = true;
  try {
    const id = await Cloud.createJsonBin(config);
    const input = form.querySelector('[name="jsonbinBinId"]');
    if (input) input.value = id;
    toast('Bin JSONBin baru berhasil dibuat. Klik Simpan & hubungkan.', 'success');
  } catch (error) {
    toast(error.message || 'Gagal membuat bin.', 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

export const cloudSubmissions = {
  cloud: async (form) => {
    await connectCloudFromForm(form);
  },
  'auth-cloud': async (form) => {
    await connectCloudFromForm(form);
  },
};
