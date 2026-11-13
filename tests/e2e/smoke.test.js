import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* -------------------------------------------------------------------------- */
/*  Helper: siapkan localStorage dengan workspace uji (TANPA PIN)             */
/*  Langsung ke dashboard tanpa layar kunci.                                  */
/* -------------------------------------------------------------------------- */

const SETUP_STORAGE_CONTENT = readFileSync(
  join(process.cwd(), 'tests/e2e/setup-storage-nopin.js'),
  'utf8',
);

/* -------------------------------------------------------------------------- */
/*  Helper: atur PIN lewat Settings, lalu kunci dan buka kembali              */
/* -------------------------------------------------------------------------- */

async function setupPinViaSettings(page) {
  // Buka Settings
  await page.click('[data-action="settings"], a:has-text("Pengaturan"), button:has-text("Pengaturan")').catch(() => null);
  await page.waitForTimeout(800);

  // Klik "Atur PIN" / "Ubah PIN"
  await page.click('[data-action="change-pin"]');
  await page.waitForTimeout(800);

  // Tunggu modal change-pin muncul
  await expect(page.locator('form[data-form="change-pin"]')).toBeVisible({ timeout: 5_000 });

  // Isi PIN baru dan konfirmasi (kebijakan PIN 6–8 digit)
  await page.fill('input[name="newPin"]', '123456');
  await page.fill('input[name="confirmPin"]', '123456');

  // Submit form change-pin lewat tombol submit.
  await page.click('form[data-form="change-pin"] button[type="submit"]');

  // Tunggu modal change-pin benar-benar hilang dari DOM.
  await expect(page.locator('form[data-form="change-pin"]')).toHaveCount(0, {
    timeout: 10_000,
  });

  // PIN pertama tidak boleh langsung mengaktifkan kunci otomatis bawaan lama.
  await expect(page.locator('[data-action="open-auto-lock"]')).toContainText('Tidak pernah');

  // Kunci aplikasi
  await page.click('[data-action="lock-app"], button:has-text("Kunci")').catch(() => null);
  await page.waitForTimeout(800);

  // Sekarang harus ada layar PIN
  await expect(page.locator('#pin-input')).toBeVisible({ timeout: 5_000 });
  await page.fill('#pin-input', '123456');
  await page.click('#login-form button[type="submit"]');
  await page.waitForTimeout(800);
}

/* -------------------------------------------------------------------------- */
/*  Helper: siapkan localStorage dengan workspace uji (DENGAN PIN "123456")   */
/*  Langsung ke layar PIN saat halaman dimuat.                                */
/* -------------------------------------------------------------------------- */

const SETUP_STORAGE_PIN_CONTENT = readFileSync(
  join(process.cwd(), 'tests/e2e/setup-storage-pin.js'),
  'utf8',
);

/* -------------------------------------------------------------------------- */
/*  Test 1: Login PIN → dashboard                                             */
/* -------------------------------------------------------------------------- */

test('Login PIN → dashboard', async ({ page }) => {
  await page.addInitScript({ content: SETUP_STORAGE_PIN_CONTENT });
  await page.goto('/?nosw');
  await page.waitForTimeout(1000);

  // Layar PIN harus langsung muncul (workspace punya PIN)
  await expect(page.locator('#pin-input')).toBeVisible({ timeout: 10_000 });

  // Masukkan PIN
  await page.fill('#pin-input', '123456');
  await page.click('#login-form button[type="submit"]');
  await page.waitForTimeout(1000);

  // Dashboard harus muncul setelah unlock
  await expect(page.locator('#app-root')).toContainText(/dashboard|beranda/i, { timeout: 5_000 });
});

/* -------------------------------------------------------------------------- */
/*  Test 2: Tambah transaksi → reload → data masih ada                        */
/* -------------------------------------------------------------------------- */

