import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PanResponder, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInLeft, FadeInRight, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FILTERS, Legend, MonthGrid, YearGrid } from '@/components/calendar';
import { IconCalendar, IconChevronDown, IconChevronLeft, IconChevronRight, IconCollapse, IconPlus } from '@/components/icons';
import { Card, MovementRow, RoundButton, Row, Segmented, T, Tap } from '@/components/ui';
import { C } from '@/constants/theme';
import { getFixed, type Fixed } from '@/db/repo';
import { hasMarks, loadDays, marksOf, monthCells, type CalFilter, type DayData } from '@/lib/calendar';
import type { FixedItem } from '@/lib/finance';
import { addDays, fromISO, shortDate, toISO, todayISO, weekdayOf } from '@/lib/dates';
import { fmt, MONTHS, plural, WD_FULL } from '@/lib/format';
import { describeSchedule } from '@/lib/schedule';
import { useApp, useLoad } from '@/state/app';

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

  const showingToday = mode === 'mes' ? today.slice(0, 7) === isoOf(year, month).slice(0, 7) : fromISO(today).getFullYear() === year;
  const monthPrefix = isoOf(year, month).slice(0, 8);
  const monthHolidays = [...holidays.entries()].filter(([d]) => d.startsWith(monthPrefix)).sort();
  const monthDays = [...(days?.entries() ?? [])].filter(([d]) => d.startsWith(monthPrefix));
  const countDays = (f: CalFilter) => monthDays.filter(([, v]) => hasMarks(marksOf(v, f))).length;
  const payments = fx ? monthPayments(monthDays, today) : [];

  const enter = dir > 0 ? FadeInRight.duration(240) : dir < 0 ? FadeInLeft.duration(240) : FadeIn.duration(200);
  const years = Array.from({ length: 13 }, (_, i) => year - 6 + i);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: insets.bottom + 32, gap: 14 }}>
        {/* Encabezado */}
        <Animated.View entering={FadeInDown.duration(260)} style={{ gap: 12 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <RoundButton label="Cerrar calendario" onPress={() => router.back()}>
              <IconCollapse size={17} />
            </RoundButton>
            {!showingToday && (
              <Tap onPress={goToday} style={st.todayBtn} accessibilityLabel="Ir a hoy">
                <View style={st.todayDot} />
                <T w={800} size={13.5}>
                  Hoy
                </T>
              </Tap>
            )}
          </Row>
          {fx && (
            <Row gap={12} style={st.fixedHead}>
              <View style={[st.fixedAvatar, { backgroundColor: fx.type === 'ingreso' ? C.inSoft : C.outSoft }]}>
                <IconCalendar size={20} color={fx.type === 'ingreso' ? C.inDark : C.outDark} />
              </View>
              <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                <T w={800} size={16} numberOfLines={1}>
                  {fx.name}
                </T>
                <T w={600} size={12.5} color={C.muted} numberOfLines={1}>
                  {describeSchedule(fx)} · {fmt(fx.amount)}
                </T>
              </View>
            </Row>
          )}
          <Row style={{ justifyContent: 'space-between' }}>
            <Tap
              onPress={() => {
                setDir(0);
                setMode(mode === 'mes' ? 'año' : 'mes');
              }}
              accessibilityRole="button"
              accessibilityLabel={mode === 'mes' ? 'Ver todos los meses del año' : 'Volver al mes'}
              style={{ flexShrink: 1 }}>
              <T w={600} size={13} color={C.muted}>
                {mode === 'mes' ? `${year} · toca para ver el año` : 'Elige un mes'}
              </T>
              <Row gap={8}>
                <T serif w={600} size={32} style={{ letterSpacing: -0.5 }}>
                  {mode === 'mes' ? MONTHS[month] : year}
                </T>
                <View style={{ transform: [{ rotate: mode === 'año' ? '180deg' : '0deg' }], marginTop: 6 }}>
                  <IconChevronDown size={18} color={C.muted} />
                </View>
              </Row>
            </Tap>
            <Row gap={8}>
              <RoundButton label={mode === 'mes' ? 'Mes anterior' : 'Año anterior'} onPress={() => go(-1)}>
                <IconChevronLeft />
              </RoundButton>
              <RoundButton label={mode === 'mes' ? 'Mes siguiente' : 'Año siguiente'} onPress={() => go(1)}>
                <IconChevronRight />
              </RoundButton>
            </Row>
          </Row>
        </Animated.View>

        {!fx && <Segmented options={FILTERS} value={filter} onChange={setFilter} />}

        {mode === 'mes' ? (
          <>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              <Stat color={C.holiday} bg={C.holidaySoft} text={plural(monthHolidays.length, 'festivo', 'festivos')} />
              {view !== 'ingreso' && <Stat color={C.outDark} bg={C.outSoft} text={plural(countDays('gasto'), 'día de pago', 'días de pago')} />}
              {view !== 'gasto' && <Stat color={C.inDark} bg={C.inSoft} text={plural(countDays('ingreso'), 'día de ingreso', 'días de ingreso')} />}
            </Row>

            <View {...pan.panHandlers}>
              <Animated.View key={`${year}-${month}`} entering={enter} style={st.gridCard}>
                <MonthGrid year={year} month={month} days={days} filter={view} selected={selected} onSelect={select} size="lg" />
              </Animated.View>
            </View>
            <Legend filter={view} />

            {fx && (
              <View style={{ gap: 8 }}>
                <T w={800} size={16}>
                  {fx.type === 'ingreso' ? 'Ingresos' : 'Pagos'} de {MONTHS[month].toLowerCase()}
                </T>
                <Card style={{ paddingHorizontal: 14, paddingVertical: 4 }}>
                  {payments.length === 0 ? (
                    <T size={13.5} color={C.muted} style={{ textAlign: 'center', paddingVertical: 14 }}>
                      Este fijo no tiene {fx.type === 'ingreso' ? 'ingresos' : 'pagos'} este mes.
                    </T>
                  ) : (
                    payments.map((p, i) => (
                      <PaymentRow key={p.key} p={p} fixed={fx} first={i === 0} selected={p.date === selected} onPress={() => select(p.date)} />
                    ))
                  )}
                </Card>
              </View>
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
              <View style={{ gap: 8 }}>
                <T w={800} size={16}>
                  Festivos de {MONTHS[month].toLowerCase()}
                </T>
                <Card style={{ paddingHorizontal: 14, paddingVertical: 4 }}>
                  {monthHolidays.map(([d, name], i) => (
                    <Tap key={d} onPress={() => select(d)} style={[st.holRow, i > 0 && st.divider]}>
                      <View style={st.holDate}>
                        <T w={800} size={15} color={C.holidayDark} tabular>
                          {fromISO(d).getDate()}
                        </T>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <T w={700} size={14.5} numberOfLines={1}>
                          {name}
                        </T>
                        <T size={12.5} color={C.muted}>
                          {WD_FULL[weekdayOf(d)]}
                        </T>
                      </View>
                    </Tap>
                  ))}
                </Card>
              </View>
            )}
          </>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}
              contentOffset={{ x: 6 * 70 - 120, y: 0 }}>
              {years.map((y) => {
                const on = y === year;
                return (
                  <Tap
                    key={y}
                    onPress={() => goYear(y)}
                    accessibilityState={{ selected: on }}
                    style={[st.yearChip, on && { backgroundColor: C.ink, borderColor: C.ink }]}>
                    <T w={800} size={14} color={on ? '#FFFFFF' : C.ink} tabular>
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
  it.moved ? ` · fecha cambiada (era el ${shortDate(it.planned)})` : it.occ.date !== it.occ.due ? ' · corrido por festivo' : '';

type Payment = {
  key: string;
  date: string;
  name: string;
  amount: number;
  state: 'paid' | 'overdue' | 'today' | 'upcoming';
  note: string;
};

/** Pagos de un fijo en el mes: registrados (pasados) y pendientes o por venir, en orden de fecha. */
function monthPayments(monthDays: [string, DayData][], today: string): Payment[] {
  const out: Payment[] = [];
  for (const [date, v] of monthDays) {
    for (const m of v.movs) {
      // Pagado en un día distinto al que le tocaba: se muestra donde realmente se pagó.
      const note = m.fixed_due && m.fixed_due.slice(0, 7) !== date.slice(0, 7) ? ` · de ${shortDate(m.fixed_due)}` : '';
      out.push({ key: `m${m.id}`, date, name: m.name, amount: m.amount, state: 'paid', note });
    }
    for (const it of v.fixed) {
      const state = it.paid ? 'paid' : date < today ? 'overdue' : date === today ? 'today' : 'upcoming';
      out.push({ key: `f${it.occ.due}`, date, name: it.name, amount: it.amount, state, note: movedNote(it) });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

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
  const d = fromISO(p.date);
  const label = {
    paid: isIn ? 'Recibido' : 'Pagado',
    overdue: isIn ? 'Sin recibir' : 'Vencido',
    today: 'Hoy',
    upcoming: 'Próximo',
  }[p.state];
  const color = p.state === 'paid' ? (isIn ? C.in : C.ink) : p.state === 'upcoming' ? C.muted : C.warn;
  return (
    <Tap
      onPress={onPress}
      accessibilityLabel={`${p.name}, ${shortDate(p.date)}, ${label}`}
      accessibilityState={{ selected }}
      style={[st.holRow, !first && st.divider]}>
      <View style={[st.payDate, selected && { borderColor: C.ink }, p.state === 'paid' && { backgroundColor: isIn ? C.inSoft : C.outSoft }]}>
        <T w={800} size={15} color={p.state === 'paid' ? (isIn ? C.inDark : C.outDark) : C.ink} tabular>
          {d.getDate()}
        </T>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T w={700} size={14.5} numberOfLines={1}>
          {p.name}
        </T>
        <T w={700} size={12.5} color={color} numberOfLines={2}>
          {label} · {WD_FULL[weekdayOf(p.date)]}
          {p.note}
        </T>
      </View>
      <T w={800} size={14.5} color={isIn ? C.in : C.out} tabular>
        {p.state !== 'paid' && fixed.variable ? '≈ ' : ''}
        {(isIn ? '+ ' : '− ') + fmt(p.amount)}
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
  const show = (t: string) => filter === 'todos' || filter === t;
  const fixed = (day?.fixed ?? []).filter((it) => show(it.fixed.type));
  const movs = (day?.movs ?? []).filter((m) => show(m.type));
  const total = (t: string) =>
    movs.filter((m) => m.type === t).reduce((s, m) => s + m.amount, 0) +
    fixed.filter((it) => it.fixed.type === t).reduce((s, it) => s + it.amount, 0);
  const out = total('gasto');
  const inc = total('ingreso');
  const rel = iso === today ? 'Hoy' : iso === addDays(today, 1) ? 'Mañana' : iso === addDays(today, -1) ? 'Ayer' : null;

  return (
    <Animated.View entering={FadeInDown.duration(220)} style={st.detail}>
      <Row gap={14}>
        <View style={[st.bigDay, iso === today ? { backgroundColor: C.ink } : holiday ? { backgroundColor: C.holidaySoft } : null]}>
          <T serif w={600} size={26} color={iso === today ? '#FFFFFF' : holiday ? C.holidayDark : C.ink} tabular>
            {d.getDate()}
          </T>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T w={800} size={16} style={{ textTransform: 'capitalize' }}>
            {WD_FULL[weekdayOf(iso)]}
            {rel ? (
              <T w={700} size={13} color={C.muted}>
                {'  '}· {rel}
              </T>
            ) : null}
          </T>
          <T size={13} color={C.muted}>
            {d.getDate()} de {MONTHS[d.getMonth()].toLowerCase()} de {d.getFullYear()}
          </T>
        </View>
      </Row>

      {holiday && (
        <Row gap={10} style={st.holBanner}>
          <View style={st.holBannerDot} />
          <View style={{ flex: 1 }}>
            <T w={700} size={11.5} color={C.holiday}>
              Festivo en Colombia
            </T>
            <T w={800} size={14} color={C.holidayDark}>
              {holiday}
            </T>
          </View>
        </Row>
      )}

      {fixed.length + movs.length === 0 ? (
        <T size={13.5} color={C.muted} style={{ textAlign: 'center', paddingVertical: 10 }}>
          {filter === 'todos' ? 'Nada registrado este día.' : `Sin ${filter === 'gasto' ? 'gastos' : 'ingresos'} este día.`}
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
                meta={`${it.fixed.category} · Fijo${movedNote(it)}`}
                amount={(isIn ? '+ ' : '− ') + fmt(it.amount)}
                income={isIn}
                badge={it.paid ? (isIn ? 'Recibido' : 'Pagado') : isIn ? 'Por recibir' : 'Pendiente'}
                onPress={() => router.push({ pathname: '/fijo/[id]', params: { id: String(it.fixed.id) } })}
              />
            );
          })}
          {movs.map((m, i) => (
            <MovementRow
              key={m.id}
              first={fixed.length === 0 && i === 0}
              name={m.name}
              meta={`${m.category}${m.extraordinary ? ' · extraordinario' : ''}`}
              amount={(m.type === 'gasto' ? '− ' : '+ ') + fmt(m.amount)}
              income={m.type === 'ingreso'}
              badge={m.fixed_id != null ? 'Fijo' : m.paid ? 'Ocasional' : m.type === 'gasto' ? 'Pendiente' : 'Por recibir'}
              onPress={() => router.push({ pathname: '/nuevo', params: { id: String(m.id) } })}
            />
          ))}
          <Row gap={16} style={[st.divider, { paddingTop: 12, justifyContent: 'flex-end' }]}>
            {out > 0 && (
              <T w={800} size={13.5} color={C.out} tabular>
                − {fmt(out)}
              </T>
            )}
            {inc > 0 && (
              <T w={800} size={13.5} color={C.in} tabular>
                + {fmt(inc)}
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
          accessibilityLabel="Agregar movimiento en este día">
          <IconPlus size={16} />
          <T w={800} size={14}>
            Agregar movimiento
          </T>
        </Tap>
      )}
    </Animated.View>
  );
}

const st = StyleSheet.create({
  fixedHead: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 12 },
  fixedAvatar: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  payDate: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: C.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
  },
  todayDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.ink },
  gridCard: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 24, paddingHorizontal: 6, paddingVertical: 12 },
  stat: { height: 30, paddingHorizontal: 12, borderRadius: 15, justifyContent: 'center' },
  detail: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 22, padding: 16, gap: 12 },
  bigDay: { width: 54, height: 54, borderRadius: 18, backgroundColor: C.chip, alignItems: 'center', justifyContent: 'center' },
  holBanner: { backgroundColor: C.holidaySoft, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  holBannerDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.holiday },
  addBtn: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.ring,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  divider: { borderTopWidth: 1, borderTopColor: C.divider },
  holRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  holDate: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.holidaySoft, alignItems: 'center', justifyContent: 'center' },
  yearChip: {
    height: 40,
    minWidth: 62,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
