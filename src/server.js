import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config } from './config.js';
import './db.js';
import './license.js';
import { authRouter, requireAuth } from './auth.js';
import { adminRouter } from './routes/admin.js';
import { clientRouter } from './routes/client.js';

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

app.use('/api/v1', clientRouter);
app.use('/api/auth', authRouter);
app.use('/api/admin', requireAuth, adminRouter);
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

app.listen(config.port, () => {
  console.log(`VOC ML berjalan di http://localhost:${config.port}`);
  if (config.usingDefaultPassword) {
    console.warn('[PERINGATAN] Masih memakai password default. Set ADMIN_PASSWORD di file .env!');
  }
});
