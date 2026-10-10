// API admin untuk "Pesan Broadcast ke Client" (wajib login, di-mount di adminRouter).
//   GET    /clients/:clientId/messages   -> semua pesan satu client
//   POST   /clients/:clientId/messages   -> buat pesan baru
//   GET    /messages                     -> semua pesan lintas client (filter client_id, status)
//   POST   /messages/broadcast           -> kirim pesan yang sama ke banyak client
//   PUT    /messages/:id                 -> edit pesan
//   PATCH  /messages/:id/toggle          -> aktif / nonaktifkan
//   DELETE /messages/:id                 -> hapus permanen
import express from 'express';
import { PRODUCTS } from '../config.js';
import { q, enrich, logActivity, transaction } from '../db.js';
import { nowIso } from '../dates.js';

export const messagesRouter = express.Router();

export const MESSAGE_TYPES = ['info', 'warning', 'danger', 'success'];
const TYPE_LABEL = { info: 'Info', warning: 'Peringatan', danger: 'Bahaya', success: 'Sukses' };

const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

/** Status tampilan pesan: active | scheduled | ended | inactive */
export function messageStatus(m, now = nowIso()) {
  if (!m.is_active) return 'inactive';
  if (m.starts_at && m.starts_at > now) return 'scheduled';
  if (m.ends_at && m.ends_at < now) return 'ended';
  return 'active';
}

function present(m, now = nowIso()) {
  return { ...m, is_active: !!m.is_active, status: messageStatus(m, now) };
}

function parseDate(v, label) {
  if (v === undefined || v === null || String(v).trim() === '') return { value: null };
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return { error: `${label} tidak valid` };
  return { value: d.toISOString() };
}

function parseInt0(v, def) {
  if (v === undefined || v === null || v === '') return def;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}

/**
 * Validasi body pesan. `base` = nilai lama (untuk PUT), agar field yang tidak
 * dikirim tetap memakai nilai sebelumnya.
 */
function validateMessage(body = {}, base = null) {
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  const pick = (k, def) => (has(k) ? body[k] : base ? base[k] : def);

  const rawTitle = pick('title', null);
  const title = rawTitle === null || rawTitle === undefined ? null : String(rawTitle).trim() || null;
  const message = String(pick('message', '') ?? '').trim();
  const type = String(pick('type', 'info') || 'info').trim();
  const interval = parseInt0(pick('interval_minutes', 30), 30);
  const display = parseInt0(pick('display_seconds', 15), 15);
  const activeRaw = pick('is_active', true);
  const isActive = activeRaw === true || activeRaw === 1 || activeRaw === 'true' || activeRaw === '1';

  if (!message) return { error: 'Isi pesan wajib diisi' };
  if (message.length > 500) return { error: 'Isi pesan maksimal 500 karakter' };
  if (title && title.length > 80) return { error: 'Judul maksimal 80 karakter' };
  if (!MESSAGE_TYPES.includes(type)) return { error: `Tipe harus salah satu dari: ${MESSAGE_TYPES.join(', ')}` };
  if (!Number.isInteger(interval) || interval < 0 || interval > 1440) return { error: 'Interval tampil ulang harus 0–1440 menit' };
  if (!Number.isInteger(display) || display < 0 || display > 600) return { error: 'Lama tampil harus 0–600 detik' };

  const s = parseDate(pick('starts_at', null), 'Waktu mulai tayang');
  if (s.error) return { error: s.error };
  const e = parseDate(pick('ends_at', null), 'Waktu selesai tayang');
  if (e.error) return { error: e.error };
  if (s.value && e.value && e.value <= s.value) return { error: 'Waktu selesai harus setelah waktu mulai' };

  return {
    data: {
      title, message, type,
      interval_minutes: interval,
      display_seconds: display,
      is_active: isActive ? 1 : 0,
      starts_at: s.value,
      ends_at: e.value,
    },
  };
}

const snippet = (m) => {
  const text = m.title || m.message;
  return `"${text.length > 50 ? text.slice(0, 50) + '…' : text}"`;
};

function getMessageOr404(req, res) {
  const m = q.messageById.get(Number(req.params.id));
  if (!m) {
    bad(res, 'Pesan tidak ditemukan', 404);
    return null;
  }
  return m;
}

