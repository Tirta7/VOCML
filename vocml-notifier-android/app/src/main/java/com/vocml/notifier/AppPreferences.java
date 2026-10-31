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

    private final SharedPreferences prefs;

    public AppPreferences(Context context) {
        this.prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
    }

    public String getServerUrl() {
        return prefs.getString(KEY_SERVER_URL, "https://privatmassage.vocpos.id/api/v1/webhook/phone-notification");
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

    public void clearLogs() {
        prefs.edit().putString(KEY_LOGS, "[]").apply();
    }
}

