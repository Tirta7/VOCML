// API untuk dashboard admin (wajib login).
import express from 'express';
import { config, PRODUCTS } from '../config.js';
import { q, enrich, logActivity, transaction } from '../db.js';
import { createLicenseKey, normalizeMid, publicKeyPem } from '../license.js';
import { addDays, addMonths, dayNum, durationPlanLabel, durationText, nowIso, todayStr } from '../dates.js';
import { messagesRouter } from './messages.js';
import { billingRouter } from './billing.js';
import { MAX_AMOUNT } from '../billing.js';
import { formatRupiah } from '../qris.js';

export const adminRouter = express.Router();
adminRouter.use(messagesRouter);
adminRouter.use(billingRouter);

const STATUS_RANK = { expiring: 0, expired: 1, locked: 2, pending: 3, active: 4 };
const MID_RE = /^[A-Z0-9][A-Z0-9-]{5,63}$/;

const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);

function byUrgency(a, b) {
  const r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (r) return r;
  if (a.status === 'expired' || a.status === 'locked') return (b.days_left ?? -1e9) - (a.days_left ?? -1e9);
  return (a.days_left ?? 1e9) - (b.days_left ?? 1e9) || a.name.localeCompare(b.name);
}

function allClients() {
  return q.allClients.all().map(enrich);
}

function getClientOr404(req, res) {
  const c = q.clientById.get(Number(req.params.id));
  if (!c) {
    bad(res, 'Client tidak ditemukan', 404);
    return null;
  }
  return c;
}

function validateClientBody(body) {
  const data = {
    name: str(body.name, 120),
    product: str(body.product, 20),
    machine_id: normalizeMid(body.machine_id),
    phone: str(body.phone, 40),
    address: str(body.address, 300),
    notes: str(body.notes, 1000),
  };
  if (!data.name) return { error: 'Nama client wajib diisi' };
  if (!PRODUCTS[data.product]) return { error: 'Produk tidak valid' };
  if (!MID_RE.test(data.machine_id)) return { error: 'Format Machine ID tidak valid (huruf, angka, tanda -)' };
  return { data };
}

adminRouter.get('/me', (req, res) => {
  const pending = allClients().filter((c) => c.status === 'pending').length;
  res.json({ user: req.user.u, defaultPassword: config.usingDefaultPassword, pendingCount: pending });
});

adminRouter.get('/stats', (req, res) => {
  const all = allClients();
  const count = (arr, s) => arr.filter((c) => c.status === s).length;
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const byProduct = Object.entries(PRODUCTS).map(([key, p]) => {
    const list = all.filter((c) => c.product === key);
    return {
      product: key,
      name: p.name,
      total: list.length,
      active: count(list, 'active'),
      expiring: count(list, 'expiring'),
      expired: count(list, 'expired'),
      locked: count(list, 'locked'),
      pending: count(list, 'pending'),
    };
  });
  res.json({
    total: all.length,
    active: count(all, 'active'),
    expiring: count(all, 'expiring'),
    expired: count(all, 'expired'),
    locked: count(all, 'locked'),
    pending: count(all, 'pending'),
    online24h: all.filter((c) => c.last_seen && Date.parse(c.last_seen) > dayAgo).length,
    expiringDays: config.expiringDays,
    byProduct,
    needsAction: all.filter((c) => ['expiring', 'expired', 'locked'].includes(c.status)).sort(byUrgency).slice(0, 6),
  });
});

