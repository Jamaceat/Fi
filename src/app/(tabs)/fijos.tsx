import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { DatePicker } from '@/components/calendar';
import {
  IconCalendar,
  IconCheck,
  IconChevronRight,
  IconClose,
  IconPlus,
  IconRefresh,
  IconSearch,
} from '@/components/icons';
import {
  AmountField,
  EmptyBox,
  Header,
  LinkText,
  PrimaryButton,
  Progress,
  RoundButton,
  Row,
  Screen,
  SectionTitle,
  Segmented,
  Sheet,
  T,
  Tap,
} from '@/components/ui';
import { C, F } from '@/constants/theme';
import { clearOverride, loadFixedData, markPaid, saveOverride, unmark } from '@/db/repo';
import { longDate, periodName, shortDate } from '@/lib/dates';
import { fixedItems, sum, type FixedItem } from '@/lib/finance';
import { cleanAmount, dots, fmt, plural } from '@/lib/format';
import { describeSchedule } from '@/lib/schedule';
import { useApp, useLoad } from '@/state/app';

type Tab = 'gastos' | 'ingresos';

const norm = (t: string) =>
  t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export default function Fijos() {
  const db = useSQLiteContext();
  const { period, range, settings, bump, holidays } = useApp();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'ingresos' ? 'ingresos' : 'gastos');
  const [lastParam, setLastParam] = useState(params.tab);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [confirming, setConfirming] = useState<{ item: FixedItem; input: string } | null>(null);
  const [adjusting, setAdjusting] = useState<{ item: FixedItem; input: string; date: string } | null>(null);
  const [dateOpen, setDateOpen] = useState(false);

  // Inicio abre esta pestaña con ?tab=ingresos; se aplica una vez y se limpia el parámetro.
  if (params.tab !== lastParam) {
    setLastParam(params.tab);
    if (params.tab === 'ingresos' || params.tab === 'gastos') setTab(params.tab);
  }
  useEffect(() => {
    if (params.tab) router.setParams({ tab: undefined });
  }, [params.tab]);

  const items =
    useLoad(
      async (d) => {
        const data = await loadFixedData(d);
        return fixedItems(data, range.from, range.to, settings.holiday, holidays);
      },
      [range.from, range.to, settings.holiday],
    ) ?? [];

  // Pendiente: ajusta el monto o la fecha de esa vez. Pagado: se cambia desde el movimiento.
  const openItem = (item: FixedItem) => {
    if (item.paid) editFixed(item);
    else {
      setDateOpen(false);
      setAdjusting({ item, input: String(item.amount), date: item.occ.date });
    }
  };

  const saveAdjust = async () => {
    if (!adjusting) return;
    const amount = Number(adjusting.input) || 0;
    if (amount <= 0) return;
    const { item, date } = adjusting;
    // Lo que coincide con lo que ya le toca no se guarda como ajuste.
    await saveOverride(db, item.fixed.id, item.occ.due, {
      amount: amount === item.base ? null : amount,
      date: date === item.planned ? null : date,
    });
    setAdjusting(null);
    bump();
  };

  const resetAdjust = async () => {
    if (!adjusting) return;
    await clearOverride(db, adjusting.item.fixed.id, adjusting.item.occ.due);
    setAdjusting(null);
    bump();
  };

  const toggle = async (item: FixedItem) => {
    if (item.paid) {
      await unmark(db, item.fixed.id, item.occ.due);
    } else if (item.fixed.variable) {
      setConfirming({ item, input: String(item.amount) });
      return;
    } else {
      await markPaid(db, item.fixed, item.occ.due, { amount: item.amount, date: item.occ.date });
    }
    bump();
  };

  const confirmVariable = async () => {
    if (!confirming) return;
    const amount = Number(confirming.input) || 0;
    if (amount <= 0) return;
    await markPaid(db, confirming.item.fixed, confirming.item.occ.due, { amount, date: confirming.item.occ.date });
    setConfirming(null);
    bump();
  };

  const q = searchOpen ? norm(query) : '';
  const match = (i: FixedItem) => !q || norm(i.name).includes(q);
  const gastosAll = items.filter((i) => i.fixed.type === 'gasto');
  const ingresosAll = items.filter((i) => i.fixed.type === 'ingreso');
  const gastos = gastosAll.filter(match);
  const ingresos = ingresosAll.filter(match);
  const isGastos = tab === 'gastos';

  let searchStatus = '';
  if (q) {
    const here = isGastos ? gastos.length : ingresos.length;
    const other = isGastos ? ingresos.length : gastos.length;
    searchStatus = `${plural(here, 'resultado', 'resultados')} en ${isGastos ? 'gastos' : 'ingresos'}`;
    if (other) searchStatus += ` · ${other} en ${isGastos ? 'ingresos' : 'gastos'}`;
  }

  const total = sum(gastosAll);
  const paidSum = sum(gastosAll.filter((i) => i.paid));
  const incTotal = sum(ingresosAll);
  const incPaid = sum(ingresosAll.filter((i) => i.paid));
  const emptyHint = q ? 'Prueba con otra palabra o revisa la otra pestaña' : 'Toca Agregar para crear uno';

  return (
    <Screen>
      <Header
        kicker={`${periodName(period)} ${period.year}`}
        title="Fijos"
        right={
          <Row gap={8}>
            <RoundButton
              label={searchOpen ? 'Ocultar buscador' : 'Buscar en fijos'}
              onPress={() => {
                setSearchOpen(!searchOpen);
                setQuery('');
              }}
              bg={searchOpen ? C.in : C.card}
              border={searchOpen ? C.in : C.line}>
              <IconSearch color={searchOpen ? '#FFFFFF' : C.ink} />
            </RoundButton>
            <Tap
              style={st.add}
              onPress={() =>
                router.push({ pathname: '/fijo/[id]', params: { id: 'nuevo', kind: isGastos ? 'gasto' : 'ingreso' } })
              }>
              <IconPlus size={16} />
              <T w={800} size={13.5}>
                Agregar
              </T>
            </Tap>
          </Row>
        }
      />

      {searchOpen && (
        <View style={{ gap: 6 }}>
          <Row gap={8} style={st.search}>
            <IconSearch color={C.muted} />
            <TextInput
              autoFocus
              value={query}
              onChangeText={(t) => setQuery(t.slice(0, 40))}
              placeholder={isGastos ? 'Buscar gasto fijo' : 'Buscar ingreso fijo'}
              placeholderTextColor="#8A847A"
              style={{ flex: 1, fontFamily: F[600], fontSize: 15, color: C.ink, padding: 0 }}
            />
            {!!q && (
              <Tap onPress={() => setQuery('')} accessibilityLabel="Borrar búsqueda" style={{ padding: 12 }}>
                <IconClose size={16} color={C.muted} />
              </Tap>
            )}
          </Row>
          {!!q && (
            <T w={600} size={12.5} color={C.muted}>
              {searchStatus}
            </T>
          )}
        </View>
      )}

      <Segmented
        options={[
          { id: 'gastos', label: 'Gastos', extra: String(gastos.length) },
          { id: 'ingresos', label: 'Ingresos', extra: String(ingresos.length), activeFg: C.inDark },
        ]}
        value={tab}
        onChange={setTab}
      />

      {isGastos ? (
        <>
          <View style={st.hero}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T w={600} size={13} color={C.heroSub}>
                Pagado este mes
              </T>
              <T w={700} size={13} color={C.heroSub}>
                {gastosAll.filter((i) => i.paid).length} de {gastosAll.length} pagos
              </T>
            </Row>
            <T serif size={36} color={C.bg} tabular style={{ letterSpacing: -0.5 }}>
              {fmt(paidSum)}
            </T>
            <Progress pct={total ? (paidSum / total) * 100 : 0} color={C.outBar} track={C.heroTrack} />
            <Row style={{ justifyContent: 'space-between' }}>
              <T size={13} color={C.heroSub}>
                de {fmt(total)}
              </T>
              <T w={700} size={13} color={C.outText}>
                Pendiente {fmt(total - paidSum)}
              </T>
            </Row>
          </View>

          <View style={{ gap: 10 }}>
            <SectionTitle>Gastos fijos</SectionTitle>
            {gastos.length === 0 ? (
              <EmptyBox title={q ? 'Sin gastos que coincidan' : 'Sin gastos fijos este mes'} hint={emptyHint} />
            ) : (
              <View style={st.list}>
                {gastos.map((item, i) => (
                  <GastoRow
                    key={`${item.fixed.id}-${item.occ.due}`}
                    item={item}
                    first={i === 0}
                    onToggle={() => toggle(item)}
                    onOpen={() => openItem(item)}
                  />
                ))}
              </View>
            )}
          </View>
        </>
      ) : (
        <View style={{ gap: 10 }}>
          <SectionTitle
            right={
              <T w={700} size={13} color={C.muted}>
                {ingresosAll.filter((i) => i.paid).length} de {ingresosAll.length} recibidos
              </T>
            }>
            Ingresos fijos
          </SectionTitle>
          <View style={st.incHero}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T w={700} size={13} color={C.inDark}>
                Recibido este mes
              </T>
              <T w={700} size={13} color={C.inDark}>
                de {fmt(incTotal)}
              </T>
            </Row>
            <T serif w={600} size={28} color={C.inDark} tabular>
              {fmt(incPaid)}
            </T>
            <Progress pct={incTotal ? (incPaid / incTotal) * 100 : 0} color={C.in} track={C.inTrack2} />
          </View>
          {ingresos.length === 0 && (
            <EmptyBox title={q ? 'Sin ingresos que coincidan' : 'Sin ingresos fijos este mes'} hint={emptyHint} />
          )}
          {ingresos.map((item) => (
            <IngresoCard
              key={`${item.fixed.id}-${item.occ.due}`}
              item={item}
              onToggle={() => toggle(item)}
              onOpen={() => openItem(item)}
            />
          ))}
        </View>
      )}

      <Sheet
        visible={!!confirming}
        onClose={() => setConfirming(null)}
        title={confirming ? `Confirmar ${confirming.item.name}` : ''}>
        <T size={13} color={C.muted2}>
          Este fijo tiene monto variable. ¿Cuánto fue esta vez?
        </T>
        <View style={st.amountBox}>
          <AmountField
            size={40}
            autoFocus
            value={dots(confirming?.input ?? '')}
            onChangeText={(t) => confirming && setConfirming({ ...confirming, input: cleanAmount(t) })}
          />
        </View>
        <PrimaryButton
          label={confirming?.item.fixed.type === 'ingreso' ? 'Marcar como recibido' : 'Marcar como pagado'}
          bg={confirming?.item.fixed.type === 'ingreso' ? C.in : C.ink}
          disabled={!Number(confirming?.input)}
          onPress={confirmVariable}
        />
      </Sheet>

      <Sheet
        visible={!!adjusting}
        onClose={() => setAdjusting(null)}
        title={adjusting ? `${adjusting.item.name} · ${shortDate(adjusting.item.planned)}` : ''}>
        <T size={13} color={C.muted2}>
          Cambia el monto o la fecha solo esta vez. Los demás pagos siguen igual (
          {fmt(adjusting?.item.base ?? 0)}).
        </T>
        <View style={st.amountBox}>
          <AmountField
            size={40}
            value={dots(adjusting?.input ?? '')}
            onChangeText={(t) => adjusting && setAdjusting({ ...adjusting, input: cleanAmount(t) })}
          />
        </View>
        <View style={{ gap: 6 }}>
          <T w={800} size={14}>
            {adjusting?.item.fixed.type === 'ingreso' ? 'Fecha en que llega' : 'Fecha de pago'}
          </T>
          <Tap onPress={() => setDateOpen((o) => !o)} style={st.dateBtn} accessibilityLabel="Cambiar la fecha de esta vez">
            <T w={600} size={14.5}>
              {adjusting ? longDate(adjusting.date) : ''}
            </T>
            <IconCalendar color={C.muted} />
          </Tap>
          {adjusting && adjusting.date !== adjusting.item.planned && (
            <T size={12.5} color={C.warn}>
              Le tocaba el {shortDate(adjusting.item.planned)}. Solo esta vez cambia de fecha.
            </T>
          )}
          {dateOpen && adjusting && (
            <DatePicker
              value={adjusting.date}
              filter={adjusting.item.fixed.type}
              onChange={(iso) => {
                setAdjusting({ ...adjusting, date: iso });
                setDateOpen(false);
              }}
            />
          )}
        </View>
        <PrimaryButton
          label="Guardar solo esta vez"
          bg={adjusting?.item.fixed.type === 'ingreso' ? C.in : C.ink}
          disabled={!Number(adjusting?.input)}
          onPress={saveAdjust}
        />
        <Row style={{ justifyContent: 'space-between' }}>
          {adjusting && (adjusting.item.adjusted || adjusting.item.moved) ? (
            <LinkText onPress={resetAdjust}>Quitar el ajuste</LinkText>
          ) : (
            <View />
          )}
          <LinkText
            onPress={() => {
              const item = adjusting?.item;
              setAdjusting(null);
              if (item) editFixed(item);
            }}>
            Editar el fijo
          </LinkText>
        </Row>
      </Sheet>
    </Screen>
  );
}

