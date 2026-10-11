import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config } from './config.js';
import './db.js';
import './license.js';
import { authRouter, requireAuth } from './auth.js';
import { adminRouter } from './routes/admin.js';
import { clientRouter } from './routes/client.js';
import { attachRealtime, broadcastChange, broadcastPresenceThrottled } from './realtime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);
app.use(express.json({ limit: '100kb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.get('/healthz', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Realtime: setelah request berhasil mengubah data, beritahu semua perangkat lewat WebSocket.
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
function topicOf(subPath) {
  if (subPath.startsWith('/messages') || /\/messages(\/|$)/.test(subPath)) return 'messages';
  if (subPath.startsWith('/billing') || /\/billing(\/|$)/.test(subPath)) return 'billing';
  if (subPath.startsWith('/settings')) return 'settings';
  return 'clients';
}
function notifyAdminChanges(req, res, next) {
  if (MUTATING.has(req.method)) {
    const origin = req.get('X-VOCML-Origin') || null;
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      const topic = topicOf(req.path);
      broadcastChange(topic, { origin });
      // Hampir semua aksi admin juga menambah baris di Riwayat Aktivitas.
      if (topic !== 'activity') broadcastChange('activity', { origin, silent: true });
    });
  }
  next();
}
function notifyClientApi(req, res, next) {
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    if (req.method === 'POST') {
      // register / activate dari aplikasi client
      const text = req.path === '/register' ? 'Machine ID baru masuk dari aplikasi' : 'Lisensi diaktifkan di PC client';
      broadcastChange('clients', { text });
      broadcastChange('activity', { silent: true });
    } else if (req.path === '/check' || req.path === '/messages') {
      broadcastPresenceThrottled(); // status online / terakhir terlihat
    }
  });
  next();
}

app.use('/api/v1', notifyClientApi, clientRouter);
app.use('/api/auth', (req, res, next) => {
  if (req.method === 'POST' && req.path === '/login') {
    res.on('finish', () => res.statusCode < 400 && broadcastChange('activity', { silent: true }));
  }
  next();
}, authRouter);
app.use('/api/admin', requireAuth, notifyAdminChanges, adminRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan' }));

app.get('/vendor/jsQR.js', (req, res) => res.sendFile(path.join(__dirname, '..', 'node_modules', 'jsqr', 'dist', 'jsQR.js')));
app.use(express.static(publicDir, { index: 'index.html', maxAge: 0, etag: true }));
app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON tidak valid' });
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server' });
});

const server = app.listen(config.port, () => {
  console.log(`VOC ML berjalan di http://localhost:${config.port}`);
  if (config.usingDefaultPassword) {
    console.warn('[PERINGATAN] Masih memakai password default. Set ADMIN_PASSWORD di file .env!');
  }
});
attachRealtime(server);
