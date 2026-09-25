import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { IconArrowDown, IconArrowUp, IconCheck, IconPending, IconTrash } from '@/components/icons';
import { Card, Header, Row, Screen, Sheet, T, Tap } from '@/components/ui';
import { C } from '@/constants/theme';
import { listMovements, loadFixedData, markPaid, skipOccurrence, unmark, type Fixed } from '@/db/repo';
import { periodOf, periodRange, samePeriod, shiftPeriod, type Period } from '@/lib/dates';
import { fixedItems, sum, type FixedItem } from '@/lib/finance';
import { fmt, MONTHS, signed } from '@/lib/format';
import { useApp, useLoad } from '@/state/app';

const BAR_H = 150;

type MonthAgg = {
  period: Period;
  inc: number;
  out: number;
  inExtra: number;
  outExtra: number;
  inPend: number;
  outPend: number;
  pending: FixedItem[];
};

export default function Historial() {
  const db = useSQLiteContext();
  const { currentPeriod, settings, setPeriod, bump, holidays } = useApp();
  const [sheetOpen, setSheetOpen] = useState(false);

  const data = useLoad(
    async (d) => {
      const periods = [-5, -4, -3, -2, -1, 0].map((k) => shiftPeriod(currentPeriod, k));
      const first = periodRange(periods[0], settings.monthStart);
      const last = periodRange(periods[5], settings.monthStart);
      const [movs, fixedData] = await Promise.all([listMovements(d, first.from, last.to), loadFixedData(d)]);

      const months: MonthAgg[] = periods.map((p, i) => {
        const { from, to } = periodRange(p, settings.monthStart);
        const ms = movs.filter((m) => m.date >= from && m.date < to && m.paid);
        const pick = (type: string, extra: number) => sum(ms.filter((m) => m.type === type && m.extraordinary === extra));
        // Los fijos sin confirmar solo cuentan en meses ya cerrados.
        const pending = i < 5 ? fixedItems(fixedData, from, to, settings.holiday, holidays).filter((x) => !x.paid) : [];
        return {
          period: p,
          inc: pick('ingreso', 0),
          out: pick('gasto', 0),
          inExtra: pick('ingreso', 1),
          outExtra: pick('gasto', 1),
          inPend: sum(pending.filter((x) => x.fixed.type === 'ingreso')),
          outPend: sum(pending.filter((x) => x.fixed.type === 'gasto')),
          pending,
        };
      });

      const byId = new Map<number, Fixed>(fixedData.fixed.map((f) => [f.id, f]));
      const resolved = [...fixedData.statuses.values()]
        .filter((r) => r.resolved_at && byId.has(r.fixed_id))
        .sort((a, b) => (a.resolved_at! < b.resolved_at! ? 1 : -1))
        .slice(0, 10)
        .map((r) => ({ ...r, fixed: byId.get(r.fixed_id)! }));
      return { months, resolved };
    },
    [currentPeriod.year, currentPeriod.month, settings.monthStart, settings.holiday],
  );

  if (!data) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  const { months, resolved } = data;

  const max = Math.max(
    1,
    ...months.map((m) => Math.max(m.inc + m.inExtra + m.inPend, m.out + m.outExtra + m.outPend)),
  );
  const scale = (v: number) => (v > 0 ? Math.max(4, Math.round((v / max) * BAR_H)) : 0);
  const avg = Math.round(months.reduce((s, m) => s + m.inc + m.inExtra - m.out - m.outExtra, 0) / months.length / 1000) * 1000;
  const pendingItems = months.flatMap((m) => m.pending);
  const count = pendingItems.length;

  const act = async (fn: () => Promise<unknown>) => {
    await fn();
    bump();
  };

  return (
    <Screen>
      <Header
        kicker="Últimos 6 meses"
        title="Meses"
        right={
          <Tap
            onPress={() => setSheetOpen(true)}
            accessibilityLabel={count ? `Movimientos sin confirmar: ${count}` : 'Movimientos sin confirmar: ninguno'}
            style={st.pendBtn}>
            <IconPending size={20} />
            {count > 0 && (
              <View style={st.badge}>
                <T w={800} size={11} color="#FFFFFF">
                  {count}
                </T>
              </View>
            )}
          </Tap>
        }
      />

      <Card style={{ padding: 18, gap: 14 }}>
        <View style={{ gap: 2 }}>
          <T w={600} size={13} color={C.muted}>
            Ahorro promedio
          </T>
          <T serif w={600} size={26} tabular numberOfLines={1} adjustsFontSizeToFit>
            {signed(avg)}
          </T>
        </View>
        <Row style={{ alignItems: 'flex-end' }}>
          {months.map((m, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
              <Row gap={4} style={{ height: BAR_H, alignItems: 'flex-end' }}>
                <Bar base={scale(m.inc)} extra={scale(m.inExtra)} pend={scale(m.inPend)} color={C.in} />
                <Bar base={scale(m.out)} extra={scale(m.outExtra)} pend={scale(m.outPend)} color={C.outBar} pendColor={C.out} />
              </Row>
              <T w={700} size={12} color={i === 5 ? C.ink : C.muted}>
                {MONTHS[m.period.month].slice(0, 3)}
              </T>
            </View>
          ))}
        </Row>
        <View style={st.legend}>
          <Legend color={C.in} label="Ingresos" />
          <Legend color={C.outBar} label="Gastos" />
          <Legend color={C.extra} label="Extraordinario" />
          <Legend dashed label="Sin confirmar" />
        </View>
      </Card>

      <View style={{ gap: 10 }}>
        <T w={800} size={16}>
          Detalle por mes
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
              <Row style={{ justifyContent: 'space-between' }}>
                <Row gap={8}>
                  <T w={800} size={15.5}>
                    {MONTHS[m.period.month]}
                  </T>
                  {current && (
                    <T w={800} size={11} color="#FFFFFF" style={st.current}>
                      Actual
                    </T>
                  )}
                </Row>
                <T w={700} size={13} color={C.muted}>
                  Ahorro{' '}
                  <T w={700} size={13} tabular>
                    {signed(inc - out)}
                  </T>
                </T>
              </Row>
              <Row gap={8}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T w={600} size={13} color={C.muted}>
                    Ingresos
                  </T>
                  <T w={800} size={13} color={C.in} tabular>
                    {fmt(inc)}
                  </T>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T w={600} size={13} color={C.muted}>
                    Gastos
                  </T>
                  <T w={800} size={13} color={C.out} tabular>
                    {fmt(out)}
                  </T>
                </View>
              </Row>
              {(extra > 0 || m.pending.length > 0) && (
                <Row gap={6} style={{ flexWrap: 'wrap' }}>
                  {extra > 0 && (
                    <T w={800} size={11.5} color={C.extraDark} style={st.extraTag}>
                      Incluye {fmt(extra)} extraordinario
                    </T>
                  )}
                  {m.pending.length > 0 && (
                    <T w={800} size={11.5} color={C.muted2} style={st.pendTag}>
                      {m.pending.length} sin confirmar
                    </T>
                  )}
                </Row>
              )}
            </Tap>
          );
        })}
      </View>

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Sin confirmar">
        <T size={13} color={C.muted2} style={{ lineHeight: 19 }}>
          Fijos de meses anteriores que nunca se marcaron. Bórralos o confírmalos en un periodo extraordinario: se suman al
          mes al que pertenecen. Los que dejes aquí siguen esperando.
        </T>

        {count === 0 && (
          <Card style={{ paddingVertical: 22, paddingHorizontal: 16, alignItems: 'center', gap: 6 }}>
            <IconCheck size={26} color={C.in} stroke={2} />
            <T w={800} size={15}>
              Todo al día
            </T>
            <T size={13} color={C.muted2}>
              No quedan movimientos por decidir.
            </T>
          </Card>
        )}

        {pendingItems.map((p) => {
          const income = p.fixed.type === 'ingreso';
          const monthName = MONTHS[periodOf(p.occ.due, settings.monthStart).month].toLowerCase();
          return (
            <View key={`${p.fixed.id}-${p.occ.due}`} style={st.pendCard}>
              <Row gap={12}>
                <View style={[st.pendIcon, { backgroundColor: income ? '#E3EDF5' : '#FBEBDF' }]}>
                  {income ? <IconArrowUp color={C.in} /> : <IconArrowDown color={C.danger} />}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T w={800} size={15} numberOfLines={1}>
                    {p.name}
                  </T>
                  <T w={600} size={12.5} color={C.muted}>
                    {income ? 'Ingreso' : 'Gasto'} · periodo de {monthName}
                  </T>
                </View>
                <T w={800} size={15} tabular color={income ? C.in : C.out}>
                  {(income ? '+ ' : '− ') + fmt(p.amount)}
                </T>
              </Row>
              <Row gap={8}>
                <Tap
                  style={[st.pendAction, { borderWidth: 1.5, borderColor: C.line, backgroundColor: C.card }]}
                  accessibilityLabel={`Borrar ${p.name}`}
                  onPress={() => act(() => skipOccurrence(db, p.fixed.id, p.occ.due))}>
                  <IconTrash size={16} color={C.danger} stroke={2} />
                  <T w={800} size={14} color={C.danger}>
                    Borrar
                  </T>
                </Tap>
                <Tap
                  style={[st.pendAction, { backgroundColor: C.extra }]}
                  accessibilityLabel={`Confirmar ${p.name} en periodo extraordinario`}
                  onPress={() => act(() => markPaid(db, p.fixed, p.occ.due, { extra: true, amount: p.amount, date: p.occ.date }))}>
                  <IconCheck size={16} color="#FFFFFF" stroke={2.4} />
                  <T w={800} size={14} color="#FFFFFF">
                    Confirmar
                  </T>
                </Tap>
              </Row>
            </View>
          );
        })}

        {resolved.length > 0 && (
          <View style={{ gap: 8 }}>
            <T w={800} size={13} color={C.muted2}>
              Resueltos
            </T>
            {resolved.map((r) => {
              const confirmed = r.status === 'paid';
              return (
                <Row key={`${r.fixed_id}-${r.due_date}`} gap={10} style={{ minHeight: 44 }}>
                  <T
                    w={700}
                    size={13}
                    color={confirmed ? C.ink : C.muted}
                    numberOfLines={1}
                    style={{ flex: 1, textDecorationLine: confirmed ? 'none' : 'line-through' }}>
                    {r.fixed.name} · {MONTHS[periodOf(r.due_date, settings.monthStart).month]}
                  </T>
                  <T
                    w={800}
                    size={11.5}
                    color={confirmed ? C.extraDark : C.muted2}
                    style={[st.tag, { backgroundColor: confirmed ? C.extraSoft : '#E9E5DE' }]}>
                    {confirmed ? 'Extraordinario' : 'Borrado'}
                  </T>
                  <Tap onPress={() => act(() => unmark(db, r.fixed_id, r.due_date))} style={{ padding: 10 }}>
                    <T w={800} size={13} color={C.in}>
                      Deshacer
                    </T>
                  </Tap>
                </Row>
              );
            })}
          </View>
        )}
      </Sheet>
    </Screen>
  );
}

