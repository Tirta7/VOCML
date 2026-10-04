import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
fs.mkdirSync(DATA_DIR, { recursive: true });

/** Baca secret dari file di folder data, atau buat baru bila belum ada. */
function persistentSecret(name) {
  const file = path.join(DATA_DIR, name);
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

export const config = {
  port: Number(process.env.PORT || 8080),
  dataDir: DATA_DIR,
  adminUser: process.env.ADMIN_USER || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'vocml123',
  usingDefaultPassword: !process.env.ADMIN_PASSWORD,
  sessionSecret: process.env.SESSION_SECRET || persistentSecret('session.secret'),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  trustProxy: process.env.TRUST_PROXY || 'loopback, linklocal, uniquelocal',
  /** Opsional: bila diisi, aplikasi client wajib kirim header X-VOCML-Key */
  clientApiKey: process.env.CLIENT_API_KEY || '',
  /** Batas hari untuk status "Segera berakhir" */
  expiringDays: Number(process.env.EXPIRING_DAYS || 7),
  /** Masa toleransi offline yang dikirim ke aplikasi client */
  graceDays: Number(process.env.OFFLINE_GRACE_DAYS || 5),
};

export const PRODUCTS = {
  billiard: { code: 1, name: 'Aplikasi Billiard', short: 'Billiard' },
  pos: { code: 2, name: 'Aplikasi Kasir POS', short: 'Kasir POS' },
};

export const PRODUCT_BY_CODE = Object.fromEntries(
  Object.entries(PRODUCTS).map(([key, p]) => [p.code, key]),
);
