import type { SQLiteDatabase } from 'expo-sqlite';

import { t } from '@/i18n';

// Festivos de Colombia desde Nager.Date (https://date.nager.at), guardados en SQLite.
// Cada año se descarga una sola vez y se vuelve a pedir cuando su caché supera la
// vigencia de Ajustes. Si no hay red se siguen usando los datos guardados.

const API = 'https://date.nager.at/api/v3/PublicHolidays';
export const COUNTRY = 'CO';
const TIMEOUT_MS = 10_000;

/** fecha ISO → nombre del festivo */
export type HolidayMap = ReadonlyMap<string, string>;

type NagerHoliday = { date: string; localName: string; name: string; types?: string[] };

export async function loadHolidays(db: SQLiteDatabase) {
  const [rows, years] = await Promise.all([
    db.getAllAsync<{ date: string; name: string }>('SELECT date, name FROM holidays ORDER BY date'),
    db.getAllAsync<{ year: number; fetched_at: string }>('SELECT year, fetched_at FROM holiday_years WHERE country = ?', COUNTRY),
  ]);
  return {
    map: new Map(rows.map((r) => [r.date, r.name])) as HolidayMap,
    fetched: new Map(years.map((y) => [y.year, y.fetched_at])),
  };
}

async function fetchYear(year: number): Promise<NagerHoliday[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}/${year}/${COUNTRY}`, { signal: ctrl.signal });
    if (res.status === 204) return [];
    if (!res.ok) throw new Error(t('holidays.httpError', { status: res.status }));
    return (await res.json()) as NagerHoliday[];
  } finally {
    clearTimeout(timer);
  }
}

const isStale = (fetchedAt: string | undefined, maxAgeDays: number) =>
  !fetchedAt || Date.now() - new Date(fetchedAt).getTime() > maxAgeDays * 86400000;

// Evita pedir el mismo año dos veces a la vez (varias pantallas pueden pedirlo).
const inFlight = new Map<number, Promise<boolean>>();

async function refreshYear(db: SQLiteDatabase, year: number): Promise<boolean> {
  const list = await fetchYear(year);
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM holidays WHERE year = ?', year);
    for (const h of list) {
      if (h.types && !h.types.includes('Public')) continue;
      await db.runAsync('INSERT OR REPLACE INTO holidays (date, year, name) VALUES (?, ?, ?)', h.date, year, h.localName || h.name);
    }
    await db.runAsync(
      'INSERT OR REPLACE INTO holiday_years (year, country, fetched_at) VALUES (?, ?, ?)',
      year, COUNTRY, now,
    );
  });
  return true;
}

/**
 * Descarga los años sin caché o con caché vencida (`force` ignora la vigencia).
 * Devuelve cuántos años se actualizaron y si alguno falló.
 */
export async function syncHolidays(
  db: SQLiteDatabase,
  years: number[],
  maxAgeDays: number,
  force = false,
): Promise<{ updated: number; failed: number }> {
  const { fetched } = await loadHolidays(db);
  const todo = [...new Set(years)].filter((y) => force || isStale(fetched.get(y), maxAgeDays));
  const results = await Promise.allSettled(
    todo.map((y) => {
      let p = inFlight.get(y);
      if (!p) {
        p = refreshYear(db, y).finally(() => inFlight.delete(y));
        inFlight.set(y, p);
      }
      return p;
    }),
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  return { updated: results.length - failed, failed };
}
