import { api } from '../api.js';
import { esc, badge, fmtDate, fmtDateTime, timeAgo, relDays, productName, todayStr, addMonths, ICONS, copyBtn, bindCopy, toast, confirmDialog, openModal, busy } from '../ui.js';
import { openClientForm, keyBox, bindKeyBox, printLicense } from '../components.js';

const PLANS = [1, 3, 6, 12];

export default async function detail(el, ctx) {
  const id = ctx.params[0];
  const state = { months: 1, generated: null };

  async function load() {
    const data = await api(`/admin/clients/${id}`);
    if (!ctx.isCurrent()) return;
    // Bila baru dibuat + langsung diaktifkan, tampilkan key-nya.
    if (ctx.query.new && !state.generated && data.client.license_key) {
      state.generated = { key: data.client.license_key, expires_at: data.client.expires_at };
    }
    render(data);
  }

  function render({ client: c, history, activity }) {
    const today = todayStr();
    const base = c.expires_at && c.expires_at >= today ? c.expires_at : today;
    const newExpiry = addMonths(base, state.months);
    const daysClass = c.status === 'expiring' ? 'color:var(--warn)' : c.status === 'expired' ? 'color:var(--err)' : 'color:var(--ok)';

    el.innerHTML = `
      <a class="back-link" href="#/clients">${ICONS.back} Kembali ke daftar client</a>

      <header class="page-head">
        <div>
          <h1>${esc(c.name)}</h1>
          <div class="sub">${productName(c.product, true)} · Client sejak ${fmtDate(c.created_at)}${c.source === 'api' ? ' · <span class="tag api">Daftar via aplikasi</span>' : ''}</div>
        </div>
        <div class="head-actions" style="width:auto">
          ${badge(c.status, true)}
          <button class="btn btn-ghost btn-sm" id="btn-edit">${ICONS.edit} Edit</button>
        </div>
      </header>

      <section class="row top">
        <div class="card grow-1 stack">
          <h2>Informasi lisensi</h2>
          <div class="info-item"><div class="k">Machine ID</div><div class="v mid copy-inline">${esc(c.machine_id)} ${copyBtn(c.machine_id, 'Machine ID disalin')}</div></div>
          <div class="info-item"><div class="k">Paket saat ini</div><div class="v">${esc(c.plan || '-')}</div></div>
          <div class="info-item"><div class="k">Berlaku sampai</div>
            <div class="v">${fmtDate(c.expires_at)} ${c.expires_at ? `<span style="${daysClass};font-weight:600">· ${relDays(c.days_left)}</span>` : ''}</div></div>
          <div class="info-item"><div class="k">Terakhir terhubung ke server</div>
            <div class="v">${c.last_seen ? `${fmtDateTime(c.last_seen)} <span class="muted small">(${timeAgo(c.last_seen)})</span>` : '<span class="muted">Belum pernah terhubung</span>'}</div></div>
          ${c.phone || c.address ? `<div class="info-item"><div class="k">Kontak</div><div class="v">${esc(c.phone || '-')}${c.address ? ` · ${esc(c.address)}` : ''}</div></div>` : ''}
          ${c.app_version ? `<div class="info-item"><div class="k">Versi aplikasi</div><div class="v mono">${esc(c.app_version)}</div></div>` : ''}
          ${c.notes ? `<div class="info-item"><div class="k">Catatan</div><div class="v" style="white-space:pre-wrap">${esc(c.notes)}</div></div>` : ''}
          ${c.locked ? `<div class="alert warn">${ICONS.lock}<span><b>Aplikasi terkunci.</b> ${esc(c.lock_reason || '')}</span></div>` : ''}
          <div class="divider">
            <div class="muted" style="font-size:13px;line-height:1.5;margin-bottom:12px">
              ${c.locked ? 'Membuka kunci akan membuat aplikasi di PC client aktif kembali pada pengecekan berikutnya (selama lisensi belum kedaluwarsa).' : 'Kunci manual akan membuat aplikasi di PC client menampilkan layar terkunci pada pengecekan berikutnya.'}
            </div>
            <button class="btn ${c.locked ? 'btn-primary' : 'btn-danger'}" id="btn-lock">${c.locked ? ICONS.unlock + ' Buka kunci aplikasi' : ICONS.lock + ' Kunci aplikasi sekarang'}</button>
          </div>
        </div>

        <div class="card grow-14 stack" style="gap:20px">
          <h2>${c.expires_at ? 'Perpanjang dan cetak License Key' : 'Aktivasi dan cetak License Key'}</h2>
          <div>
            <div class="muted" style="font-size:13px;margin-bottom:10px">Durasi ${c.expires_at ? 'perpanjangan' : 'lisensi'}</div>
            <div class="chips" id="plan-chips">
              ${PLANS.map((n) => `<button class="chip chip-lg ${state.months === n ? 'active' : ''}" data-m="${n}">${n} bulan</button>`).join('')}
            </div>
          </div>
          <div class="compare">
            <div class="info-item"><div class="k">Berlaku sampai (sebelum)</div><div class="v">${fmtDate(c.expires_at)}</div></div>
            <div class="arrow">→</div>
            <div class="info-item"><div class="k">Berlaku sampai (sesudah)</div><div class="v after">${fmtDate(newExpiry)}</div></div>
          </div>
          <label class="field">Catatan pembayaran (opsional)
            <input class="input" id="renew-note" maxlength="300" placeholder="cth. Transfer BCA Rp150.000, 4 Okt">
          </label>
          ${c.locked ? '<div class="small muted">Generate key juga akan membuka kunci aplikasi.</div>' : ''}
          <div><button class="btn btn-primary btn-lg" id="btn-generate">${ICONS.key} Generate License Key</button></div>
          <div id="key-area">${state.generated ? keyBox(c, state.generated.key, state.generated.expires_at) : ''}</div>
          ${!state.generated && c.license_key ? `
            <div class="divider">
              <div class="muted small" style="margin-bottom:6px">License Key aktif saat ini</div>
              <div class="copy-inline" style="align-items:flex-start"><code style="font-size:12px;word-break:break-all;line-height:1.6;color:var(--muted-2)">${esc(c.license_key)}</code>${copyBtn(c.license_key, 'License Key disalin')}</div>
              <button class="link-btn" style="margin-top:8px" id="btn-print-current">Cetak key saat ini</button>
            </div>` : ''}
        </div>
      </section>

      <section class="card card-flush">
        <div class="card-head"><h2>Riwayat lisensi</h2></div>
        ${history.length ? `<div class="table-wrap"><table class="tbl tbl-sm">
          <thead><tr><th>Tanggal</th><th>Aktivitas</th><th>License Key</th><th>Berlaku sampai</th><th>Catatan</th></tr></thead>
          <tbody>${history.map((h) => `
            <tr>
              <td style="white-space:nowrap">${fmtDate(h.created_at)}</td>
              <td>${esc(h.action)}</td>
              <td><span class="copy-inline"><span class="key" title="${esc(h.license_key)}">${esc(h.license_key || '-')}</span>${h.license_key ? copyBtn(h.license_key, 'License Key disalin') : ''}</span></td>
              <td style="white-space:nowrap">${fmtDate(h.expires_at)}</td>
              <td class="muted">${esc(h.note || '-')}</td>
            </tr>`).join('')}</tbody></table></div>`
          : `<div class="empty">${ICONS.key}<b>Belum ada riwayat</b>License Key pertama akan tercatat di sini.</div>`}
      </section>

      <section class="row top">
        <div class="card grow-14">
          <h2 style="margin-bottom:12px">Aktivitas terakhir</h2>
          ${activity.length ? `<div class="timeline">${activity.map((a) => `
            <div class="timeline-item"><span class="timeline-dot"></span><div><div>${esc(a.message)}</div><div class="when">${fmtDateTime(a.created_at)}</div></div></div>`).join('')}</div>`
            : '<div class="muted">Belum ada aktivitas.</div>'}
        </div>
        <div class="card grow-1 stack">
          <h2>Zona berbahaya</h2>
          <div class="muted" style="font-size:13px;line-height:1.5">Menghapus client akan menghapus seluruh riwayat lisensinya. Aplikasi di PC client akan berstatus "belum terdaftar" pada pengecekan berikutnya.</div>
          <div><button class="btn btn-danger" id="btn-delete">${ICONS.trash} Hapus client</button></div>
        </div>
      </section>`;

    bindCopy(el);
    if (state.generated) bindKeyBox(el.querySelector('#key-area'), c, state.generated.key, state.generated.expires_at);

    el.querySelectorAll('#plan-chips .chip').forEach((b) => b.addEventListener('click', () => {
      state.months = Number(b.dataset.m);
      state.generated = null;
      render({ client: c, history, activity });
    }));

    el.querySelector('#btn-print-current')?.addEventListener('click', () => printLicense(c, c.license_key, c.expires_at));

    el.querySelector('#btn-generate').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const ok = await confirmDialog({
        title: 'Generate License Key?',
        message: `Lisensi <b>${esc(c.name)}</b> akan diperpanjang <b>${state.months} bulan</b> sampai <b>${fmtDate(newExpiry)}</b>. Pastikan pembayaran sudah diterima.`,
        confirmText: 'Generate sekarang',
      });
      if (!ok) return;
      const done = busy(btn, 'Membuat key...');
      try {
        const r = await api(`/admin/clients/${c.id}/renew`, { method: 'POST', body: { months: state.months, note: el.querySelector('#renew-note').value } });
        state.generated = { key: r.license_key, expires_at: r.expires_at };
        toast('License Key berhasil dibuat');
        await load();
        el.querySelector('#key-area')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (ex) {
        toast(ex.message, 'error');
        done();
      }
    });

    el.querySelector('#btn-lock').addEventListener('click', async () => {
      if (c.locked) {
        try {
          await api(`/admin/clients/${c.id}/unlock`, { method: 'POST', body: {} });
          toast('Kunci aplikasi dibuka');
          load();
        } catch (ex) { toast(ex.message, 'error'); }
        return;
      }
      const m = openModal({
        title: 'Kunci aplikasi client',
        size: 'sm',
        body: `<p style="margin:0;color:var(--muted);line-height:1.55">Aplikasi <b>${esc(c.name)}</b> akan terkunci pada pengecekan berikutnya.</p>
          <label class="field">Alasan (tampil di layar terkunci client)
            <input class="input" id="lock-reason" maxlength="200" value="Belum melakukan pembayaran perpanjangan">
          </label>`,
        footer: `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-danger-solid" id="lock-ok">${ICONS.lock} Kunci sekarang</button>`,
      });
      m.el.querySelector('#lock-ok').addEventListener('click', async () => {
        try {
          await api(`/admin/clients/${c.id}/lock`, { method: 'POST', body: { reason: m.el.querySelector('#lock-reason').value } });
          m.close();
          toast('Aplikasi dikunci');
          load();
        } catch (ex) { toast(ex.message, 'error'); }
      });
    });

    el.querySelector('#btn-edit').addEventListener('click', async () => {
      const saved = await openClientForm(c);
      if (saved) {
        state.generated = null;
        load();
      }
    });

    el.querySelector('#btn-delete').addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Hapus client?',
        message: `Client <b>${esc(c.name)}</b> (${esc(c.machine_id)}) beserta seluruh riwayat lisensinya akan dihapus permanen.`,
        confirmText: 'Hapus permanen',
        danger: true,
      });
      if (!ok) return;
      try {
        await api(`/admin/clients/${c.id}`, { method: 'DELETE' });
        toast('Client dihapus');
        location.hash = '#/clients';
      } catch (ex) { toast(ex.message, 'error'); }
    });
  }

  await load();
}
