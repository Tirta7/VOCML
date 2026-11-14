// API admin untuk Tagihan QRIS (wajib login, di-mount di adminRouter).
//   GET  /billing/settings               -> pengaturan QRIS + harga default
//   PUT  /billing/settings               -> simpan pengaturan
//   POST /billing/inspect                -> validasi payload QRIS (untuk form)
//   GET  /billing/preview.png?amount=    -> preview QR dinamis dari QRIS tersimpan
//   GET  /clients/:clientId/billing      -> tagihan satu client
//   PUT  /clients/:clientId/billing      -> atur nominal & catatan tagihan client
//   GET  /clients/:clientId/billing/qris.png -> preview QR tagihan client
import express from 'express';
import { PRODUCTS } from '../config.js';
import { q, enrich, logActivity, transaction } from '../db.js';
import { nowIso, todayStr, addDays } from '../dates.js';
import { createLicenseKey } from '../license.js';
import { broadcastChange } from '../realtime.js';
import { notifyAllClients, notifyClientMachine } from './client.js';
import { sendClientReceiptWhatsapp } from './whatsapp.js';
import { inspectQris, cleanPayload, buildDynamicQris, formatRupiah } from '../qris.js';
import { getSettings, saveSettings, billingSettingsView, effectiveAmount, billingFor, qrPng, MAX_AMOUNT, BILLING_STATUSES, getOrAssignClientUniqueCode, getClientPackages, resolvePackageByAmount } from '../billing.js';

export const billingRouter = express.Router();

const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

function parseAmount(v, { allowNull = false } = {}) {
  if (allowNull && (v === null || v === undefined || v === '')) return { value: null };
  const n = Number(String(v).replace(/[^\d]/g, ''));
  if (!Number.isInteger(n) || n < 0 || n > MAX_AMOUNT) return { error: `Nominal harus 0 – ${formatRupiah(MAX_AMOUNT)}` };
  return { value: n };
}

async function sendPng(res, payload, size) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.type('png').send(await qrPng(payload, size));
  } catch (e) {
    bad(res, 'Gagal membuat gambar QR: ' + e.message, 500);
  }
}

// ---------- Pengaturan global ----------
billingRouter.get('/billing/settings', (req, res) => {
  res.json(billingSettingsView());
});

billingRouter.post('/billing/inspect', (req, res) => {
  const r = inspectQris(req.body?.qris_payload);
  res.json(r.ok ? { ok: true, info: r.info } : { ok: false, error: r.error });
});

billingRouter.put('/billing/settings', (req, res) => {
  const body = req.body || {};
  const patch = {};
  if (body.qris_payload !== undefined) {
    const payload = cleanPayload(body.qris_payload);
    if (payload) {
      const r = inspectQris(payload);
      if (!r.ok) return bad(res, `QRIS tidak valid: ${r.error}`);
    }
    patch.qris_payload = payload;
  }
  if (body.billing_note !== undefined) patch.billing_note = String(body.billing_note).trim().slice(0, 300);
  if (body.billing_contact !== undefined) patch.billing_contact = String(body.billing_contact).trim().slice(0, 60);
  if (body.bank_name !== undefined) patch.bank_name = String(body.bank_name).trim().slice(0, 60);
  if (body.bank_account_number !== undefined) patch.bank_account_number = String(body.bank_account_number).trim().slice(0, 60);
  if (body.bank_account_holder !== undefined) patch.bank_account_holder = String(body.bank_account_holder).trim().slice(0, 100);
  if (body.invoice_sender_name !== undefined) patch.invoice_sender_name = String(body.invoice_sender_name).trim().slice(0, 100);
  if (body.invoice_sender_city !== undefined) patch.invoice_sender_city = String(body.invoice_sender_city).trim().slice(0, 80);
  if (body.invoice_sender_social !== undefined) patch.invoice_sender_social = String(body.invoice_sender_social).trim().slice(0, 80);
  if (body.wa_reminder_enabled !== undefined) patch.wa_reminder_enabled = body.wa_reminder_enabled ? '1' : '0';
  if (body.wa_reminder_days !== undefined) patch.wa_reminder_days = String(Math.max(1, Math.min(30, Number(body.wa_reminder_days) || 3)));
  if (body.wa_receipt_enabled !== undefined) patch.wa_receipt_enabled = body.wa_receipt_enabled ? '1' : '0';
  if (body.wa_admin_notify_enabled !== undefined) patch.wa_admin_notify_enabled = body.wa_admin_notify_enabled ? '1' : '0';
  if (body.wa_bot_enabled !== undefined) patch.wa_bot_enabled = body.wa_bot_enabled ? '1' : '0';
  if (body.prices && typeof body.prices === 'object') {
    for (const p of Object.keys(PRODUCTS)) {
      if (body.prices[p] === undefined) continue;
      const a = parseAmount(body.prices[p]);
      if (a.error) return bad(res, `${PRODUCTS[p].short}: ${a.error}`);
      patch[`price_${p}`] = a.value;
    }
  }
  if (body.trial_quotas && typeof body.trial_quotas === 'object') {
    const today = todayStr();
    const now = nowIso();
    let trialChanged = false;
    for (const p of Object.keys(PRODUCTS)) {
      if (body.trial_quotas[p] !== undefined) {
        const val = Math.max(0, Number(body.trial_quotas[p]) || 0);
        patch[`default_trial_quota_${p}`] = val;

        // Otomatis update semua client produk tersebut yang masih dalam masa trial / belum lisensi berbayar
        q.updateTrialQuotaForProduct.run({
          product: p,
          quota: val,
          today,
          now,
        });
        trialChanged = true;
      }
    }
    if (trialChanged) {
      broadcastChange('clients', { text: 'Kuota trial client otomatis disinkronkan' });
    }
  }
  if (body.packages !== undefined) {
    if (Array.isArray(body.packages)) {
      const sanitized = body.packages
        .map((p, idx) => ({
          id: String(p.id || `pkg_${p.days || idx}d`),
          days: Number(p.days) || 30,
          label: String(p.label || `${p.days} Hari`).trim(),
          name: String(p.name || `Paket ${p.days} Hari`).trim(),
          basePrice: Math.max(0, Number(p.basePrice || p.original_price) || 0),
          promoPrice: (p.promoPrice !== null && p.promoPrice !== undefined && p.promoPrice !== '' && Number(p.promoPrice) > 0)
            ? Number(p.promoPrice) : null,
          promoBadge: String(p.promoBadge || p.promo_badge || '').trim().slice(0, 40),
        }))
        .filter((p) => p.basePrice > 0);
      patch.pricing_packages = JSON.stringify(sanitized);
    } else {
      patch.pricing_packages = '';
    }
  }
  saveSettings(patch);
  logActivity('billing', 'Pengaturan tagihan QRIS & paket lisensi diubah');
  broadcastChange('billing', { text: 'Pengaturan tagihan QRIS & paket lisensi diperbarui' });
  broadcastChange('clients', { text: 'Paket lisensi client diperbarui' });
  notifyAllClients('billing');
  res.json(billingSettingsView());
});

