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
  billing_contact: '08999748090',
  bank_name: 'BCA',
  bank_account_number: '3251622602',
  bank_account_holder: 'TIRTA ADITYA',
  invoice_sender_name: 'Virtual Operation Control',
  invoice_sender_city: 'sidoarjo',
  invoice_sender_social: '@virtualoperationcontrol',
  wa_reminder_enabled: '1',
  wa_reminder_days: '3',
  wa_receipt_enabled: '1',
  wa_admin_notify_enabled: '1',
  wa_bot_enabled: '1',
  ...Object.fromEntries(Object.keys(PRODUCTS).map((p) => [`price_${p}`, '0'])),
  pricing_packages: '',
  default_trial_quota_messagerahasia: '10',
  default_trial_quota_pos: '0',
  default_trial_quota_billiard: '0',
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
    bank_name: s.bank_name,
    bank_account_number: s.bank_account_number,
    bank_account_holder: s.bank_account_holder,
    invoice_sender_name: s.invoice_sender_name,
    invoice_sender_city: s.invoice_sender_city,
    invoice_sender_social: s.invoice_sender_social,
    wa_reminder_enabled: s.wa_reminder_enabled !== '0',
    wa_reminder_days: Number(s.wa_reminder_days) || 3,
    wa_receipt_enabled: s.wa_receipt_enabled !== '0',
    wa_admin_notify_enabled: s.wa_admin_notify_enabled !== '0',
    wa_bot_enabled: s.wa_bot_enabled !== '0',
    prices: Object.fromEntries(Object.keys(PRODUCTS).map((p) => [p, Number(s[`price_${p}`]) || 0])),
    trial_quotas: Object.fromEntries(Object.keys(PRODUCTS).map((p) => [p, Number(s[`default_trial_quota_${p}`] ?? (p === 'messagerahasia' ? 10 : 0))])),
    packages: getGlobalPackages(s),
    max_amount: MAX_AMOUNT,
  };
}

/** Status yang memunculkan tagihan di aplikasi client. */
export const BILLING_STATUSES = ['expired', 'locked', 'pending'];

/** Mapping Paket Default Perpanjangan Lisensi */
export const DEFAULT_PACKAGES = [
  { id: 'pkg_7d', days: 7, label: '7 Hari', name: 'Paket 7 Hari', basePrice: 20000, promoPrice: null, promoBadge: '' },
  { id: 'pkg_14d', days: 14, label: '2 Minggu', name: 'Paket 2 Minggu', basePrice: 35000, promoPrice: null, promoBadge: '' },
  { id: 'pkg_30d', days: 30, label: '1 Bulan', name: 'Paket 1 Bulan', basePrice: 60000, promoPrice: null, promoBadge: '' },
  { id: 'pkg_90d', days: 90, label: '3 Bulan', name: 'Paket 3 Bulan', basePrice: 150000, promoPrice: null, promoBadge: '' },
  { id: 'pkg_365d', days: 365, label: '1 Tahun', name: 'Paket 1 Tahun', basePrice: 500000, promoPrice: null, promoBadge: '' },
];

export const PACKAGES = DEFAULT_PACKAGES;

