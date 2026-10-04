// Utilitas tanggal. Tanggal berakhir lisensi disimpan sebagai 'YYYY-MM-DD'
// (berlaku sampai akhir hari tersebut), mengikuti zona waktu server (TZ).

const pad = (n) => String(n).padStart(2, '0');

export const nowIso = () => new Date().toISOString();

export function ymd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const todayStr = () => ymd(new Date());

/** Jumlah hari sejak 1970-01-01 untuk string 'YYYY-MM-DD'. */
export function dayNum(s) {
  const [y, m, d] = s.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

export function fromDayNum(n) {
  return new Date(n * 86400000).toISOString().slice(0, 10);
}

export function daysUntil(s) {
  return dayNum(s) - dayNum(todayStr());
}

/** Tambah n bulan, tanggal akhir bulan di-clamp (31 Jan + 1 bln = 28/29 Feb). */
export function addMonths(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

export function planLabel(months) {
  return { 1: 'Bulanan', 3: 'Triwulan', 6: 'Semester', 12: 'Tahunan' }[months] || `${months} bulan`;
}