billingRouter.get('/billing/preview.png', async (req, res) => {
  const s = getSettings();
  if (!s.qris_payload) return bad(res, 'QRIS belum diatur', 404);
  const a = parseAmount(req.query.amount || 10000);
  if (a.error || !a.value) return bad(res, a.error || 'Nominal tidak valid');
  try {
    await sendPng(res, buildDynamicQris(s.qris_payload, a.value), req.query.size);
  } catch (e) {
    bad(res, e.message);
  }
});

// ---------- Per client ----------
function getClient(req, res) {
  const c = q.clientById.get(Number(req.params.clientId));
  if (!c) {
    bad(res, 'Client tidak ditemukan', 404);
    return null;
  }
  return enrich(c);
}

function clientBillingView(c) {
  const s = getSettings();
  const qrisReady = !!s.qris_payload && inspectQris(s.qris_payload).ok;
  const defaultAmount = Number(s[`price_${c.product}`]) || 0;
  const uniqueCode = getOrAssignClientUniqueCode(c);
  let preview = null;
  try { preview = billingFor(c, { force: true }); } catch { /* abaikan */ }
  let customPackages = null;
  if (c.custom_packages) {
    try {
      const parsed = JSON.parse(c.custom_packages);
      if (Array.isArray(parsed) && parsed.length > 0) customPackages = parsed;
    } catch {}
  }
  return {
    custom_amount: c.billing_amount,
    default_amount: defaultAmount,
    effective_amount: effectiveAmount(c, s),
    unique_code: uniqueCode,
    note: c.billing_note || '',
    default_note: s.billing_note,
    qris_ready: qrisReady,
    merchant_name: preview?.merchant_name || '',
    status: c.status,
    showing_now: BILLING_STATUSES.includes(c.status) && !!preview,
    packages: getClientPackages(c, s),
    has_custom_packages: !!customPackages,
    custom_packages: customPackages,
    preview,
  };
}

billingRouter.get('/clients/:clientId/billing', (req, res) => {
  const c = getClient(req, res);
  if (!c) return;
  res.json(clientBillingView(c));
});

billingRouter.put('/clients/:clientId/billing', (req, res) => {
  const c = getClient(req, res);
  if (!c) return;
  const a = parseAmount(req.body?.amount, { allowNull: true });
  if (a.error) return bad(res, a.error);
  const note = String(req.body?.note ?? '').trim().slice(0, 300);

  if (req.body?.custom_packages !== undefined) {
    let customJson = null;
    if (Array.isArray(req.body.custom_packages) && req.body.custom_packages.length > 0) {
      const sanitized = req.body.custom_packages
        .map((p, idx) => ({
          id: String(p.id || `pkg_${p.days || idx}d`),
          days: Number(p.days) || 30,
          label: String(p.label || `${p.days} Hari`).trim(),
          name: String(p.name || `Paket ${p.days} Hari`).trim(),
          basePrice: Math.max(0, Number(p.basePrice || p.original_price) || 0),
          promoPrice: (p.promoPrice !== null && p.promoPrice !== undefined && p.promoPrice !== '' && Number(p.promoPrice) > 0)
            ? Number(p.promoPrice) : null,
          promoBadge: String(p.promoBadge || p.promo_badge || '').trim().slice(0, 40),
        }))
        .filter((p) => p.basePrice > 0);
      if (sanitized.length > 0) customJson = JSON.stringify(sanitized);
    }
    q.setCustomPackages.run({ id: c.id, custom_packages: customJson, now: nowIso() });
  }

  q.setBilling.run({ id: c.id, billing_amount: a.value, billing_note: note, now: nowIso() });
  const updated = enrich(q.clientById.get(c.id));
  const eff = effectiveAmount(updated);
  logActivity('billing', a.value === null
    ? `Tagihan QRIS memakai harga default (${formatRupiah(eff)})`
    : `Nominal tagihan QRIS diatur ${formatRupiah(a.value)}`, updated);
  broadcastChange('clients', { text: `Tagihan client ${updated.store_name || updated.machine_id} diperbarui` });
  notifyClientMachine(updated.machine_id, 'billing');
  res.json(clientBillingView(updated));
});

