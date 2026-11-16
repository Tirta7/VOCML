# Panduan & Master Prompt Integrasi Universal VOC ML
*(Sistem Dual-Model: Lisensi Durasi Waktu & Kuota Sesi / Transaksi Komersial)*

Dokumen ini adalah **Master Prompt Resmi (Gold Standard)** yang siap Anda *copy-paste* langsung ke AI asisten coding (Claude, ChatGPT, Gemini, Cursor, dll) saat membangun atau memperbarui aplikasi apa pun:
* **BILLIARD & CAFE** (Aplikasi Rental Meja, Kasir F&B, dan IoT Relay Lampu Meja)
* **KASIR POS RETAIL & RESTO** (Velco Pro Shop, Toko, Swalayan, Resto, Cafe)
* **KONVEKSI ERP** (Aplikasi Produksi, Pola, Potong, Jahit & SPK)
* **ENKATEXTILE** (Aplikasi POS & Gudang Textile / Kain Grosir)
* **PESAN RAHASIA** (Aplikasi Chat E2EE)

---

## 📋 DAFTAR KODE PRODUK RESMI & TITIK AKSI POTONG KUOTA

Setiap aplikasi memiliki kode produk resmi dan titik pemicu (*trigger point*) pemotongan kuota transaksi/sesi yang telah distandardisasi:

| Kode Produk (`product`) | Nama Aplikasi | Titik Aksi Utama (*Wajib Potong 1 Kuota*) | Aksi Bebas Kuota (*Gratis / Tanpa Potong*) |
| :--- | :--- | :--- | :--- |
| **`billiard`** | Billiard & Cafe | Klik tombol **"▶ Mulai Sewa Meja"** / Nyalakan Lampu IoT | Pindah Meja / Cek Billing / Tambah Menu F&B |
| **`pos`** | Kasir POS Retail / Resto | Klik tombol **"PEMBAYARAN"** / Cetak Struk Kasir | Simpan Pesanan Sementara (Hold) / Cek Stok |
| **`konveksi`** | Konveksi ERP | Klik tombol **"Simpan Data Potongan & Terbitkan SPK"** | Klik **"Simpan Draft Saja"** *(Draft bebas kuota)* |
| **`enkatextile`** | ENKATEXTILE POS Gudang | Klik tombol **"Simpan & Bayar"** (Nota Penjualan Kain Terbit) | Batal / Cek Stok Gudang Kain |
| **`messagerahasia`** | PesanRahasia E2EE | Klik tombol **"Kirim Pesan Rahasia"** | Baca Pesan Masuk |

---

# 🚀 MASTER PROMPT RESMI UNTUK AI PENGEMBANG APLIKASI
*(Salin seluruh teks di dalam blok di bawah ini dan berikan langsung kepada AI Anda)*

