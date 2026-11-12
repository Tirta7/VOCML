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
            "com.shopeepay.id",               // ShopeePay Indonesia
            "com.shopee.id",                  // Shopee Consumer (ShopeePay)
            "com.shopee.spay",                // ShopeePay Standalone / Merchant
            "com.shopee.seller",              // Shopee Partner / Seller
            "com.bca",                        // BCA Mobile
            "id.co.bca.mybca",                // myBCA
            "com.bca.merchant",               // BCA Merchant
            "id.co.mandiri.livero",           // Livin' by Mandiri
            "id.co.bri.brimo",                // BRImo
            "src.com.bni",                    // BNI Mobile
            "com.gojek.gofoodmerchant",       // GoBiz / GoPay Merchant
            "com.gojek.app",                  // Gojek / GoPay
            "id.dana",                        // DANA
            "id.dana.business",               // DANA Bisnis
            "ovo.id",                         // OVO
            "id.co.seabank.app",              // SeaBank
            "com.jago.digitalBanking",        // Bank Jago
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
                retryHandler.postDelayed(this, 20_000); // Cek antrean tertunda tiap 20 detik
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

        String title = titleCs != null ? titleCs.toString() : "";
        String text = textCs != null ? textCs.toString() : "";
        if (bigTextCs != null && bigTextCs.length() > text.length()) {
            text = bigTextCs.toString();
        }

        String fullMessage = (title + " " + text).toLowerCase();

        // PENTING: Hanya proses notifikasi yang berasal dari aplikasi e-wallet / bank resmi (TARGET_PACKAGES).
        // Jangan pernah membaca notifikasi dari WhatsApp (com.whatsapp / com.whatsapp.w4b), Telegram, SMS, dll.
        // karena pesan kuitansi/invoice WhatsApp berisi kata "Pembayaran ... Rp..." yang akan memicu infinite loop!
        boolean isTargetApp = TARGET_PACKAGES.contains(packageName);
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
                fullMessage.contains(" menerima ");

        if (!hasPaymentKeyword) {
            return;
        }

        String extractedAmount = "0";
        Matcher matcher = MONEY_PATTERN.matcher(title + " " + text);
        if (matcher.find()) {
            extractedAmount = matcher.group(1).replaceAll("[^0-9]", "");
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
            final JSONObject payload = new JSONObject();
            payload.put("app", packageName);
            payload.put("title", title);
            payload.put("text", text);
            payload.put("amount", extractedAmount);
            payload.put("timestamp", ts);

            final String displayContent = "[" + packageName + "] " + title + " - " + text;

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
     * Kirim sinyal Heartbeat + Persentase Baterai + Model HP ke server VOCML
     */
    private void sendHeartbeatToServer() {
        try {
            lastHeartbeatSentAt = System.currentTimeMillis();
            AppPreferences prefs = new AppPreferences(getApplicationContext());
            String serverUrl = prefs.getServerUrl();
            String secretKey = prefs.getSecretKey();
            if (serverUrl == null || serverUrl.trim().isEmpty()) return;

            IntentFilter ifilter = new IntentFilter(Intent.ACTION_BATTERY_CHANGED);
            Intent batteryStatus = registerReceiver(null, ifilter);
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

            JSONObject payload = new JSONObject();
            payload.put("is_heartbeat", true);
            if (batteryPct >= 0) payload.put("battery", batteryPct);
            payload.put("charging", isCharging);
            payload.put("device", Build.MANUFACTURER + " " + Build.MODEL);
            payload.put("timestamp", System.currentTimeMillis());

            HttpHelper.sendNotificationWebhook(serverUrl, secretKey, payload, new HttpHelper.Callback() {
                @Override
                public void onSuccess(int code, String responseBody) {}

                @Override
                public void onFailure(String errorMsg) {}
            });
        } catch (Exception ignored) {}
    }
}
