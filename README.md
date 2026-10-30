# 💰 RISLY Money Manager

![PWA Ready](https://img.shields.io/badge/PWA-Ready-brightgreen.svg)
![Architecture](https://img.shields.io/badge/Architecture-Vanilla_JS_SPA-blue.svg)
![License](https://img.shields.io/badge/License-MIT-orange.svg)

**RISLY Money Manager** adalah aplikasi pengelolaan keuangan pribadi dan keluarga berbasis *Progressive Web App* (PWA). Aplikasi ini dirancang agar cepat, ringan, dapat bekerja offline secara penuh (*offline-first*), serta mendukung sinkronisasi cloud terenkripsi untuk kolaborasi keuangan antar anggota keluarga.

---

## 📸 Fitur Utama

- **Buku Kas & Manajemen Transaksi:** Catat pemasukan, pengeluaran, dan transfer antar akun dengan dukungan multi-kategori serta pencatatan sub-kategori.
- **Dukungan Multi-Akun & Kategori Custom:** Kelola rekening bank, dompet digital (e-wallet), maupun uang tunai secara fleksibel.
- **Anggaran & Target Keuangan:** Set batas anggaran bulanan per kategori dan pantau batas aman konsumsi.
- **Transaksi Berulang & Pengingat (Reminders):** Jadwalkan tagihan rutin harian, bulanan, atau tahunan.
- **Laporan & Visualisasi Grafis:** Laporan arus kas harian/bulanan dengan visualisasi diagram interaktif.
- **PWA & Offline-First Mode:** Dapatkan pengalaman seperti aplikasi native di Android & iOS (dapat di-install ke Home Screen) dengan kapabilitas luring penuh.
- **Awan / Cloud Sync:** Sinkronisasi data real-time berbasis enkripsi antar perangkat keluarga.

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
│   ├── cloud.js              # Mesin sinkronisasi data cloud
│   ├── config.js             # Konfigurasi konstanta global aplikasi
│   ├── data.js               # Pengelolaan skema data dasar & migrasi
│   ├── icons.js              # Komponen pustaka ikon SVG dinamis
│   ├── store.js              # State management & pemrosesan query data
│   ├── ui.js                 # Helper UI (Modal, Toast, Money Formatter)
│   ├── utils.js              # Helper fungsi matematika, tanggal, & string
│   ├── forms/                # Form renderers & input handlers
│   │   ├── account.js        # Form tambah/edit akun
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
