// Komponen "Pesan Broadcast ke Client": form + preview Dynamic Island, tabel, modal edit & broadcast.
import { api } from './api.js';
import { esc, fmtDateTime, productName, ICONS, toast, confirmDialog, openModal, busy } from './ui.js';

export const MSG_TYPES = {
  info: { label: 'Info' },
  success: { label: 'Sukses' },
  warning: { label: 'Peringatan' },
  danger: { label: 'Bahaya' },
};

export const MSG_STATUS = {
  active: { label: 'Tayang', cls: 'b-active' },
  scheduled: { label: 'Terjadwal', cls: 'b-expiring' },
  ended: { label: 'Berakhir', cls: 'b-pending' },
  inactive: { label: 'Nonaktif', cls: 'b-locked' },
};

const INTERVALS = [0, 5, 15, 30, 60, 120, 240];
const DURATIONS = [10, 15, 30, 60, 0];
const MAX_LEN = 500;

export const MSG_ICONS = {
  info: '<svg viewBox="0 0 24 24"><path d="M12 11v5"/><path d="M12 7.5h.01"/></svg>',
  success: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
  warning: '<svg viewBox="0 0 24 24"><path d="M12 8v4"/><path d="M12 16h.01"/></svg>',
  danger: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  megaphone: '<svg viewBox="0 0 24 24"><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
};

export function intervalLabel(n) {
  if (!n) return 'Sekali saja';
  if (n % 60 === 0) return `Tiap ${n / 60} jam`;
  return `Tiap ${n} menit`;
}

export function durationLabel(n) {
  return n ? `${n} detik` : 'Sampai ditutup';
}

export function typeBadge(t) {
  return `<span class="badge mt-${t}">${MSG_TYPES[t]?.label || t}</span>`;
}

export function statusBadge(s) {
  const st = MSG_STATUS[s] || { label: s, cls: 'b-pending' };
  return `<span class="badge ${st.cls}">${st.label}</span>`;
}

function scheduleLabel(m) {
  if (!m.starts_at && !m.ends_at) return '<span class="muted">Langsung · tanpa batas</span>';
  return `${m.starts_at ? fmtDateTime(m.starts_at) : 'Langsung'} → ${m.ends_at ? fmtDateTime(m.ends_at) : 'tanpa batas'}`;
}

/** ISO -> nilai untuk input datetime-local (waktu lokal browser). */
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

/* ------------------------------------------------------------------
   Form pesan + preview pil hitam ala Dynamic Island
   ------------------------------------------------------------------ */
