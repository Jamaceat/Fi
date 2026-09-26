import { router } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LayoutAnimationConfig,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { CalendarCard, cellsRange } from '@/components/calendar';
import { LoadingBackdrop } from '@/components/loading-backdrop';
import { MonthPicker } from '@/components/month-picker';
import {
  IconBars,
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconExpense,
  IconGear,
  IconIncome,
  IconPending,
  IconPiggy,
  IconRefresh,
  IconTarget,
} from '@/components/icons';
import {
  Card,
  CountText,
  LinkText,
  MovementRow,
  Progress,
  RoundButton,
  Row,
  Screen,
  SectionTitle,
  Stack,
  T,
  Tap,
  Title,
  Toast,
  VALUE_EASE,
  ValueMotionProvider,
} from '@/components/ui';
import { C } from '@/constants/theme';
import {
  listMovements,
  listSavings,
  listUnpaidBefore,
  loadFixedData,
  totalFund,
  type HomeBlock,
  type Movement,
} from '@/db/repo';
import { t } from '@/i18n';
import { loadDays } from '@/lib/calendar';
import { periodName, periodOf, periodRange, samePeriod, shiftPeriod, shortDate, todayISO, type Period } from '@/lib/dates';
import { fixedItems, sum } from '@/lib/finance';
import type { HolidayMap } from '@/lib/holidays';
import type { HolidayRule } from '@/lib/schedule';
import { fmt, fmtBalance, fmtFlow, joinMeta, MASKED_AMOUNT, signed } from '@/lib/format';
import { openMovement } from '@/lib/labels';
import { unconfirmedOf } from '@/lib/unconfirmed';
import { useApp, useLoad } from '@/state/app';
import { common, layout } from '@/styles/common';
import { styles as st } from '@/styles/screens/inicio.styles';

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

// Cuando un check en Movimientos cambia Inicio: los bloques que aparecen o se van se
// desvanecen y los demás se deslizan a su nuevo lugar, sin rebote.
const SLIDE = LinearTransition.duration(320).easing(VALUE_EASE);
const ENTER = FadeIn.duration(320).easing(VALUE_EASE);
const EXIT = FadeOut.duration(200);

// Cambio de mes como un mazo de cartas: la del mes actual sale lanzada y girando hacia un
// lado mientras la del mes nuevo, que ya está debajo, sube al frente. Sin rebote.
const SWAP = { duration: 360, easing: Easing.out(Easing.cubic) };
/** Espera tras el último toque de las flechas antes de cambiar la carta, en ms. */
const STEP_SETTLE = 350;
/** Giro máximo de la carta al salir. */
const TILT = 12;

const monthIndex = (p: Period) => p.year * 12 + p.month;

/** Fila de accesos rápidos: para agregar una funcionalidad, suma una entrada aquí. */
const SHORTCUTS = [
  { key: 'savings', Icon: IconPiggy, color: C.in, bg: C.inSoft, go: () => router.push('/ahorro') },
  { key: 'calendar', Icon: IconCalendar, color: C.holiday, bg: C.holidaySoft, go: () => router.push('/calendario') },
  { key: 'fixed', Icon: IconRefresh, color: C.extra, bg: C.extraSoft, go: () => router.navigate('/fijos') },
  { key: 'months', Icon: IconBars, color: C.out, bg: C.outSoft, go: () => router.navigate('/historial') },
] as const;

/** Segunda fila: abre Meses con la lista de sin confirmar abierta. */
const openUnconfirmed = () => router.navigate({ pathname: '/historial', params: { pending: '1' } });

/** "Fijo", "Ahorro", "Ocasional" o "Pendiente". */
const movementKind = (m: Movement) =>
  m.fixed_id != null
    ? t('common.fixed')
    : m.savings_id != null
      ? t('common.savings')
      : m.paid
        ? t('common.occasional')
        : t('common.pending');

