# Master Prompt Integrasi Lisensi VOC ML

Dokumen ini berisi **Prompt Siap Pakai (Plug & Play)** untuk diberikan kepada asisten coding AI (ChatGPT, Claude, Gemini, Cursor, dll) saat Anda membuat atau memperbarui aplikasi apa pun (**Aplikasi Kasir POS, Rental Billiard, PesanRahasia, Laundry, Antrean, dsb**) agar langsung terkoneksi sempurna ke server lisensi VOC ML.

---

## 📌 Checklist Sebelum Memberikan Prompt ke AI
Pastikan Anda sudah menyiapkan informasi berikut:
1. **URL Server VOC ML**: `https://vocml.vocpos.id` *(atau `http://localhost:8080` jika masih uji coba lokal)*.
2. **Kode Produk Resmi**:
   - `pos` : Untuk Aplikasi Kasir Toko / POS Retail / Resto.
   - `billiard` : Untuk Aplikasi Billiard & Rental Meja / IoT Management.
   - `messagerahasia` : Untuk Aplikasi PesanRahasia / Chat Enkripsi.
   - *(Atau kode custom lain yang Anda daftarkan di VOC ML)*.
3. **Identitas Unik Klien (Machine ID)**:
   - Aplikasi Desktop/PC: Hardware ID dari CPU/Motherboard (misal via PowerShell `get-machine-id.ps1` atau modul `node-machine-id`).
   - Aplikasi Web/Cloud/Mobile: ID Akun Pengguna / Email unik (misal: `GMAIL-C345-804C-C17C`).
4. **Public Key Server VOC ML**:
   - Ambil dari menu **Pengaturan** di dashboard VOC ML (teks diawali `-----BEGIN PUBLIC KEY-----`).

---

# 📋 MASTER PROMPT UNTUK AI PENGEMBANG APLIKASI
*(Silakan copy seluruh teks di dalam kotak di bawah ini dan berikan langsung ke AI pembuat aplikasi Anda)*

