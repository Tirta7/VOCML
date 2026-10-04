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
  product       TEXT NOT NULL CHECK (product IN ('billiard','pos')),
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
`);

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
  touchClient: db.prepare(`
    UPDATE clients SET last_seen = :now, last_ip = :ip,
      app_version = CASE WHEN :app_version = '' THEN app_version ELSE :app_version END
    WHERE id = :id`),
  deleteClient: db.prepare('DELETE FROM clients WHERE id = ?'),
  historyFor: db.prepare('SELECT * FROM license_history WHERE client_id = ? ORDER BY id DESC'),
  insertHistory: db.prepare(`
    INSERT INTO license_history (client_id, action, months, license_key, expires_before, expires_at, note, created_at)
    VALUES (:client_id, :action, :months, :license_key, :expires_before, :expires_at, :note, :now)`),
  activityFor: db.prepare('SELECT * FROM activity_log WHERE client_id = ? ORDER BY id DESC LIMIT 30'),
  activity: db.prepare('SELECT * FROM activity_log ORDER BY id DESC LIMIT ?'),
  activityByTypes: db.prepare(`SELECT * FROM activity_log WHERE type IN (SELECT value FROM json_each(?)) ORDER BY id DESC LIMIT ?`),
  insertActivity: db.prepare(`
    INSERT INTO activity_log (client_id, client_name, type, message, created_at) VALUES (?, ?, ?, ?, ?)`),
};

export function logActivity(type, message, client = null) {
  q.insertActivity.run(client?.id ?? null, client?.name ?? '', type, message, nowIso());
}

/** Hitung status lisensi: active | expiring | expired | locked | pending */
export function computeStatus(c) {
  if (c.locked) return 'locked';
  if (!c.expires_at) return 'pending';
  const days = daysUntil(c.expires_at);
  if (days < 0) return 'expired';
  if (days <= config.expiringDays) return 'expiring';
  return 'active';
}

export function enrich(c) {
  return {
    ...c,
    locked: !!c.locked,
    status: computeStatus(c),
    days_left: c.expires_at ? daysUntil(c.expires_at) : null,
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
