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
4. **Konfigurasi Webhook Server VOC ML (Target 1)**:
   - Webhook URL: `https://vocml.vocpos.id/api/v1/webhook/phone-notification`
   - Webhook Secret Key: `[Secret-Key-Server-VOCML]`
5. **Konfigurasi Dual-Webhook Kasir Billiard & CFD (Target 2)**:
   - Aktifkan toggle switch **Kasir Billiard & CFD (Dual-Webhook)**.
   - Webhook URL Kasir: `http://<IP_KOMPUTER_KASIR>:3000/api/webhook/payment-notification`
     *(Contoh: `http://192.168.100.24:3000/api/webhook/payment-notification`)*
   - Secret Key Kasir: `[Secret-Key-Kasir-dari-Menu-Settings-Web]`
6. **Audio Soundbox Kasir (Suara Lantang)**:
   - Aktifkan toggle switch **Audio Soundbox Kasir**.
   - HP akan bersuara otomatis dalam Bahasa Indonesia saat ada pembayaran masuk (*"Pembayaran [nominal] rupiah via [Bank/E-Wallet] berhasil diterima"*).
7. Klik **Simpan**, lalu klik **Tes Kirim** untuk menguji kedua server sekaligus.

---

## Daftar Aplikasi yang Didukung Penuh
- **Bank Mandiri**: Livin' Merchant by Mandiri (`id.co.bankmandiri.livinmerchant`), Livin' by Mandiri, EDC Mandiri
- **GoPay / Gojek**: Aplikasi GoPay (`com.gojek.gopay`), Gojek Super-App (`com.gojek.app`), GoBiz Merchant (`com.gojek.gobiz`)
- **ShopeePay / Shopee**: ShopeePay (`com.shopeepay.id`), Shopee (`com.shopee.id`), Shopee Seller (`com.shopee.seller`)
- **Bank BCA**: BCA Mobile (`com.bca`), myBCA (`id.co.bca.mybca`), BCA Merchant (`com.bca.merchant`)
- **Bank BRI**: BRImo (`id.co.bri.brimo`), EDC BRI
- **Bank BNI**: BNI Mobile Banking (`src.com.bni`), EDC BNI
- **DANA**: DANA (`id.dana`), DANA Bisnis (`id.dana.business`)
- **OVO**: OVO Merchant (`ovo.id`)
- **Bank Digital**: SeaBank (`id.co.seabank.app`), Bank Jago (`com.jago.digitalBanking`)

---

## Format Data yang Dikirim ke Server VOC ML & Kasir

Setiap ada notifikasi pembayaran masuk di HP, aplikasi mengirim HTTP POST:

**Header:**
```http
Content-Type: application/json
X-VOCML-Secret: [Secret-Key-Anda]
```

**Body (JSON):**
```json
{
  "provider": "GOPAY",
  "source_name": "GoPay (QRIS GoPay)",
  "method": "QRIS",
  "amount": 50000,
  "title": "Pembayaran QRIS statis diterima",
  "text": "Rp 50.000 di Virtual Operation Control.",
  "app": "com.gojek.gopay",
  "timestamp": 1794617380000,
  "battery": 95,
  "charging": true,
  "device": "Xiaomi 2201117PG"
}
```

