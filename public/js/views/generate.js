import { api } from '../api.js';
import { esc, badge, fmtDate, relDays, productName, todayStr, addMonths, ICONS, debounce, toast, busy } from '../ui.js';
import { keyBox, bindKeyBox, openClientForm } from '../components.js';

const PLANS = [1, 3, 6, 12];

export default async function generate(el, ctx) {
  const state = { q: '', selected: null, months: 1, result: null };

  el.innerHTML = `
    <header class="page-head">
      <div>
        <h1>Generate License Key</h1>
        <div class="sub">Pilih client, tentukan durasi, lalu cetak License Key yang terikat ke Machine ID-nya.</div>
      </div>
      <div class="head-actions" style="width:auto">
        <button class="btn btn-ghost" id="gen-add">${ICONS.plus} Machine ID baru</button>
      </div>
    </header>
    <section class="row top">
      <div class="card grow-1 stack" style="gap:14px">
        <h2>1. Pilih client</h2>
        <div class="search">${ICONS.search}<input id="gen-search" class="input" type="search" placeholder="Cari nama atau Machine ID" style="width:100%" aria-label="Cari client"></div>
        <div class="picker-list" id="gen-list"></div>
      </div>
      <div class="card grow-14 stack" style="gap:20px" id="gen-panel"></div>
    </section>`;

  async function loadList() {
    const params = new URLSearchParams({ limit: 50, sort: 'urgency' });
    if (state.q) params.set('q', state.q);
    const data = await api(`/admin/clients?${params}`);
    if (!ctx.isCurrent()) return;
    const list = el.querySelector('#gen-list');
    list.innerHTML = data.rows.length
      ? data.rows.map((c) => `
        <button class="picker-item ${state.selected?.id === c.id ? 'selected' : ''}" data-id="${c.id}">
          <span><b>${esc(c.name)}</b><br><span class="mono small muted">${esc(c.machine_id)}</span></span>
          ${badge(c.status)}
        </button>`).join('')
      : `<div class="empty" style="padding:28px 12px">${ICONS.users}<b>Tidak ditemukan</b>Coba kata kunci lain.</div>`;
    list.querySelectorAll('.picker-item').forEach((b) => b.addEventListener('click', () => {
      state.selected = data.rows.find((r) => r.id === Number(b.dataset.id));
      state.result = null;
      list.querySelectorAll('.picker-item').forEach((x) => x.classList.toggle('selected', x === b));
      renderPanel();
    }));
  }

  function renderPanel() {
    const panel = el.querySelector('#gen-panel');
    const c = state.selected;
    if (!c) {
      panel.innerHTML = `<h2>2. Durasi &amp; generate</h2><div class="empty">${ICONS.key}<b>Belum ada client dipilih</b>Pilih client dari daftar di sebelah kiri.</div>`;
      return;
    }
    const today = todayStr();
    const base = c.expires_at && c.expires_at >= today ? c.expires_at : today;
    const newExpiry = addMonths(base, state.months);
    panel.innerHTML = `
      <h2>2. Durasi &amp; generate</h2>
      <div class="selected-card">
        <div class="info-item"><div class="k">Client</div><div class="v"><b>${esc(c.name)}</b></div></div>
        <div class="info-item"><div class="k">Aplikasi</div><div class="v">${productName(c.product, true)}</div></div>
        <div class="info-item"><div class="k">Machine ID</div><div class="v mono">${esc(c.machine_id)}</div></div>
        <div class="info-item"><div class="k">Status</div><div class="v">${badge(c.status)} <span class="small muted">${c.expires_at ? relDays(c.days_left) : ''}</span></div></div>
      </div>
      <div>
        <div class="muted" style="font-size:13px;margin-bottom:10px">Durasi</div>
        <div class="chips" id="gen-plans">${PLANS.map((n) => `<button class="chip chip-lg ${state.months === n ? 'active' : ''}" data-m="${n}">${n} bulan</button>`).join('')}</div>
      </div>
      <div class="compare">
        <div class="info-item"><div class="k">Berlaku sampai (sebelum)</div><div class="v">${fmtDate(c.expires_at)}</div></div>
        <div class="arrow">→</div>
        <div class="info-item"><div class="k">Berlaku sampai (sesudah)</div><div class="v after">${fmtDate(newExpiry)}</div></div>
      </div>
      <label class="field">Catatan pembayaran (opsional)<input class="input" id="gen-note" maxlength="300" placeholder="cth. Transfer BCA Rp150.000"></label>
      <div class="btn-row">
        <button class="btn btn-primary btn-lg" id="gen-btn">${ICONS.key} Generate License Key</button>
        <a class="btn btn-ghost btn-lg" href="#/clients/${c.id}">Buka detail client</a>
      </div>
      <div id="gen-result">${state.result ? keyBox(c, state.result.key, state.result.expires_at) : ''}</div>`;

    if (state.result) bindKeyBox(panel.querySelector('#gen-result'), c, state.result.key, state.result.expires_at);
    panel.querySelectorAll('#gen-plans .chip').forEach((b) => b.addEventListener('click', () => {
      state.months = Number(b.dataset.m);
      state.result = null;
      renderPanel();
    }));
    panel.querySelector('#gen-btn').addEventListener('click', async (e) => {
      const done = busy(e.currentTarget, 'Membuat key...');
      try {
        const r = await api(`/admin/clients/${c.id}/renew`, { method: 'POST', body: { months: state.months, note: panel.querySelector('#gen-note').value } });
        state.selected = r.client;
        state.result = { key: r.license_key, expires_at: r.expires_at };
        toast('License Key berhasil dibuat');
        renderPanel();
        loadList();
      } catch (ex) {
        toast(ex.message, 'error');
        done();
      }
    });
  }

  el.querySelector('#gen-search').addEventListener('input', debounce((e) => {
    state.q = e.target.value.trim();
    loadList();
  }));
  el.querySelector('#gen-add').addEventListener('click', async () => {
    const saved = await openClientForm();
    if (!saved) return;
    state.selected = saved;
    state.result = saved._newKey ? { key: saved._newKey, expires_at: saved.expires_at } : null;
    renderPanel();
    loadList();
  });

  renderPanel();
  await loadList();
}
