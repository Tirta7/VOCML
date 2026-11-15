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

Tolong buatkan modul integrasi lisensi lengkap (`vocml-license.js`) dan komponen UI Modal "Daftar Paket Lisensi & Perpanjangan" dengan 9 pilar spesifikasi berikut:

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
PILAR 3: KUOTA GRATIS TRIAL PENGGUNA BARU (/api/v1/trial/consume)
======================================================================
ATURAN EMAS KONSUMSI TRIAL (MENCEGAH PEMOTONGAN GANDA / 2x DEDUCT):
- Panggilan POST ke /api/v1/trial/consume HANYA BOLEH DILAKUKAN DI SATU TEMPAT:
  ✅ REKOMENDASI UTAMA: Letakkan di Backend Controller/Middleware saat menyimpan data transaksi ke database (/api/transactions atau simpan penjualan/SPK).
  ❌ DILARANG: Memanggil /api/v1/trial/consume di Frontend (tombol kasir) JIKA Backend sudah memotongnya, agar 1 transaksi tidak terpotong 2x!

Titik Aksi Resmi Pemotongan Kuota:
1. Pada ENKATEXTILE: Saat kasir menekan tombol ungu: "Simpan & Bayar" (Nota Penjualan Kain Terbit).
2. Pada KONVEKSI ERP: Saat admin menekan tombol biru: "Simpan Data Potongan & Terbitkan SPK".
   (PENTING: Tombol "Simpan Draft Saja" TIDAK MEMOTONG KUOTA / Gratis simpan draft).
3. Pada KASIR POS (Velco): Saat kasir menekan tombol merah: "PEMBAYARAN" / Cetak Struk. (Hold pesanan gratis).
4. Pada BILLIARD: Saat kasir menekan tombol: "▶ Mulai Sewa Meja" / Nyalakan Lampu.

Payload Request:
POST https://vocml.vocpos.id/api/v1/trial/consume
Header: Content-Type: application/json
Body:
{
  "machine_id": "{machine_id}",
  "product": "{product}",
  "count": 1
}

Penanganan Hasil:
- Jika allowed: true ➔ Lanjutkan simpan transaksi ke database & kurangi sisa kuota trial di memori UI (`trial.remaining`).
- Jika allowed: false (kuota trial habis):
  Kunci aplikasi seketika, broadcast status ke browser klien, dan tampilkan Layar Terkunci QRIS.

======================================================================
PILAR 4: SKEMA TAGIHAN BERKELANJUTAN (CONTINUOUS ARREARS BILLING)
======================================================================
Server VOC ML menerapkan sistem akumulasi hari tunggakan:
- Rumus Masa Aktif Baru:
  New Expires At = (Tanggal Expired Lama) + (Durasi Paket yang Dibeli)
- Durasi paket baru otomatis dipotong untuk menutup hari-hari tunggakan yang telah lewat.
  (Contoh: Expired 6 hari lalu, beli paket 7 hari ➔ sisa aktif ke depan 1 hari).

Ketentuan Tampilan Modal QRIS saat Expired (remaining_days < 0):
1. Tampilkan Box Info Pelunasan:
   "ℹ️ Info Pelunasan: Lisensi Anda telah kedaluwarsa X hari lalu. Paket yang Anda pilih akan dipotong X hari untuk menutup masa tunggakan hari yang telah lewat."
2. Proteksi Pilihan Paket (Insufficient Package Protection):
   Jika pengguna menunggak X hari (misal 10 hari) dan mengeklik paket yang durasinya <= X hari (misal 7 hari), tampilkan peringatan:
   "⚠️ Paket 7 hari belum mencukupi untuk melunasi 10 hari tunggakan! Silakan pilih paket minimal 14 hari agar aplikasi dapat aktif kembali."
3. Default Paket Terkunci:
   Arahkan default ke paket yang mencukupi tunggakan (misal paket 30 hari), BUKAN paket terkecil (1 hari).

======================================================================
PILAR 5: ATURAN SINGLE QRIS IMAGE (ANTI GAMBAR TERTUMPUK GANDA)
======================================================================
Buatkan modal dialog 2 kolom yang modern, bersih, dan responsif:

A. Kolom Kanan (Pilihan Paket Lisensi):
   - Ambil daftar paket dari array `billing.packages` hasil respon server.
   - Tampilkan kartu radio pilihan durasi (misal: 1 Bulan, 3 Bulan, 6 Bulan, 1 Tahun, atau Kuota Transaksi).
   - Tampilkan harga berakhiran 3-digit kode unik (misal Rp 450.321) dan badge diskon promo (misal "HEMAT 20%").
   - Set paket yang mencukupi masa tunggakan sebagai paket terpilih secara default (`selectedPackage`).

