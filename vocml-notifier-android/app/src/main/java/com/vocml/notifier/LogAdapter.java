package com.vocml.notifier;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;
import org.json.JSONObject;
import java.util.List;

public class LogAdapter extends RecyclerView.Adapter<LogAdapter.ViewHolder> {
    private List<JSONObject> logs;

    public LogAdapter(List<JSONObject> logs) {
        this.logs = logs;
    }

    public void updateLogs(List<JSONObject> newLogs) {
        this.logs = newLogs;
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_log, parent, false);
        return new ViewHolder(v);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        JSONObject item = logs.get(position);
        holder.tvApp.setText(item.optString("app", "-"));
        holder.tvTime.setText(item.optString("time", "-"));
        holder.tvContent.setText(item.optString("content", "-"));

        String status = item.optString("status", "-");
        holder.tvStatus.setText("Status: " + status);
        if (status.contains("Berhasil")) {
            holder.tvStatus.setTextColor(holder.itemView.getContext().getResources().getColor(R.color.accent_green));
        } else {
            holder.tvStatus.setTextColor(holder.itemView.getContext().getResources().getColor(R.color.accent_red));
        }
    }

    @Override
    public int getItemCount() {
        return logs != null ? logs.size() : 0;
    }

    public static class ViewHolder extends RecyclerView.ViewHolder {
        TextView tvApp, tvTime, tvContent, tvStatus;

        public ViewHolder(@NonNull View itemView) {
            super(itemView);
            tvApp = itemView.findViewById(R.id.tvLogApp);
            tvTime = itemView.findViewById(R.id.tvLogTime);
            tvContent = itemView.findViewById(R.id.tvLogContent);
            tvStatus = itemView.findViewById(R.id.tvLogStatus);
        }
    }
}

