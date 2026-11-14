import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { daysUntil, nowIso } from './dates.js';

export const db = new DatabaseSync(path.join(config.dataDir, 'vocml.db'));

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS clients (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  product       TEXT NOT NULL CHECK (product IN ('billiard','pos','messagerahasia','konveksi','erp','enkatextile')),
  machine_id    TEXT NOT NULL,
  phone         TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  plan          TEXT NOT NULL DEFAULT '',
  expires_at    TEXT,
  locked        INTEGER NOT NULL DEFAULT 0,
  lock_reason   TEXT NOT NULL DEFAULT '',
  license_key   TEXT,
  source        TEXT NOT NULL DEFAULT 'manual',
  app_version   TEXT NOT NULL DEFAULT '',
  last_ip       TEXT NOT NULL DEFAULT '',
  last_seen     TEXT,
  activated_at  TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (machine_id, product)
);

CREATE TABLE IF NOT EXISTS license_history (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id      INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  action         TEXT NOT NULL,
  months         INTEGER NOT NULL DEFAULT 0,
  amount         INTEGER NOT NULL DEFAULT 0,
  license_key    TEXT,
  expires_before TEXT,
  expires_at     TEXT,
  note           TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id   INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL DEFAULT '',
  type        TEXT NOT NULL,
  message     TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_history_client ON license_history(client_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);

-- Pesan broadcast yang ditampilkan di aplikasi client (Billiard / Kasir POS).
-- Waktu (starts_at, ends_at, created_at, updated_at) disimpan sebagai ISO-8601 UTC.
CREATE TABLE IF NOT EXISTS client_messages (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id        INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title            TEXT CHECK (title IS NULL OR length(title) <= 80),
  message          TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 500),
  type             TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info','warning','danger','success')),
  interval_minutes INTEGER NOT NULL DEFAULT 30 CHECK (interval_minutes BETWEEN 0 AND 1440),
  display_seconds  INTEGER NOT NULL DEFAULT 15 CHECK (display_seconds BETWEEN 0 AND 600),
  is_active        INTEGER NOT NULL DEFAULT 1,
  starts_at        TEXT,
  ends_at          TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_client ON client_messages(client_id);

-- Pengaturan aplikasi (key/value), mis. QRIS statis & harga default tagihan.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

-- Antrean / order tagihan QRIS dinamis per client
CREATE TABLE IF NOT EXISTS billing_orders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id   INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  machine_id  TEXT NOT NULL,
  product     TEXT NOT NULL,
  amount      INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'PENDING',
  created_at  TEXT NOT NULL,
  paid_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_mid_amount ON billing_orders(machine_id, amount, status);
CREATE INDEX IF NOT EXISTS idx_orders_amount_status ON billing_orders(amount, status);

CREATE TABLE IF NOT EXISTS vouchers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  type        TEXT NOT NULL CHECK (type IN ('free_days', 'discount_nominal', 'trial_quota')),
  value       REAL NOT NULL,
  max_uses    INTEGER NOT NULL DEFAULT 0,
  used_count  INTEGER NOT NULL DEFAULT 0,
  product     TEXT NOT NULL DEFAULT 'all',
  description TEXT NOT NULL DEFAULT '',
  expires_at  TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS voucher_claims (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_id  INTEGER NOT NULL,
  client_id   INTEGER NOT NULL,
  machine_id  TEXT NOT NULL,
  product     TEXT NOT NULL,
  code        TEXT NOT NULL,
  type        TEXT NOT NULL,
  value       REAL NOT NULL,
  created_at  TEXT NOT NULL,
  FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  UNIQUE (voucher_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers(code);
CREATE INDEX IF NOT EXISTS idx_claims_client ON voucher_claims(client_id);
`);

// Migrasi kolom baru pada tabel lama (aman dijalankan berulang).
function addColumnIfMissing(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
// Nominal tagihan QRIS per client (NULL = pakai harga default produk).
addColumnIfMissing('clients', 'billing_amount', 'billing_amount INTEGER');
addColumnIfMissing('clients', 'unique_code', 'unique_code INTEGER');
addColumnIfMissing('clients', 'billing_note', "billing_note TEXT NOT NULL DEFAULT ''");
addColumnIfMissing('clients', 'custom_packages', "custom_packages TEXT");
addColumnIfMissing('clients', 'trial_quota', 'trial_quota INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('clients', 'trial_used', 'trial_used INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('clients', 'trial_remaining', 'trial_remaining INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('clients', 'last_reminder_for_expiry', "last_reminder_for_expiry TEXT NOT NULL DEFAULT ''");
addColumnIfMissing('license_history', 'amount', "amount INTEGER NOT NULL DEFAULT 0");

// Migrasi constraint product agar mendukung messagerahasia, konveksi, erp, dan enkatextile
try {
  const clientsSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='clients'").get()?.sql || '';
  if (!clientsSql.includes("'enkatextile'")) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE clients_temp (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT NOT NULL,
        product       TEXT NOT NULL CHECK (product IN ('billiard','pos','messagerahasia','konveksi','erp','enkatextile')),
        machine_id    TEXT NOT NULL,
        phone         TEXT NOT NULL DEFAULT '',
        address       TEXT NOT NULL DEFAULT '',
        notes         TEXT NOT NULL DEFAULT '',
        plan          TEXT NOT NULL DEFAULT '',
        expires_at    TEXT,
        locked        INTEGER NOT NULL DEFAULT 0,
        lock_reason   TEXT NOT NULL DEFAULT '',
        license_key   TEXT,
        source        TEXT NOT NULL DEFAULT 'manual',
        app_version   TEXT NOT NULL DEFAULT '',
        last_ip       TEXT NOT NULL DEFAULT '',
        last_seen     TEXT,
        activated_at  TEXT,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL,
        billing_amount INTEGER,
        unique_code   INTEGER,
        billing_note  TEXT NOT NULL DEFAULT '',
        custom_packages TEXT,
        trial_quota   INTEGER NOT NULL DEFAULT 0,
        trial_used    INTEGER NOT NULL DEFAULT 0,
        trial_remaining INTEGER NOT NULL DEFAULT 0,
        last_reminder_for_expiry TEXT NOT NULL DEFAULT '',
        UNIQUE (machine_id, product)
      );
      INSERT INTO clients_temp (id, name, product, machine_id, phone, address, notes, plan, expires_at, locked, lock_reason, license_key, source, app_version, last_ip, last_seen, activated_at, created_at, updated_at, billing_amount, unique_code, billing_note, custom_packages, trial_quota, trial_used, trial_remaining, last_reminder_for_expiry)
      SELECT id, name, product, machine_id, phone, address, notes, plan, expires_at, locked, lock_reason, license_key, source, app_version, last_ip, last_seen, activated_at, created_at, updated_at, billing_amount, unique_code, billing_note, custom_packages, trial_quota, trial_used, trial_remaining, last_reminder_for_expiry FROM clients;
      DROP TABLE clients;
      ALTER TABLE clients_temp RENAME TO clients;
      PRAGMA foreign_keys = ON;
    `);
  }
} catch (e) {
  console.error('[db] Migrasi constraint product enkatextile:', e.message);
}

