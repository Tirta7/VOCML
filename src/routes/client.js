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
import { q, enrich, logActivity, transaction } from '../db.js';
import { createLicenseKey, normalizeMid, publicKeyPem, signToken, verifyLicenseKey } from '../license.js';
import { addDays, todayStr, nowIso } from '../dates.js';
import { getSettings, effectiveAmount, billingFor, qrPng, getOrAssignClientUniqueCode } from '../billing.js';
import { broadcastChange } from '../realtime.js';

export const clientRouter = express.Router();

// Registry koneksi SSE real-time untuk aplikasi client (BilliardVOC, POS, dll)
// machine_id -> Set(res)
const clientSseConnections = new Map();

export function notifyClientMachine(machineId, eventName, payload = {}) {
  const mid = normalizeMid(machineId);
  const pool = clientSseConnections.get(mid);
  if (!pool || pool.size === 0) return;
  const data = JSON.stringify({ ...payload, event: eventName, at: Date.now() });
  for (const res of pool) {
    try {
      res.write(`event: ${eventName}\ndata: ${data}\n\n`);
    } catch {}
  }
}

export function notifyAllClients(eventName, payload = {}) {
  for (const mid of clientSseConnections.keys()) {
    notifyClientMachine(mid, eventName, payload);
  }
}

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
  const isAllowed = c.status === 'active' || c.status === 'expiring' || c.status === 'trial';
  const code = getOrAssignClientUniqueCode(c);

  let lastPayment = null;
  try {
    const lastHist = q.historyFor.all(c.id)?.[0];
    if (lastHist) {
      lastPayment = {
        action: lastHist.action,
        amount: lastHist.amount || 0,
        package_name: c.plan || lastHist.action,
        created_at: lastHist.created_at,
        expires_at: lastHist.expires_at,
      };
    }
  } catch {}

  const payload = {
    machine_id: c.machine_id,
    product: c.product,
    status: c.status,
    plan: c.plan || '',
    allowed: isAllowed,
    locked: c.locked,
    is_locked: !!c.locked,
    expires_at: c.expires_at,
    remaining_days: c.days_left,
    days_left: c.days_left,
    unique_code: code,
    last_payment: lastPayment,
    trial: {
      enabled: (c.trial_quota || 0) > 0,
      quota: c.trial_quota || 0,
      used: c.trial_used || 0,
      remaining: c.trial_remaining || 0,
      is_trial: !!c.is_trial,
    },
    lock_reason: c.locked ? c.lock_reason : '',
    license_key: c.status === 'pending' ? null : c.license_key,
    grace_days: config.graceDays,
    server_time: nowIso(),
  };
  // `billing` di luar token agar token tetap ringkas; null bila tidak ada tagihan.
  let billing = null;
  const requestedAmount = req?.query?.amount ? Number(String(req.query.amount).replace(/[^\d]/g, '')) : null;
  try { billing = billingFor(c, { baseUrl: baseUrl(req), amount: requestedAmount }); } catch (e) { console.error('[billing]', e.message); }
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
    const s = getSettings();
    const trialQuota = Number(s[`default_trial_quota_${product}`] ?? (product === 'messagerahasia' ? 10 : 0));
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
    const newId = Number(info.lastInsertRowid);
    if (trialQuota > 0) {
      q.setClientTrial.run({ id: newId, trial_quota: trialQuota, trial_used: 0, now });
    }
    c = q.clientById.get(newId);
    getOrAssignClientUniqueCode(c);
    logActivity('register', `Machine ID baru masuk (${PRODUCTS[product].short}, ${machineId})${trialQuota > 0 ? ` [Trial ${trialQuota}x]` : ''}`, c);
  } else {
    touch(c, req);
  }
  res.json(statusResponse(q.clientById.get(c.id), req));
});

// Endpoint SSE real-time untuk PC client — menerima update lisensi / lock secara instan tanpa jeda polling
clientRouter.get('/stream', (req, res) => {
  const { machineId, product, error } = readIdentity(req.query);
  if (error) return res.status(400).json({ error });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  if (!clientSseConnections.has(machineId)) {
    clientSseConnections.set(machineId, new Set());
  }
  clientSseConnections.get(machineId).add(res);

  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', machineId, at: Date.now() })}\n\n`);

  const keepAlive = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(keepAlive);
    }
  }, 25_000);

  req.on('close', () => {
    clearInterval(keepAlive);
    const pool = clientSseConnections.get(machineId);
    if (pool) {
      pool.delete(res);
      if (pool.size === 0) clientSseConnections.delete(machineId);
    }
  });
});

