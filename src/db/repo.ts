import type { SQLiteDatabase } from 'expo-sqlite';

import { addDays, todayISO } from '@/lib/dates';
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
  /** 1 = pagado/recibido; 0 = ocasional pendiente (no cuenta en los totales). */
  paid: number;
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
  /** Fecha nominal desde la que aplica esta configuración (NULL = desde start_date). */
  valid_from: string | null;
};

export type FixedInput = Omit<Fixed, 'id' | 'active' | 'end_date' | 'valid_from'>;

/** Configuración anterior de un fijo, vigente para fechas nominales en [valid_from, valid_to). */
export type FixedSegment = Omit<Schedule, 'end_date' | 'anticipated'> & {
  id: number;
  fixed_id: number;
  valid_from: string;
  valid_to: string;
  amount: number;
};

/** Ajuste de una sola ocurrencia: monto y/o fecha distintos a los del fijo. */
export type Override = { amount: number | null; date: string | null };

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

/** Bloques de Inicio que se pueden reordenar desde Ajustes. */
export const HOME_BLOCKS = ['hero', 'savings', 'pending', 'calendar', 'breakdown', 'recent'] as const;
export type HomeBlock = (typeof HOME_BLOCKS)[number];

/** Quita ids desconocidos o repetidos y agrega al final los bloques que falten. */
export function normalizeHomeOrder(order: unknown): HomeBlock[] {
  const known = new Set<string>(HOME_BLOCKS);
  const seen = new Set<HomeBlock>();
  if (Array.isArray(order)) {
    for (const id of order) if (known.has(id)) seen.add(id as HomeBlock);
  }
  return [...seen, ...HOME_BLOCKS.filter((b) => !seen.has(b))];
}

export type Settings = {
  defs: Record<Kind, DefaultPeriod>;
  monthStart: number;
  holiday: HolidayRule;
  /** Días que se reutilizan los festivos descargados antes de volver a pedirlos. */
  holidayCacheDays: number;
  /** Cada cuántos días se respaldan los datos automáticamente. */
  backupDays: number;
  remindFijos: boolean;
  budgetAlert: boolean;
  budget: number;
  weekly: boolean;
  hour: '7:00' | '12:00' | '19:00';
  hideAmounts: boolean;
  lock: boolean;
  /** Orden de los bloques en Inicio. */
  homeOrder: HomeBlock[];
};

export const DEFAULT_SETTINGS: Settings = {
  defs: {
    gasto: { preset: 'mensual', n: 2, unit: 'semanas' },
    ingreso: { preset: 'quincenal', n: 2, unit: 'semanas' },
  },
  monthStart: 1,
  holiday: 'antes',
  holidayCacheDays: 30,
  backupDays: 1,
  remindFijos: true,
  budgetAlert: true,
  budget: 80,
  weekly: false,
  hour: '7:00',
  hideAmounts: false,
  lock: false,
  homeOrder: [...HOME_BLOCKS],
};

// ——— Ajustes ———

export async function getSettings(db: SQLiteDatabase): Promise<Settings> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'app'");
  if (!row) return DEFAULT_SETTINGS;
  try {
    const saved = JSON.parse(row.value) as Partial<Settings>;
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      defs: { ...DEFAULT_SETTINGS.defs, ...saved.defs },
      homeOrder: normalizeHomeOrder(saved.homeOrder),
    };
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

type MovementInput = Omit<Movement, 'id' | 'fixed_id' | 'fixed_due' | 'extraordinary' | 'paid'> &
  Partial<Pick<Movement, 'fixed_id' | 'fixed_due' | 'extraordinary' | 'paid'>>;

