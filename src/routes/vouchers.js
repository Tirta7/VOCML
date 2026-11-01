// API admin untuk manajemen Kode Voucher Promo & Trial (wajib login).
import express from 'express';
import { q, logActivity } from '../db.js';
import { nowIso } from '../dates.js';
import { PRODUCTS } from '../config.js';

export const vouchersRouter = express.Router();

const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);

// ---------- List semua voucher ----------
vouchersRouter.get('/vouchers', (req, res) => {
  const rows = q.allVouchers.all();
  res.json({ vouchers: rows });
});

// ---------- List riwayat klaim voucher ----------
vouchersRouter.get('/vouchers/claims', (req, res) => {
  const rows = q.allVoucherClaims.all();
  res.json({ claims: rows });
});

// ---------- Buat voucher baru ----------
vouchersRouter.post('/vouchers', (req, res) => {
  const code = str(req.body?.code, 40).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!code || code.length < 3) return bad(res, 'Kode voucher minimal 3 karakter (huruf, angka, tanda -)');

  const type = str(req.body?.type, 30);
  if (!['free_days', 'discount_nominal', 'trial_quota'].includes(type)) {
    return bad(res, 'Tipe voucher harus salah satu dari: Hari Gratis (free_days), Diskon Tagihan (discount_nominal), atau Kuota Trial (trial_quota)');
  }

  const value = Number(req.body?.value) || 0;
  if (value <= 0) return bad(res, 'Nilai voucher harus lebih dari 0');

  const maxUses = Math.max(0, Number(req.body?.max_uses) || 0);
  const product = str(req.body?.product || 'all', 20);
  if (product !== 'all' && !PRODUCTS[product]) return bad(res, 'Produk tidak valid');

  const description = str(req.body?.description, 300);
  const expiresAt = req.body?.expires_at ? str(req.body.expires_at, 20) : null;
  const now = nowIso();

  try {
    const existing = q.voucherByCode.get(code);
    if (existing) return bad(res, `Kode voucher "${code}" sudah pernah dibuat`);

    const info = q.insertVoucher.run({
      code,
      type,
      value,
      max_uses: maxUses,
      product,
      description,
      expires_at: expiresAt,
      is_active: 1,
      now,
    });
    const created = q.voucherById.get(Number(info.lastInsertRowid));
    logActivity('voucher', `Kode voucher baru dibuat: ${code} (${type}: ${value})`);
    res.json(created);
  } catch (err) {
    bad(res, 'Gagal membuat voucher: ' + err.message, 500);
  }
});

// ---------- Update voucher ----------
vouchersRouter.put('/vouchers/:id', (req, res) => {
  const id = Number(req.params.id);
  const v = q.voucherById.get(id);
  if (!v) return bad(res, 'Voucher tidak ditemukan', 404);

  const code = str(req.body?.code, 40).toUpperCase().replace(/[^A-Z0-9_-]/g, '') || v.code;
  const type = str(req.body?.type, 30) || v.type;
  const value = Number(req.body?.value) || v.value;
  const maxUses = req.body?.max_uses !== undefined ? Math.max(0, Number(req.body?.max_uses) || 0) : v.max_uses;
  const product = req.body?.product !== undefined ? str(req.body.product, 20) : v.product;
  const description = req.body?.description !== undefined ? str(req.body.description, 300) : v.description;
  const expiresAt = req.body?.expires_at !== undefined ? (req.body.expires_at ? str(req.body.expires_at, 20) : null) : v.expires_at;
  const isActive = req.body?.is_active !== undefined ? (req.body.is_active ? 1 : 0) : v.is_active;

  try {
    q.updateVoucher.run({
      id,
      code,
      type,
      value,
      max_uses: maxUses,
      product,
      description,
      expires_at: expiresAt,
      is_active: isActive,
      now: nowIso(),
    });
    logActivity('voucher', `Voucher diperbarui: ${code}`);
    res.json(q.voucherById.get(id));
  } catch (err) {
    bad(res, err.message, 500);
  }
});

// ---------- Toggle aktif / nonaktif voucher ----------
vouchersRouter.patch('/vouchers/:id/toggle', (req, res) => {
  const id = Number(req.params.id);
  const v = q.voucherById.get(id);
  if (!v) return bad(res, 'Voucher tidak ditemukan', 404);

  const isActive = req.body?.is_active !== undefined ? (req.body.is_active ? 1 : 0) : (v.is_active ? 0 : 1);
  q.toggleVoucher.run({ id, is_active: isActive, now: nowIso() });
  logActivity('voucher', `Status voucher ${v.code} diubah menjadi ${isActive ? 'Aktif' : 'Nonaktif'}`);
  res.json(q.voucherById.get(id));
});

// ---------- Hapus voucher ----------
vouchersRouter.delete('/vouchers/:id', (req, res) => {
  const id = Number(req.params.id);
  const v = q.voucherById.get(id);
  if (!v) return bad(res, 'Voucher tidak ditemukan', 404);

  q.deleteVoucher.run(id);
  logActivity('voucher', `Voucher dihapus: ${v.code}`);
  res.json({ ok: true });
});

// ---------- Atur Kuota Trial Manual Per Client ----------
vouchersRouter.put('/clients/:id/trial', (req, res) => {
  const id = Number(req.params.id);
  const c = q.clientById.get(id);
  if (!c) return bad(res, 'Client tidak ditemukan', 404);

  const trialQuota = Math.max(0, Number(req.body?.trial_quota) || 0);
  const trialUsed = Math.max(0, Number(req.body?.trial_used) || 0);
  const now = nowIso();

  q.setClientTrial.run({ id, trial_quota: trialQuota, trial_used: trialUsed, now });
  logActivity('trial', `Kuota trial diubah manual (${trialUsed}/${trialQuota}x)`, c);
  res.json({ ok: true, trial_quota: trialQuota, trial_used: trialUsed });
});