clientRouter.get(['/check', '/license/check'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
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
  const requestedAmount = req.query.amount ? Number(String(req.query.amount).replace(/[^\d]/g, '')) : null;
  res.json({ status: c.status, billing: billingFor(c, { baseUrl: baseUrl(req), force: true, amount: requestedAmount }) });
});

clientRouter.get('/billing/qris.png', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const { machineId, product, error } = readIdentity(req.query);
  if (error) return res.status(400).json({ error });
  const row = q.clientByMid.get(machineId, product);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const requestedAmount = req.query.amount ? Number(String(req.query.amount).replace(/[^\d]/g, '')) : null;
  const b = billingFor(enrich(row), { baseUrl: baseUrl(req), force: true, amount: requestedAmount });
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

// ---------- Konsumsi Kuota Gratis Trial (misal 1x kirim pesan rahasia) ----------
clientRouter.post('/trial/consume', (req, res) => {
  const { machineId, product, error } = readIdentity(req.body || {});
  if (error) return res.status(400).json({ error });
  const row = q.clientByMid.get(machineId, product);
  if (!row) return res.status(404).json({ error: 'Client tidak ditemukan' });
  const c = enrich(row);
  touch(c, req);

  // Jika lisensi sudah aktif / langganan berbayar, langsung izinkan tanpa memotong kuota trial
  if (c.status === 'active' || c.status === 'expiring') {
    return res.json({
      ok: true,
      allowed: true,
      status: c.status,
      is_license_active: true,
      message: 'Lisensi akun aktif penuh',
      trial: { enabled: (c.trial_quota || 0) > 0, quota: c.trial_quota, used: c.trial_used, remaining: c.trial_remaining },
    });
  }

  if (c.locked) {
    return res.status(403).json({
      ok: false,
      allowed: false,
      status: 'locked',
      error: c.lock_reason || 'Aplikasi terkunci oleh admin',
      trial: { enabled: (c.trial_quota || 0) > 0, quota: c.trial_quota, used: c.trial_used, remaining: c.trial_remaining },
    });
  }

  if ((c.trial_quota || 0) <= 0) {
    return res.status(403).json({
      ok: false,
      allowed: false,
      status: c.status,
      error: 'Akun Anda tidak memiliki kuota gratis trial. Silakan aktifkan lisensi.',
      trial: { enabled: false, quota: 0, used: 0, remaining: 0 },
    });
  }

  if (c.trial_used >= c.trial_quota) {
    return res.status(403).json({
      ok: false,
      allowed: false,
      status: 'expired',
      error: `Kuota gratis trial Anda telah habis (${c.trial_used}/${c.trial_quota}). Silakan lakukan perpanjangan lisensi.`,
      trial: { enabled: true, quota: c.trial_quota, used: c.trial_used, remaining: 0 },
    });
  }

  // Konsumsi 1x kuota trial
  const now = nowIso();
  q.consumeClientTrial.run({ id: c.id, now });
  const updated = enrich(q.clientById.get(c.id));
  const remaining = updated.trial_remaining;
  logActivity('trial', `Client memakai 1 kuota trial (sisa ${remaining}/${updated.trial_quota})`, updated);
  broadcastChange('clients', { text: `${updated.name} memakai 1 kuota trial` });

  res.json({
    ok: true,
    allowed: true,
    status: updated.status,
    message: `Kuota trial berhasil digunakan. Sisa kuota: ${remaining} kali lagi.`,
    trial: {
      enabled: true,
      quota: updated.trial_quota,
      used: updated.trial_used,
      remaining,
      is_trial: updated.is_trial,
    },
  });
});

// ---------- Klaim Kode Voucher Promo / Diskon / Kuota Trial ----------
clientRouter.post('/voucher/claim', (req, res) => {
  const { machineId, product, error } = readIdentity(req.body || {});
  if (error) return res.status(400).json({ error });
  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Kode voucher tidak boleh kosong' });

  const row = q.clientByMid.get(machineId, product);
  if (!row) return res.status(404).json({ error: 'Client belum terdaftar' });
  const c = enrich(row);

  const voucher = q.voucherByCode.get(code);
  if (!voucher || !voucher.is_active) {
    return res.status(404).json({ error: 'Kode voucher tidak valid atau sudah tidak aktif' });
  }

  // Cek produk yang berlaku
  if (voucher.product !== 'all' && voucher.product !== product) {
    return res.status(400).json({ error: `Voucher ini hanya berlaku untuk ${PRODUCTS[voucher.product]?.short || voucher.product}` });
  }

  // Cek masa berlaku voucher
  const today = todayStr();
  if (voucher.expires_at && voucher.expires_at < today) {
    return res.status(400).json({ error: 'Masa berlaku kode voucher telah berakhir' });
  }

  // Cek batas pemakaian total voucher
  if (voucher.max_uses > 0 && voucher.used_count >= voucher.max_uses) {
    return res.status(400).json({ error: 'Kuota pemakaian voucher ini sudah habis' });
  }

  // Cek apakah client ini sudah pernah klaim voucher ini
  const existingClaim = q.voucherClaimByClientAndVoucher.get(voucher.id, c.id);
  if (existingClaim) {
    return res.status(400).json({ error: 'Akun Anda sudah pernah menggunakan kode voucher ini' });
  }

  const now = nowIso();
  let resultMsg = '';

  transaction(() => {
    // Catat klaim voucher
    q.insertVoucherClaim.run({
      voucher_id: voucher.id,
      client_id: c.id,
      machine_id: machineId,
      product,
      code: voucher.code,
      type: voucher.type,
      value: voucher.value,
      now,
    });
    q.incrementVoucherUse.run({ id: voucher.id, now });

    if (voucher.type === 'free_days') {
      const days = Math.round(voucher.value);
      const base = c.expires_at && c.expires_at >= today ? c.expires_at : today;
      const expiresAt = addDays(base, days);
      const licenseKey = createLicenseKey({ machineId: c.machine_id, product: c.product, expiresAt });
      q.renewClient.run({
        id: c.id,
        expires_at: expiresAt,
        license_key: licenseKey,
        plan: `${days} Hari (Voucher ${voucher.code})`,
        locked: 0,
        lock_reason: '',
        now,
      });
      q.insertHistory.run({
        client_id: c.id,
        action: `Klaim voucher ${voucher.code} (+${days} Hari)`,
        months: Math.round(days / 30) || 1,
        amount: 0,
        license_key: licenseKey,
        expires_before: c.expires_at,
        expires_at: expiresAt,
        note: `Voucher gratis ${voucher.code}`,
        now,
      });
      resultMsg = `Selamat! Voucher ${voucher.code} berhasil digunakan. Lisensi akun Anda aktif selama ${days} hari.`;
    } else if (voucher.type === 'trial_quota') {
      const addedQuota = Math.round(voucher.value);
      const newQuota = (c.trial_quota || 0) + addedQuota;
      q.setClientTrial.run({ id: c.id, trial_quota: newQuota, trial_used: c.trial_used || 0, now });
      resultMsg = `Selamat! Kuota gratis trial bertambah +${addedQuota} kali penggunaan.`;
    } else if (voucher.type === 'discount_nominal') {
      const discount = Math.round(voucher.value);
      const s = getSettings();
      const curAmount = effectiveAmount(c, s);
      const newAmount = Math.max(1000, curAmount - discount);
      q.setBilling.run({
        id: c.id,
        billing_amount: newAmount,
        billing_note: `Diskon voucher ${voucher.code} (Rp${discount.toLocaleString('id-ID')})`,
        now,
      });
      resultMsg = `Diskon Rp${discount.toLocaleString('id-ID')} berhasil diterapkan pada tagihan Anda.`;
    }
  });

  const updated = enrich(q.clientById.get(c.id));
  logActivity('voucher', `Client berhasil klaim voucher ${voucher.code} (${voucher.type}: ${voucher.value})`, updated);
  broadcastChange('vouchers', { text: `Voucher ${voucher.code} digunakan oleh ${updated.name}` });
  broadcastChange('clients', { text: `Lisensi ${updated.name} aktif via voucher` });
  broadcastChange('activity', { text: 'Aktivitas voucher baru' });

  res.json({
    ok: true,
    message: resultMsg,
    voucher_type: voucher.type,
    status: statusResponse(q.clientById.get(c.id), req),
  });
});
