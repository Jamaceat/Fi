import { MONTHS, MONTHS_SHORT } from './format';

// Todas las fechas se guardan como texto ISO local 'YYYY-MM-DD'.

const pad = (n: number) => String(n).padStart(2, '0');

export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const fromISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const todayISO = () => toISO(new Date());

export const lastDayOfMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/** Día `d` del mes (y, m); si el mes es más corto, el último día. Acepta m fuera de 0–11. */
export const clampDay = (y: number, m: number, d: number) => {
  const first = new Date(y, m, 1);
  return new Date(first.getFullYear(), first.getMonth(), Math.min(d, lastDayOfMonth(first.getFullYear(), first.getMonth())));
};

export const addDays = (iso: string, n: number) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

export const diffDays = (a: string, b: string) => Math.round((fromISO(a).getTime() - fromISO(b).getTime()) / 86400000);

/** Lunes = 0 … domingo = 6 */
export const weekdayOf = (iso: string) => (fromISO(iso).getDay() + 6) % 7;

// ——— Periodos ———
// Un "mes" de la app empieza el día `startDay` (Ajustes → Tu mes empieza el día).
// El periodo (year, month) va de [year-month-startDay, siguiente mes-startDay).

export type Period = { year: number; month: number };

export const periodRange = ({ year, month }: Period, startDay: number) => {
  const from = toISO(new Date(year, month, startDay));
  const to = toISO(new Date(year, month + 1, startDay));
  return { from, to }; // `to` es exclusivo
};

export const periodOf = (iso: string, startDay: number): Period => {
  const d = fromISO(iso);
  let year = d.getFullYear();
  let month = d.getMonth();
  if (d.getDate() < startDay) {
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
  }
  return { year, month };
};

export const shiftPeriod = ({ year, month }: Period, k: number): Period => {
  const d = new Date(year, month + k, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
};

export const samePeriod = (a: Period, b: Period) => a.year === b.year && a.month === b.month;

export const periodName = (p: Period) => MONTHS[p.month];

/** "22 sep" */
export const shortDate = (iso: string) => {
  const d = fromISO(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
};

/** "24 sep 2026" */
export const longDate = (iso: string) => `${shortDate(iso)} ${fromISO(iso).getFullYear()}`;