const adjustNote = (item: FixedItem) =>
  item.moved && item.adjusted
    ? 'Monto y fecha cambiados solo esta vez'
    : item.moved
      ? `Fecha cambiada solo esta vez (era el ${shortDate(item.planned)})`
      : item.adjusted
        ? 'Monto ajustado solo esta vez'
        : '';

const editFixed = (item: FixedItem) =>
  router.push({ pathname: '/fijo/[id]', params: { id: String(item.fixed.id) } });

function GastoRow({
  item,
  first,
  onToggle,
  onOpen,
}: {
  item: FixedItem;
  first: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const p = item.paid;
  return (
    <Row gap={12} style={[{ paddingVertical: 10 }, !first && { borderTopWidth: 1, borderTopColor: C.divider }]}>
      <Tap
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: p }}
        accessibilityLabel={`${p ? 'Desmarcar' : 'Marcar'} ${item.name} como pagado`}
        style={[st.check, { borderColor: p ? C.ink : C.ring, backgroundColor: p ? C.ink : C.card }]}>
        {p && <IconCheck size={18} color="#FFFFFF" />}
      </Tap>
      <Tap onPress={onOpen} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <T w={700} size={15} numberOfLines={1}>
            {item.name}
          </T>
          <T w={600} size={12.5} color={p ? C.muted : C.warn}>
            {p ? `Pagado · ${shortDate(item.occ.date)}` : `Vence el ${shortDate(item.occ.date)}`}
          </T>
          <T w={700} size={11.5} color={C.muted} numberOfLines={1}>
            {adjustNote(item) || describeSchedule(item.fixed)}
          </T>
        </View>
        <T w={800} size={15} tabular>
          {!p && item.fixed.variable ? '≈ ' : ''}
          {fmt(item.amount)}
        </T>
        <IconChevronRight size={16} color={C.faint} />
      </Tap>
    </Row>
  );
}

