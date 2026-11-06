# Keamanan RISLY

## Status saat ini
- Firebase Auth (Google) terintegrasi via `Cloud.signInWithGoogle()` (credential dari login Google).
- Firebase Auth redirect (`startGoogleAuthRedirect` / `completeGoogleAuthLogin`) sudah menjadi jalur login utama (termasuk iOS); relay custom tidak dipakai lagi.
- Token Google di relay iOS lama dienkripsi (ECDH P-256 + AES-GCM). Relay publik kini ditutup di rules.
- Kunci master JSONBin sudah dihapus dari client dan kode legacy JSONBin sudah dihapus. Key lama harus di-rotasi di JSONBin.
- Data lokal di localStorage belum dienkripsi; PIN hanya mengunci sesi.

## Aturan Firebase yang harus dipublikasikan
1. Firebase Console → Authentication → Sign-in method → **Google** → aktifkan.
2. Firebase Console → Realtime Database → Rules → paste isi file `firebase-security-rules.json` → **Publish**.

Aturan ini mengizinkan baca/tulis hanya anggota (`members/<uid>`) atau owner (`owner`) milik household. Pengguna baru yang menulis pertama kali harus menetapkan `owner` ke UID Firebase-nya sendiri (`newData.child('owner').val() === auth.uid`).

`oauth_relay` kini dibaca/tulisnya `false` — tidak ada lagi path publik untuk hasil login.

## Langkah pasca-deploy
- Rotasi JSONBin master key lama yang pernah bocor.
- Hapus kunci lama dari riwayat Git (opsional, disarankan).
- Deploy ulang PWA (service worker terbump `risly-1.2.24`).

## Catatan arsitektur
- Setiap akun Google dapat membuat household sendiri `households/<firebaseUid>`.
- Berbagi keluarga via undangan: kode dipublikasikan ke `inviteCodes/<KODE>` berisi `ownerUid`, lalu anggota yang bergabung menulis `households/<ownerUid>/members/<uid>` dan memakai path household pemilik.
- Data lokal anggota yang sudah ada tetap digabung (bukan ditimpa) saat bergabung; pengaturan ruang mengikuti pemilik.
- Login Google memakai Firebase Auth redirect; token Google diambil dari Firebase (`user.accessToken`) lalu diadopsi ke `GoogleDrive` untuk backup Drive.

## Prasyarat teknis sebelum login pertama kali setelah perubahan ini
- Redirect URI Firebase harus didaftarkan di Google Cloud Console + Firebase: `https://risly24040710.firebaseapp.com/__/auth/handler` (sesuai `authDomain`).
- Firebase Auth Google provider harus aktif.