```text
Halo AI, tolong bantu saya mengintegrasikan sistem pengaman lisensi, auto-billing QRIS dinamis, voucher promo, kuota gratis trial, dan pembukaan otomatis seketika menggunakan server VOC ML ke dalam aplikasi saya.

Informasi Konfigurasi Sistem:
======================================================================
- URL Server VOC ML : https://vocml.vocpos.id
- Nama Aplikasi     : [SEBUTKAN NAMA APLIKASI, misal: Cosmo Pool / Kasir POS / PesanRahasia]
- Kode Produk       : [GANTI DENGAN: 'pos' | 'billiard' | 'messagerahasia']
- Identitas Klien   : [Hardware Machine ID atau ID Akun Gmail Pengguna]
- Public Key VOC ML : [PASTE PUBLIC KEY VOC ML DI SINI JIKA VERIFIKASI OFFLINE DIBUTUHKAN]

Tolong buatkan modul integrasi lisensi lengkap (middleware/controller) dan antarmuka Layar Terkunci (Lock Screen) dengan 8 spesifikasi pilar berikut:

======================================================================
1. PENDAFTARAN OTOMATIS SAAT STARTUP (POST /api/v1/register)
======================================================================
Saat aplikasi pertama kali dinyalakan atau user baru login:
- Kirim request HTTP POST ke: https://vocml.vocpos.id/api/v1/register
  Header: Content-Type: application/json
  Body:
  {
    "machine_id": "{machine_id}",
    "product": "{product}",
    "store_name": "{store_name}",
    "app_version": "1.0.0"
  }
- Server akan mendaftarkan client dan otomatis memberikan 3-digit kode unik pembayaran (misal: +321) serta jatah kuota gratis trial pengguna baru jika disetting oleh admin di VOC ML.

======================================================================
2. PENGECEKAN STATUS LISENSI & SMART POLLING (GET /api/v1/check)
======================================================================
Panggil endpoint:
GET https://vocml.vocpos.id/api/v1/check?machine_id={machine_id}&product={product}

Respon Server VOC ML:
{
  "allowed": true,                                    // true jika boleh pakai, false jika diblokir
  "status": "active" | "expiring" | "trial" | "expired" | "locked" | "pending",
  "expires_at": "YYYY-MM-DD",
  "remaining_days": 30,
  "unique_code": 321,
  "trial": {
    "enabled": true,
    "quota": 10,
    "used": 1,
    "remaining": 9,
    "is_trial": true
  },
  "billing": { ... }                                  // Objek tagihan QRIS (terisi saat locked/expired/trial)
}

Aturan Izin Akses:
- Akses DIIZINKAN (allowed: true) jika status adalah: 'active', 'expiring', atau 'trial'.
- Akses DIBLOKIR (allowed: false) jika status adalah: 'expired', 'locked', atau 'pending'.
- Polling Cerdas (Smart Polling):
  * Jika aplikasi berjalan normal (allowed: true): jalankan cek status setiap 3 jam sekali.
  * Jika aplikasi sedang terkunci (allowed: false): jalankan Fast Polling setiap 2 detik sekali agar begitu pembeli membayar QRIS, aplikasi otomatis terbuka tanpa reload manual.

======================================================================
3. PROTEKSI FITUR UTAMA & KONSUMSI TRIAL (POST /api/v1/trial/consume)
======================================================================
Jika akun berstatus 'trial' (misal: Kasir POS dapat trial 50 transaksi, atau Billiard dapat trial 10 sesi main):
- Pasang pemanggilan API ini tepat sebelum aksi utama dieksekusi:
  * Pada Kasir POS : Panggil saat kasir menekan tombol "Bayar" / Cetak Struk penjualan.
  * Pada Billiard  : Panggil saat kasir menekan tombol "▶ MULAI" / Sewa Meja.
  * Pada Pesan     : Panggil saat user menekan tombol "Kirim Pesan".

Endpoint Pemotongan Kuota:
POST https://vocml.vocpos.id/api/v1/trial/consume
Body: { "machine_id": "{machine_id}", "product": "{product}" }

Logika Penanganan:
- Jika HTTP 200 OK: proses aksi utama diizinkan berjalan normal. Perbarui badge sisa kuota di layar (`trial.remaining`).
- Jika HTTP 403 Forbidden (Kuota Habis):
  * Batalkan proses aksi utama (jangan simpan transaksi / jangan nyalakan meja).
  * Tampilkan pesan error: "Kuota gratis trial Anda telah habis. Silakan lakukan perpanjangan lisensi."
  * Langsung kunci aplikasi dan buka Layar Tagihan QRIS!
- Catatan: Jika lisensi berbayar sudah aktif ('active'), endpoint ini otomatis lolos tanpa memotong kuota.

======================================================================
4. LAYAR TERKUNCI MULTI-TIER PAKET & QRIS DINAMIS
======================================================================
Saat status lisensi terkunci (allowed: false):
- Tampilkan Layar Terkunci (Lock Screen) elegan yang memblokir navigasi menu aplikasi.
- Ambil data paket perpanjangan dari objek `billing.packages` (atau via GET /api/v1/billing):
  * Tampilkan tombol pilihan paket durasi: 7 Hari, 14 Hari, 1 Bulan, 3 Bulan, 1 Tahun.
  * Setiap paket otomatis memiliki nominal unik (misal Rp 60.321) dan badge diskon promo (misal "DISKON 20%").
  * Saat user memilih paket tertentu, gambar QRIS (`billing.packages[i].qris_image_url`) dan nominal total otomatis berganti seketika di layar!
  * Tampilkan teks instruksi: "Scan QRIS di atas melalui GoPay, OVO, Dana, ShopeePay, BCA, Mandiri, dll. Aplikasi akan terbuka otomatis detik itu juga setelah transfer berhasil."

======================================================================
5. TOMBOL INSTAN "SAYA SUDAH BAYAR" (0 ms DELAY)
======================================================================
Pada Layar Terkunci QRIS:
- Sediakan tombol interaktif berwarna hijau: "✅ Saya Sudah Bayar (Buka Sekarang)".
- Saat diklik pengguna: aplikasi langsung memanggil `GET /api/v1/check` seketika itu juga (0 milidetik tanpa menunggu interval 2 detik).
- Jika server sudah memverifikasi mutasi bank/QRIS, respon langsung `allowed: true` dan aplikasi langsung me-reload layar utama menjadi terbuka!

======================================================================
6. FORM KLAIM KODE VOUCHER PROMO (POST /api/v1/voucher/claim)
======================================================================
Pada Layar Terkunci, sediakan form input kode promo:
- Input text: "Masukkan Kode Voucher Promo (cth: DISKON50 / COBATRIAL)"
- Tombol: "Gunakan Voucher"
- Saat tombol diklik, kirim:
  POST https://vocml.vocpos.id/api/v1/voucher/claim
  Header: Content-Type: application/json
  Body:
  {
    "machine_id": "{machine_id}",
    "product": "{product}",
    "code": "{input_kode}"
  }
- Penanganan Hasil:
  * Jika voucher bertipe 'free_days' (Hari Gratis): Lisensi seketika aktif tanpa perlu bayar! Langsung tutup layar terkunci dan buka aplikasi.
  * Jika voucher bertipe 'trial_quota': Kuota bertambah otomatis, langsung buka aplikasi.
  * Jika voucher bertipe 'discount_nominal': Tampilkan info diskon berhasil dan refresh harga paket tagihan QRIS.
  * Jika gagal: Tampilkan notifikasi error dari server (cth: "Voucher sudah kedaluwarsa atau habis").

======================================================================
7. PESAN BROADCAST ADMIN (GET /api/v1/messages)
======================================================================
Secara berkala (misal setiap 2 menit), panggil:
GET https://vocml.vocpos.id/api/v1/messages?machine_id={machine_id}&product={product}
- Jika terdapat pesan aktif dari admin, tampilkan sebagai floating banner / toast pemberitahuan di atas aplikasi klien (misal info jadwal maintenance, info update, atau promo khusus).

======================================================================
8. VERIFIKASI OFFLINE TERTANDATANGAN (Ed25519)
======================================================================
- Respon `/check` menyertakan tanda tangan digital Ed25519 pada field `token`.
- Jika sewaktu-waktu koneksi internet klien terputus mendadak, aplikasi tetap diizinkan berjalan normal (Offline Grace Period) selama rentang waktu toleransi (default: 5 hari) dengan memvalidasi token terakhir secara lokal menggunakan Public Key Ed25519 VOC ML.

Tolong buatkan kode implementasinya secara modular, bersih, terdokumentasi, dan sertakan contoh template UI Layar Terkunci (HTML/CSS) yang modern dan responsif.
```

