# Panduan & Master Prompt Integrasi Universal VOC ML

Dokumen ini adalah **Master Prompt Resmi (Gold Standard)** yang siap Anda *copy-paste* langsung ke AI asisten coding (Claude, ChatGPT, Gemini, Cursor, dll) saat membangun atau memperbarui aplikasi apa pun:
* **ENKATEXTILE** (Aplikasi POS & Gudang Textile / Kain Grosir)
* **KONVEKSI ERP** (Aplikasi Produksi, Pola, Potong, Jahit & SPK)
* **KASIR POS RETAIL & RESTO** (Velco Pro Shop, Toko, Swalayan, Resto)
* **BILLIARD & CAFE** (Aplikasi Rental Meja & IoT Management)
* **PESAN RAHASIA** (Aplikasi Chat E2EE)

---

## 📋 DAFTAR KODE PRODUK RESMI & TITIK AKSI POTONG KUOTA

Setiap aplikasi memiliki kode produk resmi dan titik pemicu (*trigger point*) pemotongan kuota transaksi yang telah distandardisasi:

| Kode Produk (`product`) | Nama Aplikasi | Titik Aksi Utama (*Wajib Potong 1 Kuota*) | Aksi Bebas Kuota (*Gratis / Tanpa Potong*) |
| :--- | :--- | :--- | :--- |
| **`enkatextile`** | ENKATEXTILE POS Gudang | Klik tombol **"Simpan & Bayar"** (Nota Penjualan Kain Terbit) | Batal / Cek Stok Gudang |
| **`konveksi`** | Konveksi ERP | Klik tombol **"Simpan Data Potongan & Terbitkan SPK"** | Klik **"Simpan Draft Saja"** *(Draft bebas kuota)* |
| **`pos`** | Kasir POS Retail / Resto | Klik tombol **"PEMBAYARAN"** / Cetak Struk Kasir | Simpan Pesanan Sementara (Hold) |
| **`billiard`** | Billiard & Cafe | Klik tombol **"▶ Mulai Sewa Meja"** / Nyalakan Lampu | Pindah Meja / Cek Billing |
| **`messagerahasia`** | PesanRahasia E2EE | Klik tombol **"Kirim Pesan Rahasia"** | Baca Pesan Masuk |

---

# 🚀 MASTER PROMPT RESMI UNTUK AI PENGEMBANG APLIKASI
*(Salin seluruh teks di dalam kotak di bawah ini dan berikan langsung kepada AI Anda)*

