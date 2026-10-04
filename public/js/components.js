// Komponen yang dipakai di beberapa halaman.
import { api } from './api.js';
import { esc, badge, productName, relDays, fmtDate, STATUS, ICONS, copyBtn, bindCopy, openModal, toast, busy, PRODUCTS } from './ui.js';

/** Tabel daftar client (Client, Machine ID, Paket, Berlaku sampai, Status, Aksi). */
export function clientTable(rows, { empty } = {}) {
  if (!rows.length) {
    return `<div class="empty">${ICONS.users}<b>${esc(empty?.title || 'Tidak ada client')}</b>${esc(empty?.text || 'Coba ubah filter atau kata kunci pencarian.')}</div>`;
  }
  return `<div class="table-wrap"><table class="tbl">
    <thead><tr><th>Client</th><th>Machine ID</th><th>Paket</th><th>Berlaku sampai</th><th>Status</th><th>Aksi</th></tr></thead>
    <tbody>${rows.map((r) => `
      <tr class="clickable" data-href="#/clients/${r.id}">
        <td><a class="cell-title" href="#/clients/${r.id}">${esc(r.name)}</a><div class="cell-sub">${productName(r.product)}${r.source === 'api' ? ' · <span class="tag api">API</span>' : ''}</div></td>
        <td><span class="copy-inline"><span class="mid">${esc(r.machine_id)}</span>${copyBtn(r.machine_id, 'Machine ID disalin')}</span></td>
        <td>${esc(r.plan || '-')}</td>
        <td>${fmtDate(r.expires_at)}<div class="cell-sub">${relDays(r.days_left)}</div></td>
        <td>${badge(r.status)}</td>
        <td><a class="action-link" href="#/clients/${r.id}">${STATUS[r.status].action}</a></td>
      </tr>`).join('')}
    </tbody></table></div>`;
}

export function bindClientTable(root) {
  bindCopy(root);
  root.querySelectorAll('tr[data-href]').forEach((tr) => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      location.hash = tr.dataset.href;
    });
  });
}

