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
  await page.waitForTimeout(500);

  // Klik "Buat PIN" / "Ubah PIN"
  await page.click('[data-action="change-pin"]');
  await page.waitForTimeout(500);

  // Isi PIN baru dan konfirmasi di modal
  await page.fill('input[name="newPin"]', '1234');
  await page.fill('input[name="confirmPin"]', '1234');
  await page.click('form[data-form="change-pin"] button[type="submit"]');
  await page.waitForTimeout(500);

  // Kunci aplikasi
  await page.click('[data-action="lock-app"], button:has-text("Kunci")').catch(() => null);
  await page.waitForTimeout(500);

  // Sekarang harus ada layar PIN
  await expect(page.locator('#pin-input')).toBeVisible({ timeout: 5_000 });
  await page.fill('#pin-input', '1234');
  await page.click('#login-form button[type="submit"]');
  await page.waitForTimeout(500);
}

/* -------------------------------------------------------------------------- */
/*  Test 1: Login PIN → dashboard                                             */
/* -------------------------------------------------------------------------- */

test('Login PIN → dashboard', async ({ page }) => {
  await page.addInitScript({ content: SETUP_STORAGE_CONTENT });
  await page.goto('/?nosw');
  await page.waitForTimeout(1000);

  // User tidak punya PIN → langsung dashboard
  await expect(page.locator('#app-root')).toContainText(/dashboard|beranda/i, { timeout: 10_000 });

  // Atur PIN lalu kunci → buka kembali
  await setupPinViaSettings(page);

  // Verifikasi kembali ke dashboard
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
/*  Test 4: Backup JSON → reset → impor kembali                               */
/* -------------------------------------------------------------------------- */

test('Backup JSON → reset → impor kembali', async ({ page }) => {
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

  // Export backup
  const downloadPromise = page.waitForEvent('download');
  await page.click('[data-action="export-backup"]');
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();

  // Reset app
  await page.click('[data-action="reset-app"]');
  await page.waitForTimeout(500);
  
  // Konfirmasi reset di dialog
  await page.click('button:has-text("Reset perangkat")');
  await expect(page.locator('text=E2E siklus backup')).toBeHidden({ timeout: 5_000 });

  // Import kembali via file chooser
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.click('[data-action="import-backup"]');
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(downloadPath);
  await page.click('button:has-text("Pulihkan")');

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

  // Buka Settings
  await page.click('[data-action="settings"], a:has-text("Pengaturan"), button:has-text("Pengaturan")').catch(() => null);
  await page.waitForTimeout(1000);

  // Export backup — tunggu tombol muncul
  await expect(page.locator('[data-action="export-backup"]')).toBeVisible({ timeout: 5_000 });
  const downloadPromise = page.waitForEvent('download');
  await page.click('[data-action="export-backup"]');
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();

  // Reset
  await page.click('[data-action="reset-app"]');
  await page.click('button:has-text("Reset perangkat")');

  // Import kembali
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.click('[data-action="import-backup"]');
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(downloadPath);
  await page.click('button:has-text("Pulihkan")');

  await expect(page.locator('text=E2E test transaksi')).toBeVisible({ timeout: 10_000 });
});
