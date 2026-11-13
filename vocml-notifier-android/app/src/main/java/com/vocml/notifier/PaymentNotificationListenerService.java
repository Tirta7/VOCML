package com.vocml.notifier;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.wifi.WifiManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class PaymentNotificationListenerService extends NotificationListenerService {
    private static final String TAG = "VOCML_Listener";
    public static final String ACTION_NEW_NOTIFICATION = "com.vocml.notifier.NEW_NOTIF";
    public static final String ACTION_RETRY_FAILED = "com.vocml.notifier.RETRY_FAILED";

    private static final String CHANNEL_ID = "vocml_gateway_channel";
    private static final int FOREGROUND_NOTIF_ID = 8801;

    // Daftar paket aplikasi e-wallet & perbankan yang dipantau
    private static final Set<String> TARGET_PACKAGES = new HashSet<>(Arrays.asList(
            // Shopee & ShopeePay
            "com.shopeepay.id",               // ShopeePay Indonesia
            "com.shopee.id",                  // Shopee Consumer (ShopeePay)
            "com.shopee.spay",                // ShopeePay Standalone / Merchant
            "com.shopee.seller",              // Shopee Partner / Seller
            // Bank Mandiri (Konsumer & Merchant)
            "id.co.bankmandiri.livinmerchant",// Livin' Merchant by Mandiri (QRIS Kasir Mandiri)
            "id.co.mandiri.livero",           // Livin' by Mandiri (Mobile Banking)
            "id.co.bankmandiri.merchant",     // Mandiri Merchant
            "com.bankmandiri.livinmerchant",  // Livin' Merchant App ID
            "com.bankmandiri.merchant",       // Mandiri Merchant App ID
            "id.co.mandiri.merchant",         // Mandiri Merchant ID
            // Bank BCA
            "com.bca",                        // BCA Mobile
            "id.co.bca.mybca",                // myBCA
            "com.bca.merchant",               // BCA Merchant
            // Bank BRI, BNI, Jago, SeaBank
            "id.co.bri.brimo",                // BRImo
            "src.com.bni",                    // BNI Mobile
            "id.co.seabank.app",              // SeaBank
            "com.jago.digitalBanking",        // Bank Jago
            // E-Wallet & Lainnya
            "com.gojek.gofoodmerchant",       // GoBiz / GoPay Merchant
            "com.gojek.app",                  // Gojek / GoPay
            "id.dana",                        // DANA
            "id.dana.business",               // DANA Bisnis
            "ovo.id",                         // OVO
            "com.telkom.indihome.queuesystem" // LinkAja / lainnya
    ));

    // Regex untuk mendeteksi nominal uang, misal: Rp 450.000 atau Rp350.568 atau IDR 450.000
    private static final Pattern MONEY_PATTERN = Pattern.compile("(?:Rp|IDR)\\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?|[0-9]+)", Pattern.CASE_INSENSITIVE);

    private Handler retryHandler;
    private WifiManager.WifiLock wifiLock;
    private ConnectivityManager.NetworkCallback networkCallback;
    private final AtomicBoolean isFlushingQueue = new AtomicBoolean(false);
    private long lastHeartbeatSentAt = 0;

    private final Runnable periodicRetryRunnable = new Runnable() {
        @Override
        public void run() {
            flushPendingQueue();
            long now = System.currentTimeMillis();
            if (now - lastHeartbeatSentAt >= 180_000) { // Kirim sinyal Heartbeat + Baterai tiap 3 menit
                sendHeartbeatToServer();
            }
            if (retryHandler != null) {
                retryHandler.postDelayed(this, 10_000); // Cek antrean tertunda tiap 10 detik
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        retryHandler = new Handler(Looper.getMainLooper());
        startForegroundGuardian();
        acquireWifiLock();
        registerNetworkCallback();
        retryHandler.postDelayed(periodicRetryRunnable, 5_000);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForegroundGuardian();
        if (intent != null && ACTION_RETRY_FAILED.equals(intent.getAction())) {
            recoverFailedLogsToQueue();
            flushPendingQueue();
        }
        if (System.currentTimeMillis() - lastHeartbeatSentAt >= 60_000L) {
            sendHeartbeatToServer();
        }
        return START_STICKY;
    }

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        Log.i(TAG, "Notification Listener Service Tersambung (Aktif 24/7)!");
        startForegroundGuardian();
        recoverFailedLogsToQueue();
        flushPendingQueue();
        sendHeartbeatToServer();
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        Log.w(TAG, "Notification Listener terputus — meminta sistem Android menyambungkan ulang...");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            try {
                requestRebind(new ComponentName(this, PaymentNotificationListenerService.class));
            } catch (Exception e) {
                Log.e(TAG, "Gagal requestRebind: " + e.getMessage());
            }
        }
    }

    @Override
    public void onDestroy() {
        if (retryHandler != null) {
            retryHandler.removeCallbacksAndMessages(null);
        }
        releaseWifiLock();
        unregisterNetworkCallback();
        super.onDestroy();
    }

    /**
     * Jalankan sebagai Foreground Service agar CPU & Jaringan TIDAK dimatikan saat HP terkunci / Sleep
     */
    private void startForegroundGuardian() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID,
                        "VOC ML Payment Gateway 24/7",
                        NotificationManager.IMPORTANCE_LOW
                );
                channel.setDescription("Menjaga pembaca notifikasi QRIS tetap aktif saat layar HP terkunci/sleep");
                channel.setShowBadge(false);
                nm.createNotificationChannel(channel);
            }

            Intent openIntent = new Intent(this, MainActivity.class);
            int piFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                    ? PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
                    : PendingIntent.FLAG_UPDATE_CURRENT;
            PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, openIntent, piFlags);

            Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                    .setContentTitle("VOC ML Gateway Aktif (Siaga 24/7)")
                    .setContentText("Memantau pembayaran QRIS meskipun layar HP terkunci")
                    .setSmallIcon(R.drawable.ic_launcher)
                    .setContentIntent(pendingIntent)
                    .setOngoing(true)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .build();

            startForeground(FOREGROUND_NOTIF_ID, notification);
        } catch (Exception e) {
            Log.e(TAG, "startForegroundGuardian error: " + e.getMessage());
        }
    }

    private void acquireWifiLock() {
        try {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null && wifiLock == null) {
                int lockType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                        ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY
                        : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
                wifiLock = wm.createWifiLock(lockType, "VOCML::WifiLock");
                wifiLock.setReferenceCounted(false);
                wifiLock.acquire();
            }
        } catch (Exception e) {
            Log.e(TAG, "acquireWifiLock error: " + e.getMessage());
        }
    }

    private void releaseWifiLock() {
        try {
            if (wifiLock != null && wifiLock.isHeld()) {
                wifiLock.release();
            }
        } catch (Exception ignored) {}
    }

    /**
     * Bangunkan CPU selama N milidetik saat notifikasi masuk ketika layar HP mati/sleep
     */
    private PowerManager.WakeLock acquireTempWakeLock(long timeoutMs) {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                PowerManager.WakeLock wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "VOCML::PaymentWakeLock");
                wl.setReferenceCounted(false);
                wl.acquire(timeoutMs);
                return wl;
            }
        } catch (Exception e) {
            Log.e(TAG, "acquireTempWakeLock error: " + e.getMessage());
        }
        return null;
    }

    private void registerNetworkCallback() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return;
            NetworkRequest req = new NetworkRequest.Builder()
                    .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    .build();
            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    Log.i(TAG, "Koneksi internet aktif kembali — mengirim antrean webhook tertunda...");
                    if (retryHandler != null) {
                        retryHandler.postDelayed(() -> flushPendingQueue(), 1500);
                    }
                }
            };
            cm.registerNetworkCallback(req, networkCallback);
        } catch (Exception e) {
            Log.e(TAG, "registerNetworkCallback error: " + e.getMessage());
        }
    }

    private void unregisterNetworkCallback() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null && networkCallback != null) {
                cm.unregisterNetworkCallback(networkCallback);
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;

        String packageName = sbn.getPackageName();
        if (packageName == null || packageName.equals(getPackageName())) return;

        Notification notification = sbn.getNotification();
        if (notification == null) return;

        Bundle extras = notification.extras;
        if (extras == null) return;

        CharSequence titleCs = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence textCs = extras.getCharSequence(Notification.EXTRA_TEXT);
        CharSequence bigTextCs = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        CharSequence subTextCs = extras.getCharSequence(Notification.EXTRA_SUB_TEXT);
        CharSequence[] textLines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);

        String title = titleCs != null ? titleCs.toString() : "";
        String text = textCs != null ? textCs.toString() : "";
        if (bigTextCs != null && bigTextCs.length() > text.length()) {
            text = bigTextCs.toString();
        }
        if (textLines != null && textLines.length > 0) {
            StringBuilder sb = new StringBuilder(text);
            for (CharSequence line : textLines) {
                if (line != null && line.length() > 0) {
                    if (sb.length() > 0) sb.append(" | ");
                    sb.append(line);
                }
            }
            text = sb.toString();
        }
        if (subTextCs != null && subTextCs.length() > 0 && !text.contains(subTextCs.toString())) {
            text = text + " (" + subTextCs + ")";
        }

        String fullMessage = (title + " " + text).toLowerCase();

        // PENTING: Hanya proses notifikasi dari aplikasi perbankan/e-wallet/EDC resmi.
        // Blokir mutlak aplikasi chat/SMS agar tidak memicu infinite loop kuitansi.
        boolean isExcludedChat = packageName.startsWith("com.whatsapp") ||
                packageName.startsWith("org.telegram") ||
                packageName.contains(".mms") ||
                packageName.contains(".messaging");

        if (isExcludedChat) {
            return;
        }

        // Fleksibel & Dinamis: Mendukung target resmi + aplikasi EDC/Merchant/Banking apapun
        String pkgLower = packageName.toLowerCase();
        boolean isTargetApp = TARGET_PACKAGES.contains(packageName) ||
                pkgLower.contains("merchant") ||
                pkgLower.contains("edc") ||
                pkgLower.contains("pos") ||
                pkgLower.contains("bank") ||
                pkgLower.contains("qris") ||
                pkgLower.contains("kasir");

        if (!isTargetApp) {
            return;
        }

        boolean hasPaymentKeyword = fullMessage.contains("berhasil") ||
                fullMessage.contains("diterima") ||
                fullMessage.contains("pembayaran") ||
                fullMessage.contains("masuk") ||
                fullMessage.contains("transfer") ||
                fullMessage.contains("qris") ||
                fullMessage.contains("dana masuk") ||
                fullMessage.contains(" menerima ") ||
                fullMessage.contains("sukses") ||
                fullMessage.contains("penjualan") ||
                fullMessage.contains("kredit") ||
                fullMessage.contains("lunas");

        if (!hasPaymentKeyword) {
            return;
        }

        String extractedAmount = "0";
        Matcher matcher = MONEY_PATTERN.matcher(title + " " + text);
        if (matcher.find()) {
            extractedAmount = matcher.group(1).replaceAll("[^0-9]", "");
        }

        // Abaikan group summary kosong (mis. "3 notifikasi baru") yang tidak memuat nominal
        boolean isGroupSummary = (notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0;
        if (isGroupSummary && "0".equals(extractedAmount)) {
            return;
        }

        // Bangunkan CPU seketika walaupun layar HP sedang terkunci rapat / Deep Sleep
        final PowerManager.WakeLock wakeLock = acquireTempWakeLock(30_000);

        Log.d(TAG, "Notifikasi Transaksi Terdeteksi dari " + packageName + ": " + text + " [Nominal: " + extractedAmount + "]");

        AppPreferences prefs = new AppPreferences(getApplicationContext());
        String serverUrl = prefs.getServerUrl();
        String secretKey = prefs.getSecretKey();

        try {
            long ts = System.currentTimeMillis();
            final String txId = packageName + "_" + extractedAmount + "_" + (ts / 2000);
            final ProviderInfo info = resolveProviderInfo(packageName, title, text);

            final JSONObject payload = new JSONObject();
            payload.put("app", packageName);
            payload.put("provider", info.provider);
            payload.put("source_name", info.name);
            payload.put("method", info.method);
            payload.put("title", title);
            payload.put("text", text);
            payload.put("amount", extractedAmount);
            payload.put("timestamp", ts);
            appendDeviceTelemetry(getApplicationContext(), payload);

            final String displayContent = "[" + info.provider + "] " + title + " - " + text;

            HttpHelper.sendNotificationWebhook(serverUrl, secretKey, payload, new HttpHelper.Callback() {
                @Override
                public void onSuccess(int code, String responseBody) {
                    Log.i(TAG, "Webhook Berhasil Terkirim: " + code);
                    prefs.removePendingWebhook(txId);
                    prefs.addLog(packageName, displayContent, "Berhasil (" + code + ")");
                    broadcastUpdate();
                    if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
                }

                @Override
                public void onFailure(String errorMsg) {
                    Log.e(TAG, "Webhook Gagal (masuk antrean Auto-Retry): " + errorMsg);
                    // Simpan ke antrean persisten agar otomatis dikirim ulang sampai sukses!
                    prefs.enqueuePendingWebhook(txId, packageName, displayContent, payload);
                    prefs.addLog(packageName, displayContent, "Antrean Auto-Retry (" + errorMsg + ")");
                    broadcastUpdate();
                    if (retryHandler != null) {
                        retryHandler.postDelayed(() -> flushPendingQueue(), 4000);
                    }
                    if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "Error membuat payload: " + e.getMessage());
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        }
    }

    /**
     * Ambil log lama yang berstatus "Gagal" (mis. akibat HTTP 429 sebelumnya) dan masukkan ke antrean pengiriman ulang
     */
    private void recoverFailedLogsToQueue() {
        try {
            AppPreferences prefs = new AppPreferences(getApplicationContext());
            List<JSONObject> logs = prefs.getLogs();
            for (JSONObject log : logs) {
                String app = log.optString("app", "");
                String status = log.optString("status", "");
                String content = log.optString("content", "");
                if ("TEST_SIMULASI".equals(app) || !TARGET_PACKAGES.contains(app)) continue;
                if (status.startsWith("Gagal") || status.startsWith("Antrean")) {
                    String extractedAmount = "0";
                    Matcher matcher = MONEY_PATTERN.matcher(content);
                    if (matcher.find()) {
                        extractedAmount = matcher.group(1).replaceAll("[^0-9]", "");
                    }
                    if (!"0".equals(extractedAmount)) {
                        String id = "recovered_" + app + "_" + extractedAmount + "_" + Math.abs(content.hashCode());
                        JSONObject payload = new JSONObject();
                        payload.put("app", app);
                        payload.put("title", "Recovered Notification");
                        payload.put("text", content);
                        payload.put("amount", extractedAmount);
                        payload.put("timestamp", System.currentTimeMillis());
                        prefs.enqueuePendingWebhook(id, app, content, payload);
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "recoverFailedLogsToQueue error: " + e.getMessage());
        }
    }

    /**
     * Kirim ulang semua transaksi yang masih ada di antrean tertunda
     */
    public void flushPendingQueue() {
        if (!isFlushingQueue.compareAndSet(false, true)) return;
        try {
            AppPreferences prefs = new AppPreferences(getApplicationContext());
            List<JSONObject> pendingList = prefs.getPendingWebhooks();
            if (pendingList.isEmpty()) {
                isFlushingQueue.set(false);
                return;
            }

            final PowerManager.WakeLock wakeLock = acquireTempWakeLock(25_000);
            String serverUrl = prefs.getServerUrl();
            String secretKey = prefs.getSecretKey();

            Log.i(TAG, "Memproses " + pendingList.size() + " pembayaran di antrean Auto-Retry...");

            for (JSONObject item : pendingList) {
                final String id = item.optString("id");
                final String app = item.optString("app");
                final String displayContent = item.optString("displayContent");
                final JSONObject payload = item.optJSONObject("payload");
                if (payload == null || !TARGET_PACKAGES.contains(app)) {
                    prefs.removePendingWebhook(id);
                    continue;
                }

                HttpHelper.sendNotificationWebhook(serverUrl, secretKey, payload, new HttpHelper.Callback() {
                    @Override
                    public void onSuccess(int code, String responseBody) {
                        Log.i(TAG, "Auto-Retry Webhook Berhasil (" + id + "): " + code);
                        prefs.removePendingWebhook(id);
                        prefs.updateLogStatus(displayContent, "Berhasil via Auto-Retry (" + code + ")");
                        broadcastUpdate();
                    }

                    @Override
                    public void onFailure(String errorMsg) {
                        Log.w(TAG, "Auto-Retry masih gagal (" + id + "): " + errorMsg);
                    }
                });
            }

            if (retryHandler != null) {
                retryHandler.postDelayed(() -> {
                    isFlushingQueue.set(false);
                    if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
                }, 3000);
            } else {
                isFlushingQueue.set(false);
            }
        } catch (Exception e) {
            isFlushingQueue.set(false);
            Log.e(TAG, "flushPendingQueue error: " + e.getMessage());
        }
    }

    private void broadcastUpdate() {
        Intent intent = new Intent(ACTION_NEW_NOTIFICATION);
        sendBroadcast(intent);
    }

    /**
     * Lampirkan telemetri perangkat (persentase baterai, status charging, model HP) ke payload JSON.
     */
    public static void appendDeviceTelemetry(Context context, JSONObject payload) {
        try {
            if (context == null || payload == null) return;
            IntentFilter ifilter = new IntentFilter(Intent.ACTION_BATTERY_CHANGED);
            Intent batteryStatus = context.registerReceiver(null, ifilter);
            int batteryPct = -1;
            boolean isCharging = false;
            if (batteryStatus != null) {
                int level = batteryStatus.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                int scale = batteryStatus.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
                if (level >= 0 && scale > 0) {
                    batteryPct = Math.round((level * 100f) / scale);
                }
                int status = batteryStatus.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
                isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL;
            }
            if (batteryPct >= 0) payload.put("battery", batteryPct);
            payload.put("charging", isCharging);
            payload.put("device", Build.MANUFACTURER + " " + Build.MODEL);
        } catch (Exception ignored) {}
    }

    /**
     * Kirim sinyal Heartbeat + Persentase Baterai + Model HP ke server VOCML.
     */
    private void sendHeartbeatToServer() {
        try {
            lastHeartbeatSentAt = System.currentTimeMillis();
            AppPreferences prefs = new AppPreferences(getApplicationContext());
            String serverUrl = prefs.getServerUrl();
            String secretKey = prefs.getSecretKey();
            if (serverUrl == null || serverUrl.trim().isEmpty()) return;

            JSONObject payload = new JSONObject();
            payload.put("is_heartbeat", true);
            payload.put("timestamp", System.currentTimeMillis());
            appendDeviceTelemetry(getApplicationContext(), payload);

            HttpHelper.sendNotificationWebhook(serverUrl, secretKey, payload, new HttpHelper.Callback() {
                @Override
                public void onSuccess(int code, String responseBody) {}

                @Override
                public void onFailure(String errorMsg) {}
            });
        } catch (Exception ignored) {}
    }

    private static class ProviderInfo {
        final String provider;
        final String name;
        final String method;

        ProviderInfo(String provider, String name, String method) {
            this.provider = provider;
            this.name = name;
            this.method = method;
        }
    }

    private static ProviderInfo resolveProviderInfo(String pkg, String title, String text) {
        String combined = (pkg + " " + title + " " + text).toLowerCase();
        boolean isEdc = combined.contains("edc") || combined.contains("kartu") || combined.contains("debit") || combined.contains("credit");
        String method = isEdc ? "EDC" : (combined.contains("qris") ? "QRIS" : "TRANSFER/QRIS");

        if (combined.contains("mandiri")) {
            return new ProviderInfo("MANDIRI", "Bank Mandiri (" + (isEdc ? "EDC Mandiri" : "QRIS Mandiri") + ")", method);
        } else if (combined.contains("bca")) {
            return new ProviderInfo("BCA", "Bank BCA (" + (isEdc ? "EDC BCA" : "QRIS BCA") + ")", method);
        } else if (combined.contains("bri") || combined.contains("brimo")) {
            return new ProviderInfo("BRI", "Bank BRI (" + (isEdc ? "EDC BRI" : "QRIS BRI") + ")", method);
        } else if (combined.contains("bni")) {
            return new ProviderInfo("BNI", "Bank BNI (" + (isEdc ? "EDC BNI" : "QRIS BNI") + ")", method);
        } else if (combined.contains("shopee")) {
            return new ProviderInfo("SHOPEEPAY", "ShopeePay / SPayLater", "QRIS");
        } else if (combined.contains("gojek") || combined.contains("gobiz") || combined.contains("gopay")) {
            return new ProviderInfo("GOPAY", "GoPay / GoBiz", "QRIS");
        } else if (combined.contains("dana")) {
            return new ProviderInfo("DANA", "DANA Bisnis", "QRIS");
        } else if (combined.contains("ovo")) {
            return new ProviderInfo("OVO", "OVO Merchant", "QRIS");
        } else if (combined.contains("seabank")) {
            return new ProviderInfo("SEABANK", "SeaBank", "TRANSFER");
        } else if (combined.contains("jago")) {
            return new ProviderInfo("JAGO", "Bank Jago", "TRANSFER");
        }
        return new ProviderInfo("EDC_QRIS", isEdc ? "Mesin EDC" : "Pembayaran Merchant", method);
    }
}
