# Rencana Refactor — RISLY Money Manager

> Tujuan: memecah monolith `app.js` (4.289 baris) dan `app.css` (2.203 baris)
> menjadi struktur modular yang mudah di-maintain, **tanpa mengubah perilaku**.

---

## 1. Ringkasan & tujuan

| Metrik | Sekarang | Target |
|---|---|---|
| `js/app.js` | 4.289 baris / ~151 KB | entry tipis `js/app/index.js` (±150–250 baris) |
| `css/app.css` | 2.203 baris / ~129 KB | 8 file per layer (±150–1.000 baris/file) |
| File backup/scratch di root | `app_backup.js`, `count-bt-settings.js`, `test-*.mjs` | dipindah ke `tools/` atau dihapus |
| Aksi (`handleAction`) | 1 `switch` ±1.385 baris | registry per domain |
| Submit form | 1 `switch` ±80 baris + 15 handler | registry per `data-form` |

**Prinsip utama:** refactor murni, perilaku tidak berubah. Setiap fase harus
bisa di-commit dan di-rollback sendiri.

---

## 2. Constraint & fakta teknis (wajib dipatuhi)

1. **Tanpa build step.** `netlify.toml` → `publish = "."`, semua file disajikan apa adanya.
   Jangan menambah bundler (Vite/Webpack) hanya untuk refactor.
2. **Entry tunggal.** `index.html` memuat `<script type="module" src="./js/app.js">`
   dan `<link rel="stylesheet" href="./css/app.css">`.
3. **Service worker precache manual.** `sw.js` punya array `APP_SHELL` berisi
   **setiap** file JS/CSS. File baru wajib ditambahkan, jika tidak app bisa gagal
   saat offline pertama kali.
4. **Versi cache manual.** `const VERSION = 'risly-1.2.45';` — bump setiap rilis.
5. **Tailwind via CDN** (`cdn.tailwindcss.com/3.4.16`) + override token di akhir
   `app.css`. Urutan CSS penting: token → base → komponen → halaman → responsive → override.
6. **ES modules native.** Import harus eksplisit (tanpa barrel re-export besar)
   untuk menghindari siklus.
7. **PWA.** Jangan memecah SW logic; hanya update daftar precache + versi.

---

## 3. Prinsip & aturan dependensi

Arah dependensi **satu arah**:

```
js/app/  ──►  js/views/ · js/forms/ · js/ui/  ──►  js/services/  ──►  js/core/
```

Aturan:

- `core/` **tidak boleh** import DOM/UI/views/forms/app.
- `views/` & `forms/` **tidak boleh** import `app/`.
- `services/` **tidak boleh** import `views/` atau `forms/`.
- `app/` boleh import semuanya (composition root).
- Semua modul memakai **named export** (bukan default), konsisten dengan kode saat ini.
- Satu modul = satu concern. Nama file multi-kata pakai **kebab-case**
  (`payment-split.js`, `note-editor.js`).

Catatan transisi: sampai Fase 7, folder lama (`store.js`, `cloud.js`, dst.) tetap
di lokasi sekarang supaya churn import minimal. Reorganisasi folder dilakukan
belakangan secara mekanis (Fase 7, opsional).

---

## 4. Target struktur direktori

