import express from 'express';
import { config, PRODUCTS } from '../config.js';
import { q, enrich, logActivity, transaction } from '../db.js';
import { todayStr, addDays, addMonths, nowIso, durationPlanLabel, durationText } from '../dates.js';
import { createLicenseKey } from '../license.js';
import { getSettings, effectiveAmount, resolvePackageByAmount } from '../billing.js';
import { broadcastChange } from '../realtime.js';
import { notifyClientMachine } from './client.js';
import { sendClientReceiptWhatsapp } from './whatsapp.js';

export const webhookRouter = express.Router();

// Daftar package aplikasi chat/sosmed yang DILARANG memicu verifikasi pembayaran
// (mencegah infinite loop ketika pesan WhatsApp kuitansi/invoice masuk ke HP yang sama)
const IGNORED_CHAT_PACKAGES = new Set([
  'com.whatsapp',
  'com.whatsapp.w4b',
  'org.telegram.messenger',
  'org.telegram.messenger.web',
  'com.facebook.orca',
  'com.instagram.android',
  'com.google.android.apps.messaging',
  'com.android.mms',
]);

// Cache anti-duplikat / cooldown pembayaran (key: `${clientId}:${amount}` atau `amount:${amount}`)
const recentProcessedPayments = new Map();
const PAYMENT_COOLDOWN_MS = 3 * 60 * 1000; // 3 menit cooldown untuk nominal & client yang sama

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

  const appName = String(app || 'Unknown App').trim();
  const appLower = appName.toLowerCase();
  const notifSummary = String(text || title || 'Notifikasi transaksi').slice(0, 200);
  const fullTextLower = `${title || ''} ${text || ''}`.toLowerCase();

  // 0. TOLAK notifikasi dari WhatsApp / aplikasi chat atau teks kuitansi VOCML sendiri (cegah infinite loop!)
  if (
    IGNORED_CHAT_PACKAGES.has(appLower) ||
    appLower.includes('whatsapp') ||
    appLower.includes('telegram') ||
    fullTextLower.includes('status lisensi: aktif (lunas)') ||
    fullTextLower.includes('qris diterbitkan oleh vocmerchant') ||
    fullTextLower.includes('ini invoice pesanannya')
  ) {
    return res.json({
      ok: true,
      status: 'ignored_chat_notification',
      message: 'Notifikasi aplikasi chat/kuitansi diabaikan agar tidak memicu loop.',
    });
  }

  // Parse nominal transaksi dari payload atau teks
  let amount = Number(String(req.body?.amount || '').replace(/[^\d]/g, '')) || 0;
  if (!amount && text) {
    const match = text.match(/(?:Rp|IDR)\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?|[0-9]+)/i);
    if (match) amount = Number(match[1].replace(/[^\d]/g, '')) || 0;
  }

  if (!amount) {
    logActivity('billing', `Notifikasi masuk dari ${appName} tanpa nominal terdeteksi: "${notifSummary}"`);
    return res.json({ ok: true, status: 'ignored_no_amount', message: 'Nominal tidak terdeteksi' });
  }

  // 1. Cek apakah ada antrean tagihan (billing_orders) yang menunggu nominal ini
  let pendingOrder = null;
  try {
    pendingOrder = q.findPendingOrderByAmount.get(amount);
  } catch (err) {
    console.error('[webhook] findPendingOrderByAmount error:', err.message);
  }

  const settings = getSettings();
  const allClients = q.allClients.all().map(enrich);
  let targetClient = null;

  if (pendingOrder) {
    targetClient = allClients.find((c) => c.machine_id === pendingOrder.machine_id && c.product === pendingOrder.product) ||
                   allClients.find((c) => c.id === pendingOrder.client_id);
  }

  // 2. Cek apakah ada kecocokan 3-digit kode unik client (amount % 1000)
  // Prioritaskan client yang butuh perpanjangan (locked, expired, expiring, trial, pending), lalu fallback ke semua client (advance renewal)
  if (!targetClient) {
    const code = amount % 1000;
    if (code >= 100 && code <= 999) {
      targetClient =
        allClients.find((c) => Number(c.unique_code) === code && ['locked', 'expired', 'expiring', 'pending', 'trial'].includes(c.status)) ||
        allClients.find((c) => Number(c.unique_code) === code);
    }
  }

  // 3. Jika tidak ada di billing_orders & unique_code, cari client dengan nominal cocok
  if (!targetClient) {
    let waitingClients = allClients.filter((c) => {
      if (!['locked', 'expired', 'expiring', 'pending', 'trial'].includes(c.status)) return false;
      const reqAmount = effectiveAmount(c, settings);
      return reqAmount === amount;
    });

    // Fallback: Jika tidak cocok dengan kode unik, cek apakah pembeli membayar nominal bulat pas harga dasar produk/paket
    if (waitingClients.length === 0) {
      const baseClients = allClients.filter((c) => {
        if (!['locked', 'expired', 'expiring', 'pending', 'trial'].includes(c.status)) return false;
        const base = Number(settings[`price_${c.product}`]) || 0;
        return base === amount;
      });
      if (baseClients.length === 1) {
        waitingClients = baseClients;
      }
    }

    if (waitingClients.length === 1) {
      targetClient = waitingClients[0];
    } else if (waitingClients.length > 1) {
      const listNames = waitingClients.map((c) => `${c.name} (${c.machine_id})`).join(', ');
      logActivity('billing', `[PERINGATAN QRIS] Masuk Rp${amount.toLocaleString('id-ID')} tapi ada ${waitingClients.length} klien dengan nominal sama: ${listNames}. Harap aktivasi manual.`);
      return res.json({
        ok: true,
        status: 'ambiguous',
        message: 'Terdapat lebih dari satu klien dengan nominal tersebut. Harap gunakan kode unik atau aktivasi manual.',
      });
    }
  }

  if (targetClient) {
    const client = targetClient;
    const dedupKey = `${client.id}:${amount}`;
    const lastProcessedAt = recentProcessedPayments.get(dedupKey) || 0;
    if (Date.now() - lastProcessedAt < PAYMENT_COOLDOWN_MS) {
      return res.json({
        ok: true,
        status: 'duplicate_ignored',
        message: `Pembayaran Rp${amount.toLocaleString('id-ID')} untuk ${client.name} sudah diproses baru saja.`,
      });
    }
    recentProcessedPayments.set(dedupKey, Date.now());

    const pkg = resolvePackageByAmount(amount, client);
    const today = todayStr();
    // Akumulatif: jika masih aktif, tambahkan dari tanggal expired saat ini
    const base = client.expires_at && client.expires_at >= today ? client.expires_at : today;
    const expiresAt = addDays(base, pkg.days);
    const licenseKey = createLicenseKey({ machineId: client.machine_id, product: client.product, expiresAt });
    const now = nowIso();
    const action = `Perpanjangan otomatis via QRIS (Rp${amount.toLocaleString('id-ID')}) - ${pkg.name}`;

    transaction(() => {
      q.renewClient.run({
        id: client.id,
        expires_at: expiresAt,
        license_key: licenseKey,
        plan: pkg.label,
        locked: 0,
        lock_reason: '',
        now,
      });
      q.clearBillingAmount.run({ id: client.id, now });
      q.clearUniqueCode.run({ id: client.id, now });
      if (pendingOrder) {
        q.markOrderPaid.run({ id: pendingOrder.id, now });
      }
      q.insertHistory.run({
        client_id: client.id,
        action,
        months: Math.round(pkg.days / 30) || 1,
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
    broadcastChange('clients', { text: `Lisensi ${client.name} otomatis aktif via QRIS (${pkg.name})` });
    broadcastChange('activity', { silent: true });
    notifyClientMachine(client.machine_id, 'renew', { package: pkg.name, expires_at: expiresAt });

    // Kirim bukti pembayaran lunas ke WhatsApp owner secara asinkron
    sendClientReceiptWhatsapp(updated, { amount, pkg, expiresAt }).catch(() => {});

    return res.json({
      ok: true,
      status: 'activated',
      message: `Lisensi untuk ${client.name} berhasil diaktifkan otomatis! (${pkg.name})`,
      client: {
        id: client.id,
        name: client.name,
        machine_id: client.machine_id,
        expires_at: expiresAt,
        package: pkg.name,
      },
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

