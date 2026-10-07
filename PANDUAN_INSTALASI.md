# 📋 Panduan Migrasi — Permata POS
### Arsitektur Baru: Backend GAS (REST API) + Frontend GitHub Pages

---

## Apa yang berubah dari versi sebelumnya?

| | Versi Lama | Versi Baru (ini) |
|---|---|---|
| Backend | `Kode.gs` + `Index.html` + `Stylesheet.html` + `JavaScript.html` (HtmlService, 1 proyek) | **`Kode.gs` saja** (ContentService/JSON, REST API murni) |
| Frontend | Dirender GAS, dibuka lewat URL `script.google.com/.../exec` | File statis (`index.html`, `css/`, `js/`) dihosting **GitHub Pages**, URL sendiri (`username.github.io/nama-repo`) |
| Komunikasi | `google.script.run` | `fetch()` ke URL `/exec` backend, format JSON |
| Kelebihan | Satu tempat, simpel | Tampilan lebih cepat, tidak kena sandbox iframe GAS (kamera/GPS lebih stabil), URL sendiri yang bisa dipakai custom domain, dan tampilan bisa diubah tanpa deploy ulang backend |

Semua fitur dan logika bisnis **sama persis** — hanya cara komunikasi frontend↔backend yang
berubah. Database (Google Sheets) dan folder Drive tidak berubah sama sekali.

---

## BAGIAN 1 — DEPLOY BACKEND (Google Apps Script)

### 1.1 Buat proyek Apps Script
1. Buka https://script.google.com → **Proyek Baru**.
2. Hapus isi `Code.gs` bawaan, ganti nama file menjadi `Kode` (tetap tipe Script `.gs`).
3. Salin seluruh isi `Kode.gs` dari paket yang diberikan (file ini disajikan terpisah di
   chat, bukan di dalam ZIP frontend).

> ⚠️ Proyek backend kali ini **HANYA butuh 1 file** (`Kode.gs`) — tidak perlu lagi
> `Index.html`, `Stylesheet.html`, `JavaScript.html` seperti versi sebelumnya.

### 1.2 Jalankan Setup Otomatis
1. Pilih fungsi **`setupAppEnvironment`** di dropdown toolbar → klik **Run**.
2. Setujui izin akses (Advanced → Buka [tidak aman] → Izinkan).
3. Cek **Execution log** untuk link Spreadsheet & Folder Drive yang dibuat otomatis.
4. Login awal: **username `owner`, password `permata123`** — segera ganti setelah login
   pertama (lihat Bagian 3 panduan lama soal cara ganti password).

### 1.3 Deploy sebagai Web App
1. **Deploy → New deployment** → tipe **Web app**.
2. **Execute as**: Me. **Who has access**: **Anyone**.
3. Klik **Deploy**, salin URL `.../exec`.
4. **Tes langsung di browser**: tempel URL itu di tab baru. Harus muncul teks JSON seperti:
   ```json
   {"success":true,"message":"Permata POS API aktif.","version":"2.0-REST","waktuServer":"..."}
   ```
   Kalau muncul ini, backend sudah siap. Kalau muncul halaman error/kosong, cek lagi
   langkah 1.1–1.2.

> ⚠️ **Sama seperti sebelumnya**: setiap kali mengubah `Kode.gs`, WAJIB
> **Deploy → Manage deployments → ✏️ → New version → Deploy** — bukan cuma Save — supaya
> frontend yang sudah online ikut mendapat versi terbaru.

### 1.4 Atur Data Toko
Setelah frontend online (Bagian 2), login sebagai Owner → menu **Pengaturan Toko**, isi
koordinat lokasi, radius absensi, jam kerja, saldo awal kas — persis seperti panduan
sebelumnya.

---

## BAGIAN 2 — DEPLOY FRONTEND KE GITHUB PAGES

### 2.1 Isi URL backend SEBELUM upload
1. Ekstrak ZIP frontend yang diberikan.
2. Buka `js/config.js` dengan Notepad/text editor.
3. Ganti baris:
   ```js
   const GAS_URL = 'TEMPEL_URL_WEB_APP_GAS_DI_SINI';
   ```
   menjadi URL `.../exec` dari Bagian 1.3, contoh:
   ```js
   const GAS_URL = 'https://script.google.com/macros/s/AKfycb.../exec';
   ```
4. Simpan file.

### 2.2 Verifikasi struktur folder SEBELUM `git init`
Folder hasil ekstraksi ZIP **adalah** folder proyek — jangan masuk lebih dalam, jangan buat
folder pembungkus baru. Buka folder itu di terminal (PowerShell/Terminal), lalu:
```bash
dir
```
(atau `ls -la` di Mac/Linux/Git Bash). Harus terlihat:
```
index.html
README.md
PANDUAN_INSTALASI.md
css/
js/
```
**`index.html` harus ada di baris teratas** — ini folder yang benar untuk `git init`.

