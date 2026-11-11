// Generator gambar Invoice & Kartu QRIS (PNG) menggunakan SVG + @resvg/resvg-js
import QRCode from 'qrcode';
import { Resvg } from '@resvg/resvg-js';
import { PRODUCTS } from './config.js';
import { formatRupiah } from './qris.js';

const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function escXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function fmtDateShortId(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return String(dateInput || '');
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtActiveUntilWib(dateInput = null) {
  const d = dateInput ? new Date(dateInput) : new Date(Date.now() + 7 * 86400 * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()} ${hh}:${mm} WIB`;
}

export function makeInvoiceNumber(client, date = new Date()) {
  const y = String(date.getFullYear()).slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const cid = String(client?.id || 1).padStart(5, '0');
  const rand = String((client?.unique_code || 108) * 1234567).slice(0, 7);
  return `INV-G${rand}${y}${m}${d}-${cid}`;
}

/**
 * Render logo QRIS & deretan ikon metode pembayaran dalam SVG
 */
function renderQrisHeaderLogo(cx, y) {
  // Logo teks QRIS bergaya resmi
  return `
    <g transform="translate(${cx - 34}, ${y})">
      <rect x="0" y="2" width="12" height="12" fill="none" stroke="#111827" stroke-width="2.4" rx="1.5"/>
      <rect x="3.5" y="5.5" width="5" height="5" fill="#111827"/>
      <text x="16" y="13" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14.5" font-weight="900" letter-spacing="0.8" fill="#111827">QRIS</text>
      <rect x="55" y="2" width="3" height="12" fill="#ef4444" rx="1"/>
    </g>
  `;
}

function renderPaymentBadges(x, y) {
  const badges = [
    { bg: '#00AED6', txt: 'go' },
    { bg: '#EE4D2D', txt: 'S' },
    { bg: '#4C3494', txt: 'O' },
    { bg: '#118EEA', txt: 'D' },
    { bg: '#005BAA', txt: 'BCA' },
    { bg: '#00529C', txt: 'BRI' },
    { bg: '#FFB700', txt: 'M' },
    { bg: '#F37021', txt: 'BNI' },
  ];
  let out = `<g transform="translate(${x}, ${y})">`;
  badges.forEach((b, i) => {
    const bx = i * 24;
    const fSize = b.txt.length > 2 ? 6.5 : 8.5;
    out += `
      <circle cx="${bx + 10}" cy="10" r="9.5" fill="${b.bg}"/>
      <text x="${bx + 10}" y="${10 + fSize * 0.36}" text-anchor="middle" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="${fSize}" font-weight="700" fill="#ffffff">${b.txt}</text>
    `;
  });
  out += `
    <text x="${badges.length * 24 + 4}" y="13.5" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="11" fill="#9CA3AF">+lainnya</text>
  </g>`;
  return out;
}

/**
 * Buat gambar INVOICE lengkap (PNG Buffer) sesuai desain referensi
 */
export async function generateInvoicePng({
  client,
  billing,
  pkg,
  settings = {},
  isPaid = false,
  invoiceNo = null,
  createdAt = new Date(),
}) {
  const now = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const invCode = invoiceNo || makeInvoiceNumber(client, now);
  const dateStr = fmtDateShortId(now);
  const activeUntilStr = fmtActiveUntilWib(
    client?.expires_at && new Date(client.expires_at) > now
      ? new Date(client.expires_at + 'T23:59:00')
      : new Date(now.getTime() + 7 * 86400 * 1000)
  );

  const senderName = settings.invoice_sender_name || 'Virtual Operation Control';
  const senderCity = settings.invoice_sender_city || 'sidoarjo';
  const senderWa = settings.billing_contact || settings.invoice_sender_wa || '08999748090';
  const senderSocial = settings.invoice_sender_social || '@virtualoperationcontrol';

  const bankName = settings.bank_name || 'BCA';
  const bankAcc = settings.bank_account_number || '3251622602';
  const bankHolder = settings.bank_account_holder || 'TIRTA ADITYA';

  const productLabel = PRODUCTS[client?.product]?.name || 'Aplikasi Billiard';
  const pkgLabel = pkg?.label || (pkg?.days === 30 ? '1 bulan' : `${pkg?.days || 30} hari`);

  const totalAmount = Number(billing?.amount || pkg?.amount || 0);
  const uniqueCode = Number(billing?.unique_code || client?.unique_code || 0);
  const originalBase = Number(pkg?.original_price || pkg?.basePrice || (totalAmount > uniqueCode ? totalAmount - uniqueCode : totalAmount));
  const promoBase = pkg?.promo_price ? Number(pkg.promo_price) : (totalAmount > uniqueCode ? totalAmount - uniqueCode : totalAmount);
  const discount = originalBase > promoBase ? originalBase - promoBase : 0;

  // Generate QRIS Data URL
  let qrDataUrl = '';
  if (billing?.qris) {
    qrDataUrl = await QRCode.toDataURL(billing.qris, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 300,
      color: { dark: '#111827', light: '#FFFFFF' },
    });
  }

  const width = 800;
  const height = 1140;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#FFFFFF"/>

  <!-- Judul INVOICE -->
  <text x="${width / 2}" y="66" text-anchor="middle" font-family="DejaVu Serif, Georgia, Times New Roman, serif" font-size="24" font-weight="700" letter-spacing="2.5" fill="#1F2937">INVOICE</text>

  <!-- Nomor Invoice & Tanggal -->
  <text x="48" y="114" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15" fill="#6B7280">${escXml(invCode)}</text>
  <text x="${width - 48}" y="114" text-anchor="end" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15" fill="#6B7280">${escXml(dateStr)}</text>
  <line x1="48" y1="132" x2="${width - 48}" y2="132" stroke="#E5E7EB" stroke-width="1" stroke-dasharray="3,3"/>

  <!-- Kolom Kiri: Pengirim -->
  <text x="48" y="168" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="16" font-weight="700" fill="#15803D">${escXml(senderName)}</text>
  <text x="48" y="194" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14" fill="#6B7280">${escXml(senderCity)}</text>
  <text x="48" y="218" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14" fill="#6B7280">WhatsApp: ${escXml(senderWa)}</text>
  <text x="48" y="242" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14" fill="#6B7280">Youtube: ${escXml(senderSocial)}</text>

  <!-- Kolom Kanan: Ditagihkan ke -->
  <text x="405" y="168" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15" font-weight="700" fill="#374151">Ditagihkan ke:</text>
  <text x="405" y="194" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14.5" fill="#6B7280">${escXml(client?.name || 'Pelanggan')}</text>
  <text x="405" y="218" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14" fill="#6B7280">Nomor HP: ${escXml(client?.phone || '-')}</text>
  <text x="405" y="242" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14" fill="#6B7280">Tipe pembelian: Diambil langsung</text>

  <text x="405" y="274" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15" font-weight="700" fill="#374151">Pesanan untuk tanggal:</text>
  <text x="405" y="296" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14" fill="#6B7280">${escXml(dateStr)}</text>

  <!-- Detail Pesanan -->
  <text x="48" y="348" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15.5" font-weight="700" fill="#374151">Detail pesanan</text>

  <!-- Item 1 -->
  <text x="48" y="386" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15" fill="#4B5563">Lisensi Perpanjangan Software ${escXml(productLabel)} ( ${escXml(pkgLabel.toLowerCase())} ) × 1</text>
  <text x="${width - 48}" y="386" text-anchor="end" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15" fill="#4B5563">${escXml(formatRupiah(originalBase))}</text>
  <line x1="48" y1="406" x2="${width - 48}" y2="406" stroke="#E5E7EB" stroke-width="1" stroke-dasharray="3,3"/>

  <!-- Item 2 -->
  <text x="48" y="436" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15" fill="#4B5563">Maintenance rutin ${escXml(pkgLabel.toLowerCase())} × 1</text>
  <text x="${width - 48}" y="436" text-anchor="end" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15" fill="#4B5563">Rp0</text>
  <line x1="48" y1="456" x2="${width - 48}" y2="456" stroke="#E5E7EB" stroke-width="1" stroke-dasharray="3,3"/>

  <!-- Item 3 -->
  <text x="48" y="486" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15" fill="#4B5563">akomodasi &amp; transportasi × 1</text>
  <text x="${width - 48}" y="486" text-anchor="end" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15" fill="#4B5563">Rp0</text>
  <line x1="48" y1="506" x2="${width - 48}" y2="506" stroke="#E5E7EB" stroke-width="1" stroke-dasharray="3,3"/>

  <!-- Subtotal -->
  <text x="48" y="544" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15" fill="#4B5563">Subtotal</text>
  <text x="${width - 48}" y="544" text-anchor="end" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15" fill="#4B5563">${escXml(formatRupiah(originalBase))}</text>

  <!-- Diskon / Kode Unik -->
  ${discount > 0 ? `
    <text x="48" y="574" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15" fill="#4B5563">Diskon</text>
    <text x="${width - 48}" y="574" text-anchor="end" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15" fill="#4B5563">-${escXml(formatRupiah(discount))}</text>
  ` : ''}
  ${uniqueCode > 0 ? `
    <text x="48" y="${discount > 0 ? 602 : 574}" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15" fill="#4B5563">Kode Unik Verifikasi Otomatis</text>
    <text x="${width - 48}" y="${discount > 0 ? 602 : 574}" text-anchor="end" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15" fill="#4B5563">+Rp${escXml(String(uniqueCode))}</text>
  ` : ''}

  <line x1="48" y1="620" x2="${width - 48}" y2="620" stroke="#E5E7EB" stroke-width="1" stroke-dasharray="3,3"/>

  <!-- TOTAL -->
  <text x="48" y="650" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="16.5" font-weight="700" fill="#1F2937">TOTAL</text>
  <text x="${width - 48}" y="650" text-anchor="end" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="17" font-weight="700" fill="#1F2937">${escXml(formatRupiah(totalAmount))}</text>

  ${isPaid ? `
    <!-- Stempel LUNAS -->
    <g transform="translate(540, 520) rotate(-10)">
      <rect x="0" y="0" width="160" height="50" rx="8" fill="#DCFCE7" fill-opacity="0.85" stroke="#16A34A" stroke-width="3"/>
      <text x="80" y="33" text-anchor="middle" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="24" font-weight="900" letter-spacing="3" fill="#15803D">LUNAS</text>
    </g>
  ` : ''}

  <!-- Kotak Pembayaran Bawah -->
  <rect x="48" y="684" width="${width - 96}" height="356" rx="16" fill="#F3F4F6"/>

  <!-- Kartu QRIS Putih di Sisi Kiri -->
  <rect x="68" y="704" width="268" height="284" rx="14" fill="#FFFFFF"/>
  <!-- Aksen Merah Kiri & Kanan Bawah ala GPN/QRIS -->
  <polygon points="68,768 82,782 82,952 68,952" fill="#DC2626"/>
  <polygon points="336,920 322,934 322,974 282,974 268,988 336,988" fill="#DC2626"/>

  ${renderQrisHeaderLogo(202, 718)}

  ${qrDataUrl ? `<image x="96" y="744" width="212" height="212" href="${qrDataUrl}"/>` : `
    <rect x="96" y="744" width="212" height="212" rx="8" fill="#F9FAFB" stroke="#E5E7EB"/>
    <text x="202" y="854" text-anchor="middle" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="13" fill="#9CA3AF">QRIS Belum Diatur</text>
  `}

  <!-- Deretan Ikon Metode Pembayaran di Bawah Kartu QRIS -->
  ${renderPaymentBadges(68, 1002)}

  <!-- Informasi Pembayaran di Sisi Kanan -->
  <text x="364" y="726" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15" font-weight="700" fill="#374151">Scan QRIS untuk membayar.</text>
  <text x="364" y="748" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15" font-weight="700" fill="#374151">Mendukung semua bank &amp; e-wallet.</text>

  <text x="364" y="782" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="13" fill="#6B7280">Kode QR aktif hingga <tspan font-weight="700" fill="#374151">${escXml(activeUntilStr)}</tspan></text>

  <text x="364" y="832" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14" font-weight="700" fill="#374151">atau transfer ke:</text>

  <!-- Kotak Info Rekening Bank -->
  <rect x="364" y="846" width="364" height="104" rx="10" fill="#E5E7EB"/>
  <text x="382" y="876" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14" font-weight="700" fill="#1F2937">${escXml(bankName)}</text>
  <text x="382" y="902" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14.5" font-weight="700" fill="#1F2937">${escXml(bankAcc)}</text>
  <text x="382" y="928" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14" font-weight="700" fill="#1F2937">${escXml(bankHolder)}</text>

  <!-- Footer Didukung Oleh -->
  <text x="${width / 2}" y="1080" text-anchor="middle" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="12" fill="#9CA3AF">Didukung oleh</text>
  <g transform="translate(${width / 2 - 78}, 1090)">
    <rect x="0" y="3" width="18" height="14" rx="3" fill="#9CA3AF"/>
    <circle cx="13" cy="10" r="2" fill="#FFFFFF"/>
    <text x="24" y="15" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15" font-weight="700" fill="#6B7280">gopay</text>
    <text x="72" y="15" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15" fill="#9CA3AF">merchant</text>
  </g>
</svg>`;

  const resvg = new Resvg(svg, {
    background: '#FFFFFF',
    font: {
      loadSystemFonts: true,
      defaultFontFamily: 'DejaVu Sans',
    },
  });
  return resvg.render().asPng();
}

/**
 * Buat gambar Kartu QRIS Standalone (PNG Buffer) sesuai bubble ke-2 pada screenshot WhatsApp
 */
export async function generateQrisCardPng({
  client,
  billing,
  pkg,
  settings = {},
  createdAt = new Date(),
}) {
  const now = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const activeUntilStr = fmtActiveUntilWib(
    client?.expires_at && new Date(client.expires_at) > now
      ? new Date(client.expires_at + 'T23:59:00')
      : new Date(now.getTime() + 7 * 86400 * 1000)
  );
  const senderName = settings.invoice_sender_name || 'Virtual Operation Control';
  const totalAmount = Number(billing?.amount || pkg?.amount || 0);

  let qrDataUrl = '';
  if (billing?.qris) {
    qrDataUrl = await QRCode.toDataURL(billing.qris, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 380,
      color: { dark: '#111827', light: '#FFFFFF' },
    });
  }

  const width = 680;
  const height = 780;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="24" fill="#F9FAFB"/>

  <!-- Nama Merchant & Nominal -->
  <text x="${width / 2}" y="58" text-anchor="middle" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#15803D">${escXml(senderName)}</text>
  <text x="${width / 2}" y="106" text-anchor="middle" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="36" font-weight="900" fill="#111827">${escXml(formatRupiah(totalAmount))}</text>

  <!-- Kotak Putih QRIS -->
  <rect x="148" y="138" width="384" height="394" rx="18" fill="#FFFFFF" stroke="#F3F4F6" stroke-width="2"/>
  <!-- Aksen Merah Kiri & Kanan Bawah -->
  <polygon points="148,225 168,245 168,480 148,480" fill="#DC2626"/>
  <polygon points="532,430 512,450 512,512 450,512 430,532 532,532" fill="#DC2626"/>

  ${renderQrisHeaderLogo(width / 2, 158)}

  ${qrDataUrl ? `<image x="186" y="192" width="308" height="308" href="${qrDataUrl}"/>` : ''}

  <!-- Info Masa Aktif & Instruksi Scan -->
  <text x="${width / 2}" y="572" text-anchor="middle" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15.5" font-weight="700" fill="#4B5563">Kode QR aktif hingga ${escXml(activeUntilStr)}</text>

  <text x="${width / 2}" y="610" text-anchor="middle" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15.5" fill="#6B7280">Scan/upload QRIS untuk membayar.</text>
  <text x="${width / 2}" y="632" text-anchor="middle" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15.5" fill="#6B7280">Mendukung semua bank &amp; e-wallet.</text>

  <!-- Deretan Ikon Pembayaran -->
  ${renderPaymentBadges(width / 2 - 125, 654)}

  <line x1="44" y1="700" x2="${width - 44}" y2="700" stroke="#E5E7EB" stroke-width="1"/>

  <!-- Footer -->
  <text x="${width / 2}" y="728" text-anchor="middle" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="12" fill="#9CA3AF">Didukung oleh</text>
  <g transform="translate(${width / 2 - 78}, 738)">
    <rect x="0" y="3" width="18" height="14" rx="3" fill="#9CA3AF"/>
    <circle cx="13" cy="10" r="2" fill="#FFFFFF"/>
    <text x="24" y="15" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15" font-weight="700" fill="#6B7280">gopay</text>
    <text x="72" y="15" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15" fill="#9CA3AF">merchant</text>
  </g>
</svg>`;

  const resvg = new Resvg(svg, {
    background: '#F9FAFB',
    font: {
      loadSystemFonts: true,
      defaultFontFamily: 'DejaVu Sans',
    },
  });
  return resvg.render().asPng();
}

/**
 * Buat teks caption WhatsApp sesuai contoh gambar referensi
 */
export function buildInvoiceCaption({
  client,
  billing,
  pkg,
  settings = {},
  isPaid = false,
  expiresAt = null,
  reminderStage = null,
}) {
  const clientName = client?.name || 'Pelanggan';
  const totalText = formatRupiah(billing?.amount || pkg?.amount || 0);
  const bankName = settings.bank_name || 'BCA';
  const bankAcc = settings.bank_account_number || '3251622602';
  const bankHolder = settings.bank_account_holder || 'TIRTA ADITYA';
  const senderName = settings.invoice_sender_name || 'GoPay Merchant';

  if (isPaid) {
    const expStr = fmtDateShortId(expiresAt || client?.expires_at || new Date());
    return [
      `Halo, ${clientName} 😊`,
      ``,
      `Terima kasih! Pembayaran lisensi sebesar *${totalText}* telah kami terima dan diverifikasi.`,
      ``,
      `✅ *Status Lisensi:* Aktif (LUNAS)`,
      `📦 *Paket:* ${pkg?.name || pkg?.label || 'Perpanjangan Lisensi'}`,
      `📅 *Berlaku Sampai:* ${expStr}`,
      ``,
      `Terima kasih sudah berlangganan layanan *${settings.invoice_sender_name || 'Virtual Operation Control'}*!`,
    ].join('\n');
  }

  let stageNotice = '';
  if (reminderStage === 'H-0') {
    stageNotice = `\n⚠️ *Info Lisensi:* Masa aktif lisensi aplikasi Anda berakhir hari ini (${fmtDateShortId(client?.expires_at)}). Lakukan pembayaran agar aplikasi tetap aktif tanpa kendala.\n`;
  } else if (reminderStage === 'H-1') {
    stageNotice = `\n⏰ *Pengingat H-1:* Masa aktif lisensi aplikasi Anda akan berakhir besok (${fmtDateShortId(client?.expires_at)}).\n`;
  } else if (reminderStage === 'H-3' && client?.expires_at) {
    stageNotice = `\n📅 *Pengingat Perpanjangan:* Masa aktif lisensi aplikasi Anda berakhir pada ${fmtDateShortId(client.expires_at)}.\n`;
  }

  return [
    `Halo, ${clientName} 😊`,
    stageNotice,
    `Ini invoice pesanannya, ya. Total pembayarannya: ${totalText}.`,
    ``,
    `💙 Paling praktis, bayar langsung pakai QRIS`,
    `Download & upload QRIS terlampir di aplikasi bank atau e-wallet untuk menyelesaikan pembayaran.`,
    ``,
    `🏦 Mau transfer saja?`,
    `Transfer ke rekening berikut:`,
    `${bankName} ${bankAcc} a.n. ${bankHolder}`,
    ``,
    `Terima kasih sudah belanja!`,
    `_______________________________`,
    `QRIS diterbitkan oleh ${senderName}`,
  ].filter((line) => line !== null).join('\n');
}

