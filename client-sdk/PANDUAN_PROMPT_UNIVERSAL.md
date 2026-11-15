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
PILAR 4: SKEMA POTONG HARI TUNGGAKAN (CONTINUOUS ARREARS BILLING)
======================================================================
Server VOC ML menerapkan sistem perhitungan tagihan berkelanjutan (Continuous Subscription / Potong Biaya Hari Lewat):
Jika pelanggan menunggak / tidak membayar selama beberapa hari kemudian membeli paket perpanjangan, durasi paket baru AKAN DIPOTONG SEJUMLAH HARI TUNGGAKAN tersebut untuk menutup biaya hari yang telah lewat.

1. Rumus Matematis Server:
   `New Expires At = (expires_at_lama) + (durasi_paket_hari)`
   
2. Contoh Kasus Nyata:
   - Kasus A (Telat 6 Hari, Beli 7 Hari):
     * Kedaluwarsa: 9 November 2026.
     * Hari ini: 15 November 2026 (Telat 6 hari).
     * Beli paket 7 hari ➔ Masa aktif baru: 9 Nov + 7 hari = 16 Nov 2026.
     * Sisa masa aktif efektif ke depan: 1 HARI (15 Nov s/d 16 Nov), karena 6 hari terpakai untuk melunasi hari yang telah lewat.
   - Kasus B (Telat 30 Hari, Beli 60 Hari):
     * Telat 30 hari yang lalu.
     * Beli paket 60 hari ➔ Masa aktif baru: (30 hari lalu) + 60 hari = 30 hari ke depan.
     * 30 hari pertama otomatis dipakai menutup tunggakan, menyisakan 30 hari masa aktif ke depan.

3. Ketentuan Tampilan di Modal Tagihan QRIS:
   - Jika `expires_at < today` (menunggak X hari):
     Tampilkan rincian kalkulasi transparan di bawah penampil QRIS:
     "ℹ️ Info Pelunasan: Anda memiliki tunggakan X hari. Durasi paket yang dipilih akan dipotong X hari untuk menutup biaya hari yang lewat."
   - Proteksi Paket Kurang (PENTING):
     Jika pengguna menunggak 10 hari tetapi memilih paket 7 hari, tampilkan peringatan:
     "⚠️ Peringatan: Paket 7 hari belum mencukupi untuk menutup 10 hari tunggakan! Silakan pilih paket minimal 14 hari agar aplikasi dapat aktif kembali."

======================================================================
PILAR 5: ARSITEKTUR REALTIME ULTRA-CEPAT (< 2 DETIK) DUAL-ENGINE
======================================================================
Aplikasi WAJIB merespon perubahan status dari VOCML dalam waktu kurang dari 2 detik (< 2 detik) secara instan TANPA PERLU RELOAD HALAMAN (Zero Page Reload):

A. Skenario Realtime < 2 Detik yang Wajib Didukung:
   1. DIKUNCI DARI VOCML (Remote Lock < 2 Detik):
      Saat admin menekan tombol "Kunci Komputer" di dashboard VOCML, aplikasi klien dalam hitungan milidetik langsung mengunci layar operasional, memunculkan modal peringatan terkunci / tagihan lisensi, dan memblokir klik pada tombol transaksi (misal: "Simpan & Bayar", "PEMBAYARAN", "Simpan Data Potongan & Terbitkan SPK").
   2. PEMBAYARAN QRIS MASUK & LISENSI TERBUKA (< 2 Detik):
      Saat mutasi bank / notifikasi HP mendeteksi transfer QRIS masuk atau admin menyetujui aktivasi, lisensi seketika terbuka dan modal terkunci langsung hilang dalam < 2 detik!
   3. KOREKSI MASA AKTIF SECARA SEKETIKA (State Correction < 2 Detik):
      State lisensi (`expires_at`, `remaining_days`, `status`, `allowed`, `plan`, `trial.remaining`) langsung diperbarui di memori aplikasi (React State / Pinia / Vuex / Redux) seketika. Badge masa aktif di navbar/header (misal "Berlaku hingga: DD/MM/YYYY - X Hari Lagi") otomatis berubah tanpa refresh browser.
   4. PERPANJANGAN DAFTAR PAKET & KODE UNIK TERBARU:
      Jika admin memperbarui daftar paket atau masa berlaku paket di VOCML, data paket dan kode unik QRIS di modal langsung ter-refresh otomatis.