### 2.3 Install Git (kalau belum ada)
- **Windows**: `https://git-scm.com/download/win`, install default, buka PowerShell/Git Bash.
- **Mac**: buka Terminal, ketik `git --version` (akan ditawari install otomatis kalau belum ada).
- **Linux**: `sudo apt install git`.

Verifikasi:
```bash
git --version
```

### 2.4 Buat akun & repository GitHub
1. Daftar di `https://github.com` kalau belum punya akun (username akan jadi bagian URL
   situs: `username.github.io`).
2. Tombol **+** → **New repository** → beri nama (misal `permata-pos`) → pilih **Public**
   → **JANGAN** centang README/.gitignore/license → **Create repository**.

### 2.5 Push pertama kali
Dari folder proyek (yang sudah diverifikasi di 2.2), jalankan **satu per satu**:

```bash
git init
git add .
git commit -m "Upload pertama - Permata POS"
git branch -M main
git remote add origin https://github.com/USERNAME/permata-pos.git
git push -u origin main
```
(Ganti `USERNAME` dengan username GitHub Anda.)

Saat diminta Username/Password: **Password akun GitHub biasa TIDAK diterima** — gunakan
**Personal Access Token**:
1. Buka `https://github.com/settings/tokens` → **Generate new token (classic)**.
2. Centang scope **repo** → **Generate token** → salin (`ghp_...`), tampil hanya sekali.
3. Paste token itu sebagai "password" saat `git push` meminta.

### 2.6 Aktifkan GitHub Pages
1. Buka repo di github.com → **Settings** → **Pages** (sidebar kiri).
2. **Source**: Deploy from a branch. **Branch**: `main` / `(root)`. ✅ **Enforce HTTPS**.
3. **Save**. Tunggu 1-2 menit — situs aktif di `https://USERNAME.github.io/permata-pos/`.

> ⚠️ **HTTPS wajib aktif** untuk fitur kamera & GPS absensi — tanpa HTTPS, browser
> memblokir kedua fitur ini.

### 2.7 Uji aplikasi
Buka URL GitHub Pages. Login dengan `owner` / `permata123`. Kalau data tidak muncul atau ada
error, buka Console browser (F12) — pesan error dari `callApi()` akan menjelaskan sebabnya
(lihat Bagian 3 Troubleshooting).

### 2.8 Update selanjutnya
Setiap ada perubahan file frontend:
```bash
git add .
git commit -m "Deskripsi perubahan"
git push
```
Tunggu 1-2 menit, hard refresh (`Ctrl+Shift+R`) di browser.

---

## BAGIAN 3 — TROUBLESHOOTING

| Gejala | Penyebab | Solusi |
|---|---|---|
| Situs GitHub Pages blank/404 | `index.html` tidak di root repo | Buka repo di browser, pastikan `index.html` terlihat di root. Kalau terkubur di subfolder, `git init` dijalankan di folder yang salah — ulangi dari folder yang benar |
| Tampil tapi tanpa gaya (polos) | Folder `css/`/`js/` rata di root / tidak ikut ter-push | Cek repo GitHub: harus ada folder `css/` dan `js/`, bukan file lepas |
| "GAS_URL belum diisi..." | Lupa edit `js/config.js` | Edit, isi URL `/exec`, commit & push ulang |
| Login gagal / semua data gagal dimuat, toast "Gagal terhubung ke server" | URL backend salah, atau backend belum di-deploy ulang (New deployment) | Tes URL backend langsung di browser (harus muncul JSON `"success":true`). Kalau baru ubah `Kode.gs`, ingat New deployment |
| Kamera tidak aktif | Browser blokir getUserMedia otomatis, atau situs belum HTTPS | Tekan tombol "Aktifkan Kamera" manual; pastikan Enforce HTTPS sudah aktif di GitHub Pages |
| Transaksi/stok/dll. tidak muncul setelah ditambah | Error spesifik — lihat toast merah yang muncul otomatis, atau buka Console (F12) | Pesan error akan menjelaskan sebab pastinya (sesi habis, sheet tidak ditemukan, dll.) |
| `Password authentication is not supported` saat git push | GitHub menolak password biasa | Buat Personal Access Token (Bagian 2.5), gunakan sebagai password |
| Situs tampil versi lama setelah push | Cache browser | `Ctrl+Shift+R` atau buka Incognito |

---

## BAGIAN 4 — PENGUJIAN SEBELUM PAKAI PENUH
Sama seperti sebelumnya — ulangi seluruh skenario di PRD (transaksi tunai/transfer, batal
dengan approval, tutup kas, absensi dalam/luar radius, dll.) di lingkungan GitHub Pages yang
baru, pastikan semua berjalan sama seperti versi GAS HtmlService sebelum migrasi dipakai
untuk operasional harian. Jalankan paralel dengan sistem lama (atau buku manual) selama
beberapa hari sebelum beralih penuh.
