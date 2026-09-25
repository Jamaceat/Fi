import { useFocusEffect } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState as RNAppState } from 'react-native';

import { DEFAULT_SETTINGS, getSettings, saveSettings, type Settings } from '@/db/repo';
import { backupIfDue, deleteBackup, importBackup, lastBackupAt, writeBackup, type Backup } from '@/lib/backup';
import { periodOf, periodRange, todayISO, type Period } from '@/lib/dates';
import { loadHolidays, syncHolidays, type HolidayMap } from '@/lib/holidays';

type AppState = {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  /** Mes que se está viendo en Inicio, Movimientos y Fijos. */
  period: Period;
  setPeriod: (p: Period) => void;
  currentPeriod: Period;
  range: { from: string; to: string };
  /** Cambia cada vez que se escribe en la base de datos, para recargar pantallas. */
  version: number;
  bump: () => void;
  /** Festivos de Colombia en caché (fecha ISO → nombre). */
  holidays: HolidayMap;
  /** Año → fecha ISO de la última descarga. */
  holidayYears: ReadonlyMap<number, string>;
  /** Pide (en segundo plano) los años que falten o estén vencidos. */
  needHolidays: (years: number[]) => void;
  /** Vuelve a descargar todos los años conocidos ignorando la caché. */
  refreshHolidays: () => Promise<{ updated: number; failed: number }>;
  /** Fecha ISO del último respaldo automático, o null si no hay. */
  lastBackup: string | null;
  /** Respalda ya, sin esperar la frecuencia. */
  backupNow: () => Promise<string>;
  /** Elimina el respaldo (al borrar todos los datos). */
  removeBackup: () => void;
  /** Reemplaza todos los datos y ajustes por los de un respaldo importado. */
  loadBackup: (backup: Backup) => Promise<void>;
};

type HolidayState = { map: HolidayMap; fetched: ReadonlyMap<number, string> };
const EMPTY_HOLIDAYS: HolidayState = { map: new Map(), fetched: new Map() };

const aroundToday = () => {
  const y = new Date().getFullYear();
  return [y - 1, y, y + 1];
};

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [period, setPeriod] = useState<Period | null>(null);
  const [version, setVersion] = useState(0);
  const [hol, setHol] = useState<HolidayState | null>(null);
  // Años ya pedidos en esta sesión, para no repetir la consulta en cada render.
  const asked = useRef(new Set<number>());
  // undefined = aún no se ha leído el archivo de respaldo.
  const [lastBackup, setLastBackup] = useState<string | null | undefined>(undefined);
  const lastBackupRef = useRef<string | null>(null);
  const backingUp = useRef(false);

  const reloadHolidays = useCallback(async () => {
    setHol(await loadHolidays(db));
    setVersion((v) => v + 1);
  }, [db]);

  const sync = useCallback(
    (years: number[], cacheDays: number, force = false) => {
      years.forEach((y) => asked.current.add(y));
      return syncHolidays(db, years, cacheDays, force).then(async (r) => {
        if (r.updated) await reloadHolidays();
        // Si falló (sin red), se reintenta la próxima vez que se necesite.
        if (r.failed) years.forEach((y) => asked.current.delete(y));
        return r;
      });
    },
    [db, reloadHolidays],
  );

  useEffect(() => {
    Promise.all([
      getSettings(db),
      loadHolidays(db).catch(() => EMPTY_HOLIDAYS),
      lastBackupAt().catch(() => null),
    ]).then(([s, h, b]) => {
      setSettings(s);
      setPeriod(periodOf(todayISO(), s.monthStart));
      setHol(h);
      lastBackupRef.current = b;
      setLastBackup(b);
      // Con la caché ya cargada se refresca en segundo plano lo que haga falta.
      sync(aroundToday(), s.holidayCacheDays).catch(() => {});
    });
  }, [db, sync]);

  const cacheDays = settings?.holidayCacheDays ?? DEFAULT_SETTINGS.holidayCacheDays;

  const needHolidays = useCallback(
    (years: number[]) => {
      const todo = years.filter((y) => !asked.current.has(y));
      if (todo.length) sync(todo, cacheDays).catch(() => {});
    },
    [sync, cacheDays],
  );

  const refreshHolidays = useCallback(
    () => sync([...new Set([...aroundToday(), ...(hol?.fetched.keys() ?? [])])], cacheDays, true),
    [sync, cacheDays, hol],
  );

  const updateSettings = (patch: Partial<Settings>) => {
    const next = { ...(settings ?? DEFAULT_SETTINGS), ...patch };
    setSettings(next);
    saveSettings(db, next);
    if (patch.monthStart !== undefined) setPeriod(periodOf(todayISO(), next.monthStart));
    // Una vigencia más corta puede dejar años vencidos: se revisan con la nueva.
    if (patch.holidayCacheDays !== undefined && hol) sync([...hol.fetched.keys()], next.holidayCacheDays).catch(() => {});
    setVersion((v) => v + 1);
  };

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const savedBackup = (at: string) => {
    lastBackupRef.current = at;
    setLastBackup(at);
    return at;
  };

  const backupDays = settings?.backupDays;
  const backupLoaded = lastBackup !== undefined;

  // Se revisa al abrir, tras cada cambio de datos y al entrar o salir de la app; solo escribe si ya toca.
  useEffect(() => {
    if (backupDays == null || !backupLoaded) return;
    const check = () => {
      if (backingUp.current) return;
      backingUp.current = true;
      backupIfDue(db, lastBackupRef.current, backupDays)
        .then((at) => at && savedBackup(at))
        .catch(() => {})
        .finally(() => {
          backingUp.current = false;
        });
    };
    check();
    const sub = RNAppState.addEventListener('change', (state) => {
      if (state === 'active' || state === 'background') check();
    });
    return () => sub.remove();
  }, [db, version, backupDays, backupLoaded]);

  const backupNow = async () => savedBackup(await writeBackup(db));

  const removeBackup = () => {
    deleteBackup();
    lastBackupRef.current = null;
    setLastBackup(null);
  };

  const loadBackup = async (backup: Backup) => {
    await importBackup(db, backup);
    const s = await getSettings(db);
    setSettings(s);
    setPeriod(periodOf(todayISO(), s.monthStart));
    savedBackup(backup.createdAt);
    setVersion((v) => v + 1);
  };

  if (!settings || !period || !hol || lastBackup === undefined) return null;

  const value: AppState = {
    settings,
    updateSettings,
    period,
    setPeriod,
    currentPeriod: periodOf(todayISO(), settings.monthStart),
    range: periodRange(period, settings.monthStart),
    version,
    bump,
    holidays: hol.map,
    holidayYears: hol.fetched,
    needHolidays,
    refreshHolidays,
    lastBackup,
    backupNow,
    removeBackup,
    loadBackup,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp fuera de AppProvider');
  return v;
}

/**
 * Carga datos de SQLite al enfocar la pantalla y cada vez que cambian los datos (`version`)
 * o las dependencias indicadas (que definen qué consulta hace `load`).
 */
export function useLoad<T>(load: (db: SQLiteDatabase) => Promise<T>, deps: unknown[]): T | undefined {
  const db = useSQLiteContext();
  const { version } = useApp();
  const [data, setData] = useState<T>();
  const key = JSON.stringify(deps);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      load(db).then((d) => alive && setData(d));
      return () => {
        alive = false;
      };
      // `load` es una función nueva en cada render; `key` resume de qué depende.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [db, version, key]),
  );
  return data;
}
