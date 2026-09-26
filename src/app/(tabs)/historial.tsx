import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { IconArrowDown, IconArrowUp, IconCheck, IconPending, IconTrash } from '@/components/icons';
import { Card, Header, Row, Screen, Sheet, Stack, T, Tap } from '@/components/ui';
import { C } from '@/constants/theme';
import {
  confirmMovement,
  deleteMovement,
  listMovements,
  listUnpaidBefore,
  loadFixedData,
  markPaid,
  skipOccurrence,
  unmark,
  type Fixed,
} from '@/db/repo';
import { t } from '@/i18n';
import { monthAbbr, monthName, periodOf, periodRange, samePeriod, shiftPeriod, type Period } from '@/lib/dates';
import { sum } from '@/lib/finance';
import { canPay } from '@/lib/fund';
import { fmt, fmtFlow, joinMeta, signed } from '@/lib/format';
import { unconfirmedOf, type Unconfirmed } from '@/lib/unconfirmed';
import { useApp, useLoad } from '@/state/app';
import { common, layout } from '@/styles/common';
import { styles as st } from '@/styles/screens/historial.styles';

const BAR_H = 150;

type MonthAgg = {
  period: Period;
  inc: number;
  out: number;
  inExtra: number;
  outExtra: number;
  inPend: number;
  outPend: number;
  pending: Unconfirmed[];
};

