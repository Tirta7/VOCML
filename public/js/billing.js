// UI Tagihan QRIS: pengaturan global (Pengaturan) dan kartu tagihan per client (Detail Client).
import { api } from './api.js';
import { esc, ICONS, toast, busy, productName, PRODUCTS } from './ui.js';

export const QR_ICON = '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h4v4h-4"/></svg>';
const UPLOAD_ICON = '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/></svg>';

export const rupiah = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID');
const digits = (v) => String(v ?? '').replace(/[^\d]/g, '');

/** Input nominal Rupiah dengan pemisah ribuan otomatis. */
function rupiahInput(id, value, placeholder = '0') {
  return `<div class="money-input"><span>Rp</span><input class="input" id="${id}" inputmode="numeric" autocomplete="off" value="${value ? Number(value).toLocaleString('id-ID') : ''}" placeholder="${placeholder}"></div>`;
}
function bindRupiah(input, onChange = () => {}) {
  input.addEventListener('input', () => {
    const d = digits(input.value).replace(/^0+(?=\d)/, '');
    input.value = d ? Number(d).toLocaleString('id-ID') : '';
    onChange(d ? Number(d) : null);
  });
}
const readRupiah = (input) => (digits(input.value) ? Number(digits(input.value)) : null);

/* ------------------------------------------------------------------
   Baca isi QR dari file gambar (BarcodeDetector bila ada, fallback jsQR)
   ------------------------------------------------------------------ */
let jsQRPromise = null;
function loadJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  jsQRPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/jsQR.js';
    s.onload = () => resolve(window.jsQR);
    s.onerror = () => reject(new Error('Gagal memuat pembaca QR'));
    document.head.appendChild(s);
  });
  return jsQRPromise;
}

export async function readQrFromFile(file) {
  const bitmap = await createImageBitmap(file);
  if ('BarcodeDetector' in window) {
    try {
      const found = await new window.BarcodeDetector({ formats: ['qr_code'] }).detect(bitmap);
      if (found[0]?.rawValue) return found[0].rawValue;
    } catch { /* lanjut ke jsQR */ }
  }
  const jsQR = await loadJsQR();
  // Coba beberapa ukuran: foto besar kadang lebih mudah dibaca setelah diperkecil.
  for (const max of [1200, 800, 1800, 500]) {
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    const r = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
    if (r?.data) return r.data;
  }
  throw new Error('QR tidak terbaca. Pastikan gambar QRIS jelas, tidak terpotong, dan tidak buram.');
}

/* ------------------------------------------------------------------
   Mockup layar terkunci di aplikasi client
   ------------------------------------------------------------------ */
