// Koneksi WhatsApp (Baileys / WhatsApp Web multi-device) untuk mengirim reminder & kuitansi.
// Sesi login disimpan di DATA_DIR/wa-auth sehingga cukup scan QR sekali.
import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { config } from './config.js';
import { broadcastChange } from './realtime.js';

const AUTH_DIR = path.join(config.dataDir, 'wa-auth');
const logger = pino({ level: 'silent' });

/** status: disconnected | connecting | qr | connected */
const state = {
  status: 'disconnected',
  qr: null,
  qrAt: null,
  me: null,
  lastError: '',
  connectedAt: null,
};

let sock = null;
let starting = false;
let manualStop = false;
let retryTimer = null;
let retryCount = 0;
let incomingMessageHandler = null;

export function setWaIncomingHandler(fn) {
  incomingMessageHandler = typeof fn === 'function' ? fn : null;
}

// Cache pesan keluar (sentMessageCache) untuk melayani permintaan retry/re-encrypt dari HP penerima
// Mencegah pesan "Menunggu pesan ini. Ini mungkin membutuhkan waktu beberapa saat." di WhatsApp HP!
const sentMessageCache = new Map();
const MAX_CACHE_SIZE = 500;

function rememberSentMessage(msg) {
  if (!msg?.key?.id || !msg?.message) return;
  const k1 = `${msg.key.remoteJid || ''}:${msg.key.id}`;
  const k2 = msg.key.id;
  sentMessageCache.set(k1, msg.message);
  sentMessageCache.set(k2, msg.message);
  if (sentMessageCache.size > MAX_CACHE_SIZE) {
    const firstKey = sentMessageCache.keys().next().value;
    if (firstKey) sentMessageCache.delete(firstKey);
  }
}

function getCachedMessage(key) {
  if (!key?.id) return undefined;
  return (
    sentMessageCache.get(`${key.remoteJid || ''}:${key.id}`) ||
    sentMessageCache.get(key.id) ||
    undefined
  );
}

// Antrean serial (mutex) pengiriman pesan agar sesi enkripsi Signal tidak tabrakan (race condition)
let sendQueuePromise = Promise.resolve();
function enqueueSend(fn) {
  const next = sendQueuePromise.then(() => fn());
  sendQueuePromise = next.catch(() => {});
  return next;
}

function setState(patch) {
  Object.assign(state, patch);
  broadcastChange('whatsapp', { silent: true });
}

export function waStatus() {
  return {
    status: state.status,
    has_qr: !!state.qr,
    qr_at: state.qrAt,
    me: state.me,
    last_error: state.lastError,
    connected_at: state.connectedAt,
    has_session: fs.existsSync(path.join(AUTH_DIR, 'creds.json')),
  };
}

export function waQr() {
  return state.qr;
}

export const waConnected = () => state.status === 'connected' && !!sock;