```
RISLY Money Manager/
├── index.html                  # src -> ./js/app/index.js (Fase 5)
├── sw.js                       # APP_SHELL + VERSION diperbarui tiap fase
├── netlify.toml
├── manifest.json
├── _headers
├── oauth-callback.html
├── privacy.html
├── jsconfig.json               # BARU (Fase 0)
├── .editorconfig               # BARU (Fase 0)
│
├── css/
│   ├── tokens.css
│   ├── base.css
│   ├── layout.css
│   ├── components.css
│   ├── pages.css
│   ├── modals.css
│   ├── responsive.css
│   └── overrides.css
│
├── js/
│   ├── app.js                  # FACADE sementara (Fase 1–4), dihapus di Fase 5
│   ├── app/
│   │   ├── index.js            # entry final
│   │   ├── boot.js             # bindStore, tryResumeRedirectLogin, boot
│   │   ├── hooks.js            # putus siklus app <-> services/backup
│   │   ├── router.js           # routeFromHash, navigate, ROUTE_VIEWS
│   │   ├── runtime.js          # renderApplication, renderAuth, scheduleRender, mountShell, splash
│   │   ├── session.js          # enter/lock/leave, auto-lock, recurring, reminders
│   │   ├── auth-flow.js        # google popup/redirect flows
│   │   ├── modals.js           # semua open* modal
│   │   ├── calculator.js       # updateCalculator, formatCalculatorInput, maskDateInput, keypad
│   │   ├── payment-split.js    # syncPaymentSplit, create/add/refresh row
│   │   ├── note-editor.js      # collect/autosave/flush note
│   │   ├── form-utils.js       # showFormError, clearFormError, formValue, stringValue
│   │   ├── color-field.js      # sameColor, apply/refresh/setColorFieldBase
│   │   ├── focus.js            # rememberFocus, restoreFocus
│   │   ├── workspace.js        # openJoinWorkspaceModal, submitJoinWorkspace
│   │   ├── cloud-config.js     # parseCloudConfig
│   │   ├── cloud-actions.js    # connect/test/createJsonBin
│   │   ├── actions/
│   │   │   ├── index.js        # registry + handleAction
│   │   │   ├── ui.js           # Custom UI Actions
│   │   │   ├── auth.js
│   │   │   ├── navigation.js
│   │   │   ├── transactions.js
│   │   │   ├── recurring.js
│   │   │   ├── accounts.js
│   │   │   ├── categories.js
│   │   │   ├── budgets.js
│   │   │   ├── calendar.js
│   │   │   ├── filters.js
│   │   │   ├── notes.js
│   │   │   ├── note-editor-actions.js
│   │   │   ├── colors.js
│   │   │   ├── exports.js
│   │   │   └── cloud.js
│   │   ├── submissions/
│   │   │   ├── index.js        # registry + submitForm
│   │   │   ├── auth.js
│   │   │   ├── transaction.js
│   │   │   ├── recurring.js
│   │   │   ├── goal.js
│   │   │   ├── account.js
│   │   │   ├── category.js
│   │   │   ├── profile.js
│   │   │   ├── note.js
│   │   │   ├── budget.js
│   │   │   ├── household.js
│   │   │   └── settings.js     # auto-lock, week-start, join-workspace
│   │   ├── events.js           # bindEvents, debounceSearch, noteActivity
│   │   └── pwa.js              # notifications, update, SW, install prompt
│   │
│   ├── core/                   # (Fase 7, opsional) config, data, store, utils, auth
│   ├── services/               # (Fase 7, opsional) cloud, gdrive, google-auth-relay,
│   │                           #   backup, import, export, charts
│   ├── ui/                     # (Fase 7, opsional) ui, icons, colors, pull-to-refresh
│   ├── views/                  # tetap
│   └── forms/                  # tetap
│
└── tools/                      # BARU (Fase 0)
    ├── app_backup.js           # arsip, bukan bagian aplikasi
    ├── count-bt-settings.js
    └── test-*.mjs
```

---

## 5. Peta pemecahan `js/app.js` (4.289 baris)

| Baris | Section sekarang | Modul target |
|---|---|---|
| 1–159 | Imports | didistribusikan |
| 160–186 | Runtime state | `runtime.js` / `router.js` |
| 187–405 | Small helpers | `router.js`, `runtime.js`, `form-utils.js`, `color-field.js`, `focus.js` |
| 407–625 | Session & recurring automation | `session.js` + `auth-flow.js` |
| 626–1011 | Modals | `modals.js` |
| 1012–1113 | Calculator | `calculator.js` |
| 1114–1220 | Split payment helpers | `payment-split.js` |
| 1221–1322 | Note editor helpers | `note-editor.js` |
| 1323–1371 | Cloud config | `cloud-config.js` |
| 1372–1427 | Workspace sharing | `workspace.js` |
| 1428–1488 | Cloud actions | `cloud-actions.js` |
| 1489–2873 | Actions (`handleAction`) | `actions/*` |
| 2874–3492 | Form submissions | `submissions/*` |
| 3493–3609 | Notifications & PWA | `pwa.js` |
| 3610–4036 | Event wiring | `events.js` |
| 4037–4288 | Boot | `boot.js` |