export function lockScreenMock({ reason = 'locked', amount = 0, merchant = '', note = '', contact = '', imgSrc = '', lockReason = '' }) {
  const title = reason === 'expired' ? 'Lisensi telah berakhir' : 'Aplikasi dikunci';
  return `
    <div class="lock-mock">
      <div class="lock-mock-head">${ICONS.lock}<div><b>${title}</b><span>${esc(lockReason || 'Silakan lakukan pembayaran untuk membuka kembali aplikasi.')}</span></div></div>
      <div class="lock-mock-body">
        <div class="lock-mock-qr">${imgSrc ? `<img src="${imgSrc}" alt="QRIS tagihan" loading="lazy">` : `<div class="qr-empty">${QR_ICON}</div>`}</div>
        <div class="lock-mock-info">
          <div class="k">Total tagihan</div>
          <div class="lock-mock-amount">${amount ? rupiah(amount) : 'Rp —'}</div>
          ${merchant ? `<div class="lock-mock-merchant">${QR_ICON}<span>QRIS · ${esc(merchant)}</span></div>` : ''}
          ${note ? `<p>${esc(note)}</p>` : ''}
          ${contact ? `<div class="small">Kontak admin: <b>${esc(contact)}</b></div>` : ''}
        </div>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------
   Kartu pengaturan di halaman Pengaturan
   ------------------------------------------------------------------ */
export async function mountBillingSettings(el) {
  let s = await api('/admin/billing/settings');
  let inspected = s.qris ? { ok: true, info: s.qris } : s.qris_error ? { ok: false, error: s.qris_error } : null;
  let sampleAmount = s.prices.billiard || 150000;

  function infoHtml() {
    if (!inspected) return `<div class="qris-status muted">${QR_ICON}<span>Belum ada QRIS. Upload gambar QRIS statis toko Anda atau tempel isi teksnya.</span></div>`;
    if (!inspected.ok) return `<div class="qris-status err">${ICONS.alert}<span>${esc(inspected.error)}</span></div>`;
    const i = inspected.info;
    return `<div class="qris-status ok">${ICONS.check}<div>
      <b>${esc(i.merchant_name || 'Merchant')}</b>${i.merchant_city ? ` · ${esc(i.merchant_city)}` : ''}
      <div class="small">${i.nmid ? `NMID <span class="mono">${esc(i.nmid)}</span> · ` : ''}${i.method === 'static' ? 'QRIS statis' : 'QRIS dinamis'}${i.method === 'dynamic' && i.amount ? ` (nominal ${rupiah(i.amount)} akan diganti otomatis)` : ''}</div>
    </div></div>`;
  }

  function previewSrc() {
    return `/api/admin/billing/preview.png?amount=${sampleAmount}&size=360&t=${Date.now()}`;
  }

  el.innerHTML = `
    <div class="card-head" style="border-bottom:1px solid var(--line)">
      <div><h2>Tagihan QRIS</h2><div class="muted small" style="margin-top:4px">Ditampilkan di layar aplikasi client saat lisensi <b>kedaluwarsa</b> atau <b>dikunci</b>. Nominal diisi otomatis ke QRIS (dinamis), client tinggal scan.</div></div>
    </div>
    <div class="billing-settings">
      <div class="stack" style="gap:16px">
        <div class="field">QRIS statis toko Anda
          <label class="dropzone" id="qris-drop">
            <input type="file" accept="image/*" id="qris-file" hidden>
            ${UPLOAD_ICON}<b>Upload gambar QRIS</b><span>Klik atau tarik gambar ke sini (PNG/JPG). Isi QR dibaca otomatis.</span>
          </label>
        </div>
        <label class="field">Atau tempel isi teks QRIS
          <textarea class="textarea mono-sm" id="qris-payload" rows="3" placeholder="00020101021126...6304XXXX" spellcheck="false">${esc(s.qris_payload)}</textarea>
        </label>
        <div id="qris-info">${infoHtml()}</div>
        <div class="form-grid">
          ${Object.entries(PRODUCTS).map(([k, p]) => `
            <label class="field">Harga default ${esc(p.short)}
              ${rupiahInput(`price-${k}`, s.prices[k], '150.000')}
              <span class="field-hint">Dipakai bila client tidak punya nominal khusus</span>
            </label>`).join('')}
        </div>
        <label class="field">Catatan di layar terkunci
          <textarea class="textarea" id="billing-note" rows="2" maxlength="300">${esc(s.billing_note)}</textarea>
        </label>
        <label class="field">Kontak admin (WhatsApp, opsional)
          <input class="input" id="billing-contact" maxlength="60" value="${esc(s.billing_contact)}" placeholder="08xxxxxxxxxx">
        </label>
        <div class="form-error" id="billing-error" hidden></div>
        <div><button class="btn btn-primary" id="billing-save">${ICONS.check} Simpan pengaturan tagihan</button></div>
      </div>
      <div class="stack" style="gap:12px">
        <div class="field-row"><span class="muted small" style="font-weight:600">Preview layar terkunci client</span>
          <span class="preview-amount">Contoh nominal ${rupiahInput('sample-amount', sampleAmount)}</span></div>
        <div id="billing-preview"></div>
        <div class="muted small">Preview memakai QRIS yang sudah <b>disimpan</b>. Coba scan dengan aplikasi e-wallet/m-banking: nominal harus langsung terisi (jangan lanjutkan pembayaran).</div>
      </div>
    </div>`;

  const $ = (x) => el.querySelector(x);
  const renderInfo = () => { $('#qris-info').innerHTML = infoHtml(); };
  const renderPreview = () => {
    $('#billing-preview').innerHTML = lockScreenMock({
      reason: 'locked', amount: sampleAmount, merchant: s.qris?.merchant_name, note: $('#billing-note').value, contact: $('#billing-contact').value,
      imgSrc: s.qris ? previewSrc() : '', lockReason: 'Belum melakukan pembayaran perpanjangan',
    });
  };

  let inspectTimer;
  async function inspect(payload) {
    if (!payload.trim()) { inspected = null; renderInfo(); return; }
    inspected = await api('/admin/billing/inspect', { method: 'POST', body: { qris_payload: payload } });
    renderInfo();
  }
  $('#qris-payload').addEventListener('input', (e) => {
    clearTimeout(inspectTimer);
    inspectTimer = setTimeout(() => inspect(e.target.value), 300);
  });

  async function handleFile(file) {
    if (!file) return;
    const drop = $('#qris-drop');
    drop.classList.add('busy');
    try {
      const text = await readQrFromFile(file);
      $('#qris-payload').value = text;
      await inspect(text);
      toast(inspected?.ok ? 'QRIS terbaca. Klik "Simpan" untuk memakai.' : 'QR terbaca, tetapi bukan QRIS yang valid', inspected?.ok ? 'success' : 'error');
    } catch (ex) {
      toast(ex.message, 'error');
    } finally {
      drop.classList.remove('busy');
    }
  }
  $('#qris-file').addEventListener('change', (e) => handleFile(e.target.files[0]));
  const drop = $('#qris-drop');
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0]));

  Object.keys(PRODUCTS).forEach((k) => bindRupiah($(`#price-${k}`)));
  let previewTimer;
  bindRupiah($('#sample-amount'), (v) => {
    sampleAmount = v || 0;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => sampleAmount && renderPreview(), 350);
  });
  ['#billing-note', '#billing-contact'].forEach((x) => $(x).addEventListener('change', renderPreview));

  $('#billing-save').addEventListener('click', async (e) => {
    const done = busy(e.currentTarget, 'Menyimpan...');
    $('#billing-error').hidden = true;
    try {
      s = await api('/admin/billing/settings', {
        method: 'PUT',
        body: {
          qris_payload: $('#qris-payload').value,
          billing_note: $('#billing-note').value,
          billing_contact: $('#billing-contact').value,
          prices: Object.fromEntries(Object.keys(PRODUCTS).map((k) => [k, readRupiah($(`#price-${k}`)) || 0])),
        },
      });
      inspected = s.qris ? { ok: true, info: s.qris } : null;
      renderInfo();
      renderPreview();
      toast('Pengaturan tagihan disimpan');
    } catch (ex) {
      $('#billing-error').textContent = ex.message;
      $('#billing-error').hidden = false;
    } finally {
      done();
    }
  });

  renderPreview();
}

