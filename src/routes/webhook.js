import express from 'express';
import { config, PRODUCTS } from '../config.js';
import { q, enrich, logActivity, transaction } from '../db.js';
import { todayStr, addDays, addMonths, nowIso, durationPlanLabel, durationText } from '../dates.js';
import { createLicenseKey } from '../license.js';
import { getSettings, effectiveAmount } from '../billing.js';
import { broadcastChange } from '../realtime.js';

export const webhookRouter = express.Router();

webhookRouter.post('/phone-notification', (req, res) => {
  const secret = req.get('X-VOCML-Secret') || req.query.secret || req.body?.secret;
  const configuredSecret = process.env.WEBHOOK_SECRET || 'vocml_secret_key_123';

  if (secret !== configuredSecret) {
    return res.status(401).json({ error: 'Secret key tidak valid' });
  }

  const { app, title, text, timestamp, is_test } = req.body || {};

  // Simulasi / test dari aplikasi Android
  if (is_test) {
    return res.json({
      ok: true,
      message: 'Koneksi dari aplikasi Android berhasil terhubung ke server VOC ML!',
      server_time: nowIso(),
    });
  }

  // Parse nominal transaksi dari payload atau teks
  let amount = Number(String(req.body?.amount || '').replace(/[^\d]/g, '')) || 0;
  if (!amount && text) {
    const match = text.match(/(?:Rp|IDR)\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?|[0-9]+)/i);
    if (match) amount = Number(match[1].replace(/[^\d]/g, '')) || 0;
  }

  const appName = String(app || 'Unknown App').trim();
  const notifSummary = String(text || title || 'Notifikasi transaksi').slice(0, 200);

  if (!amount) {
    logActivity('billing', `Notifikasi masuk dari ${appName} tanpa nominal terdeteksi: "${notifSummary}"`);
    return res.json({ ok: true, status: 'ignored_no_amount', message: 'Nominal tidak terdeteksi' });
  }

  // Cari client yang membutuhkan perpanjangan / terkunci yang nominal tagihannya cocok
  const settings = getSettings();
  const allClients = q.allClients.all().map(enrich);
  
  // Prioritas 1: Client yang berstatus 'locked', 'expired', atau 'pending' yang nominal tagihannya persis sama
  const waitingClients = allClients.filter((c) => {
    if (!['locked', 'expired', 'pending'].includes(c.status)) return false;
    const reqAmount = effectiveAmount(c, settings);
    return reqAmount === amount;
  });

  if (waitingClients.length === 1) {
    const client = waitingClients[0];
    const duration = { months: 1, days: 0 };
    const today = todayStr();
    const base = client.expires_at && client.expires_at >= today ? client.expires_at : today;
    const expiresAt = addMonths(base, 1);
    const licenseKey = createLicenseKey({ machineId: client.machine_id, product: client.product, expiresAt });
    const now = nowIso();
    const action = `Perpanjangan otomatis via QRIS (Rp${amount.toLocaleString('id-ID')})`;

    transaction(() => {
      q.renewClient.run({
        id: client.id,
        expires_at: expiresAt,
        license_key: licenseKey,
        plan: durationPlanLabel(duration),
        locked: 0,
        lock_reason: '',
        now,
      });
      q.insertHistory.run({
        client_id: client.id,
        action,
        months: 1,
        amount,
        license_key: licenseKey,
        expires_before: client.expires_at,
        expires_at: expiresAt,
        note: `Auto-verified dari notifikasi HP (${appName})`,
        now,
      });
    });

    const updated = q.clientById.get(client.id);
    logActivity('renew', `[AUTO-QRIS] ${action} untuk ${client.name} (${client.machine_id})`, updated);

    // Siarkan realtime update ke dashboard admin & client
    broadcastChange('clients', { text: `Lisensi ${client.name} otomatis aktif via QRIS` });
    broadcastChange('activity', { silent: true });

    return res.json({
      ok: true,
      status: 'activated',
      message: `Lisensi untuk ${client.name} berhasil diaktifkan otomatis!`,
      client: {
        id: client.id,
        name: client.name,
        machine_id: client.machine_id,
        expires_at: expiresAt,
      },
    });
  }

  // Jika ada lebih dari 1 client dengan nominal yang sama persis (konflik tanpa kode unik)
  if (waitingClients.length > 1) {
    const listNames = waitingClients.map((c) => `${c.name} (${c.machine_id})`).join(', ');
    logActivity('billing', `[PERINGATAN QRIS] Masuk Rp${amount.toLocaleString('id-ID')} tapi ada ${waitingClients.length} klien dengan nominal sama: ${listNames}. Harap aktivasi manual.`);
    return res.json({
      ok: true,
      status: 'ambiguous',
      message: 'Terdapat lebih dari satu klien dengan nominal tersebut. Harap gunakan kode unik atau aktivasi manual.',
    });
  }

  // Jika tidak ada client yang cocok dengan nominal tersebut
  logActivity('billing', `[QRIS Diterima] Rp${amount.toLocaleString('id-ID')} dari ${appName} ("${notifSummary}"), tidak ada klien terkunci yang cocok.`);
  res.json({
    ok: true,
    status: 'unmatched',
    message: 'Nominal pembayaran tercatat di log aktivitas server.',
  });
});

