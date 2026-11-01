# Panduan & Master Prompt Integrasi Universal VOC ML
Dokumen ini dirancang sebagai **Master Prompt** yang siap Anda *copy-paste* ke AI asisten coding (Claude, ChatGPT, Gemini, Cursor, dll) saat membangun atau memperbarui aplikasi apa pun (**Aplikasi Billiard, Kasir POS, PesanRahasia, Laundry, dll**).

---

## 📋 DAFTAR PRODUK RESMI DI VOC ML
Pilih salah satu kode produk yang sesuai:
* `billiard` : Aplikasi Billiard & Rental Meja
* `pos` : Aplikasi Kasir Toko / POS Retail
* `messagerahasia` : Aplikasi PesanRahasia (E2EE)

---

# 🚀 MASTER PROMPT UNTUK AI PENGEMBANG APLIKASI
*(Copy seluruh teks di dalam kotak di bawah ini dan berikan langsung kepada AI Anda)*

```text
Halo AI, tolong bantu saya mengintegrasikan sistem keamanan lisensi, auto-billing QRIS, kode voucher promo, dan kuota trial menggunakan server VOC ML ke dalam aplikasi saya.

Detail Konfigurasi Server Lisensi:
=======================================================
- URL Server VOC ML : https://vocml.vocpos.id
- Nama Aplikasi     : [GANTI: misal Aplikasi Kasir POS / Aplikasi Billiard / PesanRahasia]
- Kode Produk       : [GANTI: 'pos' ATAU 'billiard' ATAU 'messagerahasia']
- Nama Toko Klien   : [GANTI: misal 'Nama Toko Klien' atau dari setting DB]
- ID Identitas (MID): Hardware Machine ID (dari CPU/Motherboard) ATAU ID Akun Pengguna (GMAIL-XXXX)

Tolong buatkan modul integrasi lengkap (`vocml-license.js` / middleware) dan tampilan antarmuka Layar Terkunci (Lock Screen) dengan spesifikasi 8 pilar berikut:

=======================================================
1. PENDAFTARAN & STARTUP IDENTITAS OTOMATIS
=======================================================
Saat aplikasi dinyalakan pertama kali:
- Kirim request POST ke https://vocml.vocpos.id/api/v1/register
  Header: Content-Type: application/json
  Body:
  {
    "machine_id": "{machine_id}",
    "product": "{product}",
    "store_name": "{store_name}",
    "app_version": "1.0.0"
  }
- Simpan respon status awal akun ke cache/memory aplikasi.

=======================================================
2. LOGIKA KONTROL AKSES & STATUS LISENSI (/api/v1/check)
=======================================================
Panggil: GET https://vocml.vocpos.id/api/v1/check?machine_id={machine_id}&product={product}

Respon Server VOC ML:
{
  "allowed": true | false,
  "status": "active" | "expiring" | "trial" | "expired" | "locked" | "pending",
  "expires_at": "YYYY-MM-DD",
  "remaining_days": 30,
  "unique_code": 321,
  "trial": {
    "enabled": true,
    "quota": 10,
    "used": 2,
    "remaining": 8,
    "is_trial": true
  },
  "billing": { ... }
}

Aturan Izin Akses:
- Akses DIIZINKAN (`allowed: true`) jika status adalah: 'active', 'expiring', atau 'trial'.
- Akses DIBLOKIR / DIKUNCI (`allowed: false`) jika status adalah: 'expired', 'locked', atau 'pending'.
  Jika diblokir, cegah penggunaan fitur utama dan tampilkan Layar Terkunci (Lock Screen QRIS).

=======================================================
3. KUOTA GRATIS TRIAL PENGGUNA BARU (/api/v1/trial/consume)
=======================================================
Jika akun berstatus 'trial' (misal: Kasir POS dapat trial 30 transaksi pertama, atau PesanRahasia dapat trial 10x kirim pesan):
- Setiap kali aksi kuota dijalankan (cth: simpan transaksi struk baru / kirim pesan rahasia), panggil:
  POST https://vocml.vocpos.id/api/v1/trial/consume
  Body: { "machine_id": "{machine_id}", "product": "{product}" }
  
- Jika HTTP 200 OK: lanjutkan proses transaksi dan perbarui sisa kuota (`trial.remaining`).
- Jika HTTP 403 Forbidden (Kuota Habis): hentikan proses, tampilkan pesan "Masa gratis trial Anda telah habis", dan buka Layar Terkunci QRIS.
- Catatan: Jika lisensi berbayar sudah aktif (`active`), endpoint ini otomatis lolos tanpa memotong kuota.

=======================================================
4. FORM KLAIM KODE VOUCHER PROMO (/api/v1/voucher/claim)
=======================================================
Pada Layar Terkunci (Lock Screen), sediakan input kode voucher promo:
- Input: "Masukkan Kode Voucher (cth: COBAGRATIS / DISKON20K)"
- Tombol: "Gunakan Voucher"
- Saat diklik, kirim:
  POST https://vocml.vocpos.id/api/v1/voucher/claim
  Body: { "machine_id": "{machine_id}", "product": "{product}", "code": "KODE_DARI_INPUT" }
  
- Penanganan Respon:
  * Jika Sukses (HTTP 200):
    - Tampilkan notifikasi: `data.message`
    - Jika tipe voucher adalah 'free_days': lisensi seketika terbuka (`allowed: true`), tutup Layar Terkunci dan buka aplikasi tanpa bayar!
    - Jika tipe voucher adalah 'trial_quota': kuota bertambah, buka aplikasi.
    - Jika tipe voucher adalah 'discount_nominal': muat ulang gambar QRIS dan nominal paket yang sudah terpotong diskon.
  * Jika Gagal (HTTP 400/404): tampilkan pesan error dari server.

=======================================================
5. MULTI-TIER PILIHAN PAKET & QRIS DINAMIS (/api/v1/billing)
=======================================================
Pada Layar Terkunci, ambil daftar paket dari:
GET https://vocml.vocpos.id/api/v1/billing?machine_id={machine_id}&product={product}

Respon `billing.packages` berisi pilihan paket dinamis (7 Hari, 2 Minggu, 1 Bulan, 3 Bulan, 1 Tahun, atau promo):
- Sediakan tombol tab/pilihan paket (misal: "1 Bulan - Rp 60.321").
- Setiap paket telah memiliki 3-digit kode unik pembayaran otomatis (`pkg.amount` / `pkg.amount_text`) untuk mencegah bentrok pembayaran antar pengguna.
- Saat salah satu paket diklik oleh pengguna, ganti gambar QRIS (`<img src="...">`) secara instan sesuai `pkg.qris_image_url`.

=======================================================
6. PEMBAYARAN RESPONSIF TANPA DELAY (FAST POLLING & 0ms CHECK)
=======================================================
Agar aplikasi langsung terbuka otomatis seketika setelah pengguna bayar:
a. Fast Polling 2 Detik:
   Ketika Layar Terkunci QRIS sedang tampil, jalankan timer cek status (`GET /api/v1/check`) setiap 2 DETIK sekali (2000 ms).
   Begitu server VOC ML menerima mutasi pembayaran dari HP Android admin, respon langsung berubah menjadi `allowed: true`, dan layar terkunci otomatis terbuka dalam 1-2 detik!
b. Tombol Instan "Saya Sudah Bayar" (0 ms delay):
   Sediakan tombol berwarna hijau: "✅ Saya Sudah Bayar (Buka Sekarang)".
   Saat tombol ini diklik, aplikasi langsung menembak `GET /api/v1/check` secara seketika (0 milidetik tanpa menunggu timer), dan jika sudah aktif langsung me-reload layar utama.

=======================================================
7. NOTIFIKASI PESAN BROADCAST ADMIN (/api/v1/messages)
=======================================================
Aplikasi secara berkala (tiap 1–2 menit) memanggil:
GET https://vocml.vocpos.id/api/v1/messages?machine_id={machine_id}&product={product}

Jika ada array `messages`:
- Tampilkan notifikasi floating banner / toast di pojok layar aplikasi (misal: pengumuman pemeliharaan server, promo diskon perpanjangan, atau info penting admin).

=======================================================
8. VERIFIKASI OFFLINE TERTANDATANGAN (Ed25519)
=======================================================
Server VOC ML menyertakan field `token` bertanda tangan digital Ed25519 pada respon `/check`.
Gunakan Public Key server VOC ML untuk memvalidasi token tersebut secara lokal sehingga aplikasi tetap dapat berjalan aman meskipun internet klien sempat terputus sementara (sesuai batas toleransi hari offline `grace_days`).

Tolong susun kode implementasi ini secara rapi, modular, dan sertakan contoh template HTML/CSS untuk Layar Terkunci yang modern dan elegan.
```