B. Kolom Kiri (Penampil QRIS Tunggal - BEBAS GAMBAR GANDA):
   - PENTING (ATURAN KETAT): HANYA TAMPILKAN 1 TAG <img /> DARI URL SERVER:
     <img src={selectedPackage?.qris_image_url || billing?.qris_image_url} alt="QRIS VOC ML" className="w-52 h-52 object-contain" />
   - DILARANG me-render tag <canvas> atau library QRCode terpisah di atas gambar QRIS agar QR code tidak muncul bertumpuk atau tumpang-tindih.
   - Saat pengguna mengklik paket lain di kolom kanan, 1 gambar QRIS dan label TOTAL TAGIHAN di sebelah kiri otomatis berganti seketika!

======================================================================
PILAR 6: DUAL-ENGINE REALTIME < 2 DETIK (SSE + FAST POLLING)
======================================================================
Aplikasi WAJIB merespon perubahan status dari VOCML dalam waktu kurang dari 2 detik (< 2 detik) secara instan TANPA PERLU RELOAD HALAMAN (Zero Page Reload):

1. Engine 1 - SSE Stream (/api/v1/stream?machine_id={mid}&product={product}):
   - Event 'lock': Langsung set state allowed = false dan kunci layar operasional seketika (< 150ms) tanpa menunggu fetch ulang.
   - Event 'renew' / 'unlock': Segera buka modal terkunci, putar efek lonceng kasir ("Ding!"), perbarui badge navbar seketika (zero page reload), dan tampilkan Layar Sukses Pembayaran ("PEMBAYARAN QRIS BERHASIL DITERIMA") beserta tombol Download Invoice & rincian masa aktif baru.
   - Event 'update' / 'billing': Sinkronkan paket lisensi dan status terbaru di memori.
2. Engine 2 - Fast Polling Fallback (Interval 1.5 Detik):
   - Nyalakan interval polling 1.5 detik HANYA saat modal tagihan / layar terkunci sedang terbuka.
   - Hentikan polling segera setelah lisensi terverifikasi lunas (allowed === true).

======================================================================
PILAR 7: TOMBOL "SAYA SUDAH BAYAR" & KLAIM VOUCHER PROMO
======================================================================
1. Tombol "✅ Saya Sudah Bayar":
   Saat diklik pengguna, langsung panggil `GET /api/v1/check` secara seketika (0 milidetik). Jika server menyatakan lunas, langsung picu Layar Sukses Pembayaran di Pilar 6.
2. Form Input Kode Voucher:
   - Sediakan input text "Masukkan Kode Voucher Promo" dan tombol "Klaim".
   - Saat tombol diklik, kirim:
     POST https://vocml.vocpos.id/api/v1/voucher/claim
     Body: { "machine_id": "{machine_id}", "product": "{product}", "code": "{input_kode}" }
   - Jika sukses: lisensi seketika aktif terbuka tanpa bayar!

======================================================================
PILAR 8: PESAN BROADCAST ADMIN (/api/v1/messages)
======================================================================
Secara berkala (tiap 2 menit), panggil:
GET https://vocml.vocpos.id/api/v1/messages?machine_id={machine_id}&product={product}
- Jika terdapat pesan aktif dari admin, tampilkan sebagai floating toast banner di sudut layar aplikasi.

======================================================================
PILAR 9: VERIFIKASI OFFLINE TERTANDATANGAN (Ed25519)
======================================================================
- Respon `/check` menyertakan token Ed25519.
- Simpan token tersebut ke LocalStorage / cache file lokal.
- Jika sewaktu-waktu koneksi internet toko/pabrik terputus sementara, aplikasi tetap diizinkan membuka transaksi selama batas toleransi offline (default 5 hari) dengan memvalidasi token terakhir secara lokal.

Tolong implementasikan kode secara bersih, modular, terdokumentasi (React/Next.js/Vue/HTML Tailwind), dan langsung siap dihubungkan ke server VOC ML!

