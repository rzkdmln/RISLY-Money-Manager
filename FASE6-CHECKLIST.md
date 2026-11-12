# ✅ Checklist Penyelesaian Fase 6 — Firebase Rules & Sinkronisasi

File ini adalah panduan langkah demi langkah untuk membuat Fase 6 **benar-benar tuntas** dan memenuhi semua Definition of Done.

---

## 1. Prasyarat Sebelum Uji

Pastikan semua sudah terinstall:

```powershell
# Firebase CLI (sudah terinstall)
firebase --version

# DevDependencies proyek sudah terinstall (vitest, playwright, dll.)
npm ls
```

Jika Firebase CLI belum ada:
```powershell
npm install -g firebase-tools
```

---

## 2. Uji Firebase Security Rules dengan Emulator (WAJIB)

### 2.1 Jalankan emulator database

```powershell
firebase emulators:start --only database
```

Emulator akan berjalan di `http://localhost:9000` dan memuat aturan dari `firebase-security-rules.json` (dikonfigurasi via `firebase.json`).

### 2.2 Jalankan test rules

```powershell
npm install --save-dev @firebase/rules-unit-testing  # jika belum

# Saat ini tersedia uji struktur statis rules:
npx vitest run tests/rules/rules-structure.test.js
```

> Catatan: skenario emulator 1–6 di bawah belum dibuat sebagai test otomatis
> karena emulator Firebase memerlukan Java. Uji ini masih TODO sebelum publish
> rules ke produksi.

**6 skenario yang harus LULUS:**

| No | Skenario | Harapan |
|----|----------|---------|
| 1 | Owner membuat household baru → menjadi owner | ✅ Berhasil |
| 2 | Anggota non-owner ubah `settings` | ❌ Ditolak |
| 3 | Pengguna luar household baca data | ❌ Ditolak |
| 4 | Anggota menulis subtree `data` | ✅ Berhasil |
| 5 | Kode undangan kedaluwarsa dibaca | ❌ Ditolak |
| 6 | Anggota tulis `inviteCodes` | ❌ Ditolak |

Jika ada yang gagal, perbaiki `firebase-security-rules.json` lalu ulangi.

### 2.3 Publish rules ke Firebase produksi (setelah uji emulator lulus)

```powershell
firebase deploy --only database
```

> **Peringatan:** Cadangkan data lokal sebelum mengubah rules. Sediakan rollback rules (simpan rules lama sebagai cadangan).

---

## 3. Uji E2E Sinkronisasi 2 Akun / 3 Perangkat

### 3.1 Jalankan emulator + Playwright

```powershell
# Terminal 1: jalankan emulator
firebase emulators:start --only database

# Terminal 2: jalankan aplikasi lokal (http-server)
npx http-server -p 8080

# Terminal 3: jalankan E2E sync test
npx playwright test tests/e2e/sync/sync.test.js
```

### 3.2 4 skenario E2E yang harus LULUS

| No | Skenario | Harapan |
|----|----------|---------|
| S1 | Perangkat A tambah transaksi → sync → perangkat B lihat | ✅ Transaksi muncul di B |
| S2 | Dua perangkat tambah transaksi berbeda → sync keduanya | ✅ Kedua transaksi muncul di kedua perangkat |
| S3 | Anggota coba ubah `settings` | ✅ Ditolak oleh rules (tidak crash) |
| S4 | Log Konflik tersedia di Pengaturan | ✅ Section `#conflict-log-card` terlihat |

> **Catatan:** Untuk conflict sebenarnya (dua perangkat edit record ID yang sama), perlu manipulasi data yang lebih dalam. Test S2 saat ini mencakup sinkronisasi dasar tanpa conflict record-level. Conflict log (`risly.mm.conflicts.v1`) sudah diimplementasikan di `store.js` dan akan terpicu saat `mergeRemote` mendeteksi record dengan id yang sama namun konten berbeda.

---

## 4. Verifikasi Kode Fase 6 (Sudah Diimplementasi)

