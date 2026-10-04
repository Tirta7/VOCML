// Isi database dengan data contoh untuk mencoba tampilan.
// JANGAN dijalankan di server produksi yang sudah berisi data client asli.
//   npm run seed:demo
import crypto from 'node:crypto';
import { q, db, transaction } from './db.js';
import { createLicenseKey } from './license.js';
import { addMonths, nowIso, planLabel, todayStr, dayNum, fromDayNum } from './dates.js';

const count = db.prepare('SELECT COUNT(*) AS n FROM clients').get().n;
if (count > 0 && !process.argv.includes('--force')) {
  console.log(`Database sudah berisi ${count} client. Gunakan --force untuk tetap menambah data contoh.`);
  process.exit(0);
}

const mid = () => 'MID-' + crypto.randomBytes(6).toString('hex').toUpperCase().match(/.{4}/g).join('-');
const today = todayStr();
const shift = (days) => fromDayNum(dayNum(today) + days);

// [nama, produk, sisa hari (null = belum aktivasi), bulan paket, terkunci manual]
const samples = [
  ['Sinar Jaya Billiard', 'billiard', 24, 1],
  ['Cue Club Tegal', 'billiard', 3, 1],
  ['Pocket Billiard 88', 'billiard', 87, 3],
  ['Black Eight Pool & Cafe', 'billiard', 5, 1],
  ['Galaxy Billiard Purwokerto', 'billiard', 140, 12],
  ['Snooker Corner Brebes', 'billiard', -6, 1],
  ['Bola Sodok Mania', 'billiard', 41, 3],
  ['Toko Berkah Mart', 'pos', 161, 12],
  ['Warung Makan Sederhana', 'pos', 2, 1],
  ['Apotek Sehat Sentosa', 'pos', -12, 1, true],
  ['Kopi Senja', 'pos', null],
  ['Laundry Bersih Kilat', 'pos', 15, 1],
  ['Srikandi Mart', 'pos', 220, 12],
  ['Bakso Pak Kumis', 'pos', 6, 1],
  ['Toko Bangunan Maju Jaya', 'pos', 63, 3],
  ['Minimarket Barokah', 'pos', -3, 1],
  ['Butik Anggun', 'pos', 28, 1],
  ['Kedai Teh Nusantara', 'pos', null],
  ['Fotocopy Cahaya', 'pos', 1, 1],
  ['Toko Kelontong Bu Siti', 'pos', 95, 6],
  ['Ayam Geprek Juara', 'pos', 19, 1],
  ['Cell Shop Prima', 'pos', 300, 12],
  ['Roti Bakar 99', 'pos', null],
  ['Depot Air Isi Ulang Segar', 'pos', 10, 1],
];

transaction(() => {
  samples.forEach(([name, product, days, months, locked], i) => {
    const created = new Date(Date.now() - (60 + i * 3) * 86400000).toISOString();
    const machine = mid();
    const info = q.insertClient.run({
      name, product, machine_id: machine, phone: '08' + String(1200000000 + i * 7919).slice(0, 10),
      address: 'Jawa Tengah', notes: '', source: days === null ? 'api' : 'manual', app_version: '1.4.2',
      last_ip: '', last_seen: days === null || i % 4 ? new Date(Date.now() - i * 3600 * 1000).toISOString() : null, now: created,
    });
    const id = Number(info.lastInsertRowid);
    if (days === null) return;

    // Buat riwayat 3 periode ke belakang sampai tanggal berakhir saat ini.
    const finalExp = shift(days);
    const periods = [addMonths(finalExp, -months * 2), addMonths(finalExp, -months), finalExp];
    let prev = null;
    periods.forEach((exp, idx) => {
      const key = createLicenseKey({ machineId: machine, product, expiresAt: exp });
      q.insertHistory.run({
        client_id: id, action: idx === 0 ? `Aktivasi pertama (${months} bulan)` : `Perpanjang ${months} bulan`,
        months, license_key: key, expires_before: prev, expires_at: exp, note: '', now: new Date(Date.parse(created) + idx * months * 30 * 86400000).toISOString(),
      });
      prev = exp;
    });
    q.renewClient.run({
      id, expires_at: finalExp, license_key: createLicenseKey({ machineId: machine, product, expiresAt: finalExp }),
      plan: planLabel(months), locked: locked ? 1 : 0, lock_reason: locked ? 'Belum bayar perpanjangan' : '', now: nowIso(),
    });
  });
});

console.log(`${samples.length} client contoh ditambahkan.`);