```text
Halo AI, tolong bantu saya mengintegrasikan sistem keamanan lisensi, auto-billing QRIS dinamis, multi-paket langganan (Paket Durasi Hari & Paket Kuota Transaksi/Sesi), auto-unlock seketika (< 2 detik), dan proteksi pemotongan kuota menggunakan server VOC ML ke dalam aplikasi saya.

Detail Konfigurasi Server Lisensi:
======================================================================
- URL Server VOC ML : https://vocml.vocpos.id
- Nama Aplikasi     : VOC BILLIARD / Kasir POS / Konveksi ERP / ENKATEXTILE
- Kode Produk       : billiard (atau pos / konveksi / enkatextile / messagerahasia)
- Nama Toko Klien   : [Nama Toko / Arena Billiard dari Database / Pengaturan Aplikasi]
- ID Identitas (MID): Hardware Machine ID (dari CPU/Motherboard) ATAU ID Akun Pengguna (GMAIL-XXXX)

Tolong buatkan modul integrasi lisensi lengkap (`vocml-license.js`), hook React (`useVocmlLicense.js`), dan komponen UI Modal "Daftar Paket Lisensi & Perpanjangan" dengan 9 pilar spesifikasi berikut:

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
PILAR 2: LOGIKA KONTROL AKSES & STATUS LISENSI (DUA MODEL BISNIS)
======================================================================
Server VOC ML kini mendukung 2 model bisnis lisensi secara penuh:
A. Model Durasi Waktu (Berdasarkan tanggal kedaluwarsa: expires_at, remaining_days)
B. Model Kuota Transaksi / Sesi Rental (Pay-per-Session, saldo sesi: trial.remaining, trial.quota)

Struktur Respon `GET /api/v1/check`:
{
  "allowed": true | false,
  "status": "active" | "expiring" | "trial" | "expired" | "locked" | "pending",
  "expires_at": "YYYY-MM-DD",
  "remaining_days": 30,
  "unique_code": 306,
  "trial": {
    "enabled": true,
    "quota": 600,
    "used": 101,
    "remaining": 499,
    "is_trial": false // true: trial gratis pertama kali, false: akun lisensi kuota komersial
  },
  "billing": {
    "amount": 450306,
    "amount_text": "Rp 450.306",
    "qris_image_url": "https://vocml.vocpos.id/api/v1/billing/qris.png?...",
    "packages": [
      {
        "id": "pkg_quota_100",
        "type": "quota",
        "quota": 100,
        "name": "Paket 100 Sesi",
        "label": "100 Sesi",
        "price": 85000,
        "amount": 85306,
        "amount_text": "Rp 85.306",
        "badge": "COBA DULU",
        "qris_image_url": "https://vocml.vocpos.id/api/v1/billing/qris.png?amount=85306&..."
      },
      {
        "id": "pkg_quota_500",
        "type": "quota",
        "quota": 500,
        "name": "Paket 500 Sesi",
        "label": "500 Sesi",
        "price": 220000,
        "amount": 220306,
        "amount_text": "Rp 220.306",
        "badge": "HEMAT",
        "qris_image_url": "https://vocml.vocpos.id/api/v1/billing/qris.png?amount=220306&..."
      },
      {
        "id": "pkg_quota_1000",
        "type": "quota",
        "quota": 1000,
        "name": "Paket 1.000 Sesi",
        "label": "1000 Sesi",
        "price": 450000,
        "amount": 450306,
        "amount_text": "Rp 450.306",
        "badge": "PALING LARIS 🔥",
        "qris_image_url": "https://vocml.vocpos.id/api/v1/billing/qris.png?amount=450306&..."
      },
      {
        "id": "pkg_30d",
        "type": "days",
        "days": 30,
        "name": "Paket 1 Bulan",
        "label": "30 Hari",
        "price": 450000,
        "amount": 450306,
        "amount_text": "Rp 450.306",
        "badge": "UNLIMITED WAKTU",
        "qris_image_url": "https://vocml.vocpos.id/api/v1/billing/qris.png?amount=450306&..."
      }
    ]
  }
}

Aturan Izin Akses Aplikasi:
- Akses DIIZINKAN (`allowed: true`)  : jika status adalah 'active', 'expiring', atau 'trial'. Fitur aplikasi berjalan normal.
- Akses DIBLOKIR (`allowed: false`) : jika status adalah 'expired', 'locked', 'pending', atau jika kuota sesi habis (remaining <= 0).
  Jika diblokir, cegah penyewaan meja/transaksi baru dan otomatis buka Modal Tagihan Lisensi QRIS.

Tampilan Status Lisensi di Header / Halaman Pengaturan Aplikasi:
1. Akun Berbasis Kuota (trial.enabled === true):
   - Badge Status: Tampilkan "LISENSI KUOTA AKTIF" (biru muda) atau "TRIAL AKTIF" (jika is_trial: true).
   - Teks Keterangan: "Aplikasi berjalan menggunakan kuota sesi rental meja billiard (Sisa {remaining} sesi)".
   - Sisa Kuota: "{remaining} Sesi"
   - Progres Kuota: "{used} / {quota} terpakai (Sisa {remaining}x)" dengan progress bar visual (`(used / quota) * 100%`).
   - Tombol Aksi: "[🎟️ TOP-UP KUOTA & PAKET]" dan "[🔄 CEK STATUS SEKARANG]".
2. Akun Berbasis Durasi Hari:
   - Badge Status: "AKTIF" (hijau) atau "SEGERA KEDALUWARSA" (oranye).
   - Masa Berlaku: Tanggal expires_at (Sisa {remaining_days} hari).

======================================================================
PILAR 3: SISTEM KUOTA TRANSAKSI & SESI RENTAL (/api/v1/trial/consume)
======================================================================
KUOTA BUKAN HANYA TRIAL LAGI, TAPI PRODUK KOMERSIAL RESMI:
Pengguna aplikasi dapat memilih sistem berlangganan berbasis kuota sesi (Pay-per-Session) dan dapat membeli paket top-up kuota (100 Sesi, 500 Sesi, 1.000 Sesi) berulang kali via QRIS kapan saja.

ATURAN EMAS KONSUMSI KUOTA (MENCEGAH PEMOTONGAN GANDA / 2x DEDUCT):
- Panggilan POST ke /api/v1/trial/consume HANYA BOLEH DILAKUKAN DI SATU TEMPAT:
  ✅ REKOMENDASI UTAMA: Letakkan di Backend Controller/Middleware saat menyimpan data transaksi resmi ke database atau saat klik tombol "Mulai Sewa Meja".
  ❌ DILARANG: Memanggil /api/v1/trial/consume di Frontend (tombol UI) JIKA Backend sudah memotongnya, agar 1 transaksi/sesi tidak terpotong 2x!

Titik Aksi Resmi Pemotongan Kuota per Aplikasi:
1. Pada VOC BILLIARD: Saat kasir mengklik tombol: "▶ Mulai Sewa Meja" / Nyalakan Saklar Lampu Meja IoT.
   (PENTING: Pindah meja, tambah pesanan minuman/F&B, dan cek durasi meja TIDAK MEMOTONG KUOTA).
2. Pada KASIR POS (Velco): Saat kasir menekan tombol merah: "PEMBAYARAN" / Cetak Struk Kasir.
   (PENTING: Tombol "Hold / Simpan Sementara" bebas kuota).
3. Pada KONVEKSI ERP: Saat admin menekan tombol biru: "Simpan Data Potongan & Terbitkan SPK".
   (PENTING: Tombol "Simpan Draft Saja" bebas kuota).
4. Pada ENKATEXTILE: Saat kasir menekan tombol ungu: "Simpan & Bayar" (Nota Penjualan Kain Terbit).

Payload Request Konsumsi Kuota:
POST https://vocml.vocpos.id/api/v1/trial/consume
Header: Content-Type: application/json
Body:
{
  "machine_id": "{machine_id}",
  "product": "{product}",
  "count": 1
}

Penanganan Hasil:
- Jika allowed: true:
  Lanjutkan mulai sewa meja / simpan transaksi ke database & kurangi sisa kuota di memori UI (`trial.remaining -= 1`, `trial.used += 1`).
- Jika allowed: false (kuota sesi habis / sisa 0):
  Cegah penyewaan meja, batalkan transaksi kasir, kunci aplikasi seketika, dan langsung tampilkan Modal Tagihan QRIS dengan tab "Paket Kuota Sesi" terbuka secara otomatis!

======================================================================
PILAR 4: SKEMA TUNGGAKAN BERKELANJUTAN VS TOP-UP KUOTA
======================================================================
SANGAT PENTING - PERBEDAAN PERLAKUAN PAKET HARI VS PAKET KUOTA:

A. Paket Durasi Waktu (`type: 'days'`):
   - Menerapkan Skema Potong Hari Tunggakan (Continuous Arrears).
   - Rumus Masa Aktif Baru: New Expires At = (Tanggal Expired Lama) + (Durasi Paket yang Dibeli).
   - Jika pengguna menunggak 6 hari lalu membeli paket 7 hari -> sisa aktif ke depan hanya 1 hari (6 hari dipotong untuk menutup masa tunggakan).
   - Proteksi Pilihan Paket (Insufficient Package Protection):
     Jika menunggak X hari (misal 10 hari) dan mengeklik paket yang durasinya <= X hari (misal 7 hari), tampilkan peringatan:
     "⚠️ Paket 7 hari belum mencukupi untuk melunasi 10 hari tunggakan! Silakan pilih paket minimal 14 hari agar aplikasi dapat aktif kembali."

B. Paket Kuota Sesi / Transaksi (`type: 'quota'`):
   - BEBAS POTONGAN TUNGGAKAN HARI!
   - Kuota sesi yang dibeli (misal 100 Sesi, 500 Sesi, 1.000 Sesi) 100% UTUH ditambahkan ke saldo akun (`trial_quota += pkg.quota`, `trial_remaining += pkg.quota`).
   - Aplikasi LANGSUNG AKTIF DAN TERBUKA SEKETIKA tanpa terpotong utang hari yang telah lewat!
   - Di UI Modal QRIS: Saat tab Paket Kuota dipilih, box peringatan tunggakan hari OTOMATIS DISEMBUNYIKAN dan diganti dengan pesan positif:
     "ℹ️ Top-Up Kuota Sesi: Kuota sesi rental bertambah utuh (+{quota} sesi) tanpa potongan hari tunggakan dan langsung siap digunakan."

C. Skenario Cicil Tunggakan Hari (Pembayaran Parsial):
   Jika pengguna menunggak X hari lalu nekat membayar paket harian kecil (misal telat 1 hari lalu bayar paket 1 hari):
   - Server tetap menerima uangnya dan memotong tunggakan 1 hari.
   - Server seketika merotasi kode unik ke 3-digit baru agar QRIS berganti dan bisa langsung discan ulang tanpa error duplikat.
   - Respon SSE event 'renew' mengembalikan `allowed: false` dan `debt_days` sisa tunggakan.
   - UI Modal Klien menampilkan status progres:
     * Alert Hijau: "✅ Pembayaran {nominal} berhasil diterima! Tunggakan berkurang {paket.days} hari."
     * Keterangan Sisa Scan: "⚠️ Sisa tunggakan: {debt_days} hari lagi. Silakan scan QRIS baru di bawah sebanyak {debt_days}x lagi (atau pilih paket yang lebih besar) untuk membuka lisensi!"

======================================================================
PILAR 5: MODAL DUA TAB & SINGLE QRIS IMAGE (ANTI GAMBAR TERTUMPUK)
======================================================================
Buatkan modal dialog responsif dengan arsitektur 2 kolom:

A. Kolom Kanan (Pilihan Paket Lisensi - Tab Kuota Sesi vs Durasi Waktu):
   - Sediakan 2 Tab Filter di bagian atas:
     1. 🎟️ "Paket Kuota Sesi" (`pkg.type === 'quota'`)
     2. ⏳ "Paket Durasi Hari" (`pkg.type === 'days'`)
   - Tampilkan kartu-kartu paket dari `billing.packages`:
     * Paket Kuota: Nama Paket (misal "Paket 500 Sesi"), Badge ("HEMAT"), Nominal Harga dengan kode unik otomatis, Keterangan "+500 Sesi Rental Meja".
     * Paket Durasi: Nama Paket (misal "Paket 1 Bulan"), Badge ("PALING LARIS"), Nominal Harga, Keterangan "+30 Hari Masa Aktif".
   - Set paket rekomendasi secara cerdas:
     * Jika aplikasi terkunci karena kuota habis: Default buka tab "Paket Kuota Sesi" dan pilih paket kuota populer (misal Paket 500 Sesi).
     * Jika aplikasi terkunci karena expired hari: Default buka tab "Paket Durasi Hari" dan pilih paket yang durasinya melebihi jumlah hari tunggakan.

B. Kolom Kiri (Penampil QRIS Tunggal - BEBAS GAMBAR BERTUMPUK GANDA):
   - PENTING (ATURAN KETAT): HANYA TAMPILKAN 1 TAG <img /> DARI URL SERVER:
     <img
       src={selectedPackage?.qris_image_url || billing?.qris_image_url}
       alt="QRIS VOC ML"
       className="w-52 h-52 object-contain mx-auto"
     />
   - DILARANG me-render tag <canvas> atau library QRCode terpisah di atas gambar QRIS agar QR code tidak muncul bertumpuk atau tumpang-tindih!
   - Saat pengguna mengklik paket lain di kolom kanan, gambar QRIS dan label TOTAL TAGIHAN di kolom kiri otomatis berganti seketika.
   - Di bawah QRIS tampilkan: Total Tagihan, Nama Usaha, dan Tombol Hijau: "✅ Saya Sudah Bayar (Buka Sekarang)" serta "Hubungi Admin / Kirim Bukti".

======================================================================
PILAR 6: DUAL-ENGINE REALTIME < 2 DETIK (SSE + FAST POLLING)
======================================================================
Aplikasi WAJIB merespon pembayaran QRIS dari VOC ML dalam waktu kurang dari 2 detik (< 2 detik) secara instan TANPA PERLU RELOAD HALAMAN (Zero Page Reload):

1. Engine 1 - SSE Stream (/api/v1/stream?machine_id={mid}&product={product}):
   - Event 'renew' / 'unlock':
     * Putar efek suara lonceng kasir ("Ding!").
     * Periksa properti `payload.package_type`:
       a. Jika `package_type === 'quota'`:
          Tampilkan Layar Sukses (Celebration Modal):
          "🎉 TOP-UP KUOTA BERHASIL DITERIMA!"
          "Paket: {payload.package} (+{payload.quota} Sesi)"
          "Sisa Saldo Kuota: {payload.trial_remaining} Sesi"
          Update state sisa kuota di navbar/dashboard seketika.
       b. Jika `package_type === 'days'`:
          Tampilkan Layar Sukses:
          "🎉 PEMBAYARAN LISENSI BERHASIL DITERIMA!"
          "Masa Aktif Baru Sampai: {payload.expires_at}"
     * Tutup modal tagihan QRIS seketika dan buka seluruh menu operasional kasir/billiard.
   - Event 'lock':
     * Langsung set state `allowed = false`, kunci layar operasional seketika (< 150ms).
   - Event 'update' / 'billing':
     * Sinkronkan paket lisensi dan saldo sisa kuota terbaru di memori.

2. Engine 2 - Fast Polling Fallback (Interval 1.5 Detik):
   - Nyalakan interval polling 1.5 detik HANYA saat modal tagihan / layar terkunci sedang terbuka.
   - Hentikan polling segera setelah lisensi terverifikasi lunas (`allowed === true`).

======================================================================
PILAR 7: TOMBOL "SAYA SUDAH BAYAR" & KLAIM VOUCHER PROMO
======================================================================
1. Tombol "✅ Saya Sudah Bayar":
   Saat diklik pengguna, langsung panggil `GET /api/v1/check` secara seketika (0 milidetik). Jika server menyatakan lunas, langsung picu Layar Sukses Pembayaran di Pilar 6.
2. Form Input Kode Voucher:
   - Sediakan input text "Masukkan Kode Voucher Promo / Trial" dan tombol "Klaim".
   - Saat tombol diklik, kirim:
     POST https://vocml.vocpos.id/api/v1/voucher/claim
     Body: { "machine_id": "{machine_id}", "product": "{product}", "code": "{input_kode}" }
   - Jika sukses: lisensi / kuota seketika aktif terbuka tanpa bayar!

======================================================================
PILAR 8: PESAN BROADCAST ADMIN (/api/v1/messages)
======================================================================
Secberkala (tiap 2 menit), panggil:
GET https://vocml.vocpos.id/api/v1/messages?machine_id={machine_id}&product={product}
- Jika terdapat pesan aktif dari admin, tampilkan sebagai floating toast banner di sudut layar aplikasi.

======================================================================
PILAR 9: VERIFIKASI OFFLINE TERTANDATANGAN (Ed25519)
======================================================================
- Respon `/check` menyertakan token Ed25519.
- Simpan token tersebut ke LocalStorage / cache file lokal.
- Jika sewaktu-waktu koneksi internet toko/arena terputus sementara, aplikasi tetap diizinkan membuka transaksi selama batas toleransi offline (default 5 hari) dengan memvalidasi token terakhir secara lokal.

Tolong implementasikan kode secara bersih, modular, terdokumentasi (React/Next.js/Vue/HTML Tailwind), dan langsung siap dihubungkan ke server VOC ML!

======================================================================
KODE REFERENSI 1: REACT HOOK useVocmlLicense.js (< 2 DETIK)
======================================================================
```javascript
// hooks/useVocmlLicense.js
import { useState, useEffect, useRef, useCallback } from 'react';