type HomeData = {
  movs: Movement[];
  items: ReturnType<typeof fixedItems>;
  savings: Awaited<ReturnType<typeof listSavings>>;
  fund: Awaited<ReturnType<typeof totalFund>>;
  /** Días de la tarjeta del calendario. */
  days: Awaited<ReturnType<typeof loadDays>>;
  /** Cuántos fijos y ocasionales de meses cerrados siguen sin confirmar. */
  unconfirmed: number;
  /** Mes al que pertenecen los datos. */
  period: Period;
  from: string;
  to: string;
};

async function loadHome(
  db: SQLiteDatabase,
  period: Period,
  monthStart: number,
  rule: HolidayRule,
  holidays: HolidayMap,
): Promise<HomeData> {
  const { from, to } = periodRange(period, monthStart);
  const cells = cellsRange(period.year, period.month);
  // Sin confirmar = lo de antes del mes de hoy (no del que se está viendo).
  const before = periodRange(periodOf(todayISO(), monthStart), monthStart).from;
  const [movs, fixedData, savings, fund, days, unpaid] = await Promise.all([
    listMovements(db, from, to),
    loadFixedData(db),
    listSavings(db),
    totalFund(db),
    loadDays(db, cells.from, cells.to, rule, holidays),
    listUnpaidBefore(db, before),
  ]);
  const items = fixedItems(fixedData, from, to, rule, holidays);
  const unconfirmed = unconfirmedOf(fixedData, unpaid, before, rule, holidays).length;
  return { movs, items, savings, fund, days, unconfirmed, period, from, to };
}

/** Una carta del mazo: el contenido de Inicio para un mes. */
type DeckCard = { key: number; data: HomeData };