adminRouter.get('/clients', (req, res) => {
  const { q: search = '', product = '', status = '', sort = 'urgency' } = req.query;
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 500);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const all = allClients();
  const needle = String(search).trim().toLowerCase();

  let rows = all.filter((c) => {
    if (product && c.product !== product) return false;
    if (status === 'blocked') {
      if (c.status !== 'expired' && c.status !== 'locked') return false;
    } else if (status && c.status !== status) return false;
    if (needle) {
      const hay = `${c.name} ${c.machine_id} ${c.phone} ${c.address}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const sorters = {
    urgency: byUrgency,
    name: (a, b) => a.name.localeCompare(b.name),
    newest: (a, b) => b.created_at.localeCompare(a.created_at),
    expiry: (a, b) => (a.expires_at || '9999').localeCompare(b.expires_at || '9999'),
  };
  rows.sort(sorters[sort] || byUrgency);

  const total = rows.length;
  rows = rows.slice((page - 1) * limit, page * limit);
  res.json({
    rows,
    total,
    page,
    pages: Math.max(Math.ceil(total / limit), 1),
    counts: {
      all: all.length,
      ...Object.fromEntries(Object.keys(PRODUCTS).map((k) => [k, all.filter((c) => c.product === k).length])),
    },
  });
});

adminRouter.post('/clients', (req, res) => {
  const { data, error } = validateClientBody(req.body || {});
  if (error) return bad(res, error);
  if (q.clientByMid.get(data.machine_id, data.product)) {
    return bad(res, 'Machine ID ini sudah terdaftar untuk produk tersebut', 409);
  }
  const now = nowIso();
  const info = q.insertClient.run({ ...data, source: 'manual', app_version: '', last_ip: '', last_seen: null, now });
  const client = q.clientById.get(Number(info.lastInsertRowid));
  logActivity('create', `Client ditambahkan (${PRODUCTS[data.product].short}, ${data.machine_id})`, client);
  res.status(201).json(enrich(client));
});

adminRouter.get('/clients/:id', (req, res) => {
  const c = getClientOr404(req, res);
  if (!c) return;
  res.json({ client: enrich(c), history: q.historyFor.all(c.id), activity: q.activityFor.all(c.id) });
});

adminRouter.put('/clients/:id', (req, res) => {
  const c = getClientOr404(req, res);
  if (!c) return;
  const { data, error } = validateClientBody(req.body || {});
  if (error) return bad(res, error);
  const dup = q.clientByMid.get(data.machine_id, data.product);
  if (dup && dup.id !== c.id) return bad(res, 'Machine ID ini sudah dipakai client lain', 409);

  // Jika Machine ID / produk berubah, key lama tidak berlaku -> terbitkan ulang.
  let licenseKey = c.license_key;
  const identityChanged = data.machine_id !== c.machine_id || data.product !== c.product;
  if (identityChanged && c.expires_at) {
    licenseKey = createLicenseKey({ machineId: data.machine_id, product: data.product, expiresAt: c.expires_at });
  }
  const now = nowIso();
  transaction(() => {
    q.updateClientInfo.run({ ...data, license_key: licenseKey, now, id: c.id });
    if (identityChanged && c.expires_at) {
      q.insertHistory.run({
        client_id: c.id, action: 'Terbit ulang (ganti Machine ID)', months: 0, license_key: licenseKey,
        expires_before: c.expires_at, expires_at: c.expires_at, note: `${c.machine_id} → ${data.machine_id}`, now,
      });
    }
  });
  const updated = q.clientById.get(c.id);
  logActivity('update', identityChanged ? `Data client diubah, key diterbitkan ulang untuk ${data.machine_id}` : 'Data client diubah', updated);
  res.json(enrich(updated));
});

adminRouter.delete('/clients/:id', (req, res) => {
  const c = getClientOr404(req, res);
  if (!c) return;
  q.deleteClient.run(c.id);
  logActivity('delete', `Client "${c.name}" (${c.machine_id}) dihapus`);
  res.json({ ok: true });
});

adminRouter.post('/clients/:id/renew', (req, res) => {
  const c = getClientOr404(req, res);
  if (!c) return;
  // Durasi: { months: 1–36 } atau { days: 1–1095 }
  const hasDays = req.body?.days !== undefined && req.body?.days !== null && req.body?.days !== '';
  const days = hasDays ? Number(req.body.days) : 0;
  const months = hasDays ? 0 : Number(req.body?.months);
  if (hasDays) {
    if (!Number.isInteger(days) || days < 1 || days > 1095) return bad(res, 'Durasi harus 1–1095 hari');
  } else if (!Number.isInteger(months) || months < 1 || months > 36) {
    return bad(res, 'Durasi harus 1–36 bulan');
  }
  const duration = { months, days };
  const note = str(req.body?.note, 300);
  const unlock = req.body?.unlock !== false;

  const today = todayStr();
  const base = c.expires_at && c.expires_at >= today ? c.expires_at : today;
  const expiresAt = days ? addDays(base, days) : addMonths(base, months);
  const licenseKey = createLicenseKey({ machineId: c.machine_id, product: c.product, expiresAt });
  const first = !c.activated_at;
  const now = nowIso();
  const action = first ? `Aktivasi pertama (${durationText(duration)})` : `Perpanjang ${durationText(duration)}`;

  transaction(() => {
    q.renewClient.run({
      id: c.id, expires_at: expiresAt, license_key: licenseKey, plan: durationPlanLabel(duration),
      locked: unlock ? 0 : c.locked, lock_reason: unlock ? '' : c.lock_reason, now,
    });
    q.insertHistory.run({
      client_id: c.id, action, months, license_key: licenseKey,
      expires_before: c.expires_at, expires_at: expiresAt, note, now,
    });
  });
  const updated = q.clientById.get(c.id);
  logActivity('renew', `${action}, berlaku sampai ${expiresAt}`, updated);
  res.json({ client: enrich(updated), license_key: licenseKey, expires_at: expiresAt });
});

// Koreksi masa aktif: set tanggal berakhir baru (boleh lebih cepat), key diterbitkan ulang.
adminRouter.post('/clients/:id/set-expiry', (req, res) => {
  const c = getClientOr404(req, res);
  if (!c) return;
  if (!c.expires_at) return bad(res, 'Lisensi belum pernah diaktifkan. Gunakan Generate License Key.');
  const expiresAt = str(req.body?.expires_at, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresAt) || Number.isNaN(Date.parse(expiresAt + 'T00:00:00Z'))) {
    return bad(res, 'Tanggal berakhir tidak valid (format YYYY-MM-DD)');
  }
  const today = todayStr();
  if (expiresAt < '2020-01-01' || expiresAt > addDays(today, 1095)) return bad(res, 'Tanggal berakhir di luar rentang yang diizinkan');
  if (expiresAt === c.expires_at) return bad(res, 'Tanggal berakhir sama dengan sebelumnya');

  const note = str(req.body?.note, 300);
  const licenseKey = createLicenseKey({ machineId: c.machine_id, product: c.product, expiresAt });
  const diff = dayNum(expiresAt) - dayNum(c.expires_at);
  const action = diff < 0 ? `Koreksi masa aktif (−${-diff} hari)` : `Koreksi masa aktif (+${diff} hari)`;
  const now = nowIso();

  transaction(() => {
    q.setExpiry.run({ id: c.id, expires_at: expiresAt, license_key: licenseKey, now });
    q.insertHistory.run({
      client_id: c.id, action, months: 0, license_key: licenseKey,
      expires_before: c.expires_at, expires_at: expiresAt, note, now,
    });
  });
  const updated = q.clientById.get(c.id);
  logActivity('adjust', `${action}: ${c.expires_at} → ${expiresAt}${note ? ` (${note})` : ''}`, updated);
  res.json({ client: enrich(updated), license_key: licenseKey, expires_at: expiresAt });
});

adminRouter.post('/clients/:id/lock', (req, res) => {
  const c = getClientOr404(req, res);
  if (!c) return;
  const reason = str(req.body?.reason, 200) || 'Dikunci manual oleh admin';
  const now = nowIso();
  // Opsional: atur nominal tagihan QRIS sekaligus (null = pakai harga default).
  let billingMsg = '';
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'billing_amount')) {
    const raw = req.body.billing_amount;
    let amount = null;
    if (raw !== null && raw !== '') {
      amount = Number(String(raw).replace(/[^\d]/g, ''));
      if (!Number.isInteger(amount) || amount < 0 || amount > MAX_AMOUNT) return bad(res, `Nominal tagihan harus 0 – ${formatRupiah(MAX_AMOUNT)}`);
    }
    q.setBilling.run({ id: c.id, billing_amount: amount, billing_note: c.billing_note || '', now });
    if (amount !== null) billingMsg = `, tagihan ${formatRupiah(amount)}`;
  }
  q.setLock.run({ id: c.id, locked: 1, reason, now });
  logActivity('lock', `Aplikasi dikunci: ${reason}${billingMsg}`, c);
  res.json(enrich(q.clientById.get(c.id)));
});

adminRouter.post('/clients/:id/unlock', (req, res) => {
  const c = getClientOr404(req, res);
  if (!c) return;
  q.setLock.run({ id: c.id, locked: 0, reason: '', now: nowIso() });
  logActivity('unlock', 'Kunci aplikasi dibuka', c);
  res.json(enrich(q.clientById.get(c.id)));
});

const ACTIVITY_GROUPS = {
  license: ['renew', 'activate', 'adjust'],
  lock: ['lock', 'unlock'],
  client: ['create', 'update', 'delete', 'register'],
  message: ['message'],
  billing: ['billing'],
  system: ['login'],
};

adminRouter.get('/activity', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const group = ACTIVITY_GROUPS[req.query.group];
  const rows = group ? q.activityByTypes.all(JSON.stringify(group), limit) : q.activity.all(limit);
  res.json({ rows });
});

adminRouter.get('/settings', (req, res) => {
  res.json({
    publicKeyPem,
    expiringDays: config.expiringDays,
    graceDays: config.graceDays,
    clientApiKeyEnabled: !!config.clientApiKey,
    defaultPassword: config.usingDefaultPassword,
    adminUser: config.adminUser,
    products: PRODUCTS,
    serverTime: nowIso(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
});

const STATUS_LABEL = { active: 'Aktif', expiring: 'Segera berakhir', expired: 'Kedaluwarsa', locked: 'Terkunci', pending: 'Belum aktivasi' };

adminRouter.get('/export/clients.csv', (req, res) => {
  const cols = ['id', 'name', 'product', 'machine_id', 'phone', 'address', 'plan', 'expires_at', 'status', 'last_seen', 'license_key', 'created_at'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [cols.join(',')];
  for (const c of allClients().sort(byUrgency)) {
    lines.push(cols.map((k) => esc(k === 'status' ? STATUS_LABEL[c.status] : k === 'product' ? PRODUCTS[c.product].short : c[k])).join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="vocml-clients-${todayStr()}.csv"`);
  res.send('\uFEFF' + lines.join('\r\n'));
});