```text
Halo AI, tolong bantu saya mengintegrasikan sistem keamanan lisensi, auto-billing QRIS dinamis, multi-paket langganan, auto-unlock seketika, dan kuota transaksi menggunakan server VOC ML ke dalam aplikasi saya.

Detail Konfigurasi Server Lisensi:
======================================================================
- URL Server VOC ML : https://vocml.vocpos.id
- Nama Aplikasi     : Konveksi ERP
- Kode Produk       : konveksi
- Nama Toko Klien   : [Nama Toko / Pabrik / Gudang dari Database / Setting Aplikasi]
- ID Identitas (MID): Hardware Machine ID (dari CPU/Motherboard) ATAU ID Akun Pengguna (GMAIL-XXXX)

Tolong buatkan modul integrasi lisensi lengkap (`vocml-license.js`) dan komponen UI Modal "Daftar Paket Lisensi & Perpanjangan" dengan 8 pilar spesifikasi berikut:

======================================================================
PILAR 1: PENDAFTARAN & AUTO-CHECK SAAT STARTUP (/check & /register)
======================================================================
Saat aplikasi pertama kali dinyalakan:
1. Panggil: GET https://vocml.vocpos.id/api/v1/check?machine_id={machine_id}&product={product}
2. Jika server merespon HTTP 404 (belum terdaftar di server VOC ML), otomatis kirim:
   POST https://vocml.vocpos.id/api/v1/register
   Header: Content-Type: application/json
   Body:
   {
     "machine_id": "{machine_id}",
     "product": "{product}",
     "store_name": "{store_name}",
     "app_version": "1.0.0"
   }
3. Simpan respon awal status akun ke cache/memory aplikasi.

======================================================================
PILAR 2: LOGIKA KONTROL AKSES & STATUS LISENSI
======================================================================
Respon `GET /api/v1/check`:
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
- Akses DIIZINKAN (`allowed: true`)  : jika status adalah 'active', 'expiring', atau 'trial'. Fitur aplikasi berjalan normal.
- Akses DIBLOKIR (`allowed: false`) : jika status adalah 'expired', 'locked', atau 'pending'.
  Jika diblokir, cegah penggunaan menu operasional dan buka Modal Tagihan Lisensi QRIS.

======================================================================
PILAR 3: MODAL DAFTAR PAKET & QRIS DINAMIS (ATURAN: 1 GAMBAR TUNGGAL)
======================================================================
Buatkan modal dialog 2 kolom yang modern, bersih, dan responsif:

A. Kolom Kanan (Pilihan Paket Lisensi):
   - Ambil daftar paket dari array `billing.packages` hasil respon server.
   - Tampilkan kartu radio pilihan durasi (misal: 1 Bulan, 3 Bulan, 6 Bulan, 1 Tahun, atau Kuota Transaksi).
   - Tampilkan harga berakhiran 3-digit kode unik (misal Rp 450.321) dan badge diskon promo (misal "HEMAT 20%").
   - Set paket pertama sebagai paket terpilih secara default (`selectedPackage`).

B. Kolom Kiri (Penampil QRIS Tunggal - BEBAS GAMBAR GANDA):
   - PENTING (ATURAN KETAT): HANYA TAMPILKAN 1 TAG <img /> DARI URL SERVER.
     DILARANG merender komponen library QRCode lokal (<QRCodeCanvas />) dan DILARANG memasang gambar ganda!
   - Contoh JSX:
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
   - Saat pengguna mengklik paket lain di kolom kanan, 1 gambar QRIS dan label TOTAL TAGIHAN di sebelah kiri otomatis berganti seketika!

======================================================================
PILAR 4: REALTIME LISTENER & PERAYAAN SUKSES BAYAR (AUTO-SUCCESS MODAL)
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
     * Paket Baru    : {pkg_name}
     * Nominal Lunas : {amount_text}
     * Berlaku Sampai: {expires_at}
   - Tombol Hijau: "✅ Selesai & Lanjutkan" ➔ Saat diklik, modal tertutup dan seluruh sistem langsung aktif seketika!

======================================================================
PILAR 5: TOMBOL "SAYA SUDAH BAYAR" & KLAIM VOUCHER PROMO
======================================================================
1. Tombol "✅ Saya Sudah Bayar":
   Saat diklik pengguna, langsung panggil `GET /api/v1/check` secara seketika (0 milidetik). Jika server menyatakan lunas, langsung picu Layar Sukses Pembayaran di Pilar 4.
2. Form Input Kode Voucher:
   - Sediakan input text "Masukkan Kode Voucher Promo" dan tombol "Klaim".
   - Saat tombol diklik, kirim:
     POST https://vocml.vocpos.id/api/v1/voucher/claim
     Body: { "machine_id": "{machine_id}", "product": "{product}", "code": "{input_kode}" }
   - Jika sukses: lisensi seketika aktif terbuka tanpa bayar!

======================================================================
PILAR 6: TITIK PEMOTONGAN KUOTA TRANSAKSI (PAY-PER-TRANSACTION)
======================================================================
Jika akun menggunakan sistem kuota transaksi (trial / paket pulsa transaksi):
Pasang pemanggilan API pemotongan kuota tepat pada aksi final:

1. Pada ENKATEXTILE:
   - Pasang tepat saat kasir menekan tombol ungu: "Simpan & Bayar".
2. Pada KASIR POS (Velco Pro Shop):
   - Pasang tepat saat kasir menekan tombol merah: "PEMBAYARAN".
3. Pada KONVEKSI ERP:
   - Pasang tepat saat admin menekan tombol biru: "Simpan Data Potongan & Terbitkan SPK".
   - PENTING: Tombol "Simpan Draft Saja" TIDAK BOLEH MEMOTONG KUOTA (Gratis simpan draft).
4. Pada BILLIARD:
   - Pasang tepat saat kasir menekan tombol: "Mulai Sewa Meja".

Format Request Potong Kuota:
POST https://vocml.vocpos.id/api/v1/trial/consume
Body: { "machine_id": "{machine_id}", "product": "{product}" }

Penanganan Hasil:
- Jika HTTP 200 OK: kurangi sisa kuota di layar (`trial.remaining`) dan lanjutkan simpan transaksi/terbitkan SPK.
- Jika HTTP 403 (Kuota Habis): hentikan proses, tampilkan pesan "Kuota transaksi Anda telah habis", dan buka Modal Tagihan QRIS.

======================================================================
PILAR 7: PESAN BROADCAST ADMIN (/api/v1/messages)
======================================================================
Secara berkala (tiap 2 menit), panggil:
GET https://vocml.vocpos.id/api/v1/messages?machine_id={machine_id}&product={product}
- Jika terdapat pesan aktif dari admin, tampilkan sebagai floating toast banner di sudut layar aplikasi.

======================================================================
PILAR 8: VERIFIKASI OFFLINE TERTANDATANGAN (Ed25519)
======================================================================
- Respon `/check` menyertakan token Ed25519.
- Simpan token tersebut ke LocalStorage / cache file lokal.
- Jika sewaktu-waktu koneksi internet toko/pabrik terputus sementara, aplikasi tetap diizinkan membuka transaksi selama batas toleransi offline (default 5 hari) dengan memvalidasi token terakhir secara lokal.

Tolong implementasikan kode secara bersih, modular, terdokumentasi (React/Next.js/Vue/HTML Tailwind), dan langsung siap dihubungkan ke server VOC ML!
```

---

## 📌 Rangkuman Manfaat Standarisasi Ini:
1. **Paham Konteks Nyata Setiap Tombol:** AI pembuat aplikasi tidak akan salah pasang trigger pemotongan kuota (Draft tidak terpotong, hanya transaksi resmi yang terpotong).
2. **Bebas Masalah Tampilan:** Aturan ketat 1 tag `<img>` menjamin QR Code tidak akan bertumpuk dua.
3. **Pengalaman Pengguna Sempurna:** Auto-Success Celebration Modal dan notifikasi suara lonceng memberikan kepuasan instan bagi pelanggan saat membayar dengan QRIS!