export default function Inicio() {
  const { period, setPeriod, currentPeriod, range, settings, holidays, version, needHolidays } = useApp();
  const db = useSQLiteContext();
  const [revealed, setRevealed] = useState(false);
  const [picking, setPicking] = useState(false);

  const loaded = useLoad(
    (db) => loadHome(db, period, settings.monthStart, settings.holiday, holidays),
    [range.from, range.to, settings.holiday],
  );

  // Los meses vecinos se cargan por adelantado, para que al pasar la carta la nueva ya
  // tenga sus datos. Se descartan cuando cambian los datos o lo que afecta al cálculo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ahead = useMemo(() => new Map<string, HomeData>(), [version, settings.monthStart, settings.holiday, holidays]);
  useEffect(() => {
    let alive = true;
    const around = [shiftPeriod(period, -1), shiftPeriod(period, 1)];
    needHolidays(around.map((p) => p.year));
    for (const p of around) {
      const { from } = periodRange(p, settings.monthStart);
      if (ahead.has(from)) continue;
      loadHome(db, p, settings.monthStart, settings.holiday, holidays).then((d) => alive && ahead.set(from, d));
    }
    return () => {
      alive = false;
    };
  }, [ahead, db, period, settings.monthStart, settings.holiday, holidays, needHolidays]);

  // Mientras llega la consulta del mes elegido, usa la precargada si la hay.
  const data = loaded?.from === range.from ? loaded : (ahead.get(range.from) ?? loaded);

  // ——— Cambio de mes ———

  const reduceMotion = useReducedMotion();
  const { width: screenW, height: screenH } = useWindowDimensions();
  // Carta al frente, con los últimos datos cargados.
  const [deck, setDeck] = useState<DeckCard | null>(null);
  // Carta del mes anterior mientras sale volando por encima de la nueva.
  const [leaving, setLeaving] = useState<(DeckCard & { dir: number }) | null>(null);
  const swap = useSharedValue(0); // 0: la vieja en su sitio y la nueva detrás; 1: la nueva al frente

  // Al llegar los datos de otro mes, la carta actual pasa a salir volando y los datos nuevos
  // ocupan una carta nueva, que ya está debajo. Si llegan mientras otra vuela, la de abajo
  // solo cambia de mes.
  if (data && data !== deck?.data) {
    const turn = deck && !leaving && !reduceMotion && !samePeriod(deck.data.period, data.period);
    if (turn) {
      // Hacia adelante sale por la izquierda, como al deslizarla con el dedo.
      const dir = monthIndex(data.period) > monthIndex(deck.data.period) ? -1 : 1;
      setLeaving({ ...deck, dir });
      setDeck({ key: deck.key + 1, data });
    } else {
      setDeck({ key: deck?.key ?? 0, data });
    }
  }

  useEffect(() => {
    if (!leaving) {
      swap.set(0);
      return;
    }
    swap.set(withTiming(1, SWAP, () => scheduleOnRN(setLeaving, null)));
  }, [leaving, swap]);

  const turning = leaving != null;
  const dir = leaving?.dir ?? 0;
  const leaveStyle = useAnimatedStyle(() => {
    const s = swap.get();
    return {
      opacity: 1 - s * 0.4,
      transform: [{ translateX: dir * s * screenW * 1.1 }, { rotate: `${dir * s * TILT}deg` }],
    };
  }, [dir, screenW]);
  const riseStyle = useAnimatedStyle(() => {
    const s = turning ? swap.get() : 1;
    return {
      opacity: 0.5 + 0.5 * s,
      transform: [{ translateY: (1 - s) * 24 }, { scale: 0.94 + 0.06 * s }],
    };
  }, [turning]);
  // Gira sobre un punto al pie de la pantalla, como una carta sostenida desde abajo.
  const pivot = { transformOrigin: ['50%', screenH, 0] as (string | number)[] };

  // Las flechas se pueden tocar varias veces seguidas: el título avanza con cada toque y la
  // carta cambia una sola vez, al mes final, cuando se dejan de tocar.
  const [target, setTarget] = useState<Period | null>(null);
  const targetRef = useRef<Period | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(settle.current), []);

  const goTo = (p: Period) => {
    clearTimeout(settle.current);
    targetRef.current = null;
    setTarget(null);
    if (!samePeriod(p, period)) setPeriod(p);
  };
  const step = (k: number) => {
    const p = shiftPeriod(targetRef.current ?? period, k);
    targetRef.current = p;
    setTarget(p);
    // Mientras se espera, carga el mes al que se va si aún no está listo.
    const { from } = periodRange(p, settings.monthStart);
    if (!ahead.has(from)) {
      loadHome(db, p, settings.monthStart, settings.holiday, holidays).then((d) => ahead.set(from, d));
    }
    clearTimeout(settle.current);
    settle.current = setTimeout(() => goTo(p), STEP_SETTLE);
  };
  const shown = target ?? period;
  // El mes del título aún no tiene su carta: se esperan más toques o sus datos.
  const loadingMonth = target != null || data?.from !== range.from;

  if (!deck) return <View style={layout.screen} />;

  // La que sale va al final para quedar encima.
  const cards = leaving ? [deck, leaving] : [deck];

  return (
    <Screen>
      <Row style={layout.between}>
        <LoadingBackdrop active={loadingMonth} style={st.barLoading} />
        <Tap
          onPress={() => setPicking(true)}
          accessibilityRole="button"
          accessibilityLabel={t('home.picker.open', { month: periodName(shown), year: shown.year })}
          style={st.titleBtn}>
          <Title kicker={t('home.kicker', { year: shown.year })} title={periodName(shown)} />
          <View style={[common.iconTile, st.titleIcon]}>
            <IconCalendar size={17} />
          </View>
        </Tap>
        <Row gap={8}>
          <RoundButton label={t('calendar.prevMonth')} onPress={() => step(-1)}>
            <IconChevronLeft />
          </RoundButton>
          <RoundButton label={t('calendar.nextMonth')} onPress={() => step(1)}>
            <IconChevronRight />
          </RoundButton>
          <RoundButton label={t('settings.title')} onPress={() => router.push('/ajustes')}>
            <IconGear />
          </RoundButton>
        </Row>
      </Row>

      <View>
        {cards.map((c) => {
          const out = c === leaving;
          return (
            <Animated.View
              key={c.key}
              pointerEvents={out ? 'none' : 'auto'}
              style={out ? [st.deck, st.leaving, pivot, leaveStyle] : [st.deck, riseStyle]}>
              {/* Mientras cambia de mes, los montos aparecen ya con su valor, sin contar. */}
              <ValueMotionProvider animate={!turning}>
                <MonthDeck data={c.data} revealed={revealed} onReveal={() => setRevealed((r) => !r)} />
              </ValueMotionProvider>
            </Animated.View>
          );
        })}
      </View>

      <MonthPicker
        visible={picking}
        value={shown}
        current={currentPeriod}
        onClose={() => setPicking(false)}
        onPick={(p) => {
          setPicking(false);
          goTo(p);
        }}
      />
    </Screen>
  );
}