| Item | File | Status |
|------|------|--------|
| `ensureMember` hanya `googleEmail`/`firebaseUid` (tidak nama) | `js/core/store.js` | ✅ Selesai |
| Conflict log (`_conflictLog`, `getConflictLog`, `clearConflictLog`) | `js/core/store.js` | ✅ Selesai |
| `_recordMergeConflicts` di `mergeRemote` | `js/core/store.js` | ✅ Selesai |
| Firebase rules `.validate` + owner-only writes | `firebase-security-rules.json` | ✅ Selesai |
| `inviteCodes` TTL (`expiresAt > now`) | `firebase-security-rules.json` | ✅ Selesai |
| `oauth_relay` ditutup (`.read/.write: false`) | `firebase-security-rules.json` | ✅ Selesai |
| Event `sync:conflict` di `cloud.js` | `js/services/cloud.js` | ✅ Selesai |
| UI Log Konflik di Pengaturan | `js/views/settings.js` | ✅ Selesai |
| Action `clear-conflict-log` + `view-conflict` | `js/app/actions/cloud.js` | ✅ Selesai |
| `google-auth-relay.js` ditandai deprecated | `js/services/google-auth-relay.js` | ✅ Selesai |
| `oauth-callback.html` ditandai deprecated | `oauth-callback.html` | ✅ Selesai |
| Dokumen layar kunci | `js/app/lock.js` | ✅ Selesai |
| Dokumentasi `SECURITY.md` (popup login incognito, token resolve, object comparison fix) | `SECURITY.md` | ✅ Selesai |
| Dokumentasi `README.md` (Firebase Security Rules + changelog v1.2.50) | `README.md` | ✅ Selesai |
| Lint (ESLint) 0 error | Semua file JS | ✅ `npm run lint` |
| Unit test 137 lolos | `tests/core/*.test.js` | ✅ `npm test` |
| E2E smoke 6 alur utama lolos | `tests/e2e/smoke.test.js` | ✅ Playwright + CI |

---

## 5. Rollback Plan (Jika Rules Bermasalah)

Jika rules baru menyebabkan masalah di produksi:

1. **Cadangkan rules lama** sebelum deploy:
   ```powershell
   firebase database:get --instance <project-id> /rules > rules-backup.json
   ```

2. **Rollback rules** ke versi lama:
   ```powershell
   firebase database:set --instance <project-id> /rules rules-backup.json
   ```

3. **Rollback kode** (jika diperlukan):
   ```powershell
   git revert d9d9517
   ```

4. **Fallback baca `localStorage`** masih tersedia (IndexedDB + localStorage fallback dari Fase 5 tetap aktif).

---

## 6. Definition of Done (DOD) Fase 6

| DOD | Status | Keterangan |
|-----|--------|------------|
| Rules lulus semua skenario emulator | ⏳ Belum | Perlu Java + test emulator (TODO) |
| Uji 2 akun / 3 perangkat: tidak ada kehilangan data | ⏳ Belum | Jalankan langkah 3 |
| Perubahan dari perangkat lain terlihat di UI | ⏳ Belum | Skenario S1 & S2 |
| E2E smoke 6 alur utama (termasuk PIN/kunci) | ✅ Selesai | `tests/e2e/smoke.test.js` + CI |
| Tidak ada lagi pencocokan anggota berdasarkan nama | ✅ Selesai | `ensureMember` diperbaiki |
| Lint 0 error + 137 unit test lolos | ✅ Selesai | Sudah diverifikasi |

---

## 7. Langkah Selanjutnya Setelah Fase 6 Tuntas

Setiap DOD di atas dicentang, Fase 6 selesai. **Fase 7 — Enkripsi at-rest & hardening PIN/sesi sudah selesai** (implementasi di `js/core/crypto.js`, `js/core/store.js`, `js/core/auth.js`, `js/app/submissions/auth.js`):

- ✅ Enkripsi data IndexedDB sebelum ditulis (Web Crypto API, AES-GCM 256-bit, PBKDF2-SHA256 310k iterasi)
- ✅ Hardening PIN (auto-lock, rate limit, lockout eksponensial, 6–8 digit)
- ✅ Verifier PIN terpisah dari kunci enkripsi (domain separation, tidak sama dengan key)
- ✅ Layar kunci tetap tersedia setelah reload workspace terenkripsi (lock snapshot + metadata PIN)
- ✅ Migrasi verifier lama (1.2.42) ke format baru saat unlock
- ✅ Firebase Storage untuk sinkronisasi struk (lihat catatan Fase 6 di README)

Sisa lanjutan: uji emulator rules (butuh Java), refactor inline style untuk hapus `unsafe-inline` dari CSP, dan commit perubahan.

---

## Ringkasan Perintah Cepat

```powershell
# 1. Install firebase CLI (sekali saja)
npm install -g firebase-tools

# 2. Install rules-unit-testing (sekali saja)
npm install --save-dev @firebase/rules-unit-testing

# 3. Jalankan emulator
firebase emulators:start --only database

# 4. Uji struktur rules (emulator rules test masih TODO)
npx vitest run tests/rules/rules-structure.test.js

# 5. Uji E2E sync
npx playwright test tests/e2e/sync/sync.test.js

# 6. Lint + unit test (regresi)
npm run lint && npm test

# 7. Publish rules ke produksi (setelah semua lulus)
firebase deploy --only database
```

---

**Catatan:** Fase 6 berisiko tinggi (data keluarga). Jangan melewati langkah 2 (uji emulator) sebelum publish rules ke produksi. Selalu cadangkan data dan rules sebelum deploy.