/** Mulai / sambungkan ulang sesi WhatsApp. Aman dipanggil berulang. */
export async function waStart() {
  if (starting || state.status === 'connected') return waStatus();
  starting = true;
  manualStop = false;
  clearTimeout(retryTimer);
  setState({ status: 'connecting', lastError: '' });

  try {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    let version;
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch {
      version = undefined; // pakai versi bawaan library
    }

    sock = makeWASocket({
      version,
      auth: {
        creds: authState.creds,
        keys: makeCacheableSignalKeyStore(authState.keys, logger),
      },
      logger,
      printQRInTerminal: false,
      browser: Browsers.macOS('VOC ML'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      getMessage: async (key) => getCachedMessage(key),
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (!Array.isArray(messages)) return;
      for (const m of messages) {
        if (m?.key?.fromMe && m?.message) {
          rememberSentMessage(m);
          continue;
        }
        // Teruskan pesan teks masuk dari pelanggan ke handler bot self-service
        if (type === 'notify' && !m?.key?.fromMe && m?.message && incomingMessageHandler) {
          const remoteJid = m.key?.remoteJid || '';
          if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') continue;
          const textBody =
            m.message.conversation ||
            m.message.extendedTextMessage?.text ||
            m.message.imageMessage?.caption ||
            '';
          if (textBody && String(textBody).trim()) {
            Promise.resolve(
              incomingMessageHandler({
                jid: remoteJid,
                phone: remoteJid.split('@')[0].split(':')[0],
                pushName: m.pushName || '',
                text: String(textBody).trim(),
              })
            ).catch((err) => console.error('[whatsapp-bot] error:', err.message));
          }
        }
      }
    });
    sock.ev.on('connection.update', (u) => {
      const { connection, lastDisconnect, qr } = u;
      if (qr) setState({ status: 'qr', qr, qrAt: new Date().toISOString() });

      if (connection === 'open') {
        retryCount = 0;
        const id = sock?.user?.id || '';
        setState({
          status: 'connected',
          qr: null,
          me: { id, number: id.split(':')[0].split('@')[0], name: sock?.user?.name || '' },
          connectedAt: new Date().toISOString(),
          lastError: '',
        });
        console.log(`[whatsapp] Terhubung sebagai ${state.me.number}`);
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        sock = null;
        if (loggedOut) {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          setState({ status: 'disconnected', qr: null, me: null, lastError: 'Sesi WhatsApp keluar (logout dari HP). Silakan scan ulang QR.' });
          return;
        }
        if (manualStop) {
          setState({ status: 'disconnected', qr: null });
          return;
        }
        // Putus sementara (jaringan / restart dari server WA) -> sambung ulang dengan jeda bertahap.
        retryCount += 1;
        const delay = Math.min(60_000, 2_000 * retryCount);
        setState({ status: 'connecting', lastError: lastDisconnect?.error?.message || `Terputus (kode ${code || '-'})` });
        retryTimer = setTimeout(() => { waStart().catch(() => {}); }, delay);
      }
    });
  } catch (err) {
    setState({ status: 'disconnected', lastError: err.message });
  } finally {
    starting = false;
  }
  return waStatus();
}

/** Putuskan koneksi. logout=true menghapus sesi (wajib scan QR ulang). */
export async function waStop({ logout = false } = {}) {
  manualStop = true;
  clearTimeout(retryTimer);
  try {
    if (logout && sock) await sock.logout().catch(() => {});
    sock?.end?.(undefined);
  } catch {}
  sock = null;
  if (logout) fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  setState({ status: 'disconnected', qr: null, me: logout ? null : state.me });
  return waStatus();
}

/** Ubah nomor lokal (08xx / +62xx / 62xx) menjadi JID WhatsApp. */
export function toJid(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('0')) d = `62${d.slice(1)}`;
  else if (d.startsWith('8')) d = `62${d}`;
  if (d.length < 9 || d.length > 15) return null;
  return `${d}@s.whatsapp.net`;
}

async function resolveJid(phone) {
  if (!waConnected()) throw new Error('WhatsApp belum terhubung. Scan QR di menu Pengaturan terlebih dahulu.');
  const jid = toJid(phone);
  if (!jid) throw new Error(`Nomor WhatsApp tidak valid: ${phone || '(kosong)'}`);
  try {
    const [res] = await sock.onWhatsApp(jid);
    if (res && res.exists === false) throw new Error(`Nomor ${phone} tidak terdaftar di WhatsApp`);
    return res?.jid || jid;
  } catch (err) {
    if (/tidak terdaftar/.test(err.message)) throw err;
    return jid; // pengecekan gagal (timeout) -> tetap coba kirim
  }
}

export async function waSendText(phone, text) {
  return enqueueSend(async () => {
    const jid = await resolveJid(phone);
    try {
      await sock.assertSessions([jid], false);
    } catch {}
    const sent = await sock.sendMessage(jid, { text });
    rememberSentMessage(sent);
    return { jid };
  });
}

export async function waSendImage(phone, buffer, caption = '', fileName = 'invoice.png') {
  return enqueueSend(async () => {
    const jid = await resolveJid(phone);
    try {
      await sock.assertSessions([jid], false);
    } catch {}
    const sent = await sock.sendMessage(jid, { image: buffer, caption, mimetype: 'image/png', fileName });
    rememberSentMessage(sent);
    return { jid };
  });
}

/** Sambungkan otomatis saat server start bila sesi sudah pernah login. */
export function waAutoStart() {
  if (fs.existsSync(path.join(AUTH_DIR, 'creds.json'))) {
    waStart().catch((e) => console.error('[whatsapp] Gagal auto-start:', e.message));
  }
}

