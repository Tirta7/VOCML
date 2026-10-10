// QRIS (standar EMVCo MPM): parsing, validasi, dan konversi QRIS statis -> dinamis bernominal.
//
// Format TLV: [ID 2 digit][panjang 2 digit][nilai]. Tag penting:
//   00 versi format ("01")        01 metode: "11" statis, "12" dinamis
//   26-51 info akun merchant      52 MCC        53 mata uang (360 = IDR)
//   54 nominal transaksi          58 negara     59 nama merchant   60 kota
//   63 CRC16-CCITT (selalu terakhir, dihitung atas seluruh string + "6304")

/** CRC16-CCITT (False): poly 0x1021, init 0xFFFF. Hasil 4 hex huruf besar. */
export function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Pecah string TLV menjadi array { id, value }. Lempar error bila formatnya rusak. */
export function parseTLV(str) {
  const out = [];
  let i = 0;
  while (i < str.length) {
    const id = str.slice(i, i + 2);
    const len = Number(str.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || !Number.isInteger(len) || i + 4 + len > str.length) {
      throw new Error('Struktur data QRIS tidak valid');
    }
    out.push({ id, value: str.slice(i + 4, i + 4 + len) });
    i += 4 + len;
  }
  return out;
}

const tlv = (id, value) => `${id}${String(value.length).padStart(2, '0')}${value}`;

/** Bersihkan payload hasil tempel (baris baru, tab, spasi di ujung). Spasi di tengah dipertahankan
 *  karena nama merchant / kota di QRIS boleh mengandung spasi. */
export function cleanPayload(raw) {
  return String(raw ?? '').replace(/[\r\n\t]+/g, '').trim();
}

/**
 * Validasi & baca informasi QRIS.
 * @returns {{ ok: true, info } | { ok: false, error }}
 */
export function inspectQris(raw) {
  const payload = cleanPayload(raw);
  if (!payload) return { ok: false, error: 'Data QRIS kosong' };
  if (!payload.startsWith('000201')) return { ok: false, error: 'Bukan data QRIS (harus diawali 000201)' };
  let tags;
  try {
    tags = parseTLV(payload);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  const last = tags[tags.length - 1];
  if (!last || last.id !== '63' || last.value.length !== 4) return { ok: false, error: 'Kode CRC QRIS tidak ditemukan' };
  const expected = crc16(payload.slice(0, -4));
  if (expected !== last.value.toUpperCase()) return { ok: false, error: 'CRC QRIS tidak cocok (data rusak / terpotong)' };

  const get = (id) => tags.find((t) => t.id === id)?.value || '';
  const hasMerchantAccount = tags.some((t) => Number(t.id) >= 26 && Number(t.id) <= 51);
  if (!hasMerchantAccount) return { ok: false, error: 'Data akun merchant QRIS tidak ditemukan' };

  // NMID biasanya ada di sub-tag 02 dari tag 51 (domestik QRIS ID).
  let nmid = '';
  const t51 = get('51');
  if (t51) {
    try { nmid = parseTLV(t51).find((s) => s.id === '02')?.value || ''; } catch { /* abaikan */ }
  }

  return {
    ok: true,
    info: {
      payload,
      method: get('01') === '12' ? 'dynamic' : 'static',
      merchant_name: get('59'),
      merchant_city: get('60'),
      currency: get('53'),
      country: get('58'),
      amount: get('54') || null,
      nmid,
    },
  };
}

/**
 * Buat QRIS dinamis dengan nominal tertentu dari QRIS statis (atau dinamis) yang valid.
 * Nominal dalam Rupiah (bilangan bulat).
 */
export function buildDynamicQris(raw, amount) {
  const check = inspectQris(raw);
  if (!check.ok) throw new Error(check.error);
  const n = Number(amount);
  if (!Number.isInteger(n) || n < 1) throw new Error('Nominal tagihan tidak valid');

  const tags = parseTLV(check.info.payload).filter((t) => t.id !== '63' && t.id !== '54');
  const method = tags.find((t) => t.id === '01');
  if (method) method.value = '12';
  else tags.splice(1, 0, { id: '01', value: '12' });
  tags.push({ id: '54', value: String(n) });

  // Urutkan sesuai ID tag (00 tetap di depan), CRC ditambahkan paling akhir.
  tags.sort((a, b) => Number(a.id) - Number(b.id));
  const body = tags.map((t) => tlv(t.id, t.value)).join('') + '6304';
  return body + crc16(body);
}

export function formatRupiah(n) {
  return 'Rp' + Number(n || 0).toLocaleString('id-ID');
}
