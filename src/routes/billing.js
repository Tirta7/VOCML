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
import { q, enrich, logActivity } from '../db.js';
import { nowIso } from '../dates.js';
import { inspectQris, cleanPayload, buildDynamicQris, formatRupiah } from '../qris.js';
import { getSettings, saveSettings, billingSettingsView, effectiveAmount, billingFor, qrPng, MAX_AMOUNT, BILLING_STATUSES } from '../billing.js';

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
  if (body.prices && typeof body.prices === 'object') {
    for (const p of Object.keys(PRODUCTS)) {
      if (body.prices[p] === undefined) continue;
      const a = parseAmount(body.prices[p]);
      if (a.error) return bad(res, `${PRODUCTS[p].short}: ${a.error}`);
      patch[`price_${p}`] = a.value;
    }
  }
  saveSettings(patch);
  logActivity('billing', 'Pengaturan tagihan QRIS diubah');
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
  let preview = null;
  try { preview = billingFor(c, { force: true }); } catch { /* abaikan */ }
  return {
    custom_amount: c.billing_amount,
    default_amount: defaultAmount,
    effective_amount: effectiveAmount(c, s),
    note: c.billing_note || '',
    default_note: s.billing_note,
    qris_ready: qrisReady,
    merchant_name: preview?.merchant_name || '',
    status: c.status,
    showing_now: BILLING_STATUSES.includes(c.status) && !!preview,
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
  q.setBilling.run({ id: c.id, billing_amount: a.value, billing_note: note, now: nowIso() });
  const updated = enrich(q.clientById.get(c.id));
  const eff = effectiveAmount(updated);
  logActivity('billing', a.value === null
    ? `Tagihan QRIS memakai harga default (${formatRupiah(eff)})`
    : `Nominal tagihan QRIS diatur ${formatRupiah(a.value)}`, updated);
  res.json(clientBillingView(updated));
});

billingRouter.get('/clients/:clientId/billing/qris.png', async (req, res) => {
  const c = getClient(req, res);
  if (!c) return;
  const b = billingFor(c, { force: true });
  if (!b) return bad(res, 'Tagihan belum bisa dibuat (QRIS belum diatur atau nominal 0)', 404);
  await sendPng(res, b.qris, req.query.size);
});
