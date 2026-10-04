// Pembuatan & verifikasi License Key bertanda tangan Ed25519.
//
// Format biner (78 byte) lalu di-encode base32 dan dikelompokkan 5 karakter:
//   [0]     versi format (1)
//   [1]     kode produk (1 = billiard, 2 = pos)
//   [2..3]  tanggal berakhir (hari sejak 1970, uint16 BE)
//   [4..5]  tanggal terbit   (hari sejak 1970, uint16 BE)
//   [6..13] 8 byte pertama SHA-256(Machine ID)
//   [14..77] tanda tangan Ed25519 atas byte 0..13
//
// Private key HANYA ada di server ini (folder data). Public key ditanam di
// aplikasi Billiard / Kasir POS untuk memverifikasi key secara offline.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, PRODUCTS, PRODUCT_BY_CODE } from './config.js';
import { dayNum, fromDayNum, todayStr } from './dates.js';

const PRIV_FILE = path.join(config.dataDir, 'license_private.pem');
const PUB_FILE = path.join(config.dataDir, 'license_public.pem');

function loadKeys() {
  if (fs.existsSync(PRIV_FILE)) {
    const privateKey = crypto.createPrivateKey(fs.readFileSync(PRIV_FILE));
    const publicKey = crypto.createPublicKey(privateKey);
    if (!fs.existsSync(PUB_FILE)) {
      fs.writeFileSync(PUB_FILE, publicKey.export({ type: 'spki', format: 'pem' }));
    }
    return { privateKey, publicKey };
  }
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(PRIV_FILE, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  fs.writeFileSync(PUB_FILE, publicKey.export({ type: 'spki', format: 'pem' }));
  console.log('[license] Pasangan kunci Ed25519 baru dibuat di', config.dataDir);
  return { privateKey, publicKey };
}

const { privateKey, publicKey } = loadKeys();

export const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

// Alfabet base32 tanpa karakter yang mudah tertukar (I, O, 0, 1).
const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function b32encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function b32decode(str) {
  let bits = 0, value = 0;
  const out = [];
  for (const ch of str) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('Karakter tidak valid');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const normalizeMid = (mid) => String(mid || '').trim().toUpperCase();

function midHash(mid) {
  return crypto.createHash('sha256').update(normalizeMid(mid)).digest().subarray(0, 8);
}

export function createLicenseKey({ machineId, product, expiresAt, issuedAt = todayStr() }) {
  const p = PRODUCTS[product];
  if (!p) throw new Error('Produk tidak dikenal');
  const payload = Buffer.alloc(14);
  payload[0] = 1;
  payload[1] = p.code;
  payload.writeUInt16BE(dayNum(expiresAt), 2);
  payload.writeUInt16BE(dayNum(issuedAt), 4);
  midHash(machineId).copy(payload, 6);
  const sig = crypto.sign(null, payload, privateKey);
  const body = b32encode(Buffer.concat([payload, sig]));
  return 'VOCML-' + body.match(/.{1,5}/g).join('-');
}

export function verifyLicenseKey(key, machineId) {
  try {
    const raw = String(key || '').toUpperCase().replace(/^VOCML-/, '').replace(/[^A-Z0-9]/g, '');
    const buf = b32decode(raw);
    if (buf.length < 78) return { valid: false, reason: 'Format key tidak valid' };
    const payload = buf.subarray(0, 14);
    const sig = buf.subarray(14, 78);
    if (payload[0] !== 1) return { valid: false, reason: 'Versi key tidak didukung' };
    if (!crypto.verify(null, payload, publicKey, sig)) return { valid: false, reason: 'Tanda tangan tidak valid' };
    if (!midHash(machineId).equals(payload.subarray(6, 14))) {
      return { valid: false, reason: 'Key bukan untuk Machine ID ini' };
    }
    const expiresAt = fromDayNum(payload.readUInt16BE(2));
    return {
      valid: true,
      product: PRODUCT_BY_CODE[payload[1]] || null,
      expiresAt,
      issuedAt: fromDayNum(payload.readUInt16BE(4)),
      expired: expiresAt < todayStr(),
    };
  } catch {
    return { valid: false, reason: 'Format key tidak valid' };
  }
}

/** Token status bertanda tangan: base64url(JSON).base64url(sig) */
export function signToken(obj) {
  const data = Buffer.from(JSON.stringify(obj)).toString('base64url');
  const sig = crypto.sign(null, Buffer.from(data), privateKey).toString('base64url');
  return `${data}.${sig}`;
}
