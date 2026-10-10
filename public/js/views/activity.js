import { api } from '../api.js';
import { esc, fmtDateTime, ICONS } from '../ui.js';

const GROUPS = [
  ['', 'Semua'],
  ['license', 'Lisensi'],
  ['lock', 'Kunci'],
  ['client', 'Client'],
  ['message', 'Pesan'],
  ['system', 'Login'],
];

const TYPE_LABEL = {
  renew: ['Lisensi', 'b-active'],
  activate: ['Aktivasi', 'b-active'],
  adjust: ['Koreksi', 'b-expiring'],
  lock: ['Dikunci', 'b-locked'],
  unlock: ['Dibuka', 'b-expiring'],
  create: ['Client baru', 'b-pending'],
  register: ['Registrasi', 'b-pending'],
  update: ['Diubah', 'b-pending'],
  delete: ['Dihapus', 'b-locked'],
  login: ['Login', 'b-pending'],
  message: ['Pesan', 'mt-info'],
};

export default async function activity(el, ctx) {
  let group = '';

  el.innerHTML = `
    <header class="page-head">
      <div><h1>Riwayat Aktivitas</h1><div class="sub">Catatan semua tindakan pada sistem lisensi: perpanjangan, penguncian, registrasi Machine ID, dan login admin.</div></div>
    </header>
    <section class="card card-flush">
      <div class="card-head"><div class="chips" id="act-chips">${GROUPS.map(([v, l]) => `<button class="chip ${v === group ? 'active' : ''}" data-g="${v}">${l}</button>`).join('')}</div></div>
      <div id="act-table"></div>
      <div class="card-foot"><span id="act-count"></span></div>
    </section>`;

  async function load() {
    const data = await api(`/admin/activity?limit=300${group ? `&group=${group}` : ''}`);
    if (!ctx.isCurrent()) return;
    el.querySelector('#act-table').innerHTML = data.rows.length
      ? `<div class="table-wrap"><table class="tbl tbl-sm">
          <thead><tr><th>Waktu</th><th>Jenis</th><th>Client</th><th>Keterangan</th></tr></thead>
          <tbody>${data.rows.map((a) => {
            const [label, cls] = TYPE_LABEL[a.type] || [a.type, 'b-pending'];
            return `<tr>
              <td style="white-space:nowrap">${fmtDateTime(a.created_at)}</td>
              <td><span class="badge ${cls}">${label}</span></td>
              <td>${a.client_id ? `<a class="cell-title" href="#/clients/${a.client_id}">${esc(a.client_name)}</a>` : `<span class="muted">${esc(a.client_name || '-')}</span>`}</td>
              <td>${esc(a.message)}</td>
            </tr>`;
          }).join('')}</tbody></table></div>`
      : `<div class="empty">${ICONS.clock}<b>Belum ada aktivitas</b>Aktivitas akan tercatat otomatis.</div>`;
    el.querySelector('#act-count').textContent = `Menampilkan ${data.rows.length} aktivitas terbaru`;
  }

  el.querySelectorAll('#act-chips .chip').forEach((c) => c.addEventListener('click', () => {
    group = c.dataset.g;
    el.querySelectorAll('#act-chips .chip').forEach((x) => x.classList.toggle('active', x === c));
    load();
  }));

  await load();
}