export function messageFormHtml(m = {}) {
  const v = { title: '', message: '', type: 'info', interval_minutes: 30, display_seconds: 15, starts_at: null, ends_at: null, ...m };
  const customInterval = !INTERVALS.includes(v.interval_minutes);
  const customDuration = !DURATIONS.includes(v.display_seconds);
  const hasSchedule = !!(v.starts_at || v.ends_at);
  return `
    <div class="msg-form">
      <div class="island-stage" aria-label="Preview pesan di aplikasi client">
        <div class="island-label">Preview di aplikasi client</div>
        <div class="island" data-island data-type="${esc(v.type)}">
          <span class="island-icon">${MSG_ICONS[v.type]}</span>
          <span class="island-text"><b data-pv-title></b><span data-pv-msg></span></span>
          <span class="island-timer" data-pv-timer></span>
        </div>
      </div>

      <label class="field">Judul <span class="field-hint">(opsional, maks. 80 karakter)</span>
        <input class="input" data-f="title" maxlength="80" value="${esc(v.title || '')}" placeholder="cth. Info Maintenance">
      </label>

      <label class="field">
        <span class="field-row"><span>Isi pesan</span><span class="char-count" data-count>0/${MAX_LEN}</span></span>
        <textarea class="textarea" data-f="message" maxlength="${MAX_LEN}" rows="3" placeholder="cth. Server akan maintenance jam 23.00 WIB">${esc(v.message)}</textarea>
      </label>

      <div class="field">Tipe pesan
        <div class="type-picker" role="radiogroup">
          ${Object.entries(MSG_TYPES).map(([k, t]) => `
            <button type="button" class="type-opt t-${k} ${v.type === k ? 'active' : ''}" data-type-opt="${k}" role="radio" aria-checked="${v.type === k}">
              <span class="type-dot">${MSG_ICONS[k]}</span>${t.label}
            </button>`).join('')}
        </div>
      </div>

      <div class="form-grid">
        <label class="field">Tampil ulang tiap
          <select class="select" data-f="interval_sel">
            ${INTERVALS.map((n) => `<option value="${n}" ${!customInterval && v.interval_minutes === n ? 'selected' : ''}>${n ? `${n} menit` : 'Sekali saja'}</option>`).join('')}
            <option value="custom" ${customInterval ? 'selected' : ''}>Custom…</option>
          </select>
          <span class="inline-custom" data-custom-interval ${customInterval ? '' : 'hidden'}>
            <input class="input" type="number" min="1" max="1440" data-f="interval_custom" value="${customInterval ? v.interval_minutes : 45}"><span class="muted">menit</span>
          </span>
        </label>
        <label class="field">Lama tampil
          <select class="select" data-f="display_sel">
            ${DURATIONS.map((n) => `<option value="${n}" ${!customDuration && v.display_seconds === n ? 'selected' : ''}>${durationLabel(n)}</option>`).join('')}
            <option value="custom" ${customDuration ? 'selected' : ''}>Custom…</option>
          </select>
          <span class="inline-custom" data-custom-display ${customDuration ? '' : 'hidden'}>
            <input class="input" type="number" min="1" max="600" data-f="display_custom" value="${customDuration ? v.display_seconds : 20}"><span class="muted">detik</span>
          </span>
        </label>
      </div>

      <div class="schedule-box">
        <label class="switch-row">
          <span class="switch"><input type="checkbox" data-f="schedule_on" ${hasSchedule ? 'checked' : ''}><span class="slider"></span></span>
          <span>Atur jadwal tayang <span class="field-hint">(opsional)</span></span>
        </label>
        <div class="form-grid" data-schedule ${hasSchedule ? '' : 'hidden'}>
          <label class="field">Mulai tayang
            <input class="input" type="datetime-local" data-f="starts_at" value="${toLocalInput(v.starts_at)}">
            <span class="field-hint">Kosong = langsung tayang</span>
          </label>
          <label class="field">Selesai tayang
            <input class="input" type="datetime-local" data-f="ends_at" value="${toLocalInput(v.ends_at)}">
            <span class="field-hint">Kosong = tanpa batas</span>
          </label>
        </div>
      </div>
      <div class="form-error" data-error hidden></div>
    </div>`;
}

