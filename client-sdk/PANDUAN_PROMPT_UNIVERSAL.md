# Panduan & Master Prompt Integrasi Universal VOC ML

Dokumen ini adalah **Master Prompt Resmi** yang siap Anda *copy-paste* ke AI asisten coding (Claude, ChatGPT, Gemini, Cursor, dll) saat membangun atau memperbarui aplikasi apa pun:
* **ENKATEXTILE (Aplikasi POS & Gudang Textile / Kain Grosir)**
* **Aplikasi Konveksi ERP (Produksi, Pola, Jahit & SPK)**
* **Aplikasi Billiard & Rental Meja (IoT)**
* **Aplikasi Kasir POS Retail & Resto**
* **Aplikasi PesanRahasia (E2EE)**

---

## 📋 DAFTAR KODE PRODUK RESMI DI VOC ML
Gunakan kode produk berikut sesuai jenis aplikasi Anda:
* `enkatextile` : Aplikasi ENKATEXTILE POS Gudang Textile (Inventori Kain, Rollan, Yard/Meter, Grosir)
* `konveksi` : Aplikasi Konveksi ERP (Manajemen Produksi, Pola, Jahit, Sablon/Bordir, SPK)
* `pos` : Aplikasi Kasir Toko / POS Retail / F&B
* `billiard` : Aplikasi Billiard & Rental Meja / IoT Management
* `messagerahasia` : Aplikasi PesanRahasia (E2EE Chat)

---

# 🚀 MASTER PROMPT UNTUK AI PENGEMBANG APLIKASI
*(Salin seluruh teks di dalam kotak di bawah ini dan berikan langsung kepada AI Anda)*

