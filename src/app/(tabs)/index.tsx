import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
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

import { CalendarCard } from '@/components/calendar';
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
import { listMovements, listSavings, loadFixedData, totalFund, type HomeBlock, type Movement } from '@/db/repo';
import { t } from '@/i18n';
import { periodName, samePeriod, shiftPeriod, shortDate, type Period } from '@/lib/dates';
import { fixedItems, sum } from '@/lib/finance';
import { fmt, fmtBalance, fmtFlow, joinMeta, MASKED_AMOUNT, signed } from '@/lib/format';
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
// lado y la del mes nuevo sube desde atrás. Sin rebote.
const FLY = { duration: 280, easing: Easing.out(Easing.quad) };
const RISE = { duration: 340, easing: VALUE_EASE };
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

/** "Fijo", "Ocasional" o "Pendiente". */
const movementKind = (m: Movement) =>
  m.fixed_id != null ? t('common.fixed') : m.paid ? t('common.occasional') : t('common.pending');

export default function Inicio() {
  const { period, setPeriod, currentPeriod, range, settings, holidays } = useApp();
  const [revealed, setRevealed] = useState(false);
  const [picking, setPicking] = useState(false);

  const data = useLoad(
    async (db) => {
      const [movs, fixedData, savings, fund] = await Promise.all([
        listMovements(db, range.from, range.to),
        loadFixedData(db),
        listSavings(db),
        totalFund(db),
      ]);
      const items = fixedItems(fixedData, range.from, range.to, settings.holiday, holidays);
      // `from` dice de qué mes son los datos, para saber cuándo llegaron los del mes nuevo.
      return { movs, items, savings, fund, from: range.from };
    },
    [range.from, range.to, settings.holiday],
  );

  // ——— Cambio de mes ———

  const reduceMotion = useReducedMotion();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const fly = useSharedValue(0); // 0: en su sitio; −1 / 1: fuera por la izquierda / derecha
  const rise = useSharedValue(1); // 0: detrás, pequeña e invisible; 1: al frente
  // Mes al que se va mientras la carta vuela; el título lo muestra de una vez.
  const [target, setTarget] = useState<Period | null>(null);
  const targetRef = useRef<Period | null>(null);
  // Tras cambiar de mes, la carta nueva espera sus datos para subir.
  const waiting = useRef(false);
  const [landed, setLanded] = useState(0);
  // Mientras se cambia de mes, los montos aparecen ya con su valor, sin contar desde el mes anterior.
  const [switching, setSwitching] = useState(false);

  const land = () => {
    const p = targetRef.current;
    targetRef.current = null;
    setTarget(null);
    if (!p) return;
    rise.set(0);
    fly.set(0);
    waiting.current = true;
    setPeriod(p);
    setLanded((n) => n + 1);
  };

  const goTo = (p: Period) => {
    if (samePeriod(p, targetRef.current ?? period)) return;
    if (reduceMotion) {
      setPeriod(p);
      return;
    }
    // Si ya va volando, solo cambia a qué mes llega.
    const flying = targetRef.current != null;
    targetRef.current = p;
    setTarget(p);
    setSwitching(true);
    if (flying) return;
    // Hacia adelante sale por la izquierda, como al deslizarla con el dedo.
    const dir = monthIndex(p) > monthIndex(period) ? -1 : 1;
    fly.set(
      withTiming(dir, FLY, (done) => {
        if (done) scheduleOnRN(land);
      }),
    );
  };
  const step = (k: number) => goTo(shiftPeriod(targetRef.current ?? period, k));

  useEffect(() => {
    if (!waiting.current || data?.from !== range.from) return;
    waiting.current = false;
    rise.set(
      withTiming(1, RISE, (done) => {
        if (done) scheduleOnRN(setSwitching, false);
      }),
    );
  }, [data, range.from, landed, rise]);

  const cardStyle = useAnimatedStyle(() => {
    const f = fly.get();
    const r = rise.get();
    return {
      opacity: r * (1 - Math.abs(f) * 0.4),
      transform: [
        { translateX: f * screenW * 1.1 },
        { translateY: (1 - r) * 28 },
        { rotate: `${f * TILT}deg` },
        { scale: 0.92 + 0.08 * r },
      ],
    };
  });
  // Gira sobre un punto al pie de la pantalla, como una carta sostenida desde abajo.
  const pivot = { transformOrigin: ['50%', screenH, 0] as (string | number)[] };

  if (!data) return <View style={layout.screen} />;
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
  const balance = savings[0]?.after ?? 0;
  const monthSaved = savings.filter((e) => e.date >= range.from && e.date < range.to).reduce((s, e) => s + e.delta, 0);

  const hide = settings.hideAmounts && !revealed;
  const money = hide ? () => MASKED_AMOUNT : fmt;
  const balanceText = hide ? () => MASKED_AMOUNT : fmtBalance;

  const overBudget = settings.budgetAlert && inc > 0 && spentPct >= settings.budget;

  // Cada bloque se dibuja en el orden elegido en Ajustes → Orden de Inicio.
  const blocks: Record<HomeBlock, ReactNode> = {
    hero: (
      <Tap
        disabled={!settings.hideAmounts}
        onPress={() => setRevealed((r) => !r)}
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

    calendar: <CalendarCard />,

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
                  onPress={() => router.push({ pathname: '/nuevo', params: { id: String(m.id) } })}
                />
              </Animated.View>
            ))
          )}
        </Card>
      </Stack>
    ),
  };

  const shown = target ?? period;

  return (
    <Screen>
      <Row style={layout.between}>
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

      <Animated.View style={[st.deck, pivot, cardStyle]}>
        <ValueMotionProvider animate={!switching}>
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
        </ValueMotionProvider>
      </Animated.View>

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