const VOCML_BASE = 'https://vocml.vocpos.id';

export function useVocmlLicense({ machineId, product, storeName = '' }) {
  const [license, setLicense] = useState({
    allowed: true,
    status: 'checking',
    expiresAt: null,
    remainingDays: null,
    trial: { enabled: false, quota: 0, used: 0, remaining: 0, is_trial: false },
    billing: null,
    isLocked: false,
    isQuotaMode: false
  });
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState(null);
  const [partialPaymentNotice, setPartialPaymentNotice] = useState(null);
  const pollRef = useRef(null);

  // 1. Sinkronisasi status lengkap dari VOC ML
  const fetchCheck = useCallback(async () => {
    try {
      const res = await fetch(`${VOCML_BASE}/api/v1/check?machine_id=${machineId}&product=${product}`);
      if (res.status === 404) {
        await fetch(`${VOCML_BASE}/api/v1/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ machine_id: machineId, product, store_name: storeName })
        });
        return fetchCheck();
      }
      const data = await res.json();
      const isQuota = Boolean(data.trial?.enabled && (data.trial?.quota > 0 || data.trial?.remaining > 0));
      
      setLicense(prev => ({
        ...prev,
        allowed: data.allowed,
        status: data.status,
        expiresAt: data.expires_at,
        remainingDays: data.remaining_days,
        trial: data.trial || prev.trial,
        billing: data.billing,
        isLocked: !data.allowed,
        isQuotaMode: isQuota
      }));
      return data;
    } catch (err) {
      console.warn('[VOCML] Check error, using cache/offline tolerance', err);
      return null;
    }
  }, [machineId, product, storeName]);

  // 2. Handler saat lisensi/kuota diperbarui via QRIS < 2 Detik
  const handleRenew = useCallback((payload = {}) => {
    try {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.play().catch(() => {});
    } catch {}

    const isFullyUnlocked = payload.allowed !== false;
    const isQuotaPkg = payload.package_type === 'quota' || Boolean(payload.quota);

    if (isFullyUnlocked) {
      setLicense(prev => ({
        ...prev,
        allowed: true,
        status: 'active',
        isLocked: false,
        expiresAt: payload.expires_at || prev.expiresAt,
        remainingDays: payload.remaining_days || prev.remainingDays,
        trial: {
          ...prev.trial,
          quota: payload.trial_quota ?? ((prev.trial?.quota || 0) + (payload.quota || 0)),
          remaining: payload.trial_remaining ?? ((prev.trial?.remaining || 0) + (payload.quota || 0))
        }
      }));

      setCelebrationData({
        isQuota: isQuotaPkg,
        packageName: payload.package || (isQuotaPkg ? 'Top-Up Kuota Sesi' : 'Perpanjangan Lisensi'),
        amountText: payload.amount_text || '',
        quotaAdded: payload.quota || 0,
        quotaRemaining: payload.trial_remaining,
        expiresAt: payload.expires_at || ''
      });
      setShowCelebration(true);
      setPartialPaymentNotice(null);
    } else {
      // Pembayaran parsial / cicil hari tunggakan
      const remainingDebt = payload.debt_days ?? Math.abs(payload.days_left || 1);
      setPartialPaymentNotice({
        message: `Pembayaran ${payload.package || ''} berhasil diterima! Tunggakan berkurang.`,
        debtDays: remainingDebt,
        remainingScans: remainingDebt
      });
    }

    // Refresh data billing & paket terbaru
    fetchCheck();
  }, [fetchCheck]);

  // 3. Handler saat dikunci remote dari VOC ML (< 2 Detik)
  const handleLocked = useCallback((payload = {}) => {
    setLicense(prev => ({
      ...prev,
      allowed: false,
      status: 'locked',
      isLocked: true,
      lockReason: payload.reason || 'Aplikasi terkunci oleh server lisensi'
    }));
  }, []);

  // 4. Engine 1: Server-Sent Events (SSE) Stream Real-Time (< 150ms)
  useEffect(() => {
    if (!machineId || !product) return;
    fetchCheck();

    const sseUrl = `${VOCML_BASE}/api/v1/stream?machine_id=${machineId}&product=${product}`;
    const sse = new EventSource(sseUrl);

    sse.addEventListener('renew', (e) => {
      try { handleRenew(JSON.parse(e.data)); } catch { handleRenew(); }
    });
    sse.addEventListener('unlock', (e) => {
      try { handleRenew(JSON.parse(e.data)); } catch { handleRenew(); }
    });
    sse.addEventListener('lock', (e) => {
      try { handleLocked(JSON.parse(e.data)); } catch { handleLocked(); }
    });
    sse.addEventListener('update', () => fetchCheck());
    sse.addEventListener('billing', () => fetchCheck());

    return () => {
      sse.close();
    };
  }, [machineId, product, fetchCheck, handleRenew, handleLocked]);

  // 5. Engine 2: Fast Polling Fail-Safe (1.5 Detik Saat Terkunci)
  useEffect(() => {
    if (license.isLocked) {
      pollRef.current = setInterval(async () => {
        const latest = await fetchCheck();
        if (latest && latest.allowed) {
          clearInterval(pollRef.current);
          handleRenew(latest);
        }
      }, 1500);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [license.isLocked, fetchCheck, handleRenew]);

  // 6. Action potong 1 kuota sesi meja / transaksi (Single point of deduction)
  const consumeQuota = async () => {
    // Jika lisensi durasi hari unlimited aktif dan bukan kuota mode, bebas pakai
    if (!license.isQuotaMode && license.status === 'active') return true;

    try {
      const res = await fetch(`${VOCML_BASE}/api/v1/trial/consume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machine_id: machineId, product, count: 1 })
      });
      const data = await res.json();
      if (res.ok && data.allowed) {
        setLicense(prev => ({
          ...prev,
          trial: {
            ...prev.trial,
            remaining: data.trial?.remaining ?? Math.max(0, (prev.trial?.remaining || 1) - 1),
            used: data.trial?.used ?? ((prev.trial?.used || 0) + 1),
            quota: data.trial?.quota ?? prev.trial?.quota
          }
        }));
        return true;
      }
      // Kuota habis -> kunci aplikasi
      setLicense(prev => ({ ...prev, allowed: false, isLocked: true }));
      return false;
    } catch {
      return false;
    }
  };

  return {
    license,
    isLocked: license.isLocked,
    isQuotaMode: license.isQuotaMode,
    showCelebration,
    closeCelebration: () => setShowCelebration(false),
    celebrationData,
    partialPaymentNotice,
    consumeQuota,
    refreshLicense: fetchCheck
  };
}
```

======================================================================
KODE REFERENSI 2: KOMPONEN UI MODAL QRIS DUA TAB (Tailwind CSS)
======================================================================
```jsx
// components/VocmlBillingModal.jsx
import React, { useState, useEffect } from 'react';

