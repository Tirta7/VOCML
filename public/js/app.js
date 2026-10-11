import { api } from './api.js';
import { esc, toast, loadingState, ICONS } from './ui.js';
import dashboard from './views/dashboard.js';
import clients from './views/clients.js';
import detail from './views/detail.js';
import generate from './views/generate.js';
import incoming from './views/incoming.js';
import activity from './views/activity.js';
import settings from './views/settings.js';
import messages from './views/messages.js';
import { connectRealtime, disconnectRealtime, TAB_ID } from './realtime.js';

const routes = [
  { re: /^\/(dashboard)?$/, view: dashboard, nav: 'dashboard', title: 'Dashboard' },
  { re: /^\/clients$/, view: clients, nav: 'clients', title: 'Daftar Client' },
  { re: /^\/clients\/(\d+)$/, view: detail, nav: 'clients', title: 'Detail Client' },
  { re: /^\/generate$/, view: generate, nav: 'generate', title: 'Generate License Key', live: false },
  { re: /^\/incoming$/, view: incoming, nav: 'incoming', title: 'Machine ID Masuk' },
  { re: /^\/messages$/, view: messages, nav: 'messages', title: 'Pesan Broadcast' },
  { re: /^\/activity$/, view: activity, nav: 'activity', title: 'Riwayat Aktivitas' },
  { re: /^\/settings$/, view: settings, nav: 'settings', title: 'Pengaturan' },
];

const $ = (s) => document.querySelector(s);
const appView = $('#app-view');
const loginView = $('#login-view');
const viewEl = $('#view');
let renderToken = 0;
let authed = false;

function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/dashboard';
  const [path, qs] = h.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

async function refreshMe() {
  try {
    const me = await api('/admin/me');
    $('#user-name').textContent = me.user;
    $('#user-avatar').textContent = me.user.slice(0, 1);
    const b = $('#pending-badge');
    b.textContent = me.pendingCount;
    b.hidden = !me.pendingCount;
    return me;
  } catch {
    return null;
  }
}

async function render() {
  if (!authed) return;
  const { path, query } = parseHash();
  const route = routes.find((r) => r.re.test(path)) || routes[0];
  const params = (path.match(route.re) || []).slice(1);
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === route.nav));
  document.title = `${route.title} · VOC ML`;
  appView.classList.remove('menu-open');

  const token = ++renderToken;
  viewEl.innerHTML = loadingState();
  viewEl.classList.remove('fade-in');
  liveHandler = null;
  try {
    await route.view(viewEl, makeCtx(params, query, () => token === renderToken));
    if (token !== renderToken) return;
    void viewEl.offsetWidth;
    viewEl.classList.add('fade-in');
    window.scrollTo({ top: 0 });
  } catch (err) {
    if (token !== renderToken) return;
    viewEl.innerHTML = `<div class="card"><div class="empty">${ICONS.alert}<b>Gagal memuat halaman</b>${esc(err.message)}</div></div>`;
  }
  refreshMe();
}

/* ---------- Realtime: perbarui tampilan saat perangkat lain mengubah data ---------- */
let liveHandler = null; // { fn, partial } dari view aktif
let liveTimer = null;
let livePending = false;
let lastLiveToast = 0;

function makeCtx(params, query, isCurrent) {
  return { params, query, isCurrent, onLive: (fn, opts = {}) => { liveHandler = { fn, partial: !!opts.partial }; } };
}

function userIsBusy() {
  if (document.getElementById('modal-root')?.childElementCount) return true;
  const a = document.activeElement;
  if (a && viewEl.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return true;
  // Ada isian yang sudah diubah user tetapi belum disimpan?
  for (const f of viewEl.querySelectorAll('input, textarea, select')) {
    if (f.type === 'search') continue;
    if (f.tagName === 'SELECT') {
      if ([...f.options].some((o) => o.selected !== o.defaultSelected)) return true;
    } else if (f.type === 'checkbox' || f.type === 'radio') {
      if (f.checked !== f.defaultChecked) return true;
    } else if (f.value !== f.defaultValue) return true;
  }
  return false;
}

function scheduleLive(delay = 350) {
  livePending = true;
  clearTimeout(liveTimer);
  liveTimer = setTimeout(runLive, delay);
}

async function runLive() {
  if (!authed || !livePending || document.hidden) return; // tab tersembunyi: refresh saat kembali terlihat
  const { path, query } = parseHash();
  const route = routes.find((r) => r.re.test(path)) || routes[0];
  if (route.live === false) { livePending = false; return; }
  const partial = liveHandler?.partial;
  // Jangan menimpa pekerjaan user (modal terbuka / form sedang diisi); coba lagi nanti.
  if (!partial && userIsBusy()) return scheduleLive(2500);
  livePending = false;

  const params = (path.match(route.re) || []).slice(1);
  const token = renderToken;
  const y = window.scrollY;
  try {
    if (liveHandler) await liveHandler.fn();
    else await route.view(viewEl, makeCtx(params, query, () => token === renderToken));
    if (token === renderToken) window.scrollTo({ top: y });
  } catch (err) {
    if (route.nav === 'clients' && params.length && /tidak ditemukan/i.test(err.message)) {
      toast('Client ini sudah dihapus dari perangkat lain', 'error');
      location.hash = '#/clients';
    }
  }
  refreshMe();
}

window.addEventListener('vocml:change', (e) => {
  const m = e.detail;
  scheduleLive();
  // Toast hanya untuk perubahan dari perangkat lain / aplikasi client.
  if (!m.silent && m.origin !== TAB_ID && Date.now() - lastLiveToast > 3000) {
    lastLiveToast = Date.now();
    toast(m.text);
  }
});
window.addEventListener('vocml:resync', () => scheduleLive(0));
document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleLive(0); });

function showLogin() {
  authed = false;
  disconnectRealtime();
  appView.hidden = true;
  loginView.hidden = false;
  document.title = 'Masuk · VOC ML';
  setTimeout(() => $('#login-username').focus(), 50);
}

function showApp() {
  authed = true;
  connectRealtime();
  loginView.hidden = true;
  appView.hidden = false;
  render();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#login-submit');
  const err = $('#login-error');
  btn.disabled = true;
  btn.textContent = 'Memeriksa...';
  err.hidden = true;
  try {
    await api('/auth/login', { method: 'POST', body: { username: $('#login-username').value, password: $('#login-password').value } });
    $('#login-password').value = '';
    showApp();
    toast('Selamat datang di VOC ML');
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Masuk';
  }
});

$('#logout-btn').addEventListener('click', async () => {
  await api('/auth/logout', { method: 'POST', body: {} }).catch(() => {});
  showLogin();
});

$('#menu-btn').addEventListener('click', () => appView.classList.add('menu-open'));
$('#sidebar-backdrop').addEventListener('click', () => appView.classList.remove('menu-open'));

if (localStorage.getItem('vocml-sidebar') === '1') appView.classList.add('sidebar-collapsed');
$('#btn-sidebar-toggle').addEventListener('click', () => {
  const isCollapsed = appView.classList.toggle('sidebar-collapsed');
  localStorage.setItem('vocml-sidebar', isCollapsed ? '1' : '0');
});

window.addEventListener('hashchange', render);
window.addEventListener('vocml:unauth', () => authed && showLogin());

(async function boot() {
  const me = await refreshMe();
  if (me) showApp();
  else showLogin();
})();