---

## 🛠️ Ringkasan Endpoint API Server VOC ML

| No | Endpoint | Method | Keterangan & Kapan Digunakan |
| :---: | :--- | :---: | :--- |
| **1** | `/api/v1/register` | `POST` | Registrasi awal mesin/user saat startup aplikasi. |
| **2** | `/api/v1/check` | `GET` | Cek status lisensi, masa aktif, kuota trial, dan billing QRIS. |
| **3** | `/api/v1/trial/consume` | `POST` | Potong 1 kuota trial saat aksi utama dijalankan (bayar/mulai meja/kirim pesan). |
| **4** | `/api/v1/voucher/claim` | `POST` | Klaim kode voucher promo (hari gratis / potongan harga / kuota). |
| **5** | `/api/v1/billing` | `GET` | Mengambil daftar paket durasi & gambar QRIS dinamis. |
| **6** | `/api/v1/messages` | `GET` | Mengambil pesan broadcast aktif dari admin ke client. |

---

## 💡 Contoh Integrasi Cepat (Node.js/Express)

Simpan sebagai `vocml-guard.js` di server aplikasi Anda:

```javascript
// vocml-guard.js
const VOCML_BASE = 'https://vocml.vocpos.id';
const PRODUCT = 'pos'; // 'pos' | 'billiard' | 'messagerahasia'

export async function checkAccess(machineId) {
  try {
    const res = await fetch(`${VOCML_BASE}/api/v1/check?machine_id=${encodeURIComponent(machineId)}&product=${PRODUCT}`);
    const data = await res.json();
    return data;
  } catch (err) {
    // Mode offline sementara bila jaringan internet mati
    return { allowed: true, offline_mode: true };
  }
}

export async function consumeTrial(machineId) {
  try {
    const res = await fetch(`${VOCML_BASE}/api/v1/trial/consume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machine_id: machineId, product: PRODUCT })
    });
    return await res.json();
  } catch (err) {
    return { allowed: true };
  }
}
```

Tinggal pasang di rute utama aplikasi Anda:
```javascript
// Middleware pengunci rute
app.use(async (req, res, next) => {
  const status = await checkAccess(req.headers['x-machine-id']);
  if (!status.allowed) {
    return res.status(403).json({
      locked: true,
      message: 'Aplikasi Terkunci. Silakan lakukan aktivasi lisensi.',
      billing: status.billing
    });
  }
  next();
});
```
