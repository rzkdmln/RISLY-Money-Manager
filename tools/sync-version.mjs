/**
 * RISLY — sinkronisasi versi aplikasi ke service worker.
 *
 * Baca APP.version dari js/core/config.js dan tulis
 * const VERSION = 'risly-<versi>' ke sw.js.
 *
 * Jalankan sebelum deploy:
 *   node tools/sync-version.mjs
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('.');
const CONFIG_PATH = path.join(ROOT, 'js', 'core', 'config.js');
const SW_PATH = path.join(ROOT, 'sw.js');

const configSrc = fs.readFileSync(CONFIG_PATH, 'utf8');
const versionMatch = configSrc.match(/version:\s*['"]([^'"]+)['"]/);
if (!versionMatch) {
  console.error('Gagal menemukan APP.version di js/core/config.js');
  process.exit(1);
}
const version = versionMatch[1];
const newVersionLine = `const VERSION = 'risly-${version}';`;

const swSrc = fs.readFileSync(SW_PATH, 'utf8');
const swUpdated = swSrc.replace(/const VERSION = 'risly-[^']+';/, newVersionLine);

if (swSrc === swUpdated) {
  console.log(`sw.js sudah menggunakan versi risly-${version}. Tidak ada perubahan.`);
} else {
  fs.writeFileSync(SW_PATH, swUpdated, 'utf8');
  console.log(`sw.js VERSION diperbarui ke risly-${version}.`);
}
