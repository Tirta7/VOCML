# Panduan Prompt AI untuk Integrasi VOC ML

File ini berisi **"Prompt Sakti"** yang bisa Anda *copy-paste* untuk diberikan kepada AI (seperti Gemini, ChatGPT, Claude, dll) saat Anda membuat aplikasi Node.js/Express baru dan ingin mengamankannya dengan sistem lisensi VOC ML.

## Yang Perlu Anda Persiapkan
Sebelum memberikan prompt ke AI, pastikan Anda menyiapkan 3 hal berikut:
1. File `vocml-client.js` (ada di folder `client-sdk` ini).
2. File `get-machine-id.ps1` (ada di folder `client-sdk` ini).
3. **Public Key** unik milik server VOC ML Anda (yang diawali dengan `-----BEGIN PUBLIC KEY-----`).

---

## Teks Prompt untuk AI
*Silakan copy teks di dalam kotak di bawah ini dan ubah bagian yang ada di dalam kurung siku `[...]`:*

```text
Tolong bantu saya memasang sistem lisensi pengunci aplikasi (VOC ML) ke dalam aplikasi Node.js/Express saya. Aplikasi ini bernama [SEBUTKAN NAMA APLIKASI, misal: Aplikasi Laundry]. 

Buatkan sistem penguncinya dengan kriteria berikut:

1. Saya punya SDK lisensi berupa file `vocml-client.js` dan `get-machine-id.ps1`. Tolong asumsikan file ini akan saya letakkan di dalam root folder server aplikasi saya.
2. Buatkan file middleware bernama `license.mjs` yang menjalankan fungsi `checkLicense` dari `vocml-client.js` secara otomatis saat server dinyalakan.
3. Gunakan URL server lisensi: `http://localhost:8080` (ganti dengan domain asli VOC ML jika nanti sudah dionlinekan).
4. Isi parameter lisensi dengan: 
   - `product`: '[NAMA PRODUK, misal: laundry]'
   - `storeName`: '[NAMA TOKO KLIEN]'
   - `publicKeyPem`: '[PASTE PUBLIC KEY VOC ML ANDA DI SINI]'
5. Logika Smart Polling: Jika lisensi diizinkan, atur timer untuk cek ulang setiap 3 jam. Jika lisensi ditolak/terkunci, atur timer untuk cek ulang setiap 2 detik agar pembukaan lisensi setelah pembayaran QRIS berjalan cepat tanpa delay lama.
6. Jika status lisensi terkunci, blokir semua akses ke rute aplikasi (kirim HTTP 403) dan tampilkan halaman HTML berwarna merah peringatan "Aplikasi Terkunci". Tampilkan juga informasi Status, Alasan, Machine ID, dan tagihan QRIS dinamis di HTML tersebut.
7. Di dalam halaman HTML merah tersebut:
   - Pasang script JavaScript yang otomatis mengecek status ke server lisensi setiap 2 detik.
   - Tambahkan tombol interaktif berwarna hijau: "✅ Saya Sudah Bayar (Buka Sekarang)" yang jika diklik pembeli, browser langsung mengecek ke server lisensi seketika itu juga (0 milidetik) tanpa menunggu interval timer, dan jika sudah aktif langsung me-reload halaman utama.
   - Tambahkan Form Input Kode Voucher: Pengguna bisa mengetik kode voucher promo (misal: `COBAGRATIS` atau `DISKON20K`) lalu klik "Gunakan Voucher", yang memanggil API VOC ML `POST /api/v1/voucher/claim` dengan payload `{ machine_id, product, code }`. Jika voucher berhasil, halaman langsung terbuka seketika!
8. Fitur Kuota Gratis Trial (10x Kirim Pesan):
   - Server VOC ML otomatis memberikan kuota gratis (cth: 10x) untuk pengguna baru PesanRahasia.
   - Di endpoint pembuatan pesan rahasia, panggil API VOC ML: `POST /api/v1/trial/consume` dengan payload `{ machine_id, product: 'messagerahasia' }`.
   - Jika status masih dalam kuota trial, respon mengizinkan pengiriman pesan dan menampilkan sisa kuota (`trial.remaining`). Begitu kuota 10x habis, server otomatis mengunci aplikasi dan menampilkan layar QRIS!
9. Tunjukkan cara meng-import dan memasang middleware `license.mjs` ini ke file utama server aplikasi saya (misalnya `server.js` atau `app.js`).
```
