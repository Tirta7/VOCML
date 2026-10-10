// Helper UI umum: format, badge, toast, modal, copy.

export const PRODUCTS = {
  billiard: { name: 'Aplikasi Billiard', short: 'Billiard' },
  pos: { name: 'Aplikasi Kasir POS', short: 'Kasir POS' },
};

export const STATUS = {
  active: { label: 'Aktif', action: 'Detail' },
  expiring: { label: 'Segera berakhir', action: 'Perpanjang' },
  expired: { label: 'Kedaluwarsa', action: 'Aktifkan' },
  locked: { label: 'Terkunci', action: 'Buka / perpanjang' },
  pending: { label: 'Belum aktivasi', action: 'Cetak key' },
};

export const ICONS = {
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  print: '<svg viewBox="0 0 24 24"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
  alert: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>',
  key: '<svg viewBox="0 0 24 24"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3"/><path d="m16 7 3 3"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  unlock: '<svg viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.9-1"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>',
  inbox: '<svg viewBox="0 0 24 24"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  users: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
  monitor: '<svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS_LONG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 'YYYY-MM-DD' -> '7 Okt 2026' */
export function fmtDate(s) {
  if (!s) return '-';
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

const parseTs = (s) => new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');

/** ISO timestamp -> '4 Okt 2026, 10:42' (waktu lokal browser) */
export function fmtDateTime(s) {
  if (!s) return '-';
  const d = parseTs(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function timeAgo(s) {
  if (!s) return 'Belum pernah';
  const diff = (Date.now() - parseTs(s).getTime()) / 1000;
  if (diff < 60) return 'Baru saja';
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} hari lalu`;
  return fmtDateTime(s);
}

export function longToday() {
  const d = new Date();
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

export function relDays(days) {
  if (days === null || days === undefined) return 'Belum diaktifkan';
  if (days === 0) return 'Berakhir hari ini';
  if (days > 0) return `${days} hari lagi`;
  return `${-days} hari lalu`;
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addMonths(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

export function addDays(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Durasi lisensi: { months } atau { days }. */
export function applyDuration(base, dur) {
  return dur.days ? addDays(base, dur.days) : addMonths(base, dur.months);
}

export function durationText(dur) {
  return dur.days ? `${dur.days} hari` : `${dur.months} bulan`;
}

export function badge(status, lg = false) {
  return `<span class="badge b-${status}${lg ? ' badge-lg' : ''}">${STATUS[status]?.label || status}</span>`;
}

export function productName(p, long = false) {
  return PRODUCTS[p] ? (long ? PRODUCTS[p].name : PRODUCTS[p].short) : p;
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ---------- Toast ---------- */
export function toast(message, type = 'success') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${type === 'error' ? ICONS.alert : ICONS.check}<span>${esc(message)}</span>`;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    el.addEventListener('animationend', () => el.remove());
  }, 3200);
}

/* ---------- Copy ---------- */
export async function copyText(text, label = 'Disalin ke clipboard') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(label);
}

/** Pasang handler untuk semua tombol [data-copy] di dalam root. */
export function bindCopy(root) {
  root.querySelectorAll('[data-copy]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      copyText(b.dataset.copy, b.dataset.copyLabel || 'Disalin ke clipboard');
    });
  });
}

export function copyBtn(text, label) {
  return `<button class="copy-btn" type="button" title="Salin" aria-label="Salin" data-copy="${esc(text)}" ${label ? `data-copy-label="${esc(label)}"` : ''}>${ICONS.copy}</button>`;
}

/* ---------- Modal ---------- */
export function openModal({ title, body, footer = '', size = '' }) {
  const root = document.getElementById('modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Tutup">${ICONS.close}</button></div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  root.appendChild(overlay);
  let onClose = () => {};
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    onClose();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('mousedown', (e) => e.target === overlay && close());
  overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  const first = overlay.querySelector('input, select, textarea');
  setTimeout(() => (first || overlay.querySelector('.modal')).focus?.(), 30);
  return { el: overlay, close, set onClose(fn) { onClose = fn; } };
}

export function confirmDialog({ title, message, confirmText = 'Ya, lanjutkan', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    const m = openModal({
      title,
      size: 'sm',
      body: `<p style="margin:0;color:var(--muted);line-height:1.55">${message}</p>`,
      footer: `<button class="btn btn-ghost" data-close>Batal</button>
               <button class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" id="confirm-ok">${esc(confirmText)}</button>`,
    });
    m.onClose = () => resolve(result);
    m.el.querySelector('#confirm-ok').addEventListener('click', () => {
      result = true;
      m.close();
    });
  });
}

export function emptyState(title, text, icon = ICONS.inbox) {
  return `<div class="empty">${icon}<b>${esc(title)}</b>${esc(text)}</div>`;
}

export function loadingState() {
  return `<div class="loading-wrap">
    <div class="skel" style="height:56px;width:40%"></div>
    <div class="stats">${'<div class="skel" style="height:118px"></div>'.repeat(4)}</div>
    <div class="skel" style="height:260px"></div></div>`;
}

/** Set loading state pada tombol, kembalikan fungsi untuk reset. */
export function busy(btn, text = 'Memproses...') {
  const html = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = text;
  return () => {
    btn.disabled = false;
    btn.innerHTML = html;
  };
}
