# Keamanan RISLY

Terakhir diperbarui: 11 November 2026

## Status saat ini

- Firebase Auth (Google) terintegrasi via `Cloud.signInWithGoogle()` (credential dari login Google).
- Firebase Auth redirect (`startGoogleAuthRedirect` / `completeGoogleAuthLogin`) sudah menjadi jalur login utama (termasuk iOS); relay custom tidak dipakai lagi.
- Token Google di relay iOS lama dienkripsi (ECDH P-256 + AES-GCM). Relay publik kini ditutup di rules.
- Kunci master JSONBin sudah dihapus dari client dan kode legacy JSONBin sudah dihapus. Key lama harus di-rotasi di JSONBin.
- Data lokal di IndexedDB **di-enkripsi at-rest** (AES-GCM 256-bit, kunci turunan dari PIN via PBKDF2-SHA256 ≥310.000 iterasi). Kunci hanya ada di memori, tidak pernah di disk.
- PIN minimal 6 angka (maksimum 8).
- Login throttling eksponensial: 1 menit → 5 menit → 15 menit setelah 5 kali gagal berurutan.
- Auto-lock menghapus kunci enkripsi dan data terdekripsi dari memori (bukan hanya ubah `ui.locked`).
- Sesi disimpan di `sessionStorage` + IndexedDB meta (hanya ID pengguna); cookie sesi lama (`risly.mm.session.v1`) dihapus.
- Token Google **tidak lagi disimpan di cookie** (non-HttpOnly). Token hanya di `localStorage` + memori.
- `ensureMember` hanya mencocokkan `googleEmail` / `firebaseUid` — pencocokan berdasarkan nama dihapus untuk menghindari penggabungan orang yang salah.

## Aturan Firebase yang harus dipublikasikan

1. Firebase Console → Authentication → Sign-in method → **Google** → aktifkan.
2. Firebase Console → Realtime Database → Rules → paste isi file `firebase-security-rules.json` → **Publish**.

Aturan baru (Fase 6):

- `.validate` pada struktur envelope (`app`, `schemaVersion`, `data`, `revision`, `savedAt`) serta sub-koleksi (`data`, `settings`, `owner`, `members`, `inviteCode`, `conflicts`).
- Hanya **owner** yang boleh mengubah `owner`, `members`, `settings`, dan `inviteCode`.
- Anggota hanya boleh menulis ke subtree `data` dan tidak boleh mengubah kolom non-data.
- Household baru: pencipta otomatis menjadi owner (`newData.child('owner').val() === auth.uid`).
- `inviteCodes/$code`: hanya bisa dibaca jika belum kedaluwarsa (`expiresAt > now`), hanya bisa ditulis oleh owner household dengan masa berlaku di masa depan.
- `oauth_relay` dibaca/ditulisnya `false` — tidak ada path publik untuk hasil login.
- Node `conflicts` untuk mencatat catatan yang kalah dalam merge sinkronisasi; hanya owner yang menulis, anggota/owner yang membaca.

`oauth_relay` kini dibaca/tulisnya `false` — tidak ada lagi path publik untuk hasil login.

## Langkah pasca-deploy

- Publikasikan `firebase-security-rules.json` baru ke Firebase Realtime Database Rules sebelum mengaktifkan sinkronisasi keluarga.
- Rotasi JSONBin master key lama yang pernah bocor.
- Hapus kunci lama dari riwayat Git (opsional, disarankan).
- Deploy ulang PWA (service worker terbump `risly-1.2.43`; sinkronkan dengan `APP.version` di `js/core/config.js`).
- Cadangkan data lokal sebelum mengubah rules (ada rollback path via `localStorage` fallback).

## Catatan arsitektur

- Setiap akun Google dapat membuat household sendiri `households/<firebaseUid>`.
- Berbagi keluarga via undangan: kode dipublikasikan ke `inviteCodes/<KODE>` berisi `ownerUid`, lalu anggota yang bergabung menulis `households/<ownerUid>/members/<uid>` dan memakai path household pemilik.
- Data lokal anggota yang sudah ada tetap digabung (bukan ditimpa) saat bergabung; pengaturan ruang mengikuti pemilik.
- Login Google memakai Firebase Auth redirect; token Google diambil dari Firebase (`user.accessToken`) lalu diadopsi ke `GoogleDrive` untuk backup Drive.
- Konflik sinkronisasi (dua perangkat mengubah record yang sama) dicatat ke `risly.mm.conflicts.v1` di localStorage dan bisa dilihat di Pengaturan › Log Konflik. Pemenang dipilih berdasarkan timestamp terbaru.

## Prasyarat teknis sebelum login pertama kali setelah perubahan ini

- Redirect URI Firebase harus didaftarkan di Google Cloud Console + Firebase: `https://risly24040710.firebaseapp.com/__/auth/handler` (sesuai `authDomain`).
- Firebase Auth Google provider harus aktif.

## Enkripsi At-Rest & Hardening PIN (Fase 7)

### Enkripsi workspace

Data workspace disimpan di IndexedDB dalam bentuk terenkripsi (AES-GCM 256-bit) setelah PIN diatur. Kunci enkripsi di-derive dari PIN via PBKDF2-SHA256 dengan 310.000 iterasi + salt acak. Kunci hanya ada di memori aplikasi dan **tidak pernah disimpan ke disk**.

Verifikasi PIN (untuk layar kunci) menggunakan verifier terpisah (hash PBKDF2) yang disimpan di IndexedDB meta (`risly.mm.pin.meta.v1.<userId>`), sehingga PIN dapat divalidasi sebelum kunci enkripsi tersedia.

### Auto-lock

Saat auto-lock terpicu, `store.lock()` menghapus kunci enkripsi dari memori dan membersihkan `this.data`. Data terdekripsi tidak tersisa di RAM. Untuk membuka kembali, pengguna harus memasukkan PIN yang benar.

### Sesi & Token

- Sesi disimpan di `sessionStorage` (bukan `localStorage`/cookie) agar tidak survive browser restart tanpa re-login.
- Cookie sesi lama (`risly.mm.session.v1`) dihapus saat boot (`purgeLegacyGdriveCookies` juga membersihkan cookie Google Drive legacy).
- Token Google Drive tidak lagi disimpan di cookie; hanya `localStorage` + memori.

### Backup Terenkripsi

Backup bisa di-enkripsi dengan passphrase terpisah (AES-GCM + PBKDF2 310.000 iterasi) dan disimpan sebagai file `.risly.enc`. Pemulihan memerlukan passphrase yang sama. Tanpa passphrase, file tidak bisa dibuka.

### ⚠️ Peringatan Penting

- **Jika lupa PIN dan tidak ada cadangan terenkripsi, data hilang permanen.** Tidak ada mekanisme "lupa PIN" yang bisa membuka data terenkripsi.
- Sebelum mengaktifkan PIN, buatlah backup terenkripsi dan simpan passphrase di tempat yang aman.
- Uji pemulihan backup di perangkat bersih sebelum mengandalkan enkripsi.

## Peringatan (umum)

- Rules Firebase adalah perlindungan terakhir di cloud. Uji rules dengan Firebase Emulator Suite sebelum deploy ke produksi.
- Pastikan setiap anggota household memiliki entri `members/<uid>` yang tidak ditandai `removed`, atau mereka akan kehilangan akses baca/tulis.
- Firebase Storage (untuk sinkronisasi foto struk antar keluarga) direncanakan Fase 6; saat ini struk hanya tersimpan di IndexedDB lokal.
