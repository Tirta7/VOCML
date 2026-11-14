// UI Tagihan QRIS: pengaturan global (Pengaturan) dan kartu tagihan per client (Detail Client).
import { api } from './api.js';
import { esc, fmtDateTime, ICONS, toast, busy, openModal, confirmDialog, productName, PRODUCTS } from './ui.js';

export const QR_ICON = '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h4v4h-4"/></svg>';
export const WA_ICON = '<svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
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
   Helper tabel varian paket & promo dinamis
   ------------------------------------------------------------------ */
function renderPackageRows(tbody, packages = []) {
  tbody.innerHTML = (packages || []).map((pkg, idx) => `
    <tr data-pkg-row="${idx}">
      <td style="padding:6px 8px;">
        <input type="number" class="input input-sm pkg-days" value="${pkg.days || 30}" min="1" max="3650" style="width:70px" required>
      </td>
      <td style="padding:6px 8px;">
        <input type="text" class="input input-sm pkg-name" value="${esc(pkg.name || `Paket ${pkg.days || 30} Hari`)}" placeholder="Nama Paket">
      </td>
      <td style="padding:6px 8px;">
        <div class="money-input money-input-sm"><span>Rp</span><input class="input input-sm pkg-base-price" inputmode="numeric" value="${(pkg.basePrice || pkg.original_price) ? Number(pkg.basePrice || pkg.original_price).toLocaleString('id-ID') : ''}" placeholder="0"></div>
      </td>
      <td style="padding:6px 8px;">
        <div class="money-input money-input-sm"><span>Rp</span><input class="input input-sm pkg-promo-price" inputmode="numeric" value="${(pkg.promoPrice || pkg.promo_price) ? Number(pkg.promoPrice || pkg.promo_price).toLocaleString('id-ID') : ''}" placeholder="Opsional"></div>
      </td>
      <td style="padding:6px 8px;">
        <input type="text" class="input input-sm pkg-promo-badge" value="${esc(pkg.promoBadge || pkg.promo_badge || '')}" placeholder="Cth: DISKON 20%" style="width:110px">
      </td>
      <td style="padding:6px 8px; text-align:center;">
        <button type="button" class="btn btn-ghost btn-sm btn-icon-danger btn-del-pkg" title="Hapus varian">${ICONS.trash}</button>
      </td>
    </tr>`).join('');

  tbody.querySelectorAll('tr').forEach((tr) => {
    bindRupiah(tr.querySelector('.pkg-base-price'));
    bindRupiah(tr.querySelector('.pkg-promo-price'));
    tr.querySelector('.btn-del-pkg').addEventListener('click', () => tr.remove());
  });
}