function getClient(req, res) {
  const c = q.clientById.get(Number(req.params.clientId));
  if (!c) {
    bad(res, 'Client tidak ditemukan', 404);
    return null;
  }
  return c;
}

// ---------- Per client ----------
messagesRouter.get('/clients/:clientId/messages', (req, res) => {
  const c = getClient(req, res);
  if (!c) return;
  const now = nowIso();
  res.json({ rows: q.messagesForClient.all(c.id).map((m) => present(m, now)) });
});

messagesRouter.post('/clients/:clientId/messages', (req, res) => {
  const c = getClient(req, res);
  if (!c) return;
  const { data, error } = validateMessage(req.body || {});
  if (error) return bad(res, error);
  const info = q.insertMessage.run({ ...data, client_id: c.id, now: nowIso() });
  const m = q.messageById.get(Number(info.lastInsertRowid));
  logActivity('message', `Pesan dikirim (${TYPE_LABEL[m.type]}): ${snippet(m)}`, c);
  res.status(201).json(present(m));
});

// ---------- Lintas client ----------
messagesRouter.get('/messages', (req, res) => {
  const clientId = Number(req.query.client_id) || 0;
  const status = String(req.query.status || '');
  const now = nowIso();
  let rows = q.allMessages.all().map((m) => present(m, now));
  if (clientId) rows = rows.filter((m) => m.client_id === clientId);
  if (status) rows = rows.filter((m) => m.status === status);
  res.json({ rows, total: rows.length });
});

messagesRouter.post('/messages/broadcast', (req, res) => {
  const body = req.body || {};
  const { data, error } = validateMessage(body);
  if (error) return bad(res, error);

  const product = body.product ? String(body.product) : '';
  if (product && !PRODUCTS[product]) return bad(res, 'Produk tidak valid');

  let targets;
  if (body.client_ids === 'all') {
    targets = q.allClients.all().map(enrich);
    if (body.only_active) targets = targets.filter((c) => c.status === 'active' || c.status === 'expiring');
  } else if (Array.isArray(body.client_ids)) {
    const ids = [...new Set(body.client_ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    targets = ids.map((id) => q.clientById.get(id)).filter(Boolean);
  } else {
    return bad(res, 'client_ids wajib berupa array ID client atau "all"');
  }
  if (product) targets = targets.filter((c) => c.product === product);
  if (!targets.length) return bad(res, 'Tidak ada client tujuan yang cocok');
  if (targets.length > 5000) return bad(res, 'Maksimal 5000 client per broadcast');

  const now = nowIso();
  const created = transaction(() => targets.map((c) => {
    const info = q.insertMessage.run({ ...data, client_id: c.id, now });
    return Number(info.lastInsertRowid);
  }));
  const sample = { title: data.title, message: data.message };
  for (const c of targets) logActivity('message', `Pesan broadcast dikirim (${TYPE_LABEL[data.type]}): ${snippet(sample)}`, c);
  res.status(201).json({ ok: true, count: created.length, ids: created });
});

messagesRouter.put('/messages/:id', (req, res) => {
  const m = getMessageOr404(req, res);
  if (!m) return;
  const { data, error } = validateMessage(req.body || {}, m);
  if (error) return bad(res, error);
  q.updateMessage.run({ ...data, id: m.id, now: nowIso() });
  const updated = q.messageById.get(m.id);
  logActivity('message', `Pesan diubah: ${snippet(updated)}`, q.clientById.get(m.client_id));
  res.json(present(updated));
});

messagesRouter.patch('/messages/:id/toggle', (req, res) => {
  const m = getMessageOr404(req, res);
  if (!m) return;
  const body = req.body || {};
  const next = typeof body.is_active === 'boolean' ? body.is_active : !m.is_active;
  q.setMessageActive.run({ id: m.id, is_active: next ? 1 : 0, now: nowIso() });
  const updated = q.messageById.get(m.id);
  logActivity('message', `${next ? 'Pesan diaktifkan' : 'Pesan dinonaktifkan'}: ${snippet(updated)}`, q.clientById.get(m.client_id));
  res.json(present(updated));
});

messagesRouter.delete('/messages/:id', (req, res) => {
  const m = getMessageOr404(req, res);
  if (!m) return;
  q.deleteMessage.run(m.id);
  logActivity('message', `Pesan dihapus: ${snippet(m)}`, q.clientById.get(m.client_id));
  res.json({ ok: true });
});