/* ------------------------------------------------------------------
   Kartu "Tagihan QRIS" di halaman Detail Client
   ------------------------------------------------------------------ */
export async function mountClientBilling(el, client, ctx) {
  let b = await api(`/admin/clients/${client.id}/billing`);
  if (!ctx.isCurrent()) return;

  function render() {
    const useDefault = b.custom_amount === null || b.custom_amount === undefined;
    const statusChip = b.showing_now
      ? `<span class="badge b-locked">Sedang tampil di aplikasi client</span>`
      : `<span class="badge b-pending">Tampil saat kedaluwarsa / dikunci</span>`;
    el.innerHTML = `
      <div class="card-head" style="border-bottom:1px solid var(--line)">
        <div><h2>Tagihan QRIS</h2><div class="muted small" style="margin-top:4px">Nominal yang muncul di layar terkunci ${productName(client.product, true)} milik client ini.</div></div>
        ${b.qris_ready ? statusChip : ''}
      </div>
      ${!b.qris_ready ? `<div style="padding:22px"><div class="alert warn">${ICONS.alert}<span><b>QRIS belum diatur.</b> Upload QRIS toko Anda di <a href="#/settings">Pengaturan → Tagihan QRIS</a> agar tagihan bisa tampil di aplikasi client.</span></div></div>` : ''}
      <div class="billing-client" ${b.qris_ready ? '' : 'hidden'}>
        <div class="stack" style="gap:16px">
          <div class="field">Nominal tagihan
            <div class="target-modes two">
              <label class="radio-card"><input type="radio" name="bill-mode" value="default" ${useDefault ? 'checked' : ''}><span><b>Harga default</b><small>${b.default_amount ? rupiah(b.default_amount) : 'Belum diatur (Rp0)'}</small></span></label>
              <label class="radio-card"><input type="radio" name="bill-mode" value="custom" ${useDefault ? '' : 'checked'}><span><b>Nominal khusus</b><small>Ketik nominal untuk client ini</small></span></label>
            </div>
          </div>
          <label class="field" id="bill-custom-wrap" ${useDefault ? 'hidden' : ''}>Nominal khusus
            ${rupiahInput('bill-amount', b.custom_amount, '150.000')}
          </label>
          <label class="field">Catatan khusus (opsional)
            <textarea class="textarea" id="bill-note" rows="2" maxlength="300" placeholder="${esc(b.default_note)}">${esc(b.note)}</textarea>
            <span class="field-hint">Kosongkan untuk memakai catatan default dari Pengaturan</span>
          </label>
          <div class="form-error" id="bill-error" hidden></div>
          <div><button class="btn btn-primary" id="bill-save">${ICONS.check} Simpan tagihan</button></div>
        </div>
        <div id="bill-preview"></div>
      </div>`;

    if (!b.qris_ready) return;
    const $ = (x) => el.querySelector(x);
    const mode = () => el.querySelector('input[name="bill-mode"]:checked').value;
    const currentAmount = () => (mode() === 'default' ? b.default_amount : readRupiah($('#bill-amount')) || 0);
    let timer;
    const renderPreview = () => {
      const amount = currentAmount();
      const reason = client.status === 'expired' ? 'expired' : 'locked';
      $('#bill-preview').innerHTML = lockScreenMock({
        reason, amount, merchant: b.merchant_name, note: $('#bill-note').value || b.default_note,
        imgSrc: amount ? `/api/admin/billing/preview.png?amount=${amount}&size=360` : '',
        lockReason: client.locked ? client.lock_reason : '',
      });
    };
    el.querySelectorAll('input[name="bill-mode"]').forEach((r) => r.addEventListener('change', () => {
      $('#bill-custom-wrap').hidden = mode() !== 'custom';
      if (mode() === 'custom') $('#bill-amount').focus();
      renderPreview();
    }));
    bindRupiah($('#bill-amount'), () => { clearTimeout(timer); timer = setTimeout(renderPreview, 350); });
    $('#bill-note').addEventListener('change', renderPreview);

    $('#bill-save').addEventListener('click', async (e) => {
      const amount = mode() === 'default' ? null : readRupiah($('#bill-amount'));
      if (mode() === 'custom' && !amount) {
        $('#bill-error').textContent = 'Isi nominal khusus terlebih dahulu';
        $('#bill-error').hidden = false;
        return;
      }
      const done = busy(e.currentTarget, 'Menyimpan...');
      $('#bill-error').hidden = true;
      try {
        b = await api(`/admin/clients/${client.id}/billing`, { method: 'PUT', body: { amount, note: $('#bill-note').value } });
        toast(`Tagihan disimpan: ${rupiah(b.effective_amount)}`);
        render();
      } catch (ex) {
        $('#bill-error').textContent = ex.message;
        $('#bill-error').hidden = false;
        done();
      }
    });
    renderPreview();
  }
  render();
}

/** Ambil info tagihan client (untuk prefill modal kunci). */
export function getClientBilling(id) {
  return api(`/admin/clients/${id}/billing`);
}
export { rupiahInput, bindRupiah, readRupiah };