function addPackageRow(tbody, defaultDays = 30, defaultBase = 50000) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td style="padding:6px 8px;"><input type="number" class="input input-sm pkg-days" value="${defaultDays}" min="1" max="3650" style="width:70px" required></td>
    <td style="padding:6px 8px;"><input type="text" class="input input-sm pkg-name" value="Paket ${defaultDays} Hari" placeholder="Nama Paket"></td>
    <td style="padding:6px 8px;"><div class="money-input money-input-sm"><span>Rp</span><input class="input input-sm pkg-base-price" inputmode="numeric" value="${defaultBase ? defaultBase.toLocaleString('id-ID') : ''}" placeholder="0"></div></td>
    <td style="padding:6px 8px;"><div class="money-input money-input-sm"><span>Rp</span><input class="input input-sm pkg-promo-price" inputmode="numeric" value="" placeholder="Opsional"></div></td>
    <td style="padding:6px 8px;"><input type="text" class="input input-sm pkg-promo-badge" value="" placeholder="Cth: DISKON 20%" style="width:110px"></td>
    <td style="padding:6px 8px; text-align:center;"><button type="button" class="btn btn-ghost btn-sm btn-icon-danger btn-del-pkg" title="Hapus varian">${ICONS.trash}</button></td>
  `;
  bindRupiah(tr.querySelector('.pkg-base-price'));
  bindRupiah(tr.querySelector('.pkg-promo-price'));
  tr.querySelector('.btn-del-pkg').addEventListener('click', () => tr.remove());
  tbody.appendChild(tr);
}

function readPackageRows(tbody) {
  const rows = [];
  tbody.querySelectorAll('tr').forEach((tr, idx) => {
    const days = Number(tr.querySelector('.pkg-days').value) || 30;
    const name = tr.querySelector('.pkg-name').value.trim() || `Paket ${days} Hari`;
    const basePrice = readRupiah(tr.querySelector('.pkg-base-price')) || 0;
    const promoPrice = readRupiah(tr.querySelector('.pkg-promo-price'));
    const promoBadge = tr.querySelector('.pkg-promo-badge').value.trim();
    if (basePrice > 0) {
      rows.push({
        id: `pkg_${days}d_${idx}`,
        days,
        label: `${days} Hari`,
        name,
        basePrice,
        promoPrice: promoPrice && promoPrice < basePrice ? promoPrice : null,
        promoBadge,
      });
    }
  });
  return rows;
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
const TRIAL_HINTS = {
  billiard: 'Cth: 10 = gratis 10x sewa/booking meja billiard pertama (0 = tanpa trial)',
  pos: 'Cth: 50 = gratis 50x transaksi penjualan/struk kasir pertama (0 = tanpa trial)',
  messagerahasia: 'Cth: 10 = gratis 10x kirim pesan rahasia pertama (0 = tanpa trial)',
};

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
        <div class="field" style="margin-top:4px;">
          <b style="font-size:0.95rem;">Kuota Gratis Trial Pengguna Baru</b>
          <div class="field-hint" style="margin-top:2px;">Beri kesempatan mencoba aplikasi gratis beberapa kali saat client pertama kali mendaftar sebelum wajib bayar lisensi.</div>
          <div class="form-grid" style="margin-top:8px;">
            ${Object.entries(PRODUCTS).map(([k, p]) => `
              <label class="field">Trial Akun Baru ${esc(p.short)}
                <div class="money-input"><span>x</span><input class="input" id="trial-${k}" type="number" min="0" max="1000" value="${s.trial_quotas?.[k] ?? (k === 'messagerahasia' ? 10 : 0)}" placeholder="0"></div>
                <span class="field-hint">${TRIAL_HINTS[k] || 'Cth: 10 = gratis 10x pemakaian (0 = tanpa trial)'}</span>
              </label>`).join('')}
          </div>
        </div>
        <div class="field" style="margin-top:4px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:8px;">
            <div>
              <b style="font-size:0.95rem;">Paket & Promo Lisensi (Global)</b>
              <div class="field-hint" style="margin-top:2px;">Daftar paket perpanjangan yang muncul di semua aplikasi client. Atur harga promo/diskon di sini untuk update serentak ke semua client.</div>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-add-global-pkg">+ Tambah Varian</button>
          </div>
          <div class="table-wrap" style="max-height:260px; overflow-y:auto; border:1px solid var(--line); border-radius:8px;">
            <table class="table" style="margin:0; font-size:0.85rem;">
              <thead style="position:sticky; top:0; background:var(--bg-card); z-index:2;">
                <tr>
                  <th style="width:75px">Durasi</th>
                  <th>Nama Paket</th>
                  <th style="width:120px">Harga Normal</th>
                  <th style="width:120px">Harga Promo</th>
                  <th style="width:115px">Badge Promo</th>
                  <th style="width:36px; text-align:center">Aksi</th>
                </tr>
              </thead>
              <tbody id="global-packages-tbody"></tbody>
            </table>
          </div>
        </div>
        <label class="field">Catatan di layar terkunci
          <textarea class="textarea" id="billing-note" rows="2" maxlength="300">${esc(s.billing_note)}</textarea>
        </label>
        <label class="field">Kontak admin (WhatsApp di Invoice &amp; Layar Terkunci)
          <input class="input" id="billing-contact" maxlength="60" value="${esc(s.billing_contact)}" placeholder="08xxxxxxxxxx">
        </label>

        <div style="background:var(--bg); border:1px solid var(--line); border-radius:10px; padding:14px 16px;" class="stack">
          <div>
            <b style="font-size:0.95rem;">Info Pengirim Invoice &amp; Rekening Transfer Alternatif</b>
            <div class="field-hint" style="margin-top:2px;">Ditampilkan pada gambar Invoice &amp; pesan tagihan WhatsApp yang dikirim ke owner.</div>
          </div>
          <div class="form-grid">
            <label class="field">Nama Usaha di Invoice
              <input class="input" id="inv-sender-name" maxlength="100" value="${esc(s.invoice_sender_name || 'Virtual Operation Control')}" placeholder="Virtual Operation Control">
            </label>
            <label class="field">Kota / Lokasi
              <input class="input" id="inv-sender-city" maxlength="80" value="${esc(s.invoice_sender_city || 'sidoarjo')}" placeholder="sidoarjo">
            </label>
            <label class="field">Sosial Media / YouTube
              <input class="input" id="inv-sender-social" maxlength="80" value="${esc(s.invoice_sender_social || '@virtualoperationcontrol')}" placeholder="@virtualoperationcontrol">
            </label>
          </div>
          <div class="form-grid">
            <label class="field">Nama Bank Transfer
              <input class="input" id="bank-name" maxlength="60" value="${esc(s.bank_name || 'BCA')}" placeholder="BCA">
            </label>
            <label class="field">Nomor Rekening
              <input class="input mono" id="bank-acc" maxlength="60" value="${esc(s.bank_account_number || '3251622602')}" placeholder="3251622602">
            </label>
            <label class="field">Atas Nama Rekening
              <input class="input" id="bank-holder" maxlength="100" value="${esc(s.bank_account_holder || 'TIRTA ADITYA')}" placeholder="TIRTA ADITYA">
            </label>
          </div>
          <div class="form-grid" style="align-items:center;">
            <label class="field">Auto-Reminder WhatsApp Sebelum Expired
              <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
                <input type="checkbox" id="wa-rem-enabled" ${s.wa_reminder_enabled !== false ? 'checked' : ''} style="width:18px; height:18px;">
                <span>Kirim otomatis pada <b>H-</b></span>
                <input class="input input-sm" type="number" id="wa-rem-days" min="1" max="30" value="${s.wa_reminder_days || 3}" style="width:64px">
                <span>hari sebelum habis</span>
              </div>
            </label>
            <label class="field">Auto-Kuitansi Lunas WhatsApp
              <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
                <input type="checkbox" id="wa-rec-enabled" ${s.wa_receipt_enabled !== false ? 'checked' : ''} style="width:18px; height:18px;">
                <span>Kirim invoice <b>LUNAS</b> otomatis saat pembayaran QRIS berhasil</span>
              </div>
            </label>
          </div>
          <div class="form-grid" style="align-items:center;">
            <label class="field">Notifikasi Laporan ke WhatsApp Admin
              <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
                <input type="checkbox" id="wa-admin-notify" ${s.wa_admin_notify_enabled !== false ? 'checked' : ''} style="width:18px; height:18px;">
                <span>Kirim laporan uang masuk &amp; alert baterai HP ke nomor Kontak Admin</span>
              </div>
            </label>
            <label class="field">Bot Interaktif WhatsApp (Self-Service Client)
              <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
                <input type="checkbox" id="wa-bot-enabled" ${s.wa_bot_enabled !== false ? 'checked' : ''} style="width:18px; height:18px;">
                <span>Balas otomatis saat client ketik <b>INFO / CEK / BAYAR</b> di WA</span>
              </div>
            </label>
          </div>
        </div>

        <div class="form-error" id="billing-error" hidden></div>
        <div><button class="btn btn-primary" id="billing-save">${ICONS.check} Simpan pengaturan tagihan &amp; invoice</button></div>
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

  const globalTbody = $('#global-packages-tbody');
  renderPackageRows(globalTbody, s.packages || []);
  $('#btn-add-global-pkg').addEventListener('click', () => addPackageRow(globalTbody, 30, 60000));

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
          invoice_sender_name: $('#inv-sender-name').value,
          invoice_sender_city: $('#inv-sender-city').value,
          invoice_sender_social: $('#inv-sender-social').value,
          bank_name: $('#bank-name').value,
          bank_account_number: $('#bank-acc').value,
          bank_account_holder: $('#bank-holder').value,
          wa_reminder_enabled: $('#wa-rem-enabled').checked,
          wa_reminder_days: Number($('#wa-rem-days').value) || 3,
          wa_receipt_enabled: $('#wa-rec-enabled').checked,
          wa_admin_notify_enabled: $('#wa-admin-notify').checked,
          wa_bot_enabled: $('#wa-bot-enabled').checked,
          prices: Object.fromEntries(Object.keys(PRODUCTS).map((k) => [k, readRupiah($(`#price-${k}`)) || 0])),
          trial_quotas: Object.fromEntries(Object.keys(PRODUCTS).map((k) => [k, Number($(`#trial-${k}`)?.value) || 0])),
          packages: readPackageRows(globalTbody),
        },
      });
      inspected = s.qris ? { ok: true, info: s.qris } : null;
      renderInfo();
      renderPackageRows(globalTbody, s.packages || []);
      renderPreview();
      toast('Pengaturan tagihan dan paket lisensi disimpan');
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
    const isCustomPkg = !!b.has_custom_packages;
    const statusChip = b.showing_now
      ? `<span class="badge b-locked">Sedang tampil di aplikasi client</span>`
      : `<span class="badge b-pending">Tampil saat kedaluwarsa / dikunci</span>`;

    let selectedAmount = useDefault ? (b.default_amount ? (b.default_amount + (b.unique_code || 0)) : 0) : b.custom_amount;
    if (b.packages && b.packages.length > 0 && !selectedAmount) {
      selectedAmount = b.packages[0].amount;
    }

    el.innerHTML = `
      <div class="card-head" style="border-bottom:1px solid var(--line)">
        <div><h2>Tagihan QRIS &amp; Invoice WhatsApp</h2><div class="muted small" style="margin-top:4px">Nominal &amp; paket tagihan yang muncul di aplikasi ${productName(client.product, true)} milik client ini, serta pengiriman Invoice QRIS via WhatsApp.</div></div>
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          ${b.unique_code ? `<span class="badge b-info" title="3-digit kode unik client">Kode Unik: <b>+${b.unique_code}</b></span>` : ''}
          ${b.qris_ready ? statusChip : ''}
          ${b.qris_ready ? `<button type="button" class="btn btn-primary btn-sm" id="btn-wa-invoice">${WA_ICON} Kirim Invoice WA</button>` : ''}
        </div>
      </div>
      ${!b.qris_ready ? `<div style="padding:22px"><div class="alert warn">${ICONS.alert}<span><b>QRIS belum diatur.</b> Upload QRIS toko Anda di <a href="#/settings">Pengaturan → Tagihan QRIS</a> agar tagihan bisa tampil di aplikasi client.</span></div></div>` : ''}
      <div class="billing-client" ${b.qris_ready ? '' : 'hidden'}>
        <div class="stack" style="gap:16px">
          <div class="field">Nominal tagihan utama
            <div class="target-modes two">
              <label class="radio-card"><input type="radio" name="bill-mode" value="default" ${useDefault ? 'checked' : ''}><span><b>Harga default</b><small>${b.default_amount ? rupiah(b.default_amount) : 'Belum diatur (Rp0)'}</small></span></label>
              <label class="radio-card"><input type="radio" name="bill-mode" value="custom" ${useDefault ? '' : 'checked'}><span><b>Nominal khusus</b><small>Ketik nominal untuk client ini</small></span></label>
            </div>
          </div>
          <label class="field" id="bill-custom-wrap" ${useDefault ? 'hidden' : ''}>Nominal khusus
            ${rupiahInput('bill-amount', b.custom_amount, '150.000')}
          </label>

          <div style="background:var(--bg); border:1px solid var(--line); border-radius:10px; padding:12px 14px;">
            <div class="field" style="margin-bottom:8px;">
              <b style="font-size:0.9rem;">Paket & Promo Perpanjangan Klien Ini</b>
              <div class="field-hint" style="margin-top:2px;">Klien ini dapat memilih paket perpanjangan di aplikasi. Anda dapat memakai paket global atau memberi diskon khusus untuk klien ini.</div>
              <div class="target-modes two" style="margin-top:8px;">
                <label class="radio-card"><input type="radio" name="pkg-mode" value="global" ${!isCustomPkg ? 'checked' : ''}><span><b>Ikuti Paket Global</b><small>Pakai daftar & harga umum</small></span></label>
                <label class="radio-card"><input type="radio" name="pkg-mode" value="custom" ${isCustomPkg ? 'checked' : ''}><span><b>Kustomisasi Khusus Klien</b><small>Atur varian harga / diskon khusus akun ini</small></span></label>
              </div>
            </div>

            <div id="client-custom-pkg-wrap" ${!isCustomPkg ? 'hidden' : ''} style="margin-top:10px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <span class="small muted">Varian & harga khusus client ini:</span>
                <div style="display:flex; gap:6px;">
                  <button type="button" class="btn btn-secondary btn-sm" id="btn-add-client-pkg">+ Tambah Varian</button>
                  <button type="button" class="btn btn-ghost btn-sm" id="btn-copy-global-pkg">Salin dari Global</button>
                </div>
              </div>
              <div class="table-wrap" style="max-height:220px; overflow-y:auto; border:1px solid var(--line); border-radius:8px;">
                <table class="table" style="margin:0; font-size:0.82rem;">
                  <thead style="position:sticky; top:0; background:var(--bg-card); z-index:2;">
                    <tr>
                      <th style="width:70px">Durasi</th>
                      <th>Nama Paket</th>
                      <th style="width:110px">Harga Normal</th>
                      <th style="width:110px">Harga Promo</th>
                      <th style="width:100px">Badge</th>
                      <th style="width:34px; text-align:center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody id="client-packages-tbody"></tbody>
                </table>
              </div>
            </div>

            <div style="margin-top:12px;">
              <span class="small muted" style="font-weight:600;">Pilihan Paket Aktif di Klien (Termasuk Kode Unik +${b.unique_code || 0}):</span>
              <div class="package-chips" id="active-pkg-chips" style="display:flex; flex-wrap:wrap; gap:8px; margin-top:6px;">
                ${(b.packages || []).map((p) => `
                  <div class="pkg-chip" data-pkg-amount="${p.amount}" data-pkg-name="${esc(p.name)}" style="border:1px solid var(--line); border-radius:8px; padding:6px 10px; cursor:pointer; background:var(--bg-card); user-select:none;">
                    <div style="font-weight:600; font-size:0.82rem; display:flex; align-items:center; gap:4px;">
                      <span>${esc(p.name)}</span>
                      ${p.promo_badge ? `<span class="badge b-warn" style="font-size:0.65rem; padding:1px 5px;">${esc(p.promo_badge)}</span>` : ''}
                    </div>
                    <div style="font-size:0.95rem; font-weight:700; color:var(--primary); margin-top:2px;">
                      ${rupiah(p.amount)}
                      ${p.is_promo ? `<s style="font-size:0.75rem; color:var(--text-muted); margin-left:4px;">${rupiah(p.original_price)}</s>` : ''}
                    </div>
                    <div class="muted" style="font-size:0.72rem;">+${p.days} Hari · Klik untuk QR</div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

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
    const pkgMode = () => el.querySelector('input[name="pkg-mode"]:checked').value;
    const clientTbody = $('#client-packages-tbody');

    renderPackageRows(clientTbody, b.custom_packages || b.packages || []);

    $('#btn-add-client-pkg').addEventListener('click', () => addPackageRow(clientTbody, 30, 60000));
    $('#btn-copy-global-pkg').addEventListener('click', async () => {
      const s = await api('/admin/billing/settings');
      renderPackageRows(clientTbody, s.packages || []);
      toast('Menyalin varian dari paket global');
    });

    el.querySelectorAll('input[name="pkg-mode"]').forEach((r) => r.addEventListener('change', () => {
      $('#client-custom-pkg-wrap').hidden = pkgMode() !== 'custom';
    }));

    let timer;
    const renderPreview = (customAmount = null) => {
      const amount = customAmount !== null ? customAmount : (mode() === 'default' ? b.default_amount : readRupiah($('#bill-amount')) || 0);
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
    $('#bill-note').addEventListener('change', () => renderPreview());

    // Klik paket chip untuk langsung melihat preview QRIS paket tersebut
    el.querySelectorAll('.pkg-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        el.querySelectorAll('.pkg-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        const amt = Number(chip.dataset.pkgAmount) || 0;
        renderPreview(amt);
      });
    });

    $('#bill-save').addEventListener('click', async (e) => {
      const amount = mode() === 'default' ? null : readRupiah($('#bill-amount'));
      if (mode() === 'custom' && !amount) {
        $('#bill-error').textContent = 'Isi nominal khusus terlebih dahulu';
        $('#bill-error').hidden = false;
        return;
      }

      const customPackages = pkgMode() === 'custom' ? readPackageRows(clientTbody) : null;

      const done = busy(e.currentTarget, 'Menyimpan...');
      $('#bill-error').hidden = true;
      try {
        b = await api(`/admin/clients/${client.id}/billing`, {
          method: 'PUT',
          body: {
            amount,
            note: $('#bill-note').value,
            custom_packages: customPackages,
          },
        });
        toast(`Tagihan disimpan: ${rupiah(b.effective_amount)}`);
        render();
      } catch (ex) {
        $('#bill-error').textContent = ex.message;
        $('#bill-error').hidden = false;
        done();
      }
    });

    $('#btn-wa-invoice')?.addEventListener('click', () => openInvoiceWhatsappModal(client, b));

    renderPreview(selectedAmount);
  }
  render();
}

