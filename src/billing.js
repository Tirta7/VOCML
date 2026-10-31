// Tagihan QRIS: pengaturan global, nominal per client, dan pembuatan gambar QR.
import QRCode from 'qrcode';
import { PRODUCTS } from './config.js';
import { q, enrich } from './db.js';
import { nowIso } from './dates.js';
import { buildDynamicQris, inspectQris, formatRupiah } from './qris.js';

export const MAX_AMOUNT = 10_000_000; // batas transaksi QRIS per transaksi

const DEFAULTS = {
  qris_payload: '',
  billing_note: 'Scan QRIS di atas untuk membayar perpanjangan lisensi. Setelah membayar, kirim bukti transfer ke admin.',
  billing_contact: '',
  ...Object.fromEntries(Object.keys(PRODUCTS).map((p) => [`price_${p}`, '0'])),
};

export function getSettings() {
  const rows = Object.fromEntries(q.allSettings.all().map((r) => [r.key, r.value]));
  return { ...DEFAULTS, ...rows };
}

export function saveSettings(patch) {
  const now = nowIso();
  for (const [k, v] of Object.entries(patch)) q.upsertSetting.run(k, String(v ?? ''), now);
  return getSettings();
}

/** Ringkasan pengaturan tagihan untuk dashboard. */
export function billingSettingsView(s = getSettings()) {
  const check = s.qris_payload ? inspectQris(s.qris_payload) : null;
  return {
    qris_payload: s.qris_payload,
    qris: check?.ok ? check.info : null,
    qris_error: check && !check.ok ? check.error : null,
    billing_note: s.billing_note,
    billing_contact: s.billing_contact,
    prices: Object.fromEntries(Object.keys(PRODUCTS).map((p) => [p, Number(s[`price_${p}`]) || 0])),
    max_amount: MAX_AMOUNT,
  };
}

/** Status yang memunculkan tagihan di aplikasi client. */
export const BILLING_STATUSES = ['expired', 'locked', 'pending'];

/** Mapping Paket Perpanjangan Lisensi berdasarkan nominal */
export const PACKAGES = [
  { days: 7, label: '7 Hari', name: 'Paket 7 Hari', basePrice: 20000 },
  { days: 14, label: '2 Minggu', name: 'Paket 2 Minggu', basePrice: 35000 },
  { days: 30, label: '1 Bulan', name: 'Paket 1 Bulan', basePrice: 60000 },
  { days: 90, label: '3 Bulan', name: 'Paket 3 Bulan', basePrice: 150000 },
  { days: 365, label: '1 Tahun', name: 'Paket 1 Tahun', basePrice: 500000 },
];

/** Tentukan paket durasi berdasarkan nominal uang (termasuk toleransi 3-digit kode unik) */
export function resolvePackageByAmount(amount) {
  const n = Number(amount) || 0;
  for (const pkg of PACKAGES) {
    if (n === pkg.basePrice || (n >= pkg.basePrice && n < pkg.basePrice + 1000)) {
      return pkg;
    }
  }
  // Toleransi rentang
  if (n >= 400000) return { days: 365, label: '1 Tahun', name: 'Paket 1 Tahun', basePrice: n };
  if (n >= 120000) return { days: 90, label: '3 Bulan', name: 'Paket 3 Bulan', basePrice: n };
  if (n >= 50000) return { days: 30, label: '1 Bulan', name: 'Paket 1 Bulan', basePrice: n };
  if (n >= 30000) return { days: 14, label: '2 Minggu', name: 'Paket 2 Minggu', basePrice: n };
  if (n >= 15000) return { days: 7, label: '7 Hari', name: 'Paket 7 Hari', basePrice: n };
  return { days: 30, label: '1 Bulan', name: `Paket Standar (${formatRupiah(n)})`, basePrice: n };
}

/**
 * Mengalokasikan kode unik (+1 s/d +999) otomatis untuk client yang menunggu pembayaran.
 * Setiap client yang sedang menunggu bayar dijamin memiliki nominal unik berbeda agar tidak bentrok.
 */