### 5.1 Detail helper yang perlu dipisah dari blok 187–405

| Fungsi | Target |
|---|---|
| `routeFromHash`, `navigate`, `ROUTE_VIEWS` | `router.js` |
| `renderApplication`, `renderAuth`, `scheduleRender`, `mountShell`, `renderRouteWithFocus`, `setSplashStatus`, `hideSplash` | `runtime.js` |
| `showFormError`, `clearFormError`, `formValue`, `stringValue` | `form-utils.js` |
| `sameColor`, `applyColorFieldValue`, `refreshColorField`, `setColorFieldBase` | `color-field.js` |
| `rememberFocus`, `restoreFocus` | `focus.js` |

> Catatan: `suppressRender` (baris 171) hanya dibaca (baris 320) dan **tidak pernah
> di-set `true`** → dead flag. Aman dihapus di Fase 0/1 (atau dipertahankan dengan komentar).

---

## 6. Peta `handleAction` → `actions/*`

| Baris | Sub-section | File |
|---|---|---|
| 1522–1550 | Custom UI Actions | `actions/ui.js` |
| 1551–1598 | Auth | `actions/auth.js` |
| 1599–1819 | Navigation & sheets | `actions/navigation.js` |
| 1820–1929 | Transactions | `actions/transactions.js` |
| 1930–1988 | Recurring | `actions/recurring.js` |
| 1989–2074 | Accounts | `actions/accounts.js` |
| 2075–2181 | Categories | `actions/categories.js` |
| 2182–2223 | Budgets | `actions/budgets.js` |
| 2224–2244 | Calendar | `actions/calendar.js` |
| 2245–2306 | Transactions filters | `actions/filters.js` |
| 2307–2404 | Notes | `actions/notes.js` |
| 2405–2475 | Note editor | `actions/note-editor-actions.js` |
| 2476–2515 | Colors | `actions/colors.js` |
| 2516–2658 | Exports & data | `actions/exports.js` |
| 2659–2873 | Cloud | `actions/cloud.js` |

Pola registry:

```js
// app/actions/index.js
import { uiActions } from './ui.js';
import { authActions } from './auth.js';
// ... dst.

const ACTIONS = {
  ...uiActions, ...authActions, ...navigationActions,
  ...transactionActions, ...recurringActions, ...accountActions,
  ...categoryActions, ...budgetActions, ...calendarActions,
  ...filterActions, ...noteActions, ...noteEditorActions,
  ...colorActions, ...exportActions, ...cloudActions,
};

export async function handleAction(action, element) {
  const handler = ACTIONS[action];
  if (!handler) return undefined;
  return handler(element);
}
```

Setiap file mengekspor object `{ 'nama-action': (element) => { ... } }`.

---

## 7. Peta `submitForm` → `submissions/*` (baris 2874–3492)

| Baris | Handler | File |
|---|---|---|
| 2878 | `submitLogin` | `submissions/auth.js` |
| 2923 | `submitTransaction` | `submissions/transaction.js` |
| 3091 | `submitRecurring` | `submissions/recurring.js` |
| 3157 | `submitGoal` | `submissions/goal.js` |
| 3178 | `submitAccount` | `submissions/account.js` |
| 3228 | `submitCategory` | `submissions/category.js` |
| 3250 | `submitSubcategory` | `submissions/category.js` |
| 3267 | `submitChangePin` | `submissions/auth.js` / `profile.js` |
| 3295 | `submitProfile` | `submissions/profile.js` |
| 3319 | `submitNote` | `submissions/note.js` |
| 3340 | `submitBudgetTotal` | `submissions/budget.js` |
| 3347 | `syncBudgetAllocHint` | `submissions/budget.js` |
| 3357 | `submitBudgetCategories` | `submissions/budget.js` |
| 3379 | `submitBudgetThresholds` | `submissions/budget.js` |
| 3392 | `submitHousehold` | `submissions/household.js` |
| 3412 | `submitForm` (dispatcher) | `submissions/index.js` |