/**
 * Modal Preview & Kirim Invoice QRIS ke WhatsApp Owner
 */
export function openInvoiceWhatsappModal(client, billingData = null) {
  const pkgs = billingData?.packages || [];
  const defaultPkg = pkgs.find((p) => p.days === 30) || pkgs.find((p) => p.days >= 14) || pkgs[0] || null;
  let selectedPkgId = defaultPkg?.id || '';
  const todayYmd = new Date().toISOString().slice(0, 10);

  const m = openModal({
    title: `Kirim Invoice & QRIS ke WhatsApp — ${client.name}`,
    size: 'lg',
    body: `
      <div class="stack" style="gap:14px">
        <div class="alert info" style="margin:0">
          ${WA_ICON}
          <span>Sistem akan mengirimkan <b>Gambar Invoice Lengkap</b> + <b>Kartu QRIS Siap Scan (Nominal + Kode Unik +${billingData?.unique_code || client.unique_code || 0})</b> beserta rincian nomor rekening ke WhatsApp owner.</span>
        </div>

        <div class="form-grid">
          <label class="field">Nomor WhatsApp Tujuan (Owner)
            <input class="input" id="wa-inv-phone" value="${esc(client.phone || '')}" placeholder="08xxxxxxxxxx / 628xxxxxxxxxx">
            <span class="field-hint">Otomatis diformat ke kode negara Indonesia (62)</span>
          </label>
          <label class="field">Pilih Paket Tagihan di Invoice
            <select class="input" id="wa-inv-pkg">
              ${pkgs.map((p) => `<option value="${esc(p.id)}" data-amount="${p.amount}" ${p.id === selectedPkgId ? 'selected' : ''}>${esc(p.name)} (${p.days} Hari) — ${rupiah(p.amount)}</option>`).join('')}
            </select>
            <span class="field-hint">QRIS di dalam invoice otomatis mengikuti nominal paket ini</span>
          </label>
        </div>

        <div class="form-grid">
          <label class="field">Potongan Diskon Tambahan (Opsional)
            ${rupiahInput('wa-inv-discount', 0, '0')}
            <span class="field-hint">Jika diisi (mis. Rp5.000), otomatis memotong total tagihan QRIS &amp; tampil di baris Diskon</span>
          </label>
          <label class="field">Tanggal Terbit Invoice
            <input class="input" type="date" id="wa-inv-date" value="${todayYmd}">
            <span class="field-hint">Tampil pada bagian kanan atas gambar Invoice</span>
          </label>
        </div>

        <div style="display:grid; grid-template-columns: 1.2fr 0.8fr; gap:12px; align-items:start;">
          <div style="border:1px solid var(--line); border-radius:10px; padding:10px; background:var(--bg); text-align:center;">
            <div class="small muted" style="font-weight:600; margin-bottom:6px;">Preview Gambar 1: Invoice Pesanan</div>
            <img id="wa-inv-preview-img" src="/api/admin/clients/${client.id}/invoice.png?package_id=${encodeURIComponent(selectedPkgId)}&t=${Date.now()}" alt="Preview Invoice" style="max-width:100%; max-height:380px; border-radius:6px; border:1px solid var(--line); object-fit:contain; background:#fff;">
          </div>
          <div style="border:1px solid var(--line); border-radius:10px; padding:10px; background:var(--bg); text-align:center;">
            <div class="small muted" style="font-weight:600; margin-bottom:6px;">Preview Gambar 2: Kartu QRIS</div>
            <img id="wa-qris-preview-img" src="/api/admin/clients/${client.id}/qris-card.png?package_id=${encodeURIComponent(selectedPkgId)}&t=${Date.now()}" alt="Preview Kartu QRIS" style="max-width:100%; max-height:380px; border-radius:6px; border:1px solid var(--line); object-fit:contain; background:#fff;">
          </div>
        </div>
        <div class="form-error" id="wa-inv-err" hidden></div>
      </div>
    `,
    footer: `
      <a class="btn btn-outline" id="wa-inv-download" href="/api/admin/clients/${client.id}/invoice.png?package_id=${encodeURIComponent(selectedPkgId)}" download="INVOICE-${esc(client.machine_id)}.png">Download Invoice</a>
      <div style="flex:1"></div>
      <button class="btn btn-ghost" data-close>Batal</button>
      <button class="btn btn-primary" id="wa-inv-send">${WA_ICON} Kirim ke WhatsApp Sekarang</button>
    `,
  });

  const $ = (s) => m.el.querySelector(s);
  const pkgSelect = $('#wa-inv-pkg');
  const discInput = $('#wa-inv-discount');
  const dateInput = $('#wa-inv-date');
  const invImg = $('#wa-inv-preview-img');
  const qrisImg = $('#wa-qris-preview-img');
  const dlBtn = $('#wa-inv-download');

  let refreshTimer = null;
  function updatePreviews() {
    selectedPkgId = pkgSelect.value;
    const disc = readRupiah(discInput) || 0;
    const dateVal = dateInput.value || '';
    const qs = new URLSearchParams({
      package_id: selectedPkgId,
      ...(disc > 0 ? { discount: String(disc) } : {}),
      ...(dateVal ? { date: dateVal } : {}),
      t: String(Date.now()),
    }).toString();

    invImg.src = `/api/admin/clients/${client.id}/invoice.png?${qs}`;
    qrisImg.src = `/api/admin/clients/${client.id}/qris-card.png?${qs}`;
    dlBtn.href = `/api/admin/clients/${client.id}/invoice.png?${qs}`;
  }

  pkgSelect?.addEventListener('change', updatePreviews);
  dateInput?.addEventListener('change', updatePreviews);
  if (discInput) {
    bindRupiah(discInput, () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(updatePreviews, 350);
    });
  }

  $('#wa-inv-send')?.addEventListener('click', async (e) => {
    const phone = $('#wa-inv-phone').value.trim();
    if (!phone) {
      $('#wa-inv-err').textContent = 'Masukkan nomor WhatsApp tujuan terlebih dahulu.';
      $('#wa-inv-err').hidden = false;
      return;
    }
    $('#wa-inv-err').hidden = true;
    const done = busy(e.currentTarget, 'Mengirim ke WhatsApp...');
    try {
      const r = await api(`/admin/clients/${client.id}/send-invoice`, {
        method: 'POST',
        body: {
          phone,
          package_id: selectedPkgId,
          discount: readRupiah(discInput) || 0,
          date: dateInput.value || null,
        },
      });
      m.close();
      toast(`Invoice ${r.invoice_no} (${r.amount_text}) berhasil dikirim ke WhatsApp ${r.phone}`);
    } catch (ex) {
      $('#wa-inv-err').textContent = ex.message;
      $('#wa-inv-err').hidden = false;
      done();
    }
  });
}

