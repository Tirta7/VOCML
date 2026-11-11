// API & Service untuk pengiriman Invoice Tagihan & Reminder Lisensi via WhatsApp (Baileys)
import express from 'express';
import { q, enrich, logActivity } from '../db.js';
import { nowIso } from '../dates.js';
import { broadcastChange } from '../realtime.js';
import { formatRupiah, buildDynamicQris } from '../qris.js';
import {
  getSettings,
  billingFor,
  getClientPackages,
  resolvePackageByAmount,
  qrPng,
} from '../billing.js';
import {
  waStatus,
  waQr,
  waConnected,
  waStart,
  waStop,
  waSendImage,
  waAutoStart,
} from '../whatsapp.js';
import {
  generateInvoicePng,
  generateQrisCardPng,
  buildInvoiceCaption,
  makeInvoiceNumber,
} from '../invoice.js';

export const whatsappRouter = express.Router();

const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

/**
 * Tentukan paket & objek billing (termasuk QRIS dinamis + kode unik client) untuk invoice client
 */
export function resolveClientInvoiceData(
  client,
  { packageId = null, amount = null, discount = null } = {}
) {
  const c = client.status ? client : enrich(client);
  const s = getSettings();
  const pkgs = getClientPackages(c, s);

  let selectedPkg = null;
  let targetAmount = null;

  if (packageId) {
    selectedPkg = pkgs.find((p) => p.id === packageId) || null;
    if (selectedPkg) targetAmount = selectedPkg.amount;
  }

  if (!targetAmount && amount) {
    const reqAmt = Number(String(amount).replace(/[^\d]/g, '')) || 0;
    if (reqAmt > 0) {
      selectedPkg = pkgs.find((p) => p.amount === reqAmt || p.basePrice === reqAmt || p.promoPrice === reqAmt) || null;
      targetAmount = selectedPkg ? selectedPkg.amount : reqAmt;
    }
  }

  // Jika belum ada paket/nominal yang dipilih, utamakan paket 1 Bulan (30 hari) atau nominal khusus >= Rp10.000
  if (!targetAmount) {
    if (c.billing_amount && Number(c.billing_amount) >= 10000) {
      targetAmount = Number(c.billing_amount);
      selectedPkg = pkgs.find((p) => p.basePrice === targetAmount || p.promoPrice === targetAmount) || null;
    } else {
      selectedPkg =
        pkgs.find((p) => p.days === 30) ||
        pkgs.find((p) => p.days >= 14) ||
        pkgs[0] ||
        null;
      if (selectedPkg) targetAmount = selectedPkg.amount;
    }
  }

  const customDisc = Math.max(0, Number(String(discount || '').replace(/[^\d]/g, '')) || 0);
  if (customDisc > 0 && targetAmount > customDisc + 1000) {
    targetAmount = targetAmount - customDisc;
  }

  const billing = billingFor(c, { amount: targetAmount, force: true });
  if (!selectedPkg) {
    selectedPkg = billing?.package || resolvePackageByAmount(billing?.amount || targetAmount || 0, c);
  }

  return { client: c, settings: s, billing, pkg: selectedPkg, packages: pkgs, customDiscount: customDisc };
}

/**
 * Kirim Invoice lengkap + Kartu QRIS + Caption ke nomor WhatsApp client
 */
