import { api } from '../api.js';
import { esc, badge, fmtDate, fmtDateTime, timeAgo, relDays, productName, todayStr, applyDuration, durationText, addDays, addMonths, ICONS, copyBtn, bindCopy, toast, confirmDialog, openModal, busy } from '../ui.js';
import { openClientForm, keyBox, bindKeyBox, printLicense, durationPicker, bindDurationPicker } from '../components.js';
import { mountClientMessages } from '../messages.js';
import { mountClientBilling, getClientBilling, rupiahInput, bindRupiah, readRupiah, rupiah } from '../billing.js';

/** Jenis aktivitas -> [label, grup filter, kelas warna, ikon] */
const ACT_TYPES = {
  renew: ['Lisensi', 'license', 'ok', 'key'],
  activate: ['Aktivasi', 'license', 'ok', 'check'],
  adjust: ['Koreksi', 'license', 'warn', 'edit'],
  lock: ['Dikunci', 'lock', 'err', 'lock'],
  unlock: ['Dibuka', 'lock', 'warn', 'unlock'],
  create: ['Client baru', 'client', 'new', 'plus'],
  register: ['Registrasi', 'client', 'new', 'monitor'],
  update: ['Diubah', 'client', 'new', 'edit'],
  message: ['Pesan', 'other', 'info', 'inbox'],
  billing: ['Tagihan', 'other', 'info', 'shield'],
};
const ACT_FILTERS = [['', 'Semua'], ['license', 'Lisensi'], ['lock', 'Kunci'], ['client', 'Client'], ['other', 'Pesan & tagihan']];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const parseTs = (s) => new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function dayLabel(d) {
  const now = new Date();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (dayKey(d) === dayKey(now)) return 'Hari ini';
  if (dayKey(d) === dayKey(y)) return 'Kemarin';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Pecah "Judul: detail panjang" agar log panjang lebih mudah dibaca. */
function splitMsg(msg) {
  const s = String(msg || '');
  const i = s.indexOf(': ');
  if (i > 0 && i < 60) return [s.slice(0, i), s.slice(i + 2)];
  return [s, ''];
}

function activityList(items) {
  if (!items.length) return `<div class="empty" style="padding:36px 22px">${ICONS.clock}<b>Tidak ada aktivitas</b>Belum ada aktivitas untuk filter ini.</div>`;
  let html = '';
  let lastDay = '';
  for (const a of items) {
    const d = parseTs(a.created_at);
    const k = dayKey(d);
    if (k !== lastDay) {
      if (lastDay) html += '</div>';
      html += `<div class="act-day"><div class="act-day-label">${dayLabel(d)}</div>`;
      lastDay = k;
    }
    const [label, , tone, icon] = ACT_TYPES[a.type] || [a.type, 'other', 'new', 'clock'];
    const [title, detail] = splitMsg(a.message);
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    html += `
      <div class="act-item" title="${esc(fmtDateTime(a.created_at))}">
        <span class="act-icon t-${tone}">${ICONS[icon] || ICONS.clock}</span>
        <div class="act-body">
          <div class="act-title"><span class="act-tag t-${tone}">${esc(label)}</span>${esc(title)}</div>
          ${detail ? `<div class="act-detail">${esc(detail)}</div>` : ''}
        </div>
        <time class="act-time">${time}</time>
      </div>`;
  }
  return html + '</div>';
}

export default async function detail(el, ctx) {
  const id = ctx.params[0];
  const state = { duration: { months: 1 }, custom: false, generated: null, actFilter: '' };

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
    const newExpiry = applyDuration(base, state.duration);
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
            <div class="v">${fmtDate(c.expires_at)} ${c.expires_at ? `<span style="${daysClass};font-weight:600">· ${relDays(c.days_left)}</span>` : ''}</div>
            ${c.expires_at ? `<button class="link-btn small" style="margin-top:6px" id="btn-adjust">${ICONS.edit} Koreksi masa aktif</button>` : ''}</div>
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
            <div id="plan-picker" class="stack" style="gap:10px">${durationPicker(state.duration, state.custom)}</div>
          </div>
          <div class="compare">
            <div class="info-item"><div class="k">Berlaku sampai (sebelum)</div><div class="v">${fmtDate(c.expires_at)}</div></div>
            <div class="arrow">→</div>
            <div class="info-item"><div class="k">Berlaku sampai (sesudah)</div><div class="v after" id="after-date">${fmtDate(newExpiry)}</div></div>
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

      <section class="card card-flush" id="billing-card"></section>

      <section class="card card-flush msg-card" id="msg-card"></section>

      <section class="card card-flush">
        <div class="card-head"><h2>Riwayat lisensi</h2>${history.length ? `<span class="muted small">${history.length} catatan</span>` : ''}</div>
        ${history.length ? `<div class="table-wrap scroll-y"><table class="tbl tbl-sm tbl-sticky">
          <thead><tr><th>Tanggal</th><th>Aktivitas</th><th>License Key</th><th>Berlaku sampai</th><th>Catatan</th></tr></thead>
          <tbody>${history.map((h) => `
            <tr>
              <td style="white-space:nowrap">${fmtDate(h.created_at)}</td>
              <td style="min-width:180px">${esc(h.action)}</td>
              <td><span class="copy-inline"><span class="key" title="${esc(h.license_key)}">${esc(h.license_key || '-')}</span>${h.license_key ? copyBtn(h.license_key, 'License Key disalin') : ''}</span></td>
              <td style="white-space:nowrap">${fmtDate(h.expires_at)}</td>
              <td class="muted cell-note">${esc(h.note || '-')}</td>
            </tr>`).join('')}</tbody></table></div>`
          : `<div class="empty">${ICONS.key}<b>Belum ada riwayat</b>License Key pertama akan tercatat di sini.</div>`}
      </section>

      <section class="card card-flush act-card">
        <div class="card-head act-head">
          <div>
            <h2>Aktivitas terakhir</h2>
            <div class="muted small" style="margin-top:2px">${activity.length ? `${activity.length} aktivitas terbaru client ini` : 'Belum ada aktivitas'}</div>
          </div>
          ${activity.length ? `<div class="chips chips-sm" id="act-chips">${ACT_FILTERS.map(([v, l]) => {
            const n = v ? activity.filter((a) => (ACT_TYPES[a.type]?.[1] || 'other') === v).length : activity.length;
            return `<button class="chip ${v === state.actFilter ? 'active' : ''}" data-f="${v}" ${n ? '' : 'disabled'}>${l}<span class="chip-sub">${n}</span></button>`;
          }).join('')}</div>` : ''}
        </div>
        ${activity.length ? `<div class="act-scroll" id="act-list"></div>`
          : `<div class="empty" style="padding:36px 22px">${ICONS.clock}<b>Belum ada aktivitas</b>Perpanjangan, penguncian, dan perubahan data akan tercatat di sini.</div>`}
      </section>

      <section class="card danger-strip">
        <div class="danger-text">
          <h2>Zona berbahaya</h2>
          <div class="muted">Menghapus client akan menghapus seluruh riwayat lisensinya. Aplikasi di PC client akan berstatus "belum terdaftar" pada pengecekan berikutnya.</div>
        </div>
        <button class="btn btn-danger" id="btn-delete">${ICONS.trash} Hapus client</button>
      </section>`;

    const actList = el.querySelector('#act-list');
    const renderActs = () => {
      if (!actList) return;
      const f = state.actFilter;
      actList.innerHTML = activityList(f ? activity.filter((a) => (ACT_TYPES[a.type]?.[1] || 'other') === f) : activity);
      actList.scrollTop = 0;
    };
    renderActs();
    el.querySelectorAll('#act-chips .chip').forEach((b) => b.addEventListener('click', () => {
      state.actFilter = b.dataset.f;
      el.querySelectorAll('#act-chips .chip').forEach((x) => x.classList.toggle('active', x === b));
      renderActs();
    }));

    bindCopy(el);
    if (state.generated) bindKeyBox(el.querySelector('#key-area'), c, state.generated.key, state.generated.expires_at);
    mountClientMessages(el.querySelector('#msg-card'), c, ctx).catch((ex) => toast(ex.message, 'error'));
    mountClientBilling(el.querySelector('#billing-card'), c, ctx).catch((ex) => toast(ex.message, 'error'));

    bindDurationPicker(el.querySelector('#plan-picker'), (dur, { custom, soft }) => {
      state.custom = custom;
      state.generated = null;
      if (soft) {
        // Jangan render ulang agar fokus input custom tidak hilang.
        if (dur) state.duration = dur;
        el.querySelector('#after-date').textContent = dur ? fmtDate(applyDuration(base, dur)) : '-';
        el.querySelector('#btn-generate').disabled = !dur;
        el.querySelector('#key-area').innerHTML = '';
        return;
      }
      state.duration = dur;
      render({ client: c, history, activity });
      if (custom) el.querySelector('[data-dur-val]')?.focus();
    });

    el.querySelector('#btn-print-current')?.addEventListener('click', () => printLicense(c, c.license_key, c.expires_at));

    el.querySelector('#btn-adjust')?.addEventListener('click', () => openAdjustModal(c, history));

    el.querySelector('#btn-generate').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const expiry = applyDuration(base, state.duration);
      const ok = await confirmDialog({
        title: 'Generate License Key?',
        message: `Lisensi <b>${esc(c.name)}</b> akan ${c.expires_at ? 'diperpanjang' : 'diaktifkan'} <b>${durationText(state.duration)}</b> sampai <b>${fmtDate(expiry)}</b>. Pastikan pembayaran sudah diterima.`,
        confirmText: 'Generate sekarang',
      });
      if (!ok) return;
      const done = busy(btn, 'Membuat key...');
      try {
        const r = await api(`/admin/clients/${c.id}/renew`, { method: 'POST', body: { ...state.duration, note: el.querySelector('#renew-note').value } });
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
      let bill = null;
      try { bill = await getClientBilling(c.id); } catch { /* tagihan opsional */ }
      const m = openModal({
        title: 'Kunci aplikasi client',
        size: 'sm',
        body: `<p style="margin:0;color:var(--muted);line-height:1.55">Aplikasi <b>${esc(c.name)}</b> akan terkunci pada pengecekan berikutnya.</p>
          <label class="field">Alasan (tampil di layar terkunci client)
            <input class="input" id="lock-reason" maxlength="200" value="Belum melakukan pembayaran perpanjangan">
          </label>
          ${bill?.qris_ready ? `<label class="field">Nominal tagihan QRIS
            ${rupiahInput('lock-amount', bill.effective_amount, '150.000')}
            <span class="field-hint">QRIS dengan nominal ini tampil di layar terkunci. ${bill.custom_amount === null ? `Harga default: ${rupiah(bill.default_amount)}` : ''}</span>
          </label>` : `<div class="small muted">${ICONS.alert} QRIS belum diatur, layar terkunci tidak akan menampilkan tagihan. Atur di <a href="#/settings">Pengaturan</a>.</div>`}`,
        footer: `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-danger-solid" id="lock-ok">${ICONS.lock} Kunci sekarang</button>`,
      });
      const amountEl = m.el.querySelector('#lock-amount');
      if (amountEl) bindRupiah(amountEl);
      m.el.querySelector('#lock-ok').addEventListener('click', async () => {
        const body = { reason: m.el.querySelector('#lock-reason').value };
        if (amountEl) {
          const amount = readRupiah(amountEl);
          // Tetap pakai harga default bila nominal tidak diubah.
          const unchangedDefault = bill.custom_amount === null && amount === bill.default_amount;
          if (!unchangedDefault) body.billing_amount = amount;
        }
        try {
          await api(`/admin/clients/${c.id}/lock`, { method: 'POST', body });
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

  /** Modal koreksi masa aktif (kurangi / ubah tanggal berakhir). */
  function openAdjustModal(c, history) {
    const today = todayStr();
    const cur = c.expires_at;
    // Perpanjangan terakhir yang punya tanggal sebelumnya -> bisa dibatalkan.
    const last = history.find((h) => h.expires_before && h.expires_at === cur);
    const quick = [
      ['−1 hari', addDays(cur, -1)],
      ['−3 hari', addDays(cur, -3)],
      ['−7 hari', addDays(cur, -7)],
      ['−1 bulan', addMonths(cur, -1)],
      ['+1 hari', addDays(cur, 1)],
    ];
    const m = openModal({
      title: 'Koreksi masa aktif',
      body: `
        <p style="margin:0;color:var(--muted);line-height:1.55">Gunakan bila ada salah input durasi. Tanggal berakhir <b>${esc(c.name)}</b> akan diganti dan License Key diterbitkan ulang.</p>
        ${last ? `<button type="button" class="undo-card" id="adj-undo" data-date="${last.expires_before}">
            ${ICONS.back}<span><b>Batalkan "${esc(last.action)}"</b><small>Kembalikan ke ${fmtDate(last.expires_before)}</small></span></button>` : ''}
        <div class="field">Koreksi cepat
          <div class="chips">${quick.map(([l, d]) => `<button type="button" class="chip" data-adj="${d}">${l}</button>`).join('')}</div>
        </div>
        <label class="field">Tanggal berakhir baru
          <input class="input" type="date" id="adj-date" value="${cur}" max="${addDays(today, 1095)}">
        </label>
        <div class="compare">
          <div class="info-item"><div class="k">Sebelum</div><div class="v">${fmtDate(cur)}</div></div>
          <div class="arrow">→</div>
          <div class="info-item"><div class="k">Sesudah</div><div class="v after" id="adj-after">${fmtDate(cur)}</div></div>
          <div class="info-item"><div class="k">Selisih</div><div class="v" id="adj-diff">-</div></div>
        </div>
        <div class="alert warn" id="adj-warn" hidden>${ICONS.alert}<span>Tanggal ini sudah lewat — lisensi akan langsung <b>kedaluwarsa</b> dan aplikasi client terkunci pada pengecekan berikutnya.</span></div>
        <label class="field">Alasan koreksi (opsional)
          <input class="input" id="adj-note" maxlength="300" placeholder="cth. Salah pilih 3 bulan, seharusnya 1 bulan">
        </label>
        <div class="form-error" id="adj-error" hidden></div>`,
      footer: `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" id="adj-ok" disabled>${ICONS.key} Simpan &amp; terbitkan ulang key</button>`,
    });
    const $ = (s) => m.el.querySelector(s);
    const dayDiff = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);

    function update() {
      const v = $('#adj-date').value;
      const valid = /^\d{4}-\d{2}-\d{2}$/.test(v);
      const diff = valid ? dayDiff(v, cur) : 0;
      $('#adj-after').textContent = valid ? fmtDate(v) : '-';
      $('#adj-diff').textContent = valid ? (diff === 0 ? 'Tidak berubah' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)} hari`) : '-';
      $('#adj-diff').style.color = diff < 0 ? 'var(--err)' : diff > 0 ? 'var(--ok)' : '';
      $('#adj-warn').hidden = !(valid && v < today);
      $('#adj-ok').disabled = !valid || diff === 0;
      m.el.querySelectorAll('[data-adj]').forEach((b) => b.classList.toggle('active', b.dataset.adj === v));
    }
    const setDate = (d) => { $('#adj-date').value = d; update(); };
    m.el.querySelectorAll('[data-adj]').forEach((b) => b.addEventListener('click', () => setDate(b.dataset.adj)));
    $('#adj-undo')?.addEventListener('click', (e) => {
      setDate(e.currentTarget.dataset.date);
      if (!$('#adj-note').value) $('#adj-note').value = `Batalkan: ${last.action}`;
    });
    $('#adj-date').addEventListener('input', update);
    update();

    $('#adj-ok').addEventListener('click', async (e) => {
      const done = busy(e.currentTarget, 'Menyimpan...');
      $('#adj-error').hidden = true;
      try {
        const r = await api(`/admin/clients/${c.id}/set-expiry`, { method: 'POST', body: { expires_at: $('#adj-date').value, note: $('#adj-note').value } });
        state.generated = { key: r.license_key, expires_at: r.expires_at };
        m.close();
        toast(`Masa aktif dikoreksi menjadi ${fmtDate(r.expires_at)}`);
        await load();
        el.querySelector('#key-area')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (ex) {
        $('#adj-error').textContent = ex.message;
        $('#adj-error').hidden = false;
        done();
      }
    });
  }

  await load();
}
