# 💰 RISLY Money Manager

![PWA Ready](https://img.shields.io/badge/PWA-Ready-brightgreen.svg)
![Offline First](https://img.shields.io/badge/Offline--First-Yes-success.svg)
![Vanilla JS](https://img.shields.io/badge/Architecture-Vanilla_JS_SPA-blue.svg)
![Version](https://img.shields.io/badge/Version-1.2.41-informational.svg)
![License](https://img.shields.io/badge/License-MIT-orange.svg)

**RISLY Money Manager** adalah aplikasi pengelolaan keuangan pribadi dan keluarga berbasis **Progressive Web App (PWA)**. Aplikasi ini berjalan sepenuhnya di browser, menyimpan data secara lokal (*offline-first*), dan tidak memerlukan server backend khusus.

RISLY cocok untuk mencatat pemasukan, pengeluaran, transfer, anggaran, transaksi berulang, target keuangan, catatan keluarga, hingga laporan bulanan. Sinkronisasi cloud dan backup Google Drive tersedia sebagai fitur **opsional**.

> **Repo:** [github.com/rzkdmln/RISLY-Money-Manager](https://github.com/rzkdmln/RISLY-Money-Manager)

---

## 📑 Daftar Isi

- [Fitur Utama](#-fitur-utama)
- [Teknologi](#-teknologi)
- [Arsitektur](#-arsitektur)
- [Struktur Direktori](#-struktur-direktori)
- [Menjalankan Secara Lokal](#-menjalankan-secara-lokal)
- [Konfigurasi](#-konfigurasi)
- [Deployment](#-deployment)
- [Data, Backup & Privasi](#-data-backup--privasi)
- [Update & Cache PWA](#-update--cache-pwa)
- [Troubleshooting](#-troubleshooting)
- [Kontribusi](#-kontribusi)
- [Lisensi](#-lisensi)

---

## ✨ Fitur Utama

### 🏠 Dashboard
- Ringkasan pemasukan, pengeluaran, arus kas, dan saldo.
- Grafik tren bulanan dan distribusi pengeluaran per kategori.
- Pintasan cepat untuk mencatat transaksi dan melihat aktivitas terbaru.
- Pengingat transaksi berulang, tugas, dan catatan yang jatuh tempo.

### 🧾 Transaksi
- Pencatatan **pemasukan**, **pengeluaran**, dan **transfer antar akun**.
- Kategori dan sub-kategori, payee/merchant, catatan, serta tag.
- **Split transaksi** ke beberapa kategori dalam satu transaksi.
- Lampiran foto struk dengan kompresi otomatis.
- Kalkulator nominal langsung di form transaksi.
- Filter lengkap (tahun, bulan, jenis, akun, kategori, pencatat, pencarian) dalam modal.
- Pagination dan pengelompokan transaksi per hari.
- Edit, hapus, dan pulihkan transaksi (soft delete).

### 💳 Akun & Aset
- Berbagai tipe akun: uang tunai, rekening bank, dompet digital, tabungan, investasi, kartu kredit, dan pinjaman.
- Saldo otomatis dari transaksi, termasuk transfer.
- Batas kredit dan simulasi jadwal pinjaman.
- Kepemilikan akun (pribadi/bersama) dan arsip akun.
- Ringkasan kekayaan bersih (*net worth*) beserta riwayat per bulan.

### 📊 Anggaran
- Anggaran total bulanan dan batas per kategori.
- Indikator status: aman, mendekati batas, dan terlampaui.
- Rekomendasi batas belanja harian.
- Salin anggaran bulan sebelumnya dan fitur *carry budget*.

### 📅 Kalender
- Tampilan kalender bulanan dengan ringkasan pemasukan/pengeluaran harian.
- Klik tanggal untuk melihat rincian transaksi hari tersebut.

### 📈 Laporan
- Ringkasan pemasukan, pengeluaran, arus kas bersih, dan tingkat tabungan.
- Distribusi pengeluaran per kategori dan kontribusi per pencatat.
- Perbandingan bulan ini vs bulan lalu.
- Tren kategori, belanja per anggota, dan saldo akun.
- Riwayat kekayaan bersih.
- **Tutup buku** per bulan untuk mengunci periode dan menjaga laporan tetap konsisten.
- Ekspor laporan ke **Excel** dan **PDF** (bulanan maupun rentang tanggal).

### 📝 Catatan & Tugas
- Sticky notes dan daftar tugas (*to-do list*).
- Warna catatan, tag, pin, favorit, arsip, dan tempat sampah.
- Checklist item, prioritas, tenggat waktu, dan pengingat.
- Pencarian, pengurutan, tampilan grid/list, dan duplikasi catatan.

### 🔁 Transaksi Berulang
- Jadwal harian, mingguan, bulanan, atau tahunan.
- Proses otomatis saat jatuh tempo, atau posting manual.
- Daftar transaksi berulang yang akan datang.

### 🎯 Target Keuangan
- Target dengan nominal dan tenggat waktu.
- Progres pencapaian dan riwayat tabungan.

### 🏷️ Kategori & Sub-kategori
- Kategori bawaan untuk pemasukan dan pengeluaran.
- Kategori custom dengan ikon dan warna.
- Sub-kategori untuk pencatatan yang lebih detail.

### 👨‍👩‍👧‍👦 Multi-Pengguna & Ruang Keluarga
- Beberapa anggota dalam satu ruang/keluarga.
- Kode undangan untuk bergabung dari perangkat lain.
- Pencatatan siapa yang membuat transaksi.
- Penggabungan data lokal saat bergabung ke ruang keluarga.

### 📥 Import, Export & Backup
- Import transaksi dari **CSV/Excel** dengan preview, validasi, dan deteksi duplikat.
- Template import CSV dan Excel siap pakai.
- Export seluruh data atau per bulan ke Excel.
- Export laporan PDF.
- Backup lokal berupa file JSON dan pemulihan dari file.
- Backup/pemulihan manual ke **Google Drive** (`appDataFolder`, maksimal 10 backup terbaru).

### ☁️ Sinkronisasi Cloud (Opsional)
- **JSONBin** untuk setup cepat.
- **Supabase REST** untuk database Postgres.
- **Firebase Realtime Database** untuk sinkronisasi real-time.
- Mode default: **Perangkat ini saja** (tanpa sinkronisasi).

### 🔐 Keamanan & Privasi
- PIN 4–8 angka dengan hashing **PBKDF2-SHA256** (150.000 iterasi).
- Sesi tersimpan di cookie + localStorage agar PWA tetap bertahan setelah restart.
- Kunci otomatis setelah waktu tertentu.
- Mode **sembunyikan nominal** untuk privasi saat layar dilihat orang lain.
- Notifikasi browser untuk pengingat.
- Data utama tersimpan lokal di perangkat, bukan di server RISLY.

### 📱 PWA & UX
- Dapat di-install ke Home Screen (Android, iOS, desktop).
- Dukungan offline setelah pemuatan pertama melalui service worker.
- Shortcut PWA: Transaksi, Catatan, dan Kalender.
- Tema terang, gelap, atau mengikuti sistem.
- Layout responsif untuk desktop dan mobile.

---

## 🛠️ Teknologi

| Lapisan | Teknologi |
|---|---|
| UI | HTML, CSS custom (`css/app.css`), Tailwind CSS via CDN |
| Logika aplikasi | Vanilla JavaScript (ES Modules), tanpa framework |
| Grafik | Chart.js |
| Excel | SheetJS (`xlsx`) |
| PDF | jsPDF + jsPDF AutoTable |
| PWA | Service Worker + Web App Manifest |
| Autentikasi | PIN lokal (PBKDF2) + Firebase Auth (Google) |
| Cloud opsional | JSONBin, Supabase REST, Firebase Realtime Database |
| Backup | File JSON lokal + Google Drive REST v3 |
| Ikon | SVG inline melalui `js/icons.js` |

Tidak ada proses build, bundler, atau `node_modules` yang diperlukan untuk menjalankan aplikasi.

---

## 🏗️ Arsitektur

RISLY menggunakan pola **MVC / Pub-Sub hybrid** yang sederhana:

```
┌──────────────────────────────────────────────────────────────┐
│                         index.html                           │
└─────────────────────────────┬────────────────────────────────┘
                              │
                     ┌────────▼────────┐
                     │     app.js      │  Router + Controller
                     │ handleAction()  │  Event delegation
                     └────────┬────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼────────┐   ┌────────▼────────┐   ┌────────▼────────┐
│   store.js     │   │     views/      │   │    cloud.js     │
│ State & query  │   │ HTML templates  │   │  Sync opsional  │
└───────┬────────┘   └────────┬────────┘   └────────┬────────┘
        │                     │                     │
┌───────▼────────┐   ┌────────▼────────┐   ┌────────▼────────┐
│  localStorage  │   │   DOM Render    │   │  Remote DB /    │
│  (per ruang)   │   │                 │   │  Google Drive   │
└────────────────┘   └─────────────────┘   └─────────────────┘
```

### Alur data
1. Aksi pengguna ditangkap oleh *event delegation* di `app.js`.
2. `store.js` memvalidasi dan mengubah data melalui `commit()`.
3. Data dipersist ke `localStorage` per workspace.
4. Store mengirim event perubahan, lalu view dirender ulang.
5. Service worker menyajikan aset dari cache saat offline.

### Penyimpanan
- `risly.mm.workspaces.v1` — registry workspace/akun.
- `risly.mm.workspace.v1.<workspaceId>` — data utama workspace.
- `risly.mm.prefs.v1` — preferensi tema, privasi, dan tampilan.
- `risly.mm.session.v1` — sesi login.
- `risly.mm.cloud.v1` — konfigurasi sinkronisasi cloud.
- `risly.mm.google.v1` — sesi Google Drive.
- `risly.mm.reminders.v1` — status pengingat yang sudah ditampilkan.

> Skema data saat ini: **v5** (`APP.schemaVersion` di `js/config.js`). Migrasi data lama ditangani otomatis oleh `js/data.js`.

### Service Worker (`sw.js`)
- **Navigasi:** network-first dengan fallback `index.html` dan halaman offline.
- **Aset lokal:** stale-while-revalidate.
- **CDN library:** cache-first setelah pemuatan pertama.
- **Cloud/API Google/Firebase:** tidak di-cache.

---

## 📂 Struktur Direktori

```
RISLY-Money-Manager/
├── .github/
│   └── workflows/
│       └── static.yml          # Deploy otomatis ke GitHub Pages
├── css/
│   └── app.css                 # Styling utama, variabel CSS, media queries
├── icons/                      # Ikon PWA, favicon, Apple touch icon
├── js/
│   ├── app.js                  # Controller utama, router, event handler
│   ├── auth.js                 # PIN, hashing PBKDF2, sesi, lockout
│   ├── backup.js               # Backup lokal & Google Drive
│   ├── charts.js               # Konfigurasi Chart.js
│   ├── cloud.js                # Sinkronisasi JSONBin/Supabase/Firebase
│   ├── colors.js               # Helper warna & harmony
│   ├── config.js               # Konstanta, route, provider, versi
│   ├── data.js                 # Skema data, seed, migrasi
│   ├── export.js               # Export laporan Excel & PDF
│   ├── gdrive.js               # Google Identity Services & Drive REST
│   ├── google-auth-relay.js    # Login Google via Firebase Auth
│   ├── icons.js                # Library ikon SVG
│   ├── import.js               # Import CSV/Excel, preview, template
│   ├── pull-to-refresh.js      # Pull-to-refresh mobile
│   ├── store.js                # State management & query data
│   ├── ui.js                   # Modal, toast, badge, formatter
│   ├── utils.js                # Helper tanggal, angka, string
│   ├── forms/
│   │   ├── account.js          # Form akun
│   │   ├── cloud.js            # Form penyedia cloud
│   │   ├── note.js             # Form catatan/tugas
│   │   └── transaction.js      # Form transaksi
│   └── views/
│       ├── accounts.js         # Halaman akun
│       ├── auth.js             # Halaman login & PIN
│       ├── budgets.js          # Halaman anggaran
│       ├── calendar.js         # Halaman kalender
│       ├── categories.js       # Halaman kategori
│       ├── common.js           # Komponen bersama (baris transaksi, dll.)
│       ├── dashboard.js        # Halaman beranda
│       ├── goals.js            # Halaman target keuangan
│       ├── notes.js            # Halaman catatan & tugas
│       ├── recurring.js        # Halaman transaksi berulang
│       ├── reports.js          # Halaman laporan
│       ├── settings.js         # Halaman pengaturan
│       ├── shell.js            # Layout, sidebar, bottom nav
│       └── transactions.js     # Halaman transaksi & modal filter
├── firebase-security-rules.json # Rules Realtime Database
├── google1b0403dbd7b7bbff.html  # Verifikasi Google Search Console
├── index.html                  # Entry point aplikasi
├── manifest.json               # Manifest PWA
├── netlify.toml                # Konfigurasi deploy Netlify
├── oauth-callback.html         # Callback OAuth (iOS/PWA)
├── privacy.html                # Kebijakan privasi
├── SECURITY.md                 # Catatan keamanan
├── start.cmd                   # Server lokal untuk Windows
├── start.sh                    # Server lokal untuk macOS/Linux
├── sw.js                       # Service worker
└── _headers                    # Header keamanan & cache (Netlify/Cloudflare)
```

---

## 🚀 Menjalankan Secara Lokal

Karena aplikasi memakai **ES Modules**, file tidak bisa dibuka langsung dengan `file://`. Gunakan HTTP server lokal.

### 1. Clone repository

```bash
git clone https://github.com/rzkdmln/RISLY-Money-Manager.git
cd RISLY-Money-Manager
```

### 2. Jalankan server statis

**Windows**

```bat
start.cmd
```

**macOS / Linux**

```bash
./start.sh
```

**Manual dengan Python**

```bash
python -m http.server 8080 --bind 127.0.0.1
```

**Manual dengan Node.js**

```bash
npx serve .
```

### 3. Buka aplikasi

```
http://127.0.0.1:8080
```

> `http.server`/`serve` hanya menyajikan file statis, bukan backend. Port **8080** disarankan agar cocok dengan *Authorized JavaScript origins* Google OAuth saat pengembangan.

### Pertama kali membuka
1. Masuk dengan Google, atau buat PIN saat diminta.
2. Tambahkan akun (rekening/dompet) terlebih dahulu.
3. Mulai catat transaksi dari halaman **Transaksi** atau tombol tambah.
4. Atur anggaran, kategori, dan target sesuai kebutuhan.

---

## ⚙️ Konfigurasi

### Google OAuth & Drive

Konfigurasi publik ada di `js/config.js` (`APP.googleClientId`). Untuk memakai project Google milik sendiri:

1. Buat project di [Google Cloud Console](https://console.cloud.google.com/).
2. Aktifkan **Google Drive API**.
3. Atur **OAuth consent screen** (External + test users saat masih testing).
4. Buat **OAuth client ID** tipe **Web application**.
5. Daftarkan origin dan redirect URI:
   - `http://127.0.0.1:8080`
   - `http://localhost:8080`
   - `https://<domain-produksi-anda>`
   - `https://<domain-produksi-anda>/oauth-callback.html`
6. Ganti `APP.googleClientId` di `js/config.js`.

> **Client Secret tidak dipakai** dan tidak boleh disimpan di aplikasi browser. Cukup Client ID publik.

### Firebase

Konfigurasi Firebase ada di `js/config.js` (`FIREBASE_CONFIG`). Agar login Google dan sinkronisasi real-time berfungsi:

1. Aktifkan **Authentication → Sign-in method → Google**.
2. Aktifkan **Realtime Database**.
3. Publikasikan rules dari `firebase-security-rules.json`.
4. Daftarkan redirect Firebase di Google Cloud Console:
   `https://<project-id>.firebaseapp.com/__/auth/handler`.

Detail keamanan dan aturan database ada di [`SECURITY.md`](SECURITY.md).

### Sinkronisasi cloud opsional

Buka **Pengaturan → Sinkron cloud** dan pilih penyedia:

| Provider | Keterangan |
|---|---|
| Perangkat ini saja | Default, tanpa sinkronisasi |
| JSONBin | Setup cepat, cocok untuk 2 perangkat |
| Supabase REST | Database Postgres via REST |
| Firebase RTDB | Sinkronisasi real-time |

Kredensial cloud disimpan lokal di perangkat dan tidak dikirim ke server RISLY.

---

## 🌐 Deployment

RISLY adalah situs statis murni. Tidak ada build step.

### GitHub Pages

Workflow `.github/workflows/static.yml` otomatis men-deploy branch `main` ke GitHub Pages setiap kali ada push.

1. Buka **Settings → Pages**.
2. Pilih **GitHub Actions** sebagai source.
3. Push ke `main`.
4. Pastikan domain GitHub Pages ditambahkan ke Authorized origins/redirect URI Google OAuth.

### Netlify

`netlify.toml` sudah menyiapkan:

- Publish directory: `.` (root repo).
- Header keamanan: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- Cache control untuk `sw.js`, `index.html`, CSS, JS, dan ikon.

### Hosting statis lain

Deploy seluruh isi repo ke hosting statis apa pun (Cloudflare Pages, Vercel, dsb.). Pastikan:

- HTTPS aktif (wajib untuk service worker, Web Crypto, dan Google OAuth).
- `sw.js` disajikan dari root domain.
- Header keamanan dari `_headers` didukung atau direplikasi.

---

## 💾 Data, Backup & Privasi

### Penyimpanan lokal
- Data utama disimpan di `localStorage`, terpisah per workspace/ruang.
- **PIN hanya mengunci sesi aplikasi**; data lokal tidak dienkripsi.
- Jangan gunakan perangkat bersama tanpa PIN dan kunci otomatis.
- Kapasitas `localStorage` terbatas (umumnya 5–10 MB per origin). Lampiran struk dikompresi untuk menghemat ruang.

### Backup
- **Backup lokal:** buat file JSON dan simpan di perangkat lain.
- **Google Drive:** backup manual ke `appDataFolder` (maksimal 10 file terbaru).
- **Pemulihan:** dari file JSON atau dari daftar backup Google Drive.
- Disarankan backup rutin sebelum mengganti perangkat atau membersihkan data browser.

### Privasi
- Tidak ada server RISLY yang menyimpan data pengguna.
- Sinkronisasi cloud hanya aktif jika Anda mengonfigurasinya sendiri.
- Google Drive hanya dipakai untuk login dan backup manual; tidak ada sinkronisasi otomatis ke Google.
- Kebijakan privasi lengkap: [`privacy.html`](privacy.html).

---

## 🔄 Update & Cache PWA

Saat merilis perubahan:

1. Naikkan versi di **dua tempat**:
   - `js/config.js` → `APP.version`
   - `sw.js` → `const VERSION`
2. Deploy ulang.
3. Pengguna dapat memeriksa update lewat **Pengaturan → Periksa update**.

Service worker memakai strategi *stale-while-revalidate* untuk aset lokal. Jika perubahan belum terlihat setelah deploy, lakukan hard refresh atau tutup lalu buka kembali PWA.

---

## 🧪 Troubleshooting

**"RISLY sedang offline"**
Server statis tidak berjalan. Jalankan `start.cmd`/`start.sh`, lalu refresh. Jika PWA sudah ter-install dan pernah dibuka, aplikasi tetap bisa berjalan dari cache.

**Google login: Error 403 `access_denied`**
Aplikasi OAuth masih berstatus *Testing* dan akun belum terdaftar. Tambahkan akun ke **OAuth consent screen → Test users**, atau publish aplikasi.

**Google login: Error 400 `redirect_uri_mismatch`**
Redirect URI belum cocok. Tambahkan URL aplikasi dan `oauth-callback.html` persis tanpa garis miring di akhir, lalu tunggu beberapa menit.

**Google Drive API belum aktif**
Aktifkan **Google Drive API** di Google Cloud Console, tunggu ±2 menit, lalu coba lagi.

**Login Google berhasil tetapi data tidak muncul**
Pastikan akun Google tersebut sudah tertaut ke workspace yang benar. Gunakan **Pengaturan → Gabung ruang lain** dengan kode undangan bila perlu.

**Perubahan kode tidak terlihat**
Service worker masih menyajikan cache lama. Naikkan versi `sw.js`, hard refresh, atau unregister service worker dari DevTools.

**Pengingat tidak muncul di iOS**
Notifikasi PWA paling optimal saat aplikasi dipasang ke Home Screen dan diizinkan di pengaturan iOS.

---

## 🤝 Kontribusi

Kontribusi terbuka untuk perbaikan bug, peningkatan UI/UX, atau fitur baru.

1. Fork repository.
2. Buat branch fitur: `git checkout -b fitur/nama-fitur`.
3. Commit perubahan dengan pesan yang jelas.
4. Push dan buka Pull Request.
5. Jelaskan perubahan, langkah pengujian, dan screenshot bila relevan.

Mohon menjaga gaya kode yang sudah ada (Vanilla JS, template string, tanpa build step) dan tidak menambahkan secret/API key pribadi ke repository.

---

## 📄 Lisensi

Dirilis di bawah lisensi **MIT**. Anda bebas menggunakan, memodifikasi, dan mendistribusikan ulang dengan tetap menyertakan atribusi.

---

<p align="center">
  Dibuat untuk keuangan yang lebih rapi, tenang, dan terencana. 💙
</p>
