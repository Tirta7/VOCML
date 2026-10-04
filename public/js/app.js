import { api } from './api.js';
import { esc, toast, loadingState, ICONS } from './ui.js';
import dashboard from './views/dashboard.js';
import clients from './views/clients.js';
import detail from './views/detail.js';
import generate from './views/generate.js';
import incoming from './views/incoming.js';
import activity from './views/activity.js';
import settings from './views/settings.js';

const routes = [
  { re: /^\/(dashboard)?$/, view: dashboard, nav: 'dashboard', title: 'Dashboard' },
  { re: /^\/clients$/, view: clients, nav: 'clients', title: 'Daftar Client' },
  { re: /^\/clients\/(\d+)$/, view: detail, nav: 'clients', title: 'Detail Client' },
  { re: /^\/generate$/, view: generate, nav: 'generate', title: 'Generate License Key' },
  { re: /^\/incoming$/, view: incoming, nav: 'incoming', title: 'Machine ID Masuk' },
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
  try {
    await route.view(viewEl, { params, query, isCurrent: () => token === renderToken });
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

function showLogin() {
  authed = false;
  appView.hidden = true;
  loginView.hidden = false;
  document.title = 'Masuk · VOC ML';
  setTimeout(() => $('#login-username').focus(), 50);
}

function showApp() {
  authed = true;
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
window.addEventListener('hashchange', render);
window.addEventListener('vocml:unauth', () => authed && showLogin());

(async function boot() {
  const me = await refreshMe();
  if (me) showApp();
  else showLogin();
})();