export async function sendClientInvoiceWhatsapp(
  client,
  {
    phone = null,
    packageId = null,
    amount = null,
    discount = null,
    customDate = null,
    customItem1 = null,
    customItem2 = null,
    customItem3 = null,
    isAuto = false,
    reminderStage = null,
  } = {}
) {
  const { client: c, settings: s, billing, pkg, customDiscount } = resolveClientInvoiceData(client, {
    packageId,
    amount,
    discount,
  });
  if (!billing || !billing.qris) {
    throw new Error('Tagihan QRIS belum dapat dibuat. Pastikan QRIS toko sudah diatur di menu Pengaturan.');
  }

  const targetPhone = String(phone || c.phone || '').trim();
  if (!targetPhone) {
    throw new Error(`Nomor WhatsApp untuk client "${c.name}" belum diisi.`);
  }

  if (!waConnected()) {
    throw new Error('WhatsApp belum terhubung. Silakan scan QR WhatsApp di menu Pengaturan terlebih dahulu.');
  }

  const now = new Date();
  const invoiceNo = makeInvoiceNumber(c, now);

  const invoicePng = await generateInvoicePng({
    client: c,
    billing,
    pkg,
    settings: s,
    isPaid: false,
    invoiceNo,
    createdAt: now,
    customDate,
    customDiscount,
    customItem1,
    customItem2,
    customItem3,
  });

  const qrisCardPng = await generateQrisCardPng({
    client: c,
    billing,
    pkg,
    settings: s,
    createdAt: now,
  });

  const caption = buildInvoiceCaption({
    client: c,
    billing,
    pkg,
    settings: s,
    isPaid: false,
    reminderStage,
  });

  // 1. Kirim gambar Invoice detail pesanan terlebih dahulu (seperti contoh screenshot)
  await waSendImage(targetPhone, invoicePng, '', `${invoiceNo}.png`);

  // 2. Kirim kartu QRIS siap scan beserta caption tagihan & nomor rekening
  await waSendImage(targetPhone, qrisCardPng, caption, `QRIS-${invoiceNo}.png`);

  const prefix = isAuto ? `[AUTO REMINDER ${reminderStage || `H-${c.days_left ?? 3}`}]` : '[WA INVOICE]';
  logActivity(
    'billing',
    `${prefix} Invoice ${invoiceNo} (${pkg?.name || 'Perpanjangan'} - ${formatRupiah(billing.amount)}) dikirim ke WhatsApp ${targetPhone}`,
    c
  );
  broadcastChange('activity', { silent: true });

  return {
    ok: true,
    invoice_no: invoiceNo,
    phone: targetPhone,
    amount: billing.amount,
    amount_text: billing.amount_text,
    package: pkg,
  };
}

/**
 * Kirim Kuitansi Lunas otomatis via WhatsApp setelah pembayaran berhasil
 */
export async function sendClientReceiptWhatsapp(client, { amount, pkg, expiresAt } = {}) {
  try {
    const s = getSettings();
    if (s.wa_receipt_enabled === '0') return false;
    if (!waConnected()) return false;

    const c = client.status ? client : enrich(client);
    const targetPhone = String(c.phone || '').trim();
    if (!targetPhone) return false;

    const paidAmount = Number(amount) || 0;
    const finalPkg = pkg || resolvePackageByAmount(paidAmount, c);
    const pkgBasePrice = Number(finalPkg?.basePrice) || 0;
    const paidUniqueCode =
      pkgBasePrice > 0 && paidAmount > pkgBasePrice && paidAmount - pkgBasePrice < 1000
        ? paidAmount - pkgBasePrice
        : paidAmount % 1000;
    // PENTING: Jangan panggil resolveClientInvoiceData/billingFor karena itu akan membuat billing_orders PENDING baru!
    // Selain itu, kuitansi LUNAS tidak boleh menampilkan QRIS pembayaran lagi agar tidak bisa di-scan ulang.
    const finalBilling = {
      amount: paidAmount,
      amount_text: formatRupiah(paidAmount),
      unique_code: paidUniqueCode,
      qris: '',
    };

    const now = new Date();
    const invoiceNo = makeInvoiceNumber({ ...c, unique_code: paidUniqueCode || c.unique_code || 100 }, now);
    const paidPng = await generateInvoicePng({
      client: { ...c, expires_at: expiresAt || c.expires_at },
      billing: finalBilling,
      pkg: finalPkg,
      settings: s,
      isPaid: true,
      invoiceNo,
      createdAt: now,
    });

    const caption = buildInvoiceCaption({
      client: c,
      billing: finalBilling,
      pkg: finalPkg,
      settings: s,
      isPaid: true,
      expiresAt: expiresAt || c.expires_at,
    });

    await waSendImage(targetPhone, paidPng, caption, `LUNAS-${invoiceNo}.png`);
    logActivity(
      'billing',
      `[WA LUNAS] Bukti pembayaran lunas (${formatRupiah(paidAmount)}) dikirim ke WhatsApp ${targetPhone}`,
      c
    );
    return true;
  } catch (err) {
    console.error('[whatsapp] Gagal mengirim kuitansi lunas:', err.message);
    return false;
  }
}