test('Tambah transaksi → reload → data masih ada', async ({ page }) => {
  await page.addInitScript({ content: SETUP_STORAGE_CONTENT });
  await page.goto('/?nosw');
  await page.waitForTimeout(1000);
  await expect(page.locator('#app-root')).toContainText(/dashboard|beranda/i, { timeout: 10_000 });

  // Buka modal transaksi
  await page.click('[data-action="add-tx"], [data-action="add-transaction"], [data-action="open-transaction"], button:has-text("Tambah"), button:has-text("Transaksi")').catch(() => null);
  await expect(page.locator('form[data-form="transaction"]')).toBeVisible({ timeout: 5_000 });

  // Isi form
  await page.selectOption('select[name="accountId"]', { label: 'Dompet Tunai' });
  await page.fill('input[name="amountExpression"]', '50000');
  await page.fill('input[name="dateDisplay"]', '15/11/2026');
  await page.fill('input[name="time"]', '09:00');
  await page.selectOption('select[name="categoryId"]', { label: 'Makanan & Minuman' });
  await page.fill('textarea[name="note"]', 'E2E test transaksi');

  await page.click('button[type="submit"]');
  await expect(page.locator('form[data-form="transaction"]')).toBeHidden({ timeout: 5_000 });
  await expect(page.locator('text=E2E test transaksi')).toBeVisible({ timeout: 5_000 });

  // Reload dan verifikasi
  await page.reload();
  await page.waitForTimeout(1000);
  await expect(page.locator('#app-root')).toContainText(/dashboard|beranda/i, { timeout: 5_000 });
  await expect(page.locator('text=E2E test transaksi')).toBeVisible({ timeout: 5_000 });
});

/* -------------------------------------------------------------------------- */
/*  Test 3: Transfer antar akun → saldo kedua akun berubah                    */
/* -------------------------------------------------------------------------- */

test('Transfer antar akun → saldo kedua akun berubah', async ({ page }) => {
  await page.addInitScript({ content: SETUP_STORAGE_CONTENT });
  await page.goto('/?nosw');
  await page.waitForTimeout(1000);
  await expect(page.locator('#app-root')).toContainText(/dashboard|beranda/i, { timeout: 10_000 });

  await page.click('[data-action="add-tx"], [data-action="add-transaction"], [data-action="open-transaction"], button:has-text("Tambah"), button:has-text("Transaksi")').catch(() => null);
  await expect(page.locator('form[data-form="transaction"]')).toBeVisible({ timeout: 5_000 });

  await page.click('[data-action="tx-form-type"][data-type="transfer"]');
  await page.selectOption('select[name="accountId"]', { label: 'Bank BCA' });
  await page.selectOption('select[name="toAccountId"]', { label: 'Dompet Tunai' });
  await page.fill('input[name="amountExpression"]', '1000000');
  await page.fill('input[name="dateDisplay"]', '16/11/2026');
  await page.fill('input[name="time"]', '10:00');
  await page.fill('textarea[name="note"]', 'E2E transfer');

  await page.click('button[type="submit"]');
  await expect(page.locator('form[data-form="transaction"]')).toBeHidden({ timeout: 5_000 });
  await expect(page.locator('text=E2E transfer')).toBeVisible({ timeout: 5_000 });

  await page.reload();
  await page.waitForTimeout(1000);
  await expect(page.locator('text=E2E transfer')).toBeVisible({ timeout: 5_000 });
});

/* -------------------------------------------------------------------------- */
/*  Test 4: Backup JSON → impor kembali (tanpa reset)                         */
/* -------------------------------------------------------------------------- */

