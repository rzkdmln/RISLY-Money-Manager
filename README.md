# 💰 RISLY Money Manager

![PWA Ready](https://img.shields.io/badge/PWA-Ready-brightgreen.svg)
![Architecture](https://img.shields.io/badge/Architecture-Vanilla_JS_SPA-blue.svg)
![License](https://img.shields.io/badge/License-MIT-orange.svg)

**RISLY Money Manager** adalah aplikasi pengelolaan keuangan pribadi dan keluarga berbasis *Progressive Web App* (PWA). Aplikasi ini dirancang agar cepat, ringan, dapat bekerja offline secara penuh (*offline-first*), serta mendukung login Google dan backup/pemulihan manual ke Google Drive.

---

## 📸 Fitur Utama

- **Buku Kas & Manajemen Transaksi:** Catat pemasukan, pengeluaran, dan transfer antar akun dengan dukungan multi-kategori serta pencatatan sub-kategori.
- **Split Transaksi & Lampiran Struk:** Pecah satu transaksi ke beberapa kategori sekaligus dan simpan foto struk sebagai bukti.
- **Dukungan Multi-Akun & Kategori Custom:** Kelola rekening bank, dompet digital (e-wallet), maupun uang tunai secara fleksibel.
- **Anggaran & Target Keuangan:** Set batas anggaran bulanan per kategori dan pantau batas aman konsumsi.
- **Transaksi Berulang & Pengingat (Reminders):** Jadwalkan tagihan rutin harian, bulanan, atau tahunan.
- **Laporan & Visualisasi Grafis:** Laporan arus kas harian/bulanan dengan visualisasi diagram interaktif.
- **PWA & Offline-First Mode:** Dapatkan pengalaman seperti aplikasi native di Android & iOS (dapat di-install ke Home Screen) dengan kapabilitas luring penuh.
- **Awan / Cloud Sync (opsional):** Sinkronisasi data antar perangkat lewat JSONBin, Supabase, atau Firebase bagi yang membutuhkannya.
- **Ruang Keluarga Bersama:** Satu household Firebase bisa dipakai beberapa akun Google lewat kode undangan; transaksi dan anggota tergabung otomatis.
- **Google Drive:** Masuk dengan akun Google di halaman depan, lalu backup/pemulihan manual ke Drive pribadi. Tidak ada sinkron otomatis ke Google.

---

## 🏗️ Arsitektur Sistem

RISLY dikembangkan tanpa dependensi *framework* eksternal yang berat (seperti React atau Vue) untuk memastikan performa loading yang instan, footprint memori yang minim, dan maintainability yang tinggi.

```
                  ┌─────────────────────────────────────────┐
                  │               index.html                │
                  └────────────────────┬────────────────────┘
                                       │
                                 ┌─────▼─────┐
                                 │   app.js  │ (Main Controller / Event Bus)
                                 └─────┬─────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         │                             │                             │
   ┌─────▼─────┐                 ┌─────▼─────┐                 ┌─────▼─────┐
   │  store.js │ (State)         │  views/   │ (UI Templates)  │  cloud.js │ (Sync Engine)
   └─────┬─────┘                 └─────┬─────┘                 └─────┬─────┘
         │                             │                             │
   ┌─────▼─────┐                 ┌─────▼─────┐                 ┌─────▼─────┐
   │ IndexedDB │ (Local DB)      │ DOM Render│                 │ Remote DB │
   └───────────┘                 └───────────┘                 └───────────┘
```

### 1. Pola Desain (Architecture Pattern)
Aplikasi ini menerapkan variasi dari pola **MVC / Pub-Sub Hybrid**:
- **Store / State Manager (`js/store.js` & `js/data.js`):** Mengelola *single source of truth* data aplikasi secara terpusat di memori lokal dan *IndexedDB / LocalStorage*.
- **Controller / Router (`js/app.js`):** Menangani *routing* halaman, mengontrol alur eksekusi aplikasi (*bootstrapping*), serta menangani *event-driven action* (`handleAction`).
- **View Renderers (`js/views/`):** Bertanggung jawab meng-generate template HTML berbasis *String Literals* secara komponensial yang dinamis dan efisien.

### 2. PWA Layer (`sw.js` & `manifest.json`)
- **Service Worker (`sw.js`):** Menangani strategi *caching* aset statis (HTML, CSS, JS, Icons) sehingga aplikasi dapat memuat secara instan walaupun tanpa koneksi internet.

---

## 📂 Struktur Direktori Proyek

```
RISLY-Money-Manager/
├── css/
│   └── app.css               # Modul styling utama, variabel CSS & Media Queries
├── icons/                    # Aset ikon PWA (Apple touch icon, favicon, & PWA masks)
├── js/
│   ├── app.js                # Controller utama, router, dan inisialisasi aplikasi
│   ├── auth.js               # Logika autentikasi & pengelolaan sesi pengguna
│   ├── charts.js             # Modul pembuatan visualisasi grafik
│   ├── cloud.js              # Mesin sinkron opsional (JSONBin, Supabase, Firebase)
│   ├── config.js             # Konfigurasi konstanta global aplikasi
│   ├── data.js               # Pengelolaan skema data dasar & migrasi
│   ├── gdrive.js             # Google Sign-In & Google Drive (OAuth + REST, backup manual)
│   ├── google-auth-relay.js   # Relay login Google untuk PWA iOS (callback lintas Safari)
│   ├── icons.js              # Komponen pustaka ikon SVG dinamis
│   ├── store.js              # State management & pemrosesan query data
│   ├── ui.js                 # Helper UI (Modal, Toast, Money Formatter)
│   ├── utils.js              # Helper fungsi matematika, tanggal, & string
│   ├── forms/                # Form renderers & input handlers
│   │   ├── account.js        # Form tambah/edit akun
│   │   ├── cloud.js          # Field penyedia sinkron (JSONBin, Supabase, Firebase)
│   │   ├── note.js           # Form catatan keuangan
│   │   └── transaction.js    # Form input transaksi
│   └── views/                # Halaman-halaman UI (Templates)
│       ├── accounts.js       # Halaman manajemen rekening
│       ├── auth.js           # Halaman login / registrasi
│       ├── budgets.js        # Halaman anggaran
│       ├── calendar.js       # Halaman kalender keuangan
│       ├── categories.js     # Halaman kategori & sub-kategori
│       ├── common.js         # Komponen UI bersama (Row tx, header)
│       ├── dashboard.js      # Halaman ringkasan/dashboard
│       ├── notes.js          # Halaman catatan
│       ├── recurring.js      # Halaman transaksi berulang
│       ├── reports.js        # Halaman analisis & laporan
│       ├── settings.js       # Halaman pengaturan aplikasi
│       ├── shell.js          # Main layout container & navigasi
│       └── transactions.js   # Halaman daftar & filter transaksi
├── index.html                # Entry point HTML utama
├── manifest.json             # Manifest Web App untuk installability PWA
├── netlify.toml              # Konfigurasi deployment Netlify
├── oauth-callback.html       # Halaman callback OAuth untuk PWA iOS (dibuka di jendela Safari)
└── sw.js                     # Service worker untuk dukungan offline & cache PWA
```

---

## 🛠️ Panduan Instalasi & Pengembangan

Karena aplikasi dibangun menggunakan **Pure Web Standards (Vanilla JavaScript ES Modules)**, Anda tidak memerlukan proses *compilation* atau *build step* yang rumit (seperti Webpack atau Vite).

### Langkah Jalankan di Lokal:

1. **Clone repository ini:**
   ```bash
   git clone https://github.com/username/RISLY-Money-Manager.git
   cd RISLY-Money-Manager
   ```

2. **Jalankan HTTP Server Lokal:**
   Karena menggunakan *ES Modules* (`import`/`export`), file tidak bisa dibuka langsung melalui protokol `file://`. Gunakan HTTP server lokal sederhana:

   - **Windows (paling mudah):** klik dua kali **`start.cmd`** — server langsung jalan dan browser terbuka.
   - **macOS / Linux:** jalankan `./start.sh`.
   - **Menggunakan Live Server (VS Code Extension):** Klik kanan pada `index.html` -> *Open with Live Server*.
   - **Menggunakan Python:**
     ```bash
     python3 -m http.server 8080
     ```
   - **Menggunakan Node.js (`npx`):**
     ```bash
     npx serve .
     ```

3. Akses aplikasi melalui browser di `http://localhost:8080`.

> **Catatan:** `http.server` di atas **bukan backend** — ia hanya menyajikan file statis karena browser memblokir ES Modules dari `file://`. Setelah terbuka sekali, aplikasi bisa dipakai offline lewat service worker. Jika muncul tulisan **"RISLY sedang offline"**, artinya server statisnya sedang tidak berjalan: jalankan `start.cmd` lagi lalu refresh.

---

## 🔐 Login Google & Backup Drive

Google Drive dipakai **hanya untuk login dan backup/pemulihan manual**. Aplikasi tidak menyinkronkan data ke Google setiap saat — data utama tetap tersimpan lokal di perangkat (offline-first).

### Yang perlu disiapkan (sekali saja)

1. Buka [Google Cloud Console](https://console.cloud.google.com/) → buat project baru.
2. **APIs & Services → Library** → aktifkan **Google Drive API**.
3. **APIs & Services → OAuth consent screen** → pilih *External*, isi nama aplikasi, lalu tambahkan diri Anda sebagai *test user*.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - *Authorized JavaScript origins*: `http://localhost:8080` (lokal) dan domain produksi Anda (mis. `https://risly.pages.dev`)
   - *Authorized redirect URIs*: `http://localhost:8080/oauth-callback.html` dan `https://risly.pages.dev/oauth-callback.html` (sesuaikan dengan domain produksi)
5. Salin **Client ID** (`…apps.googleusercontent.com`).

> **Penting untuk iPhone:** PWA yang dipasang di Home Screen memakai penyimpanan terpisah dari Safari. Karena itu login Google di iOS memakai halaman `oauth-callback.html` dan relay kecil, bukan popup biasa. Tanpa *Authorized redirect URI* di atas, Google akan menampilkan **Error 400: redirect_uri_mismatch** dan login tidak akan selesai.

### Menautkan akun Google (sekali per anggota)

1. Masuk aplikasi dengan PIN.
2. Buka **Pengaturan → kartu Google → Masuk dengan Google**.
3. Klik **Tautkan akun Google ini**.
4. Ulangi untuk anggota lain dengan Gmail masing-masing. Setelah tertaut, tombol **Masuk dengan Google** di halaman depan langsung membuka aplikasi tanpa PIN.

### Login di halaman depan

- Tombol **Masuk dengan Google** mencocokkan email Google dengan profil yang sudah tertaut.
- Jika akun belum tertaut, masukkan PIN sekali; akun Google otomatis ditautkan ke profil yang dipakai.
- PIN tetap menjadi cadangan saat offline atau jika Google tidak tersedia.
- **iPhone / PWA Home Screen:** jendela Google terbuka sebagai lembar Safari. Setelah memilih akun, kembali ke aplikasi RISLY — hasil login diambil otomatis lewat relay. Jika aplikasi sempat ditutup, buka lagi dan proses akan dilanjutkan.

### Backup & pemulihan (manual)

- **Backup sekarang** — membuat berkas `risly-backup-YYYY-MM-DD-HHmmss.json` di folder tersembunyi aplikasi (`appDataFolder`). Maksimal 10 backup terbaru disimpan; yang lebih lama dihapus otomatis.
- **Pulihkan** — menampilkan daftar backup untuk dipilih. Data lokal saat ini akan diganti.
- **Perangkat baru** — di halaman awal pilih **Masuk & pulihkan dari Google Drive**, pilih backup, lalu masuk. Jika akun Google itu tertaut di dalam backup, aplikasi langsung terbuka.

### Batasan yang perlu diketahui

- Token akses Google berlaku ±1 jam. Aplikasi mencoba memperbarui token secara senyap; jika Google meminta konfirmasi ulang, klik **Masuk dengan Google** sekali lagi.
- **Tidak ada sinkron otomatis ke Google.** Backup hanya dibuat saat Anda menekan tombol backup.
- Login Google membuka aplikasi tanpa PIN, jadi amankan akun Google di perangkat ini.
- JSONBin, Supabase, dan Firebase tetap tersedia sebagai sinkron opsional di **Pengaturan → Sinkron cloud lain**.

### Troubleshooting

**Error 403: access_denied** — aplikasi OAuth masih berstatus *Testing* dan akun Google yang dipakai belum terdaftar sebagai penguji. Buka **OAuth consent screen → Test users → Add users**, masukkan alamat Gmail yang dipakai, lalu coba lagi. Alternatifnya klik **Publish app** (scope `drive.appdata`, `openid`, `email`, `profile` tergolong non-sensitif sehingga umumnya tidak butuh verifikasi).

**Error 400: redirect_uri_mismatch** — URL `oauth-callback.html` belum didaftarkan. Buka **Credentials → OAuth client → Authorized redirect URIs**, tambahkan `https://<domain-anda>/oauth-callback.html` persis seperti yang dipakai aplikasi (tanpa garis miring di akhir), simpan, tunggu ±5 menit.

**Google Drive API belum diaktifkan** — pesan seperti *"Google Drive API has not been used in project … before or it is disabled"* berarti API-nya belum dinyalakan. Buka **APIs & Services → Library → Google Drive API → Enable** (atau [tautan langsung](https://console.developers.google.com/apis/api/drive.googleapis.com/overview)), tunggu ±2 menit, lalu coba lagi.

**Client ID vs Client Secret** — Client ID memang publik dan aman disimpan di kode (`APP.googleClientId`). **Client Secret tidak boleh dipakai** di aplikasi browser mana pun karena bisa dibaca siapa saja; alur Google Identity Services tidak membutuhkannya. Jika secret sudah pernah tersebar, reset lewat **Credentials → OAuth client → Reset secret**.

---

## 📱 Panduan PWA & Catatan Browser

- **Android (Chrome/Edge):** Klik opsi menu browser lalu pilih **"Tambahkan ke Layar Utama" / "Install Application"**.
- **iOS (Safari):** Klik tombol **Share** di Safari lalu pilih **"Add to Home Screen"**.
  
> **Catatan Notifikasi iOS:** Sesuai kebijakan sistem operasi iOS, pengingat lokal dan push notification pada PWA berjalan paling optimal saat PWA dipasang di Home Screen dan aplikasi berada dalam kondisi aktif/background.

---

## 📄 Lisensi

Distributed under the MIT License. See `LICENSE` for more information.
```

EOF

---

### Ringkasan File
File `README.md` di atas telah disiapkan mencakup:
1. **Fitur Utama:** Penjelasan menyeluruh modul keuangan yang ada pada aplikasi.
2. **Arsitektur Sistem:** Penjelasan pola Vanilla JS SPA + Store Management + Service Worker PWA beserta diagram arsitekturnya.
3. **Struktur Direktori:** Pemetaan terperinci seluruh file proyek di folder `css/`, `js/`, `js/forms/`, dan `js/views/`.
4. **Panduan Instalasi:** Cara menjalankan aplikasi secara lokal dan tips penggunaan PWA di iOS & Android.