/**
 * Cek dan kirim otomatis reminder bertahap (H-N, H-1, dan H-0 saat expired)
 */
export async function runAutoReminderCheck() {
  try {
    const s = getSettings();
    if (s.wa_reminder_enabled === '0') return { skipped: 'disabled' };
    if (!waConnected()) return { skipped: 'wa_not_connected' };

    const reminderDays = Math.max(1, Number(s.wa_reminder_days) || 3);
    const all = q.allClients.all().map(enrich);
    let sentCount = 0;

    for (const c of all) {
      if (c.locked) continue;
      if (!c.phone || !c.expires_at) continue;
      if (c.days_left === null || c.days_left < -1 || c.days_left > reminderDays) continue;

      let stage = 'H-3';
      if (c.days_left <= 0) stage = 'H-0';
      else if (c.days_left === 1) stage = 'H-1';

      const reminderKey = `${c.expires_at}:${stage}`;
      // Kompatibilitas dengan nilai lama yang hanya menyimpan tanggal expires_at (dianggap H-3)
      if (c.last_reminder_for_expiry === reminderKey) continue;
      if (stage === 'H-3' && c.last_reminder_for_expiry === c.expires_at) continue;

      try {
        await sendClientInvoiceWhatsapp(c, { isAuto: true, reminderStage: stage });
        q.setClientReminderSent.run({ id: c.id, expires_at: reminderKey, now: nowIso() });
        sentCount++;
      } catch (err) {
        console.error(`[whatsapp] Gagal kirim auto-reminder (${stage}) ke ${c.name} (${c.phone}):`, err.message);
      }
    }

    return { ok: true, sentCount };
  } catch (err) {
    console.error('[whatsapp] runAutoReminderCheck error:', err.message);
    return { error: err.message };
  }
}

let schedulerTimer = null;
export function startReminderScheduler() {
  waAutoStart();
  if (schedulerTimer) clearInterval(schedulerTimer);
  // Cek pertama kali 25 detik setelah server menyala
  setTimeout(() => {
    runAutoReminderCheck().catch(() => {});
  }, 25_000).unref();
  // Cek berkala setiap 30 menit
  schedulerTimer = setInterval(() => {
    runAutoReminderCheck().catch(() => {});
  }, 30 * 60 * 1000);
  schedulerTimer.unref();
}

// ---------------- Endpoints Admin WhatsApp ----------------

whatsappRouter.get('/whatsapp/status', (req, res) => {
  res.json(waStatus());
});

whatsappRouter.post('/whatsapp/connect', async (req, res) => {
  try {
    const st = await waStart();
    res.json(st);
  } catch (err) {
    bad(res, 'Gagal menghubungkan WhatsApp: ' + err.message, 500);
  }
});

whatsappRouter.post('/whatsapp/disconnect', async (req, res) => {
  try {
    const logout = Boolean(req.body?.logout);
    const st = await waStop({ logout });
    logActivity('system', logout ? 'Sesi WhatsApp di-logout oleh admin' : 'Koneksi WhatsApp diputus sementara');
    res.json(st);
  } catch (err) {
    bad(res, 'Gagal memutuskan WhatsApp: ' + err.message, 500);
  }
});

whatsappRouter.get('/whatsapp/qr.png', async (req, res) => {
  const qr = waQr();
  if (!qr) return bad(res, 'QR Code belum tersedia', 404);
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.type('png').send(await qrPng(qr, 360));
  } catch (err) {
    bad(res, 'Gagal membuat QR PNG: ' + err.message, 500);
  }
});