Pemetaan `data-form` → handler (dari `submitForm` saat ini):

```js
const SUBMISSIONS = {
  login: submitLogin,
  'auto-lock': submitAutoLock,
  'week-start': submitWeekStart,
  'join-workspace': submitJoinWorkspace,
  transaction: submitTransaction,
  recurring: submitRecurring,
  account: submitAccount,
  goal: submitGoal,
  category: submitCategory,
  subcategory: submitSubcategory,
  'change-pin': submitChangePin,
  profile: submitProfile,
  note: submitNote,
  'budget-total': submitBudgetTotal,
  'budget-categories': submitBudgetCategories,
  'budget-thresholds': submitBudgetThresholds,
  'import-transactions': submitImportTransactions,
  'settings-household': submitHousehold,
  cloud: connectCloudFromForm,
  'auth-cloud': connectCloudFromForm,
};
```

---

## 8. Peta `css/app.css` (2.203 baris)

| Baris | Section | File target |
|---|---|---|
| 1–68 | Header + tokens (`:root`, `.dark`) | `tokens.css` |
| 69–120 | Reset, `html/body`, scrollbar, utilities | `base.css` |
| 121–162 | Splash | `layout.css` |
| 163–196 | Brand & avatars | `layout.css` |
| 197–376 | App shell (sidebar, topbar, fab, bottom nav) | `layout.css` |
| 377–426 | Page primitives | `layout.css` |
| 427–486 | Buttons | `components.css` |
| 487–564 | Forms | `components.css` |
| 565–579 | Switch | `components.css` |
| 580–622 | Badges & pills | `components.css` |
| 623–640 | Progress | `components.css` |
| 641–648 | Loading | `components.css` |
| 649–662 | Empty states | `components.css` |
| 663–669 | Amounts | `components.css` |
| 670–795 | Auth | `pages.css` |
| 796–891 | Dashboard | `pages.css` |
| 892–920 | Transaction rows | `components.css` |
| 921–1139 | Tag input chips (form) | `components.css` |
| 1140–1154 | Stat cards | `components.css` |
| 1155–1182 | Transactions page | `pages.css` |
| 1183–1220 | Calendar | `pages.css` |
| 1221–1320 | Notes | `pages.css` |
| 1321–1354 | Note editor | `pages.css` |
| 1355–1451 | Accounts | `pages.css` |
| 1452–1482 | Budgets | `pages.css` |
| 1483–1505 | Recurring | `pages.css` |
| 1506–1577 | Categories | `pages.css` |
| 1578–1619 | Reports | `pages.css` |
| 1620–1671 | Settings | `pages.css` |
| 1672–1826 | Modals + modal form internals | `modals.css` |
| 1827–1852 | Toasts | `components.css` |
| 1853–2078 | Responsive | `responsive.css` |
| 2079–2091 | Print | `responsive.css` |
| 2092–2125 | iOS auto-zoom / gesture / selection / shell lock | `responsive.css` |
| 2126–2183 | Pull to refresh | `layout.css` |
| 2184–2203 | Design token overrides (Tailwind) | `overrides.css` |

**Urutan `<link>` wajib:** `tokens → base → layout → components → pages → modals → responsive → overrides`.

Catatan:
- `pages.css` awalnya besar (±1.000 baris). Ini masih jauh lebih sehat daripada
  satu file 2.203 baris; pemecahan per-screen bisa dilakukan nanti jika perlu.
- Jangan ubah isi selector saat memindah; hanya pindah blok + pastikan tidak ada
  duplikasi. Verifikasi visual dengan membandingkan screenshot before/after.

---

## 9. Fase implementasi

> Aturan global tiap fase:
> 1. Refactor murni — tidak menambah/mengubah fitur.
> 2. Update `sw.js` (`APP_SHELL`) untuk setiap file baru + bump `VERSION`.
> 3. Jalankan smoke test (bagian 10).
> 4. Commit terpisah agar bisa `git revert`.

### Fase 0 — Hygiene & fondasi
**Tujuan:** membersihkan root dan menyiapkan tooling dev tanpa build.

