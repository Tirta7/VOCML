package com.vocml.notifier;

import android.app.Notification;
import android.content.Intent;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import org.json.JSONObject;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class PaymentNotificationListenerService extends NotificationListenerService {
    private static final String TAG = "VOCML_Listener";
    public static final String ACTION_NEW_NOTIFICATION = "com.vocml.notifier.NEW_NOTIF";

    // Daftar paket aplikasi e-wallet & perbankan yang dipantau
    private static final Set<String> TARGET_PACKAGES = new HashSet<>(Arrays.asList(
            "com.shopee.id",                  // Shopee Consumer (ShopeePay)
            "com.shopee.spay",                // ShopeePay Standalone / Merchant
            "com.shopee.seller",              // Shopee Partner / Seller
            "com.bca",                        // BCA Mobile
            "id.co.bca.mybca",                // myBCA
            "com.bca.merchant",               // BCA Merchant
            "id.co.mandiri.livero",           // Livin' by Mandiri
            "com.gojek.gofoodmerchant",       // GoBiz (QRIS GoPay)
            "id.dana",                        // DANA
            "com.telkom.indihome.queuesystem" // LinkAja / lainnya
    ));

    // Regex untuk mendeteksi nominal uang, misal: Rp 450.000 atau Rp450.123 atau IDR 450.000
    private static final Pattern MONEY_PATTERN = Pattern.compile("(?:Rp|IDR)\\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?|[0-9]+)", Pattern.CASE_INSENSITIVE);

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        Log.i(TAG, "Notification Listener Service Tersambung!");
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;

        String packageName = sbn.getPackageName();
        if (packageName == null) return;

        // Ambil data notifikasi
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

        // Cek apakah paket aplikasi masuk target ATAU mengandung kata kunci transaksi
        boolean isTargetApp = TARGET_PACKAGES.contains(packageName);
        boolean hasPaymentKeyword = fullMessage.contains("berhasil") ||
                fullMessage.contains("diterima") ||
                fullMessage.contains("pembayaran") ||
                fullMessage.contains("masuk") ||
                fullMessage.contains("transfer") ||
                fullMessage.contains("qris") ||
                fullMessage.contains("dana masuk");

        // Abaikan jika bukan transaksi finansial
        if (!hasPaymentKeyword) {
            return;
        }

        // Ekstrak nominal jika ada
        String extractedAmount = "0";
        Matcher matcher = MONEY_PATTERN.matcher(title + " " + text);
        if (matcher.find()) {
            extractedAmount = matcher.group(1).replaceAll("[^0-9]", "");
        }

        Log.d(TAG, "Notifikasi Transaksi Terdeteksi dari " + packageName + ": " + text + " [Nominal: " + extractedAmount + "]");

        // Persiapkan payload webhook
        AppPreferences prefs = new AppPreferences(getApplicationContext());
        String serverUrl = prefs.getServerUrl();
        String secretKey = prefs.getSecretKey();

        try {
            JSONObject payload = new JSONObject();
            payload.put("app", packageName);
            payload.put("title", title);
            payload.put("text", text);
            payload.put("amount", extractedAmount);
            payload.put("timestamp", System.currentTimeMillis());

            final String displayContent = "[" + packageName + "] " + title + " - " + text;

            HttpHelper.sendNotificationWebhook(serverUrl, secretKey, payload, new HttpHelper.Callback() {
                @Override
                public void onSuccess(int code, String responseBody) {
                    Log.i(TAG, "Webhook Berhasil Terkirim: " + code);
                    prefs.addLog(packageName, displayContent, "Berhasil (" + code + ")");
                    broadcastUpdate();
                }

                @Override
                public void onFailure(String errorMsg) {
                    Log.e(TAG, "Webhook Gagal: " + errorMsg);
                    prefs.addLog(packageName, displayContent, "Gagal: " + errorMsg);
                    broadcastUpdate();
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "Error membuat payload: " + e.getMessage());
        }
    }

    private void broadcastUpdate() {
        Intent intent = new Intent(ACTION_NEW_NOTIFICATION);
        sendBroadcast(intent);
    }
}

