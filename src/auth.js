import crypto from 'node:crypto';
import express from 'express';
import { config } from './config.js';
import { logActivity } from './db.js';

const COOKIE = 'vocml_session';
const SESSION_MS = 12 * 60 * 60 * 1000;

const hmac = (data) => crypto.createHmac('sha256', config.sessionSecret).update(data).digest('base64url');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function signSession(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${data}.${hmac(data)}`;
}

function verifySession(token) {
  if (!token) return null;
  const [data, mac] = token.split('.');
  if (!data || !mac || !safeEqual(mac, hmac(data))) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map((p) => p.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]),
  );
}

function setCookie(req, res, value, maxAgeSec) {
  const secure = config.cookieSecure || req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure}`);
}

export function requireAuth(req, res, next) {
  const session = verifySession(parseCookies(req.headers.cookie)[COOKIE]);
  if (!session) return res.status(401).json({ error: 'Silakan login terlebih dahulu' });
  req.user = session;
  next();
}

// Pembatas percobaan login sederhana: 5 gagal => blokir 5 menit per IP.
const attempts = new Map();

export const authRouter = express.Router();

authRouter.post('/login', (req, res) => {
  const ip = req.ip;
  const rec = attempts.get(ip) || { fails: 0, until: 0 };
  if (rec.until > Date.now()) {
    const mins = Math.ceil((rec.until - Date.now()) / 60000);
    return res.status(429).json({ error: `Terlalu banyak percobaan. Coba lagi dalam ${mins} menit.` });
  }
  const { username = '', password = '' } = req.body || {};
  const ok = safeEqual(username, config.adminUser) & safeEqual(password, config.adminPassword);
  if (!ok) {
    rec.fails += 1;
    if (rec.fails >= 5) {
      rec.until = Date.now() + 5 * 60 * 1000;
      rec.fails = 0;
    }
    attempts.set(ip, rec);
    return res.status(401).json({ error: 'Username atau password salah' });
  }
  attempts.delete(ip);
  setCookie(req, res, signSession({ u: username, exp: Date.now() + SESSION_MS }), SESSION_MS / 1000);
  logActivity('login', `Admin "${username}" login dari ${ip}`);
  res.json({ ok: true, user: username });
});

authRouter.post('/logout', (req, res) => {
  setCookie(req, res, '', 0);
  res.json({ ok: true });
});