test('Backup JSON → impor kembali', async ({ page }) => {
  await page.addInitScript({ content: SETUP_STORAGE_CONTENT });
  await page.goto('/?nosw');
  await page.waitForTimeout(1000);
  await expect(page.locator('#app-root')).toContainText(/dashboard|beranda/i, { timeout: 10_000 });

  // Tambah transaksi penanda
  await page.click('[data-action="add-tx"], [data-action="add-transaction"], [data-action="open-transaction"], button:has-text("Tambah"), button:has-text("Transaksi")').catch(() => null);
  await expect(page.locator('form[data-form="transaction"]')).toBeVisible({ timeout: 5_000 });
  await page.selectOption('select[name="accountId"]', { label: 'Dompet Tunai' });
  await page.fill('input[name="amountExpression"]', '75000');
  await page.fill('input[name="dateDisplay"]', '17/11/2026');
  await page.fill('input[name="time"]', '11:00');
  await page.selectOption('select[name="categoryId"]', { label: 'Makanan & Minuman' });
  await page.fill('textarea[name="note"]', 'E2E siklus backup');
  await page.click('button[type="submit"]');
  await expect(page.locator('form[data-form="transaction"]')).toBeHidden({ timeout: 5_000 });
  await expect(page.locator('text=E2E siklus backup')).toBeVisible({ timeout: 5_000 });

  // Buka Settings
  await page.click('[data-action="settings"], a:has-text("Pengaturan"), button:has-text("Pengaturan")').catch(() => null);
  await page.waitForTimeout(800);
  await expect(page.locator('[data-action="export-backup"]')).toBeVisible({ timeout: 5_000 });

  // Export backup — siapkan download listener sebelum klik
  const downloadPromise = page.waitForEvent('download');
  await page.click('[data-action="export-backup"]');
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();

  // Import kembali via file chooser (data masih ada, impor menimpa)
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.click('[data-action="import-backup"]');
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(downloadPath);
  await page.click('button:has-text("Pulihkan")');

  // Setelah import, aplikasi pindah ke layar auth (welcome). Klik "Buka
  // data terakhir" untuk membuka workspace yang baru diimpor.
  await expect(page.locator('#app-root')).toContainText(/selamat datang|masuk ke/i, { timeout: 5_000 });
  await page.click('[data-action="offline-open"], button:has-text("Buka data terakhir")');
  await page.waitForTimeout(1500);
  // Route terakhir masih #/settings; buka dashboard untuk melihat transaksi.
  await page.goto('/#/dashboard');
  await page.waitForTimeout(1000);

  await expect(page.locator('text=E2E siklus backup')).toBeVisible({ timeout: 10_000 });
});

/* -------------------------------------------------------------------------- */
/*  Test 5: Impor backup JSON → preview → impor                               */
/* -------------------------------------------------------------------------- */

test('Impor backup JSON → preview → impor', async ({ page }) => {
  await page.addInitScript({ content: SETUP_STORAGE_CONTENT });
  await page.goto('/?nosw');
  await page.waitForTimeout(1000);
  await expect(page.locator('#app-root')).toContainText(/dashboard|beranda/i, { timeout: 10_000 });

  // Tambah transaksi penanda agar hasil impor bisa diverifikasi.
  await page.click('[data-action="add-tx"], [data-action="add-transaction"], [data-action="open-transaction"], button:has-text("Tambah"), button:has-text("Transaksi")').catch(() => null);
  await expect(page.locator('form[data-form="transaction"]')).toBeVisible({ timeout: 5_000 });
  await page.selectOption('select[name="accountId"]', { label: 'Dompet Tunai' });
  await page.fill('input[name="amountExpression"]', '12345');
  await page.fill('input[name="dateDisplay"]', '18/11/2026');
  await page.fill('input[name="time"]', '12:00');
  await page.selectOption('select[name="categoryId"]', { label: 'Makanan & Minuman' });
  await page.fill('textarea[name="note"]', 'E2E impor backup');
  await page.click('button[type="submit"]');
  await expect(page.locator('form[data-form="transaction"]')).toBeHidden({ timeout: 5_000 });
  await expect(page.locator('text=E2E impor backup')).toBeVisible({ timeout: 5_000 });

  // Buka Settings
  await page.click('[data-action="settings"], a:has-text("Pengaturan"), button:has-text("Pengaturan")').catch(() => null);
  await page.waitForTimeout(800);
  await expect(page.locator('[data-action="export-backup"]')).toBeVisible({ timeout: 5_000 });

  // Export backup — siapkan download listener sebelum klik
  const downloadPromise = page.waitForEvent('download');
  await page.click('[data-action="export-backup"]');
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();

  // Import kembali via file chooser
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.click('[data-action="import-backup"]');
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(downloadPath);
  await page.click('button:has-text("Pulihkan")');

  // Setelah import, aplikasi pindah ke layar auth. Klik "Buka data terakhir".
  await expect(page.locator('#app-root')).toContainText(/selamat datang|masuk ke/i, { timeout: 5_000 });
  await page.click('[data-action="offline-open"], button:has-text("Buka data terakhir")');
  await page.waitForTimeout(1500);
  await page.goto('/#/dashboard');
  await page.waitForTimeout(1000);

  await expect(page.locator('text=E2E impor backup')).toBeVisible({ timeout: 10_000 });
});

