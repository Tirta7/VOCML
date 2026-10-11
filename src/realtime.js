// Realtime (WebSocket) untuk dashboard admin.
// Setiap perangkat admin yang login membuka koneksi ke /ws. Saat salah satu perangkat
// (atau aplikasi client) mengubah data, server mengirim event "change" ke semua perangkat
// sehingga tampilan ikut diperbarui tanpa reload.
import { WebSocketServer } from 'ws';
import { sessionFromCookieHeader } from './auth.js';

const sockets = new Set();
let wss = null;

const TOPIC_TEXT = {
  clients: 'Data client diperbarui',
  messages: 'Pesan broadcast diperbarui',
  billing: 'Pengaturan tagihan diperbarui',
  settings: 'Pengaturan diperbarui',
  activity: 'Aktivitas baru tercatat',
};

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // klien non-browser
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function attachRealtime(server) {
  wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname !== '/ws') return socket.destroy();
    if (!sameOrigin(req) || !sessionFromCookieHeader(req.headers.cookie)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.isAlive = true;
      sockets.add(ws);
      ws.on('pong', () => { ws.isAlive = true; });
      ws.on('close', () => { sockets.delete(ws); announcePresence(); });
      ws.on('error', () => ws.terminate());
      ws.send(JSON.stringify({ type: 'hello', online: sockets.size }));
      announcePresence();
    });
  });

  // Heartbeat: buang koneksi mati (mis. perangkat kehilangan sinyal / listrik).
  setInterval(() => {
    for (const ws of sockets) {
      if (!ws.isAlive) { ws.terminate(); sockets.delete(ws); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30_000).unref();
}

function send(payload) {
  const data = JSON.stringify(payload);
  for (const ws of sockets) if (ws.readyState === ws.OPEN) ws.send(data);
}

function announcePresence() {
  send({ type: 'online', online: sockets.size });
}

/** Beritahu semua perangkat bahwa data berubah. topic: clients|messages|billing|settings|activity */
export function broadcastChange(topic, { origin = null, text = null, silent = false } = {}) {
  send({ type: 'change', topic, origin, silent, text: text || TOPIC_TEXT[topic] || 'Data diperbarui', at: Date.now() });
}

// Versi throttle untuk event yang sering terjadi (heartbeat aplikasi client: status online, last seen).
let lastPresence = 0;
export function broadcastPresenceThrottled(ms = 10_000) {
  const now = Date.now();
  if (now - lastPresence < ms) return;
  lastPresence = now;
  broadcastChange('clients', { silent: true });
}
