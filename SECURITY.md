# Keamanan RISLY

## Status saat ini
- Firebase Auth (Google) sudah terintegrasi di aplikasi untuk isolasi per rumah tangga:
  `Cloud.signInWithGoogle()` memakai credential dari login Google (GIS) via `GoogleAuthProvider.credential(null, accessToken)`.
  Setelah sign-in, household dipindah ke path per-user `households/<firebaseUid>` bila belum ada config tersimpan.
- Token Google di relay iOS sekarang dienkripsi (ECDH P-256 + AES-GCM). Relay tetap publik sementara callback Safari memang memerlukan write tanpa auth.
- Kunci master JSONBin sudah dihapus dari client dan kode legacy JSONBin sudah dihapus. Key lama harus di-rotasi di JSONBin.
- Data lokal di localStorage belum dienkripsi; PIN hanya mengunci sesi.

## Aturan Firebase yang harus dipublikasikan
1. Firebase Console → Authentication → Sign-in method → **Google** → aktifkan.
2. Firebase Console → Realtime Database → Rules → paste isi file `firebase-security-rules.json` → **Publish**.

Aturan ini mengizinkan baca/tulis hanya anggota (`members/<uid>`) atau owner (`owner`) milik household. Pengguna baru yang menulis pertama kali harus menetapkan `owner` ke UID Firebase-nya sendiri (`newData.child('owner').val() === auth.uid`).

## Langkah pasca-deploy
- Rotasi JSONBin master key lama yang pernah bocor.
- Hapus kunci lama dari riwayat Git (opsional, disarankan).
- Deploy ulang PWA (service worker terbump `risly-1.2.24`).

## Catatan arsitektur
- Setiap akun Google dapat membuat household sendiri `households/<firebaseUid>`.
- Berbagi keluarga via undangan (owner menambah `members/<uid>`).
- Relay iOS diganti dengan Firebase Auth redirect pada tahap berikutnya (menutup akses publik relay).
