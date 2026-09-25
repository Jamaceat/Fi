import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PanResponder, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInLeft, FadeInRight, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { calendarFilters, Legend, MonthGrid, YearGrid } from '@/components/calendar';
import { IconCalendar, IconChevronDown, IconChevronLeft, IconChevronRight, IconCollapse, IconPlus } from '@/components/icons';
import { Card, MovementRow, RoundButton, Row, Segmented, Stack, T, Tap } from '@/components/ui';
import { C } from '@/constants/theme';
import { getFixed, type Fixed } from '@/db/repo';
import { t } from '@/i18n';
import { hasMarks, loadDays, marksOf, monthCells, type CalFilter, type DayData } from '@/lib/calendar';
import {
  addDays,
  fromISO,
  fullDate,
  monthName,
  relativeDay,
  shortDate,
  toISO,
  todayISO,
  weekdayName,
  weekdayOf,
} from '@/lib/dates';
import type { FixedItem } from '@/lib/finance';
import { APPROX, fmt, fmtFlow, joinMeta } from '@/lib/format';
import { movementBadge } from '@/lib/labels';
import { describeSchedule } from '@/lib/schedule';
import { useApp, useLoad } from '@/state/app';
import { common, layout } from '@/styles/common';
import { styles as st } from '@/styles/screens/calendario.styles';

type Mode = 'mes' | 'año';
type Cursor = { year: number; month: number };

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const cursorOf = (iso: string): Cursor => {
  const d = fromISO(iso);
  return { year: d.getFullYear(), month: d.getMonth() };
};
/** Fecha ISO del día `day` del mes; acepta `month` fuera de 0–11. */
const isoOf = (year: number, month: number, day = 1) => toISO(new Date(year, month, day));
const shift = ({ year, month }: Cursor, k: number): Cursor => cursorOf(isoOf(year, month + k));