/** Pasang interaksi form. Mengembalikan { getValues, showError, reset }. */
export function bindMessageForm(root) {
  const f = (name) => root.querySelector(`[data-f="${name}"]`);
  const island = root.querySelector('[data-island]');
  let type = root.querySelector('.type-opt.active')?.dataset.typeOpt || 'info';

  function values() {
    const intervalSel = f('interval_sel').value;
    const displaySel = f('display_sel').value;
    const scheduleOn = f('schedule_on').checked;
    return {
      title: f('title').value.trim() || null,
      message: f('message').value.trim(),
      type,
      interval_minutes: intervalSel === 'custom' ? Number(f('interval_custom').value) : Number(intervalSel),
      display_seconds: displaySel === 'custom' ? Number(f('display_custom').value) : Number(displaySel),
      starts_at: scheduleOn ? fromLocalInput(f('starts_at').value) : null,
      ends_at: scheduleOn ? fromLocalInput(f('ends_at').value) : null,
    };
  }

  function updatePreview() {
    const v = values();
    const len = f('message').value.length;
    const count = root.querySelector('[data-count]');
    count.textContent = `${len}/${MAX_LEN}`;
    count.classList.toggle('near', len > MAX_LEN * 0.9);
    island.dataset.type = type;
    island.querySelector('.island-icon').innerHTML = MSG_ICONS[type];
    island.querySelector('[data-pv-title]').textContent = v.title || '';
    island.querySelector('[data-pv-title]').hidden = !v.title;
    island.querySelector('[data-pv-msg]').textContent = v.message || 'Isi pesan akan tampil di sini…';
    island.classList.toggle('placeholder', !v.message);
    island.querySelector('[data-pv-timer]').textContent = v.display_seconds ? `${v.display_seconds}s` : '✕';
    island.querySelector('[data-pv-timer]').title = v.display_seconds ? `Hilang otomatis setelah ${v.display_seconds} detik` : 'Tampil sampai ditutup';
  }

  root.querySelectorAll('[data-type-opt]').forEach((b) => b.addEventListener('click', () => {
    type = b.dataset.typeOpt;
    root.querySelectorAll('[data-type-opt]').forEach((x) => {
      x.classList.toggle('active', x === b);
      x.setAttribute('aria-checked', x === b);
    });
    island.classList.remove('pop');
    void island.offsetWidth;
    island.classList.add('pop');
    updatePreview();
  }));

  f('interval_sel').addEventListener('change', () => { root.querySelector('[data-custom-interval]').hidden = f('interval_sel').value !== 'custom'; updatePreview(); });
  f('display_sel').addEventListener('change', () => { root.querySelector('[data-custom-display]').hidden = f('display_sel').value !== 'custom'; updatePreview(); });
  f('schedule_on').addEventListener('change', () => { root.querySelector('[data-schedule]').hidden = !f('schedule_on').checked; });
  ['title', 'message', 'display_custom'].forEach((n) => f(n).addEventListener('input', updatePreview));
  updatePreview();

  const errEl = root.querySelector('[data-error]');
  return {
    getValues() {
      const v = values();
      if (!v.message) return { error: 'Isi pesan wajib diisi' };
      if (v.message.length > MAX_LEN) return { error: `Isi pesan maksimal ${MAX_LEN} karakter` };
      if (!Number.isInteger(v.interval_minutes) || v.interval_minutes < 0 || v.interval_minutes > 1440) return { error: 'Interval tampil ulang harus 0–1440 menit' };
      if (!Number.isInteger(v.display_seconds) || v.display_seconds < 0 || v.display_seconds > 600) return { error: 'Lama tampil harus 0–600 detik' };
      if (v.starts_at && v.ends_at && v.ends_at <= v.starts_at) return { error: 'Waktu selesai harus setelah waktu mulai' };
      return { data: v };
    },
    showError(msg) {
      errEl.textContent = msg || '';
      errEl.hidden = !msg;
    },
    reset() {
      f('title').value = '';
      f('message').value = '';
      updatePreview();
    },
  };
}

/* ------------------------------------------------------------------
   Daftar pesan (dipakai di Detail Client & halaman Pesan Broadcast)
   ------------------------------------------------------------------ */
