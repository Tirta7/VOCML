import { api } from '../api.js';
import { esc, ICONS } from '../ui.js';
import { messageTable, bindMessageTable, openBroadcastModal, MSG_STATUS, MSG_ICONS } from '../messages.js';

export default async function messages(el, ctx) {
  const state = { clientId: ctx.query.client || '', status: ctx.query.status || '' };
  const [{ rows: clients }] = await Promise.all([api('/admin/clients?sort=name&limit=500')]);
  if (!ctx.isCurrent()) return;

  el.innerHTML = `
    <header class="page-head">
      <div>
        <h1>Pesan Broadcast</h1>
        <div class="sub">Kirim pengumuman yang tampil sebagai notifikasi di aplikasi Billiard &amp; Kasir POS milik client.</div>
      </div>
      <div class="head-actions" style="width:auto">
        <button class="btn btn-primary" id="btn-broadcast">${MSG_ICONS.megaphone} Kirim ke Banyak Client</button>
      </div>
    </header>

    <section class="stats msg-stats" id="msg-stats"></section>

    <section class="card card-flush">
      <div class="card-head">
        <div class="chips" id="status-chips">
          <button class="chip ${!state.status ? 'active' : ''}" data-s="">Semua</button>
          ${Object.entries(MSG_STATUS).map(([k, s]) => `<button class="chip ${state.status === k ? 'active' : ''}" data-s="${k}">${s.label}</button>`).join('')}
        </div>
        <select class="select" id="client-filter" style="width:280px;max-width:100%">
          <option value="">Semua client</option>
          ${clients.map((c) => `<option value="${c.id}" ${String(c.id) === String(state.clientId) ? 'selected' : ''}>${esc(c.name)} · ${esc(c.machine_id)}</option>`).join('')}
        </select>
      </div>
      <div id="msg-table"></div>
      <div class="card-foot"><span id="msg-foot"></span><span>Pesan nonaktif / dihapus hilang dari aplikasi client dalam ±1 menit.</span></div>
    </section>`;

  async function load() {
    const { rows: all } = await api(`/admin/messages${state.clientId ? `?client_id=${state.clientId}` : ''}`);
    if (!ctx.isCurrent()) return;
    const count = (s) => all.filter((m) => m.status === s).length;
    el.querySelector('#msg-stats').innerHTML = `
      <div class="stat ok"><div class="stat-label">Sedang tayang ${MSG_ICONS.megaphone}</div><div class="stat-value">${count('active')}</div><div class="stat-note">Tampil di aplikasi client</div></div>
      <div class="stat warn"><div class="stat-label">Terjadwal ${ICONS.clock}</div><div class="stat-value">${count('scheduled')}</div><div class="stat-note">Menunggu waktu mulai</div></div>
      <div class="stat new"><div class="stat-label">Berakhir ${ICONS.check}</div><div class="stat-value">${count('ended')}</div><div class="stat-note">Lewat jadwal selesai</div></div>
      <div class="stat err"><div class="stat-label">Nonaktif ${ICONS.close}</div><div class="stat-value">${count('inactive')}</div><div class="stat-note">Dimatikan manual</div></div>`;
    const rows = state.status ? all.filter((m) => m.status === state.status) : all;
    const box = el.querySelector('#msg-table');
    box.innerHTML = messageTable(rows, { showClient: true });
    bindMessageTable(box, rows, load);
    el.querySelector('#msg-foot').textContent = `Menampilkan ${rows.length} dari ${all.length} pesan`;
  }

  el.querySelectorAll('#status-chips .chip').forEach((c) => c.addEventListener('click', () => {
    state.status = c.dataset.s;
    el.querySelectorAll('#status-chips .chip').forEach((x) => x.classList.toggle('active', x === c));
    load();
  }));
  el.querySelector('#client-filter').addEventListener('change', (e) => {
    state.clientId = e.target.value;
    load();
  });
  el.querySelector('#btn-broadcast').addEventListener('click', async () => {
    if (await openBroadcastModal()) load();
  });

  await load();
}
