import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';

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
  Stack,
  T,
  Tap,
} from '@/components/ui';
import { C } from '@/constants/theme';
import { clearOverride, loadFixedData, markPaid, saveOverride, unmark } from '@/db/repo';
import { t } from '@/i18n';
import { longDate, periodLabel, shortDate } from '@/lib/dates';
import { fixedItems, sum, type FixedItem } from '@/lib/finance';
import { APPROX, cleanAmount, dots, fmt } from '@/lib/format';
import { describeSchedule } from '@/lib/schedule';
import { useApp, useLoad } from '@/state/app';
import { common, layout } from '@/styles/common';
import { styles as st } from '@/styles/screens/fijos.styles';

type Tab = 'gastos' | 'ingresos';

/** Minúsculas y sin tildes, para buscar sin importar cómo se escribió. */
const norm = (text: string) =>
  text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const isIncome = (item: FixedItem | undefined) => item?.fixed.type === 'ingreso';

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
  const other: Tab = isGastos ? 'ingresos' : 'gastos';

  let searchStatus = '';
  if (q) {
    const here = isGastos ? gastos.length : ingresos.length;
    const there = isGastos ? ingresos.length : gastos.length;
    searchStatus = t(`fixed.search.results.${tab}`, { count: here });
    if (there) searchStatus += t(`fixed.search.otherResults.${other}`, { count: there });
  }

  const total = sum(gastosAll);
  const paidSum = sum(gastosAll.filter((i) => i.paid));
  const incTotal = sum(ingresosAll);
  const incPaid = sum(ingresosAll.filter((i) => i.paid));
  const emptyHint = q ? t('fixed.empty.searchHint') : t('fixed.empty.addHint');
  const confirmingIncome = isIncome(confirming?.item);
  const adjustingIncome = isIncome(adjusting?.item);

  return (
    <Screen>
      <Header
        kicker={periodLabel(period)}
        title={t('fixed.title')}
        right={
          <Row gap={8}>
            <RoundButton
              label={searchOpen ? t('fixed.search.hide') : t('fixed.search.show')}
              onPress={() => {
                setSearchOpen(!searchOpen);
                setQuery('');
              }}
              bg={searchOpen ? C.in : C.card}
              border={searchOpen ? C.in : C.line}>
              <IconSearch color={searchOpen ? C.white : C.ink} />
            </RoundButton>
            <Tap
              style={common.pillBtn}
              onPress={() =>
                router.push({ pathname: '/fijo/[id]', params: { id: 'nuevo', kind: isGastos ? 'gasto' : 'ingreso' } })
              }>
              <IconPlus size={16} />
              <T w={800} size={13.5}>
                {t('common.add')}
              </T>
            </Tap>
          </Row>
        }
      />

      {searchOpen && (
        <Stack gap={6}>
          <Row gap={8} style={st.search}>
            <IconSearch color={C.muted} />
            <TextInput
              autoFocus
              value={query}
              onChangeText={(text) => setQuery(text.slice(0, 40))}
              placeholder={t(`fixed.search.placeholder.${tab}`)}
              placeholderTextColor={C.placeholder}
              style={st.searchInput}
            />
            {!!q && (
              <Tap onPress={() => setQuery('')} accessibilityLabel={t('fixed.search.clear')} style={st.searchClear}>
                <IconClose size={16} color={C.muted} />
              </Tap>
            )}
          </Row>
          {!!q && (
            <T w={600} size={12.5} color={C.muted}>
              {searchStatus}
            </T>
          )}
        </Stack>
      )}

      <Segmented
        options={[
          { id: 'gastos', label: t('common.expenses'), extra: String(gastos.length) },
          { id: 'ingresos', label: t('common.incomes'), extra: String(ingresos.length), activeFg: C.inDark },
        ]}
        value={tab}
        onChange={setTab}
      />

      {isGastos ? (
        <>
          <View style={st.hero}>
            <Row style={layout.between}>
              <T w={600} size={13} color={C.heroSub}>
                {t('fixed.expenses.paidThisMonth')}
              </T>
              <T w={700} size={13} color={C.heroSub}>
                {t('fixed.expenses.paidCount', { done: gastosAll.filter((i) => i.paid).length, total: gastosAll.length })}
              </T>
            </Row>
            <T serif size={36} color={C.bg} tabular numberOfLines={1} adjustsFontSizeToFit style={st.heroAmount}>
              {fmt(paidSum)}
            </T>
            <Progress pct={total ? (paidSum / total) * 100 : 0} color={C.outBar} track={C.heroTrack} />
            <Row style={layout.between}>
              <T size={13} color={C.heroSub}>
                {t('fixed.ofTotal', { amount: fmt(total) })}
              </T>
              <T w={700} size={13} color={C.outText}>
                {t('fixed.expenses.pending', { amount: fmt(total - paidSum) })}
              </T>
            </Row>
          </View>

          <Stack gap={10}>
            <SectionTitle>{t('fixed.expenses.title')}</SectionTitle>
            {gastos.length === 0 ? (
              <EmptyBox title={q ? t('fixed.empty.noMatch.gastos') : t('fixed.empty.none.gastos')} hint={emptyHint} />
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
          </Stack>
        </>
      ) : (
        <Stack gap={10}>
          <SectionTitle
            right={
              <T w={700} size={13} color={C.muted}>
                {t('fixed.incomes.receivedCount', { done: ingresosAll.filter((i) => i.paid).length, total: ingresosAll.length })}
              </T>
            }>
            {t('fixed.incomes.title')}
          </SectionTitle>
          <View style={st.incHero}>
            <Row style={layout.between}>
              <T w={700} size={13} color={C.inDark}>
                {t('fixed.incomes.receivedThisMonth')}
              </T>
              <T w={700} size={13} color={C.inDark}>
                {t('fixed.ofTotal', { amount: fmt(incTotal) })}
              </T>
            </Row>
            <T serif w={600} size={28} color={C.inDark} tabular numberOfLines={1} adjustsFontSizeToFit>
              {fmt(incPaid)}
            </T>
            <Progress pct={incTotal ? (incPaid / incTotal) * 100 : 0} color={C.in} track={C.inTrack2} />
          </View>
          {ingresos.length === 0 && (
            <EmptyBox title={q ? t('fixed.empty.noMatch.ingresos') : t('fixed.empty.none.ingresos')} hint={emptyHint} />
          )}
          {ingresos.map((item) => (
            <IngresoCard
              key={`${item.fixed.id}-${item.occ.due}`}
              item={item}
              onToggle={() => toggle(item)}
              onOpen={() => openItem(item)}
            />
          ))}
        </Stack>
      )}

      <Sheet
        visible={!!confirming}
        onClose={() => setConfirming(null)}
        title={confirming ? t('fixed.confirm.title', { name: confirming.item.name }) : ''}>
        <T size={13} color={C.muted2}>
          {t('fixed.confirm.text')}
        </T>
        <View style={common.amountBox}>
          <AmountField
            size={40}
            autoFocus
            value={dots(confirming?.input ?? '')}
            onChangeText={(text) => confirming && setConfirming({ ...confirming, input: cleanAmount(text) })}
          />
        </View>
        <PrimaryButton
          label={confirmingIncome ? t('fixed.markReceived') : t('fixed.markPaid')}
          bg={confirmingIncome ? C.in : C.ink}
          disabled={!Number(confirming?.input)}
          onPress={confirmVariable}
        />
      </Sheet>

      <Sheet
        visible={!!adjusting}
        onClose={() => setAdjusting(null)}
        title={adjusting ? t('fixed.adjust.title', { name: adjusting.item.name, date: shortDate(adjusting.item.planned) }) : ''}>
        <T size={13} color={C.muted2}>
          {t('fixed.adjust.text', { amount: fmt(adjusting?.item.base ?? 0) })}
        </T>
        <View style={common.amountBox}>
          <AmountField
            size={40}
            value={dots(adjusting?.input ?? '')}
            onChangeText={(text) => adjusting && setAdjusting({ ...adjusting, input: cleanAmount(text) })}
          />
        </View>
        <Stack gap={6}>
          <T w={800} size={14}>
            {adjustingIncome ? t('fixed.adjust.dateIncome') : t('fixed.adjust.dateExpense')}
          </T>
          <Tap onPress={() => setDateOpen((o) => !o)} style={common.dateBtn} accessibilityLabel={t('fixed.adjust.changeDate')}>
            <T w={600} size={14.5}>
              {adjusting ? longDate(adjusting.date) : ''}
            </T>
            <IconCalendar color={C.muted} />
          </Tap>
          {adjusting && adjusting.date !== adjusting.item.planned && (
            <T size={12.5} color={C.warn}>
              {t('fixed.adjust.moved', { date: shortDate(adjusting.item.planned) })}
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
        </Stack>
        <PrimaryButton
          label={t('fixed.adjust.save')}
          bg={adjustingIncome ? C.in : C.ink}
          disabled={!Number(adjusting?.input)}
          onPress={saveAdjust}
        />
        <Row style={layout.between}>
          {adjusting && (adjusting.item.adjusted || adjusting.item.moved) ? (
            <LinkText onPress={resetAdjust}>{t('fixed.adjust.reset')}</LinkText>
          ) : (
            <View />
          )}
          <LinkText
            onPress={() => {
              const item = adjusting?.item;
              setAdjusting(null);
              if (item) editFixed(item);
            }}>
            {t('fixed.adjust.edit')}
          </LinkText>
        </Row>
      </Sheet>
    </Screen>
  );
}

const adjustNote = (item: FixedItem) =>
  item.moved && item.adjusted
    ? t('fixed.note.both')
    : item.moved
      ? t('fixed.note.moved', { date: shortDate(item.planned) })
      : item.adjusted
        ? t('fixed.note.adjusted')
        : '';

const editFixed = (item: FixedItem) =>
  router.push({ pathname: '/fijo/[id]', params: { id: String(item.fixed.id) } });

/** Monto de la fila: con ≈ si es variable y aún no se confirma. */
const itemAmount = (item: FixedItem) => (!item.paid && item.fixed.variable ? APPROX : '') + fmt(item.amount);

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
  const date = shortDate(item.occ.date);
  return (
    <Row gap={12} style={[st.gastoRow, !first && common.divider]}>
      <Tap
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: p }}
        accessibilityLabel={t(p ? 'ui.unmarkPaid' : 'ui.markPaid', { name: item.name })}
        style={[st.check, p ? st.checkOn : st.checkOff]}>
        {p && <IconCheck size={18} color={C.white} />}
      </Tap>
      <Tap onPress={onOpen} style={st.gastoBody}>
        <Stack gap={2} style={layout.fillShrink}>
          <T w={700} size={15} numberOfLines={1}>
            {item.name}
          </T>
          <T w={600} size={12.5} color={p ? C.muted : C.warn}>
            {p ? t('fixed.expenses.paidOn', { date }) : t('fixed.expenses.dueOn', { date })}
          </T>
          <T w={700} size={11.5} color={C.muted} numberOfLines={1}>
            {adjustNote(item) || describeSchedule(item.fixed)}
          </T>
        </Stack>
        <T w={800} size={15} tabular>
          {itemAmount(item)}
        </T>
        <IconChevronRight size={16} color={C.faint} />
      </Tap>
    </Row>
  );
}