export function messageTable(rows, { showClient = false } = {}) {
  if (!rows.length) {
    return `<div class="empty">${MSG_ICONS.megaphone}<b>Belum ada pesan</b>Pesan yang dikirim ke aplikasi client akan tampil di sini.</div>`;
  }
  return `<div class="table-wrap"><table class="tbl tbl-sm msg-tbl">
    <thead><tr>
      ${showClient ? '<th>Client</th>' : ''}
      <th>Pesan</th><th>Tipe</th><th>Interval</th>${showClient ? '' : '<th>Lama tampil</th><th>Jadwal</th>'}<th>Status</th><th>Aktif</th><th style="text-align:right">Aksi</th>
    </tr></thead>
    <tbody>${rows.map((m) => `
      <tr data-msg="${m.id}">
        ${showClient ? `<td><a class="cell-title" href="#/clients/${m.client_id}">${esc(m.client_name)}</a><div class="cell-sub">${productName(m.client_product)} · <span class="mono">${esc(m.client_machine_id)}</span></div></td>` : ''}
        <td class="msg-cell">
          ${m.title ? `<div class="cell-title">${esc(m.title)}</div>` : ''}
          <div class="msg-snippet" title="${esc(m.message)}">${esc(m.message)}</div>
          <div class="cell-sub">Diperbarui ${fmtDateTime(m.updated_at)}</div>
        </td>
        <td>${typeBadge(m.type)}</td>
        <td style="white-space:nowrap">${intervalLabel(m.interval_minutes)}${showClient ? `<div class="cell-sub">${durationLabel(m.display_seconds)}</div>` : ''}</td>
        ${showClient ? '' : `<td style="white-space:nowrap">${durationLabel(m.display_seconds)}</td><td class="small" style="min-width:160px">${scheduleLabel(m)}</td>`}
        <td>${statusBadge(m.status)}</td>
        <td><label class="switch" title="${m.is_active ? 'Nonaktifkan' : 'Aktifkan'}"><input type="checkbox" data-toggle="${m.id}" ${m.is_active ? 'checked' : ''}><span class="slider"></span></label></td>
        <td style="white-space:nowrap;text-align:right">
          <button class="btn btn-ghost btn-sm" data-edit-msg="${m.id}" title="Edit">${ICONS.edit}</button>
          <button class="btn btn-ghost btn-sm btn-icon-danger" data-del-msg="${m.id}" title="Hapus">${ICONS.trash}</button>
        </td>
      </tr>`).join('')}
    </tbody></table></div>`;
}