/**
 * Kartu Pengaturan WhatsApp Gateway (Baileys) di halaman Pengaturan
 */
export async function mountWhatsappSettings(el) {
  let st = await api('/admin/whatsapp/status');
  let pollTimer = null;

  function statusBadge(s) {
    const phone = s.me?.number || s.user?.phone || '';
    if (s.status === 'connected') return `<span class="badge b-active">Terhubung (${esc(phone || 'Aktif')})</span>`;
    if (s.status === 'qr') return `<span class="badge b-expiring">Menunggu Scan QR</span>`;
    if (s.status === 'connecting') return `<span class="badge b-info">Menghubungkan...</span>`;
    return `<span class="badge b-pending">Belum Terhubung</span>`;
  }

  function render() {
    const phone = st.me?.number || st.user?.phone || '';
    const name = st.me?.name || st.user?.name || '';
    el.innerHTML = `
      <div class="card-head" style="border-bottom:1px solid var(--line)">
        <div>
          <h2>WhatsApp Gateway (Invoice &amp; Auto-Reminder)</h2>
          <div class="muted small" style="margin-top:4px">Tautkan WhatsApp admin (Scan QR) untuk mengirim gambar Invoice QRIS &amp; pengingat perpanjangan otomatis ke nomor WhatsApp owner.</div>
        </div>
        <div>${statusBadge(st)}</div>
      </div>
      <div style="padding:20px" class="stack">
        ${st.status === 'connected' ? `
          <div class="qris-status ok">
            ${ICONS.check}
            <div>
              <b>WhatsApp Terhubung: +${esc(phone)} ${name ? `(${esc(name)})` : ''}</b>
              <div class="small">Siap mengirim Invoice QRIS otomatis (H-3, H-1, H-0), kuitansi LUNAS otomatis, laporan admin, serta melayani perintah bot interaktif (<b>INFO / CEK / BAYAR</b>).</div>
            </div>
          </div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button type="button" class="btn btn-outline btn-sm" id="wa-btn-disconnect">Putuskan Sementara</button>
            <button type="button" class="btn btn-danger btn-sm" id="wa-btn-logout">Logout / Ganti Nomor WA</button>
          </div>
        ` : st.status === 'qr' && st.has_qr ? `
          <div style="display:flex; gap:24px; align-items:center; flex-wrap:wrap;">
            <div style="background:#fff; padding:12px; border-radius:12px; border:1px solid var(--line); box-shadow:0 2px 8px rgba(0,0,0,0.06);">
              <img src="/api/admin/whatsapp/qr.png?t=${Date.now()}" alt="Scan QR WhatsApp" style="width:220px; height:220px; display:block;">
            </div>
            <div class="stack" style="gap:8px; max-width:440px;">
              <b style="font-size:1rem;">Scan QR Code dengan WhatsApp Anda</b>
              <ol class="muted small" style="margin:0; padding-left:18px; line-height:1.7;">
                <li>Buka aplikasi <b>WhatsApp</b> di HP Anda</li>
                <li>Ketuk menu <b>Perangkat Tertaut (Linked Devices)</b></li>
                <li>Ketuk <b>Tautkan Perangkat</b> lalu arahkan kamera ke QR Code di samping</li>
              </ol>
              <div style="display:flex; gap:8px; margin-top:6px;">
                <button type="button" class="btn btn-secondary btn-sm" id="wa-btn-refresh"> Segarkan QR</button>
                <button type="button" class="btn btn-ghost btn-sm" id="wa-btn-logout">Batal / Reset Sesi</button>
              </div>
            </div>
          </div>
        ` : `
          <div class="qris-status muted">
            ${WA_ICON}
            <div>
              <b>WhatsApp belum ditautkan</b>
              <div class="small">${st.last_error ? `Info terakhir: ${esc(st.last_error)}` : 'Klik tombol di bawah untuk menampilkan QR Code dan menautkan nomor WhatsApp pengirim invoice.'}</div>
            </div>
          </div>
          <div style="display:flex; gap:10px;">
            <button type="button" class="btn btn-primary" id="wa-btn-connect">${WA_ICON} Hubungkan WhatsApp (Tampilkan QR)</button>
            ${st.status === 'connecting' ? `<button type="button" class="btn btn-ghost btn-sm" id="wa-btn-logout">Reset Sesi</button>` : ''}
          </div>
        `}
      </div>
    `;

    el.querySelector('#wa-btn-connect')?.addEventListener('click', async (e) => {
      const done = busy(e.currentTarget, 'Menyiapkan QR...');
      try {
        st = await api('/admin/whatsapp/connect', { method: 'POST', body: {} });
        render();
        // Poll 2 detik sekali selama menunggu QR / scan
        startPolling();
      } catch (ex) {
        toast(ex.message, 'error');
      } finally {
        done();
      }
    });

    el.querySelector('#wa-btn-refresh')?.addEventListener('click', async () => {
      st = await api('/admin/whatsapp/status');
      render();
    });

    el.querySelector('#wa-btn-disconnect')?.addEventListener('click', async (e) => {
      const done = busy(e.currentTarget, 'Memutuskan...');
      try {
        st = await api('/admin/whatsapp/disconnect', { method: 'POST', body: { logout: false } });
        render();
        toast('Koneksi WhatsApp diputus sementara');
      } catch (ex) {
        toast(ex.message, 'error');
      } finally {
        done();
      }
    });

    el.querySelector('#wa-btn-logout')?.addEventListener('click', async (e) => {
      const done = busy(e.currentTarget, 'Merombak sesi...');
      try {
        st = await api('/admin/whatsapp/disconnect', { method: 'POST', body: { logout: true } });
        render();
        toast('Sesi WhatsApp berhasil di-reset');
      } catch (ex) {
        toast(ex.message, 'error');
      } finally {
        done();
      }
    });
  }

  function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      if (!document.body.contains(el)) {
        clearInterval(pollTimer);
        return;
      }
      try {
        const next = await api('/admin/whatsapp/status');
        if (next.status !== st.status || next.has_qr !== st.has_qr || next.user?.phone !== st.user?.phone) {
          st = next;
          render();
          if (st.status === 'connected') {
            toast('WhatsApp berhasil terhubung!', 'success');
            clearInterval(pollTimer);
          }
        }
      } catch {}
    }, 2500);
  }

  const onRt = async (e) => {
    if (!document.body.contains(el)) {
      window.removeEventListener('vocml:change', onRt);
      return;
    }
    if (e.detail?.topic === 'whatsapp') {
      try {
        st = await api('/admin/whatsapp/status');
        render();
      } catch {}
    }
  };
  window.addEventListener('vocml:change', onRt);

  render();
  if (st.status === 'connecting' || st.status === 'qr') startPolling();
}

