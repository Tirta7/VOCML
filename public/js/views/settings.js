import { api } from '../api.js';
import { esc, fmtDateTime, ICONS, copyBtn, bindCopy } from '../ui.js';

export default async function settings(el, ctx) {
  const s = await api('/admin/settings');
  if (!ctx.isCurrent()) return;
  const base = location.origin;

  el.innerHTML = `
    <header class="page-head">
      <div><h1>Pengaturan</h1><div class="sub">Konfigurasi server lisensi dan informasi integrasi untuk aplikasi Billiard &amp; Kasir POS.</div></div>
    </header>

    ${s.defaultPassword ? `<div class="alert warn">${ICONS.alert}<span><b>Password admin masih default.</b> Ubah <code>ADMIN_PASSWORD</code> di file <code>.env</code> lalu jalankan <code>docker compose up -d</code> ulang sebelum server dibuka ke internet.</span></div>` : ''}

    <section class="row top">
      <div class="card grow-1 stack">
        <h2>Server</h2>
        <dl class="kv">
          <dt>Alamat API</dt><dd><span class="copy-inline"><code>${esc(base)}/api/v1</code>${copyBtn(base + '/api/v1')}</span></dd>
          <dt>Admin</dt><dd>${esc(s.adminUser)}</dd>
          <dt>Zona waktu server</dt><dd>${esc(s.timezone)}</dd>
          <dt>Waktu server</dt><dd>${fmtDateTime(s.serverTime)}</dd>
          <dt>Batas "segera berakhir"</dt><dd>${s.expiringDays} hari <span class="muted small">(EXPIRING_DAYS)</span></dd>
          <dt>Toleransi offline</dt><dd>${s.graceDays} hari <span class="muted small">(OFFLINE_GRACE_DAYS)</span></dd>
          <dt>API key client</dt><dd>${s.clientApiKeyEnabled ? '<span class="badge b-active">Aktif</span>' : '<span class="badge b-pending">Tidak dipakai</span> <span class="muted small">(CLIENT_API_KEY)</span>'}</dd>
        </dl>
        <div class="muted small">Semua nilai di atas diatur lewat environment variable pada file <code>.env</code>.</div>
      </div>

      <div class="card grow-14 stack">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <h2>Public key lisensi (Ed25519)</h2>
          <button class="btn btn-outline btn-sm" data-copy="${esc(s.publicKeyPem)}" data-copy-label="Public key disalin">${ICONS.copy} Salin</button>
        </div>
        <pre class="code-block">${esc(s.publicKeyPem.trim())}</pre>
        <div class="alert info">${ICONS.shield}<span>Tanam public key ini di kode aplikasi Billiard &amp; Kasir POS untuk memverifikasi License Key secara offline. <b>Private key</b> tersimpan hanya di volume data server (<code>license_private.pem</code>) — backup file ini, karena jika hilang semua key lama tidak bisa diverifikasi oleh key baru.</span></div>
      </div>
    </section>

    <section class="card stack">
      <h2>Endpoint untuk aplikasi client</h2>
      <div>
        <div class="endpoint"><span class="method post">POST</span><div><code>/api/v1/register</code><p>Body: <code>{ machine_id, product, store_name, phone?, app_version? }</code> — dipanggil saat aplikasi pertama kali dijalankan. Machine ID muncul di menu "Machine ID Masuk".</p></div></div>
        <div class="endpoint"><span class="method get">GET</span><div><code>/api/v1/check?machine_id=…&amp;product=…</code><p>Mengembalikan <code>status</code> (active, expiring, expired, locked, pending), <code>expires_at</code>, <code>license_key</code>, <code>grace_days</code>, dan <code>token</code> bertanda tangan. Panggil saat startup &amp; berkala.</p></div></div>
        <div class="endpoint"><span class="method post">POST</span><div><code>/api/v1/activate</code><p>Body: <code>{ machine_id, product, license_key }</code> — untuk key yang diketik manual oleh client.</p></div></div>
        <div class="endpoint"><span class="method get">GET</span><div><code>/api/v1/public-key</code><p>Public key dalam format PEM.</p></div></div>
      </div>
      <div class="muted small">Nilai <code>product</code>: ${Object.entries(s.products).map(([k, p]) => `<code>${k}</code> (${esc(p.name)})`).join(', ')}. ${s.clientApiKeyEnabled ? 'Sertakan header <code>X-VOCML-Key</code>.' : ''}</div>
      <pre class="code-block">curl -X POST ${esc(base)}/api/v1/register \\
  -H "Content-Type: application/json" \\
  -d '{"machine_id":"MID-7F3A-91C2-B8E4","product":"pos","store_name":"Toko Contoh"}'

curl "${esc(base)}/api/v1/check?machine_id=MID-7F3A-91C2-B8E4&amp;product=pos"</pre>
    </section>`;

  bindCopy(el);
}