function IngresoCard({ item, onToggle, onOpen }: { item: FixedItem; onToggle: () => void; onOpen: () => void }) {
  const p = item.paid;
  const statusColor = p ? C.in : C.warn;
  return (
    <View style={st.incCard}>
      <Row gap={12} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ gap: 3, flex: 1 }}>
          <T w={700} size={15}>
            {item.name}
          </T>
          <Row gap={6}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusColor }} />
            <T w={700} size={12.5} color={statusColor}>
              {p ? `Recibido el ${shortDate(item.occ.date)}` : `Pendiente · esperado el ${shortDate(item.occ.date)}`}
            </T>
          </Row>
        </View>
        <Tap
          onPress={onOpen}
          disabled={p}
          accessibilityLabel={`Cambiar monto de ${item.name} solo esta fecha`}
          style={{ alignItems: 'flex-end', gap: 2, minHeight: 44, justifyContent: 'center' }}>
          <T w={800} size={16} color={C.in} tabular>
            {!p && item.fixed.variable ? '≈ ' : ''}
            {fmt(item.amount)}
          </T>
          {!!adjustNote(item) && (
            <T w={700} size={11} color={C.muted}>
              {adjustNote(item)}
            </T>
          )}
        </Tap>
      </Row>
      <Tap onPress={() => editFixed(item)} style={st.periodBtn} accessibilityLabel={`Editar ${item.name}`}>
        <IconRefresh color={C.inDark} stroke={1.9} />
        <View style={{ flex: 1, gap: 1 }}>
          <T w={700} size={11.5} color={C.muted}>
            Periodicidad
          </T>
          <T w={800} size={13.5}>
            {describeSchedule(item.fixed)}
          </T>
        </View>
        <T w={800} size={13} color={C.in}>
          Editar
        </T>
      </Tap>
      <Tap
        onPress={onToggle}
        accessibilityState={{ checked: p }}
        style={[st.receive, { backgroundColor: p ? C.in : C.card }]}>
        {p && <IconCheck size={18} color="#FFFFFF" />}
        <T w={800} size={14} color={p ? '#FFFFFF' : C.in}>
          {p ? 'Recibido' : 'Marcar como recibido'}
        </T>
      </Tap>
    </View>
  );
}

const st = StyleSheet.create({
  add: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  search: {
    height: 48,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: C.in,
    backgroundColor: C.card,
    paddingLeft: 14,
    paddingRight: 4,
  },
  hero: { backgroundColor: C.hero, borderRadius: 24, padding: 20, gap: 14 },
  list: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 4 },
  check: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  incHero: { backgroundColor: C.inSoft, borderRadius: 20, padding: 16, gap: 10 },
  incCard: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
  periodBtn: { minHeight: 44, borderRadius: 12, backgroundColor: C.bg, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  receive: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.in,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  amountBox: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, paddingVertical: 14 },
  dateBtn: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
});
