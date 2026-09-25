import type { SQLiteDatabase } from 'expo-sqlite';

import { todayISO } from '@/lib/dates';
import type { HolidayRule, Kind, Preset, Schedule, Unit } from '@/lib/schedule';

// ——— Tipos ———

export type Movement = {
  id: number;
  type: Kind;
  name: string;
  category: string;
  amount: number;
  date: string;
  note: string;
  fixed_id: number | null;
  fixed_due: string | null;
  extraordinary: number;
};

export type Fixed = Schedule & {
  id: number;
  type: Kind;
  name: string;
  category: string;
  amount: number;
  variable: number;
  auto_move: number;
  remind: number;
  remind_days: number;
  active: number;
};

export type FixedInput = Omit<Fixed, 'id' | 'active' | 'end_date'>;

export type FixedStatus = {
  fixed_id: number;
  due_date: string;
  status: 'paid' | 'skipped';
  amount: number;
  movement_id: number | null;
  resolved_at: string | null;
};

export type SavingsEntry = { id: number; kind: 'add' | 'update'; date: string; delta: number; after: number };
export type Goal = { id: number; name: string; target: number; saved: number; last_date: string | null };

export type DefaultPeriod = { preset: Preset; n: number; unit: Unit };

export type Settings = {
  defs: Record<Kind, DefaultPeriod>;
  monthStart: number;
  holiday: HolidayRule;
  remindFijos: boolean;
  budgetAlert: boolean;
  budget: number;
  weekly: boolean;
  hour: '7:00' | '12:00' | '19:00';
  hideAmounts: boolean;
  lock: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  defs: {
    gasto: { preset: 'mensual', n: 2, unit: 'semanas' },
    ingreso: { preset: 'quincenal', n: 2, unit: 'semanas' },
  },
  monthStart: 1,
  holiday: 'antes',
  remindFijos: true,
  budgetAlert: true,
  budget: 80,
  weekly: false,
  hour: '7:00',
  hideAmounts: false,
  lock: false,
};

// ——— Ajustes ———

export async function getSettings(db: SQLiteDatabase): Promise<Settings> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'app'");
  if (!row) return DEFAULT_SETTINGS;
  try {
    const saved = JSON.parse(row.value) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...saved, defs: { ...DEFAULT_SETTINGS.defs, ...saved.defs } };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(db: SQLiteDatabase, s: Settings) {
  await db.runAsync(
    "INSERT INTO settings (key, value) VALUES ('app', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    JSON.stringify(s),
  );
}

// ——— Movimientos ———

export const listMovements = (db: SQLiteDatabase, from: string, to: string) =>
  db.getAllAsync<Movement>(
    'SELECT * FROM movements WHERE date >= ? AND date < ? ORDER BY date DESC, id DESC',
    from,
    to,
  );

export const getMovement = (db: SQLiteDatabase, id: number) =>
  db.getFirstAsync<Movement>('SELECT * FROM movements WHERE id = ?', id);

type MovementInput = Omit<Movement, 'id' | 'fixed_id' | 'fixed_due' | 'extraordinary'> &
  Partial<Pick<Movement, 'fixed_id' | 'fixed_due' | 'extraordinary'>>;

export async function insertMovement(db: SQLiteDatabase, m: MovementInput) {
  const r = await db.runAsync(
    `INSERT INTO movements (type, name, category, amount, date, note, fixed_id, fixed_due, extraordinary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    m.type, m.name, m.category, m.amount, m.date, m.note,
    m.fixed_id ?? null, m.fixed_due ?? null, m.extraordinary ?? 0,
  );
  return r.lastInsertRowId;
}

export async function updateMovement(
  db: SQLiteDatabase,
  id: number,
  m: Pick<Movement, 'type' | 'name' | 'category' | 'amount' | 'date' | 'note'>,
) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE movements SET type = ?, name = ?, category = ?, amount = ?, date = ?, note = ? WHERE id = ?',
      m.type, m.name, m.category, m.amount, m.date, m.note, id,
    );
    // Mantiene el monto real del pago de un fijo sincronizado.
    await db.runAsync('UPDATE fixed_status SET amount = ? WHERE movement_id = ?', m.amount, id);
  });
}

export async function deleteMovement(db: SQLiteDatabase, id: number) {
  await db.withTransactionAsync(async () => {
    // Si era el pago de un fijo, la ocurrencia vuelve a quedar pendiente.
    await db.runAsync('DELETE FROM fixed_status WHERE movement_id = ?', id);
    await db.runAsync('DELETE FROM movements WHERE id = ?', id);
  });
}

// ——— Fijos ———

export const listFixed = (db: SQLiteDatabase) => db.getAllAsync<Fixed>('SELECT * FROM fixed ORDER BY id');

export const getFixed = (db: SQLiteDatabase, id: number) =>
  db.getFirstAsync<Fixed>('SELECT * FROM fixed WHERE id = ?', id);

const FIXED_COLS = [
  'type', 'name', 'category', 'amount', 'preset', 'day', 'day1', 'day2', 'weekday', 'custom_n',
  'custom_unit', 'variable', 'auto_move', 'remind', 'remind_days', 'start_date',
] as const;

export async function insertFixed(db: SQLiteDatabase, f: FixedInput) {
  const r = await db.runAsync(
    `INSERT INTO fixed (${FIXED_COLS.join(', ')}) VALUES (${FIXED_COLS.map(() => '?').join(', ')})`,
    FIXED_COLS.map((c) => f[c]),
  );
  return r.lastInsertRowId;
}

export async function updateFixed(db: SQLiteDatabase, id: number, f: Omit<FixedInput, 'start_date'>) {
  const cols = FIXED_COLS.filter((c) => c !== 'start_date');
  await db.runAsync(
    `UPDATE fixed SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
    [...cols.map((c) => f[c]), id],
  );
}

