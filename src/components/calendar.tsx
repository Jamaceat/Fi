import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeInLeft, FadeInRight } from 'react-native-reanimated';

import { C } from '@/constants/theme';
import { t } from '@/i18n';
import { hasMarks, loadDays, marksOf, monthCells, type CalFilter, type DayData, type DayMarks } from '@/lib/calendar';
import {
  addDays,
  fromISO,
  monthAbbr,
  monthKey,
  monthName,
  monthShort,
  shortDate,
  todayISO,
  weekdayInitials,
  weekdayName,
  weekdayOf,
  type Period,
} from '@/lib/dates';
import type { HolidayMap } from '@/lib/holidays';
import { useApp, useLoad } from '@/state/app';
import { layout } from '@/styles/common';

import { styles as st } from './calendar.styles';
import { IconChevronLeft, IconChevronRight, IconExpand } from './icons';
import { RoundButton, Row, Segmented, Stack, T, Tap, type SegOption } from './ui';

/** Opciones del selector Todos / Gastos / Ingresos. */
export const calendarFilters = (): SegOption<CalFilter>[] => [
  { id: 'todos', label: t('common.all') },
  { id: 'gasto', label: t('common.expenses'), activeFg: C.white, activeBg: C.out },
  { id: 'ingreso', label: t('common.incomes'), activeFg: C.white, activeBg: C.in },
];

type Days = ReadonlyMap<string, DayData> | undefined;

// ——— Mes ———

const SIZES = {
  sm: { cell: 44, circle: 32, font: 13.5, dot: 5, gap: 3 },
  lg: { cell: 62, circle: 42, font: 17, dot: 6, gap: 5 },
} as const;

/** Semanas (lunes primero) del mes; se omiten las que quedan enteras en el mes siguiente. */
const weeksOf = (year: number, month: number) => {
  const cells = monthCells(year, month);
  const weeks: string[][] = [];
  for (let i = 0; i < 42; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks.filter((w) => w.some((d) => fromISO(d).getMonth() === month));
};

export function MonthGrid({
  year,
  month,
  days,
  filter,
  selected,
  onSelect,
  size = 'sm',
}: {
  year: number;
  month: number;
  days: Days;
  filter: CalFilter;
  selected?: string;
  onSelect: (iso: string) => void;
  size?: keyof typeof SIZES;
}) {
  const { holidays } = useApp();
  const today = todayISO();
  const z = SIZES[size];
  return (
    <View>
      <Row style={st.weekHeader}>
        {weekdayInitials().map((d, i) => (
          <T key={d + i} w={800} size={size === 'lg' ? 12.5 : 11.5} color={i >= 5 ? C.faint : C.muted} style={st.wd}>
            {d}
          </T>
        ))}
      </Row>
      {weeksOf(year, month).map((w) => (
        <Row key={w[0]}>
          {w.map((iso) => (
            <DayCell
              key={iso}
              iso={iso}
              z={z}
              inMonth={fromISO(iso).getMonth() === month}
              today={iso === today}
              selected={iso === selected}
              holiday={holidays.get(iso)}
              marks={marksOf(days?.get(iso), filter)}
              onPress={() => onSelect(iso)}
            />
          ))}
        </Row>
      ))}
    </View>
  );
}

function DayCell({
  iso,
  z,
  inMonth,
  today,
  selected,
  holiday,
  marks,
  onPress,
}: {
  iso: string;
  z: (typeof SIZES)[keyof typeof SIZES];
  inMonth: boolean;
  today: boolean;
  selected: boolean;
  holiday: string | undefined;
  marks: DayMarks;
  onPress: () => void;
}) {
  const d = fromISO(iso);
  const weekend = weekdayOf(iso) >= 5;
  const color = today ? C.white : holiday ? C.holidayDark : weekend ? C.muted : C.ink;
  const ring = z.circle + 6;
  const label = [
    t('calendar.a11y.day', { weekday: weekdayName(weekdayOf(iso)), day: d.getDate(), month: monthName(d.getMonth()).toLowerCase() }),
    today && t('calendar.a11y.today'),
    holiday && t('calendar.a11y.holiday', { name: holiday }),
    (marks.out || marks.outPending) && t('calendar.a11y.withExpenses'),
    (marks.in || marks.inPending) && t('calendar.a11y.withIncomes'),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[st.cell, { height: z.cell, gap: z.gap }, !inMonth && st.outOfMonth]}>
      <View
        style={[
          st.center,
          st.ring,
          { width: ring, height: ring, borderRadius: ring / 2 },
          selected && (today ? st.ringSelectedToday : st.ringSelected),
        ]}>
        <View
          style={[
            st.center,
            { width: z.circle, height: z.circle, borderRadius: z.circle / 2 },
            today ? st.dayToday : holiday ? st.dayHoliday : null,
          ]}>
          <T w={today || holiday ? 800 : 600} size={z.font} color={color} tabular>
            {d.getDate()}
          </T>
        </View>
      </View>
      <Row gap={3} style={{ height: z.dot, marginTop: -z.gap }}>
        {today && holiday && <Dot size={z.dot} color={C.holiday} />}
        {marks.out && <Dot size={z.dot} color={C.out} />}
        {marks.outPending && <Dot size={z.dot} color={C.out} ring />}
        {marks.in && <Dot size={z.dot} color={C.in} />}
        {marks.inPending && <Dot size={z.dot} color={C.in} ring />}
      </Row>
    </Tap>
  );
}