Langkah:
1. Buat folder `tools/`.
2. Pindahkan (bukan hapus dulu, agar aman):
   - `js/app_backup.js` → `tools/app_backup.js`
   - `count-bt-settings.js` → `tools/count-bt-settings.js`
   - `test-import.mjs`, `test-tpl.mjs` → `tools/`
3. Pastikan tidak ada import yang mengarah ke file-file tersebut
   (`grep -r "app_backup" js/` → harus kosong).
4. Tambah `jsconfig.json`:
   ```json
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "ESNext",
       "moduleResolution": "Bundler",
       "checkJs": true,
       "noEmit": true
     },
     "exclude": ["tools/**", "node_modules/**"]
   }
   ```
   `checkJs` boleh dimulai `false` lalu dinaikkan bertahap.
5. Tambah `.editorconfig` minimal (LF/CRLF mengikuti repo, indent 2, charset utf-8).
6. Hapus/dead-code `suppressRender` (atau beri komentar jelas).
7. Catat baseline: jalankan `npx madge --circular js/` (dev-only) untuk mendata
   siklus import yang sudah ada sebelum refactor.

**DoD:** app tetap boot normal, tidak ada file scratch di root, `sw.js` tidak
lagi memuat `app_backup.js` (cek: memang tidak pernah ada di APP_SHELL).

### Fase 1 — Ekstrak leaf module (risiko rendah)
**Tujuan:** memindahkan modul yang dependensinya sedikit tanpa mengubah alur.

Urutan yang direkomendasikan:
1. `app/calculator.js` ← baris 1012–1113.
   - Import: `utils` (`expressionResult`, `formatAmountExpression`, `formatCurrency`),
     `ui` (`toast`, `ui`), `app/payment-split.js` (`syncPaymentSplit`).
2. `app/payment-split.js` ← baris 1114–1220.
   - Import: `forms/transaction.js` (`paymentRowHtml`, `paymentRowHint`), `utils`.
3. `app/note-editor.js` ← baris 1221–1322.
   - Pindahkan `let noteSaveTimer` ke dalam modul.
   - Import: `store`, `ui` (`openModal`), `utils` (`sanitizeNoteHTML`,
     `parseDateTimeLocal`), `forms/note.js` (`noteEditorForm`).
4. `app/modals.js` ← baris 626–1011.
   - Import: `store`, `ui`, `icons`, `utils`, `config`, `views/shell`,
     `views/budgets`, `forms/*`, `cloud.js`, `app/runtime.js`
     (untuk `renderApplication` di dalam budget amount lightbox).
   - Pastikan `runtime.js` **tidak** meng-import `modals.js` (hindari siklus).

**Perubahan di `app.js`:** ganti definisi dengan import dari modul baru.
`app.js` tetap menjadi entry sampai Fase 5.

**DoD:** Calculator, split payment, note autosave, dan semua modal berfungsi sama.

### Fase 2 — `hooks.js`, `runtime`, `router`, `session`, `auth-flow`
**Tujuan:** memecah inti render/navigasi dan memutus siklus `app ↔ backup`.

Langkah:
1. Buat `app/hooks.js`:
   ```js
   export const appHooks = {
     enterApplication() {},
     renderApplication() {},
     renderAuth() {},
     signInWithGoogleFlow: async () => null,
   };
   ```
2. Pindahkan ke `app/runtime.js`: `renderApplication`, `renderAuth`,
   `scheduleRender`, `mountShell`, `renderRouteWithFocus`, `setSplashStatus`,
   `hideSplash`, state `renderTimer`.
3. Pindahkan ke `app/router.js`: `routeFromHash`, `navigate`, `ROUTE_VIEWS`
   (import `runtime.renderApplication`).
4. Pindahkan ke `app/session.js`: `enterApplication`, `lockApplication`,
   `leaveApplication`, `checkAutoLock`, `runRecurring`, `checkReminders`,
   `syncCloudAfterLogin`.
5. Pindahkan ke `app/auth-flow.js`: `showGoogleWaitingModal`,
   `canFallbackToRedirect`, `startGoogleRedirectFlow`, `signInWithGoogleFlow`.
6. Pindahkan helper kecil:
   `form-utils.js`, `color-field.js`, `focus.js`.
