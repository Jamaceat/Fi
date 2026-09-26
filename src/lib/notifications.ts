import { isRunningInExpoGo } from 'expo';
import type * as NotificationsModule from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { C } from '@/constants/theme';
import { listMovements, loadFixedData, type Settings } from '@/db/repo';
import { t } from '@/i18n';

import { addDays, diffDays, fromISO, realTodayISO, shortDate, weekdayName, weekdayOf } from './dates';
import { fixedItems, sum } from './finance';
import { APPROX, fmt, MASKED_AMOUNT } from './format';
import type { HolidayMap } from './holidays';

// Los avisos son locales: se calculan con los datos del teléfono y se programan por adelantado.
// Cada vez que cambian los datos o los ajustes se cancelan todos y se vuelven a programar.

const CHANNEL = 'avisos';
/** iOS guarda como mucho 64 avisos programados por app. */
const MAX_SCHEDULED = 60;
/** Hasta cuántos días adelante se programan los recordatorios de fijos. */
const DAYS_AHEAD = 60;
/** Cuántos resúmenes semanales se dejan programados. */
const WEEKS_AHEAD = 4;

/** `url` = ruta que abre la app al tocar el aviso. */
type Planned = { at: Date; title: string; body: string; url: string };

/**
 * Expo Go en Android ya no trae expo-notifications (SDK 53+): solo importarlo lanza un error y
 * tumba toda la app. Por eso se carga aquí y solo donde funciona (build de desarrollo o final).
 * Este es el único archivo que debe usar expo-notifications.
 */
export const notificationsSupported = Platform.OS !== 'web' && !(Platform.OS === 'android' && isRunningInExpoGo());

const Notifications: typeof NotificationsModule | null = notificationsSupported
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('expo-notifications')
  : null;

/** Muestra los avisos también con la app abierta. Se llama una vez al cargar la app. */
export function setupNotifications() {
  if (!Notifications) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/** Android 13+ solo muestra el permiso si ya existe un canal. */
async function ensureChannel() {
  if (!Notifications || Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: t('notifications.channel'),
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: C.in,
  });
}

