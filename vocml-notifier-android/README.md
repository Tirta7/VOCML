# VOC ML Notifier (Aplikasi Android Penangkap Notifikasi QRIS)

Aplikasi Android khusus untuk mendengarkan (*listen*) notifikasi transaksi pembayaran masuk secara real-time dari aplikasi E-Wallet & Bank (khususnya **Shopee / ShopeePay**, BCA Mobile, BCA Merchant, Mandiri Livin, GoBiz, OVO, Dana) dan otomatis meneruskannya (forward via Webhook HTTP POST) ke server lisensi **VOC ML**.

---

## Fitur Utama

1. **Background Notification Listener (`NotificationListenerService`)**:
   - Berjalan senyap di latar belakang secara otomatis.
   - Menyaring hanya notifikasi transaksi (Shopee, ShopeePay, BCA, dsb).
   - Ekstrak teks dan nominal transaksi rupiah secara otomatis.
2. **Auto-Forward Webhook ke VOC ML**:
   - Mengirim data notifikasi ke endpoint webhook VOC ML dengan keamanan `X-VOCML-Secret`.
3. **Auto-Start on Boot**:
   - Jika HP mati lalu dinyalakan ulang (reboot), aplikasi langsung aktif kembali tanpa perlu dibuka manual.
4. **Fitur Anti-Tidur (Bypass Battery Optimization)**:
   - Tombol 1-klik untuk meminta izin Android agar aplikasi tidak dibunuh oleh penghemat daya / Doze Mode saat layar HP mati.
5. **Dashboard & Log Transaksi**:
   - Tampilan Dark Mode modern.
   - Status visual (Lampu Hijau = Aktif, Lampu Merah = Izin belum diberikan).
   - Tombol **"Tes Kirim"** untuk menguji koneksi HP ke server VOC ML.
   - Riwayat live log notifikasi yang masuk dan status HTTP response dari server.

---

## Cara Build APK Menggunakan Android Studio

1. Buka **Android Studio** di komputer Anda.
2. Pilih menu **File** -> **Open...** lalu pilih folder:
   ```
   VOCML/vocml-notifier-android
   ```
3. Tunggu proses *Gradle Sync* selesai (pastikan komputer terhubung ke internet untuk mendownload dependency AndroidX & OkHttp).
4. Untuk membuat file APK:
   - Klik menu **Build** -> **Build Bundle(s) / APK(s)** -> **Build APK(s)**.
   - Setelah selesai, akan muncul notifikasi *Build APK(s) successfully*. Klik link **locate** untuk melihat file `app-debug.apk`.
5. Kirim file APK tersebut ke HP Android Anda (bisa lewat WhatsApp, Telegram, kabel data, atau Google Drive) dan install.

---

## Cara Penggunaan di HP Android

1. Buka aplikasi **VOC ML Notifier** di HP Anda.
2. Klik tombol merah **"Buka Izin Notifikasi HP"**:
   - Android akan membuka halaman pengaturan akses notifikasi.
   - Cari **VOC ML Notifier** dan geser saklar menjadi **IZINKAN / AKTIF**.
   - Kembali ke aplikasi, indikator akan berubah menjadi **Hijau (Layanan Aktif)**.
3. Klik tombol **"Abaikan Hemat Baterai"** dan pilih **Izinkan** agar aplikasi tidak dimatikan Android saat HP layar terkunci / standby.
4. Masukkan **Webhook URL Server** Anda:
   - Contoh: `https://privatmassage.vocpos.id/api/v1/webhook/phone-notification` (atau URL server Anda).
5. Masukkan **Webhook Secret Key** (kode rahasia untuk memvalidasi request dari HP).
6. Klik **Simpan**, lalu klik **Tes Kirim** untuk memastikan HP berhasil terhubung ke server VOC ML.

---

## Format Data yang Dikirim ke Server VOC ML

Setiap ada notifikasi pembayaran masuk di HP, aplikasi mengirim HTTP POST:

**Header:**
```http
Content-Type: application/json
X-VOCML-Secret: [Secret-Key-Anda]
```

**Body (JSON):**
```json
{
  "app": "com.shopee.id",
  "title": "Pembayaran Berhasil",
  "text": "Kamu menerima pembayaran QRIS sebesar Rp 450.123 dari BCA...",
  "amount": "450123",
  "timestamp": 1793470708227
}
```