export const q = {
  allClients: db.prepare('SELECT * FROM clients ORDER BY name COLLATE NOCASE'),
  clientById: db.prepare('SELECT * FROM clients WHERE id = ?'),
  clientByMid: db.prepare('SELECT * FROM clients WHERE machine_id = ? AND product = ?'),
  insertClient: db.prepare(`
    INSERT INTO clients (name, product, machine_id, phone, address, notes, source, app_version, last_ip, last_seen, created_at, updated_at)
    VALUES (:name, :product, :machine_id, :phone, :address, :notes, :source, :app_version, :last_ip, :last_seen, :now, :now)`),
  updateClientInfo: db.prepare(`
    UPDATE clients SET name = :name, product = :product, machine_id = :machine_id, phone = :phone,
      address = :address, notes = :notes, license_key = :license_key, updated_at = :now WHERE id = :id`),
  renewClient: db.prepare(`
    UPDATE clients SET expires_at = :expires_at, license_key = :license_key, plan = :plan,
      locked = :locked, lock_reason = :lock_reason, activated_at = COALESCE(activated_at, :now), updated_at = :now
    WHERE id = :id`),
  setLock: db.prepare('UPDATE clients SET locked = :locked, lock_reason = :reason, updated_at = :now WHERE id = :id'),
  setExpiry: db.prepare('UPDATE clients SET expires_at = :expires_at, license_key = :license_key, updated_at = :now WHERE id = :id'),
  setBilling: db.prepare('UPDATE clients SET billing_amount = :billing_amount, billing_note = :billing_note, updated_at = :now WHERE id = :id'),
  setBillingAmount: db.prepare('UPDATE clients SET billing_amount = :billing_amount, updated_at = :now WHERE id = :id'),
  clearBillingAmount: db.prepare('UPDATE clients SET billing_amount = NULL, updated_at = :now WHERE id = :id'),
  setUniqueCode: db.prepare('UPDATE clients SET unique_code = :code, updated_at = :now WHERE id = :id'),
  clearUniqueCode: db.prepare('UPDATE clients SET unique_code = NULL, updated_at = :now WHERE id = :id'),
  setCustomPackages: db.prepare('UPDATE clients SET custom_packages = :custom_packages, updated_at = :now WHERE id = :id'),
  setClientReminderSent: db.prepare('UPDATE clients SET last_reminder_for_expiry = :expires_at, updated_at = :now WHERE id = :id'),
  clientByUniqueCode: db.prepare('SELECT * FROM clients WHERE unique_code = ?'),

  // ----- Trial Kuota -----
  setClientTrial: db.prepare(`
    UPDATE clients
    SET trial_quota = :trial_quota,
        trial_used = :trial_used,
        trial_remaining = MAX(0, :trial_quota - :trial_used),
        updated_at = :now
    WHERE id = :id`),
  consumeClientTrial: db.prepare(`
    UPDATE clients
    SET trial_used = trial_used + 1,
        trial_remaining = MAX(0, trial_quota - (trial_used + 1)),
        updated_at = :now
    WHERE id = :id`),
  updateTrialQuotaForProduct: db.prepare(`
    UPDATE clients
    SET trial_quota = :quota,
        trial_remaining = MAX(0, :quota - trial_used),
        updated_at = :now
    WHERE product = :product
      AND locked = 0
      AND (expires_at IS NULL OR expires_at < :today)`),

  // ----- Vouchers -----
  allVouchers: db.prepare('SELECT * FROM vouchers ORDER BY created_at DESC'),
  voucherById: db.prepare('SELECT * FROM vouchers WHERE id = ?'),
  voucherByCode: db.prepare('SELECT * FROM vouchers WHERE code = ? COLLATE NOCASE'),
  insertVoucher: db.prepare(`
    INSERT INTO vouchers (code, type, value, max_uses, product, description, expires_at, is_active, created_at, updated_at)
    VALUES (:code, :type, :value, :max_uses, :product, :description, :expires_at, :is_active, :now, :now)`),
  updateVoucher: db.prepare(`
    UPDATE vouchers SET code = :code, type = :type, value = :value, max_uses = :max_uses,
      product = :product, description = :description, expires_at = :expires_at, is_active = :is_active, updated_at = :now
    WHERE id = :id`),
  deleteVoucher: db.prepare('DELETE FROM vouchers WHERE id = ?'),
  toggleVoucher: db.prepare('UPDATE vouchers SET is_active = :is_active, updated_at = :now WHERE id = :id'),
  incrementVoucherUse: db.prepare('UPDATE vouchers SET used_count = used_count + 1, updated_at = :now WHERE id = :id'),

  // ----- Voucher Claims -----
  allVoucherClaims: db.prepare(`
    SELECT c.*, cl.name as client_name
    FROM voucher_claims c LEFT JOIN clients cl ON cl.id = c.client_id
    ORDER BY c.created_at DESC LIMIT 200`),
  voucherClaimByClientAndVoucher: db.prepare('SELECT * FROM voucher_claims WHERE voucher_id = ? AND client_id = ?'),
  voucherClaimsByVoucherId: db.prepare(`
    SELECT c.*, cl.name as client_name
    FROM voucher_claims c LEFT JOIN clients cl ON cl.id = c.client_id
    WHERE c.voucher_id = ? ORDER BY c.created_at DESC`),
  insertVoucherClaim: db.prepare(`
    INSERT INTO voucher_claims (voucher_id, client_id, machine_id, product, code, type, value, created_at)
    VALUES (:voucher_id, :client_id, :machine_id, :product, :code, :type, :value, :now)`),

  // ----- Antrean Tagihan QRIS (Billing Orders) -----
  insertBillingOrder: db.prepare(`
    INSERT INTO billing_orders (client_id, machine_id, product, amount, status, created_at)
    VALUES (:client_id, :machine_id, :product, :amount, 'PENDING', :now)`),
  findPendingOrderByAmount: db.prepare(`
    SELECT * FROM billing_orders WHERE amount = ? AND status = 'PENDING' ORDER BY id DESC LIMIT 1`),
  findPendingOrderByMidAndAmount: db.prepare(`
    SELECT * FROM billing_orders WHERE machine_id = ? AND amount = ? AND status = 'PENDING' ORDER BY id DESC LIMIT 1`),
  findLastOrderByAmount: db.prepare(`
    SELECT * FROM billing_orders WHERE amount = ? ORDER BY id DESC LIMIT 1`),
  billingOrderById: db.prepare(`SELECT * FROM billing_orders WHERE id = ?`),
  allBillingOrders: db.prepare(`
    SELECT o.*, c.name AS client_name, c.phone AS client_phone, c.expires_at AS client_expires_at, c.plan AS client_plan
    FROM billing_orders o
    LEFT JOIN clients c ON c.id = o.client_id
    ORDER BY o.id DESC LIMIT ?`),
  markOrderPaid: db.prepare(`UPDATE billing_orders SET status = 'PAID', paid_at = :now WHERE id = :id`),
  markOrderExpired: db.prepare(`UPDATE billing_orders SET status = 'EXPIRED', paid_at = :now WHERE id = :id`),
  cancelPendingOrdersForClient: db.prepare(`UPDATE billing_orders SET status = 'EXPIRED', paid_at = :now WHERE client_id = :client_id AND status = 'PENDING'`),
  clearExpiredOrders: db.prepare(`DELETE FROM billing_orders WHERE status = 'EXPIRED'`),
  countBillingOrders: db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) AS paid,
      SUM(CASE WHEN status = 'EXPIRED' THEN 1 ELSE 0 END) AS expired
    FROM billing_orders`),
  allSettings: db.prepare('SELECT key, value FROM settings'),
  upsertSetting: db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`),
  touchClient: db.prepare(`
    UPDATE clients SET last_seen = :now, last_ip = :ip,
      app_version = CASE WHEN :app_version = '' THEN app_version ELSE :app_version END
    WHERE id = :id`),
  deleteClient: db.prepare('DELETE FROM clients WHERE id = ?'),
  historyFor: db.prepare('SELECT * FROM license_history WHERE client_id = ? ORDER BY id DESC'),
  totalRevenue: db.prepare('SELECT SUM(amount) AS total FROM license_history'),
  insertHistory: db.prepare(`
    INSERT INTO license_history (client_id, action, months, amount, license_key, expires_before, expires_at, note, created_at)
    VALUES (:client_id, :action, :months, :amount, :license_key, :expires_before, :expires_at, :note, :now)`),
  activityFor: db.prepare('SELECT * FROM activity_log WHERE client_id = ? ORDER BY id DESC LIMIT 30'),
  activity: db.prepare('SELECT * FROM activity_log ORDER BY id DESC LIMIT ?'),
  activityByTypes: db.prepare(`SELECT * FROM activity_log WHERE type IN (SELECT value FROM json_each(?)) ORDER BY id DESC LIMIT ?`),
  insertActivity: db.prepare(`
    INSERT INTO activity_log (client_id, client_name, type, message, created_at) VALUES (?, ?, ?, ?, ?)`),

  // ----- Pesan broadcast -----
  messageById: db.prepare('SELECT * FROM client_messages WHERE id = ?'),
  messagesForClient: db.prepare('SELECT * FROM client_messages WHERE client_id = ? ORDER BY updated_at DESC, id DESC'),
  allMessages: db.prepare(`
    SELECT m.*, c.name AS client_name, c.product AS client_product, c.machine_id AS client_machine_id
    FROM client_messages m JOIN clients c ON c.id = m.client_id
    ORDER BY m.updated_at DESC, m.id DESC`),
  liveMessagesForClient: db.prepare(`
    SELECT id, title, message, type, interval_minutes, display_seconds, updated_at
    FROM client_messages
    WHERE client_id = :client_id AND is_active = 1
      AND (starts_at IS NULL OR starts_at <= :now)
      AND (ends_at IS NULL OR ends_at >= :now)
    ORDER BY updated_at DESC, id DESC`),
  insertMessage: db.prepare(`
    INSERT INTO client_messages (client_id, title, message, type, interval_minutes, display_seconds, is_active, starts_at, ends_at, created_at, updated_at)
    VALUES (:client_id, :title, :message, :type, :interval_minutes, :display_seconds, :is_active, :starts_at, :ends_at, :now, :now)`),
  updateMessage: db.prepare(`
    UPDATE client_messages SET title = :title, message = :message, type = :type, interval_minutes = :interval_minutes,
      display_seconds = :display_seconds, is_active = :is_active, starts_at = :starts_at, ends_at = :ends_at, updated_at = :now
    WHERE id = :id`),
  setMessageActive: db.prepare('UPDATE client_messages SET is_active = :is_active, updated_at = :now WHERE id = :id'),
  deleteMessage: db.prepare('DELETE FROM client_messages WHERE id = ?'),
};