B. Arsitektur Dual-Engine (< 2 Detik):
   - Engine 1: Server-Sent Events (SSE) `/api/v1/stream` (Latensi 0 - 150 ms)
     Buka koneksi persistent streaming:
     `const sse = new EventSource('https://vocml.vocpos.id/api/v1/stream?machine_id=' + mid + '&product=' + product);`
     Dengarkan event-event berikut:
     * `sse.addEventListener('renew', (e) => { handleLicenseUnlocked(JSON.parse(e.data)); });`
     * `sse.addEventListener('unlock', (e) => { handleLicenseUnlocked(JSON.parse(e.data)); });`
     * `sse.addEventListener('lock', (e) => { handleLicenseLocked(JSON.parse(e.data)); });`
     * `sse.addEventListener('update', (e) => { syncLicenseState(); });`
     * `sse.addEventListener('billing', (e) => { syncPackages(); });`
   - Engine 2: Fast-Polling Polling Fallback (Interval 1.5 Detik Saat Terkunci)
     Sebagai fail-safe apabila koneksi SSE terganggu jaringan atau tab browser di-throttle:
     Begitu modal tagihan/terkunci terbuka, nyalakan interval polling 1.5 detik:
     `const pollTimer = setInterval(async () => { const lic = await checkLicense(); if (lic.allowed) { clearInterval(pollTimer); handleLicenseUnlocked(lic); } }, 1500);`
     Hentikan interval begitu modal tertutup atau lisensi sudah aktif.

C. Alur Layar Perayaan Sukses Bayar (Auto-Success Celebration Modal):
   Saat lisensi terbuka kembali akibat event `renew` atau polling sukses:
   1. Putar efek suara lonceng kemenangan / pembayaran kasir ("Ding!").
   2. Tampilkan Layar Sukses Pembayaran:
      - Animasi ikon centang hijau berkilau (CheckCircle) + teks "PEMBAYARAN QRIS BERHASIL DITERIMA".
      - Rincian: Paket Aktif ({package_name}), Nominal ({amount_text}), Masa Aktif Baru Hingga ({expires_at} • {remaining_days} Hari).
   3. Tutup modal secara otomatis atau berikan tombol "✅ Selesai & Lanjutkan" untuk kembali beroperasi tanpa hambatan.

======================================================================
PILAR 6: TOMBOL "SAYA SUDAH BAYAR" & KLAIM VOUCHER PROMO
======================================================================
1. Tombol "✅ Saya Sudah Bayar":
   Saat diklik pengguna, langsung panggil `GET /api/v1/check` secara seketika (0 milidetik). Jika server menyatakan lunas, langsung picu Layar Sukses Pembayaran di Pilar 5.
2. Form Input Kode Voucher:
   - Sediakan input text "Masukkan Kode Voucher Promo" dan tombol "Klaim".
   - Saat tombol diklik, kirim:
     POST https://vocml.vocpos.id/api/v1/voucher/claim
     Body: { "machine_id": "{machine_id}", "product": "{product}", "code": "{input_kode}" }
   - Jika sukses: lisensi seketika aktif terbuka tanpa bayar!

======================================================================
PILAR 7: TITIK PEMOTONGAN KUOTA TRANSAKSI (PAY-PER-TRANSACTION)
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

  // 6. Action potong kuota transaksi
  const consumeQuota = async () => {
    if (!license.trial?.is_trial) return true; // Lisensi unlimited bebas potong
    const res = await fetch(`${VOCML_BASE}/api/v1/trial/consume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machine_id: machineId, product })
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