7. `app.js` meng-assign hooks:
   ```js
   Object.assign(appHooks, {
     enterApplication, renderApplication, renderAuth, signInWithGoogleFlow,
   });
   ```
8. Ubah `js/backup.js`: hapus import dari `./app.js`, ganti menjadi
   `import { appHooks } from './app/hooks.js'` dan panggil `appHooks.*`.

**DoD:** login Google (popup & redirect), auto-lock, recurring, reminders,
backup/restore, dan reset aplikasi berfungsi. `npx madge --circular js/` tidak
menunjukkan siklus app↔backup.

### Fase 3 — Registry `actions/*`
**Tujuan:** membubarkan `switch` 1.385 baris.

Langkah:
1. Buat `app/actions/index.js` (dispatcher + komposisi).
2. Salin blok per sub-section (tabel bagian 6) ke file masing-masing dan ubah
   `case 'x': { ... break; }` menjadi `'x': (element) => { ... }`.
3. Perhatikan dependensi antar-aksi: jika satu handler memanggil handler lain
   (mis. action memanggil `openTransactionModal`), import modul yang sesuai,
   jangan menyalin fungsi.
4. `events.js`/`app.js` memanggil `handleAction` dari `actions/index.js`.
5. Hapus `switch` lama setelah semua case pindah (cek: jumlah case lama ==
   jumlah key baru; bisa diverifikasi dengan grep `case '`).

**DoD:** seluruh tombol `data-action` di semua halaman berfungsi. Uji minimal
satu aksi per domain.

### Fase 4 — Registry `submissions/*`
**Tujuan:** mengganti `submitForm` switch dengan registry.

Langkah:
1. Buat `app/submissions/index.js` dengan mapping `data-form` → handler.
2. Pindahkan `submit*` dan `syncBudgetAllocHint` sesuai tabel bagian 7.
3. Untuk `auto-lock`, `week-start`, `join-workspace`, `import-transactions`,
   `cloud`, `auth-cloud`: buat fungsi kecil di file yang sesuai (settings,
   workspace, cloud, import).
4. Handler yang memanggil `renderApplication` import dari `app/runtime.js`;
   yang memanggil modal import dari `app/modals.js`.

**DoD:** semua form (transaksi, akun, kategori, budget, catatan, recurring,
goal, profil, PIN, household, import, cloud) berhasil submit dengan validasi
dan toast yang sama.

### Fase 5 — Entry final + `events.js`, `pwa.js`, `boot.js`
**Tujuan:** `app.js` menjadi entry tipis.

Langkah:
1. Pindahkan `bindEvents`, `debounceSearch`, `noteActivity` → `app/events.js`
   (baris 3610–4036).
2. Pindahkan `requestNotifications`, `checkForUpdate`, `registerServiceWorker`,
   `setupInstallPrompt` → `app/pwa.js` (baris 3493–3609).
3. Pindahkan `bindStore`, `tryResumeRedirectLogin`, `boot` → `app/boot.js`
   (baris 4037–4288).
4. Buat `app/index.js`:
   ```js
   import { boot } from './boot.js';
   if (document.readyState === 'loading') {
     document.addEventListener('DOMContentLoaded', boot, { once: true });
   } else {
     boot();
   }
   export { renderApplication, renderAuth } from './runtime.js';
   export { enterApplication } from './session.js';
   export { signInWithGoogleFlow } from './auth-flow.js';
   ```
5. Ubah `index.html`: `src="./js/app.js"` → `./js/app/index.js`.
6. Hapus `js/app.js` (facade) setelah semua import tidak lagi mengarah ke sana
   (`grep -r "from './app.js'" js/` → kosong, `grep -r "js/app.js" .` → hanya
   di dokumentasi/snapshot lama).
7. Update `sw.js`: hapus `./js/app.js`, tambahkan semua `./js/app/*.js`.

**DoD:** aplikasi boot dari `app/index.js`; tidak ada referensi ke `js/app.js`;
offline reload tetap berhasil.