export default function VocmlBillingModal({ isOpen, onClose, license, onRefresh }) {
  const [activeTab, setActiveTab] = useState('quota'); // 'quota' | 'days'
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [voucherCode, setVoucherCode] = useState('');
  const [claimingVoucher, setClaimingVoucher] = useState(false);
  const [voucherMessage, setVoucherMessage] = useState(null);

  const packages = license?.billing?.packages || [];
  const quotaPackages = packages.filter(p => p.type === 'quota');
  const dayPackages = packages.filter(p => p.type === 'days');

  // Set default tab dan paket
  useEffect(() => {
    if (license?.isQuotaMode || license?.trial?.remaining <= 0) {
      setActiveTab('quota');
      setSelectedPackage(quotaPackages[0] || packages[0]);
    } else {
      setActiveTab('days');
      setSelectedPackage(dayPackages[0] || packages[0]);
    }
  }, [license]);

  if (!isOpen) return null;

  const currentTabPackages = activeTab === 'quota' ? quotaPackages : dayPackages;
  const isExpiredDays = (license?.remainingDays || 0) < 0;
  const debtDays = Math.abs(license?.remainingDays || 0);

  const handleClaimVoucher = async () => {
    if (!voucherCode.trim()) return;
    setClaimingVoucher(true);
    setVoucherMessage(null);
    try {
      const res = await fetch('https://vocml.vocpos.id/api/v1/voucher/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machine_id: license?.machineId,
          product: 'billiard',
          code: voucherCode.trim()
        })
      });
      const data = await res.json();
      if (res.ok) {
        setVoucherMessage({ type: 'success', text: 'Voucher berhasil diklaim! Lisensi telah aktif.' });
        onRefresh();
      } else {
        setVoucherMessage({ type: 'error', text: data.message || 'Kode voucher tidak valid.' });
      }
    } catch {
      setVoucherMessage({ type: 'error', text: 'Gagal menghubungi server.' });
    } finally {
      setClaimingVoucher(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#0f172a] border border-slate-700 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row text-white">
        
        {/* KOLOM KIRI: QRIS TUNGGAL & TOTAL TAGIHAN (BEBAS DUPLIKAT/CANVAS) */}
        <div className="w-full md:w-5/12 bg-[#1e293b] p-6 flex flex-col items-center justify-between border-b md:border-b-0 md:border-r border-slate-700 text-center">
          <div>
            <span className="inline-block px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-xs font-semibold mb-3">
              ⚡ QRIS Pembayaran Otomatis
            </span>
            <div className="bg-white p-3 rounded-2xl shadow-lg border-2 border-slate-200">
              {/* ATURAN EMAS: HANYA SATU TAG <img> TANPA CANVAS/QR LIBRARY TAMBAHAN */}
              <img
                src={selectedPackage?.qris_image_url || license?.billing?.qris_image_url}
                alt="QRIS Pembayaran"
                className="w-52 h-52 object-contain mx-auto"
              />
            </div>
            <div className="mt-4">
              <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                Total Tagihan • {selectedPackage?.label || selectedPackage?.name}
              </p>
              <p className="text-2xl font-black text-white mt-1">
                {selectedPackage?.amount_text || `Rp ${(selectedPackage?.amount || 0).toLocaleString('id-ID')}`}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Scan QRIS dengan BCA, Mandiri, BRI, BNI, DANA, OVO, Gopay, atau ShopeePay.
              </p>
            </div>
          </div>

          <div className="w-full mt-6 space-y-2">
            <button
              onClick={onRefresh}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/40"
            >
              ✅ Saya Sudah Bayar (Buka Sekarang)
            </button>
            <a
              href="https://wa.me/628999964538"
              target="_blank"
              rel="noreferrer"
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-xl text-xs flex items-center justify-center gap-1 transition"
            >
              💬 Hubungi Admin / Bantuan
            </a>
          </div>
        </div>

        {/* KOLOM KANAN: PILIHAN PAKET (TAB KUOTA SESI & TAB DURASI HARI) */}
        <div className="w-full md:w-7/12 p-6 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <span>Pilih Paket Lisensi</span>
                <span className="text-xs font-normal text-slate-400">Kode Unik: +{license?.billing?.unique_code || 306}</span>
              </h2>
              {onClose && (
                <button onClick={onClose} className="text-slate-400 hover:text-white text-sm">✕ Tutup</button>
              )}
            </div>

            {/* TAB FILTER: KUOTA VS DURASI */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-800/80 rounded-xl mb-4 border border-slate-700">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('quota');
                  setSelectedPackage(quotaPackages[0] || packages[0]);
                }}
                className={`py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-2 ${
                  activeTab === 'quota'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                🎟️ Paket Kuota Sesi ({quotaPackages.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('days');
                  setSelectedPackage(dayPackages[0] || packages[0]);
                }}
                className={`py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-2 ${
                  activeTab === 'days'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                ⏳ Paket Durasi Waktu ({dayPackages.length})
              </button>
            </div>

            {/* INFO PELUNASAN / TUNGGAKAN HARI */}
            {activeTab === 'days' && isExpiredDays && (
              <div className="mb-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300">
                <p className="font-semibold">ℹ️ Info Pelunasan Tunggakan:</p>
                <p className="mt-0.5 text-amber-200/90">
                  Lisensi telah kedaluwarsa {debtDays} hari lalu. Paket hari yang Anda pilih akan dipotong {debtDays} hari untuk menutup masa tunggakan.
                </p>
              </div>
            )}

            {/* INFO KEUNGGULAN PAKET KUOTA (BEBAS TUNGGAKAN) */}
            {activeTab === 'quota' && (
              <div className="mb-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-xs text-blue-300">
                <p className="font-semibold">ℹ️ Top-Up Kuota Instan:</p>
                <p className="mt-0.5 text-blue-200/90">
                  Paket Kuota Sesi <strong>bebas potongan tunggakan hari</strong>! Sesi rental langsung ditambahkan penuh ke akun Anda dan aplikasi aktif seketika.
                </p>
              </div>
            )}

            {/* DAFTAR KARTU PAKET */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto pr-1">
              {currentTabPackages.map((pkg) => {
                const isSelected = selectedPackage?.id === pkg.id || selectedPackage?.name === pkg.name;
                const isInsufficient = activeTab === 'days' && isExpiredDays && (pkg.days || 0) <= debtDays;

                return (
                  <div
                    key={pkg.id || pkg.name}
                    onClick={() => setSelectedPackage(pkg)}
                    className={`cursor-pointer relative p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                      isSelected
                        ? 'border-blue-500 bg-blue-600/15 shadow-md shadow-blue-900/30'
                        : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800'
                    }`}
                  >
                    <div>
                      {pkg.badge && (
                        <span className="inline-block px-2 py-0.5 text-[9px] font-black uppercase rounded bg-rose-500 text-white mb-1.5">
                          {pkg.badge}
                        </span>
                      )}
                      <h4 className="font-bold text-sm text-white leading-tight">{pkg.name}</h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {pkg.type === 'quota' ? `+${pkg.quota} Sesi Rental` : `+${pkg.days} Hari Aktif`}
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-700/60">
                      <p className="text-sm font-black text-emerald-400">
                        {pkg.amount_text || `Rp ${(pkg.amount || 0).toLocaleString('id-ID')}`}
                      </p>
                      {isInsufficient && (
                        <p className="text-[9px] text-rose-400 font-semibold mt-1">
                          ⚠️ Belum melunasi {debtDays}h
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* FORM KLAIM VOUCHER */}
          <div className="mt-4 pt-4 border-t border-slate-700/80">
            <p className="text-xs text-slate-400 font-semibold mb-2">🎁 Punya Kode Voucher Promo / Trial?</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Masukkan kode voucher..."
                value={voucherCode}
                onChange={(e) => setVoucherCode(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white uppercase focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleClaimVoucher}
                disabled={claimingVoucher}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition"
              >
                {claimingVoucher ? 'Memeriksa...' : 'Klaim'}
              </button>
            </div>
            {voucherMessage && (
              <p className={`text-xs mt-2 ${voucherMessage.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
                {voucherMessage.text}
              </p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
```
```

---

## 📌 Rangkuman Manfaat Standarisasi Baru Ini:
1. **Model Bisnis Ganda (Waktu vs Kuota):** Klien dapat memilih paket langganan harian/bulanan atau paket kuota per-transaksi/sesi meja (Pay-per-Session) yang dapat diperpanjang berulang kali via QRIS.
2. **Keadilan Sistem Tunggakan (Arrears):** Paket kuota 100% bebas dari potongan hari tunggakan, sehingga klien yang lama menunggak tetap bisa langsung buka aplikasi seketika hanya dengan membeli paket kuota sesi.
3. **Paham Konteks Nyata Setiap Tombol:** AI pembuat aplikasi tidak akan salah pasang trigger pemotongan kuota (Draft/Hold pesanan tidak terpotong, hanya transaksi/mulai sewa meja resmi yang terpotong).
4. **Bebas Masalah Tampilan QRIS:** Aturan ketat 1 tag `<img>` menjamin QR Code tidak akan pernah muncul bertumpuk atau tumpang-tindih dengan `<canvas>` eksternal.
5. **Pengalaman Pengguna Sempurna:** Auto-Success Celebration Modal dan lonceng suara kasir memberikan kepuasan instan bagi pelanggan saat membayar via QRIS dalam waktu < 2 detik!
