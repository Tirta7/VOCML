import express from 'express';
import { config, PRODUCTS } from '../config.js';
import { q, enrich, logActivity, transaction } from '../db.js';
import { todayStr, addDays, addMonths, nowIso, durationPlanLabel, durationText } from '../dates.js';
import { createLicenseKey } from '../license.js';
import { getSettings, effectiveAmount, resolvePackageByAmount, getOrAssignClientUniqueCode } from '../billing.js';
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

// Set ID transaksi perbankan/e-wallet yang sudah diproses (mencegah 1 notifikasi yang sama diproses 2x)
const processedTxSignatures = new Map();
const TX_SIGNATURE_TTL_MS = 24 * 60 * 60 * 1000; // 24 jam

function extractTransactionSignature(appName, text, amount) {
  const raw = String(text || '').trim();
  // Cari nomor referensi/transaksi panjang (minimal 8 digit/karakter) dari teks notifikasi bank/ShopeePay/GoPay
  const refMatch =
    raw.match(/(?:transaksi|ref|no\.?\s*ref|id|rrn|stan|kode)[:\s#]*([A-Za-z0-9-]{8,32})/i) ||
    raw.match(/\b([0-9]{10,25})\b/);
  if (refMatch) {
    return `txref:${appName}:${refMatch[1]}:${amount}`;
  }
  // Jika tidak ada nomor referensi di teks notifikasi, gunakan kombinasi teks + menit (cooldown 15 detik saja untuk anti-double-post Android)
  const bucket15s = Math.floor(Date.now() / 15000);
  return `txbucket:${appName}:${amount}:${bucket15s}`;
}

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

  // Cek apakah notifikasi dengan ID transaksi bank/ShopeePay yang persis sama sudah diproses sebelumnya
  const txSig = extractTransactionSignature(appLower, notifSummary, amount);
  const prevSigTime = processedTxSignatures.get(txSig) || 0;
  if (Date.now() - prevSigTime < TX_SIGNATURE_TTL_MS) {
    return res.json({
      ok: true,
      status: 'duplicate_tx_ignored',
      message: `Notifikasi transaksi (${txSig}) sudah pernah diproses sebelumnya.`,
    });
  }

  // 1. Cek apakah ada antrean tagihan AKTIF (billing_orders status = 'PENDING') yang menunggu nominal ini
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

  // 2. Cek apakah ada kecocokan 3-digit kode unik client AKTIF SAAT INI (amount % 1000)
  // Catatan: Setelah 1x pembayaran berhasil, kode unik client langsung di-rotate ke angka baru,
  // sehingga QRIS lama yang sudah PAID tidak akan cocok lagi di sini (1x pakai per invoice/QRIS).
  if (!targetClient) {
    const code = amount % 1000;
    if (code >= 100 && code <= 999) {
      targetClient =
        allClients.find((c) => Number(c.unique_code) === code && ['locked', 'expired', 'expiring', 'pending', 'trial'].includes(c.status)) ||
        allClients.find((c) => Number(c.unique_code) === code);
    }
  }

  // 2b. Jika tidak ada order PENDING dan kode unik sudah berubah, cek apakah nominal ini berasal dari QRIS LAMA yang sudah PAID/EXPIRED
  if (!targetClient) {
    let lastOrder = null;
    try {
      lastOrder = q.findLastOrderByAmount.get(amount);
    } catch {}
    if (lastOrder && lastOrder.status !== 'PENDING') {
      const oldClient = allClients.find((c) => c.id === lastOrder.client_id || c.machine_id === lastOrder.machine_id);
      processedTxSignatures.set(txSig, Date.now());
      logActivity(
        'billing',
        `[PERINGATAN QRIS EXPIRED] Pembayaran ulang Rp${amount.toLocaleString('id-ID')} dari ${appName} menggunakan QRIS lama yang sudah pernah dibayar (${oldClient ? oldClient.name : lastOrder.machine_id}). QRIS hanya berlaku 1x pakai — perpanjangan otomatis ditolak.`,
        oldClient || null
      );
      broadcastChange('activity', { silent: true });
      return res.json({
        ok: true,
        status: 'qris_already_used',
        message: 'Kode QRIS ini sudah pernah dibayar (hanya berlaku 1x transaksi). Silakan gunakan tagihan QRIS terbaru.',
      });
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
    processedTxSignatures.set(txSig, Date.now());

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
      if (pendingOrder) {
        q.markOrderPaid.run({ id: pendingOrder.id, now });
      }
      // Hanguskan semua order PENDING lama milik client ini dan rotasi unique_code ke angka 3-digit baru
      // agar QRIS lama yang baru saja dibayar TIDAK BISA dipakai ulang (1x pakai per transaksi)
      q.cancelPendingOrdersForClient.run({ client_id: client.id, now });
      getOrAssignClientUniqueCode(client, { rotate: true });

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

