import { addDays, clampDay, fromISO, toISO, weekdayOf } from './dates';

export type Kind = 'gasto' | 'ingreso';
export type Preset =
  | 'semanal' | 'quincenal' | 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual' | 'custom';
export type Unit = 'dias' | 'semanas' | 'meses';
export type HolidayRule = 'mantener' | 'antes' | 'despues';

export const PRESETS: { id: Exclude<Preset, 'custom'>; name: string; desc: string; months?: number; perYear: number }[] = [
  { id: 'semanal', name: 'Semanal', desc: 'Cada 7 días', perYear: 52 },
  { id: 'quincenal', name: 'Quincenal', desc: 'Dos veces al mes', perYear: 24 },
  { id: 'mensual', name: 'Mensual', desc: 'Una vez al mes', months: 1, perYear: 12 },
  { id: 'bimestral', name: 'Bimestral', desc: 'Cada 2 meses', months: 2, perYear: 6 },
  { id: 'trimestral', name: 'Trimestral', desc: 'Cada 3 meses', months: 3, perYear: 4 },
  { id: 'semestral', name: 'Semestral', desc: 'Cada 6 meses', months: 6, perYear: 2 },
  { id: 'anual', name: 'Anual', desc: 'Una vez al año', months: 12, perYear: 1 },
];

export const UNITS: { id: Unit; label: string; one: string; many: string }[] = [
  { id: 'dias', label: 'Días', one: 'día', many: 'días' },
  { id: 'semanas', label: 'Semanas', one: 'semana', many: 'semanas' },
  { id: 'meses', label: 'Meses', one: 'mes', many: 'meses' },
];

/** Lo mínimo para calcular fechas de un fijo. */
export type Schedule = {
  preset: Preset;
  day: number;
  day1: number;
  day2: number;
  weekday: number; // 0 = lunes
  custom_n: number;
  custom_unit: Unit;
  start_date: string; // primera fecha posible (inicio del periodo en que se creó)
  end_date: string | null; // al eliminar un fijo deja de repetirse después de esta fecha
};

export type Occurrence = {
  due: string; // fecha nominal: identifica la ocurrencia
  date: string; // fecha ajustada por fin de semana
};

export const perYear = (s: Pick<Schedule, 'preset' | 'custom_n' | 'custom_unit'>) => {
  if (s.preset !== 'custom') return PRESETS.find((p) => p.id === s.preset)!.perYear;
  const n = Math.max(1, s.custom_n);
  return s.custom_unit === 'dias' ? 365 / n : s.custom_unit === 'semanas' ? 52 / n : 12 / n;
};

export const describePreset = (preset: Preset, n: number, unit: Unit) => {
  if (preset !== 'custom') return PRESETS.find((p) => p.id === preset)!.name;
  const u = UNITS.find((x) => x.id === unit)!;
  return `Cada ${n} ${n === 1 ? u.one : u.many}`;
};

const WD_FULL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

/** "Mensual · día 5", "Quincenal · días 15 y 30", "Semanal · los viernes" */
export const describeSchedule = (s: Schedule) => {
  const base = describePreset(s.preset, s.custom_n, s.custom_unit);
  if (s.preset === 'quincenal') return `${base} · días ${s.day1} y ${s.day2}`;
  if (isWeekly(s)) return `${base} · los ${WD_FULL[s.weekday]}`;
  return `${base} · día ${s.day}`;
};

export const isWeekly = (s: Pick<Schedule, 'preset' | 'custom_unit'>) =>
  s.preset === 'semanal' || (s.preset === 'custom' && s.custom_unit === 'semanas');

const adjust = (iso: string, rule: HolidayRule) => {
  if (rule === 'mantener') return iso;
  const wd = weekdayOf(iso); // 5 sábado, 6 domingo
  if (wd < 5) return iso;
  if (rule === 'antes') return addDays(iso, wd === 5 ? -1 : -2);
  return addDays(iso, wd === 5 ? 2 : 1);
};

/**
 * Ocurrencias de un fijo cuya fecha nominal cae en [from, to).
 * Solo se ajustan fines de semana (no hay calendario de festivos).
 */
export function occurrences(s: Schedule, from: string, to: string, rule: HolidayRule = 'mantener'): Occurrence[] {
  const lo = s.start_date > from ? s.start_date : from;
  let hi = to;
  if (s.end_date && s.end_date < hi) hi = addDays(s.end_date, 1);
  if (lo >= hi) return [];

  const out: string[] = [];
  const start = fromISO(s.start_date);
  const hiDate = fromISO(hi);

  if (isWeekly(s)) {
    const step = 7 * (s.preset === 'custom' ? Math.max(1, s.custom_n) : 1);
    let d = s.start_date;
    while (weekdayOf(d) !== s.weekday) d = addDays(d, 1);
    // salta directamente cerca de `lo`
    const skip = Math.max(0, Math.floor((fromISO(lo).getTime() - fromISO(d).getTime()) / 86400000 / step));
    d = addDays(d, skip * step);
    for (; d < hi; d = addDays(d, step)) out.push(d);
  } else if (s.preset === 'custom' && s.custom_unit === 'dias') {
    const step = Math.max(1, s.custom_n);
    let d = toISO(clampDay(start.getFullYear(), start.getMonth(), s.day));
    if (d < s.start_date) d = s.start_date;
    const skip = Math.max(0, Math.floor((fromISO(lo).getTime() - fromISO(d).getTime()) / 86400000 / step));
    d = addDays(d, skip * step);
    for (; d < hi; d = addDays(d, step)) out.push(d);
  } else {
    const k =
      s.preset === 'quincenal'
        ? 1
        : s.preset === 'custom'
          ? Math.max(1, s.custom_n)
          : PRESETS.find((p) => p.id === s.preset)!.months ?? 1;
    const days = s.preset === 'quincenal' ? [s.day1, s.day2].sort((a, b) => a - b) : [s.day];
    for (let i = 0; ; i += k) {
      const first = new Date(start.getFullYear(), start.getMonth() + i, 1);
      if (first > hiDate) break;
      for (const day of days) out.push(toISO(clampDay(first.getFullYear(), first.getMonth(), day)));
    }
  }

  return [...new Set(out)]
    .filter((d) => d >= lo && d < hi)
    .sort()
    .map((due) => ({ due, date: adjust(due, rule) }));
}

/** Las próximas `count` ocurrencias desde `fromISO` (incluido). */
export function nextOccurrences(s: Schedule, from: string, count: number, rule: HolidayRule) {
  const res: Occurrence[] = [];
  let a = from;
  for (let i = 0; i < 8 && res.length < count; i++) {
    const b = addDays(a, 400);
    res.push(...occurrences(s, a, b, rule));
    a = b;
  }
  return res.slice(0, count);
}
