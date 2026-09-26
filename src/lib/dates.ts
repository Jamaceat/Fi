import { t, tList } from '@/i18n';
import { DEV_TOOLS } from '@/lib/devtools';

// Todas las fechas se guardan como texto ISO local 'YYYY-MM-DD'.

const pad = (n: number) => String(n).padStart(2, '0');

export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const fromISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Solo en desarrollo: reloj simulado (Ajustes → Desarrollo) para probar otros días y horas.
// Es un desfase sobre la hora real, así que sigue avanzando y cambia de día a medianoche.
let clockOffset = 0;

/** Desfase del reloj simulado en ms (0 = hora real). */
export const getClockOffset = () => clockOffset;

/** Pone el reloj simulado en `date` (null = volver a la hora real). */
export const setSimulatedNow = (date: Date | null) => {
  clockOffset = DEV_TOOLS && date ? date.getTime() - Date.now() : 0;
};

/** Ahora, según el reloj de la app (simulado en desarrollo). */
export const nowDate = () => new Date(Date.now() + clockOffset);

/** Pasa `iso` a hoy conservando la hora actual del reloj. */
export const setSimulatedToday = (iso: string | null) => {
  if (!iso) return setSimulatedNow(null);
  const now = nowDate();
  const d = fromISO(iso);
  d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  setSimulatedNow(d);
};

export const todayISO = () => toISO(nowDate());

/** Fecha real del teléfono, ignorando la simulada. */
export const realTodayISO = () => toISO(new Date());

/** "2026-09" (mes 0–11) */
export const monthKey = (year: number, month: number) => `${year}-${pad(month + 1)}`;

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

// ——— Nombres ———

/** "Septiembre" (mes 0–11) */
export const monthName = (month: number) => tList('dates.months')[month];

/** "Sep" (mes 0–11), para etiquetas cortas con mayúscula. */
export const monthAbbr = (month: number) => tList('dates.monthsAbbr')[month];

/** "sep" (mes 0–11) */
export const monthShort = (month: number) => tList('dates.monthsShort')[month];

/** "miércoles" (lunes = 0) */
export const weekdayName = (weekday: number) => tList('dates.weekdays')[weekday];

/** "mié" (lunes = 0) */
export const weekdayAbbr = (weekday: number) => tList('dates.weekdaysAbbr')[weekday];

/** Iniciales de los días, lunes primero. */
export const weekdayInitials = () => tList('dates.weekdaysInitial');

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

export const periodName = (p: Period) => monthName(p.month);

/** "Septiembre 2026" */
export const periodLabel = (p: Period) => `${periodName(p)} ${p.year}`;

/** "22 sep" */
export const shortDate = (iso: string) => {
  const d = fromISO(iso);
  return t('dates.short', { day: d.getDate(), month: monthShort(d.getMonth()) });
};

/** "24 sep 2026" */
export const longDate = (iso: string) => t('dates.long', { date: shortDate(iso), year: fromISO(iso).getFullYear() });

/** "24 de septiembre de 2026" */
export const fullDate = (iso: string) => {
  const d = fromISO(iso);
  return t('dates.full', { day: d.getDate(), month: monthName(d.getMonth()).toLowerCase(), year: d.getFullYear() });
};

/** "Hoy", "Mañana", "Ayer" o null. */
export const relativeDay = (iso: string, today: string) =>
  iso === today
    ? t('common.today')
    : iso === addDays(today, 1)
      ? t('common.tomorrow')
      : iso === addDays(today, -1)
        ? t('common.yesterday')
        : null;