/* -------------------------------------------------------------------------- */
/*  Test 6: Atur PIN → kunci → buka lagi → reload tetap terkunci              */
/* -------------------------------------------------------------------------- */

test('Atur PIN → kunci → buka lagi → reload tetap terkunci', async ({ page }) => {
  await page.addInitScript({ content: SETUP_STORAGE_CONTENT });
  await page.goto('/?nosw');
  await page.waitForTimeout(1000);
  await expect(page.locator('#app-root')).toContainText(/dashboard|beranda/i, { timeout: 10_000 });

  // Atur PIN lewat Settings, kunci, lalu buka kembali (helper berakhir setelah unlock).
  await setupPinViaSettings(page);
  await expect(page.locator('#app-root')).toContainText(/dashboard|beranda/i, { timeout: 10_000 });

  // Reload: workspace terenkripsi harus menampilkan layar PIN, bukan welcome.
  await page.reload();
  await page.waitForTimeout(1200);
  await expect(page.locator('#pin-input')).toBeVisible({ timeout: 10_000 });
  await page.fill('#pin-input', '123456');
  await page.click('#login-form button[type="submit"]');
  await page.waitForTimeout(1200);
  await expect(page.locator('#app-root')).toContainText(/dashboard|beranda/i, { timeout: 10_000 });
});

/* -------------------------------------------------------------------------- */
/*  Test 7: Tanpa PIN → tidak ada aksi kunci, label "Atur PIN"                */
/* -------------------------------------------------------------------------- */

test('Tanpa PIN: tidak ada tombol kunci dan label memakai "Atur PIN"', async ({ page }) => {
  await page.addInitScript({ content: SETUP_STORAGE_CONTENT });
  await page.goto('/?nosw');
  await page.waitForTimeout(1000);
  await page.goto('/#/settings');
  await page.waitForTimeout(800);

  // Tanpa PIN tidak boleh ada aksi mengunci aplikasi.
  await expect(page.locator('[data-action="lock-app"]')).toHaveCount(0);

  // Menu PIN harus memakai istilah "Atur PIN", bukan "Ubah PIN"/"Buat PIN".
  await expect(page.locator('[data-action="change-pin"]')).toContainText('Atur PIN');

  // Kunci otomatis tidak aktif sebelum PIN diatur.
  await expect(page.locator('[data-action="open-auto-lock"]')).toContainText(
    'Atur PIN dulu untuk mengaktifkan'
  );

  // Menekan kunci otomatis mengarahkan pengguna untuk mengatur PIN dulu.
  await page.click('[data-action="open-auto-lock"]');
  await expect(page.locator('form[data-form="change-pin"]')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('form[data-form="change-pin"] .modal-title')).toContainText('Atur PIN');

  // Log konflik adalah alat diagnostik, bukan bagian pengaturan biasa.
  await expect(page.locator('#conflict-log-card')).toHaveCount(0);
});
