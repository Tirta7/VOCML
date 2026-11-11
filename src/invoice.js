// Generator gambar Invoice & Kartu QRIS (PNG) menggunakan SVG + @resvg/resvg-js
import QRCode from 'qrcode';
import { Resvg } from '@resvg/resvg-js';
import { PRODUCTS } from './config.js';
import { formatRupiah } from './qris.js';

const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTHS_FULL_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function escXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function capitalizeWords(str) {
  return String(str || '')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function fmtDateShortId(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return String(dateInput || '');
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtDateLongId(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return String(dateInput || '');
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_FULL_ID[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtActiveUntilWib(dateInput = null) {
  const d = dateInput ? new Date(dateInput) : new Date(Date.now() + 3 * 86400 * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()} ${hh}:${mm} WIB`;
}

export function makeInvoiceNumber(client, date = new Date()) {
  const y = String(date.getFullYear());
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const cid = String(client?.id || 1).padStart(4, '0');
  const ucode = String(client?.unique_code || 100).padStart(3, '0');
  return `INV/VOC/${y}${m}${d}/${cid}-${ucode}`;
}

/**
 * Format label durasi paket agar tampil profesional (misal "30 Hari" -> "1 Bulan")
 */
export function formatPackageDurationLabel(pkg) {
  const days = Number(pkg?.days) || 30;
  if (days === 30) return '1 Bulan';
  if (days === 60) return '2 Bulan';
  if (days === 90) return '3 Bulan';
  if (days === 180) return '6 Bulan';
  if (days === 365) return '1 Tahun';
  if (days === 14) return '14 Hari';
  if (days === 7) return '7 Hari';
  return `${days} Hari`;
}

/**
 * Render logo QRIS di atas kode QR
 */
function renderQrisHeaderLogo(cx, y) {
  return `
    <g transform="translate(${cx - 36}, ${y})">
      <rect x="0" y="2" width="12" height="12" fill="none" stroke="#111827" stroke-width="2.4" rx="1.5"/>
      <rect x="3.5" y="5.5" width="5" height="5" fill="#111827"/>
      <text x="17" y="13" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14.5" font-weight="900" letter-spacing="1" fill="#111827">QRIS</text>
      <rect x="61" y="2" width="3.2" height="12" fill="#DC2626" rx="1"/>
    </g>
  `;
}

/**
 * Render deretan badge metode pembayaran
 */
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
    <text x="${badges.length * 24 + 5}" y="13.5" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="11" fill="#9CA3AF">+lainnya</text>
  </g>`;
  return out;
}

/**
 * Render footer "Didukung oleh VOCMerchant" yang rapi & profesional
 */
function renderVocMerchantFooter(cx, y) {
  return `
    <text x="${cx}" y="${y}" text-anchor="middle" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="11.5" fill="#9CA3AF">Didukung oleh</text>
    <g transform="translate(${cx}, ${y + 22})">
      <rect x="-78" y="-13" width="20" height="16" rx="4" fill="#15803D"/>
      <path d="M-72 -5 L-69 -2 L-63 -8" stroke="#FFFFFF" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="-52" y="0" text-anchor="start" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15.5" fill="#374151">
        <tspan font-weight="800" fill="#15803D">VOC</tspan><tspan font-weight="600" fill="#6B7280">Merchant</tspan>
      </text>
    </g>
  `;
}

/**
 * Buat gambar INVOICE lengkap (PNG Buffer) yang rapi & profesional
 */
export async function generateInvoicePng({
  client,
  billing,
  pkg,
  settings = {},
  isPaid = false,
  invoiceNo = null,
  createdAt = new Date(),
  customDate = null,
  customDiscount = null,
  customItem1 = null,
  customItem2 = null,
  customItem3 = null,
}) {
  const now = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const invCode = invoiceNo || makeInvoiceNumber(client, now);
  const dateObj = customDate ? new Date(customDate) : now;
  const dateStr = fmtDateLongId(Number.isNaN(dateObj.getTime()) ? now : dateObj);
  const expiryDateStr = client?.expires_at ? fmtDateLongId(client.expires_at) : dateStr;
  const qrActiveUntilStr = fmtActiveUntilWib(new Date(now.getTime() + 3 * 86400 * 1000));

  const senderName = settings.invoice_sender_name || 'Virtual Operation Control';
  const senderCity = capitalizeWords(settings.invoice_sender_city || 'Sidoarjo');
  const senderWa = settings.billing_contact || settings.invoice_sender_wa || '08999748090';
  const senderSocial = settings.invoice_sender_social || '@virtualoperationcontrol';

  const bankName = settings.bank_name || 'BCA';
  const bankAcc = settings.bank_account_number || '3251622602';
  const bankHolder = settings.bank_account_holder || 'TIRTA ADITYA';

  const productLabel = PRODUCTS[client?.product]?.name || 'Aplikasi Billiard';
  const pkgDurationLabel = formatPackageDurationLabel(pkg);

  const totalAmount = Number(billing?.amount || pkg?.amount || 0);
  const uniqueCode = Number(billing?.unique_code || client?.unique_code || 0);
  const netBeforeCode = totalAmount > uniqueCode ? totalAmount - uniqueCode : totalAmount;

  // Hitung harga dasar & diskon secara proporsional (hindari diskon ekstrem dari paket tes Rp1)
  let subtotalAmount = netBeforeCode;
  let discount = 0;

  if (customDiscount !== null && customDiscount !== undefined && Number(customDiscount) > 0) {
    discount = Number(customDiscount);
    subtotalAmount = netBeforeCode + discount;
  } else {
    const rawOriginal = Number(pkg?.original_price || pkg?.basePrice || netBeforeCode);
    // Hanya tampilkan selisih harga normal sebagai diskon apabila harga paket >= Rp10.000 dan diskon wajar (<= 60%)
    if (netBeforeCode >= 10000 && rawOriginal > netBeforeCode && (rawOriginal - netBeforeCode) <= rawOriginal * 0.6) {
      subtotalAmount = rawOriginal;
      discount = rawOriginal - netBeforeCode;
    }
  }

  const item1Title = customItem1 || `Lisensi Perpanjangan Software ${productLabel} (${pkgDurationLabel}) × 1`;
  const item2Title = customItem2 || `Maintenance Rutin & Pembaruan Sistem (${pkgDurationLabel}) × 1`;
  const item3Title = customItem3 || `Sinkronisasi Lisensi Cloud & Dukungan Teknis × 1`;

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
  const height = 1150;

  // Hitung koordinat vertikal baris ringkasan harga agar selalu presisi
  let summaryY = 540;
  const subtotalY = summaryY;
  summaryY += 30;

  let discountRowSvg = '';
  if (discount > 0) {
    discountRowSvg = `
      <text x="48" y="${summaryY}" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14.5" fill="#15803D">Diskon Promo</text>
      <text x="${width - 48}" y="${summaryY}" text-anchor="end" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14.5" font-weight="600" fill="#15803D">-${escXml(formatRupiah(discount))}</text>
    `;
    summaryY += 30;
  }

  let uniqueCodeRowSvg = '';
  if (uniqueCode > 0 && totalAmount > uniqueCode) {
    uniqueCodeRowSvg = `
      <text x="48" y="${summaryY}" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14.5" fill="#4B5563">Kode Unik Verifikasi Otomatis</text>
      <text x="${width - 48}" y="${summaryY}" text-anchor="end" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14.5" fill="#4B5563">+Rp${escXml(String(uniqueCode))}</text>
    `;
    summaryY += 22;
  }

  const totalLineY = summaryY + 4;
  const totalTextY = totalLineY + 32;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#FFFFFF"/>

  <!-- Garis Aksen Atas Profesional -->
  <rect x="0" y="0" width="${width}" height="6" fill="#15803D"/>

  <!-- Judul INVOICE -->
  <text x="${width / 2}" y="64" text-anchor="middle" font-family="DejaVu Serif, Georgia, Times New Roman, serif" font-size="25" font-weight="700" letter-spacing="3" fill="#111827">INVOICE</text>

  <!-- Nomor Invoice & Tanggal Terbit -->
  <text x="48" y="110" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14" font-weight="600" fill="#4B5563">${escXml(invCode)}</text>
  <text x="${width - 48}" y="110" text-anchor="end" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14" fill="#6B7280">Tanggal: <tspan font-weight="600" fill="#374151">${escXml(dateStr)}</tspan></text>
  <line x1="48" y1="128" x2="${width - 48}" y2="128" stroke="#E5E7EB" stroke-width="1.2" stroke-dasharray="4,4"/>

  <!-- Kolom Kiri: Diterbitkan Oleh -->
  <text x="48" y="164" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="16.5" font-weight="700" fill="#15803D">${escXml(senderName)}</text>
  <text x="48" y="190" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="13.5" fill="#6B7280">${escXml(senderCity)} · Indonesia</text>
  <text x="48" y="214" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="13.5" fill="#6B7280">WhatsApp: ${escXml(senderWa)}</text>
  <text x="48" y="238" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="13.5" fill="#6B7280">YouTube: ${escXml(senderSocial)}</text>

  <!-- Kolom Kanan: Ditagihkan Ke -->
  <text x="410" y="164" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14.5" font-weight="700" fill="#1F2937">Ditagihkan kepada:</text>
  <text x="410" y="188" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14.5" font-weight="700" fill="#374151">${escXml(client?.name || 'Pelanggan')}</text>
  <text x="410" y="210" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="13.5" fill="#6B7280">Machine ID: <tspan font-weight="600" fill="#4B5563">${escXml(client?.machine_id || '-')}</tspan></text>
  <text x="410" y="232" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="13.5" fill="#6B7280">No. WhatsApp: ${escXml(client?.phone || '-')}</text>

  <text x="410" y="264" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14" font-weight="700" fill="#1F2937">Jatuh Tempo / Batas Masa Aktif:</text>
  <text x="410" y="286" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="13.5" font-weight="600" fill="#15803D">${escXml(expiryDateStr)} (Aktivasi Otomatis)</text>

  <!-- Header Tabel Detail Pesanan -->
  <rect x="48" y="316" width="${width - 96}" height="36" rx="6" fill="#F9FAFB" stroke="#E5E7EB" stroke-width="1"/>
  <text x="62" y="339" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="13.5" font-weight="700" fill="#374151">DETAIL PESANAN &amp; LAYANAN LISENSI</text>
  <text x="${width - 62}" y="339" text-anchor="end" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="13.5" font-weight="700" fill="#374151">HARGA</text>

  <!-- Item 1: Lisensi Utama -->
  <text x="48" y="382" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14.5" font-weight="600" fill="#1F2937">${escXml(item1Title)}</text>
  <text x="${width - 48}" y="382" text-anchor="end" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14.5" font-weight="600" fill="#1F2937">${escXml(formatRupiah(subtotalAmount))}</text>
  <line x1="48" y1="402" x2="${width - 48}" y2="402" stroke="#E5E7EB" stroke-width="1" stroke-dasharray="3,3"/>

  <!-- Item 2: Maintenance -->
  <text x="48" y="434" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14.5" fill="#4B5563">${escXml(item2Title)}</text>
  <text x="${width - 48}" y="434" text-anchor="end" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14.5" fill="#6B7280">Rp0</text>
  <line x1="48" y1="454" x2="${width - 48}" y2="454" stroke="#E5E7EB" stroke-width="1" stroke-dasharray="3,3"/>

  <!-- Item 3: Cloud Sync & Support -->
  <text x="48" y="486" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14.5" fill="#4B5563">${escXml(item3Title)}</text>
  <text x="${width - 48}" y="486" text-anchor="end" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14.5" fill="#6B7280">Rp0</text>
  <line x1="48" y1="506" x2="${width - 48}" y2="506" stroke="#E5E7EB" stroke-width="1" stroke-dasharray="3,3"/>

  <!-- Subtotal, Diskon, Kode Unik -->
  <text x="48" y="${subtotalY}" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14.5" fill="#4B5563">Subtotal</text>
  <text x="${width - 48}" y="${subtotalY}" text-anchor="end" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14.5" fill="#374151">${escXml(formatRupiah(subtotalAmount))}</text>

  ${discountRowSvg}
  ${uniqueCodeRowSvg}

  <line x1="48" y1="${totalLineY}" x2="${width - 48}" y2="${totalLineY}" stroke="#D1D5DB" stroke-width="1.5"/>

  <!-- TOTAL -->
  <text x="48" y="${totalTextY}" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="16.5" font-weight="800" fill="#111827">TOTAL PEMBAYARAN</text>
  <text x="${width - 48}" y="${totalTextY}" text-anchor="end" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="18" font-weight="800" fill="#15803D">${escXml(formatRupiah(totalAmount))}</text>

  ${isPaid ? `
    <!-- Stempel LUNAS -->
    <g transform="translate(530, 515) rotate(-10)">
      <rect x="0" y="0" width="165" height="52" rx="8" fill="#DCFCE7" fill-opacity="0.9" stroke="#16A34A" stroke-width="3"/>
      <text x="82.5" y="34" text-anchor="middle" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="24" font-weight="900" letter-spacing="3" fill="#15803D">LUNAS</text>
    </g>
  ` : ''}

  <!-- Kotak Pembayaran Bawah -->
  <rect x="48" y="688" width="${width - 96}" height="356" rx="16" fill="#F3F4F6"/>

  <!-- Kartu QRIS Putih di Sisi Kiri -->
  <rect x="68" y="708" width="268" height="284" rx="14" fill="#FFFFFF"/>
  <!-- Aksen Merah Kiri & Kanan Bawah ala GPN/QRIS -->
  <polygon points="68,772 82,786 82,956 68,956" fill="#DC2626"/>
  <polygon points="336,924 322,938 322,978 282,978 268,992 336,992" fill="#DC2626"/>

  ${renderQrisHeaderLogo(202, 722)}

  ${qrDataUrl ? `<image x="96" y="748" width="212" height="212" href="${qrDataUrl}"/>` : `
    <rect x="96" y="748" width="212" height="212" rx="8" fill="#F9FAFB" stroke="#E5E7EB"/>
    <text x="202" y="858" text-anchor="middle" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="13" fill="#9CA3AF">QRIS Belum Diatur</text>
  `}

  <!-- Deretan Ikon Metode Pembayaran di Bawah Kartu QRIS -->
  ${renderPaymentBadges(68, 1006)}

  <!-- Informasi Pembayaran di Sisi Kanan -->
  <text x="364" y="732" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15" font-weight="700" fill="#1F2937">Scan QRIS untuk membayar otomatis.</text>
  <text x="364" y="754" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14" font-weight="600" fill="#4B5563">Mendukung semua aplikasi M-Banking &amp; E-Wallet.</text>

  <text x="364" y="786" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="13" fill="#6B7280">Kode QR aktif hingga <tspan font-weight="700" fill="#374151">${escXml(qrActiveUntilStr)}</tspan></text>

  <text x="364" y="832" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14" font-weight="700" fill="#374151">atau transfer manual ke rekening:</text>

  <!-- Kotak Info Rekening Bank -->
  <rect x="364" y="846" width="364" height="108" rx="10" fill="#E5E7EB"/>
  <text x="382" y="876" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="14" font-weight="700" fill="#111827">BANK ${escXml(bankName)}</text>
  <text x="382" y="902" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15.5" font-weight="800" fill="#15803D">${escXml(bankAcc)}</text>
  <text x="382" y="928" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="13.5" font-weight="700" fill="#374151">a.n. ${escXml(bankHolder)}</text>

  <!-- Footer Didukung Oleh VOCMerchant -->
  ${renderVocMerchantFooter(width / 2, 1084)}
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
 * Buat gambar Kartu QRIS Standalone (PNG Buffer) dengan branding VOCMerchant
 */
export async function generateQrisCardPng({
  client,
  billing,
  pkg,
  settings = {},
  createdAt = new Date(),
}) {
  const now = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const qrActiveUntilStr = fmtActiveUntilWib(new Date(now.getTime() + 3 * 86400 * 1000));
  const senderName = settings.invoice_sender_name || 'Virtual Operation Control';
  const totalAmount = Number(billing?.amount || pkg?.amount || 0);
  const pkgDurationLabel = formatPackageDurationLabel(pkg);

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
  const height = 790;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="24" fill="#F9FAFB"/>

  <!-- Nama Merchant & Nominal -->
  <text x="${width / 2}" y="54" text-anchor="middle" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#15803D">${escXml(senderName)}</text>
  <text x="${width / 2}" y="102" text-anchor="middle" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="36" font-weight="900" fill="#111827">${escXml(formatRupiah(totalAmount))}</text>
  <text x="${width / 2}" y="126" text-anchor="middle" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="13.5" font-weight="600" fill="#6B7280">${escXml(client?.name || 'Pelanggan')} · Paket ${escXml(pkgDurationLabel)}</text>

  <!-- Kotak Putih QRIS -->
  <rect x="148" y="146" width="384" height="394" rx="18" fill="#FFFFFF" stroke="#E5E7EB" stroke-width="1.5"/>
  <!-- Aksen Merah Kiri & Kanan Bawah -->
  <polygon points="148,233 168,253 168,488 148,488" fill="#DC2626"/>
  <polygon points="532,438 512,458 512,520 450,520 430,540 532,540" fill="#DC2626"/>

  ${renderQrisHeaderLogo(width / 2, 166)}

  ${qrDataUrl ? `<image x="186" y="200" width="308" height="308" href="${qrDataUrl}"/>` : ''}

  <!-- Info Masa Aktif & Instruksi Scan -->
  <text x="${width / 2}" y="578" text-anchor="middle" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15" font-weight="700" fill="#374151">Kode QR aktif hingga ${escXml(qrActiveUntilStr)}</text>

  <text x="${width / 2}" y="614" text-anchor="middle" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15" fill="#6B7280">Scan/upload QRIS untuk membayar.</text>
  <text x="${width / 2}" y="636" text-anchor="middle" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="15" fill="#6B7280">Mendukung semua bank &amp; e-wallet.</text>

  <!-- Deretan Ikon Pembayaran -->
  ${renderPaymentBadges(width / 2 - 125, 658)}

  <line x1="44" y1="704" x2="${width - 44}" y2="704" stroke="#E5E7EB" stroke-width="1"/>

  <!-- Footer Didukung oleh VOCMerchant -->
  ${renderVocMerchantFooter(width / 2, 732)}
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
 * Buat teks caption WhatsApp dengan branding VOCMerchant
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

  if (isPaid) {
    const expStr = fmtDateLongId(expiresAt || client?.expires_at || new Date());
    return [
      `Halo, ${clientName} 😊`,
      ``,
      `Terima kasih! Pembayaran lisensi sebesar *${totalText}* telah kami terima dan diverifikasi.`,
      ``,
      `✅ *Status Lisensi:* Aktif (LUNAS)`,
      `📦 *Paket:* ${pkg?.name || formatPackageDurationLabel(pkg)}`,
      `📅 *Berlaku Sampai:* ${expStr}`,
      ``,
      `Terima kasih sudah berlangganan layanan *${settings.invoice_sender_name || 'Virtual Operation Control'}*!`,
      `_______________________________`,
      `QRIS diterbitkan oleh VOCMerchant`,
    ].join('\n');
  }

  let stageNotice = '';
  if (reminderStage === 'H-0') {
    stageNotice = `\n⚠️ *Info Lisensi:* Masa aktif lisensi aplikasi Anda berakhir hari ini (${fmtDateLongId(client?.expires_at)}). Lakukan pembayaran agar aplikasi tetap aktif tanpa kendala.\n`;
  } else if (reminderStage === 'H-1') {
    stageNotice = `\n⏰ *Pengingat H-1:* Masa aktif lisensi aplikasi Anda akan berakhir besok (${fmtDateLongId(client?.expires_at)}).\n`;
  } else if (reminderStage === 'H-3' && client?.expires_at) {
    stageNotice = `\n📅 *Pengingat Perpanjangan:* Masa aktif lisensi aplikasi Anda berakhir pada ${fmtDateLongId(client.expires_at)}.\n`;
  }

  return [
    `Halo, ${clientName} 😊`,
    stageNotice,
    `Ini invoice pesanannya, ya. Total pembayarannya: *${totalText}*.`,
    ``,
    `💙 Paling praktis, bayar langsung pakai QRIS`,
    `Download & upload QRIS terlampir di aplikasi bank atau e-wallet untuk menyelesaikan pembayaran.`,
    ``,
    `🏦 Mau transfer saja?`,
    `Transfer ke rekening berikut:`,
    `${bankName} ${bankAcc} a.n. ${bankHolder}`,
    ``,
    `Terima kasih sudah berlangganan!`,
    `_______________________________`,
    `QRIS diterbitkan oleh VOCMerchant`,
  ].filter((line) => line !== '').join('\n').replace(/\n{3,}/g, '\n\n');
}