// Preview gambar Invoice lengkap untuk client
whatsappRouter.get('/clients/:id/invoice.png', async (req, res) => {
  const raw = q.clientById.get(Number(req.params.id));
  if (!raw) return bad(res, 'Client tidak ditemukan', 404);
  try {
    const { client: c, settings: s, billing, pkg, customDiscount } = resolveClientInvoiceData(raw, {
      packageId: req.query.package_id || null,
      amount: req.query.amount || null,
      discount: req.query.discount || null,
    });
    const png = await generateInvoicePng({
      client: c,
      billing,
      pkg,
      settings: s,
      isPaid: req.query.paid === '1',
      customDate: req.query.date || null,
      customDiscount,
      customItem1: req.query.item1 || null,
      customItem2: req.query.item2 || null,
      customItem3: req.query.item3 || null,
    });
    res.setHeader('Cache-Control', 'no-store');
    res.type('png').send(png);
  } catch (err) {
    bad(res, 'Gagal merender invoice: ' + err.message, 500);
  }
});

// Preview gambar Kartu QRIS saja untuk client
whatsappRouter.get('/clients/:id/qris-card.png', async (req, res) => {
  const raw = q.clientById.get(Number(req.params.id));
  if (!raw) return bad(res, 'Client tidak ditemukan', 404);
  try {
    const { client: c, settings: s, billing, pkg } = resolveClientInvoiceData(raw, {
      packageId: req.query.package_id || null,
      amount: req.query.amount || null,
      discount: req.query.discount || null,
    });
    const png = await generateQrisCardPng({
      client: c,
      billing,
      pkg,
      settings: s,
    });
    res.setHeader('Cache-Control', 'no-store');
    res.type('png').send(png);
  } catch (err) {
    bad(res, 'Gagal merender kartu QRIS: ' + err.message, 500);
  }
});

// Kirim Invoice & Reminder ke WhatsApp client sekarang
whatsappRouter.post('/clients/:id/send-invoice', async (req, res) => {
  const raw = q.clientById.get(Number(req.params.id));
  if (!raw) return bad(res, 'Client tidak ditemukan', 404);
  try {
    const result = await sendClientInvoiceWhatsapp(raw, {
      phone: req.body?.phone || raw.phone,
      packageId: req.body?.package_id || null,
      amount: req.body?.amount || null,
      discount: req.body?.discount || null,
      customDate: req.body?.date || null,
      customItem1: req.body?.item1 || null,
      customItem2: req.body?.item2 || null,
      customItem3: req.body?.item3 || null,
      isAuto: false,
    });
    res.json(result);
  } catch (err) {
    bad(res, err.message, 400);
  }
});

// Kirim Invoice Reminder massal ke semua client yang segera berakhir / kedaluwarsa
whatsappRouter.post('/whatsapp/send-bulk-reminders', async (req, res) => {
  if (!waConnected()) {
    return bad(res, 'WhatsApp belum terhubung. Silakan scan QR WhatsApp di menu Pengaturan terlebih dahulu.');
  }
  const targetStatuses = Array.isArray(req.body?.statuses) && req.body.statuses.length
    ? req.body.statuses
    : ['expiring', 'expired'];
  const all = q.allClients.all().map(enrich);
  const targets = all.filter((c) => targetStatuses.includes(c.status) && String(c.phone || '').trim());

  if (!targets.length) {
    return bad(res, 'Tidak ada client berstatus segera berakhir / kedaluwarsa yang memiliki nomor WhatsApp.');
  }

  let sent = 0;
  const errors = [];
  for (const c of targets) {
    try {
      const stage = c.days_left !== null && c.days_left <= 0 ? 'H-0' : c.days_left === 1 ? 'H-1' : 'H-3';
      await sendClientInvoiceWhatsapp(c, { isAuto: false, reminderStage: stage });
      if (c.expires_at) {
        q.setClientReminderSent.run({ id: c.id, expires_at: `${c.expires_at}:${stage}`, now: nowIso() });
      }
      sent++;
    } catch (err) {
      errors.push(`${c.name}: ${err.message}`);
    }
  }

  res.json({ ok: true, total: targets.length, sent, errors });
});

