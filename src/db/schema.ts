import type { SQLiteDatabase } from 'expo-sqlite';

export const DB_NAME = 'finanzas.db';
const DATABASE_VERSION = 1;

/** Se ejecuta en SQLiteProvider.onInit antes de renderizar la app. */
export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version >= DATABASE_VERSION) return;

  if (version === 0) {
    await db.execAsync(`
PRAGMA journal_mode = 'wal';

CREATE TABLE IF NOT EXISTS fixed (
  id INTEGER PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('gasto','ingreso')),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  amount INTEGER NOT NULL,
  preset TEXT NOT NULL,
  day INTEGER NOT NULL DEFAULT 1,
  day1 INTEGER NOT NULL DEFAULT 15,
  day2 INTEGER NOT NULL DEFAULT 30,
  weekday INTEGER NOT NULL DEFAULT 0,
  custom_n INTEGER NOT NULL DEFAULT 1,
  custom_unit TEXT NOT NULL DEFAULT 'meses',
  variable INTEGER NOT NULL DEFAULT 0,
  auto_move INTEGER NOT NULL DEFAULT 1,
  remind INTEGER NOT NULL DEFAULT 1,
  remind_days INTEGER NOT NULL DEFAULT 2,
  start_date TEXT NOT NULL,
  end_date TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS movements (
  id INTEGER PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('gasto','ingreso')),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  amount INTEGER NOT NULL,
  date TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  fixed_id INTEGER REFERENCES fixed(id) ON DELETE SET NULL,
  fixed_due TEXT,
  extraordinary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_movements_date ON movements(date);

-- Estado de cada ocurrencia de un fijo: pagado/recibido o descartado.
CREATE TABLE IF NOT EXISTS fixed_status (
  fixed_id INTEGER NOT NULL REFERENCES fixed(id) ON DELETE CASCADE,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('paid','skipped')),
  amount INTEGER NOT NULL DEFAULT 0,
  movement_id INTEGER,
  resolved_at TEXT,
  PRIMARY KEY (fixed_id, due_date)
);

CREATE TABLE IF NOT EXISTS savings_entries (
  id INTEGER PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('add','update')),
  date TEXT NOT NULL,
  delta INTEGER NOT NULL,
  after INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  target INTEGER NOT NULL,
  saved INTEGER NOT NULL DEFAULT 0,
  last_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`);
    version = 1;
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
