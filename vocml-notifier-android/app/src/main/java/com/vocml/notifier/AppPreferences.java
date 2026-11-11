package com.vocml.notifier;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

public class AppPreferences {
    private static final String PREF_NAME = "vocml_notifier_prefs";
    private static final String KEY_SERVER_URL = "server_url";
    private static final String KEY_SECRET_KEY = "secret_key";
    private static final String KEY_LOGS = "cached_logs";
    private static final String KEY_PENDING_QUEUE = "pending_webhooks";

    private final SharedPreferences prefs;

    public AppPreferences(Context context) {
        this.prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
    }

    public String getServerUrl() {
        return prefs.getString(KEY_SERVER_URL, "https://vocml.vocpos.id/api/v1/webhook/phone-notification");
    }

    public void setServerUrl(String url) {
        prefs.edit().putString(KEY_SERVER_URL, url).apply();
    }

    public String getSecretKey() {
        return prefs.getString(KEY_SECRET_KEY, "vocml_secret_key_123");
    }

    public void setSecretKey(String key) {
        prefs.edit().putString(KEY_SECRET_KEY, key).apply();
    }

    public synchronized void addLog(String app, String content, String status) {
        try {
            JSONArray arr = new JSONArray(prefs.getString(KEY_LOGS, "[]"));
            JSONObject item = new JSONObject();
            item.put("app", app);
            item.put("content", content);
            item.put("status", status);
            item.put("time", new java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault()).format(new java.util.Date()));

            // Simpan max 50 log terakhir
            JSONArray newArr = new JSONArray();
            newArr.put(item);
            for (int i = 0; i < Math.min(arr.length(), 49); i++) {
                newArr.put(arr.get(i));
            }
            prefs.edit().putString(KEY_LOGS, newArr.toString()).apply();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public synchronized void updateLogStatus(String content, String newStatus) {
        try {
            JSONArray arr = new JSONArray(prefs.getString(KEY_LOGS, "[]"));
            for (int i = 0; i < arr.length(); i++) {
                JSONObject item = arr.getJSONObject(i);
                if (content.equals(item.optString("content"))) {
                    item.put("status", newStatus);
                    break;
                }
            }
            prefs.edit().putString(KEY_LOGS, arr.toString()).apply();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public synchronized List<JSONObject> getLogs() {
        List<JSONObject> list = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(prefs.getString(KEY_LOGS, "[]"));
            for (int i = 0; i < arr.length(); i++) {
                list.add(arr.getJSONObject(i));
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return list;
    }

    public synchronized void clearLogs() {
        prefs.edit().putString(KEY_LOGS, "[]").apply();
    }

    // ---------- Antrean Retry Otomatis (Pending Queue) ----------

    public synchronized void enqueuePendingWebhook(String id, String app, String displayContent, JSONObject payload) {
        try {
            JSONArray arr = new JSONArray(prefs.getString(KEY_PENDING_QUEUE, "[]"));
            // Cegah duplikasi id yang sama
            for (int i = 0; i < arr.length(); i++) {
                if (id.equals(arr.getJSONObject(i).optString("id"))) {
                    return;
                }
            }
            JSONObject entry = new JSONObject();
            entry.put("id", id);
            entry.put("app", app);
            entry.put("displayContent", displayContent);
            entry.put("payload", payload);
            entry.put("attempts", 1);
            entry.put("createdAt", System.currentTimeMillis());

            JSONArray newArr = new JSONArray();
            newArr.put(entry);
            for (int i = 0; i < Math.min(arr.length(), 49); i++) {
                newArr.put(arr.get(i));
            }
            prefs.edit().putString(KEY_PENDING_QUEUE, newArr.toString()).apply();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public synchronized List<JSONObject> getPendingWebhooks() {
        List<JSONObject> list = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(prefs.getString(KEY_PENDING_QUEUE, "[]"));
            for (int i = 0; i < arr.length(); i++) {
                list.add(arr.getJSONObject(i));
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return list;
    }

    public synchronized void removePendingWebhook(String id) {
        try {
            JSONArray arr = new JSONArray(prefs.getString(KEY_PENDING_QUEUE, "[]"));
            JSONArray newArr = new JSONArray();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject item = arr.getJSONObject(i);
                if (!id.equals(item.optString("id"))) {
                    newArr.put(item);
                }
            }
            prefs.edit().putString(KEY_PENDING_QUEUE, newArr.toString()).apply();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
