package com.vocml.notifier;

import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.view.View;
import android.view.WindowManager;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.NotificationManagerCompat;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.google.android.material.button.MaterialButton;

import org.json.JSONObject;

import java.util.Set;

public class MainActivity extends AppCompatActivity {

    private View viewStatusDot;
    private TextView tvStatusText;
    private MaterialButton btnGrantPermission, btnBatteryOpt, btnAutostartSettings, btnSaveConfig, btnTestWebhook;
    private EditText etServerUrl, etSecretKey, etPosServerUrl, etPosSecretKey;
    private androidx.appcompat.widget.SwitchCompat switchPosEnabled, switchKeepScreenOn, switchSoundbox;
    private View layoutPosConfig;
    private RecyclerView rvLogs;
    private TextView btnClearLogs, btnRetryFailed;

    private AppPreferences prefs;
    private LogAdapter logAdapter;

    private final BroadcastReceiver updateReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            refreshLogs();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = new AppPreferences(this);

        initViews();
        loadSavedConfig();
        setupRecyclerView();
        setupListeners();
    }

    private void initViews() {
        viewStatusDot = findViewById(R.id.viewStatusDot);
        tvStatusText = findViewById(R.id.tvStatusText);
        btnGrantPermission = findViewById(R.id.btnGrantPermission);
        btnBatteryOpt = findViewById(R.id.btnBatteryOpt);
        btnAutostartSettings = findViewById(R.id.btnAutostartSettings);
        btnSaveConfig = findViewById(R.id.btnSaveConfig);
        btnTestWebhook = findViewById(R.id.btnTestWebhook);
        etServerUrl = findViewById(R.id.etServerUrl);
        etSecretKey = findViewById(R.id.etSecretKey);
        etPosServerUrl = findViewById(R.id.etPosServerUrl);
        etPosSecretKey = findViewById(R.id.etPosSecretKey);
        switchPosEnabled = findViewById(R.id.switchPosEnabled);
        layoutPosConfig = findViewById(R.id.layoutPosConfig);
        switchKeepScreenOn = findViewById(R.id.switchKeepScreenOn);
        switchSoundbox = findViewById(R.id.switchSoundbox);
        rvLogs = findViewById(R.id.rvLogs);
        btnClearLogs = findViewById(R.id.btnClearLogs);
        btnRetryFailed = findViewById(R.id.btnRetryFailed);
    }

    private void loadSavedConfig() {
        etServerUrl.setText(prefs.getServerUrl());
        etSecretKey.setText(prefs.getSecretKey());
        etPosServerUrl.setText(prefs.getPosServerUrl());
        etPosSecretKey.setText(prefs.getPosSecretKey());
        boolean posEnabled = prefs.isPosEnabled();
        switchPosEnabled.setChecked(posEnabled);
        layoutPosConfig.setVisibility(posEnabled ? View.VISIBLE : View.GONE);

        boolean keepOn = prefs.isKeepScreenOn();
        switchKeepScreenOn.setChecked(keepOn);
        applyKeepScreenOn(keepOn);

        if (switchSoundbox != null) {
            switchSoundbox.setChecked(prefs.isSoundboxEnabled());
        }
    }

    private void setupRecyclerView() {
        rvLogs.setLayoutManager(new LinearLayoutManager(this));
        logAdapter = new LogAdapter(prefs.getLogs());
        rvLogs.setAdapter(logAdapter);
    }

    private void setupListeners() {
        btnGrantPermission.setOnClickListener(v -> {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            startActivity(intent);
        });

        btnBatteryOpt.setOnClickListener(v -> requestIgnoreBatteryOptimization());

        btnAutostartSettings.setOnClickListener(v -> openAutostartSettings());

        switchKeepScreenOn.setOnCheckedChangeListener((btn, isChecked) -> {
            prefs.setKeepScreenOn(isChecked);
            applyKeepScreenOn(isChecked);
            Toast.makeText(this, isChecked ? "Layar akan tetap menyala di kasir" : "Mode layar normal", Toast.LENGTH_SHORT).show();
        });

        if (switchSoundbox != null) {
            switchSoundbox.setOnCheckedChangeListener((btn, isChecked) -> {
                prefs.setSoundboxEnabled(isChecked);
                Toast.makeText(this, isChecked ? "Audio Soundbox Aktif (Bersuara)" : "Audio Soundbox Dinonaktifkan", Toast.LENGTH_SHORT).show();
            });
        }

        switchPosEnabled.setOnCheckedChangeListener((btn, isChecked) -> {
            layoutPosConfig.setVisibility(isChecked ? View.VISIBLE : View.GONE);
        });

        btnSaveConfig.setOnClickListener(v -> {
            String url = sanitizeUrl(etServerUrl.getText().toString(), false);
            String key = etSecretKey.getText().toString().trim();
            String posUrl = sanitizeUrl(etPosServerUrl.getText().toString(), true);
            String posKey = etPosSecretKey.getText().toString().trim();
            boolean isPosOn = switchPosEnabled.isChecked();

            if (url.isEmpty()) {
                Toast.makeText(this, "URL Server VOCML tidak boleh kosong", Toast.LENGTH_SHORT).show();
                return;
            }
            etServerUrl.setText(url);
            etPosServerUrl.setText(posUrl);
            prefs.setServerUrl(url);
            prefs.setSecretKey(key);
            prefs.setPosServerUrl(posUrl);
            prefs.setPosSecretKey(posKey);
            prefs.setPosEnabled(isPosOn);
            Toast.makeText(this, "Pengaturan Dual-Webhook berhasil disimpan!", Toast.LENGTH_SHORT).show();
        });

        btnTestWebhook.setOnClickListener(v -> sendTestWebhook());

        if (btnRetryFailed != null) {
            btnRetryFailed.setOnClickListener(v -> {
                triggerServiceRetry();
                Toast.makeText(this, "Mengirim ulang notifikasi yang gagal...", Toast.LENGTH_SHORT).show();
            });
        }

        btnClearLogs.setOnClickListener(v -> {
            prefs.clearLogs();
            refreshLogs();
            Toast.makeText(this, "Log dibersihkan", Toast.LENGTH_SHORT).show();
        });
    }

    private void triggerServiceRetry() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                ComponentName cn = new ComponentName(this, PaymentNotificationListenerService.class);
                NotificationListenerService.requestRebind(cn);
            }
            Intent serviceIntent = new Intent(this, PaymentNotificationListenerService.class);
            serviceIntent.setAction(PaymentNotificationListenerService.ACTION_RETRY_FAILED);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }
        } catch (Exception ignored) {}
    }

    public static String sanitizeUrl(String rawUrl, boolean isPos) {
        if (rawUrl == null) return "";
        String url = rawUrl.trim();
        if (url.isEmpty()) return "";

        // Tambahkan protokol http/https jika lupa diketik
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            if (url.contains(".id") || url.contains(".com") || url.contains(".online") || url.contains(".net")) {
                url = "https://" + url;
            } else {
                url = "http://" + url;
            }
        }

        if (isPos) {
            // Perbaiki otomatis jika user mengetik URL terpotong (misal: /api/webhook/pa atau /api/webhook)
            if (url.endsWith("/api/webhook/pa") || url.endsWith("/api/webhook/p") || url.endsWith("/api/webhook/") || url.endsWith("/api/webhook")) {
                int idx = url.indexOf("/api/webhook");
                url = url.substring(0, idx) + "/api/webhook/payment-notification";
            } else if (!url.contains("/api/webhook/payment-notification") && !url.contains("/api/")) {
                if (url.endsWith("/")) url = url.substring(0, url.length() - 1);
                url = url + "/api/webhook/payment-notification";
            }
        } else {
            // Server VOC ML
            if (url.endsWith("/api/v1/webhook/") || url.endsWith("/api/v1/webhook") || url.endsWith("/phone-notification/")) {
                int idx = url.indexOf("/api/v1/webhook");
                url = url.substring(0, idx) + "/api/v1/webhook/phone-notification";
            } else if (!url.contains("/api/v1/webhook/phone-notification") && !url.contains("/api/")) {
                if (url.endsWith("/")) url = url.substring(0, url.length() - 1);
                url = url + "/api/v1/webhook/phone-notification";
            }
        }
        return url;
    }

    private void sendTestWebhook() {
        String url = sanitizeUrl(etServerUrl.getText().toString(), false);
        String key = etSecretKey.getText().toString().trim();
        boolean isPosOn = switchPosEnabled.isChecked();
        String posUrl = sanitizeUrl(etPosServerUrl.getText().toString(), true);
        String posKey = etPosSecretKey.getText().toString().trim();
        etServerUrl.setText(url);
        etPosServerUrl.setText(posUrl);

        if (url.isEmpty()) {
            Toast.makeText(this, "Simpan URL Server VOCML terlebih dahulu", Toast.LENGTH_SHORT).show();
            return;
        }

        btnTestWebhook.setEnabled(false);
        btnTestWebhook.setText("Mengirim...");

        try {
            JSONObject testPayload = new JSONObject();
            testPayload.put("provider", "GOPAY");
            testPayload.put("source_name", "GoPay (QRIS GoPay)");
            testPayload.put("method", "QRIS");
            testPayload.put("amount", 50000L);
            testPayload.put("title", "Pembayaran QRIS statis diterima");
            testPayload.put("text", "Rp 50.000 di Merchant POS");
            testPayload.put("app", "com.gopay.wallet");
            testPayload.put("timestamp", System.currentTimeMillis());
            testPayload.put("is_test", true);
            PaymentNotificationListenerService.appendDeviceTelemetry(this, testPayload);

            // 1. Tes ke Server Lisensi VOC ML
            HttpHelper.sendNotificationWebhook(url, key, testPayload, new HttpHelper.Callback() {
                @Override
                public void onSuccess(int code, String responseBody) {
                    runOnUiThread(() -> {
                        prefs.addLog("TEST_SIMULASI", "VOCML: Tes kirim berhasil!", "Berhasil (" + code + ")");
                        refreshLogs();
                        if (!isPosOn) {
                            btnTestWebhook.setEnabled(true);
                            btnTestWebhook.setText("Tes Kirim");
                            Toast.makeText(MainActivity.this, "Sukses terhubung ke server VOCML! (HTTP " + code + ")", Toast.LENGTH_SHORT).show();
                        }
                    });
                }

                @Override
                public void onFailure(String errorMsg) {
                    runOnUiThread(() -> {
                        prefs.addLog("TEST_SIMULASI", "VOCML: Gagal tes webhook: " + errorMsg, "Gagal");
                        refreshLogs();
                        if (!isPosOn) {
                            btnTestWebhook.setEnabled(true);
                            btnTestWebhook.setText("Tes Kirim");
                            Toast.makeText(MainActivity.this, "VOCML Gagal: " + errorMsg, Toast.LENGTH_LONG).show();
                        }
                    });
                }
            });

            // 2. Tes serentak ke POS Kasir Billiard & CFD (jika aktif)
            if (isPosOn && !posUrl.isEmpty()) {
                HttpHelper.sendNotificationWebhook(posUrl, posKey, testPayload, new HttpHelper.Callback() {
                    @Override
                    public void onSuccess(int code, String responseBody) {
                        runOnUiThread(() -> {
                            btnTestWebhook.setEnabled(true);
                            btnTestWebhook.setText("Tes Kirim");
                            prefs.addLog("TEST_SIMULASI", "Kasir & CFD: Tes kirim berhasil!", "Berhasil (" + code + ")");
                            refreshLogs();
                            Toast.makeText(MainActivity.this, "Sukses terhubung ke VOCML & Kasir! (HTTP " + code + ")", Toast.LENGTH_SHORT).show();
                        });
                    }

                    @Override
                    public void onFailure(String errorMsg) {
                        runOnUiThread(() -> {
                            btnTestWebhook.setEnabled(true);
                            btnTestWebhook.setText("Tes Kirim");
                            prefs.addLog("TEST_SIMULASI", "Kasir & CFD Gagal: " + errorMsg, "Gagal");
                            refreshLogs();
                            Toast.makeText(MainActivity.this, "Kasir & CFD Gagal: " + errorMsg, Toast.LENGTH_LONG).show();
                        });
                    }
                });
            }

        } catch (Exception e) {
            btnTestWebhook.setEnabled(true);
            btnTestWebhook.setText("Tes Kirim");
            Toast.makeText(this, "Error: " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    private void requestIgnoreBatteryOptimization() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                try {
                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                } catch (Exception e) {
                    Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                    startActivity(intent);
                }
            } else {
                Toast.makeText(this, "Optimalisasi baterai sudah dinonaktifkan (Aman).", Toast.LENGTH_SHORT).show();
            }
        }
    }

    private boolean isNotificationServiceEnabled() {
        Set<String> packageNames = NotificationManagerCompat.getEnabledListenerPackages(this);
        return packageNames.contains(getPackageName());
    }

    private void updateStatusUI() {
        boolean enabled = isNotificationServiceEnabled();
        if (enabled) {
            viewStatusDot.setBackgroundResource(R.drawable.circle_green);
            tvStatusText.setText("Layanan Aktif (Mendengarkan Notifikasi)");
            btnGrantPermission.setVisibility(View.GONE);
        } else {
            viewStatusDot.setBackgroundResource(R.drawable.circle_red);
            tvStatusText.setText("Izin Notifikasi Belum Aktif");
            btnGrantPermission.setVisibility(View.VISIBLE);
        }
    }

    private void refreshLogs() {
        if (logAdapter != null) {
            logAdapter.updateLogs(prefs.getLogs());
            rvLogs.scrollToPosition(0);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        updateStatusUI();
        refreshLogs();
        if (isNotificationServiceEnabled()) {
            triggerServiceRetry();
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(updateReceiver, new IntentFilter(PaymentNotificationListenerService.ACTION_NEW_NOTIFICATION), Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(updateReceiver, new IntentFilter(PaymentNotificationListenerService.ACTION_NEW_NOTIFICATION));
        }
    }

    private void applyKeepScreenOn(boolean keepOn) {
        if (keepOn) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } else {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
    }

    private void openAutostartSettings() {
        Intent[] autostartIntents = new Intent[] {
                new Intent().setComponent(new ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")),
                new Intent().setComponent(new ComponentName("com.letv.android.letvsafe", "com.letv.android.letvsafe.AutobootManageActivity")),
                new Intent().setComponent(new ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity")),
                new Intent().setComponent(new ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity")),
                new Intent().setComponent(new ComponentName("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity")),
                new Intent().setComponent(new ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity")),
                new Intent().setComponent(new ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity")),
                new Intent().setComponent(new ComponentName("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"))
        };

        boolean started = false;
        for (Intent intent : autostartIntents) {
            try {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
                started = true;
                break;
            } catch (Exception ignored) {}
        }

        if (!started) {
            try {
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.fromParts("package", getPackageName(), null));
                startActivity(intent);
            } catch (Exception e) {
                Toast.makeText(this, "Silakan buka Setelan -> Aplikasi -> Kelola Aplikasi", Toast.LENGTH_SHORT).show();
            }
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        try {
            unregisterReceiver(updateReceiver);
        } catch (Exception ignored) {}
    }
}