/** ¿Puede la app mostrar avisos? Con `ask`, pide el permiso si el sistema aún lo permite. */
export async function notificationsAllowed(ask: boolean) {
  if (!Notifications) return false;
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!ask || !current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/**
 * Estado del permiso: 'granted' = puede avisar · 'ask' = aún se puede pedir ·
 * 'blocked' = solo se activa desde los ajustes del teléfono · 'unsupported' = web o Expo Go.
 */
export type PermissionState = 'granted' | 'ask' | 'blocked' | 'unsupported';

export async function permissionState(): Promise<PermissionState> {
  if (!Notifications) return 'unsupported';
  const p = await Notifications.getPermissionsAsync();
  return p.granted ? 'granted' : p.canAskAgain ? 'ask' : 'blocked';
}

/** Aviso programado, tal como lo verá la persona. */
export type Upcoming = { id: string; at: Date; title: string; body: string };

/** Avisos programados en el teléfono, del más cercano al más lejano. */
export async function upcomingNotifications(): Promise<Upcoming[]> {
  if (!Notifications) return [];
  const list = await Notifications.getAllScheduledNotificationsAsync();
  return list
    .map((r) => ({
      id: r.identifier,
      at: new Date(Number(r.content.data?.at)),
      title: r.content.title ?? '',
      body: r.content.body ?? '',
    }))
    .filter((u) => !isNaN(u.at.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Muestra un aviso de ejemplo en unos segundos, para comprobar que llegan. */
export async function sendTestNotification() {
  if (!Notifications || !(await notificationsAllowed(true))) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title: t('notifications.test.title'), body: t('notifications.test.body'), data: { url: '/notificaciones' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3, channelId: CHANNEL },
  });
  return true;
}

/**
 * Llama a `open` con la ruta del aviso que la persona toca, también si ese toque abrió la app.
 * Devuelve la función para dejar de escuchar.
 */
export function listenNotificationOpens(open: (url: string) => void) {
  if (!Notifications) return () => {};
  const handle = (n: NotificationsModule.Notification) => {
    const url = n.request.content.data?.url;
    if (typeof url === 'string') open(url);
  };
  const last = Notifications.getLastNotificationResponse();
  if (last) {
    handle(last.notification);
    Notifications.clearLastNotificationResponse();
  }
  const sub = Notifications.addNotificationResponseReceivedListener((r) => handle(r.notification));
  return () => sub.remove();
}

// Pantallas que muestran los avisos programados se enteran cuando termina una reprogramación.
const listeners = new Set<() => void>();

export function onNotificationsSynced(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Fecha ISO a la hora de los avisos ('7:00', '12:00', '19:00'). */
export const atHour = (iso: string, hour: Settings['hour']) => {
  const [h, m] = hour.split(':').map(Number);
  const d = fromISO(iso);
  d.setHours(h, m, 0, 0);
  return d;
};

/** "hoy", "mañana" o "el lunes 28 sep". */
const whenText = (date: string, from: string) => {
  const days = diffDays(date, from);
  if (days <= 0) return t('notifications.when.today');
  if (days === 1) return t('notifications.when.tomorrow');
  return t('notifications.when.on', { weekday: weekdayName(weekdayOf(date)).toLowerCase(), date: shortDate(date) });
};

async function plan(db: SQLiteDatabase, s: Settings, holidays: HolidayMap): Promise<Planned[]> {
  const now = new Date();
  const today = realTodayISO();
  const money = (n: number, approx = false) => (s.hideAmounts ? MASKED_AMOUNT : (approx ? APPROX : '') + fmt(n));
  const fixedData = await loadFixedData(db);
  const planned: Planned[] = [];

  if (s.remindFijos) {
    // Desde un mes atrás: una ocurrencia vieja pudo moverse a mano a una fecha futura.
    const items = fixedItems(fixedData, addDays(today, -31), addDays(today, DAYS_AHEAD), s.holiday, holidays);
    for (const i of items) {
      if (i.paid || !i.fixed.remind) continue;
      const day = addDays(i.occ.date, -i.fixed.remind_days);
      const at = atHour(day, s.hour);
      if (at <= now) continue;
      const params = { name: i.name, amount: money(i.amount, !!i.fixed.variable), when: whenText(i.occ.date, day) };
      planned.push({
        at,
        title: t(`notifications.fixed.title.${i.fixed.type}`, params),
        body: t(`notifications.fixed.body.${i.fixed.type}`, params),
        url: '/movimientos',
      });
    }
  }

  if (s.weekly) {
    const weeks = Array.from({ length: WEEKS_AHEAD + 1 }, (_, k) => addDays(today, 7 * k - weekdayOf(today)));
    const mondays = weeks.filter((m) => atHour(m, s.hour) > now).slice(0, WEEKS_AHEAD);
    if (mondays.length) {
      const last = mondays[mondays.length - 1];
      const movs = await listMovements(db, addDays(mondays[0], -7), last);
      const items = fixedItems(fixedData, mondays[0], addDays(last, 7), s.holiday, holidays);
      for (const monday of mondays) {
        const spent = sum(movs.filter((m) => m.type === 'gasto' && m.paid && m.date >= addDays(monday, -7) && m.date < monday));
        const next = addDays(monday, 7);
        const due = items.filter((i) => i.fixed.type === 'gasto' && !i.paid && i.occ.date >= monday && i.occ.date < next);
        const upcoming = due.length
          ? t('notifications.weekly.upcoming', { count: due.length, amount: money(sum(due), due.some((i) => !!i.fixed.variable)) })
          : t('notifications.weekly.nothingDue');
        planned.push({
          at: atHour(monday, s.hour),
          title: t('notifications.weekly.title'),
          body: t('notifications.weekly.body', { spent: money(spent), upcoming }),
          url: '/',
        });
      }
    }
  }

  return planned.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_SCHEDULED);
}

async function reschedule(db: SQLiteDatabase, s: Settings, holidays: HolidayMap) {
  if (!Notifications) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!s.remindFijos && !s.weekly) return;
  if (!(await notificationsAllowed(true))) return;
  for (const p of await plan(db, s, holidays)) {
    await Notifications.scheduleNotificationAsync({
      content: { title: p.title, body: p.body, data: { url: p.url, at: p.at.getTime() } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: CHANNEL },
    });
  }
}

// Una sola reprogramación a la vez: la siguiente espera a que termine la anterior.
let queue: Promise<void> = Promise.resolve();

/** Cancela los avisos programados y los vuelve a programar con los datos y ajustes actuales. */
export function syncNotifications(db: SQLiteDatabase, s: Settings, holidays: HolidayMap) {
  if (!Notifications) return Promise.resolve();
  queue = queue
    .then(() => reschedule(db, s, holidays))
    .catch(() => {})
    .then(() => listeners.forEach((l) => l()));
  return queue;
}