/** Ambil paket global yang tersimpan di settings, atau fallback ke default */
export function getGlobalPackages(s = getSettings()) {
  if (s.pricing_packages) {
    try {
      const parsed = JSON.parse(s.pricing_packages);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {}
  }
  return DEFAULT_PACKAGES;
}

/** Tentukan paket durasi berdasarkan nominal uang (termasuk toleransi 3-digit kode unik & harga promo) */
export function resolvePackageByAmount(amount, c = null) {
  const n = Number(amount) || 0;
  const packagesList = c ? getClientPackages(c) : getGlobalPackages();

  for (const pkg of packagesList) {
    const activePrice = Number(pkg.promo_price || pkg.promoPrice || pkg.original_price || pkg.basePrice) || 0;
    const origPrice = Number(pkg.original_price || pkg.basePrice || activePrice) || activePrice;
    if (n === activePrice || (n >= activePrice && n < activePrice + 1000)) {
      return {
        id: pkg.id,
        days: Number(pkg.days) || 30,
        label: pkg.label || `${pkg.days} Hari`,
        name: pkg.name || `Paket ${pkg.days} Hari`,
        basePrice: activePrice,
        original_price: origPrice,
        promo_price: pkg.promo_price || pkg.promoPrice || null,
      };
    }
  }

  // Toleransi rentang default bila nominal kustom
  if (n >= 400000) return { days: 365, label: '1 Tahun', name: 'Paket 1 Tahun', basePrice: n };
  if (n >= 120000) return { days: 90, label: '3 Bulan', name: 'Paket 3 Bulan', basePrice: n };
  if (n >= 50000) return { days: 30, label: '1 Bulan', name: 'Paket 1 Bulan', basePrice: n };
  if (n >= 30000) return { days: 14, label: '2 Minggu', name: 'Paket 2 Minggu', basePrice: n };
  if (n >= 15000) return { days: 7, label: '7 Hari', name: 'Paket 7 Hari', basePrice: n };
  return { days: 30, label: '1 Bulan', name: `Paket Standar (${formatRupiah(n)})`, basePrice: n };
}

/**
 * Mengambil atau mengalokasikan 3-digit kode unik (100 s/d 999) tetap untuk satu client.
 * Kode unik ini akan melekat pada client tersebut dan berlaku untuk SEMUA paket tagihan
 * (misal kode 321 -> Paket Rp20.321, Rp35.321, Rp60.321, Rp150.321, Rp500.321).
 */
export function getOrAssignClientUniqueCode(c, { rotate = false } = {}) {
  if (!c) return 0;
  if (!rotate && c.unique_code && Number(c.unique_code) >= 100 && Number(c.unique_code) <= 999) {
    return Number(c.unique_code);
  }

  // Ambil semua unique_code yang sedang aktif digunakan client lain (dan hindari kode lama milik sendiri saat rotate)
  const allWaiting = q.allClients.all().map(enrich);
  const usedCodes = new Set(
    allWaiting
      .filter((other) => other.unique_code && (rotate || other.id !== c.id))
      .map((other) => Number(other.unique_code))
  );
  if (c.unique_code) usedCodes.add(Number(c.unique_code));

  // Cari 3-digit acak antara 100 s/d 999 yang belum terpakai
  const randomStart = Math.floor(Math.random() * 890) + 100;
  let assignedCode = 101;

  for (let i = 0; i < 900; i++) {
    const candidate = ((randomStart + i - 100) % 900) + 100;
    if (!usedCodes.has(candidate)) {
      assignedCode = candidate;
      break;
    }
  }

  if (c.id) {
    try {
      q.setUniqueCode.run({ id: c.id, code: assignedCode, now: nowIso() });
      c.unique_code = assignedCode;
    } catch (err) {
      console.error('[billing] Gagal menyimpan unique_code:', err.message);
    }
  }

  return assignedCode;
}

/** Daftar semua paket dengan nominal yang disesuaikan dengan kode unik client & promo aktif */
export function getClientPackages(c, s = getSettings(), baseUrl = '') {
  const code = getOrAssignClientUniqueCode(c);
  let rawPackages = null;
  if (c && c.custom_packages) {
    try {
      const parsed = JSON.parse(c.custom_packages);
      if (Array.isArray(parsed) && parsed.length > 0) rawPackages = parsed;
    } catch {}
  }
  if (!rawPackages) rawPackages = getGlobalPackages(s);

  return rawPackages.map((pkg) => {
    const isPromo = Boolean(pkg.promoPrice && Number(pkg.promoPrice) > 0 && Number(pkg.promoPrice) < Number(pkg.basePrice));
    const activePrice = isPromo ? Number(pkg.promoPrice) : Number(pkg.basePrice);
    const finalAmount = activePrice + code;
    const qs = c ? new URLSearchParams({
      machine_id: c.machine_id,
      product: c.product,
      amount: String(finalAmount),
    }).toString() : '';

    return {
      id: pkg.id || `pkg_${pkg.days}d`,
      days: Number(pkg.days) || 30,
      label: pkg.label || `${pkg.days} Hari`,
      name: pkg.name || `Paket ${pkg.days} Hari`,
      basePrice: Number(pkg.basePrice) || activePrice,
      promoPrice: isPromo ? Number(pkg.promoPrice) : null,
      original_price: Number(pkg.basePrice) || activePrice,
      promo_price: isPromo ? Number(pkg.promoPrice) : null,
      is_promo: isPromo,
      promo_badge: pkg.promoBadge || (isPromo ? `HEMAT ${Math.round((1 - activePrice/pkg.basePrice)*100)}%` : ''),
      promoBadge: pkg.promoBadge || '',
      unique_code: code,
      final_amount: finalAmount,
      amount: finalAmount,
      amount_text: formatRupiah(finalAmount),
      qris_image_url: qs ? `${baseUrl}/api/v1/billing/qris.png?${qs}` : '',
    };
  });
}

export const clientPackages = getClientPackages;

/** Nominal efektif untuk client: nominal unik otomatis, nominal khusus client, atau harga default produk. */
export function effectiveAmount(c, s = getSettings()) {
  const basePrice = (c && c.billing_amount !== null && c.billing_amount !== undefined && Number(c.billing_amount) > 0)
    ? Number(c.billing_amount)
    : (Number(s[`price_${c?.product}`]) || 0);

  if (!basePrice) return 0;

  // Sertakan kode unik client jika terdaftar
  if (c && c.id) {
    const code = getOrAssignClientUniqueCode(c);
    return basePrice + code;
  }

  return basePrice;
}

export function getOrAssignUniqueAmount(c, s = getSettings()) {
  return effectiveAmount(c, s);
}

/**
 * Data tagihan & paket perpanjangan untuk aplikasi client.
 * Menyediakan objek billing, daftar paket, dan QRIS dinamis untuk semua status (termasuk active/trial)
 * agar pengguna aktif dapat melakukan perpanjangan lebih awal (advance renewal) kapan saja.
 * Mengembalikan null hanya bila QRIS belum diatur oleh admin.
 * `c` = client yang sudah di-enrich (punya .status).
 */
export function billingFor(c, { baseUrl = '', force = false, amount = null } = {}) {
  const s = getSettings();
  const check = s.qris_payload ? inspectQris(s.qris_payload) : null;
  if (!check?.ok) return null;

  const clientCode = getOrAssignClientUniqueCode(c);
  let targetAmount = 0;

  if (amount) {
    const reqN = Number(amount);
    // Jika reqN adalah nominal bulat ribuan tanpa kode unik (misal 20000, 35000, 60000), tambahkan kode unik client
    if (reqN % 1000 === 0 && clientCode) {
      targetAmount = reqN + clientCode;
    } else if (clientCode && reqN > 1000 && reqN % 1000 !== clientCode) {
      // Jika aplikasi client mengirim nominal dengan kode unik lama (setelah rotasi pembayaran sebelumnya),
      // sesuaikan ke kode unik terbaru milik client agar QRIS selalu fresh
      targetAmount = Math.floor(reqN / 1000) * 1000 + clientCode;
    } else {
      targetAmount = reqN;
    }
  } else {
    targetAmount = effectiveAmount(c, s);
  }

  if (!targetAmount || targetAmount > MAX_AMOUNT) {
    const pkgs = clientPackages(c, s, baseUrl);
    if (pkgs && pkgs.length > 0) {
      targetAmount = pkgs[0].amount || pkgs[0].final_amount || 0;
    }
  }

  if (!targetAmount || targetAmount > MAX_AMOUNT) return null;

  // Catat billing_orders temporary (status PENDING) ke database
  // HANYA jika client sedang membutuhkan pembayaran (status locked, expired, expiring, pending, trial)
  // ATAU client secara eksplisit meminta tagihan nominal tertentu (amount != null / force == true)
  const isNeedingPayment = ['locked', 'expired', 'expiring', 'pending', 'trial'].includes(c.status) || amount !== null;
  if (c.id && c.machine_id && isNeedingPayment) {
    try {
      const existing = q.findPendingOrderByMidAndAmount.get(c.machine_id, targetAmount);
      if (!existing) {
        // Jika client meminta paket berbeda, batalkan order PENDING lama milik client ini agar tidak menumpuk
        q.cancelPendingOrdersForClient.run({ client_id: c.id, now: nowIso() });
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
  const pkg = resolvePackageByAmount(targetAmount, c);

  return {
    reason: c.status === 'locked' ? 'locked' : c.status === 'expired' ? 'expired' : c.status,
    unique_code: clientCode,
    amount: targetAmount,
    amount_text: formatRupiah(targetAmount),
    currency: 'IDR',
    package: pkg,
    packages: clientPackages(c, s, baseUrl),
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