======================================================================
CONTOH IMPLEMENTASI REFERENSI (REACT / NEXT.JS HOOK < 2 DETIK):
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
    trial: null,
    billing: null,
    isLocked: false
  });
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState(null);
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
      setLicense(prev => ({
        ...prev,
        allowed: data.allowed,
        status: data.status,
        expiresAt: data.expires_at,
        remainingDays: data.remaining_days,
        trial: data.trial,
        billing: data.billing,
        isLocked: !data.allowed
      }));
      return data;
    } catch (err) {
      console.warn('[VOCML] Check error, using cache/offline tolerance', err);
      return null;
    }
  }, [machineId, product, storeName]);

  // 2. Handler saat lisensi terbuka (Pembayaran Berhasil / Admin Unlock) < 2 Detik
  const handleUnlocked = useCallback((payload = {}) => {
    // Bunyikan lonceng perayaan
    try {
      const audio = new Audio('/sounds/payment-success.mp3');
      audio.play().catch(() => {});
    } catch {}

    // Mutasi state lisensi seketika (Koreksi masa aktif & hilangkan kunci)
    setLicense(prev => ({
      ...prev,
      allowed: true,
      status: 'active',
      isLocked: false,
      expiresAt: payload.expires_at || prev.expiresAt,
      remainingDays: payload.remaining_days || prev.remainingDays
    }));

    // Tampilkan perayaan sukses bayar
    setCelebrationData({
      packageName: payload.package || 'Langganan Aktif',
      amountText: payload.amount_text || '',
      expiresAt: payload.expires_at || ''
    });
    setShowCelebration(true);

    // Sync ulang paket & kuota terbaru di background
    fetchCheck();
  }, [fetchCheck]);

  // 3. Handler saat dikunci remote dari VOCML (< 2 Detik)
  const handleLocked = useCallback((payload = {}) => {
    setLicense(prev => ({
      ...prev,
      allowed: false,
      status: 'locked',
      isLocked: true,
      lockReason: payload.reason || 'Aplikasi dinonaktifkan sementara oleh admin lisensi'
    }));
  }, []);

  // 4. Engine 1: Server-Sent Events (SSE) Persistent Stream (Latensi < 150ms)
  useEffect(() => {
    if (!machineId || !product) return;
    fetchCheck();

    const sseUrl = `${VOCML_BASE}/api/v1/stream?machine_id=${machineId}&product=${product}`;
    const sse = new EventSource(sseUrl);

    sse.addEventListener('renew', (e) => {
      try { handleUnlocked(JSON.parse(e.data)); } catch { handleUnlocked(); }
    });
    sse.addEventListener('unlock', (e) => {
      try { handleUnlocked(JSON.parse(e.data)); } catch { handleUnlocked(); }
    });
    sse.addEventListener('lock', (e) => {
      try { handleLocked(JSON.parse(e.data)); } catch { handleLocked(); }
    });
    sse.addEventListener('update', () => fetchCheck());
    sse.addEventListener('billing', () => fetchCheck());

    return () => {
      sse.close();
    };
  }, [machineId, product, fetchCheck, handleUnlocked, handleLocked]);

  // 5. Engine 2: Fast Polling Fail-Safe (1.5 Detik Saat Terkunci)
  useEffect(() => {
    if (license.isLocked) {
      pollRef.current = setInterval(async () => {
        const latest = await fetchCheck();
        if (latest && latest.allowed) {
          clearInterval(pollRef.current);
          handleUnlocked(latest);
        }
      }, 1500); // Polling setiap 1.5 detik (< 2 detik respon)
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [license.isLocked, fetchCheck, handleUnlocked]);

  // 6. Action potong kuota transaksi (Backend/Controller Utama)
  const consumeQuota = async () => {
    if (!license.trial?.is_trial) return true; // Lisensi unlimited bebas potong
    const res = await fetch(`${VOCML_BASE}/api/v1/trial/consume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machine_id: machineId, product, count: 1 })
    });
    if (res.ok) {
      setLicense(prev => ({
        ...prev,
        trial: { ...prev.trial, remaining: Math.max(0, (prev.trial?.remaining || 1) - 1) }
      }));
      return true;
    }
    // Kuota habis -> kunci layar
    setLicense(prev => ({ ...prev, allowed: false, isLocked: true }));
    return false;
  };

  return {
    license,
    isLocked: license.isLocked,
    showCelebration,
    closeCelebration: () => setShowCelebration(false),
    celebrationData,
    consumeQuota,
    refreshLicense: fetchCheck
  };
}
```
```

---

## 📌 Rangkuman Manfaat Standarisasi Ini:
1. **Paham Konteks Nyata Setiap Tombol:** AI pembuat aplikasi tidak akan salah pasang trigger pemotongan kuota (Draft tidak terpotong, hanya transaksi resmi yang terpotong).
2. **Bebas Masalah Tampilan:** Aturan ketat 1 tag `<img>` menjamin QR Code tidak akan bertumpuk dua.
3. **Pengalaman Pengguna Sempurna:** Auto-Success Celebration Modal dan notifikasi suara lonceng memberikan kepuasan instan bagi pelanggan saat membayar dengan QRIS!