billingRouter.get('/clients/:clientId/billing/qris.png', async (req, res) => {
  const c = getClient(req, res);
  if (!c) return;
  const b = billingFor(c, { force: true });
  if (!b) return bad(res, 'Tagihan belum bisa dibuat (QRIS belum diatur atau nominal 0)', 404);
  await sendPng(res, b.qris, req.query.size);
});

// ---------- Antrean Tagihan QRIS & Konfirmasi Manual (Transfer BCA / QRIS) ----------
billingRouter.get('/billing/orders', (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 300);
  const statusFilter = String(req.query.status || '').trim().toUpperCase();
  let rows = q.allBillingOrders.all(limit);
  if (statusFilter && ['PENDING', 'PAID', 'EXPIRED'].includes(statusFilter)) {
    rows = rows.filter((r) => r.status === statusFilter);
  }
  const counts = q.countBillingOrders.get() || { total: 0, pending: 0, paid: 0, expired: 0 };
  const enrichedRows = rows.map((r) => {
    const pkg = resolvePackageByAmount(r.amount, r.client_id ? q.clientById.get(r.client_id) : null);
    return {
      ...r,
      amount_text: formatRupiah(r.amount),
      package_name: pkg?.name || 'Perpanjangan Lisensi',
      package_days: pkg?.days || 30,
    };
  });
  res.json({ rows: enrichedRows, counts });
});

billingRouter.post('/billing/orders/clear-expired', (req, res) => {
  const result = q.clearExpiredOrders.run();
  broadcastChange('billing', { silent: true });
  res.json({ ok: true, deleted: result.changes });
});

billingRouter.post('/billing/orders/:orderId/approve', (req, res) => {
  const order = q.billingOrderById.get(Number(req.params.orderId));
  if (!order) return bad(res, 'Tagihan tidak ditemukan', 404);
  if (order.status === 'PAID') return bad(res, 'Tagihan ini sudah berstatus LUNAS (PAID)');

  const rawClient =
    (order.client_id ? q.clientById.get(order.client_id) : null) ||
    q.clientByMid.get(order.machine_id, order.product);
  if (!rawClient) return bad(res, 'Client pemilik tagihan ini tidak ditemukan', 404);

  const client = enrich(rawClient);
  const amount = Number(order.amount) || 0;
  const pkg = resolvePackageByAmount(amount, client);
  const today = todayStr();
  const base = client.expires_at && client.expires_at >= today ? client.expires_at : today;
  const expiresAt = addDays(base, pkg.days);
  const licenseKey = createLicenseKey({ machineId: client.machine_id, product: client.product, expiresAt });
  const now = nowIso();
  const action = `Perpanjangan disetujui manual (${formatRupiah(amount)}) - ${pkg.name}`;

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
    q.markOrderPaid.run({ id: order.id, now });
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
      note: 'Disetujui manual oleh Admin (Transfer Bank / QRIS)',
      now,
    });
  });

  const updated = q.clientById.get(client.id);
  logActivity('renew', `[MANUAL APPROVE] ${action} untuk ${client.name}`, updated);
  broadcastChange('clients', { text: `Tagihan ${client.name} disetujui lunas (${pkg.name})` });
  broadcastChange('billing', { silent: true });
  notifyClientMachine(client.machine_id, 'renew', { package: pkg.name, expires_at: expiresAt });

  sendClientReceiptWhatsapp(updated, { amount, pkg, expiresAt }).catch(() => {});

  res.json({
    ok: true,
    message: `Tagihan ${formatRupiah(amount)} untuk ${client.name} berhasil disetujui LUNAS!`,
    client: enrich(updated),
  });
});

billingRouter.post('/billing/orders/:orderId/cancel', (req, res) => {
  const order = q.billingOrderById.get(Number(req.params.orderId));
  if (!order) return bad(res, 'Tagihan tidak ditemukan', 404);
  if (order.status !== 'PENDING') return bad(res, 'Hanya tagihan PENDING yang dapat dibatalkan');

  q.markOrderExpired.run({ id: order.id, now: nowIso() });
  broadcastChange('billing', { silent: true });
  res.json({ ok: true });
});
