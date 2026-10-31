package com.vocml.notifier;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.View;
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
    private MaterialButton btnGrantPermission, btnBatteryOpt, btnSaveConfig, btnTestWebhook;
    private EditText etServerUrl, etSecretKey;
    private RecyclerView rvLogs;
    private TextView btnClearLogs;

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
        btnSaveConfig = findViewById(R.id.btnSaveConfig);
        btnTestWebhook = findViewById(R.id.btnTestWebhook);
        etServerUrl = findViewById(R.id.etServerUrl);
        etSecretKey = findViewById(R.id.etSecretKey);
        rvLogs = findViewById(R.id.rvLogs);
        btnClearLogs = findViewById(R.id.btnClearLogs);
    }

    private void loadSavedConfig() {
        etServerUrl.setText(prefs.getServerUrl());
        etSecretKey.setText(prefs.getSecretKey());
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

        btnSaveConfig.setOnClickListener(v -> {
            String url = etServerUrl.getText().toString().trim();
            String key = etSecretKey.getText().toString().trim();
            if (url.isEmpty()) {
                Toast.makeText(this, "URL Server tidak boleh kosong", Toast.LENGTH_SHORT).show();
                return;
            }
            prefs.setServerUrl(url);
            prefs.setSecretKey(key);
            Toast.makeText(this, "Pengaturan berhasil disimpan!", Toast.LENGTH_SHORT).show();
        });

        btnTestWebhook.setOnClickListener(v -> sendTestWebhook());

        btnClearLogs.setOnClickListener(v -> {
            prefs.clearLogs();
            refreshLogs();
            Toast.makeText(this, "Log dibersihkan", Toast.LENGTH_SHORT).show();
        });
    }

    private void sendTestWebhook() {
        String url = etServerUrl.getText().toString().trim();
        String key = etSecretKey.getText().toString().trim();

        if (url.isEmpty()) {
            Toast.makeText(this, "Simpan URL Server terlebih dahulu", Toast.LENGTH_SHORT).show();
            return;
        }

        btnTestWebhook.setEnabled(false);
        btnTestWebhook.setText("Mengirim...");

        try {
            JSONObject testPayload = new JSONObject();
            testPayload.put("app", "com.shopee.id");
            testPayload.put("title", "Simulasi Pembayaran Berhasil");
            testPayload.put("text", "Kamu menerima pembayaran QRIS sebesar Rp 450.000");
            testPayload.put("amount", "450000");
            testPayload.put("timestamp", System.currentTimeMillis());
            testPayload.put("is_test", true);

            HttpHelper.sendNotificationWebhook(url, key, testPayload, new HttpHelper.Callback() {
                @Override
                public void onSuccess(int code, String responseBody) {
                    runOnUiThread(() -> {
                        btnTestWebhook.setEnabled(true);
                        btnTestWebhook.setText("Tes Kirim");
                        prefs.addLog("TEST_SIMULASI", "Tes kirim webhook berhasil!", "Berhasil (" + code + ")");
                        refreshLogs();
                        Toast.makeText(MainActivity.this, "Sukses terhubung ke server! (HTTP " + code + ")", Toast.LENGTH_LONG).show();
                    });
                }

                @Override
                public void onFailure(String errorMsg) {
                    runOnUiThread(() -> {
                        btnTestWebhook.setEnabled(true);
                        btnTestWebhook.setText("Tes Kirim");
                        prefs.addLog("TEST_SIMULASI", "Gagal tes webhook: " + errorMsg, "Gagal");
                        refreshLogs();
                        Toast.makeText(MainActivity.this, "Gagal koneksi: " + errorMsg, Toast.LENGTH_LONG).show();
                    });
                }
            });
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(updateReceiver, new IntentFilter(PaymentNotificationListenerService.ACTION_NEW_NOTIFICATION), Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(updateReceiver, new IntentFilter(PaymentNotificationListenerService.ACTION_NEW_NOTIFICATION));
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

