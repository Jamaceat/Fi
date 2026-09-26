import { router } from 'expo-router';
import { Fragment, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { CalendarCard } from '@/components/calendar';
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
} from '@/components/ui';
import { C } from '@/constants/theme';
import { listMovements, listSavings, loadFixedData, totalFund, type HomeBlock, type Movement } from '@/db/repo';
import { t } from '@/i18n';
import { periodName, shiftPeriod, shortDate } from '@/lib/dates';
import { fixedItems, sum } from '@/lib/finance';
import { fmt, fmtBalance, fmtFlow, joinMeta, MASKED_AMOUNT, signed } from '@/lib/format';
import { useApp, useLoad } from '@/state/app';
import { common, layout } from '@/styles/common';
import { styles as st } from '@/styles/screens/inicio.styles';

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

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
  const { period, setPeriod, range, settings, holidays } = useApp();
  const [revealed, setRevealed] = useState(false);

  const data = useLoad(
    async (db) => {
      const [movs, fixedData, savings, fund] = await Promise.all([
        listMovements(db, range.from, range.to),
        loadFixedData(db),
        listSavings(db),
        totalFund(db),
      ]);
      const items = fixedItems(fixedData, range.from, range.to, settings.holiday, holidays);
      return { movs, items, savings, fund };
    },
    [range.from, range.to, settings.holiday],
  );

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
  const money = (n: number) => (hide ? MASKED_AMOUNT : fmt(n));

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
          <T serif size={42} color={C.bg} tabular numberOfLines={1} adjustsFontSizeToFit style={st.heroAmount}>
            {hide ? MASKED_AMOUNT : fmtBalance(inc - out)}
          </T>
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
            <T w={800} size={17} color={C.bg} tabular>
              {money(inc)}
            </T>
          </View>
          <View style={st.tile}>
            <Row gap={6}>
              <IconExpense size={14} color={C.outText} />
              <T w={700} size={12.5} color={C.outText}>
                {t('common.expenses')}
              </T>
            </Row>
            <T w={800} size={17} color={C.bg} tabular>
              {money(out)}
            </T>
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
          <T serif size={24} tabular numberOfLines={1} adjustsFontSizeToFit>
            {hide ? MASKED_AMOUNT : fmtBalance(fund.balance)}
          </T>
          <T size={12.5} color={C.muted}>
            {fund.months > 0 ? t('home.fund.months', { count: fund.months }) : t('home.fund.empty')}
          </T>
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
          <T serif size={24} color={C.inHeroText} tabular numberOfLines={1} adjustsFontSizeToFit>
            {money(balance)}
          </T>
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
          amount={money(sum(outFixed))}
          pct={pct(sum(outFixed), out)}
          color={C.out}
          track={C.outTrack}
        />
        <Breakdown
          label={t('common.occasionalPlural')}
          detail={t('common.movementCount', { count: outOcc.length })}
          amount={money(sum(outOcc))}
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
          amount={money(sum(inFixed))}
          pct={pct(sum(inFixed), inc)}
          color={C.in}
          track={C.inTrack}
        />
        <Breakdown
          label={t('common.occasionalPlural')}
          detail={t('common.movementCount', { count: inOcc.length })}
          amount={money(sum(inOcc))}
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
              <MovementRow
                key={m.id}
                first={i === 0}
                name={m.name}
                meta={joinMeta(movementKind(m), shortDate(m.date))}
                amount={hide ? MASKED_AMOUNT : fmtFlow(m.amount, m.type === 'ingreso')}
                income={m.type === 'ingreso'}
                onPress={() => router.push({ pathname: '/nuevo', params: { id: String(m.id) } })}
              />
            ))
          )}
        </Card>
      </Stack>
    ),
  };

  return (
    <Screen>
      <Row style={layout.between}>
        <Title kicker={t('home.kicker', { year: period.year })} title={periodName(period)} />
        <Row gap={8}>
          <RoundButton label={t('calendar.prevMonth')} onPress={() => setPeriod(shiftPeriod(period, -1))}>
            <IconChevronLeft />
          </RoundButton>
          <RoundButton label={t('calendar.nextMonth')} onPress={() => setPeriod(shiftPeriod(period, 1))}>
            <IconChevronRight />
          </RoundButton>
          <RoundButton label={t('settings.title')} onPress={() => router.push('/ajustes')}>
            <IconGear />
          </RoundButton>
        </Row>
      </Row>

      {overBudget && (
        <Toast
          warn
          title={t('home.budget.title', { pct: spentPct })}
          text={t('home.budget.text', { pct: settings.budget })}
        />
      )}

      {settings.homeOrder.map((id) => blocks[id] && <Fragment key={id}>{blocks[id]}</Fragment>)}
    </Screen>
  );
}

function Breakdown(p: { label: string; detail: string; amount: string; pct: number; color: string; track: string }) {
  return (
    <Stack gap={8}>
      <Row style={layout.between}>
        <T w={700} size={13.5}>
          {p.label}{' '}
          <T w={500} size={13.5} color={C.muted}>
            · {p.detail}
          </T>
        </T>
        <T w={700} size={13.5} tabular>
          {p.amount}
        </T>
      </Row>
      <Progress pct={p.pct} color={p.color} track={p.track} />
    </Stack>
  );
}
