/**
 * RISLY Money Manager — shared cloud provider form fields.
 *
 * Used by both the pre-login "hubungkan cloud" modal and the settings page so
 * every provider renders exactly the same inputs.
 */

import { APP, CLOUD_PROVIDERS } from '../core/config.js';
import { icon } from '../ui/icons.js';
import { escapeAttr, escapeHTML } from '../core/utils.js';

export function cloudProviderFields(config = {}, options = {}) {
  const {
    includeLocal = false,
    withCreateBin = false,
    withSecurityNote = false,
    selectId = '',
    helpId = '',
    textareaRows = 5,
  } = options;

  const provider = config.provider && (includeLocal || config.provider !== 'local')
    ? config.provider
    : includeLocal ? 'local' : 'jsonbin';
  const jsonbin = config.jsonbin || {};
  const supabase = config.supabase || {};
  const firebase = config.firebase || {};
  const providerEntries = Object.entries(CLOUD_PROVIDERS)
    .filter(([id]) => includeLocal || id !== 'local');

  return `<div class="cloud-provider-select">
    <label class="field-label">Penyedia sinkronisasi
      <select class="field mt-1.5" ${selectId ? `id="${escapeAttr(selectId)}" ` : ''}name="provider" data-action="cloud-provider-change">
        ${providerEntries.map(([id, item]) => `<option value="${id}" ${provider === id ? 'selected' : ''}>${escapeHTML(item.label)}</option>`).join('')}
      </select>
    </label>
    <p class="text-[11px] leading-5 text-slate-500 dark:text-slate-400" ${helpId ? `id="${escapeAttr(helpId)}" ` : ''}data-cloud-help>${escapeHTML(CLOUD_PROVIDERS[provider]?.description || '')}</p>
  </div>

  <div class="cloud-fields" data-provider-section="jsonbin" ${provider === 'jsonbin' ? '' : 'hidden'}>
    <label class="field-label">Bin ID
      <input class="field mt-1.5" name="jsonbinBinId" value="${escapeAttr(jsonbin.binId || '')}" placeholder="65f…">
    </label>
    <label class="field-label">Master Key
      <input class="field mt-1.5" name="jsonbinMasterKey" type="password" value="${escapeAttr(jsonbin.masterKey || '')}" placeholder="$2a$10$…" autocomplete="off">
    </label>
    ${withCreateBin ? `<div class="flex flex-wrap gap-2">
      <button type="button" class="btn btn-secondary btn-sm" data-action="create-jsonbin">${icon('database', 'w-3.5 h-3.5')} Buat bin baru</button>
      <span class="text-[11px] text-slate-400 self-center">Master key hanya disimpan di perangkat ini.</span>
    </div>` : ''}
  </div>

  <div class="cloud-fields" data-provider-section="supabase" ${provider === 'supabase' ? '' : 'hidden'}>
    <label class="field-label">Project URL
      <input class="field mt-1.5" name="supabaseUrl" value="${escapeAttr(supabase.url || '')}" placeholder="https://xxxx.supabase.co">
    </label>
    <label class="field-label">Anon key
      <input class="field mt-1.5" name="supabaseAnonKey" type="password" value="${escapeAttr(supabase.anonKey || '')}" placeholder="eyJhbGciOi…" autocomplete="off">
    </label>
    <div class="grid grid-cols-2 gap-3">
      <label class="field-label">Tabel
        <input class="field mt-1.5" name="supabaseTable" value="${escapeAttr(supabase.table || 'households')}" placeholder="households">
      </label>
      <label class="field-label">Row ID
        <input class="field mt-1.5" name="supabaseRowId" value="${escapeAttr(supabase.rowId || APP.householdId)}" placeholder="${escapeAttr(APP.householdId)}">
      </label>
    </div>
  </div>

  <div class="cloud-fields" data-provider-section="firebase" ${provider === 'firebase' ? '' : 'hidden'}>
    <label class="field-label">Konfigurasi Firebase (JSON)
      <textarea class="field textarea mt-1.5 font-mono text-[11px]" name="firebaseConfigJson" rows="${Number(textareaRows) || 5}" placeholder='{"apiKey":"…","authDomain":"…","databaseURL":"https://….firebaseio.com","projectId":"…","appId":"…"}'>${escapeHTML(typeof firebase.configJson === 'string' ? firebase.configJson : JSON.stringify(firebase.configJson || {}, null, 2))}</textarea>
    </label>
    <label class="field-label">Path database
      <input class="field mt-1.5" name="firebasePath" value="${escapeAttr(firebase.path || `households/${APP.householdId}`)}" placeholder="households/risly-family">
    </label>
    <p class="text-[11px] leading-5 text-slate-500 dark:text-slate-400">Firebase RTDB memakai listener real-time. Lindungi database dengan rules yang membatasi akses.</p>
  </div>

  ${withSecurityNote ? `<div class="cloud-security-note">
    ${icon('shield', 'w-4 h-4')}
    <p>PIN aplikasi bukan enkripsi. Kunci API dan data cloud dapat dibaca dari perangkat yang terbuka. Gunakan kunci rahasia, kode perangkat, dan aturan backend yang ketat.</p>
  </div>` : ''}`;
}
