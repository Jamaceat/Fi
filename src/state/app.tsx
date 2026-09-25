import { useFocusEffect } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { DEFAULT_SETTINGS, getSettings, saveSettings, type Settings } from '@/db/repo';
import { periodOf, periodRange, todayISO, type Period } from '@/lib/dates';

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
};

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [period, setPeriod] = useState<Period | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    getSettings(db).then((s) => {
      setSettings(s);
      setPeriod(periodOf(todayISO(), s.monthStart));
    });
  }, [db]);

  const updateSettings = (patch: Partial<Settings>) => {
    const next = { ...(settings ?? DEFAULT_SETTINGS), ...patch };
    setSettings(next);
    saveSettings(db, next);
    if (patch.monthStart !== undefined) setPeriod(periodOf(todayISO(), next.monthStart));
    setVersion((v) => v + 1);
  };

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  if (!settings || !period) return null;

  const value: AppState = {
    settings,
    updateSettings,
    period,
    setPeriod,
    currentPeriod: periodOf(todayISO(), settings.monthStart),
    range: periodRange(period, settings.monthStart),
    version,
    bump,
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