export default function Calendario() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string; filter?: string; fixed?: string }>();
  const { settings, holidays, needHolidays } = useApp();
  const today = todayISO();
  // Con ?fixed=<id> el calendario muestra solo los pagos pasados y futuros de ese fijo.
  const fixedId = params.fixed && /^\d+$/.test(params.fixed) ? Number(params.fixed) : undefined;
  const fx = useLoad(async (db) => (fixedId != null ? getFixed(db, fixedId) : null), [fixedId]);

  const start = params.date && ISO_RE.test(params.date) ? params.date : today;
  const [selected, setSelected] = useState(start);
  const [cursor, setCursor] = useState<Cursor>(() => cursorOf(start));
  const [mode, setMode] = useState<Mode>('mes');
  const [filter, setFilter] = useState<CalFilter>(
    params.filter === 'gasto' || params.filter === 'ingreso' ? params.filter : 'todos',
  );
  // Dirección del último cambio de mes/año, para animar la entrada desde ese lado.
  const [dir, setDir] = useState(0);

  const { year, month } = cursor;
  const isMonth = mode === 'mes';

  useEffect(() => {
    needHolidays([year - 1, year, year + 1]);
  }, [year, needHolidays]);

  // Se carga el año completo: cambiar de mes dentro del año no vuelve a consultar.
  const from = monthCells(year, 0)[0];
  const to = addDays(monthCells(year, 11)[41], 1);
  const days = useLoad(
    (db) => loadDays(db, from, to, settings.holiday, holidays, fixedId),
    [from, to, settings.holiday, fixedId],
  );
  // En modo fijo no hay selector: se muestra el tipo del fijo.
  const view: CalFilter = fx ? fx.type : filter;

  const go = useCallback(
    (k: number) => {
      setDir(Math.sign(k));
      setCursor((c) => (mode === 'mes' ? shift(c, k) : { ...c, year: c.year + k }));
    },
    [mode],
  );
  const goYear = (y: number) => {
    setDir(Math.sign(y - year));
    setCursor({ year: y, month });
  };
  const pickMonth = (m: number) => {
    setDir(0);
    setCursor({ year, month: m });
    setMode('mes');
    // Selecciona hoy si está en ese mes; si no, el día 1.
    const first = isoOf(year, m);
    setSelected(today.slice(0, 7) === first.slice(0, 7) ? today : first);
  };
  const goToday = () => {
    setDir(today < isoOf(year, month) ? -1 : 1);
    setCursor(cursorOf(today));
    setSelected(today);
    setMode('mes');
  };
  const select = (iso: string) => {
    const c = cursorOf(iso);
    if (c.year !== year || c.month !== month) {
      setDir(iso < isoOf(year, month) ? -1 : 1);
      setCursor(c);
    }
    setSelected(iso);
  };

  // Deslizar a los lados cambia de mes (o de año en la vista anual).
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
        onPanResponderTerminationRequest: () => true,
        onPanResponderRelease: (_, g) => {
          if (g.dx < -48 || g.vx < -0.5) go(1);
          else if (g.dx > 48 || g.vx > 0.5) go(-1);
        },
      }),
    [go],
  );

  const showingToday = isMonth ? today.slice(0, 7) === isoOf(year, month).slice(0, 7) : fromISO(today).getFullYear() === year;
  const monthPrefix = isoOf(year, month).slice(0, 8);
  const monthLower = monthName(month).toLowerCase();
  const monthHolidays = [...holidays.entries()].filter(([d]) => d.startsWith(monthPrefix)).sort();
  const monthDays = [...(days?.entries() ?? [])].filter(([d]) => d.startsWith(monthPrefix));
  const countDays = (f: CalFilter) => monthDays.filter(([, v]) => hasMarks(marksOf(v, f))).length;
  const payments = fx ? monthPayments(monthDays, today) : [];
  const fxKind = fx?.type ?? 'gasto';

  const enter = dir > 0 ? FadeInRight.duration(240) : dir < 0 ? FadeInLeft.duration(240) : FadeIn.duration(200);
  const years = Array.from({ length: 13 }, (_, i) => year - 6 + i);

  return (
    <View style={layout.screen}>
      <ScrollView contentContainerStyle={[st.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }]}>
        {/* Encabezado */}
        <Animated.View entering={FadeInDown.duration(260)} style={st.header}>
          <Row style={layout.between}>
            <RoundButton label={t('calendar.close')} onPress={() => router.back()}>
              <IconCollapse size={17} />
            </RoundButton>
            {!showingToday && (
              <Tap onPress={goToday} style={st.todayBtn} accessibilityLabel={t('calendar.goToday')}>
                <View style={st.todayDot} />
                <T w={800} size={13.5}>
                  {t('common.today')}
                </T>
              </Tap>
            )}
          </Row>
          {fx && (
            <Row gap={12} style={st.fixedHead}>
              <View style={[st.fixedAvatar, fx.type === 'ingreso' ? st.fixedAvatarIn : st.fixedAvatarOut]}>
                <IconCalendar size={20} color={fx.type === 'ingreso' ? C.inDark : C.outDark} />
              </View>
              <Stack gap={2} style={layout.fillShrink}>
                <T w={800} size={16} numberOfLines={1}>
                  {fx.name}
                </T>
                <T w={600} size={12.5} color={C.muted} numberOfLines={1}>
                  {joinMeta(describeSchedule(fx), fmt(fx.amount))}
                </T>
              </Stack>
            </Row>
          )}
          <Row style={layout.between}>
            <Tap
              onPress={() => {
                setDir(0);
                setMode(isMonth ? 'año' : 'mes');
              }}
              accessibilityRole="button"
              accessibilityLabel={isMonth ? t('calendar.showYear') : t('calendar.backToMonth')}
              style={st.modeToggle}>
              <T w={600} size={13} color={C.muted}>
                {isMonth ? t('calendar.tapForYear', { year }) : t('calendar.pickMonth')}
              </T>
              <Row gap={8}>
                <T serif w={600} size={32} style={st.title}>
                  {isMonth ? monthName(month) : year}
                </T>
                <View style={[st.chevron, !isMonth && st.chevronOpen]}>
                  <IconChevronDown size={18} color={C.muted} />
                </View>
              </Row>
            </Tap>
            <Row gap={8}>
              <RoundButton label={isMonth ? t('calendar.prevMonth') : t('calendar.prevYear')} onPress={() => go(-1)}>
                <IconChevronLeft />
              </RoundButton>
              <RoundButton label={isMonth ? t('calendar.nextMonth') : t('calendar.nextYear')} onPress={() => go(1)}>
                <IconChevronRight />
              </RoundButton>
            </Row>
          </Row>
        </Animated.View>

        {!fx && <Segmented options={calendarFilters()} value={filter} onChange={setFilter} />}

        {isMonth ? (
          <>
            <Row gap={8} style={layout.wrap}>
              <Stat color={C.holiday} bg={C.holidaySoft} text={t('calendar.stats.holidays', { count: monthHolidays.length })} />
              {view !== 'ingreso' && (
                <Stat color={C.outDark} bg={C.outSoft} text={t('calendar.stats.paymentDays', { count: countDays('gasto') })} />
              )}
              {view !== 'gasto' && (
                <Stat color={C.inDark} bg={C.inSoft} text={t('calendar.stats.incomeDays', { count: countDays('ingreso') })} />
              )}
            </Row>

            <View {...pan.panHandlers}>
              <Animated.View key={`${year}-${month}`} entering={enter} style={st.gridCard}>
                <MonthGrid year={year} month={month} days={days} filter={view} selected={selected} onSelect={select} size="lg" />
              </Animated.View>
            </View>
            <Legend filter={view} />

            {fx && (
              <Stack gap={8}>
                <T w={800} size={16}>
                  {t(`calendar.payments.title.${fxKind}`, { month: monthLower })}
                </T>
                <Card style={st.listCard}>
                  {payments.length === 0 ? (
                    <T size={13.5} color={C.muted} style={st.emptyPayments}>
                      {t(`calendar.payments.empty.${fxKind}`)}
                    </T>
                  ) : (
                    payments.map((p, i) => (
                      <PaymentRow key={p.key} p={p} fixed={fx} first={i === 0} selected={p.date === selected} onPress={() => select(p.date)} />
                    ))
                  )}
                </Card>
              </Stack>
            )}

            <DayDetail
              key={selected}
              iso={selected}
              day={days?.get(selected)}
              holiday={holidays.get(selected)}
              filter={view}
              today={today}
              canAdd={!fx}
            />

            {monthHolidays.length > 0 && (
              <Stack gap={8}>
                <T w={800} size={16}>
                  {t('calendar.holidaysOf', { month: monthLower })}
                </T>
                <Card style={st.listCard}>
                  {monthHolidays.map(([d, name], i) => (
                    <Tap key={d} onPress={() => select(d)} style={[st.holRow, i > 0 && common.divider]}>
                      <View style={st.holDate}>
                        <T w={800} size={15} color={C.holidayDark} tabular>
                          {fromISO(d).getDate()}
                        </T>
                      </View>
                      <View style={layout.fillShrink}>
                        <T w={700} size={14.5} numberOfLines={1}>
                          {name}
                        </T>
                        <T size={12.5} color={C.muted}>
                          {weekdayName(weekdayOf(d))}
                        </T>
                      </View>
                    </Tap>
                  ))}
                </Card>
              </Stack>
            )}
          </>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={st.years}
              contentOffset={{ x: 6 * 70 - 120, y: 0 }}>
              {years.map((y) => {
                const on = y === year;
                return (
                  <Tap
                    key={y}
                    onPress={() => goYear(y)}
                    accessibilityState={{ selected: on }}
                    style={[st.yearChip, on && st.yearChipOn]}>
                    <T w={800} size={14} color={on ? C.white : C.ink} tabular>
                      {y}
                    </T>
                  </Tap>
                );
              })}
            </ScrollView>
            <View {...pan.panHandlers}>
              <Animated.View key={year} entering={dir === 0 ? ZoomIn.duration(220) : enter}>
                <YearGrid year={year} days={days} filter={view} onPick={pickMonth} />
              </Animated.View>
            </View>
            <Legend filter={view} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <View style={[st.stat, { backgroundColor: bg }]}>
      <T w={800} size={12.5} color={color}>
        {text}
      </T>
    </View>
  );
}