export async function insertMovement(db: SQLiteDatabase, m: MovementInput) {
  const r = await db.runAsync(
    `INSERT INTO movements (type, name, category, amount, date, note, fixed_id, fixed_due, extraordinary, paid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    m.type, m.name, m.category, m.amount, m.date, m.note,
    m.fixed_id ?? null, m.fixed_due ?? null, m.extraordinary ?? 0, m.paid ?? 1,
  );
  return r.lastInsertRowId;
}

export async function updateMovement(
  db: SQLiteDatabase,
  id: number,
  m: Pick<Movement, 'type' | 'name' | 'category' | 'amount' | 'date' | 'note' | 'paid'>,
) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE movements SET type = ?, name = ?, category = ?, amount = ?, date = ?, note = ?, paid = ? WHERE id = ?',
      m.type, m.name, m.category, m.amount, m.date, m.note, m.paid, id,
    );
    // Mantiene el monto real del pago de un fijo sincronizado.
    await db.runAsync('UPDATE fixed_status SET amount = ? WHERE movement_id = ?', m.amount, id);
  });
}

/** Marca o desmarca un ocasional como pagado/recibido. */
export const setMovementPaid = (db: SQLiteDatabase, id: number, paid: boolean) =>
  db.runAsync('UPDATE movements SET paid = ? WHERE id = ?', paid ? 1 : 0, id);

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
  'custom_unit', 'anticipated', 'variable', 'auto_move', 'remind', 'remind_days', 'start_date',
] as const;

export async function insertFixed(db: SQLiteDatabase, f: FixedInput) {
  const r = await db.runAsync(
    `INSERT INTO fixed (${FIXED_COLS.join(', ')}) VALUES (${FIXED_COLS.map(() => '?').join(', ')})`,
    FIXED_COLS.map((c) => f[c]),
  );
  return r.lastInsertRowId;
}

const SCHEDULE_COLS = ['preset', 'day', 'day1', 'day2', 'weekday', 'custom_n', 'custom_unit'] as const;

/**
 * Guarda los cambios de un fijo.
 * - 'siguientes': la configuración anterior se conserva como tramo para las fechas ya pasadas o
 *   resueltas; la nueva aplica desde hoy (o desde después del último pago marcado).
 * - 'todos': reescribe el fijo completo, también hacia atrás (para corregir un error).
 */
export async function updateFixed(
  db: SQLiteDatabase,
  id: number,
  f: Omit<FixedInput, 'start_date'>,
  mode: 'siguientes' | 'todos' = 'siguientes',
) {
  const cols = FIXED_COLS.filter((c) => c !== 'start_date');
  await db.withTransactionAsync(async () => {
    const old = await getFixed(db, id);
    if (!old) return;
    if (old.anticipated !== f.anticipated && (await hasResolved(db, id))) f = { ...f, anticipated: old.anticipated };
    const scheduleChanged = SCHEDULE_COLS.some((c) => old[c] !== f[c]);
    const changed = scheduleChanged || old.amount !== f.amount;
    let validFrom = old.valid_from;

    if (mode === 'todos') {
      await db.runAsync('DELETE FROM fixed_segments WHERE fixed_id = ?', id);
      validFrom = null;
    } else if (changed) {
      const current = old.valid_from ?? old.start_date;
      const last = await db.getFirstAsync<{ due: string | null }>(
        'SELECT MAX(due_date) AS due FROM fixed_status WHERE fixed_id = ?',
        id,
      );
      let from = todayISO();
      if (last?.due && addDays(last.due, 1) > from) from = addDays(last.due, 1);
      if (from > current) {
        await db.runAsync(
          `INSERT INTO fixed_segments (fixed_id, valid_from, valid_to, amount, ${SCHEDULE_COLS.join(', ')}, start_date)
           VALUES (?, ?, ?, ?, ${SCHEDULE_COLS.map(() => '?').join(', ')}, ?)`,
          [id, current, from, old.amount, ...SCHEDULE_COLS.map((c) => old[c]), old.start_date],
        );
        validFrom = from;
      }
      // Con otras fechas, los ajustes de ocurrencias que ya no existen sobran.
      if (scheduleChanged) {
        await db.runAsync('DELETE FROM fixed_overrides WHERE fixed_id = ? AND due_date >= ?', id, validFrom ?? current);
      }
    }

    await db.runAsync(
      `UPDATE fixed SET ${cols.map((c) => `${c} = ?`).join(', ')}, valid_from = ? WHERE id = ?`,
      [...cols.map((c) => f[c]), validFrom, id],
    );
  });
}

/**
 * Tiene alguna ocurrencia pagada o descartada. Entonces ya no puede pasar entre anticipado y vencido:
 * eso quita o agrega la primera fecha y dejaría esos pagos sin su ocurrencia.
 */
export async function hasResolved(db: SQLiteDatabase, id: number) {
  const row = await db.getFirstAsync('SELECT 1 FROM fixed_status WHERE fixed_id = ? LIMIT 1', id);
  return row != null;
}

export async function listSegments(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<FixedSegment>('SELECT * FROM fixed_segments ORDER BY valid_from');
  const map = new Map<number, FixedSegment[]>();
  for (const r of rows) map.set(r.fixed_id, [...(map.get(r.fixed_id) ?? []), r]);
  return map;
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

/** Ajustes de ocurrencias sueltas, por statusKey. */
export async function overrideMap(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<Override & { fixed_id: number; due_date: string }>('SELECT * FROM fixed_overrides');
  return new Map(rows.map((r) => [statusKey(r.fixed_id, r.due_date), { amount: r.amount, date: r.date }]));
}

/** Cambia el monto y/o la fecha de una sola ocurrencia sin tocar el fijo. Ambos null = sin ajuste. */
export async function saveOverride(db: SQLiteDatabase, fixedId: number, due: string, o: Override) {
  if (o.amount == null && o.date == null) return clearOverride(db, fixedId, due);
  await db.runAsync(
    `INSERT INTO fixed_overrides (fixed_id, due_date, amount, date) VALUES (?, ?, ?, ?)
     ON CONFLICT(fixed_id, due_date) DO UPDATE SET amount = excluded.amount, date = excluded.date`,
    fixedId, due, o.amount, o.date,
  );
}

export const clearOverride = (db: SQLiteDatabase, fixedId: number, due: string) =>
  db.runAsync('DELETE FROM fixed_overrides WHERE fixed_id = ? AND due_date = ?', fixedId, due);

/** Todo lo necesario para calcular las ocurrencias de los fijos. */
export async function loadFixedData(db: SQLiteDatabase) {
  const [fixed, statuses, overrides, segments] = await Promise.all([
    listFixed(db),
    statusMap(db),
    overrideMap(db),
    listSegments(db),
  ]);
  return { fixed, statuses, overrides, segments };
}

/**
 * Marca una ocurrencia como pagada/recibida. Si el fijo tiene "Registrar al marcar",
 * crea el movimiento correspondiente. `extra` = confirmado en periodo extraordinario.
 * `amount` y `date` deben venir de la ocurrencia (tramo y ajuste incluidos); por defecto, los del fijo.
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

/** Borra todo menos los ajustes. El respaldo automático se elimina aparte (lib/backup). */
export const wipeData = (db: SQLiteDatabase) =>
  db.execAsync(`
DELETE FROM fixed_status;
DELETE FROM fixed_overrides;
DELETE FROM fixed_segments;
DELETE FROM movements;
DELETE FROM fixed;
DELETE FROM savings_entries;
DELETE FROM goals;
`);