export function getOrAssignUniqueAmount(c, s = getSettings()) {
  const basePrice = Number(s[`price_${c.product}`]) || 0;
  if (!basePrice) return 0;

  // Jika client sudah memiliki nominal:
  if (c.billing_amount !== null && c.billing_amount !== undefined) {
    const current = Number(c.billing_amount) || 0;
    // Jika sudah ada kode unik di atas basePrice (+1 s/d +999), pertahankan agar nominal QR konsisten
    if (current >= basePrice && current < basePrice + 1000) {
      return current;
    }
    // Jika nominal khusus manual yang diatur admin, gunakan nominal tersebut
    if (current > 0) return current;
  }

  // Cari semua nominal yang saat ini sedang aktif digunakan oleh client lain yang menunggu pembayaran
  const allWaiting = q.allClients.all().map(enrich);
  const usedAmounts = new Set(
    allWaiting
      .filter((other) => other.id !== c.id && BILLING_STATUSES.includes(other.status) && other.billing_amount)
      .map((other) => Number(other.billing_amount))
  );

  // Cari kode 3 digit acak (1 s/d 999) yang belum terpakai
  const randomStart = Math.floor(Math.random() * 900) + 1;
  let assignedAmount = basePrice + 1;

  for (let i = 0; i < 999; i++) {
    const uniqueCode = ((randomStart + i - 1) % 999) + 1;
    const candidate = basePrice + uniqueCode;
    if (!usedAmounts.has(candidate)) {
      assignedAmount = candidate;
      break;
    }
  }

  // Simpan ke database jika client sudah tersimpan di DB
  if (c.id) {
    try {
      q.setBillingAmount.run({ id: c.id, billing_amount: assignedAmount, now: nowIso() });
      c.billing_amount = assignedAmount;
    } catch (err) {
      console.error('[billing] Gagal meng-assign kode unik:', err.message);
    }
  }

  return assignedAmount;
}

/** Nominal efektif untuk client: nominal unik otomatis, nominal khusus client, atau harga default produk. */
export function effectiveAmount(c, s = getSettings()) {
  if (c && c.id && BILLING_STATUSES.includes(c.status)) {
    return getOrAssignUniqueAmount(c, s);
  }
  if (c.billing_amount !== null && c.billing_amount !== undefined) return Number(c.billing_amount) || 0;
  return Number(s[`price_${c.product}`]) || 0;
}

/**
 * Data tagihan untuk aplikasi client. null bila tidak perlu ditampilkan
 * (lisensi masih aktif, QRIS belum diatur, atau nominal 0).
 * `c` = client yang sudah di-enrich (punya .status).
 */
export function billingFor(c, { baseUrl = '', force = false, amount = null } = {}) {
  if (!force && !BILLING_STATUSES.includes(c.status)) return null;
  const s = getSettings();
  const check = s.qris_payload ? inspectQris(s.qris_payload) : null;
  if (!check?.ok) return null;

  const reqN = amount ? Number(amount) : null;
  const targetAmount = (reqN && reqN > 0) ? reqN : effectiveAmount(c, s);
  if (!targetAmount || targetAmount > MAX_AMOUNT) return null;

  // Catat billing_orders temporary (status PENDING) ke database
  if (c.id && c.machine_id) {
    try {
      const existing = q.findPendingOrderByMidAndAmount.get(c.machine_id, targetAmount);
      if (!existing) {
        q.insertBillingOrder.run({
          client_id: c.id,
          machine_id: c.machine_id,
          product: c.product,
          amount: targetAmount,
          now: nowIso(),
        });
      }
    } catch (err) {
      console.error('[billing] Gagal mencatat temporary billing_order:', err.message);
    }
  }

  const qs = new URLSearchParams({ machine_id: c.machine_id, product: c.product, amount: String(targetAmount) });
  const pkg = resolvePackageByAmount(targetAmount);

  return {
    reason: c.status === 'locked' ? 'locked' : c.status === 'expired' ? 'expired' : c.status,
    amount: targetAmount,
    amount_text: formatRupiah(targetAmount),
    currency: 'IDR',
    package: pkg,
    merchant_name: check.info.merchant_name,
    merchant_city: check.info.merchant_city,
    qris: buildDynamicQris(s.qris_payload, targetAmount),
    qris_image_url: `${baseUrl}/api/v1/billing/qris.png?${qs}`,
    note: c.billing_note || s.billing_note,
    contact: s.billing_contact,
  };
}

/** Render payload QRIS menjadi PNG (Buffer). */
export function qrPng(payload, size = 512) {
  const width = Math.min(Math.max(Number(size) || 512, 160), 1024);
  return QRCode.toBuffer(payload, { type: 'png', errorCorrectionLevel: 'M', margin: 2, width });
}