/** Por qué la fecha real no es la nominal: cambio manual (caso aislado) o festivo/fin de semana. */
const movedNote = (it: FixedItem) =>
  it.moved
    ? t('calendar.note.moved', { date: shortDate(it.planned) })
    : it.occ.date !== it.occ.due
      ? t('calendar.note.holiday')
      : '';

type PaymentState = 'paid' | 'overdue' | 'today' | 'upcoming';

type Payment = {
  key: string;
  date: string;
  name: string;
  amount: number;
  state: PaymentState;
  note: string;
};

/** Pagos de un fijo en el mes: registrados (pasados) y pendientes o por venir, en orden de fecha. */
function monthPayments(monthDays: [string, DayData][], today: string): Payment[] {
  const out: Payment[] = [];
  for (const [date, v] of monthDays) {
    for (const m of v.movs) {
      // Pagado en un día distinto al que le tocaba: se muestra donde realmente se pagó.
      const note =
        m.fixed_due && m.fixed_due.slice(0, 7) !== date.slice(0, 7) ? t('calendar.note.from', { date: shortDate(m.fixed_due) }) : '';
      out.push({ key: `m${m.id}`, date, name: m.name, amount: m.amount, state: 'paid', note });
    }
    for (const it of v.fixed) {
      const state = it.paid ? 'paid' : date < today ? 'overdue' : date === today ? 'today' : 'upcoming';
      out.push({ key: `f${it.occ.due}`, date, name: it.name, amount: it.amount, state, note: movedNote(it) });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

const paymentLabel = (state: PaymentState, income: boolean) =>
  t(`calendar.payments.state.${state}.${income ? 'ingreso' : 'gasto'}`);

function PaymentRow({
  p,
  fixed,
  first,
  selected,
  onPress,
}: {
  p: Payment;
  fixed: Fixed;
  first: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const isIn = fixed.type === 'ingreso';
  const paid = p.state === 'paid';
  const label = paymentLabel(p.state, isIn);
  const color = paid ? (isIn ? C.in : C.ink) : p.state === 'upcoming' ? C.muted : C.warn;
  return (
    <Tap
      onPress={onPress}
      accessibilityLabel={t('calendar.payments.a11y', { name: p.name, date: shortDate(p.date), state: label })}
      accessibilityState={{ selected }}
      style={[st.holRow, !first && common.divider]}>
      <View style={[st.payDate, selected && st.payDateSelected, paid && (isIn ? st.payDatePaidIn : st.payDatePaidOut)]}>
        <T w={800} size={15} color={paid ? (isIn ? C.inDark : C.outDark) : C.ink} tabular>
          {fromISO(p.date).getDate()}
        </T>
      </View>
      <View style={layout.fillShrink}>
        <T w={700} size={14.5} numberOfLines={1}>
          {p.name}
        </T>
        <T w={700} size={12.5} color={color} numberOfLines={2}>
          {joinMeta(label, weekdayName(weekdayOf(p.date)), p.note)}
        </T>
      </View>
      <T w={800} size={14.5} color={isIn ? C.in : C.out} tabular>
        {!paid && fixed.variable ? APPROX : ''}
        {fmtFlow(p.amount, isIn)}
      </T>
    </Tap>
  );
}

function DayDetail({
  iso,
  day,
  holiday,
  filter,
  today,
  canAdd = true,
}: {
  iso: string;
  day: DayData | undefined;
  holiday: string | undefined;
  filter: CalFilter;
  today: string;
  canAdd?: boolean;
}) {
  const d = fromISO(iso);
  const show = (type: string) => filter === 'todos' || filter === type;
  const fixed = (day?.fixed ?? []).filter((it) => show(it.fixed.type));
  const movs = (day?.movs ?? []).filter((m) => show(m.type));
  const total = (type: string) =>
    movs.filter((m) => m.type === type).reduce((s, m) => s + m.amount, 0) +
    fixed.filter((it) => it.fixed.type === type).reduce((s, it) => s + it.amount, 0);
  const out = total('gasto');
  const inc = total('ingreso');
  const rel = relativeDay(iso, today);
  const isToday = iso === today;

  return (
    <Animated.View entering={FadeInDown.duration(220)} style={st.detail}>
      <Row gap={14}>
        <View style={[st.bigDay, isToday ? st.bigDayToday : holiday ? st.bigDayHoliday : null]}>
          <T serif w={600} size={26} color={isToday ? C.white : holiday ? C.holidayDark : C.ink} tabular>
            {d.getDate()}
          </T>
        </View>
        <Stack gap={2} style={layout.fill}>
          <T w={800} size={16} style={st.weekday}>
            {weekdayName(weekdayOf(iso))}
            {rel ? (
              <T w={700} size={13} color={C.muted}>
                {'  '}· {rel}
              </T>
            ) : null}
          </T>
          <T size={13} color={C.muted}>
            {fullDate(iso)}
          </T>
        </Stack>
      </Row>

      {holiday && (
        <Row gap={10} style={st.holBanner}>
          <View style={st.holBannerDot} />
          <View style={layout.fill}>
            <T w={700} size={11.5} color={C.holiday}>
              {t('calendar.day.holiday')}
            </T>
            <T w={800} size={14} color={C.holidayDark}>
              {holiday}
            </T>
          </View>
        </Row>
      )}

      {fixed.length + movs.length === 0 ? (
        <T size={13.5} color={C.muted} style={st.emptyDay}>
          {t(`calendar.day.empty.${filter}`)}
        </T>
      ) : (
        <View>
          {fixed.map((it, i) => {
            const isIn = it.fixed.type === 'ingreso';
            return (
              <MovementRow
                key={`f${it.fixed.id}${it.occ.due}`}
                first={i === 0}
                name={it.name}
                meta={joinMeta(it.fixed.category, t('common.fixed'), movedNote(it))}
                amount={fmtFlow(it.amount, isIn)}
                income={isIn}
                badge={
                  it.paid
                    ? isIn
                      ? t('common.received')
                      : t('common.paid')
                    : isIn
                      ? t('common.toReceive')
                      : t('common.pending')
                }
                onPress={() => router.push({ pathname: '/fijo/[id]', params: { id: String(it.fixed.id) } })}
              />
            );
          })}
          {movs.map((m, i) => (
            <MovementRow
              key={m.id}
              first={fixed.length === 0 && i === 0}
              name={m.name}
              meta={joinMeta(m.category, !!m.extraordinary && t('common.extraordinaryLower'))}
              amount={fmtFlow(m.amount, m.type === 'ingreso')}
              income={m.type === 'ingreso'}
              badge={movementBadge(m)}
              onPress={() => router.push({ pathname: '/nuevo', params: { id: String(m.id) } })}
            />
          ))}
          <Row gap={16} style={[common.divider, st.totals]}>
            {out > 0 && (
              <T w={800} size={13.5} color={C.out} tabular>
                {fmtFlow(out, false)}
              </T>
            )}
            {inc > 0 && (
              <T w={800} size={13.5} color={C.in} tabular>
                {fmtFlow(inc, true)}
              </T>
            )}
          </Row>
        </View>
      )}

      {canAdd && (
        <Tap
          onPress={() =>
            router.push({ pathname: '/nuevo', params: { date: iso, ...(filter === 'ingreso' ? { kind: 'ingreso' } : {}) } })
          }
          style={st.addBtn}
          accessibilityLabel={t('calendar.day.addLabel')}>
          <IconPlus size={16} />
          <T w={800} size={14}>
            {t('calendar.day.add')}
          </T>
        </Tap>
      )}
    </Animated.View>
  );
}
