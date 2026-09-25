import { t } from '@/i18n';

import { addDays, clampDay, fromISO, toISO, weekdayName, weekdayOf } from './dates';

export type Kind = 'gasto' | 'ingreso';
export type Preset =
  | 'semanal' | 'quincenal' | 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual' | 'custom';
export type Unit = 'dias' | 'semanas' | 'meses';
export type HolidayRule = 'mantener' | 'antes' | 'despues';

export const PRESETS: { id: Exclude<Preset, 'custom'>; months?: number; perYear: number }[] = [
  { id: 'semanal', perYear: 52 },
  { id: 'quincenal', perYear: 24 },
  { id: 'mensual', months: 1, perYear: 12 },
  { id: 'bimestral', months: 2, perYear: 6 },
  { id: 'trimestral', months: 3, perYear: 4 },
  { id: 'semestral', months: 6, perYear: 2 },
  { id: 'anual', months: 12, perYear: 1 },
];

export const UNITS: readonly Unit[] = ['dias', 'semanas', 'meses'];

/** "Mensual", "Personalizada"… */
export const presetName = (preset: Preset) => t(`schedule.presets.${preset}.name`);

/** "Una vez al mes"… */
export const presetDesc = (preset: Preset) => t(`schedule.presets.${preset}.desc`);

/** "Semanas" (botón de unidad) */
export const unitLabel = (unit: Unit) => t(`schedule.units.${unit}.label`);

/** "semana" / "semanas" según `n`. */
export const unitWord = (unit: Unit, n: number) => t(`schedule.units.${unit}.word`, { count: n });

/** Lo mínimo para calcular fechas de un fijo. */
export type Schedule = {
  preset: Preset;
  day: number;
  day1: number;
  day2: number;
  weekday: number; // 0 = lunes
  custom_n: number;
  custom_unit: Unit;
  /** 1 = anticipado: se paga desde el periodo en que empieza; 0 = vencido: desde el siguiente. */
  anticipated: number;
  start_date: string; // primera fecha posible (inicio del periodo en que se creó)
  end_date: string | null; // al eliminar un fijo deja de repetirse después de esta fecha
};

export type Occurrence = {
  due: string; // fecha nominal: identifica la ocurrencia
  date: string; // fecha ajustada por fin de semana o festivo
};

/** Fechas festivas (ISO). Basta con `has`: sirve un Set o el Map de festivos. */
export type HolidaySet = { has(iso: string): boolean };

export const isBusinessDay = (iso: string, holidays?: HolidaySet) =>
  weekdayOf(iso) < 5 && !holidays?.has(iso);

export const perYear = (s: Pick<Schedule, 'preset' | 'custom_n' | 'custom_unit'>) => {
  if (s.preset !== 'custom') return PRESETS.find((p) => p.id === s.preset)!.perYear;
  const n = Math.max(1, s.custom_n);
  return s.custom_unit === 'dias' ? 365 / n : s.custom_unit === 'semanas' ? 52 / n : 12 / n;
};

/** "Cada 2 semanas" */
export const describeEvery = (n: number, unit: Unit) => t('schedule.every', { n, unit: unitWord(unit, n) });

export const describePreset = (preset: Preset, n: number, unit: Unit) =>
  preset === 'custom' ? describeEvery(n, unit) : presetName(preset);

/** "Mensual · día 5", "Quincenal · días 15 y 30", "Semanal · los viernes" */
export const describeSchedule = (s: Schedule) => {
  const base = describePreset(s.preset, s.custom_n, s.custom_unit);
  if (s.preset === 'quincenal') return t('schedule.describe.twoDays', { base, day1: s.day1, day2: s.day2 });
  if (isWeekly(s)) return t('schedule.describe.weekday', { base, weekday: weekdayName(s.weekday) });
  return t('schedule.describe.day', { base, day: s.day });
};

export const isWeekly = (s: Pick<Schedule, 'preset' | 'custom_unit'>) =>
  s.preset === 'semanal' || (s.preset === 'custom' && s.custom_unit === 'semanas');

/** Mueve la fecha al día hábil anterior/siguiente si cae en fin de semana o festivo. */
const adjust = (iso: string, rule: HolidayRule, holidays?: HolidaySet) => {
  if (rule === 'mantener') return iso;
  const step = rule === 'antes' ? -1 : 1;
  let d = iso;
  // Un puente largo nunca pasa de unos pocos días; el tope evita un bucle infinito.
  for (let i = 0; i < 14 && !isBusinessDay(d, holidays); i++) d = addDays(d, step);
  return d;
};

/**
 * Ocurrencias de un fijo cuya fecha nominal cae en [from, to).
 * La fecha real se ajusta según `rule` saltando fines de semana y los festivos dados.
 */
export function occurrences(
  s: Schedule,
  from: string,
  to: string,
  rule: HolidayRule = 'mantener',
  holidays?: HolidaySet,
): Occurrence[] {
  let lo = s.start_date > from ? s.start_date : from;
  if (!s.anticipated) {
    // Vencido: el periodo en que empieza se paga en el siguiente, así que la primera fecha no cuenta.
    const [first] = occurrences({ ...s, anticipated: 1, end_date: null }, s.start_date, addDays(s.start_date, 400));
    if (first && first.due >= lo) lo = addDays(first.due, 1);
  }
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
    .map((due) => ({ due, date: adjust(due, rule, holidays) }));
}

/** Las próximas `count` ocurrencias desde `fromISO` (incluido). */
export function nextOccurrences(s: Schedule, from: string, count: number, rule: HolidayRule, holidays?: HolidaySet) {
  const res: Occurrence[] = [];
  let a = from;
  for (let i = 0; i < 8 && res.length < count; i++) {
    const b = addDays(a, 400);
    res.push(...occurrences(s, a, b, rule, holidays));
    a = b;
  }
  return res.slice(0, count);
}