export default function Historial() {
  const db = useSQLiteContext();
  const { currentPeriod, settings, setPeriod, bump, holidays } = useApp();
  const [sheetOpen, setSheetOpen] = useState(false);
  const params = useLocalSearchParams<{ pending?: string }>();

  // Inicio abre la lista de sin confirmar con ?pending=1; se aplica una vez y se limpia.
  const [lastPending, setLastPending] = useState<string | undefined>(undefined);
  if (params.pending !== lastPending) {
    setLastPending(params.pending);
    if (params.pending === '1') setSheetOpen(true);
  }
  useEffect(() => {
    if (params.pending) router.setParams({ pending: undefined });
  }, [params.pending]);

  const data = useLoad(
    async (d) => {
      const periods = [-5, -4, -3, -2, -1, 0].map((k) => shiftPeriod(currentPeriod, k));
      const first = periodRange(periods[0], settings.monthStart);
      const last = periodRange(periods[5], settings.monthStart);
      const [movs, fixedData, unpaid] = await Promise.all([
        listMovements(d, first.from, last.to),
        loadFixedData(d),
        listUnpaidBefore(d, last.from),
      ]);
      // Sin confirmar: todo lo de meses ya cerrados, no solo de los 5 que muestra la gráfica.
      const unconfirmed = unconfirmedOf(fixedData, unpaid, last.from, settings.holiday, holidays);

      const months: MonthAgg[] = periods.map((p) => {
        const { from, to } = periodRange(p, settings.monthStart);
        const ms = movs.filter((m) => m.date >= from && m.date < to && m.paid);
        const pick = (type: string, extra: number) => sum(ms.filter((m) => m.type === type && m.extraordinary === extra));
        const pending = unconfirmed.filter((x) => x.date >= from && x.date < to);
        return {
          period: p,
          inc: pick('ingreso', 0),
          out: pick('gasto', 0),
          inExtra: pick('ingreso', 1),
          outExtra: pick('gasto', 1),
          inPend: sum(pending.filter((x) => x.type === 'ingreso')),
          outPend: sum(pending.filter((x) => x.type === 'gasto')),
          pending,
        };
      });

      const byId = new Map<number, Fixed>(fixedData.fixed.map((f) => [f.id, f]));
      const resolved = [...fixedData.statuses.values()]
        .filter((r) => r.resolved_at && byId.has(r.fixed_id))
        .sort((a, b) => (a.resolved_at! < b.resolved_at! ? 1 : -1))
        .slice(0, 10)
        .map((r) => ({ ...r, fixed: byId.get(r.fixed_id)! }));
      return { months, resolved, unconfirmed };
    },
    [currentPeriod.year, currentPeriod.month, settings.monthStart, settings.holiday],
  );

  if (!data) return <View style={layout.screen} />;
  const { months, resolved, unconfirmed: pendingItems } = data;

  const max = Math.max(
    1,
    ...months.map((m) => Math.max(m.inc + m.inExtra + m.inPend, m.out + m.outExtra + m.outPend)),
  );
  const scale = (v: number) => (v > 0 ? Math.max(4, Math.round((v / max) * BAR_H)) : 0);
  const avg = Math.round(months.reduce((s, m) => s + m.inc + m.inExtra - m.out - m.outExtra, 0) / months.length / 1000) * 1000;
  const count = pendingItems.length;
  const monthOf = (iso: string) => monthName(periodOf(iso, settings.monthStart).month);
  /** Mes al que pertenece; con el año si no es el actual. */
  const monthYearOf = (iso: string) => {
    const p = periodOf(iso, settings.monthStart);
    const name = monthName(p.month).toLowerCase();
    return p.year === currentPeriod.year ? name : `${name} ${p.year}`;
  };

  const act = async (fn: () => Promise<unknown>) => {
    await fn();
    bump();
  };

  const discard = (p: Unconfirmed) =>
    act(() => (p.item ? skipOccurrence(db, p.item.fixed.id, p.item.occ.due) : deleteMovement(db, p.mov.id)));

  // Confirmar un gasto también necesita dinero en el fondo total.
  const confirm = async (p: Unconfirmed) => {
    if (p.type === 'gasto' && !(await canPay(db, p.amount))) return;
    await act(() =>
      p.item
        ? markPaid(db, p.item.fixed, p.item.occ.due, { extra: true, amount: p.amount, date: p.item.occ.date })
        : confirmMovement(db, p.mov.id),
    );
  };

  return (
    <Screen>
      <Header
        kicker={t('history.kicker')}
        title={t('history.title')}
        right={
          <Tap
            onPress={() => setSheetOpen(true)}
            accessibilityLabel={count ? t('history.pendingLabel', { count }) : t('history.pendingNone')}
            style={st.pendBtn}>
            <IconPending size={20} />
            {count > 0 && (
              <View style={st.badge}>
                <T w={800} size={11} color={C.white}>
                  {count}
                </T>
              </View>
            )}
          </Tap>
        }
      />

      <Card style={st.chartCard}>
        <Stack gap={2}>
          <T w={600} size={13} color={C.muted}>
            {t('history.averageSavings')}
          </T>
          <T serif w={600} size={26} tabular numberOfLines={1} adjustsFontSizeToFit>
            {signed(avg)}
          </T>
        </Stack>
        <Row style={st.bars}>
          {months.map((m, i) => (
            <View key={i} style={st.barColumn}>
              <Row gap={4} style={[st.barPair, { height: BAR_H }]}>
                <Bar base={scale(m.inc)} extra={scale(m.inExtra)} pend={scale(m.inPend)} color={C.in} />
                <Bar base={scale(m.out)} extra={scale(m.outExtra)} pend={scale(m.outPend)} color={C.outBar} pendColor={C.out} />
              </Row>
              <T w={700} size={12} color={i === 5 ? C.ink : C.muted}>
                {monthAbbr(m.period.month)}
              </T>
            </View>
          ))}
        </Row>
        <View style={st.legend}>
          <Legend color={C.in} label={t('common.incomes')} />
          <Legend color={C.outBar} label={t('common.expenses')} />
          <Legend color={C.extra} label={t('common.extraordinary')} />
          <Legend dashed label={t('history.unconfirmed')} />
        </View>
      </Card>

      <Stack gap={10}>
        <T w={800} size={16}>
          {t('history.detail')}
        </T>
        {[...months].reverse().map((m) => {
          const inc = m.inc + m.inExtra;
          const out = m.out + m.outExtra;
          const extra = m.inExtra + m.outExtra;
          const current = samePeriod(m.period, currentPeriod);
          return (
            <Tap
              key={`${m.period.year}-${m.period.month}`}
              style={st.monthCard}
              onPress={() => {
                setPeriod(m.period);
                router.navigate('/');
              }}>
              <Row style={layout.between}>
                <Row gap={8}>
                  <T w={800} size={15.5}>
                    {monthName(m.period.month)}
                  </T>
                  {current && (
                    <T w={800} size={11} color={C.white} style={st.current}>
                      {t('history.current')}
                    </T>
                  )}
                </Row>
                <T w={700} size={13} color={C.muted}>
                  {t('history.savings')}{' '}
                  <T w={700} size={13} tabular>
                    {signed(inc - out)}
                  </T>
                </T>
              </Row>
              <Row gap={8}>
                <Stack gap={2} style={layout.fill}>
                  <T w={600} size={13} color={C.muted}>
                    {t('common.incomes')}
                  </T>
                  <T w={800} size={13} color={C.in} tabular>
                    {fmt(inc)}
                  </T>
                </Stack>
                <Stack gap={2} style={layout.fill}>
                  <T w={600} size={13} color={C.muted}>
                    {t('common.expenses')}
                  </T>
                  <T w={800} size={13} color={C.out} tabular>
                    {fmt(out)}
                  </T>
                </Stack>
              </Row>
              {(extra > 0 || m.pending.length > 0) && (
                <Row gap={6} style={layout.wrap}>
                  {extra > 0 && (
                    <T w={800} size={11.5} color={C.extraDark} style={st.extraTag}>
                      {t('history.includesExtra', { amount: fmt(extra) })}
                    </T>
                  )}
                  {m.pending.length > 0 && (
                    <T w={800} size={11.5} color={C.muted2} style={st.pendTag}>
                      {t('history.unconfirmedCount', { count: m.pending.length })}
                    </T>
                  )}
                </Row>
              )}
            </Tap>
          );
        })}
      </Stack>

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title={t('history.unconfirmed')}>
        <T size={13} color={C.muted2} style={common.bodyText}>
          {t('history.sheet.text')}
        </T>

        {count === 0 && (
          <Card style={st.allDone}>
            <IconCheck size={26} color={C.in} stroke={2} />
            <T w={800} size={15}>
              {t('history.sheet.allDone')}
            </T>
            <T size={13} color={C.muted2}>
              {t('history.sheet.allDoneText')}
            </T>
          </Card>
        )}

        {pendingItems.map((p) => {
          const income = p.type === 'ingreso';
          return (
            <View key={p.key} style={st.pendCard}>
              <Row gap={12}>
                <View style={[st.pendIcon, income ? st.pendIconIn : st.pendIconOut]}>
                  {income ? <IconArrowUp color={C.in} /> : <IconArrowDown color={C.danger} />}
                </View>
                <Stack gap={2} style={layout.fill}>
                  <T w={800} size={15} numberOfLines={1}>
                    {p.name}
                  </T>
                  <T w={600} size={12.5} color={C.muted}>
                    {joinMeta(
                      income ? t('common.income') : t('common.expense'),
                      p.mov && t('history.sheet.occasional'),
                      t('history.sheet.periodOf', { month: monthYearOf(p.date) }),
                    )}
                  </T>
                </Stack>
                <T w={800} size={15} tabular color={income ? C.in : C.out}>
                  {fmtFlow(p.amount, income)}
                </T>
              </Row>
              <Row gap={8}>
                <Tap
                  style={[st.pendAction, st.pendDelete]}
                  accessibilityLabel={t('history.sheet.deleteLabel', { name: p.name })}
                  onPress={() => discard(p)}>
                  <IconTrash size={16} color={C.danger} stroke={2} />
                  <T w={800} size={14} color={C.danger}>
                    {t('history.sheet.delete')}
                  </T>
                </Tap>
                <Tap
                  style={[st.pendAction, st.pendConfirm]}
                  accessibilityLabel={t('history.sheet.confirmLabel', { name: p.name })}
                  onPress={() => confirm(p)}>
                  <IconCheck size={16} color={C.white} stroke={2.4} />
                  <T w={800} size={14} color={C.white}>
                    {t('history.sheet.confirm')}
                  </T>
                </Tap>
              </Row>
            </View>
          );
        })}

        {resolved.length > 0 && (
          <Stack gap={8}>
            <T w={800} size={13} color={C.muted2}>
              {t('history.sheet.resolved')}
            </T>
            {resolved.map((r) => {
              const confirmed = r.status === 'paid';
              return (
                <Row key={`${r.fixed_id}-${r.due_date}`} gap={10} style={st.resolvedRow}>
                  <T
                    w={700}
                    size={13}
                    color={confirmed ? C.ink : C.muted}
                    numberOfLines={1}
                    style={[st.resolvedName, !confirmed && st.resolvedSkipped]}>
                    {joinMeta(r.fixed.name, monthOf(r.due_date))}
                  </T>
                  <T
                    w={800}
                    size={11.5}
                    color={confirmed ? C.extraDark : C.muted2}
                    style={[st.tag, confirmed ? st.tagExtra : st.tagSkipped]}>
                    {confirmed ? t('common.extraordinary') : t('history.sheet.deleted')}
                  </T>
                  <Tap onPress={() => act(() => unmark(db, r.fixed_id, r.due_date))} style={st.undo}>
                    <T w={800} size={13} color={C.in}>
                      {t('history.sheet.undo')}
                    </T>
                  </Tap>
                </Row>
              );
            })}
          </Stack>
        )}
      </Sheet>
    </Screen>
  );
}

function Bar({ base, extra, pend, color, pendColor }: { base: number; extra: number; pend: number; color: string; pendColor?: string }) {
  const hasTop = extra > 0 || pend > 0;
  return (
    <View style={st.bar}>
      {pend > 0 && <View style={[st.pendBar, { height: pend, borderColor: pendColor ?? color }]} />}
      {extra > 0 && <View style={[st.topBar, { height: extra }]} />}
      {base > 0 && <View style={[st.baseBar, { height: base, backgroundColor: color }, !hasTop && st.baseBarTop]} />}
    </View>
  );
}

function Legend({ color, label, dashed }: { color?: string; label: string; dashed?: boolean }) {
  return (
    <Row gap={6} style={st.legendItem}>
      <View style={[st.swatch, dashed ? st.swatchDashed : { backgroundColor: color }]} />
      <T w={700} size={12} color={C.muted2}>
        {label}
      </T>
    </Row>
  );
}