function Bar({ base, extra, pend, color, pendColor }: { base: number; extra: number; pend: number; color: string; pendColor?: string }) {
  const hasTop = extra > 0 || pend > 0;
  return (
    <View style={{ width: 12, gap: 2 }}>
      {pend > 0 && <View style={[st.pendBar, { height: pend, borderColor: pendColor ?? color }]} />}
      {extra > 0 && <View style={[st.topBar, { height: extra, backgroundColor: C.extra }]} />}
      {base > 0 && (
        <View
          style={[
            { height: base, backgroundColor: color, borderRadius: 3 },
            !hasTop && { borderTopLeftRadius: 6, borderTopRightRadius: 6 },
          ]}
        />
      )}
    </View>
  );
}

function Legend({ color, label, dashed }: { color?: string; label: string; dashed?: boolean }) {
  return (
    <Row gap={6} style={{ width: '48%' }}>
      <View
        style={[
          { width: 10, height: 10, borderRadius: 3 },
          dashed ? { borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.muted } : { backgroundColor: color },
        ]}
      />
      <T w={700} size={12} color={C.muted2}>
        {label}
      </T>
    </Row>
  );
}

const st = StyleSheet.create({
  pendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: C.bg,
    backgroundColor: C.out,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
    columnGap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EFEBE4',
  },
  pendBar: { borderWidth: 1.5, borderStyle: 'dashed', borderTopLeftRadius: 6, borderTopRightRadius: 6, borderRadius: 3 },
  topBar: { borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  monthCard: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  current: { backgroundColor: C.ink, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, overflow: 'hidden' },
  extraTag: { backgroundColor: C.extraSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' },
  pendTag: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.faint, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  pendCard: {
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#C9C2B6',
    borderRadius: 18,
    padding: 14,
    gap: 12,
  },
  pendIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pendAction: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' },
});
