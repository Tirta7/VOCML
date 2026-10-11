// Koneksi WebSocket realtime: menerima event perubahan dari server.
export const TAB_ID = (crypto.randomUUID?.() || String(Math.random()).slice(2)) + '';

let ws = null;
let wanted = false;
let retry = 0;
let timer = null;
let hadConnection = false;

function url() {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

function emit(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function open() {
  clearTimeout(timer);
  ws = new WebSocket(url());
  ws.onopen = () => {
    retry = 0;
    // Setelah putus lalu tersambung lagi, ambil ulang data yang mungkin terlewat.
    if (hadConnection) emit('vocml:resync');
    hadConnection = true;
    emit('vocml:rt-status', { connected: true });
  };
  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === 'change') emit('vocml:change', msg);
    else if (msg.type === 'hello' || msg.type === 'online') emit('vocml:online', msg);
  };
  ws.onclose = () => {
    emit('vocml:rt-status', { connected: false });
    ws = null;
    if (!wanted) return;
    // Backoff 1s, 2s, 4s ... maksimal 15s
    timer = setTimeout(open, Math.min(15000, 1000 * 2 ** retry++));
  };
  ws.onerror = () => ws?.close();
}

export function connectRealtime() {
  wanted = true;
  if (!ws) open();
}

export function disconnectRealtime() {
  wanted = false;
  hadConnection = false;
  clearTimeout(timer);
  ws?.close();
  ws = null;
}
