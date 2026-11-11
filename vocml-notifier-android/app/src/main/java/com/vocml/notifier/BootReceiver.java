package com.vocml.notifier;

import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.service.notification.NotificationListenerService;
import android.util.Log;

public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "VOCML_BootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) ||
            "android.intent.action.QUICKBOOT_POWERON".equals(action) ||
            Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            Log.i(TAG, "HP selesai reboot / update aplikasi. Mengaktifkan VOC ML Listener di latar belakang...");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                try {
                    NotificationListenerService.requestRebind(
                            new ComponentName(context, PaymentNotificationListenerService.class)
                    );
                } catch (Exception e) {
                    Log.e(TAG, "Gagal requestRebind saat boot: " + e.getMessage());
                }
            }
            try {
                Intent serviceIntent = new Intent(context, PaymentNotificationListenerService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent);
                } else {
                    context.startService(serviceIntent);
                }
            } catch (Exception e) {
                Log.e(TAG, "Gagal startService saat boot: " + e.getMessage());
            }
        }
    }
}
