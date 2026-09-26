import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Linking, View } from 'react-native';

import { IconBell, IconExpense, IconIncome } from '@/components/icons';
import { clearOption, useSlidingHighlight } from '@/components/sliding-highlight';
import {
  EmptyBox,
  Header,
  Label,
  LinkText,
  Row,
  Screen,
  Stack,
  Stepper,
  SwitchRow,
  T,
  Tap,
  Toast,
  Toggle,
} from '@/components/ui';
import { C } from '@/constants/theme';
import { loadFixedData, setAllFixedReminders, setFixedReminder, type Fixed } from '@/db/repo';
import { t } from '@/i18n';
import { addDays, monthShort, nowDate, relativeDay, shortDate, todayISO, toISO, weekdayAbbr, weekdayOf } from '@/lib/dates';
import { fixedItems, type FixedItem } from '@/lib/finance';
import {
  atHour,
  notificationsAllowed,
  onNotificationsSynced,
  permissionState,
  sendTestNotification,
  upcomingNotifications,
  type PermissionState,
  type Upcoming,
} from '@/lib/notifications';
import { useApp, useLoad } from '@/state/app';
import { common, layout } from '@/styles/common';
import { styles as st } from '@/styles/screens/notificaciones.styles';

/** Hora guardada → clave de su etiqueta. */
const HOURS = [
  ['7:00', 'morning'],
  ['12:00', 'noon'],
  ['19:00', 'evening'],
] as const;

const HOUR_IDS = HOURS.map(([id]) => id);

/** Avisos que se ven antes de "Ver todos". */
const UPCOMING_SHOWN = 4;

/** Hasta dónde se buscan las próximas fechas de cada fijo (cubre los anuales). */
const DAYS_AHEAD = 400;

type Reminder = { remind: boolean; days: number };

/** "7:00 a. m." para una hora guardada o la de un aviso programado. */
const hourLabel = (hour: string) => {
  const key = HOURS.find(([id]) => id === hour)?.[1];
  return key ? t(`settings.alerts.hours.${key}`) : hour;
};

/** "hoy", "mañana" o "el mié 1 oct". */
const dayText = (iso: string, today: string) =>
  relativeDay(iso, today)?.toLowerCase() ??
  t('notificationSettings.on', { weekday: weekdayAbbr(weekdayOf(iso)), date: shortDate(iso) });

/** "hoy, 7:00 a. m." */
const whenText = (at: Date, today: string) =>
  t('notificationSettings.at', {
    day: dayText(toISO(at), today),
    hour: hourLabel(`${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}`),
  });

const remindLabel = (days: number) =>
  days === 0 ? t('fixedForm.remind.sameDay') : t('fixedForm.remind.daysBefore', { count: days });