export function bindMessageTable(root, rows, onChange) {
  const find = (id) => rows.find((r) => r.id === Number(id));
  root.querySelectorAll('[data-toggle]').forEach((cb) => cb.addEventListener('change', async () => {
    cb.disabled = true;
    try {
      const r = await api(`/admin/messages/${cb.dataset.toggle}/toggle`, { method: 'PATCH', body: { is_active: cb.checked } });
      toast(r.is_active ? 'Pesan diaktifkan' : 'Pesan dinonaktifkan');
      onChange();
    } catch (ex) {
      cb.checked = !cb.checked;
      cb.disabled = false;
      toast(ex.message, 'error');
    }
  }));
  root.querySelectorAll('[data-edit-msg]').forEach((b) => b.addEventListener('click', async () => {
    if (await openMessageEditor(find(b.dataset.editMsg))) onChange();
  }));
  root.querySelectorAll('[data-del-msg]').forEach((b) => b.addEventListener('click', async () => {
    const m = find(b.dataset.delMsg);
    const ok = await confirmDialog({
      title: 'Hapus pesan?',
      message: `Pesan <b>${esc(m.title || m.message.slice(0, 60))}</b>${m.client_name ? ` untuk <b>${esc(m.client_name)}</b>` : ''} akan dihapus permanen dan hilang dari aplikasi client dalam ±1 menit.`,
      confirmText: 'Hapus permanen',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/admin/messages/${m.id}`, { method: 'DELETE' });
      toast('Pesan dihapus');
      onChange();
    } catch (ex) { toast(ex.message, 'error'); }
  }));
}

/** Modal edit pesan. Resolve true bila tersimpan. */
export function openMessageEditor(msg) {
  return new Promise((resolve) => {
    let saved = false;
    const m = openModal({
      title: 'Edit pesan',
      body: `${msg.client_name ? `<div class="muted small">Untuk client <b>${esc(msg.client_name)}</b></div>` : ''}${messageFormHtml(msg)}`,
      footer: `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" id="msg-save">${ICONS.check} Simpan perubahan</button>`,
    });
    m.onClose = () => resolve(saved);
    const form = bindMessageForm(m.el);
    m.el.querySelector('#msg-save').addEventListener('click', async (e) => {
      const { data, error } = form.getValues();
      if (error) return form.showError(error);
      const done = busy(e.currentTarget, 'Menyimpan...');
      try {
        await api(`/admin/messages/${msg.id}`, { method: 'PUT', body: data });
        saved = true;
        toast('Pesan diperbarui');
        m.close();
      } catch (ex) {
        form.showError(ex.message);
        done();
      }
    });
  });
}

/** Modal kirim pesan ke banyak client. Resolve jumlah pesan terkirim (0 bila batal). */
export async function openBroadcastModal() {
  const { rows: clients } = await api('/admin/clients?sort=name&limit=500');
  return new Promise((resolve) => {
    let sent = 0;
    const m = openModal({
      title: 'Kirim ke banyak client',
      size: 'lg',
      body: `
        <div class="field">Client tujuan
          <div class="target-modes">
            <label class="radio-card"><input type="radio" name="bc-mode" value="active" checked><span><b>Semua client aktif</b><small>Lisensi aktif / segera berakhir</small></span></label>
            <label class="radio-card"><input type="radio" name="bc-mode" value="all"><span><b>Semua client</b><small>Termasuk kedaluwarsa & belum aktivasi</small></span></label>
            <label class="radio-card"><input type="radio" name="bc-mode" value="pick"><span><b>Pilih client</b><small>Centang satu per satu</small></span></label>
          </div>
        </div>
        <label class="field">Aplikasi
          <select class="select" id="bc-product">
            <option value="">Semua aplikasi</option>
            <option value="billiard">Aplikasi Billiard</option>
            <option value="pos">Aplikasi Kasir POS</option>
          </select>
        </label>
        <div id="bc-picker" hidden>
          <div class="picker-toolbar">
            <div class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg><input class="input" id="bc-search" placeholder="Cari nama / Machine ID"></div>
            <button type="button" class="link-btn" id="bc-all">Pilih semua</button>
            <button type="button" class="link-btn" id="bc-none">Kosongkan</button>
          </div>
          <div class="picker-list multi" id="bc-list"></div>
        </div>
        <div class="bc-summary" id="bc-summary"></div>
        <div class="divider"></div>
        ${messageFormHtml()}`,
      footer: `<button class="btn btn-ghost" data-close>Batal</button><button class="btn btn-primary" id="bc-send">${MSG_ICONS.send} Kirim pesan</button>`,
    });
    m.onClose = () => resolve(sent);
    const form = bindMessageForm(m.el);
    const selected = new Set();
    const $ = (s) => m.el.querySelector(s);
    const mode = () => m.el.querySelector('input[name="bc-mode"]:checked').value;

    function targets() {
      const product = $('#bc-product').value;
      return clients.filter((c) => {
        if (product && c.product !== product) return false;
        if (mode() === 'active') return c.status === 'active' || c.status === 'expiring';
        if (mode() === 'pick') return selected.has(c.id);
        return true;
      });
    }

    function renderList() {
      const product = $('#bc-product').value;
      const needle = $('#bc-search').value.trim().toLowerCase();
      const list = clients.filter((c) => (!product || c.product === product) && (!needle || `${c.name} ${c.machine_id}`.toLowerCase().includes(needle)));
      $('#bc-list').innerHTML = list.length ? list.map((c) => `
        <label class="picker-item ${selected.has(c.id) ? 'selected' : ''}">
          <input type="checkbox" value="${c.id}" ${selected.has(c.id) ? 'checked' : ''}>
          <span style="flex:1;min-width:0"><b>${esc(c.name)}</b><div class="cell-sub">${productName(c.product)} · <span class="mono">${esc(c.machine_id)}</span></div></span>
          <span class="badge b-${c.status}">${{ active: 'Aktif', expiring: 'Segera berakhir', expired: 'Kedaluwarsa', locked: 'Terkunci', pending: 'Belum aktivasi' }[c.status]}</span>
        </label>`).join('') : '<div class="empty" style="padding:24px">Tidak ada client yang cocok.</div>';
      $('#bc-list').querySelectorAll('input[type="checkbox"]').forEach((cb) => cb.addEventListener('change', () => {
        const id = Number(cb.value);
        if (cb.checked) selected.add(id); else selected.delete(id);
        cb.closest('.picker-item').classList.toggle('selected', cb.checked);
        renderSummary();
      }));
    }

    function renderSummary() {
      const n = targets().length;
      $('#bc-summary').innerHTML = `${ICONS.users}<span>Pesan akan dikirim ke <b>${n}</b> client${n ? '' : ' — pilih minimal satu client'}.</span>`;
      $('#bc-send').disabled = !n;
    }

    m.el.querySelectorAll('input[name="bc-mode"]').forEach((r) => r.addEventListener('change', () => {
      $('#bc-picker').hidden = mode() !== 'pick';
      if (mode() === 'pick') renderList();
      renderSummary();
    }));
    $('#bc-product').addEventListener('change', () => { if (mode() === 'pick') renderList(); renderSummary(); });
    $('#bc-search').addEventListener('input', renderList);
    $('#bc-all').addEventListener('click', () => {
      m.el.querySelectorAll('#bc-list input[type="checkbox"]').forEach((cb) => selected.add(Number(cb.value)));
      renderList();
      renderSummary();
    });
    $('#bc-none').addEventListener('click', () => { selected.clear(); renderList(); renderSummary(); });
    renderSummary();

    $('#bc-send').addEventListener('click', async (e) => {
      const { data, error } = form.getValues();
      if (error) return form.showError(error);
      const product = $('#bc-product').value || undefined;
      const body = mode() === 'pick'
        ? { ...data, client_ids: [...selected], product }
        : { ...data, client_ids: 'all', only_active: mode() === 'active', product };
      const n = targets().length;
      const ok = await confirmDialog({ title: 'Kirim broadcast?', message: `Pesan akan dikirim ke <b>${n}</b> client dan tampil di aplikasi mereka dalam ±1 menit.`, confirmText: 'Kirim sekarang' });
      if (!ok) return;
      const done = busy(e.currentTarget, 'Mengirim...');
      try {
        const r = await api('/admin/messages/broadcast', { method: 'POST', body });
        sent = r.count;
        toast(`Pesan terkirim ke ${r.count} client`);
        m.close();
      } catch (ex) {
        form.showError(ex.message);
        done();
      }
    });
  });
}

/* ------------------------------------------------------------------
   Kartu "Pesan ke Aplikasi Client" di halaman Detail Client
   ------------------------------------------------------------------ */
export async function mountClientMessages(el, client, ctx) {
  el.innerHTML = `
    <div class="card-head">
      <div>
        <h2>Pesan ke Aplikasi Client</h2>
        <div class="muted small" style="margin-top:4px">Tampil sebagai notifikasi di aplikasi ${productName(client.product, true)} milik client ini (dicek tiap ±1 menit).</div>
      </div>
    </div>
    <div class="msg-compose">
      ${messageFormHtml()}
      <div><button class="btn btn-primary" id="msg-send">${MSG_ICONS.send} Kirim Pesan</button></div>
    </div>
    <div class="msg-list-head"><h3>Daftar pesan</h3><span class="muted small" id="msg-count"></span></div>
    <div id="msg-list"></div>`;

  const form = bindMessageForm(el.querySelector('.msg-compose'));

  async function loadList() {
    const { rows } = await api(`/admin/clients/${client.id}/messages`);
    if (!ctx.isCurrent()) return;
    const box = el.querySelector('#msg-list');
    box.innerHTML = messageTable(rows);
    el.querySelector('#msg-count').textContent = rows.length ? `${rows.filter((r) => r.status === 'active').length} tayang · ${rows.length} total` : '';
    bindMessageTable(box, rows, loadList);
  }

  el.querySelector('#msg-send').addEventListener('click', async (e) => {
    const { data, error } = form.getValues();
    if (error) return form.showError(error);
    form.showError('');
    const done = busy(e.currentTarget, 'Mengirim...');
    try {
      await api(`/admin/clients/${client.id}/messages`, { method: 'POST', body: data });
      toast('Pesan dikirim ke aplikasi client');
      form.reset();
      await loadList();
    } catch (ex) {
      form.showError(ex.message);
    } finally {
      done();
    }
  });

  await loadList();
}
