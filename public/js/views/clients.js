import { api } from '../api.js';
import { ICONS, debounce, esc } from '../ui.js';
import { clientTable, bindClientTable, openClientForm } from '../components.js';

const STATUS_FILTERS = [
  ['', 'Semua status'],
  ['active', 'Aktif'],
  ['expiring', 'Segera berakhir'],
  ['blocked', 'Terkunci / kedaluwarsa'],
  ['locked', 'Dikunci manual'],
  ['expired', 'Kedaluwarsa'],
  ['pending', 'Belum aktivasi'],
];

export default async function clients(el, ctx) {
  const state = {
    q: ctx.query.q || '',
    product: ctx.query.product || '',
    status: ctx.query.status || '',
    sort: ctx.query.sort || 'urgency',
    page: 1,
  };

  el.innerHTML = `
    <header class="page-head">
      <div>
        <h1>Daftar Client</h1>
        <div class="sub" id="cl-sub">Memuat...</div>
      </div>
      <div class="head-actions">
        <a class="btn btn-ghost" href="/api/admin/export/clients.csv" id="btn-export">${ICONS.download} Export CSV</a>
        <button class="btn btn-primary" id="btn-add">${ICONS.plus} Tambah Machine ID</button>
      </div>
    </header>

    <section class="card card-flush">
      <div class="card-head">
        <div class="chips" id="cl-chips"></div>
        <div class="head-actions" style="width:auto">
          <div class="search">${ICONS.search}<input id="cl-search" class="input" type="search" placeholder="Cari nama, Machine ID, no. HP" value="${esc(state.q)}" aria-label="Cari client"></div>
          <select class="select" id="cl-status" style="width:210px" aria-label="Filter status">
            ${STATUS_FILTERS.map(([v, l]) => `<option value="${v}" ${state.status === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          <select class="select" id="cl-sort" style="width:180px" aria-label="Urutkan">
            <option value="urgency">Paling mendesak</option>
            <option value="expiry">Tanggal berakhir</option>
            <option value="name">Nama A–Z</option>
            <option value="newest">Terbaru ditambahkan</option>
          </select>
        </div>
      </div>
      <div id="cl-table"></div>
      <div class="card-foot"><span id="cl-count"></span><div class="pager" id="cl-pager"></div></div>
    </section>`;

  el.querySelector('#cl-sort').value = state.sort;

  async function load() {
    const params = new URLSearchParams({ limit: 25, page: state.page, sort: state.sort });
    if (state.q) params.set('q', state.q);
    if (state.product) params.set('product', state.product);
    if (state.status) params.set('status', state.status);
    const data = await api(`/admin/clients?${params}`);
    if (!ctx.isCurrent()) return;

    el.querySelector('#cl-sub').textContent = `${data.counts.all} client terdaftar · ${data.counts.billiard} Billiard · ${data.counts.pos} Kasir POS`;
    el.querySelector('#cl-chips').innerHTML = [
      ['', `Semua · ${data.counts.all}`],
      ['billiard', `Billiard · ${data.counts.billiard}`],
      ['pos', `Kasir POS · ${data.counts.pos}`],
    ].map(([v, l]) => `<button class="chip ${state.product === v ? 'active' : ''}" data-p="${v}">${l}</button>`).join('');
    el.querySelectorAll('#cl-chips .chip').forEach((c) => c.addEventListener('click', () => {
      state.product = c.dataset.p;
      state.page = 1;
      load();
    }));

    const box = el.querySelector('#cl-table');
    box.innerHTML = clientTable(data.rows);
    bindClientTable(box);

    const from = data.total ? (data.page - 1) * 25 + 1 : 0;
    const to = from ? from + data.rows.length - 1 : 0;
    el.querySelector('#cl-count').textContent = `Menampilkan ${from}–${to} dari ${data.total} client`;

    const pager = el.querySelector('#cl-pager');
    if (data.pages <= 1) {
      pager.innerHTML = '';
    } else {
      const pages = [];
      for (let i = 1; i <= data.pages; i++) {
        if (i === 1 || i === data.pages || Math.abs(i - data.page) <= 1) pages.push(i);
        else if (pages[pages.length - 1] !== '…') pages.push('…');
      }
      pager.innerHTML = `<button data-pg="${data.page - 1}" ${data.page === 1 ? 'disabled' : ''} aria-label="Sebelumnya">‹</button>
        ${pages.map((p) => (p === '…' ? '<span class="muted">…</span>' : `<button data-pg="${p}" class="${p === data.page ? 'active' : ''}">${p}</button>`)).join('')}
        <button data-pg="${data.page + 1}" ${data.page === data.pages ? 'disabled' : ''} aria-label="Berikutnya">›</button>`;
      pager.querySelectorAll('button[data-pg]').forEach((b) => b.addEventListener('click', () => {
        state.page = Number(b.dataset.pg);
        load();
      }));
    }
  }

  el.querySelector('#cl-search').addEventListener('input', debounce((e) => {
    state.q = e.target.value.trim();
    state.page = 1;
    load();
  }));
  el.querySelector('#cl-status').addEventListener('change', (e) => {
    state.status = e.target.value;
    state.page = 1;
    load();
  });
  el.querySelector('#cl-sort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    load();
  });
  el.querySelector('#btn-add').addEventListener('click', async () => {
    const saved = await openClientForm();
    if (saved) location.hash = `#/clients/${saved.id}${saved._newKey ? '?new=1' : ''}`;
  });

  await load();
}