export default function Notificaciones() {
  const db = useSQLiteContext();
  const { settings: s, updateSettings, holidays, bump } = useApp();
  const [perm, setPerm] = useState<PermissionState | null>(null);
  const [upcoming, setUpcoming] = useState<Upcoming[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [toast, setToast] = useState<{ title: string; text: string } | null>(null);
  // Cambios de cada fijo aplicados al instante, mientras la base se guarda y se recarga.
  const [edits, setEdits] = useState<Record<number, Reminder>>({});
  const hourHl = useSlidingHighlight({ keys: HOUR_IDS, selected: s.hour, color: C.inSoft, border: C.in });

  const refresh = useCallback(async () => {
    setPerm(await permissionState());
    setUpcoming(await upcomingNotifications());
  }, []);

  // Al volver de los ajustes del teléfono el permiso pudo cambiar.
  useFocusEffect(
    useCallback(() => {
      // Al volver a la pantalla manda lo guardado (un fijo pudo editarse en su formulario).
      setEdits({});
      refresh();
      const sub = AppState.addEventListener('change', (state) => state === 'active' && refresh());
      return () => sub.remove();
    }, [refresh]),
  );
  useEffect(() => onNotificationsSynced(refresh), [refresh]);

  const data = useLoad(
    async (d) => {
      const today = todayISO();
      const fixedData = await loadFixedData(d);
      const items = fixedItems(fixedData, addDays(today, -31), addDays(today, DAYS_AHEAD), s.holiday, holidays)
        .filter((i) => !i.paid)
        .sort((a, b) => (a.occ.date < b.occ.date ? -1 : 1));
      return { fixed: fixedData.fixed.filter((f) => f.active), items };
    },
    [s.holiday],
  );

  const fixed = data?.fixed ?? [];
  const reminderOf = (f: Fixed): Reminder => edits[f.id] ?? { remind: !!f.remind, days: f.remind_days };
  const onCount = fixed.filter((f) => reminderOf(f).remind).length;
  const anyOn = s.remindFijos || s.weekly;
  const today = todayISO();
  const now = nowDate();

  /** Si el permiso falta, lo pide; si está bloqueado, ofrece abrir los ajustes del teléfono. */
  const ensureAllowed = async () => {
    const ok = await notificationsAllowed(true);
    setPerm(await permissionState());
    if (ok) return;
    Alert.alert(t('notifications.denied.title'), t('notifications.denied.text'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('notifications.denied.open'), onPress: () => Linking.openSettings() },
    ]);
  };

  const toggleAlert = (key: 'remindFijos' | 'weekly') => {
    updateSettings({ [key]: !s[key] });
    if (!s[key]) ensureAllowed();
  };

  const saveReminder = async (f: Fixed, r: Reminder) => {
    setEdits((e) => ({ ...e, [f.id]: r }));
    await setFixedReminder(db, f.id, r.remind, r.days);
    bump();
  };

  const toggleFixed = (f: Fixed) => {
    const r = reminderOf(f);
    saveReminder(f, { ...r, remind: !r.remind });
    if (!r.remind) ensureAllowed();
  };

  const setAll = async (on: boolean) => {
    setEdits(Object.fromEntries(fixed.map((f) => [f.id, { ...reminderOf(f), remind: on }])));
    await setAllFixedReminders(db, on);
    bump();
    if (on) ensureAllowed();
  };

  const doTest = async () => {
    if (await sendTestNotification()) {
      setToast({
        title: t('notificationSettings.status.granted.testSent'),
        text: t('notificationSettings.status.granted.testSentText'),
      });
    } else {
      ensureAllowed();
    }
  };

  /** Próximo aviso y próxima fecha de un fijo según su recordatorio. */
  const nextFor = (f: Fixed, r: Reminder) => {
    const own = (data?.items ?? []).filter((i) => i.fixed.id === f.id && i.occ.date >= today);
    if (!r.remind) return { due: own[0] as FixedItem | undefined, notify: null };
    const due = own.find((i) => atHour(addDays(i.occ.date, -r.days), s.hour) > now);
    return { due, notify: due ? atHour(addDays(due.occ.date, -r.days), s.hour) : null };
  };

  const nextMonday = (() => {
    let m = addDays(today, (7 - weekdayOf(today)) % 7);
    if (atHour(m, s.hour) <= now) m = addDays(m, 7);
    return atHour(m, s.hour);
  })();

  const shownUpcoming = showAll ? upcoming : upcoming.slice(0, UPCOMING_SHOWN);

  return (
    <Screen bottom={48}>
      <Header onBack={() => router.back()} kicker={t('app.name')} title={t('notificationSettings.title')} />

      <T size={13.5} color={C.muted} style={st.intro}>
        {t('notificationSettings.intro')}
      </T>

      {toast && <Toast title={toast.title} text={toast.text} onClose={() => setToast(null)} />}

      {perm && (
        <PermissionCard
          perm={perm}
          anyOn={anyOn}
          upcoming={upcoming}
          today={today}
          onAsk={ensureAllowed}
          onTest={doTest}
        />
      )}

      {/* Fijos */}
      <Stack gap={10}>
        <Stack gap={4}>
          <T w={800} size={16}>
            {t('notificationSettings.fixed.title')}
          </T>
          <T size={12.5} color={C.muted}>
            {t('notificationSettings.fixed.text')}
          </T>
        </Stack>
        <View style={[common.box, common.boxPadded]}>
          <SwitchRow
            first
            label={t('notificationSettings.fixed.master')}
            desc={
              s.remindFijos && fixed.length
                ? t('notificationSettings.fixed.countOn', { on: onCount, total: fixed.length })
                : t('notificationSettings.fixed.masterText')
            }
            help={t('settings.help.remindFixed')}
            on={s.remindFijos}
            onPress={() => toggleAlert('remindFijos')}
          />
          {!s.remindFijos ? (
            <T size={12.5} color={C.muted} style={[common.divider, st.offNote]}>
              {t('notificationSettings.fixed.off')}
            </T>
          ) : fixed.length > 0 ? (
            <>
              <Row style={[common.divider, st.eachHeader]}>
                <T w={800} size={13} color={C.muted}>
                  {t('notificationSettings.fixed.each')}
                </T>
                <LinkText onPress={() => setAll(onCount < fixed.length)}>
                  {onCount < fixed.length ? t('notificationSettings.fixed.allOn') : t('notificationSettings.fixed.allOff')}
                </LinkText>
              </Row>
              {(['gasto', 'ingreso'] as const).map((kind) => {
                const list = fixed.filter((f) => f.type === kind);
                if (!list.length) return null;
                return (
                  <View key={kind}>
                    <T w={700} size={12} color={C.faint} style={st.kindLabel}>
                      {t(kind === 'gasto' ? 'common.expenses' : 'common.incomes').toUpperCase()}
                    </T>
                    {list.map((f, i) => {
                      const r = reminderOf(f);
                      const { due, notify } = nextFor(f, r);
                      return (
                        <FixedReminderRow
                          key={f.id}
                          fixed={f}
                          reminder={r}
                          first={i === 0}
                          detail={[
                            notify
                              ? t('notificationSettings.fixed.notifyOn', { when: whenText(notify, today) })
                              : !r.remind && t('notificationSettings.fixed.noReminder'),
                            due
                              ? t(`notificationSettings.fixed.dueOn.${kind}`, { when: dayText(due.occ.date, today) })
                              : t('notificationSettings.fixed.noDates'),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                          onToggle={() => toggleFixed(f)}
                          onDays={(days) => saveReminder(f, { ...r, days })}
                        />
                      );
                    })}
                  </View>
                );
              })}
            </>
          ) : (
            data && (
              <View style={[common.divider, st.offNote]}>
                <EmptyBox
                  title={t('notificationSettings.fixed.empty')}
                  hint={t('notificationSettings.fixed.emptyHint')}
                />
              </View>
            )
          )}
        </View>
      </Stack>

      {/* Resumen semanal */}
      <Stack gap={10}>
        <T w={800} size={16}>
          {t('notificationSettings.weekly.title')}
        </T>
        <View style={[common.box, common.boxPadded]}>
          <SwitchRow
            first
            label={t('settings.alerts.weekly')}
            desc={t('settings.alerts.weeklyText')}
            help={t('settings.help.weekly')}
            on={s.weekly}
            onPress={() => toggleAlert('weekly')}
          />
          {s.weekly && (
            <T w={600} size={12.5} color={C.inDark} style={st.weeklyNext}>
              {t('notificationSettings.weekly.next', { when: whenText(nextMonday, today) })}
            </T>
          )}
        </View>
      </Stack>

      {/* Hora */}
      <Stack gap={10}>
        <Stack gap={4}>
          <Label text={t('notificationSettings.hour.title')} help={t('settings.help.hour')} size={16} />
          <T size={12.5} color={C.muted}>
            {t('notificationSettings.hour.text')}
          </T>
        </Stack>
        <View style={[common.box, st.hourBox]}>
          <Row gap={8}>
            {hourHl.layer({ base: [st.hourPlate, st.hourOff], style: st.hourPlate })}
            {HOURS.map(([id, key]) => {
              const sel = s.hour === id;
              return (
                <Tap
                  key={id}
                  onPress={() => updateSettings({ hour: id })}
                  onLayout={hourHl.measure(id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: sel }}
                  style={[st.hour, hourHl.ready ? clearOption : sel ? st.hourOn : st.hourOff]}>
                  <T w={700} size={13} color={sel ? C.inDark : C.ink}>
                    {t(`settings.alerts.hours.${key}`)}
                  </T>
                </Tap>
              );
            })}
          </Row>
        </View>
      </Stack>

      {/* Alerta dentro de la app */}
      <Stack gap={10}>
        <Stack gap={4}>
          <T w={800} size={16}>
            {t('notificationSettings.inApp.title')}
          </T>
          <T size={12.5} color={C.muted}>
            {t('notificationSettings.inApp.text')}
          </T>
        </Stack>
        <View style={[common.box, common.boxPadded]}>
          <SwitchRow
            first
            label={t('settings.alerts.budget')}
            desc={t('settings.alerts.budgetText')}
            help={t('settings.help.budget')}
            on={s.budgetAlert}
            onPress={() => updateSettings({ budgetAlert: !s.budgetAlert })}
          />
          {s.budgetAlert && (
            <Row style={[common.divider, st.settingRowCompact]}>
              <Label
                text={t('settings.alerts.budgetAt')}
                help={t('settings.help.budgetAt')}
                w={700}
                size={14.5}
                style={layout.fill}
              />
              <Stepper
                minWidth={56}
                value={t('settings.alerts.percent', { pct: s.budget })}
                onDec={() => updateSettings({ budget: Math.max(50, s.budget - 5) })}
                onInc={() => updateSettings({ budget: Math.min(100, s.budget + 5) })}
                decLabel={t('settings.alerts.percentDown')}
                incLabel={t('settings.alerts.percentUp')}
              />
            </Row>
          )}
        </View>
      </Stack>

      {/* Próximos avisos */}
      {perm === 'granted' && upcoming.length > 0 && (
        <Stack gap={10}>
          <Stack gap={4}>
            <T w={800} size={16}>
              {t('notificationSettings.upcoming.title')}
            </T>
            <T size={12.5} color={C.muted}>
              {t('notificationSettings.upcoming.text')}
            </T>
          </Stack>
          <View style={[common.box, common.boxPadded]}>
            {shownUpcoming.map((u, i) => (
              <UpcomingRow key={u.id} item={u} today={today} first={i === 0} />
            ))}
            {upcoming.length > UPCOMING_SHOWN && (
              <Tap onPress={() => setShowAll(!showAll)} style={[common.divider, st.more]} accessibilityRole="button">
                <T w={700} size={13} color={C.in}>
                  {showAll
                    ? t('notificationSettings.upcoming.showLess')
                    : t('notificationSettings.upcoming.showAll', { count: upcoming.length })}
                </T>
              </Tap>
            )}
          </View>
        </Stack>
      )}
    </Screen>
  );
}

/** Tarjeta de arriba: si el teléfono deja avisar y qué viene. */
function PermissionCard({
  perm,
  anyOn,
  upcoming,
  today,
  onAsk,
  onTest,
}: {
  perm: PermissionState;
  anyOn: boolean;
  upcoming: Upcoming[];
  today: string;
  onAsk: () => void;
  onTest: () => void;
}) {
  const ok = perm === 'granted';
  const warn = perm === 'ask' || perm === 'blocked';
  const k = 'notificationSettings.status';
  const title = ok ? t(`${k}.granted.title`) : t(`${k}.${perm}.title`);
  const text = ok
    ? !anyOn
      ? t(`${k}.granted.allOff`)
      : upcoming.length
        ? t(`${k}.granted.scheduled`, { count: upcoming.length, when: whenText(upcoming[0].at, today) })
        : t(`${k}.granted.nothing`)
    : t(`${k}.${perm}.text`);
  const action = ok
    ? { label: t(`${k}.granted.test`), onPress: onTest }
    : perm === 'ask'
      ? { label: t(`${k}.ask.action`), onPress: onAsk }
      : perm === 'blocked'
        ? { label: t(`${k}.blocked.action`), onPress: () => Linking.openSettings() }
        : null;
  const accent = warn ? C.warn : C.inDark;

  return (
    <View style={[st.status, ok ? st.statusOk : warn ? st.statusWarn : st.statusOff]} accessibilityLiveRegion="polite">
      <Row gap={12}>
        <View style={[st.statusIcon, ok ? st.statusIconOk : warn ? st.statusIconWarn : st.statusIconOff]}>
          <IconBell size={22} color={ok || warn ? C.white : C.muted} />
        </View>
        <Stack gap={2} style={layout.fill}>
          <T w={800} size={15} color={ok || warn ? accent : C.ink}>
            {title}
          </T>
          <T size={12.5} color={C.muted2} style={common.bodyText}>
            {text}
          </T>
        </Stack>
      </Row>
      {action && (
        <Tap onPress={action.onPress} style={[common.outlineBtn, st.statusBtn]} accessibilityRole="button">
          <IconBell size={17} color={accent} />
          <T w={800} size={14} color={accent}>
            {action.label}
          </T>
        </Tap>
      )}
    </View>
  );
}

function FixedReminderRow({
  fixed: f,
  reminder: r,
  first,
  detail,
  onToggle,
  onDays,
}: {
  fixed: Fixed;
  reminder: Reminder;
  first: boolean;
  detail: string;
  onToggle: () => void;
  onDays: (days: number) => void;
}) {
  const isG = f.type === 'gasto';
  return (
    <Stack style={[st.fixedRow, !first && common.divider]}>
      <Row gap={10}>
        <View style={[st.fixedIcon, isG ? st.fixedIconOut : st.fixedIconIn]}>
          {isG ? <IconExpense size={16} color={C.out} /> : <IconIncome size={16} color={C.in} />}
        </View>
        <Stack gap={1} style={layout.fillShrink}>
          <T w={700} size={14.5} numberOfLines={1}>
            {f.name}
          </T>
          <T size={12} color={r.remind ? C.muted2 : C.faint}>
            {detail}
          </T>
        </Stack>
        <Toggle on={r.remind} onPress={onToggle} label={f.name} />
      </Row>
      {r.remind && (
        <Row style={st.remindDays}>
          <T w={600} size={13} color={C.muted}>
            {t('notificationSettings.fixed.remindWith')}
          </T>
          <Stepper
            minWidth={96}
            value={remindLabel(r.days)}
            onDec={() => onDays(Math.max(0, r.days - 1))}
            onInc={() => onDays(Math.min(7, r.days + 1))}
            decLabel={t('fixedForm.remind.decrease')}
            incLabel={t('fixedForm.remind.increase')}
          />
        </Row>
      )}
    </Stack>
  );
}

function UpcomingRow({ item, today, first }: { item: Upcoming; today: string; first: boolean }) {
  return (
    <Row gap={12} style={[st.upcomingRow, !first && common.divider]}>
      <View style={st.dateTile}>
        <T w={800} size={16} tabular>
          {item.at.getDate()}
        </T>
        <T w={700} size={11} color={C.muted}>
          {monthShort(item.at.getMonth())}
        </T>
      </View>
      <Stack gap={2} style={layout.fillShrink}>
        <T w={700} size={14} numberOfLines={1}>
          {item.title}
        </T>
        <T size={12.5} color={C.muted2} numberOfLines={2}>
          {item.body}
        </T>
        <T w={600} size={12} color={C.inDark}>
          {whenText(item.at, today)}
        </T>
      </Stack>
    </Row>
  );
}
