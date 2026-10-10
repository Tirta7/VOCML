// API publik yang dipanggil aplikasi Billiard / Kasir POS di PC client.
//   POST /api/v1/register   -> daftarkan Machine ID (muncul di "Machine ID Masuk")
//   GET  /api/v1/check      -> status lisensi terbaru + license key + token bertanda tangan
//   POST /api/v1/activate   -> verifikasi key yang diketik manual oleh client
//   GET  /api/v1/public-key -> public key Ed25519 (PEM)
//   GET  /api/v1/messages   -> pesan broadcast aktif untuk client ini
//   GET  /api/v1/billing    -> tagihan QRIS (saat lisensi kedaluwarsa / dikunci)
//   GET  /api/v1/billing/qris.png -> gambar QR tagihan
import express from 'express';
import { config, PRODUCTS } from '../config.js';
import { q, enrich, logActivity } from '../db.js';
import { normalizeMid, publicKeyPem, signToken, verifyLicenseKey } from '../license.js';
import { nowIso } from '../dates.js';
import { billingFor, qrPng } from '../billing.js';

export const clientRouter = express.Router();

const MID_RE = /^[A-Z0-9][A-Z0-9-]{5,63}$/;
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);

// Rate limit sederhana: 120 request / menit / IP
const hits = new Map();
setInterval(() => hits.clear(), 60_000).unref();

clientRouter.use((req, res, next) => {
  const n = (hits.get(req.ip) || 0) + 1;
  hits.set(req.ip, n);
  if (n > 120) return res.status(429).json({ error: 'Terlalu banyak request' });
  if (config.clientApiKey && req.get('X-VOCML-Key') !== config.clientApiKey) {
    return res.status(401).json({ error: 'API key tidak valid' });
  }
  next();
});

function readIdentity(src) {
  const machineId = normalizeMid(src.machine_id);
  const product = str(src.product, 20);
  if (!MID_RE.test(machineId)) return { error: 'machine_id tidak valid' };
  if (!PRODUCTS[product]) return { error: `product harus salah satu dari: ${Object.keys(PRODUCTS).join(', ')}` };
  return { machineId, product };
}

const baseUrl = (req) => `${req.protocol}://${req.get('host')}`;

function statusResponse(row, req) {
  const c = enrich(row);
  const payload = {
    machine_id: c.machine_id,
    product: c.product,
    status: c.status,
    expires_at: c.expires_at,
    days_left: c.days_left,
    locked: c.locked,
    lock_reason: c.locked ? c.lock_reason : '',
    license_key: c.status === 'pending' ? null : c.license_key,
    grace_days: config.graceDays,
    server_time: nowIso(),
  };
  // `billing` di luar token agar token tetap ringkas; null bila tidak ada tagihan.
  let billing = null;
  try { billing = billingFor(c, { baseUrl: baseUrl(req) }); } catch (e) { console.error('[billing]', e.message); }
  return { ...payload, token: signToken(payload), billing };
}

function touch(c, req) {
  q.touchClient.run({ id: c.id, now: nowIso(), ip: req.ip || '', app_version: str(req.body?.app_version || req.query.app_version, 40) });
}

clientRouter.get('/public-key', (req, res) => {
  res.type('text/plain').send(publicKeyPem);
});

clientRouter.post('/register', (req, res) => {
  const { machineId, product, error } = readIdentity(req.body || {});
  if (error) return res.status(400).json({ error });
  let c = q.clientByMid.get(machineId, product);
  if (!c) {
    const now = nowIso();
    const info = q.insertClient.run({
      name: str(req.body.store_name, 120) || `Client baru ${machineId.slice(-4)}`,
      product,
      machine_id: machineId,
      phone: str(req.body.phone, 40),
      address: str(req.body.address, 300),
      notes: '',
      source: 'api',
      app_version: str(req.body.app_version, 40),
      last_ip: req.ip || '',
      last_seen: now,
      now,
    });
    c = q.clientById.get(Number(info.lastInsertRowid));
    logActivity('register', `Machine ID baru masuk dari aplikasi (${PRODUCTS[product].short}, ${machineId})`, c);
  } else {
    touch(c, req);
  }
  res.json(statusResponse(q.clientById.get(c.id), req));
});

clientRouter.get('/check', (req, res) => {
  const { machineId, product, error } = readIdentity(req.query);
  if (error) return res.status(400).json({ error });
  const c = q.clientByMid.get(machineId, product);
  if (!c) return res.status(404).json({ status: 'unknown', error: 'Machine ID belum terdaftar' });
  touch(c, req);
  res.json(statusResponse(q.clientById.get(c.id), req));
});

clientRouter.get('/billing', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const { machineId, product, error } = readIdentity(req.query);
  if (error) return res.status(400).json({ error });
  const row = q.clientByMid.get(machineId, product);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const c = enrich(row);
  res.json({ status: c.status, billing: billingFor(c, { baseUrl: baseUrl(req) }) });
});

clientRouter.get('/billing/qris.png', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const { machineId, product, error } = readIdentity(req.query);
  if (error) return res.status(400).json({ error });
  const row = q.clientByMid.get(machineId, product);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const b = billingFor(enrich(row));
  if (!b) return res.status(404).json({ error: 'no_billing' });
  try {
    res.type('png').send(await qrPng(b.qris, req.query.size));
  } catch (e) {
    console.error('[billing] gagal membuat QR:', e.message);
    res.status(500).json({ error: 'Gagal membuat gambar QR' });
  }
});

clientRouter.get('/messages', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const { machineId, product, error } = readIdentity(req.query);
  if (error) return res.status(400).json({ error });
  const c = q.clientByMid.get(machineId, product);
  if (!c) return res.status(404).json({ error: 'not_found' });
  touch(c, req);
  const messages = q.liveMessagesForClient.all({ client_id: c.id, now: nowIso() }).map((m) => ({
    id: m.id,
    title: m.title || null,
    message: m.message,
    type: m.type,
    interval_minutes: m.interval_minutes,
    display_seconds: m.display_seconds,
    updated_at: m.updated_at,
  }));
  res.json({ messages });
});

clientRouter.post('/activate', (req, res) => {
  const { machineId, product, error } = readIdentity(req.body || {});
  if (error) return res.status(400).json({ error });
  const c = q.clientByMid.get(machineId, product);
  if (!c) return res.status(404).json({ status: 'unknown', error: 'Machine ID belum terdaftar' });
  const v = verifyLicenseKey(req.body.license_key, machineId);
  if (!v.valid) return res.status(400).json({ error: v.reason });
  if (v.product !== product) return res.status(400).json({ error: 'Key bukan untuk produk ini' });
  touch(c, req);
  logActivity('activate', `Key diaktifkan di PC client (berlaku s/d ${v.expiresAt})`, c);
  // Selalu kembalikan status terbaru dari server (bisa jadi sudah diperpanjang / dikunci).
  res.json(statusResponse(q.clientById.get(c.id), req));
});
