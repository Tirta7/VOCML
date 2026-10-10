import { api } from '../api.js';
import { esc, longToday, ICONS } from '../ui.js';
import { clientTable, bindClientTable, openClientForm } from '../components.js';
import { rupiah } from '../billing.js';

function productBar(p) {
  const blocked = p.expired + p.locked;
  const seg = (n, cls) => (n > 0 ? `<div class="${cls}" style="flex:${n}" title="${n}"></div>` : '');
  const parts = [`${p.active} aktif`, `${p.expiring} segera berakhir`, `${blocked} terkunci/kedaluwarsa`];
  if (p.pending) parts.push(`${p.pending} belum aktivasi`);
  return `<div>
    <div class="bar-row-head"><b>${esc(p.name)}</b><span class="muted">${p.total} client</span></div>
    <div class="bar">${p.total ? seg(p.active, 's-active') + seg(p.expiring, 's-expiring') + seg(blocked, 's-blocked') + seg(p.pending, 's-pending') : ''}</div>
    <div class="bar-legend">${parts.join(' · ')}</div>
  </div>`;
}

function attentionItem(c) {
  const warn = c.status === 'expiring';
  const text = c.status === 'locked'
    ? `Terkunci${c.days_left !== null && c.days_left < 0 ? `, kedaluwarsa ${-c.days_left} hari lalu` : ' manual'}`
    : c.status === 'expired' ? `Kedaluwarsa ${-c.days_left} hari lalu` : c.days_left === 0 ? 'Berakhir hari ini' : `Berakhir ${c.days_left} hari lagi`;
  return `<a class="attn ${warn ? 'warn' : 'err'}" href="#/clients/${c.id}">
    <b>${esc(c.name)}</b>
    <div class="attn-sub"><span>${text}</span><span>${c.product === 'billiard' ? 'Billiard' : 'Kasir POS'}</span></div>
  </a>`;
}

export default async function dashboard(el, ctx) {
  const [stats, list] = await Promise.all([
    api('/admin/stats'),
    api('/admin/clients?sort=urgency&limit=8'),
  ]);
  if (!ctx.isCurrent()) return;

  const pct = stats.total ? Math.round((stats.active / stats.total) * 100) : 0;
  const blocked = stats.expired + stats.locked;

  el.innerHTML = `
    <header class="page-head">
      <div>
        <h1>Ringkasan Lisensi</h1>
        <div class="sub">${longToday()} · ${stats.total} client terdaftar · ${stats.online24h} online 24 jam terakhir</div>
      </div>
      <div class="head-actions">
        <form class="search" id="dash-search" role="search">
          ${ICONS.search}
          <label for="cari" hidden>Cari client atau Machine ID</label>
          <input id="cari" class="input" type="search" placeholder="Cari client atau Machine ID">
        </form>
        <button class="btn btn-primary" id="btn-add-mid">${ICONS.plus} Tambah Machine ID</button>
      </div>
    </header>

    <section class="stats">
      <a class="stat ok" href="#/clients?status=active">
        <div class="stat-label">Lisensi aktif ${ICONS.shield}</div>
        <div class="stat-value">${stats.active}</div>
        <div class="stat-note">${pct}% dari seluruh client</div>
      </a>
      <a class="stat warn" href="#/clients?status=expiring">
        <div class="stat-label">Berakhir ≤ ${stats.expiringDays} hari ${ICONS.clock}</div>
        <div class="stat-value">${stats.expiring}</div>
        <div class="stat-note">Perlu ditagih</div>
      </a>
      <a class="stat err" href="#/clients?status=blocked">
        <div class="stat-label">Terkunci ${ICONS.lock}</div>
        <div class="stat-value">${blocked}</div>
        <div class="stat-note">Kedaluwarsa atau dikunci manual</div>
      </a>
      <div class="stat new">
        <div class="stat-label">Pendapatan ${ICONS.monitor}</div>
        <div class="stat-value" style="font-size:24px;margin-top:16px">${rupiah(stats.revenue)}</div>
        <div class="stat-note">Total pembayaran lisensi</div>
      </div>
    </section>

    <section class="row">
      <div class="card grow-2 stack" style="gap:22px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <h2>Status per aplikasi</h2>
          <div class="legend">
            <span><i style="background:var(--teal)"></i>Aktif</span>
            <span><i style="background:var(--warn-bar)"></i>Segera berakhir</span>
            <span><i style="background:var(--err-bar)"></i>Terkunci</span>
            <span><i style="background:var(--new-bar)"></i>Belum aktivasi</span>
          </div>
        </div>
        ${stats.byProduct.map(productBar).join('')}
      </div>
      <div class="card grow-1 stack" style="gap:14px">
        <h2>Perlu tindakan</h2>
        ${stats.needsAction.length
          ? stats.needsAction.map(attentionItem).join('')
          : `<div class="empty" style="padding:24px 8px">${ICONS.check}<b>Semua aman</b>Tidak ada lisensi yang perlu ditindaklanjuti.</div>`}
      </div>
    </section>

    <section class="card card-flush">
      <div class="card-head">
        <h2>Daftar client</h2>
        <div class="chips" id="dash-chips">
          <button class="chip active" data-p="">Semua · ${list.counts.all}</button>
          <button class="chip" data-p="billiard">Billiard · ${list.counts.billiard}</button>
          <button class="chip" data-p="pos">Kasir POS · ${list.counts.pos}</button>
        </div>
      </div>
      <div id="dash-table">${clientTable(list.rows, { empty: { title: 'Belum ada client', text: 'Tambahkan Machine ID pertama Anda, atau tunggu aplikasi client mendaftar otomatis.' } })}</div>
      <div class="card-foot">
        <span id="dash-foot">Menampilkan ${list.rows.length} client paling mendesak dari ${list.total}.</span>
        <a class="action-link" href="#/clients">Lihat semua client →</a>
      </div>
    </section>`;

  bindClientTable(el.querySelector('#dash-table'));

  el.querySelector('#dash-search').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = el.querySelector('#cari').value.trim();
    location.hash = `#/clients${v ? `?q=${encodeURIComponent(v)}` : ''}`;
  });

  el.querySelector('#btn-add-mid').addEventListener('click', async () => {
    const saved = await openClientForm();
    if (saved) location.hash = `#/clients/${saved.id}${saved._newKey ? '?new=1' : ''}`;
  });

  el.querySelectorAll('#dash-chips .chip').forEach((chip) => {
    chip.addEventListener('click', async () => {
      el.querySelectorAll('#dash-chips .chip').forEach((c) => c.classList.toggle('active', c === chip));
      const p = chip.dataset.p;
      const data = await api(`/admin/clients?sort=urgency&limit=8${p ? `&product=${p}` : ''}`);
      const box = el.querySelector('#dash-table');
      box.innerHTML = clientTable(data.rows);
      bindClientTable(box);
      el.querySelector('#dash-foot').textContent = `Menampilkan ${data.rows.length} client paling mendesak dari ${data.total}.`;
    });
  });
}

