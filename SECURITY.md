# Keamanan RISLY

Dokumen ini merangkum status keamanan dan langkah yang perlu dilakukan di
Firebase Console. Kode aplikasi sudah disesuaikan; aturan di bawah ini harus
diterapkan **setelah** Firebase Authentication aktif.

## Status saat ini
- Database RTDB `households/risly-family` masih publik (baca/tulis tanpa auth)
  sampai aturan di `firebase-security-rules.json` diterapkan.
- Kunci JSONBin yang bocor di versi lama sudah dihapus dari bundle; rotasi
  kunci lama tetap disarankan.
- Token Google pada relay iOS sekarang dienkripsi dengan ECDH + AES-GCM.
  Relay masih dapat ditulis siapa saja (diperlukan untuk callback Safari);
  risiko injection tersisa dan akan ditutup bila pindah ke Firebase Auth redirect.

## Langkah yang harus dilakukan pemilik proyek
1. Firebase Console → Authentication → Sign-in method → aktifkan **Google**.
2. Firebase Console → Realtime Database → Rules → salin isi
   `firebase-security-rules.json` → Publish.
3. (Opsional, disarankan) rotasi kunci JSONBin lama yang pernah bocor:
   JSONBin → API Keys → revoke key lama.
4. Hapus kunci lama dari riwayat Git bila perlu:
   `git filter-repo` / BFG, lalu force-push.
5. Deploy ulang PWA (bump service worker sudah dilakukan: `risly-1.2.24`).

## Catatan arsitektur target
- Setiap akun Google mendapat UID Firebase; data pribadi di `households/<uid>`.
- Berbagi keluarga via undangan yang menambah `members/<uid>` oleh pemilik.
- Relay iOS diganti dengan Firebase Auth redirect (menghapus relay publik).