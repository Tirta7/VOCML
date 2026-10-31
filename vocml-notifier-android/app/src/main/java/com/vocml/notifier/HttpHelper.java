package com.vocml.notifier;

import okhttp3.*;
import org.json.JSONObject;
import java.io.IOException;
import java.util.concurrent.TimeUnit;

public class HttpHelper {
    private static final OkHttpClient client = new OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .build();

    public interface Callback {
        void onSuccess(int code, String responseBody);
        void onFailure(String errorMsg);
    }

    public static void sendNotificationWebhook(String url, String secretKey, JSONObject payload, Callback cb) {
        MediaType JSON = MediaType.parse("application/json; charset=utf-8");
        RequestBody body = RequestBody.create(payload.toString(), JSON);

        Request request = new Request.Builder()
                .url(url)
                .addHeader("X-VOCML-Secret", secretKey)
                .addHeader("Content-Type", "application/json")
                .post(body)
                .build();

        client.newCall(request).enqueue(new okhttp3.Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                if (cb != null) cb.onFailure("Koneksi gagal: " + e.getMessage());
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String responseBody = response.body() != null ? response.body().string() : "";
                int code = response.code();
                if (response.isSuccessful()) {
                    if (cb != null) cb.onSuccess(code, responseBody);
                } else {
                    if (cb != null) cb.onFailure("HTTP " + code + ": " + responseBody);
                }
            }
        });
    }
}

