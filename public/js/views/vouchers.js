// Halaman Manajemen Kode Voucher & Kupon Promo (SPA view).
import { api } from '../api.js';
import { esc, fmtDate, fmtDateTime, ICONS, toast, busy, openModal, confirmDialog, productName, PRODUCTS } from '../ui.js';
import { rupiah, rupiahInput, bindRupiah, readRupiah } from '../billing.js';

const VOUCHER_TYPE_LABELS = {
  free_days: { label: 'Hari Gratis', badge: 'b-active', format: (v) => `+${Math.round(v)} Hari` },
  discount_nominal: { label: 'Diskon Tagihan', badge: 'b-expiring', format: (v) => `Diskon ${rupiah(v)}` },
  trial_quota: { label: 'Kuota Trial', badge: 'b-trial', format: (v) => `+${Math.round(v)}x Trial` },
};

export default async function vouchersView(el, ctx) {
  async function loadData() {
    const [{ vouchers }, { claims }] = await Promise.all([
      api('/admin/vouchers'),
      api('/admin/vouchers/claims'),
    ]);
    if (!ctx.isCurrent()) return;
    render(vouchers, claims);
  }

  function render(vouchers, claims) {
    const activeCount = vouchers.filter((v) => v.is_active).length;
    const totalUses = vouchers.reduce((acc, v) => acc + (v.used_count || 0), 0);

    el.innerHTML = `
      <header class="page-head">
        <div>
          <h1>Kode Voucher &amp; Promo</h1>
          <div class="sub">Kelola kode voucher untuk aktivasi lisensi gratis, potongan harga QRIS, atau penambahan kuota trial.</div>
        </div>
        <div class="head-actions">
          <button class="btn btn-primary" id="btn-add-voucher">${ICONS.plus} Buat Kode Voucher</button>
        </div>
      </header>

      <section class="qa-grid" style="grid-template-columns: repeat(3, minmax(0, 1fr)); margin-bottom: 24px;">
        <div class="qa-card">
          <div class="qa-label">Voucher Aktif</div>
          <div class="qa-val">${activeCount} <span class="muted" style="font-size:14px; font-weight:normal;">/ ${vouchers.length} total</span></div>
        </div>
        <div class="qa-card">
          <div class="qa-label">Total Klaim Digunakan</div>
          <div class="qa-val" style="color:var(--primary);">${totalUses.toLocaleString('id-ID')} <span class="muted" style="font-size:14px; font-weight:normal;">kali</span></div>
        </div>
        <div class="qa-card">
          <div class="qa-label">Tipe Voucher Didukung</div>
          <div class="qa-val" style="font-size:16px; margin-top:4px;">
            <span class="badge b-active">Hari Gratis</span>
            <span class="badge b-expiring">Diskon</span>
            <span class="badge b-trial">Kuota Trial</span>
          </div>
        </div>
      </section>

      <section class="card stack" style="margin-bottom:24px;">
        <div class="card-head">
          <div><h2>Daftar Kode Voucher</h2><div class="muted small">Kode yang dapat dimasukkan pengguna di layar aplikasi client.</div></div>
        </div>
        <div class="table-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>Kode Voucher</th>
                <th>Tipe Manfaat</th>
                <th>Nilai</th>
                <th>Produk</th>
                <th>Kuota Pemakaian</th>
                <th>Kedaluwarsa</th>
                <th>Status</th>
                <th style="text-align:right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${vouchers.length ? vouchers.map((v) => {
                const tInfo = VOUCHER_TYPE_LABELS[v.type] || { label: v.type, badge: '', format: (x) => String(x) };
                const prodLabel = v.product === 'all' ? 'Semua Produk' : (PRODUCTS[v.product]?.short || v.product);
                const usesLabel = v.max_uses > 0 ? `${v.used_count || 0} / ${v.max_uses}` : `${v.used_count || 0} (Tanpa Batas)`;
                const expiryLabel = v.expires_at ? fmtDate(v.expires_at) : '<span class="muted">Selamanya</span>';
                return `
                  <tr data-voucher-id="${v.id}">
                    <td>
                      <span class="mono" style="font-weight:700; font-size:14px; letter-spacing:0.5px; color:var(--primary);">${esc(v.code)}</span>
                      ${v.description ? `<div class="cell-sub">${esc(v.description)}</div>` : ''}
                    </td>
                    <td><span class="badge ${tInfo.badge}">${tInfo.label}</span></td>
                    <td style="font-weight:600;">${tInfo.format(v.value)}</td>
                    <td><span class="tag">${esc(prodLabel)}</span></td>
                    <td>${esc(usesLabel)}</td>
                    <td>${expiryLabel}</td>
                    <td>
                      <label class="switch" title="${v.is_active ? 'Nonaktifkan' : 'Aktifkan'}">
                        <input type="checkbox" data-toggle-voucher="${v.id}" ${v.is_active ? 'checked' : ''}>
                        <span class="slider"></span>
                      </label>
                    </td>
                    <td style="text-align:right;">
                      <button class="btn btn-ghost btn-sm btn-icon-danger" data-del-voucher="${v.id}" title="Hapus">${ICONS.trash}</button>
                    </td>
                  </tr>`;
              }).join('') : `
                <tr><td colspan="8" style="text-align:center; padding:32px;" class="muted">Belum ada kode voucher. Klik tombol "+ Buat Kode Voucher" untuk mulai.</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card stack">
        <div class="card-head">
          <div><h2>Riwayat Klaim Pengguna Terakhir</h2><div class="muted small">Daftar client yang telah mengklaim dan menggunakan voucher.</div></div>
        </div>
        <div class="table-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>Waktu Klaim</th>
                <th>Client</th>
                <th>Kode Voucher</th>
                <th>Tipe Manfaat</th>
                <th>Machine ID</th>
              </tr>
            </thead>
            <tbody>
              ${claims.length ? claims.map((c) => {
                const tInfo = VOUCHER_TYPE_LABELS[c.type] || { label: c.type, badge: '', format: (x) => String(x) };
                return `
                  <tr>
                    <td style="white-space:nowrap;">${fmtDateTime(c.created_at)}</td>
                    <td><a href="#/clients/${c.client_id}" style="font-weight:600; text-decoration:none;">${esc(c.client_name || `Client #${c.client_id}`)}</a></td>
                    <td><span class="mono" style="font-weight:700;">${esc(c.code)}</span></td>
                    <td><span class="badge ${tInfo.badge}">${tInfo.label} (${tInfo.format(c.value)})</span></td>
                    <td><span class="mono small muted">${esc(c.machine_id)}</span> <span class="tag">${esc(PRODUCTS[c.product]?.short || c.product)}</span></td>
                  </tr>`;
              }).join('') : `
                <tr><td colspan="5" style="text-align:center; padding:24px;" class="muted">Belum ada riwayat klaim voucher.</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </section>`;

    // Event: Toggle aktif / nonaktif
    el.querySelectorAll('[data-toggle-voucher]').forEach((cb) => {
      cb.addEventListener('change', async () => {
        cb.disabled = true;
        try {
          await api(`/admin/vouchers/${cb.dataset.toggleVoucher}/toggle`, {
            method: 'PATCH',
            body: { is_active: cb.checked },
          });
          toast(cb.checked ? 'Voucher diaktifkan' : 'Voucher dinonaktifkan');
        } catch (ex) {
          cb.checked = !cb.checked;
          toast(ex.message, 'error');
        } finally {
          cb.disabled = false;
        }
      });
    });

    // Event: Hapus voucher
    el.querySelectorAll('[data-del-voucher]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.delVoucher;
        const v = vouchers.find((x) => x.id === Number(id));
        const ok = await confirmDialog({
          title: 'Hapus Voucher?',
          message: `Kode voucher <b>${esc(v?.code || '')}</b> akan dihapus permanen. Pengguna tidak akan dapat mengklaimnya lagi.`,
          confirmText: 'Hapus Voucher',
          danger: true,
        });
        if (!ok) return;
        try {
          await api(`/admin/vouchers/${id}`, { method: 'DELETE' });
          toast('Voucher berhasil dihapus');
          loadData();
        } catch (ex) {
          toast(ex.message, 'error');
        }
      });
    });

    // Event: Buat voucher baru
    el.querySelector('#btn-add-voucher').addEventListener('click', () => {
      openVoucherModal(() => loadData());
    });
  }

  loadData();
}

function openVoucherModal(onSuccess) {
  const m = openModal({
    title: 'Buat Kode Voucher Baru',
    body: `
      <form class="stack" id="voucher-form" style="gap:14px;">
        <label class="field">
          <span>Kode Voucher</span>
          <input class="input mono" id="v-code" maxlength="40" placeholder="Cth: COBAGRATIS / DISKON20K" style="text-transform:uppercase; font-weight:700;" required>
          <span class="field-hint">Huruf kapital, angka, dan tanda strip (-). Pengguna akan mengetik kode ini.</span>
        </label>

        <label class="field">
          <span>Tipe Manfaat Voucher</span>
          <select class="select" id="v-type">
            <option value="free_days">Hari Gratis (Aktivasi lisensi gratis tanpa bayar)</option>
            <option value="trial_quota">Kuota Trial (Tambah kuota pemakaian kirim pesan)</option>
            <option value="discount_nominal">Diskon Tagihan (Potong nominal tagihan QRIS)</option>
          </select>
        </label>

        <label class="field" id="v-val-wrap">
          <span id="v-val-label">Jumlah Hari Gratis</span>
          <div id="v-val-container">
            <input class="input" id="v-value" type="number" min="1" max="3650" value="7" placeholder="7" required>
          </div>
          <span class="field-hint" id="v-val-hint">Cth: 7 = lisensi aktif 7 hari gratis.</span>
        </label>

        <div class="form-grid">
          <label class="field">
            <span>Berlaku untuk Produk</span>
            <select class="select" id="v-product">
              <option value="all">Semua Produk</option>
              ${Object.entries(PRODUCTS).map(([k, p]) => `<option value="${k}">${esc(p.name)}</option>`).join('')}
            </select>
          </label>

          <label class="field">
            <span>Batas Total Penggunaan</span>
            <input class="input" id="v-max-uses" type="number" min="0" max="100000" value="0" placeholder="0">
            <span class="field-hint">0 = tanpa batas kuota</span>
          </label>
        </div>

        <label class="field">
          <span>Tanggal Kedaluwarsa (opsional)</span>
          <input class="input" id="v-expires" type="date">
          <span class="field-hint">Kosongkan jika berlaku selamanya</span>
        </label>

        <label class="field">
          <span>Catatan / Keterangan (opsional)</span>
          <input class="input" id="v-desc" maxlength="300" placeholder="Cth: Promo Peluncuran Aplikasi PesanRahasia">
        </label>

        <div class="form-error" id="v-error" hidden></div>
      </form>
    `,
    footer: `
      <button class="btn btn-ghost" data-close>Batal</button>
      <button class="btn btn-primary" id="v-save">${ICONS.check} Simpan &amp; Aktifkan</button>
    `,
  });

  const formEl = m.el.querySelector('#voucher-form');
  const typeSel = m.el.querySelector('#v-type');
  const valContainer = m.el.querySelector('#v-val-container');
  const valLabel = m.el.querySelector('#v-val-label');
  const valHint = m.el.querySelector('#v-val-hint');

  function updateValueInput() {
    const t = typeSel.value;
    if (t === 'free_days') {
      valLabel.textContent = 'Jumlah Hari Gratis';
      valContainer.innerHTML = '<input class="input" id="v-value" type="number" min="1" max="3650" value="7" placeholder="7" required>';
      valHint.textContent = 'Cth: 7 = pengguna langsung dapat lisensi aktif 7 hari.';
    } else if (t === 'trial_quota') {
      valLabel.textContent = 'Tambahan Kuota Trial (kali pemakaian)';
      valContainer.innerHTML = '<input class="input" id="v-value" type="number" min="1" max="1000" value="10" placeholder="10" required>';
      valHint.textContent = 'Cth: 10 = pengguna dapat kesempatan kirim pesan 10x lagi.';
    } else if (t === 'discount_nominal') {
      valLabel.textContent = 'Nominal Potongan Diskon (Rp)';
      valContainer.innerHTML = rupiahInput('v-value', 15000, '15.000');
      bindRupiah(valContainer.querySelector('#v-value'));
      valHint.textContent = 'Cth: 15.000 = tagihan QRIS client langsung berkurang Rp15.000.';
    }
  }

  typeSel.addEventListener('change', updateValueInput);

  m.el.querySelector('#v-save').addEventListener('click', async (e) => {
    const code = m.el.querySelector('#v-code').value.trim();
    const type = typeSel.value;
    const valueInput = m.el.querySelector('#v-value');
    const value = type === 'discount_nominal' ? (readRupiah(valueInput) || 0) : Number(valueInput.value);

    const errEl = m.el.querySelector('#v-error');
    errEl.hidden = true;

    if (!code) {
      errEl.textContent = 'Kode voucher wajib diisi';
      errEl.hidden = false;
      return;
    }
    if (!value || value <= 0) {
      errEl.textContent = 'Nilai voucher harus lebih dari 0';
      errEl.hidden = false;
      return;
    }

    const done = busy(e.currentTarget, 'Menyimpan...');
    try {
      await api('/admin/vouchers', {
        method: 'POST',
        body: {
          code,
          type,
          value,
          product: m.el.querySelector('#v-product').value,
          max_uses: Number(m.el.querySelector('#v-max-uses').value) || 0,
          expires_at: m.el.querySelector('#v-expires').value || null,
          description: m.el.querySelector('#v-desc').value.trim(),
        },
      });
      toast(`Kode voucher ${code} berhasil dibuat!`);
      m.close();
      onSuccess();
    } catch (ex) {
      errEl.textContent = ex.message;
      errEl.hidden = false;
      done();
    }
  });
}