function IngresoCard({ item, onToggle, onOpen }: { item: FixedItem; onToggle: () => void; onOpen: () => void }) {
  const p = item.paid;
  const statusColor = p ? C.in : C.warn;
  const date = shortDate(item.occ.date);
  const note = adjustNote(item);
  return (
    <View style={st.incCard}>
      <Row gap={12} style={layout.betweenStart}>
        <Stack gap={3} style={layout.fill}>
          <T w={700} size={15}>
            {item.name}
          </T>
          <Row gap={6}>
            <View style={[st.statusDot, { backgroundColor: statusColor }]} />
            <T w={700} size={12.5} color={statusColor}>
              {p ? t('fixed.incomes.receivedOn', { date }) : t('fixed.incomes.expectedOn', { date })}
            </T>
          </Row>
        </Stack>
        <Tap
          onPress={onOpen}
          disabled={p}
          accessibilityLabel={t('fixed.incomes.changeAmount', { name: item.name })}
          style={st.incAmount}>
          <T w={800} size={16} color={C.in} tabular>
            {itemAmount(item)}
          </T>
          {!!note && (
            <T w={700} size={11} color={C.muted}>
              {note}
            </T>
          )}
        </Tap>
      </Row>
      <Tap onPress={() => editFixed(item)} style={st.periodBtn} accessibilityLabel={t('fixed.incomes.editLabel', { name: item.name })}>
        <IconRefresh color={C.inDark} stroke={1.9} />
        <Stack gap={1} style={layout.fill}>
          <T w={700} size={11.5} color={C.muted}>
            {t('fixed.incomes.frequency')}
          </T>
          <T w={800} size={13.5}>
            {describeSchedule(item.fixed)}
          </T>
        </Stack>
        <T w={800} size={13} color={C.in}>
          {t('common.edit')}
        </T>
      </Tap>
      <Tap onPress={onToggle} accessibilityState={{ checked: p }} style={[st.receive, p ? st.receiveOn : st.receiveOff]}>
        {p && <IconCheck size={18} color={C.white} />}
        <T w={800} size={14} color={p ? C.white : C.in}>
          {p ? t('common.received') : t('fixed.markReceived')}
        </T>
      </Tap>
    </View>
  );
}