---

## 💡 PERTANYAAN: Apakah Bisa Digunakan pada Billiard & Kasir POS? Dan Apakah Sudah Fleksibel?

### **Jawabannya: SANGAT BISA dan SUDAH 100% FLEKSIBEL.**

Sistem arsitektur VOC ML telah dirancang secara modular dan agnostik (tidak terikat pada satu jenis aplikasi). Berikut bukti fleksibilitasnya:

1. **Parameter `product` yang Dinamis**:
   * Untuk Kasir POS: cukup gunakan `product: 'pos'`.
   * Untuk Rental Billiard: gunakan `product: 'billiard'`.
   * Untuk PesanRahasia: gunakan `product: 'messagerahasia'`.
   * Seluruh database, pengaturan harga default, kuota trial, dan paket lisensi terpisah secara rapi per produk di VOC ML.

2. **Fleksibilitas Kuota Trial Sesuai Karakter Aplikasi**:
   * **Kasir POS**: Kuota trial bisa dihitung per transaksi struk (misal: "Gratis 50 transaksi penjualan pertama").
   * **Billiard**: Kuota trial bisa dihitung per sesi main (misal: "Gratis 20x booking meja pertama").
   * **PesanRahasia**: Kuota trial dihitung per kirim pesan (misal: "Gratis 10x kirim pesan rahasia").
   * Jika tidak ingin menggunakan kuota trial (langsung wajib berlangganan), cukup isi nilai `0` pada pengaturan VOC ML!

3. **Voucher Promo Universal**:
   * Anda bisa membuat kode voucher yang berlaku untuk **Semua Produk** (misal kode `DISKONMEMBER` berlaku di POS, Billiard, dan PesanRahasia sekaligus).
   * Atau membuat voucher khusus satu produk saja (misal `GRATISPOS` hanya bisa diklaim oleh aplikasi Kasir POS).

4. **Multi-tier Paket QRIS Dinamis & Kode Unik Anti-Bentrok**:
   * Semua aplikasi otomatis mendapatkan nominal berakhiran 3-digit kode unik (misal Rp 60.321).
   * Webhook mutasi dari HP Android (`vocml-notifier-android`) bekerja otomatis tanpa pandang bulu: begitu ada uang masuk dengan nominal unik tersebut, server VOC ML langsung tahu klien mana yang bayar dan detik itu juga membuka kunci aplikasinya!

