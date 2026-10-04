import { api } from '../api.js';
import { esc, fmtDateTime, timeAgo, productName, ICONS, copyBtn, bindCopy, toast, confirmDialog } from '../ui.js';
import { openClientForm } from '../components.js';

export default async function incoming(el, ctx) {
  const data = await api('/admin/clients?status=pending&sort=newest&limit=500');
  if (!ctx.isCurrent()) return;

  el.innerHTML = `
    <header class="page-head">
      <div>
        <h1>Machine ID Masuk</h1>
        <div class="sub">${data.total} Machine ID menunggu aktivasi. Aplikasi client yang baru diinstall otomatis muncul di sini lewat <code>POST /api/v1/register</code>.</div>
      </div>
      <div class="head-actions" style="width:auto">
        <button class="btn btn-primary" id="in-add">${ICONS.plus} Tambah manual</button>
      </div>
    </header>

    <section class="card card-flush">
      ${data.rows.length ? `<div class="table-wrap"><table class="tbl">
        <thead><tr><th>Client</th><th>Machine ID</th><th>Sumber</th><th>Masuk</th><th>Terakhir online</th><th>Aksi</th></tr></thead>
        <tbody>${data.rows.map((c) => `
          <tr>
            <td><a class="cell-title" href="#/clients/${c.id}">${esc(c.name)}</a><div class="cell-sub">${productName(c.product)}${c.app_version ? ` · v${esc(c.app_version)}` : ''}</div></td>
            <td><span class="copy-inline"><span class="mid">${esc(c.machine_id)}</span>${copyBtn(c.machine_id, 'Machine ID disalin')}</span></td>
            <td>${c.source === 'api' ? '<span class="tag api">Aplikasi</span>' : '<span class="tag">Manual</span>'}</td>
            <td style="white-space:nowrap">${fmtDateTime(c.created_at)}</td>
            <td style="white-space:nowrap">${timeAgo(c.last_seen)}${c.last_ip ? `<div class="cell-sub mono">${esc(c.last_ip)}</div>` : ''}</td>
            <td style="white-space:nowrap">
              <a class="btn btn-primary btn-sm" href="#/clients/${c.id}">${ICONS.key} Cetak key</a>
              <button class="btn btn-ghost btn-sm" data-edit="${c.id}" title="Edit nama / data">${ICONS.edit}</button>
              <button class="btn btn-ghost btn-sm" data-del="${c.id}" title="Tolak / hapus">${ICONS.trash}</button>
            </td>
          </tr>`).join('')}</tbody></table></div>`
        : `<div class="empty">${ICONS.inbox}<b>Tidak ada Machine ID baru</b>Semua Machine ID sudah diaktivasi. Machine ID dari instalasi baru akan muncul di sini.</div>`}
    </section>

    <section class="alert info">${ICONS.alert}
      <span>Alur: installer <code>.bat</code> membuat Machine ID dari hardware Windows → aplikasi menampilkan Machine ID dan mendaftarkannya ke server → Anda klik <b>Cetak key</b> setelah client membayar → aplikasi mengambil key otomatis pada pengecekan berikutnya.</span>
    </section>`;

  bindCopy(el);
  const rerender = () => incoming(el, ctx);

  el.querySelector('#in-add').addEventListener('click', async () => {
    const saved = await openClientForm();
    if (saved) location.hash = `#/clients/${saved.id}${saved._newKey ? '?new=1' : ''}`;
  });
  el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
    const c = data.rows.find((r) => r.id === Number(b.dataset.edit));
    if (await openClientForm(c)) rerender();
  }));
  el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const c = data.rows.find((r) => r.id === Number(b.dataset.del));
    const ok = await confirmDialog({ title: 'Tolak Machine ID?', message: `Machine ID <b>${esc(c.machine_id)}</b> (${esc(c.name)}) akan dihapus dari daftar.`, confirmText: 'Hapus', danger: true });
    if (!ok) return;
    await api(`/admin/clients/${c.id}`, { method: 'DELETE' });
    toast('Machine ID dihapus');
    rerender();
  }));
}