```text
Halo AI, tolong bantu saya mengintegrasikan sistem keamanan lisensi, auto-billing QRIS dinamis, pilihan multi-paket langganan, auto-unlock seketika, dan kuota transaksi menggunakan server VOC ML ke dalam aplikasi saya.

Detail Konfigurasi Server Lisensi:
======================================================================
- URL Server VOC ML : https://vocml.vocpos.id
- Nama Aplikasi     : [GANTI: misal ENKATEXTILE POS Gudang / Konveksi ERP / Kasir POS / Billiard]
- Kode Produk       : [GANTI: 'enkatextile' | 'konveksi' | 'pos' | 'billiard' | 'messagerahasia']
- Nama Toko Klien   : [Nama Toko/Pabrik/Gudang dari Database / Setting Aplikasi]
- ID Identitas (MID): Hardware Machine ID (dari CPU/Motherboard) ATAU ID Akun Pengguna (GMAIL-XXXX)

Tolong buatkan modul integrasi lengkap (`vocml-license.js`) dan tampilan antarmuka Layar Terkunci (Lock Screen Modal) dengan 8 spesifikasi pilar berikut:

======================================================================
1. PENDAFTARAN & STARTUP IDENTITAS OTOMATIS
======================================================================
Saat aplikasi pertama kali dinyalakan:
1. Panggil: GET https://vocml.vocpos.id/api/v1/check?machine_id={machine_id}&product={product}
2. Jika server merespon HTTP 404 (belum terdaftar di VOC ML), otomatis kirim:
   POST https://vocml.vocpos.id/api/v1/register
   Header: Content-Type: application/json
   Body:
   {
     "machine_id": "{machine_id}",
     "product": "{product}",
     "store_name": "{store_name}",
     "app_version": "1.0.0"
   }
3. Simpan respon status awal akun ke cache/memory aplikasi.

======================================================================
2. LOGIKA KONTROL AKSES & STATUS LISENSI (/api/v1/check)
======================================================================
Endpoint pengecekan lisensi:
GET https://vocml.vocpos.id/api/v1/check?machine_id={machine_id}&product={product}

Respon Server VOC ML:
{
  "allowed": true | false,
  "status": "active" | "expiring" | "trial" | "expired" | "locked" | "pending",
  "expires_at": "YYYY-MM-DD",
  "remaining_days": 30,
  "unique_code": 321,
  "trial": {
    "enabled": true,
    "quota": 50,
    "used": 2,
    "remaining": 48,
    "is_trial": true
  },
  "billing": {
    "amount": 450321,
    "amount_text": "Rp 450.321",
    "qris_image_url": "https://vocml.vocpos.id/api/v1/billing/qris.png?...",
    "packages": [ ... ]
  }
}

Aturan Izin Akses:
- Akses DIIZINKAN (`allowed: true`)  : jika status 'active', 'expiring', atau 'trial'. Aplikasi berjalan normal.
- Akses DIBLOKIR (`allowed: false`) : jika status 'expired', 'locked', atau 'pending'.
  Jika diblokir, cegah akses menu utama dan buka Modal Tagihan Lisensi QRIS.

======================================================================
3. MODAL DAFTAR PAKET & QRIS DINAMIS (ATURAN: HANYA 1 GAMBAR QRIS)
======================================================================
Buatkan modal dialog 2 kolom yang modern, responsif, dan elegan:

A. Kolom Kanan (Pilihan Paket Lisensi):
   - Ambil daftar paket dari array `billing.packages` hasil respon server.
   - Tampilkan kartu radio pilihan durasi (misal: 1 Bulan, 3 Bulan, 6 Bulan, 1 Tahun, atau Kuota 1.000 Transaksi).
   - Tampilkan harga paket berakhiran 3-digit kode unik (misal Rp 450.321) dan badge diskon promo (misal "HEMAT 20%").
   - Jadikan paket pertama sebagai paket default yang terpilih (`selectedPackage`).

B. Kolom Kiri (Penampil Gambar QRIS Tunggal):
   - PENTING (ATURAN ANTI-BUG): HANYA TAMPILKAN 1 TAG <img> YANG DIAMBIL DARI URL SERVER.
     JANGAN merender library QRCode lokal (<QRCodeCanvas />) dan JANGAN memasang gambar ganda!
   - Contoh Template Kode JSX/HTML:
     <div className="flex flex-col items-center p-4 bg-slate-900/60 rounded-xl border border-slate-700/50">
       <div className="p-3 bg-white rounded-lg shadow-md">
         <img 
           src={selectedPackage?.qris_image_url || billing?.qris_image_url} 
           alt="QRIS Pembayaran Dinamis" 
           className="w-52 h-52 object-contain"
           loading="eager"
         />
       </div>
       <div className="mt-3 text-center">
         <p className="text-xs text-slate-400 uppercase tracking-wider">TOTAL TAGIHAN</p>
         <p className="text-2xl font-bold text-cyan-400 font-mono">{selectedPackage?.amount_text || billing?.amount_text}</p>
         <p className="text-xs text-slate-400 mt-1">QRIS • {billing?.merchant_name || 'Virtual Operation Control'}</p>
       </div>
     </div>
   - Saat pengguna mengklik pilihan paket lain di kolom kanan, gambar QRIS dan label TOTAL TAGIHAN di sebelah kiri otomatis berganti seketika!

======================================================================
4. REALTIME LISTENER & LAYAR PERAYAAN SUKSES BAYAR (AUTO-SUCCESS)
======================================================================
Aplikasi harus mendeteksi pembayaran seketika tanpa perlu pengguna me-refresh browser:
1. Hubungkan ke Server-Sent Events (SSE):
   GET https://vocml.vocpos.id/api/v1/stream?machine_id={machine_id}&product={product}
   (Atau jalankan fast-polling GET /check setiap 2 detik selama modal terbuka).
2. Begitu terdeteksi event 'renew' atau status berubah menjadi 'active':
   JANGAN hanya menutup modal secara diam-diam! Tampilkan Layar Sukses Pembayaran (Payment Success Celebration Modal):
   - Animasi ikon centang hijau berkilau (CheckCircle) + badge "PEMBAYARAN QRIS BERHASIL DITERIMA".
   - Putar efek suara lonceng pembayaran "Ding!" (audio chime).
   - Rincian Transaksi:
     * Paket Baru   : {pkg_name}
     * Nominal Lunas: {amount_text}
     * Berlaku Sampai: {expires_at}
   - Tombol Hijau: "✅ Selesai & Lanjutkan" ➔ Saat diklik, modal tertutup dan seluruh sistem langsung aktif 100%!

======================================================================
5. TOMBOL "SAYA SUDAH BAYAR" & KLAIM VOUCHER PROMO
======================================================================
1. Tombol "✅ Saya Sudah Bayar":
   Saat diklik user, langsung panggil `GET /api/v1/check` secara seketika (0 milidetik). Jika server menyatakan lunas, langsung picu Layar Sukses Pembayaran di atas.
2. Form Input Voucher Promo:
   - Sediakan input text "Masukkan Kode Voucher Promo" dan tombol "Klaim".
   - Saat tombol diklik, kirim:
     POST https://vocml.vocpos.id/api/v1/voucher/claim
     Body: { "machine_id": "{machine_id}", "product": "{product}", "code": "{input_kode}" }
   - Jika berhasil: lisensi seketika aktif terbuka tanpa bayar!

======================================================================
6. PROTEKSI KUOTA TRANSAKSI (PAY-PER-TRANSACTION / KUOTA TRIAL)
======================================================================
Jika akun menggunakan sistem kuota transaksi (trial / paket pulsa transaksi):
- Pasang pemanggilan API ini tepat sebelum aksi simpan dokumen utama dieksekusi:
  * Pada ENKATEXTILE : Saat kasir menekan "Simpan Faktur / Cetak Nota Potong Kain".
  * Pada Konveksi    : Saat admin menekan "Simpan Order Produksi / Cetak SPK".
  * Pada Kasir POS   : Saat kasir menekan tombol "Bayar" / Cetak Struk.
  * Pada Billiard    : Saat kasir menekan "Mulai Sewa Meja".

- Endpoint Potong Kuota:
  POST https://vocml.vocpos.id/api/v1/trial/consume
  Body: { "machine_id": "{machine_id}", "product": "{product}" }
  
- Penanganan:
  * Jika HTTP 200 OK: kurangi badge sisa kuota di layar (`trial.remaining`) dan lanjutkan transaksi secara normal.
  * Jika HTTP 403 (Kuota Habis): batalkan transaksi, beri pesan "Kuota transaksi Anda telah habis", dan tampilkan Modal Tagihan QRIS.

======================================================================
7. PESAN BROADCAST ADMIN (/api/v1/messages)
======================================================================
Secara berkala (tiap 2 menit), panggil:
GET https://vocml.vocpos.id/api/v1/messages?machine_id={machine_id}&product={product}
- Jika terdapat pesan aktif dari admin, tampilkan sebagai floating toast banner di sudut layar aplikasi.

======================================================================
8. VERIFIKASI OFFLINE TERTANDATANGAN (Ed25519)
======================================================================
- Respon `/check` menyertakan token Ed25519.
- Simpan token tersebut ke LocalStorage / cache file lokal.
- Jika sewaktu-waktu koneksi internet toko/gudang terputus, aplikasi tetap diizinkan buka transaksi selama batas toleransi offline (default 5 hari) dengan memvalidasi token terakhir menggunakan Public Key VOC ML.

Tolong susun kode implementasinya secara modular, rapi, terdokumentasi (React/Next.js/Vue/HTML Tailwind), dan langsung siap pakai!
```

---

## 💡 Keunggulan Arsitektur Multi-Produk VOC ML:
1. **Satu Server untuk Semua Bisnis Anda:**
   Server VOC ML Anda sekarang sudah melayani sekaligus:
   * `enkatextile` (POS Gudang Textile)
   * `konveksi` (Konveksi ERP)
   * `billiard` (Billiard & Rental Meja)
   * `pos` (Kasir Retail / F&B)
   * `messagerahasia` (Pesan E2EE)
2. **Anti-Bug Gambar Ganda:**
   Di instruksi Pilar 3, sudah ditegaskan secara ketat bahwa frontend hanya boleh merender 1 tag `<img>` dari `qris_image_url`, sehingga tampilan QRIS di semua aplikasi Anda dijamin rapi dan tajam.
3. **Auto-Success Celebration Screen:**
   Begitu HP Android Notifier Anda mendeteksi pembayaran dari bank/e-wallet apa saja (GoPay, Mandiri, BCA, ShopeePay), modal di layar ENKATEXTILE atau Konveksi ERP akan langsung memunculkan animasi centang hijau dan membuka aplikasi secara otomatis!