function Dot({ size, color, ring }: { size: number; color: string; ring?: boolean }) {
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color, borderColor: color },
        ring && st.dotRing,
      ]}
    />
  );
}

export function Legend({ filter }: { filter: CalFilter }) {
  const items: { key: string; label: string; node: ReactNode }[] = [
    { key: 'hoy', label: t('common.today'), node: <View style={[st.swatch, st.swatchToday]} /> },
    { key: 'fest', label: t('calendar.legend.holiday'), node: <View style={[st.swatch, st.swatchHoliday]} /> },
  ];
  if (filter !== 'ingreso') items.push({ key: 'g', label: t('common.expense'), node: <Dot size={7} color={C.out} /> });
  if (filter !== 'gasto') items.push({ key: 'i', label: t('common.income'), node: <Dot size={7} color={C.in} /> });
  items.push({ key: 'p', label: t('common.pending'), node: <Dot size={7} color={C.muted} ring /> });
  return (
    <Row gap={14} style={st.legend}>
      {items.map((it) => (
        <Row key={it.key} gap={6}>
          {it.node}
          <T w={700} size={11.5} color={C.muted}>
            {it.label}
          </T>
        </Row>
      ))}
    </Row>
  );
}

// ——— Selector de fecha ———

/** Elige un día con la misma cuadrícula del calendario (festivos y movimientos incluidos). */
export function DatePicker({
  value,
  onChange,
  filter = 'todos',
}: {
  value: string;
  onChange: (iso: string) => void;
  filter?: CalFilter;
}) {
  const { settings, holidays, needHolidays } = useApp();
  const today = todayISO();
  const [cursor, setCursor] = useState(() => {
    const d = fromISO(value);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [dir, setDir] = useState(0);
  const { year, month } = cursor;
  const { from, to } = cellsRange(year, month);

  useEffect(() => {
    needHolidays([year]);
  }, [year, needHolidays]);

  const days = useLoad((db) => loadDays(db, from, to, settings.holiday, holidays), [from, to, settings.holiday]);

  const go = (k: number) => {
    const d = new Date(year, month + k, 1);
    setDir(Math.sign(k));
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  };
  const shown = monthKey(year, month);
  const inToday = today.slice(0, 7) === shown;
  const enter = dir > 0 ? FadeInRight.duration(220) : dir < 0 ? FadeInLeft.duration(220) : FadeIn.duration(200);

  return (
    <Stack gap={12}>
      <Row style={layout.between}>
        <View>
          <T w={600} size={12.5} color={C.muted}>
            {year}
          </T>
          <T serif w={600} size={24} style={st.pickerTitle}>
            {monthName(month)}
          </T>
        </View>
        <Row gap={8}>
          {!inToday && (
            <Tap
              onPress={() => {
                setDir(today < shown ? -1 : 1);
                setCursor({ year: fromISO(today).getFullYear(), month: fromISO(today).getMonth() });
              }}
              style={st.todayBtn}
              accessibilityLabel={t('calendar.goToday')}>
              <T w={800} size={13}>
                {t('common.today')}
              </T>
            </Tap>
          )}
          <RoundButton label={t('calendar.prevMonth')} onPress={() => go(-1)}>
            <IconChevronLeft />
          </RoundButton>
          <RoundButton label={t('calendar.nextMonth')} onPress={() => go(1)}>
            <IconChevronRight />
          </RoundButton>
        </Row>
      </Row>
      <Animated.View key={shown} entering={enter} style={st.pickerGrid}>
        <MonthGrid year={year} month={month} days={days} filter={filter} selected={value} onSelect={onChange} />
      </Animated.View>
      <Legend filter={filter} />
    </Stack>
  );
}

// ——— Año ———

/** 12 meses en miniatura para saltar rápido a cualquier mes. */
export function YearGrid({
  year,
  days,
  filter,
  onPick,
}: {
  year: number;
  days: Days;
  filter: CalFilter;
  onPick: (month: number) => void;
}) {
  const { holidays } = useApp();
  const today = todayISO();
  const now = fromISO(today);
  return (
    <View style={st.yearGrid}>
      {Array.from({ length: 12 }, (_, m) => {
        const name = monthName(m);
        const current = now.getFullYear() === year && now.getMonth() === m;
        const prefix = `${monthKey(year, m)}-`;
        const nHol = [...holidays.keys()].filter((d) => d.startsWith(prefix)).length;
        return (
          <Tap
            key={m}
            onPress={() => onPick(m)}
            accessibilityLabel={
              nHol
                ? t('calendar.a11y.monthWithHolidays', { month: name, year, count: nHol })
                : t('calendar.a11y.month', { month: name, year })
            }
            style={[st.miniCard, current && st.miniCardCurrent]}>
            <Row style={layout.between}>
              <T serif w={600} size={15} color={current ? C.ink : C.muted2}>
                {monthAbbr(m)}
              </T>
              {nHol > 0 && (
                <View style={st.miniBadge}>
                  <T w={800} size={10} color={C.holidayDark}>
                    {nHol}
                  </T>
                </View>
              )}
            </Row>
            <MiniMonth year={year} month={m} days={days} filter={filter} holidays={holidays} today={today} />
          </Tap>
        );
      })}
    </View>
  );
}

function MiniMonth({
  year,
  month,
  days,
  filter,
  holidays,
  today,
}: {
  year: number;
  month: number;
  days: Days;
  filter: CalFilter;
  holidays: HolidayMap;
  today: string;
}) {
  return (
    <View>
      {weeksOf(year, month).map((w) => (
        <Row key={w[0]}>
          {w.map((iso) => {
            const inMonth = fromISO(iso).getMonth() === month;
            if (!inMonth) return <View key={iso} style={st.miniCell} />;
            const isToday = iso === today;
            const hol = holidays.has(iso);
            const mk = marksOf(days?.get(iso), filter);
            const dot = mk.out || mk.outPending ? (mk.in || mk.inPending ? C.ink : C.out) : mk.in || mk.inPending ? C.in : null;
            return (
              <View key={iso} style={st.miniCell}>
                <View style={[st.center, st.miniNum, isToday ? st.dayToday : hol ? st.dayHoliday : null]}>
                  <T w={isToday || hol ? 800 : 600} size={8.5} color={isToday ? C.white : hol ? C.holidayDark : C.muted2} tabular>
                    {fromISO(iso).getDate()}
                  </T>
                </View>
                <View style={[st.miniDot, { backgroundColor: dot ?? 'transparent' }]} />
              </View>
            );
          })}
        </Row>
      ))}
    </View>
  );
}

// ——— Tarjeta de Inicio ———

/** Primer festivo desde `from` (incluido). */
export function nextHoliday(holidays: HolidayMap, from: string) {
  let best: string | null = null;
  for (const d of holidays.keys()) if (d >= from && (!best || d < best)) best = d;
  return best ? { date: best, name: holidays.get(best)! } : null;
}

/** Rango de fechas que cubren las casillas de un mes. */
export const cellsRange = (year: number, month: number) => {
  const cells = monthCells(year, month);
  return { from: cells[0], to: addDays(cells[41], 1) };
};

/**
 * Tarjeta del calendario de Inicio. Recibe los días ya cargados (con `loadDays` sobre
 * `cellsRange`) para mostrarse completa desde el primer cuadro al cambiar de mes.
 */
export function CalendarCard({ period, days }: { period: Period; days: Days }) {
  const { holidays, needHolidays } = useApp();
  const [filter, setFilter] = useState<CalFilter>('todos');
  const { year, month } = period;

  useEffect(() => {
    needHolidays([year]);
  }, [year, needHolidays]);

  const today = todayISO();
  const next = nextHoliday(holidays, today);
  const monthMarks = [...(days?.entries() ?? [])].filter(
    ([d, v]) => fromISO(d).getMonth() === month && hasMarks(marksOf(v, filter)),
  ).length;

  const firstOfMonth = `${monthKey(year, month)}-01`;
  const open = (date?: string) =>
    router.push({
      pathname: '/calendario',
      params: { date: date ?? (today.startsWith(firstOfMonth.slice(0, 8)) ? today : firstOfMonth), filter },
    });

  return (
    <Animated.View entering={FadeIn.duration(250)} style={st.card}>
      <Row style={layout.between}>
        <Stack gap={2}>
          <T w={800} size={16}>
            {t('calendar.title')}
          </T>
          <T w={600} size={12.5} color={C.muted}>
            {monthMarks === 0 ? t('calendar.card.noMarks') : t('calendar.card.daysWithMarks', { count: monthMarks })}
          </T>
        </Stack>
        <RoundButton label={t('calendar.card.openFull')} onPress={() => open()}>
          <IconExpand size={17} />
        </RoundButton>
      </Row>

      <Segmented options={calendarFilters()} value={filter} onChange={setFilter} />

      <MonthGrid year={year} month={month} days={days} filter={filter} onSelect={(iso) => open(iso)} />

      <Legend filter={filter} />

      {next && (
        <Tap
          onPress={() => open(next.date)}
          style={st.nextHol}
          accessibilityLabel={t('calendar.card.nextHolidayLabel', { name: next.name, date: shortDate(next.date) })}>
          <View style={st.nextHolDate}>
            <T w={800} size={15} color={C.holidayDark} tabular>
              {fromISO(next.date).getDate()}
            </T>
            <T w={700} size={9.5} color={C.holidayDark}>
              {monthShort(fromISO(next.date).getMonth()).toUpperCase()}
            </T>
          </View>
          <Stack gap={1} style={layout.fillShrink}>
            <T w={700} size={11.5} color={C.holiday}>
              {next.date === today ? t('calendar.card.todayHoliday') : t('calendar.card.nextHoliday')}
            </T>
            <T w={700} size={14} numberOfLines={1}>
              {next.name}
            </T>
          </Stack>
          <T w={700} size={12} color={C.muted}>
            {weekdayName(weekdayOf(next.date))}
          </T>
        </Tap>
      )}
    </Animated.View>
  );
}
