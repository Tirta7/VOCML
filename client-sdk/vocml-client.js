// VOC ML client SDK untuk aplikasi Billiard / Kasir POS (Node.js >= 18, tanpa dependency).
//
// Contoh pemakaian di backend aplikasi POS:
//
//   import { checkLicense } from './vocml-client.js';
//   const lic = await checkLicense({
//     serverUrl: 'https://lisensi.domainanda.com',
//     product: 'pos',                                  // 'pos' atau 'billiard'
//     machineId: process.env.VOCML_MACHINE_ID,         // dari get-machine-id.ps1
//     publicKeyPem: PUBLIC_KEY,                        // salin dari menu Pengaturan VOC ML
//     cacheFile: '/app/data/license-cache.json',       // simpan di volume agar tahan restart
//     storeName: 'Toko Berkah Mart',
//     appVersion: '1.4.2',
//   });
//   if (!lic.allowed) tampilkanLayarTerkunci(lic.reason, lic.machineId);
//
// Panggil saat startup dan berkala (mis. tiap 3 jam).

import crypto from 'node:crypto';
import fs from 'node:fs';

const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PRODUCT_CODES = { billiard: 1, pos: 2 };

function b32decode(str) {
  let bits = 0, value = 0;
  const out = [];
  for (const ch of str) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('bad char');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

const dayToDate = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Verifikasi License Key secara offline. */
export function verifyLicenseKey(key, machineId, product, publicKeyPem) {
  try {
    const raw = String(key || '').toUpperCase().replace(/^VOCML-/, '').replace(/[^A-Z0-9]/g, '');
    const buf = b32decode(raw);
    if (buf.length < 78) return { valid: false, reason: 'Format key tidak valid' };
    const payload = buf.subarray(0, 14);
    const sig = buf.subarray(14, 78);
    if (!crypto.verify(null, payload, crypto.createPublicKey(publicKeyPem), sig)) {
      return { valid: false, reason: 'Tanda tangan key tidak valid' };
    }
    const midHash = crypto.createHash('sha256').update(String(machineId).trim().toUpperCase()).digest().subarray(0, 8);
    if (!midHash.equals(payload.subarray(6, 14))) return { valid: false, reason: 'Key bukan untuk komputer ini' };
    if (payload[1] !== PRODUCT_CODES[product]) return { valid: false, reason: 'Key bukan untuk aplikasi ini' };
    const expiresAt = dayToDate(payload.readUInt16BE(2));
    return { valid: true, expiresAt, expired: expiresAt < todayStr() };
  } catch {
    return { valid: false, reason: 'Format key tidak valid' };
  }
}

/** Verifikasi token status dari server. Mengembalikan payload atau null. */
export function verifyToken(token, publicKeyPem) {
  try {
    const [data, sig] = String(token).split('.');
    const ok = crypto.verify(null, Buffer.from(data), crypto.createPublicKey(publicKeyPem), Buffer.from(sig, 'base64url'));
    return ok ? JSON.parse(Buffer.from(data, 'base64url').toString()) : null;
  } catch {
    return null;
  }
}

function readCache(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function writeCache(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data)); } catch { /* abaikan */ }
}

const ALLOWED = new Set(['active', 'expiring']);

export async function checkLicense({ serverUrl, product, machineId, publicKeyPem, cacheFile, apiKey = '', storeName = '', appVersion = '', timeoutMs = 8000 }) {
  const base = serverUrl.replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/json', ...(apiKey ? { 'X-VOCML-Key': apiKey } : {}) };
  const result = (allowed, status, extra = {}) => ({ allowed, status, machineId, ...extra });

  try {
    const qs = new URLSearchParams({ machine_id: machineId, product, app_version: appVersion });
    let res = await fetch(`${base}/api/v1/check?${qs}`, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (res.status === 404) {
      // Belum terdaftar -> daftarkan, akan muncul di "Machine ID Masuk"
      res = await fetch(`${base}/api/v1/register`, {
        method: 'POST', headers, signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({ machine_id: machineId, product, store_name: storeName, app_version: appVersion }),
      });
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const payload = verifyToken(body.token, publicKeyPem);
    if (!payload || payload.machine_id !== machineId.toUpperCase()) throw new Error('Token server tidak valid');

    writeCache(cacheFile, { token: body.token, checkedAt: Date.now() });
    if (payload.status === 'locked') return result(false, 'locked', { reason: payload.lock_reason || 'Aplikasi dikunci', expiresAt: payload.expires_at });
    if (payload.status === 'pending') return result(false, 'pending', { reason: 'Menunggu aktivasi lisensi' });
    if (payload.status === 'expired') return result(false, 'expired', { reason: 'Masa lisensi telah berakhir', expiresAt: payload.expires_at });
    return result(ALLOWED.has(payload.status), payload.status, { expiresAt: payload.expires_at, licenseKey: payload.license_key });
  } catch (err) {
    // Offline: pakai cache terakhir selama masih dalam masa toleransi
    const cache = readCache(cacheFile);
    const payload = cache && verifyToken(cache.token, publicKeyPem);
    if (!payload || payload.machine_id !== machineId.toUpperCase()) {
      return result(false, 'offline', { reason: 'Tidak dapat terhubung ke server lisensi', offline: true });
    }
    const graceMs = (payload.grace_days || 0) * 86400000;
    const withinGrace = Date.now() - cache.checkedAt <= graceMs && cache.checkedAt <= Date.now();
    const key = payload.license_key ? verifyLicenseKey(payload.license_key, machineId, product, publicKeyPem) : { valid: false };
    if (ALLOWED.has(payload.status) && withinGrace && key.valid && !key.expired) {
      return result(true, payload.status, { expiresAt: key.expiresAt, offline: true });
    }
    return result(false, 'offline', { reason: 'Tidak terhubung ke server lisensi dan masa toleransi offline habis', offline: true });
  }
}
