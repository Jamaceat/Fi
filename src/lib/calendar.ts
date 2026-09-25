import type { SQLiteDatabase } from 'expo-sqlite';

import { listMovements, loadFixedData, type Movement } from '@/db/repo';

import { addDays, diffDays, toISO } from './dates';
import { fixedItems, type FixedItem } from './finance';
import type { HolidayRule, HolidaySet, Kind } from './schedule';

export type CalFilter = 'todos' | Kind;

export type DayData = {
  movs: Movement[];
  /** Fijos que caen ese día y aún no tienen un movimiento registrado. */
  fixed: FixedItem[];
};

export type DayMarks = {
  out: boolean;
  in: boolean;
  outPending: boolean;
  inPending: boolean;
};

/** Las 42 casillas (6 semanas, lunes primero) que muestran el mes `month` (0–11). */
export function monthCells(year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const start = toISO(new Date(year, month, 1 - lead));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/**
 * Movimientos y fijos agrupados por fecha real en [from, to).
 * Con `fixedId` solo se incluyen los pagos (registrados o por venir) de ese fijo.
 */
export async function loadDays(
  db: SQLiteDatabase,
  from: string,
  to: string,
  rule: HolidayRule,
  holidays: HolidaySet,
  fixedId?: number,
): Promise<Map<string, DayData>> {
  let [movs, data] = await Promise.all([listMovements(db, from, to), loadFixedData(db)]);
  if (fixedId != null) {
    movs = movs.filter((m) => m.fixed_id === fixedId);
    data = { ...data, fixed: data.fixed.filter((f) => f.id === fixedId) };
  }
  // La fecha nominal puede quedar fuera del rango al correrse por un festivo o por un cambio
  // manual de fecha: se amplía el margen lo necesario y luego se filtra por la fecha real.
  let margin = 15;
  for (const [key, o] of data.overrides) {
    if (o.date) margin = Math.max(margin, Math.abs(diffDays(o.date, key.split('|')[1])) + 15);
  }
  const items = fixedItems(data, addDays(from, -margin), addDays(to, margin), rule, holidays);

  const days = new Map<string, DayData>();
  const at = (iso: string) => {
    let d = days.get(iso);
    if (!d) days.set(iso, (d = { movs: [], fixed: [] }));
    return d;
  };
  for (const m of movs) at(m.date).movs.push(m);
  for (const it of items) {
    if (it.occ.date < from || it.occ.date >= to) continue;
    // Si ya se registró el movimiento, el día lo muestra por el movimiento.
    if (it.paid && it.status?.movement_id) continue;
    at(it.occ.date).fixed.push(it);
  }
  for (const d of days.values()) d.movs.reverse(); // más antiguos primero dentro del día
  return days;
}

export function marksOf(day: DayData | undefined, filter: CalFilter): DayMarks {
  const m: DayMarks = { out: false, in: false, outPending: false, inPending: false };
  if (!day) return m;
  const showOut = filter !== 'ingreso';
  const showIn = filter !== 'gasto';
  for (const x of day.movs) {
    if (x.type === 'gasto') {
      if (x.paid) m.out ||= showOut;
      else m.outPending ||= showOut;
    } else if (x.paid) m.in ||= showIn;
    else m.inPending ||= showIn;
  }
  for (const it of day.fixed) {
    if (it.fixed.type === 'gasto') {
      if (!showOut) continue;
      if (it.paid) m.out = true;
      else m.outPending = true;
    } else {
      if (!showIn) continue;
      if (it.paid) m.in = true;
      else m.inPending = true;
    }
  }
  return m;
}

export const hasMarks = (m: DayMarks) => m.out || m.in || m.outPending || m.inPending;