### Fase 6 — Split CSS
**Langkah:**
1. Buat 8 file CSS sesuai peta bagian 8.
2. Pindahkan blok **apa adanya** (copy → verifikasi → hapus dari asal).
3. `index.html`: ganti satu `<link>` menjadi 8 `<link>` dengan urutan wajib.
4. `sw.js`: ganti `./css/app.css` dengan 8 path baru.
5. Bandingkan tampilan before/after di light & dark mode, mobile & desktop.

**DoD:** tidak ada perbedaan visual; tidak ada selector yatim; urutan cascade
benar (cek override Tailwind tetap menang).

### Fase 7 — (Opsional) Reorganisasi folder core/services/ui
**Tujuan:** menerapkan target struktur penuh.

Langkah:
1. `git mv` file ke `core/`, `services/`, `ui/`.
2. Perbarui semua import (gunakan `npx jscodeshift`? tidak wajib; bisa grep-replace
   terarah per file).
3. Update `sw.js` daftar path.
4. Jalankan `npx madge --circular js/` untuk memastikan tetap bersih.

**DoD:** struktur akhir sesuai bagian 4, tidak ada import rusak, app berjalan.

---

## 10. Verifikasi & smoke test

### Otomatis (dev-only, tidak masuk produksi)
```bash
npx madge --circular js/          # deteksi siklus import
npx eslint js/ --no-eslintrc --env browser,es2022 --parser-options ecmaVersion:2022,sourceType:module
```
> ESLint opsional; tidak menambah dependency ke aplikasi.

### Manual wajib (setiap fase)
Jalankan `start.cmd` → `http://127.0.0.1:8080`.

- [ ] Boot tanpa error di console (tidak ada "Failed to resolve module specifier").
- [ ] Login: Google popup, redirect, PIN, auto-lock.
- [ ] Navigasi semua route: dashboard, transactions, calendar, notes, accounts,
      budgets, recurring, categories, goals, reports, settings.
- [ ] Transaksi: tambah/edit/hapus, kalkulator, split payment, upload struk.
- [ ] Catatan: buat note & todo, autosave, reminder.
- [ ] Budget: kategori, ubah batas (lightbox), threshold.
- [ ] Export: Excel, PDF, JSON backup; import transaksi.
- [ ] Cloud: connect, test, sync, restore.
- [ ] Offline: DevTools → Network → Offline → reload → app shell tampil.
- [ ] Dark mode & mobile viewport (tidak ada overflow/regresi layout).
- [ ] PWA: install prompt, notifikasi (jika diuji).

---

## 11. Risiko & rollback

| Risiko | Mitigasi |
|---|---|
| Siklus import baru | `hooks.js` + aturan dependensi + `madge --circular` tiap fase |
| Modul lupa di `sw.js` | Checklist APP_SHELL per fase; bump `VERSION` |
| Regresi UI saat split CSS | Pindah blok apa adanya; screenshot before/after; uji urutan cascade |
| Handler action saling bergantung | Import modul asal, jangan duplikasi; uji per domain |
| File backup/scratch ikut ter-deploy | Fase 0 pindah ke `tools/`; verifikasi `sw.js` & root |
| Refactor tercampur fitur | Satu fase = satu commit, tanpa perubahan perilaku |

**Rollback:** setiap fase adalah commit terpisah → `git revert <hash>`.

---

## 12. Out of scope

- Tidak menambah bundler/build step.
- Tidak memecah `store.js` (2.104 baris) di fase awal — dilakukan terpisah
  setelah `app/` stabil (target: `core/store/` dengan index, mutations,
  selectors, migrations, recurring).
- Tidak mengubah desain, copy, atau perilaku bisnis.
- Tidak mengubah konfigurasi Firebase/Google/Netlify.

---

## 13. Definition of Done (global)

1. `js/app/index.js` ≤ 250 baris; `js/app.js` sudah tidak ada.
2. `css/app.css` tidak lagi berisi seluruh style; 8 file layer aktif & terdaftar.
3. `handleAction` & `submitForm` memakai registry.
4. `npx madge --circular js/` bersih (atau hanya siklus yang memang disengaja & terdokumentasi).
5. `sw.js` memuat semua file, `VERSION` sudah di-bump.
6. Smoke test bagian 10 lulus; tidak ada regresi visual.
7. Root repo bersih dari file backup/scratch.
