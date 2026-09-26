import type { SQLiteDatabase } from 'expo-sqlite';

export const DB_NAME = 'finanzas.db';
const DATABASE_VERSION = 7;

/**
 * Crea el movimiento de los fijos pagados/recibidos que no lo tienen (antes se podía apagar
 * "Registrar al marcar"). Corre al migrar y al restaurar un respaldo anterior.
 */
export const FILL_FIXED_MOVEMENTS = `
INSERT INTO movements (type, name, category, amount, date, note, fixed_id, fixed_due, extraordinary, paid)
SELECT f.type, f.name, f.category, s.amount, COALESCE(o.date, s.due_date), '', f.id, s.due_date,
       CASE WHEN s.resolved_at IS NULL THEN 0 ELSE 1 END, 1
FROM fixed_status s
JOIN fixed f ON f.id = s.fixed_id
LEFT JOIN fixed_overrides o ON o.fixed_id = s.fixed_id AND o.due_date = s.due_date
WHERE s.status = 'paid' AND s.movement_id IS NULL;

UPDATE fixed_status SET movement_id = (
  SELECT m.id FROM movements m
  WHERE m.fixed_id = fixed_status.fixed_id AND m.fixed_due = fixed_status.due_date
  ORDER BY m.id DESC LIMIT 1
)
WHERE status = 'paid' AND movement_id IS NULL;
`;

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

  if (version === 1) {
    await db.execAsync(`
-- Caché de festivos (API Nager.Date). Se refresca por año según Ajustes.
CREATE TABLE IF NOT EXISTS holidays (
  date TEXT PRIMARY KEY NOT NULL,
  year INTEGER NOT NULL,
  name TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_holidays_year ON holidays(year);

CREATE TABLE IF NOT EXISTS holiday_years (
  year INTEGER PRIMARY KEY NOT NULL,
  country TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
`);
    version = 2;
  }

  if (version === 2) {
    await db.execAsync(`
-- Monto ajustado para una sola ocurrencia pendiente de un fijo (no cambia el fijo).
CREATE TABLE IF NOT EXISTS fixed_overrides (
  fixed_id INTEGER NOT NULL REFERENCES fixed(id) ON DELETE CASCADE,
  due_date TEXT NOT NULL,
  amount INTEGER NOT NULL,
  PRIMARY KEY (fixed_id, due_date)
);
`);
    version = 3;
  }

  if (version === 3) {
    await db.execAsync(`
-- El ajuste de una ocurrencia puede cambiar el monto, la fecha o ambos.
CREATE TABLE fixed_overrides_v4 (
  fixed_id INTEGER NOT NULL REFERENCES fixed(id) ON DELETE CASCADE,
  due_date TEXT NOT NULL,
  amount INTEGER,
  date TEXT,
  PRIMARY KEY (fixed_id, due_date)
);
INSERT INTO fixed_overrides_v4 (fixed_id, due_date, amount) SELECT fixed_id, due_date, amount FROM fixed_overrides;
DROP TABLE fixed_overrides;
ALTER TABLE fixed_overrides_v4 RENAME TO fixed_overrides;

-- Desde qué fecha nominal aplica la configuración actual (NULL = desde start_date).
ALTER TABLE fixed ADD COLUMN valid_from TEXT;

-- Configuraciones anteriores de un fijo: aplican a las ocurrencias con fecha nominal en [valid_from, valid_to).
CREATE TABLE IF NOT EXISTS fixed_segments (
  id INTEGER PRIMARY KEY NOT NULL,
  fixed_id INTEGER NOT NULL REFERENCES fixed(id) ON DELETE CASCADE,
  valid_from TEXT NOT NULL,
  valid_to TEXT NOT NULL,
  amount INTEGER NOT NULL,
  preset TEXT NOT NULL,
  day INTEGER NOT NULL,
  day1 INTEGER NOT NULL,
  day2 INTEGER NOT NULL,
  weekday INTEGER NOT NULL,
  custom_n INTEGER NOT NULL,
  custom_unit TEXT NOT NULL,
  start_date TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fixed_segments_fixed ON fixed_segments(fixed_id);
`);
    version = 4;
  }

  if (version === 4) {
    await db.execAsync(`
-- Anticipado (1): se paga desde el periodo en que empieza. Vencido (0): desde el siguiente.
ALTER TABLE fixed ADD COLUMN anticipated INTEGER NOT NULL DEFAULT 1;
`);
    version = 5;
  }

  if (version === 5) {
    await db.execAsync(`
-- Ocasional pagado/recibido (1) o pendiente (0). Los ya registrados cuentan como pagados.
ALTER TABLE movements ADD COLUMN paid INTEGER NOT NULL DEFAULT 1;
`);
    version = 6;
  }

  if (version === 6) {
    // auto_move queda sin uso: un fijo pagado/recibido siempre tiene su movimiento.
    await db.execAsync(FILL_FIXED_MOVEMENTS);
    version = 7;
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