export function logActivity(type, message, client = null) {
  q.insertActivity.run(client?.id ?? null, client?.name ?? '', type, message, nowIso());
}

/** Hitung status lisensi: active | expiring | expired | locked | pending | trial */
export function computeStatus(c) {
  if (c.locked) return 'locked';
  if (c.expires_at) {
    const days = daysUntil(c.expires_at);
    if (days >= 0) {
      if (days <= config.expiringDays) return 'expiring';
      return 'active';
    }
  }
  // Cek kuota gratis trial bila lisensi belum aktif atau sudah kedaluwarsa
  const quota = Number(c.trial_quota) || 0;
  const used = Number(c.trial_used) || 0;
  if (quota > 0 && used < quota) {
    return 'trial';
  }
  if (c.expires_at) return 'expired';
  return 'pending';
}

export function enrich(c) {
  const trialQuota = Number(c.trial_quota) || 0;
  const trialUsed = Number(c.trial_used) || 0;
  const trialRemaining = Math.max(0, trialQuota - trialUsed);
  const isTrial = trialQuota > 0 && trialUsed < trialQuota;

  return {
    ...c,
    locked: !!c.locked,
    status: computeStatus(c),
    days_left: c.expires_at ? daysUntil(c.expires_at) : null,
    trial_quota: trialQuota,
    trial_used: trialUsed,
    trial_remaining: trialRemaining,
    is_trial: isTrial,
  };
}

export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
