# Permata POS — Frontend

Frontend statis (HTML/CSS/JS murni, tanpa framework) untuk **Permata POS**, sistem manajemen
Toko Emas & Perak Permata Nabire. Dihosting di GitHub Pages, berkomunikasi dengan backend
Google Apps Script lewat REST API (fetch + JSON).

## Struktur
```
index.html          ← struktur halaman (login, dashboard, kasir, stok, dst.)
css/style.css        ← tema "Haute Joaillerie Dark Slate & Gold"
js/config.js         ← URL backend GAS (WAJIB diisi sebelum dipakai!)
js/api.js            ← helper fetch() + penyimpanan sesi
js/app.js            ← seluruh logika aplikasi (routing, kamera, GPS, grafik, dll.)
```

## Sebelum dipakai
1. Deploy backend `Kode.gs` di Google Apps Script sebagai Web App (lihat
   `PANDUAN_INSTALASI.md`).
2. Buka `js/config.js`, ganti `GAS_URL` dengan URL `.../exec` hasil deploy.
3. Deploy folder ini ke GitHub Pages (lihat `PANDUAN_INSTALASI.md` Bagian 2).

## Fitur
Kasir (tunai/transfer), stok etalase, kas laci, saldo brankas, rekening bank, absensi
selfie+GPS, izin/cuti, persetujuan dua arah (Owner/Karyawan), tugas, piutang/hutang,
pinjaman, laporan & grafik, kelola karyawan, backup JSON.
