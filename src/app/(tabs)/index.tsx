import { router } from 'expo-router';
import { Fragment, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { CalendarCard } from '@/components/calendar';
import { IconChevronLeft, IconChevronRight, IconClock, IconExpense, IconGear, IconIncome } from '@/components/icons';
import { Card, LinkText, MovementRow, Progress, RoundButton, Row, Screen, SectionTitle, T, Tap, Toast } from '@/components/ui';
import { C } from '@/constants/theme';
import { listMovements, listSavings, loadFixedData, type HomeBlock } from '@/db/repo';
import { periodName, shiftPeriod, shortDate } from '@/lib/dates';
import { fixedItems, sum } from '@/lib/finance';
import { fmt, plural, signed } from '@/lib/format';
import { useApp, useLoad } from '@/state/app';

export default function Inicio() {
  const { period, setPeriod, range, settings, holidays } = useApp();
  const [revealed, setRevealed] = useState(false);

  const data = useLoad(
    async (db) => {
      const [movs, fixedData, savings] = await Promise.all([
        listMovements(db, range.from, range.to),
        loadFixedData(db),
        listSavings(db),
      ]);
      const items = fixedItems(fixedData, range.from, range.to, settings.holiday, holidays);
      return { movs, items, savings };
    },
    [range.from, range.to, settings.holiday],
  );

  if (!data) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  const { movs, items, savings } = data;

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
  const money = (n: number) => (hide ? '$ ••••' : fmt(n));
  const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

  const overBudget = settings.budgetAlert && inc > 0 && spentPct >= settings.budget;

  // Cada bloque se dibuja en el orden elegido en Ajustes → Orden de Inicio.
  const blocks: Record<HomeBlock, ReactNode> = {
    hero: (
      <Tap
        disabled={!settings.hideAmounts}
        onPress={() => setRevealed((r) => !r)}
        accessibilityLabel="Balance del mes"
        style={st.hero}>
        <View style={{ gap: 4 }}>
          <T w={600} size={13} color={C.heroSub}>
            Disponible este mes
          </T>
          <T serif size={42} color={C.bg} tabular numberOfLines={1} adjustsFontSizeToFit style={{ letterSpacing: -1 }}>
            {hide ? '$ ••••' : (inc - out < 0 ? '− ' : '') + fmt(inc - out)}
          </T>
        </View>
        <View style={{ gap: 8 }}>
          <Progress pct={spentPct} color={C.outBar} track={C.heroTrack} />
          <T size={12.5} color={C.heroSub}>
            {inc > 0 ? `Has gastado el ${spentPct} % de tus ingresos` : 'Aún no registras ingresos este mes'}
          </T>
        </View>
        <Row gap={10}>
          <View style={st.tile}>
            <Row gap={6}>
              <IconIncome size={14} color={C.inText} />
              <T w={700} size={12.5} color={C.inText}>
                Ingresos
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
                Gastos
              </T>
            </Row>
            <T w={800} size={17} color={C.bg} tabular>
              {money(out)}
            </T>
          </View>
        </Row>
      </Tap>
    ),

    savings: (
      <Tap onPress={() => router.push('/ahorro')} style={st.savings} accessibilityLabel="Abrir ahorro">
        <View style={{ flex: 1, gap: 2 }}>
          <T w={700} size={12.5} color={C.inSub}>
            Ahorro total
          </T>
          <T serif size={24} color="#F4F8FB" tabular numberOfLines={1} adjustsFontSizeToFit>
            {money(balance)}
          </T>
          <T w={700} size={12.5} color={C.inSub}>
            {hide ? 'Toca para ver' : `${signed(monthSaved)} este mes`}
          </T>
        </View>
        <View style={st.savingsBtn}>
          <IconChevronRight color="#F4F8FB" />
        </View>
      </Tap>
    ),

    pending: pendingIncome && (
      <Tap
        onPress={() => router.navigate({ pathname: '/fijos', params: { tab: 'ingresos' } })}
        style={[st.pending]}
        accessibilityLabel={`Ingreso fijo pendiente: ${pendingIncome.name}. Revisar`}>
        <View style={st.pendingIcon}>
          <IconClock color={C.inDark} />
        </View>
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <T w={700} size={12} color={C.warn}>
            Ingreso fijo pendiente
          </T>
          <T w={700} size={14.5} numberOfLines={1}>
            {pendingIncome.name}
          </T>
          <T size={12.5} color={C.muted}>
            Esperado el {shortDate(pendingIncome.occ.date)} · {money(pendingIncome.amount)}
          </T>
        </View>
        <View style={st.review}>
          <T w={800} size={13} color="#FFFFFF">
            Revisar
          </T>
        </View>
      </Tap>
    ),

    calendar: <CalendarCard />,

    breakdown: (
      <Card style={{ padding: 18, gap: 16 }}>
        <SectionTitle right={<LinkText onPress={() => router.navigate('/fijos')}>Ver fijos</LinkText>}>Gastos</SectionTitle>
        <Breakdown
          label="Fijos"
          detail={`${fixedOut.filter((i) => i.paid).length} de ${fixedOut.length} pagados`}
          amount={money(sum(outFixed))}
          pct={pct(sum(outFixed), out)}
          color={C.out}
          track={C.outTrack}
        />
        <Breakdown
          label="Ocasionales"
          detail={plural(outOcc.length, 'movimiento', 'movimientos')}
          amount={money(sum(outOcc))}
          pct={pct(sum(outOcc), out)}
          color={C.outBarLight}
          track={C.outTrack}
        />
        <View style={{ height: 1, backgroundColor: C.divider }} />
        <T w={800} size={16}>
          Ingresos
        </T>
        <Breakdown
          label="Fijos"
          detail={`${fixedIn.filter((i) => i.paid).length} de ${fixedIn.length} recibidos`}
          amount={money(sum(inFixed))}
          pct={pct(sum(inFixed), inc)}
          color={C.in}
          track={C.inTrack}
        />
        <Breakdown
          label="Ocasionales"
          detail={plural(inOcc.length, 'movimiento', 'movimientos')}
          amount={money(sum(inOcc))}
          pct={pct(sum(inOcc), inc)}
          color={C.inBarLight}
          track={C.inTrack}
        />
      </Card>
    ),

    recent: (
      <View style={{ gap: 10 }}>
        <SectionTitle right={<LinkText onPress={() => router.navigate('/movimientos')}>Ver todos</LinkText>}>
          Últimos movimientos
        </SectionTitle>
        <Card style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
          {movs.length === 0 ? (
            <T size={13.5} color={C.muted} style={{ paddingVertical: 16, textAlign: 'center' }}>
              Sin movimientos este mes. Toca + para agregar uno.
            </T>
          ) : (
            movs.slice(0, 4).map((m, i) => (
              <MovementRow
                key={m.id}
                first={i === 0}
                name={m.name}
                meta={`${m.fixed_id != null ? 'Fijo' : m.paid ? 'Ocasional' : 'Pendiente'} · ${shortDate(m.date)}`}
                amount={hide ? '$ ••••' : (m.type === 'gasto' ? '− ' : '+ ') + fmt(m.amount)}
                income={m.type === 'ingreso'}
                onPress={() => router.push({ pathname: '/nuevo', params: { id: String(m.id) } })}
              />
            ))
          )}
        </Card>
      </View>
    ),
  };

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ gap: 2 }}>
          <T w={600} size={13} color={C.muted}>
            Mis finanzas · {period.year}
          </T>
          <T serif w={600} size={32} style={{ letterSpacing: -0.5 }}>
            {periodName(period)}
          </T>
        </View>
        <Row gap={8}>
          <RoundButton label="Mes anterior" onPress={() => setPeriod(shiftPeriod(period, -1))}>
            <IconChevronLeft />
          </RoundButton>
          <RoundButton label="Mes siguiente" onPress={() => setPeriod(shiftPeriod(period, 1))}>
            <IconChevronRight />
          </RoundButton>
          <RoundButton label="Ajustes" onPress={() => router.push('/ajustes')}>
            <IconGear />
          </RoundButton>
        </Row>
      </Row>

      {overBudget && (
        <Toast warn title={`Llevas el ${spentPct} % de tus ingresos`} text={`Tu alerta está en el ${settings.budget} %.`} />
      )}

      {settings.homeOrder.map((id) => blocks[id] && <Fragment key={id}>{blocks[id]}</Fragment>)}
    </Screen>
  );
}

function Breakdown(p: { label: string; detail: string; amount: string; pct: number; color: string; track: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Row style={{ justifyContent: 'space-between' }}>
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
    </View>
  );
}

const st = StyleSheet.create({
  hero: { backgroundColor: C.hero, borderRadius: 24, padding: 22, gap: 18 },
  tile: { flex: 1, backgroundColor: C.heroTile, borderRadius: 16, padding: 14, gap: 6 },
  savings: {
    backgroundColor: C.inDark,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  savingsBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.in, alignItems: 'center', justifyContent: 'center' },
  pending: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pendingIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.inSoft, alignItems: 'center', justifyContent: 'center' },
  review: { height: 36, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.in, justifyContent: 'center' },
});