/** Ambil info tagihan client (untuk prefill modal kunci). */
export function getClientBilling(id) {
  return api(`/admin/clients/${id}/billing`);
}

/**
 * Tabel Antrean Tagihan QRIS & Konfirmasi Pembayaran Manual (Transfer BCA / QRIS)
 */
export async function mountBillingOrdersTable(el) {
  let filterStatus = 'PENDING';
  let data = await api('/admin/billing/orders?limit=100&status=PENDING');

  async function loadAndRender() {
    data = await api(`/admin/billing/orders?limit=100${filterStatus ? `&status=${filterStatus}` : ''}`);
    render();
  }

  function statusBadge(st) {
    if (st === 'PAID') return `<span class="badge b-active">LUNAS</span>`;
    if (st === 'PENDING') return `<span class="badge b-expiring">MENUNGGU BAYAR</span>`;
    return `<span class="badge" style="background:rgba(148,163,184,0.15);color:var(--muted)">HANGUS</span>`;
  }

  function render() {
    const rows = data?.rows || [];
    const counts = data?.counts || { total: 0, pending: 0, paid: 0, expired: 0 };
    el.innerHTML = `
      <div class="card-head" style="border-bottom:1px solid var(--line)">
        <div>
          <h2>Antrean Tagihan QRIS &amp; Konfirmasi Transfer Manual</h2>
          <div class="muted small" style="margin-top:4px">Daftar tagihan QRIS (1x pakai) yang diterbitkan untuk client. Jika client membayar via transfer Bank BCA manual, klik <b>Setujui Lunas</b> untuk mengaktifkan lisensi &amp; mengirim kuitansi WA otomatis.</div>
        </div>
        <div class="chips" id="orders-filter-chips" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <button type="button" class="chip ${filterStatus === 'PENDING' ? 'active' : ''}" data-st="PENDING">Menunggu Bayar ${counts.pending ? `<span class="badge b-expiring" style="margin-left:4px;font-size:10px">${counts.pending}</span>` : ''}</button>
          <button type="button" class="chip ${filterStatus === 'PAID' ? 'active' : ''}" data-st="PAID">Lunas ${counts.paid ? `<span class="badge b-active" style="margin-left:4px;font-size:10px">${counts.paid}</span>` : ''}</button>
          <button type="button" class="chip ${filterStatus === '' ? 'active' : ''}" data-st="">Semua (${counts.total || 0})</button>
          ${counts.expired > 0 ? `
            <button type="button" class="btn btn-ghost btn-sm btn-clear-expired" style="color:var(--muted);margin-left:auto;font-size:12px" title="Hapus semua riwayat tagihan kedaluwarsa">
              Bersihkan yang Hangus (${counts.expired})
            </button>
          ` : ''}
        </div>
      </div>
      <div class="table-wrap" style="max-height:360px; overflow-y:auto;">
        ${rows.length ? `
          <table class="table">
            <thead>
              <tr>
                <th>Waktu Dibuat</th>
                <th>Client</th>
                <th>Paket</th>
                <th>Nominal Unik</th>
                <th>Status</th>
                <th style="text-align:right">Tindakan Manual</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((r) => `
                <tr style="${r.status === 'PENDING' ? 'background:rgba(6,182,212,0.03)' : ''}">
                  <td class="muted small">${fmtDateTime(r.created_at)}</td>
                  <td>
                    <a href="#/clients/${r.client_id}" style="font-weight:600;color:var(--ink);text-decoration:none">${esc(r.client_name || r.machine_id)}</a>
                    <div class="mono muted small">${esc(r.machine_id)}</div>
                  </td>
                  <td>${esc(r.package_name)}</td>
                  <td><b class="mono" style="color:var(--teal)">${esc(r.amount_text)}</b></td>
                  <td>${statusBadge(r.status)}</td>
                  <td style="text-align:right">
                    ${r.status === 'PENDING' ? `
                      <div style="display:inline-flex;gap:6px">
                        <button type="button" class="btn btn-primary btn-sm btn-approve-order" data-id="${r.id}" data-name="${esc(r.client_name || r.machine_id)}" data-amt="${esc(r.amount_text)}">${ICONS.check} Setujui Lunas</button>
                        <button type="button" class="btn btn-ghost btn-sm btn-cancel-order" data-id="${r.id}" title="Batalkan tagihan">Batalkan</button>
                      </div>
                    ` : `<span class="muted small">${r.paid_at ? fmtDateTime(r.paid_at) : r.status === 'EXPIRED' ? 'Dibatalkan' : '—'}</span>`}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : `<div class="empty" style="padding:28px"><b>Tidak ada antrean tagihan ${filterStatus === 'PENDING' ? 'yang menunggu pembayaran' : ''}</b>Tagihan otomatis tercatat saat client membuka QRIS atau menerima Invoice WhatsApp.</div>`}
      </div>
    `;

    el.querySelectorAll('#orders-filter-chips .chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        filterStatus = btn.dataset.st;
        loadAndRender();
      });
    });

    const btnClearExpired = el.querySelector('.btn-clear-expired');
    if (btnClearExpired) {
      btnClearExpired.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Bersihkan Riwayat Tagihan Hangus?',
          message: 'Semua tagihan lama yang sudah dibatalkan atau kedaluwarsa akan dihapus dari antrean agar tampilan tetap bersih dan rapi.',
          confirmText: 'Ya, Bersihkan',
        });
        if (!ok) return;
        const done = busy(btnClearExpired, 'Membersihkan...');
        try {
          const res = await api('/admin/billing/orders/clear-expired', { method: 'POST', body: {} });
          toast(`Berhasil membersihkan ${res.deleted || 0} tagihan hangus`);
          await loadAndRender();
        } catch (ex) {
          toast(ex.message, 'error');
        } finally {
          done();
        }
      });
    }

    el.querySelectorAll('.btn-approve-order').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        const amt = btn.dataset.amt;
        const ok = await confirmDialog({
          title: 'Setujui Pembayaran Manual?',
          message: `Konfirmasi bahwa <b>${esc(name)}</b> telah membayar sebesar <b>${esc(amt)}</b> (via Transfer Bank / QRIS)?<br><br>Lisensi akan langsung diperpanjang otomatis dan Kuitansi LUNAS akan dikirim ke WhatsApp client.`,
          confirmText: 'Ya, Aktifkan & Kirim Kuitansi WA',
        });
        if (!ok) return;
        const done = busy(btn, 'Memproses...');
        try {
          const res = await api(`/admin/billing/orders/${id}/approve`, { method: 'POST', body: {} });
          toast(res.message || 'Tagihan berhasil disetujui lunas!');
          await loadAndRender();
        } catch (ex) {
          toast(ex.message, 'error');
        } finally {
          done();
        }
      });
    });

    el.querySelectorAll('.btn-cancel-order').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const done = busy(btn, '...');
        try {
          await api(`/admin/billing/orders/${id}/cancel`, { method: 'POST', body: {} });
          toast('Tagihan dibatalkan');
          await loadAndRender();
        } catch (ex) {
          toast(ex.message, 'error');
        } finally {
          done();
        }
      });
    });
  }

  render();
}

export { rupiahInput, bindRupiah, readRupiah };