/** Deja de repetirse; los pagos ya registrados se conservan. */
export const endFixed = (db: SQLiteDatabase, id: number) =>
  db.runAsync('UPDATE fixed SET active = 0, end_date = ? WHERE id = ?', todayISO(), id);

export const listStatuses = (db: SQLiteDatabase) => db.getAllAsync<FixedStatus>('SELECT * FROM fixed_status');

export const statusKey = (fixedId: number, due: string) => `${fixedId}|${due}`;

export async function statusMap(db: SQLiteDatabase) {
  const rows = await listStatuses(db);
  return new Map(rows.map((r) => [statusKey(r.fixed_id, r.due_date), r]));
}

/**
 * Marca una ocurrencia como pagada/recibida. Si el fijo tiene "Registrar al marcar",
 * crea el movimiento correspondiente. `extra` = confirmado en periodo extraordinario.
 */
export async function markPaid(
  db: SQLiteDatabase,
  f: Fixed,
  due: string,
  opts: { amount?: number; date?: string; extra?: boolean; forceMovement?: boolean } = {},
) {
  const amount = opts.amount ?? f.amount;
  await db.withTransactionAsync(async () => {
    let movementId: number | null = null;
    if (f.auto_move || opts.extra || opts.forceMovement) {
      movementId = await insertMovement(db, {
        type: f.type,
        name: f.name,
        category: f.category,
        amount,
        date: opts.date ?? due,
        note: '',
        fixed_id: f.id,
        fixed_due: due,
        extraordinary: opts.extra ? 1 : 0,
      });
    }
    await db.runAsync(
      `INSERT OR REPLACE INTO fixed_status (fixed_id, due_date, status, amount, movement_id, resolved_at)
       VALUES (?, ?, 'paid', ?, ?, ?)`,
      f.id, due, amount, movementId, opts.extra ? new Date().toISOString() : null,
    );
  });
}

/** Quita la marca (y el movimiento que se creó con ella). */
export async function unmark(db: SQLiteDatabase, fixedId: number, due: string) {
  await db.withTransactionAsync(async () => {
    const st = await db.getFirstAsync<FixedStatus>(
      'SELECT * FROM fixed_status WHERE fixed_id = ? AND due_date = ?',
      fixedId,
      due,
    );
    if (st?.movement_id) await db.runAsync('DELETE FROM movements WHERE id = ?', st.movement_id);
    await db.runAsync('DELETE FROM fixed_status WHERE fixed_id = ? AND due_date = ?', fixedId, due);
  });
}

/** Descarta una ocurrencia sin confirmar ("Borrar" en Historial). */
export const skipOccurrence = (db: SQLiteDatabase, fixedId: number, due: string) =>
  db.runAsync(
    `INSERT OR REPLACE INTO fixed_status (fixed_id, due_date, status, amount, movement_id, resolved_at)
     VALUES (?, ?, 'skipped', 0, NULL, ?)`,
    fixedId, due, new Date().toISOString(),
  );

// ——— Ahorro ———

export const listSavings = (db: SQLiteDatabase) =>
  db.getAllAsync<SavingsEntry>('SELECT * FROM savings_entries ORDER BY date DESC, id DESC');

export const insertSavings = (db: SQLiteDatabase, e: Omit<SavingsEntry, 'id'>) =>
  db.runAsync(
    'INSERT INTO savings_entries (kind, date, delta, after) VALUES (?, ?, ?, ?)',
    e.kind, e.date, e.delta, e.after,
  );

export const listGoals = (db: SQLiteDatabase) => db.getAllAsync<Goal>('SELECT * FROM goals ORDER BY id');

export const insertGoal = (db: SQLiteDatabase, name: string, target: number) =>
  db.runAsync('INSERT INTO goals (name, target) VALUES (?, ?)', name, target);

export const contributeGoal = (db: SQLiteDatabase, id: number, amount: number) =>
  db.runAsync('UPDATE goals SET saved = saved + ?, last_date = ? WHERE id = ?', amount, todayISO(), id);

export const deleteGoal = (db: SQLiteDatabase, id: number) => db.runAsync('DELETE FROM goals WHERE id = ?', id);

// ——— Datos ———

/** Borra todo menos los ajustes. */
export const wipeData = (db: SQLiteDatabase) =>
  db.execAsync(`
DELETE FROM fixed_status;
DELETE FROM movements;
DELETE FROM fixed;
DELETE FROM savings_entries;
DELETE FROM goals;
`);