/** Contenido de Inicio para el mes de `data`, en el orden elegido en Ajustes. */
function MonthDeck({ data, revealed, onReveal }: { data: HomeData; revealed: boolean; onReveal: () => void }) {
  const { settings } = useApp();
  const { movs, items, savings, fund } = data;

  // Los ocasionales pendientes aún no mueven dinero.
  const gastos = movs.filter((m) => m.type === 'gasto' && m.paid);
  const ingresos = movs.filter((m) => m.type === 'ingreso' && m.paid);
  const out = sum(gastos);
  const inc = sum(ingresos);
  const spentPct = inc > 0 ? Math.round((out / inc) * 100) : out > 0 ? 100 : 0;

  const outFixed = gastos.filter((m) => m.fixed_id != null);
  const outOcc = gastos.filter((m) => m.fixed_id == null);
  const inFixed = ingresos.filter((m) => m.fixed_id != null);
  const inOcc = ingresos.filter((m) => m.fixed_id == null);
  const fixedOut = items.filter((i) => i.fixed.type === 'gasto');
  const fixedIn = items.filter((i) => i.fixed.type === 'ingreso');

  const pendingIncome = fixedIn.find((i) => !i.paid);
  // Ahorro total = libre + lo bloqueado en metas.
  const balance = (savings[0]?.after ?? 0) + fund.goals;
  const monthSaved = savings.filter((e) => e.date >= data.from && e.date < data.to).reduce((s, e) => s + e.delta, 0);

  const hide = settings.hideAmounts && !revealed;
  const money = hide ? () => MASKED_AMOUNT : fmt;
  const balanceText = hide ? () => MASKED_AMOUNT : fmtBalance;

  const overBudget = settings.budgetAlert && inc > 0 && spentPct >= settings.budget;

  // Cada bloque se dibuja en el orden elegido en Ajustes → Orden de Inicio.
  const blocks: Record<HomeBlock, ReactNode> = {
    hero: (
      <Tap
        disabled={!settings.hideAmounts}
        onPress={onReveal}
        accessibilityLabel={t('home.hero.label')}
        style={st.hero}>
        <Stack gap={4}>
          <T w={600} size={13} color={C.heroSub}>
            {t('home.hero.available')}
          </T>
          <CountText
            value={inc - out}
            format={balanceText}
            serif
            size={42}
            color={C.bg}
            tabular
            numberOfLines={1}
            adjustsFontSizeToFit
            style={st.heroAmount}
          />
        </Stack>
        <Stack gap={8}>
          <Progress pct={spentPct} color={C.outBar} track={C.heroTrack} />
          <T size={12.5} color={C.heroSub}>
            {inc > 0 ? t('home.hero.spent', { pct: spentPct }) : t('home.hero.noIncome')}
          </T>
        </Stack>
        <Row gap={10}>
          <View style={st.tile}>
            <Row gap={6}>
              <IconIncome size={14} color={C.inText} />
              <T w={700} size={12.5} color={C.inText}>
                {t('common.incomes')}
              </T>
            </Row>
            <CountText value={inc} format={money} w={800} size={17} color={C.bg} tabular />
          </View>
          <View style={st.tile}>
            <Row gap={6}>
              <IconExpense size={14} color={C.outText} />
              <T w={700} size={12.5} color={C.outText}>
                {t('common.expenses')}
              </T>
            </Row>
            <CountText value={out} format={money} w={800} size={17} color={C.bg} tabular />
          </View>
        </Row>
      </Tap>
    ),

    fund: (
      <Card style={st.fund}>
        <View style={[common.iconTile, st.fundIcon]}>
          <IconTarget color={C.extra} />
        </View>
        <Stack gap={2} style={layout.fillShrink}>
          <T w={700} size={12.5} color={C.muted}>
            {t('home.fund.title')}
          </T>
          <CountText value={fund.balance} format={balanceText} serif size={24} tabular numberOfLines={1} adjustsFontSizeToFit />
        </Stack>
      </Card>
    ),

    shortcuts: (
      <Card style={st.shortcuts}>
        <Row style={st.shortcutRow}>
          {SHORTCUTS.map(({ key, Icon, color, bg, go }) => {
            const name = t(`home.shortcuts.${key}`);
            return (
              <Tap key={key} onPress={go} style={st.shortcut} accessibilityLabel={t('home.shortcuts.open', { name })}>
                <View style={[common.iconTile, st.shortcutIcon, { backgroundColor: bg }]}>
                  <Icon size={22} color={color} />
                </View>
                <T w={700} size={12.5} numberOfLines={1}>
                  {name}
                </T>
              </Tap>
            );
          })}
        </Row>
        {/* Misma cuadrícula de 4 columnas: los huecos mantienen el ancho de cada acceso. */}
        <Row style={st.shortcutRow}>
          <Tap
            onPress={openUnconfirmed}
            style={st.shortcut}
            accessibilityLabel={
              data.unconfirmed ? t('history.pendingLabel', { count: data.unconfirmed }) : t('history.pendingNone')
            }>
            <View style={[common.iconTile, st.shortcutIcon, st.unconfirmedIcon]}>
              <IconPending size={22} color={C.warn} />
              {data.unconfirmed > 0 && (
                <View style={st.badge}>
                  <T w={800} size={11} color={C.white}>
                    {data.unconfirmed}
                  </T>
                </View>
              )}
            </View>
            <T w={700} size={12.5} numberOfLines={1}>
              {t('home.shortcuts.unconfirmed')}
            </T>
          </Tap>
          <View style={st.shortcut} />
          <View style={st.shortcut} />
          <View style={st.shortcut} />
        </Row>
      </Card>
    ),

    savings: (
      <Tap onPress={() => router.push('/ahorro')} style={st.savings} accessibilityLabel={t('home.savings.open')}>
        <Stack gap={2} style={layout.fill}>
          <T w={700} size={12.5} color={C.inSub}>
            {t('home.savings.total')}
          </T>
          <CountText
            value={balance}
            format={money}
            serif
            size={24}
            color={C.inHeroText}
            tabular
            numberOfLines={1}
            adjustsFontSizeToFit
          />
          <T w={700} size={12.5} color={C.inSub}>
            {hide ? t('home.savings.tapToShow') : t('home.savings.thisMonth', { amount: signed(monthSaved) })}
          </T>
        </Stack>
        <View style={st.savingsBtn}>
          <IconChevronRight color={C.inHeroText} />
        </View>
      </Tap>
    ),

    pending: pendingIncome && (
      <Tap
        onPress={() => router.navigate({ pathname: '/movimientos', params: { tab: 'ingreso', filter: 'fijo' } })}
        style={st.pending}
        accessibilityLabel={t('home.pending.label', { name: pendingIncome.name })}>
        <View style={[common.iconTile, st.pendingIcon]}>
          <IconClock color={C.inDark} />
        </View>
        <Stack gap={2} style={layout.fillShrink}>
          <T w={700} size={12} color={C.warn}>
            {t('home.pending.title')}
          </T>
          <T w={700} size={14.5} numberOfLines={1}>
            {pendingIncome.name}
          </T>
          <T size={12.5} color={C.muted}>
            {joinMeta(t('home.pending.expected', { date: shortDate(pendingIncome.occ.date) }), money(pendingIncome.amount))}
          </T>
        </Stack>
        <View style={st.review}>
          <T w={800} size={13} color={C.white}>
            {t('home.pending.review')}
          </T>
        </View>
      </Tap>
    ),

    calendar: <CalendarCard period={data.period} days={data.days} />,

    breakdown: (
      <Card style={st.breakdown}>
        <SectionTitle right={<LinkText onPress={() => router.navigate({ pathname: '/movimientos', params: { filter: 'fijo' } })}>{t('home.breakdown.seeFixed')}</LinkText>}>
          {t('common.expenses')}
        </SectionTitle>
        <Breakdown
          label={t('common.fixedPlural')}
          detail={t('home.breakdown.paidOf', { done: fixedOut.filter((i) => i.paid).length, total: fixedOut.length })}
          amount={sum(outFixed)}
          format={money}
          pct={pct(sum(outFixed), out)}
          color={C.out}
          track={C.outTrack}
        />
        <Breakdown
          label={t('common.occasionalPlural')}
          detail={t('common.movementCount', { count: outOcc.length })}
          amount={sum(outOcc)}
          format={money}
          pct={pct(sum(outOcc), out)}
          color={C.outBarLight}
          track={C.outTrack}
        />
        <View style={st.separator} />
        <T w={800} size={16}>
          {t('common.incomes')}
        </T>
        <Breakdown
          label={t('common.fixedPlural')}
          detail={t('home.breakdown.receivedOf', { done: fixedIn.filter((i) => i.paid).length, total: fixedIn.length })}
          amount={sum(inFixed)}
          format={money}
          pct={pct(sum(inFixed), inc)}
          color={C.in}
          track={C.inTrack}
        />
        <Breakdown
          label={t('common.occasionalPlural')}
          detail={t('common.movementCount', { count: inOcc.length })}
          amount={sum(inOcc)}
          format={money}
          pct={pct(sum(inOcc), inc)}
          color={C.inBarLight}
          track={C.inTrack}
        />
      </Card>
    ),

    recent: (
      <Stack gap={10}>
        <SectionTitle right={<LinkText onPress={() => router.navigate('/movimientos')}>{t('home.recent.seeAll')}</LinkText>}>
          {t('home.recent.title')}
        </SectionTitle>
        <Card style={common.listCard}>
          {movs.length === 0 ? (
            <T size={13.5} color={C.muted} style={st.emptyRecent}>
              {t('home.recent.empty')}
            </T>
          ) : (
            movs.slice(0, 4).map((m, i) => (
              <Animated.View key={m.id} entering={ENTER} exiting={EXIT} layout={SLIDE}>
                <MovementRow
                  first={i === 0}
                  name={m.name}
                  meta={joinMeta(movementKind(m), shortDate(m.date))}
                  amount={hide ? MASKED_AMOUNT : fmtFlow(m.amount, m.type === 'ingreso')}
                  income={m.type === 'ingreso'}
                  onPress={() => openMovement(m)}
                />
              </Animated.View>
            ))
          )}
        </Card>
      </Stack>
    ),
  };

  return (
    <>
      {overBudget && (
        <Toast
          warn
          title={t('home.budget.title', { pct: spentPct })}
          text={t('home.budget.text', { pct: settings.budget })}
        />
      )}

      <LayoutAnimationConfig skipEntering>
        {settings.homeOrder.map(
          (id) =>
            blocks[id] && (
              <Animated.View key={id} entering={ENTER} exiting={EXIT} layout={SLIDE}>
                {blocks[id]}
              </Animated.View>
            ),
        )}
      </LayoutAnimationConfig>
    </>
  );
}

function Breakdown(p: {
  label: string;
  detail: string;
  amount: number;
  format: (n: number) => string;
  pct: number;
  color: string;
  track: string;
}) {
  return (
    <Stack gap={8}>
      <Row style={layout.between}>
        <T w={700} size={13.5}>
          {p.label}{' '}
          <T w={500} size={13.5} color={C.muted}>
            · {p.detail}
          </T>
        </T>
        <CountText value={p.amount} format={p.format} w={700} size={13.5} tabular />
      </Row>
      <Progress pct={p.pct} color={p.color} track={p.track} />
    </Stack>
  );
}