/** Modal tambah / edit client. Resolve dengan client tersimpan, atau null. */
export function openClientForm(client = null) {
  return new Promise((resolve) => {
    const editing = !!client;
    let saved = null;
    const c = client || { name: '', product: 'pos', machine_id: '', phone: '', address: '', notes: '' };
    const m = openModal({
      title: editing ? 'Edit data client' : 'Tambah Machine ID',
      body: `
        <form id="client-form" class="form-grid" novalidate>
          <label class="field full">Nama client / toko
            <input class="input" name="name" id="f-name" required maxlength="120" value="${esc(c.name)}" placeholder="cth. Toko Berkah Mart">
          </label>
          <label class="field">Aplikasi
            <select class="select" name="product" id="f-product">
              ${Object.entries(PRODUCTS).map(([k, p]) => `<option value="${k}" ${c.product === k ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
          </label>
          <label class="field">Machine ID
            <input class="input mono" name="machine_id" id="f-mid" required maxlength="64" value="${esc(c.machine_id)}" placeholder="MID-XXXX-XXXX-XXXX" autocomplete="off" spellcheck="false">
          </label>
          <label class="field">No. WhatsApp
            <input class="input" name="phone" id="f-phone" maxlength="40" value="${esc(c.phone)}" placeholder="08xxxxxxxxxx">
          </label>
          <label class="field">Alamat / kota
            <input class="input" name="address" id="f-address" maxlength="300" value="${esc(c.address)}" placeholder="cth. Tegal">
          </label>
          ${editing ? '' : `
          <label class="field full">Langsung aktifkan lisensi
            <select class="select" name="months" id="f-months">
              <option value="0">Tidak, cetak key nanti</option>
              <option value="1">Ya, 1 bulan</option>
              <option value="3">Ya, 3 bulan</option>
              <option value="6">Ya, 6 bulan</option>
              <option value="12">Ya, 12 bulan</option>
            </select>
          </label>`}
          <label class="field full">Catatan
            <textarea class="textarea" name="notes" id="f-notes" maxlength="1000" placeholder="Opsional">${esc(c.notes)}</textarea>
          </label>
          ${editing && client.expires_at ? '<div class="alert info full">' + ICONS.alert + '<span>Jika Machine ID atau aplikasi diubah, License Key akan diterbitkan ulang otomatis dengan tanggal berakhir yang sama.</span></div>' : ''}
          <div class="form-error full" id="f-error" hidden></div>
        </form>`,
      footer: `<button class="btn btn-ghost" data-close>Batal</button>
               <button class="btn btn-primary" id="f-submit" form="client-form" type="submit">${editing ? 'Simpan perubahan' : 'Simpan client'}</button>`,
    });
    m.onClose = () => resolve(saved);
    const form = m.el.querySelector('#client-form');
    const err = m.el.querySelector('#f-error');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const months = Number(data.months || 0);
      delete data.months;
      const done = busy(m.el.querySelector('#f-submit'), 'Menyimpan...');
      err.hidden = true;
      try {
        saved = editing
          ? await api(`/admin/clients/${client.id}`, { method: 'PUT', body: data })
          : await api('/admin/clients', { method: 'POST', body: data });
        if (months > 0) {
          const r = await api(`/admin/clients/${saved.id}/renew`, { method: 'POST', body: { months } });
          saved = r.client;
          saved._newKey = r.license_key;
        }
        toast(editing ? 'Data client disimpan' : 'Client berhasil ditambahkan');
        m.close();
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
        done();
      }
    });
  });
}

/** Kotak hasil License Key + tombol salin & cetak. */
export function keyBox(client, key, expiresAt) {
  return `<div class="keybox">
    <div class="keybox-title">${ICONS.check} License Key siap digunakan · berlaku sampai ${fmtDate(expiresAt)}</div>
    <div class="keytext" id="key-text">${esc(key)}</div>
    <div class="keybox-note">Terikat ke Machine ID <b class="mono">${esc(client.machine_id)}</b> (${productName(client.product)}). Aplikasi client akan mengambil key ini otomatis saat pengecekan berikutnya, atau kirim ke client untuk dimasukkan di layar aktivasi.</div>
    <div class="btn-row">
      <button class="btn btn-outline" type="button" data-copy="${esc(key)}" data-copy-label="License Key disalin">${ICONS.copy} Salin key</button>
      <button class="btn btn-outline" type="button" data-print-key>${ICONS.print} Cetak</button>
      ${client.phone ? `<a class="btn btn-outline" target="_blank" rel="noopener" href="${waLink(client, key, expiresAt)}">Kirim WhatsApp</a>` : ''}
    </div>
  </div>`;
}

export function bindKeyBox(root, client, key, expiresAt) {
  bindCopy(root);
  root.querySelector('[data-print-key]')?.addEventListener('click', () => printLicense(client, key, expiresAt));
}

function waLink(client, key, expiresAt) {
  let phone = client.phone.replace(/\D/g, '');
  if (phone.startsWith('0')) phone = '62' + phone.slice(1);
  const text = `Halo ${client.name},\n\nBerikut License Key ${productName(client.product, true)} Anda:\n\n${key}\n\nMachine ID: ${client.machine_id}\nBerlaku sampai: ${fmtDate(expiresAt)}\n\nTerima kasih.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export function printLicense(client, key, expiresAt) {
  const area = document.getElementById('print-area');
  area.innerHTML = `
    <div class="cert">
      <div class="cert-head">
        <div><div style="font-family:var(--mono);font-weight:600;letter-spacing:.04em">VOC ML</div><div style="font-size:12px;color:#4B5766">Management Licensi</div></div>
        <div style="font-size:12px;color:#4B5766">Dicetak ${fmtDate(new Date().toISOString())}</div>
      </div>
      <h1>Sertifikat License Key</h1>
      <table style="margin-top:16px">
        <tr><td>Nama client</td><td><b>${esc(client.name)}</b></td></tr>
        <tr><td>Aplikasi</td><td>${productName(client.product, true)}</td></tr>
        <tr><td>Machine ID</td><td style="font-family:var(--mono)">${esc(client.machine_id)}</td></tr>
        <tr><td>Paket</td><td>${esc(client.plan || '-')}</td></tr>
        <tr><td>Berlaku sampai</td><td><b>${fmtDate(expiresAt)}</b></td></tr>
      </table>
      <div class="cert-key">${esc(key)}</div>
      <div class="cert-foot">License Key ini hanya berlaku untuk Machine ID di atas dan tidak dapat dipindahkan ke komputer lain. Simpan dokumen ini dengan baik.</div>
    </div>`;
  window.print();
}
