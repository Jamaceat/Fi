import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { DatePicker } from '@/components/calendar';
import { IconCalendar, IconWrench } from '@/components/icons';
import {
  AmountField,
  Card,
  Chip,
  EmptyBox,
  LinkText,
  MovementRow,
  PrimaryButton,
  Row,
  Screen,
  Segmented,
  Sheet,
  Stack,
  T,
  Tap,
  Title,
} from '@/components/ui';
import { C } from '@/constants/theme';
import {
  clearOverride,
  listMovements,
  loadFixedData,
  markPaid,
  saveOverride,
  setMovementPaid,
  unmark,
  type Movement,
} from '@/db/repo';
import { t } from '@/i18n';
import { longDate, periodLabel, shortDate } from '@/lib/dates';
import { fixedItems, sum, type FixedItem } from '@/lib/finance';
import { APPROX, cleanAmount, dots, fmt, fmtFlow, joinMeta, signed } from '@/lib/format';
import { movementBadge } from '@/lib/labels';
import type { Kind } from '@/lib/schedule';
import { useApp, useLoad } from '@/state/app';
import { common, layout } from '@/styles/common';
import { styles as st } from '@/styles/screens/movimientos.styles';

type Filter = 'todos' | 'fijo' | 'ocasional';
/** Pestaña de tipo: gastos, ingresos o ambos. */
type Tab = Kind | 'todos';

const FILTERS: Filter[] = ['todos', 'fijo', 'ocasional'];

/** Un movimiento registrado o la ocurrencia de un fijo que aún no se marca. */
type Entry = { mov: Movement; item?: never } | { item: FixedItem; mov?: never };

const entryDate = (e: Entry) => (e.mov ? e.mov.date : e.item.occ.date);
const isFixedEntry = (e: Entry) => !!e.item || e.mov?.fixed_id != null;
const entryType = (e: Entry): Kind => (e.mov ? e.mov.type : e.item.fixed.type);

export default function Movimientos() {
  const db = useSQLiteContext();
  const { period, range, settings, bump, holidays } = useApp();
  const params = useLocalSearchParams<{ tab?: string; filter?: string }>();
  const [tab, setTab] = useState<Tab>('gasto');
  const [filter, setFilter] = useState<Filter>('todos');
  const [lastParams, setLastParams] = useState('');
  // Movimiento fijo tocado: abre el selector calendario / editar.
  const [picked, setPicked] = useState<Movement | null>(null);
  const [confirming, setConfirming] = useState<{ item: FixedItem; input: string } | null>(null);
  const [adjusting, setAdjusting] = useState<{ item: FixedItem; input: string; date: string } | null>(null);
  const [dateOpen, setDateOpen] = useState(false);

  // Inicio abre esta pestaña con ?tab=…&filter=…; se aplica una vez y se limpian los parámetros.
  const paramsKey = `${params.tab ?? ''}|${params.filter ?? ''}`;
  if (paramsKey !== lastParams) {
    setLastParams(paramsKey);
    if (params.tab === 'gasto' || params.tab === 'ingreso' || params.tab === 'todos') setTab(params.tab);
    if (FILTERS.includes(params.filter as Filter)) setFilter(params.filter as Filter);
  }
  useEffect(() => {
    if (params.tab || params.filter) router.setParams({ tab: undefined, filter: undefined });
  }, [params.tab, params.filter]);

  const data = useLoad(
    async (d) => {
      const [movs, fixedData] = await Promise.all([listMovements(d, range.from, range.to), loadFixedData(d)]);
      // Los fijos pagados ya están en `movs`; los pendientes se muestran para marcarlos aquí.
      const pending = fixedItems(fixedData, range.from, range.to, settings.holiday, holidays).filter((i) => !i.paid);
      return { movs, pending };
    },
    [range.from, range.to, settings.holiday],
  );
  const movs = data?.movs ?? [];
  const pending = data?.pending ?? [];

  const entries: Entry[] = [...movs.map((mov) => ({ mov })), ...pending.map((item) => ({ item }))];
  const list = entries
    .filter((e) => tab === 'todos' || entryType(e) === tab)
    .filter((e) => filter === 'todos' || (filter === 'fijo') === isFixedEntry(e))
    .sort((a, b) => (entryDate(a) < entryDate(b) ? 1 : entryDate(a) > entryDate(b) ? -1 : 0));
  // En "Todos" el total es el balance: ingresos menos gastos.
  const total = sum(
    list.map((e) => {
      const { amount } = e.mov ?? e.item;
      return { amount: tab === 'todos' && entryType(e) === 'gasto' ? -amount : amount };
    }),
  );
  const accent = tab === 'gasto' ? C.out : tab === 'ingreso' ? C.in : total < 0 ? C.out : total > 0 ? C.in : C.ink;

  const toggleFixed = async (item: FixedItem) => {
    if (item.fixed.variable) {
      setConfirming({ item, input: String(item.amount) });
      return;
    }
    await markPaid(db, item.fixed, item.occ.due, { amount: item.amount, date: item.occ.date });
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

  // Desmarcar un fijo borra su movimiento y la ocurrencia vuelve a quedar pendiente.
  const toggleMovement = async (m: Movement) => {
    if (m.fixed_id != null && m.fixed_due) await unmark(db, m.fixed_id, m.fixed_due);
    else await setMovementPaid(db, m.id, !m.paid);
    bump();
  };

  const openAdjust = (item: FixedItem) => {
    setDateOpen(false);
    setAdjusting({ item, input: String(item.amount), date: item.occ.date });
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

  const confirmingIncome = confirming?.item.fixed.type === 'ingreso';
  const adjustingIncome = adjusting?.item.fixed.type === 'ingreso';

  return (
    <Screen gap={16}>
      <Title kicker={periodLabel(period)} title={t('movements.title')} />

      <Stack gap={8}>
        <Segmented options={[{ id: 'todos', label: t('movements.all') }]} value={tab} onChange={setTab} />
        <Segmented
          options={[
            { id: 'gasto', label: t('common.expenses') },
            { id: 'ingreso', label: t('common.incomes') },
          ]}
          value={tab}
          onChange={setTab}
        />
      </Stack>

      <Row gap={8}>
        {FILTERS.map((id) => (
          <Chip key={id} label={t(`movements.filters.${id}`)} on={filter === id} onPress={() => setFilter(id)} />
        ))}
      </Row>

      <Card style={st.summary}>
        <Stack gap={2}>
          <T w={600} size={13} color={C.muted}>
            {t(`movements.total.${filter}.${tab}`)}
          </T>
          <T serif w={600} size={26} color={accent} tabular numberOfLines={1} adjustsFontSizeToFit>
            {tab === 'todos' ? signed(total) : fmt(total)}
          </T>
        </Stack>
        <T w={700} size={12.5} color={C.muted}>
          {t('common.movementCount', { count: list.length })}
        </T>
      </Card>

      {list.length === 0 ? (
        <EmptyBox title={t(`movements.empty.${tab}`)} hint={t('movements.emptyHint')} />
      ) : (
        <Card style={common.listCard}>
          {list.map((e, i) => {
            const income = entryType(e) === 'ingreso';
            return e.mov ? (
              <MovementRow
                key={e.mov.id}
                first={i === 0}
                name={e.mov.name}
                meta={joinMeta(e.mov.category, shortDate(e.mov.date), !!e.mov.extraordinary && t('common.extraordinaryLower'))}
                amount={fmtFlow(e.mov.amount, income)}
                income={income}
                badge={movementBadge(e.mov)}
                check={{ on: !!e.mov.paid, onToggle: () => toggleMovement(e.mov) }}
                onPress={() => (e.mov.fixed_id != null ? setPicked(e.mov) : editMovement(e.mov))}
              />
            ) : (
              <MovementRow
                key={`${e.item.fixed.id}-${e.item.occ.due}`}
                first={i === 0}
                name={e.item.name}
                meta={joinMeta(e.item.fixed.category, shortDate(e.item.occ.date), adjustNote(e.item))}
                amount={(e.item.fixed.variable ? APPROX : '') + fmtFlow(e.item.amount, income)}
                income={income}
                badge={t('common.fixed')}
                check={{ on: false, onToggle: () => toggleFixed(e.item) }}
                onPress={() => openAdjust(e.item)}
              />
            );
          })}
        </Card>
      )}

      <FixedActions movement={picked} onClose={() => setPicked(null)} />

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
              if (item) router.push({ pathname: '/fijo/[id]', params: { id: String(item.fixed.id) } });
            }}>
            {t('fixed.adjust.edit')}
          </LinkText>
        </Row>
      </Sheet>
    </Screen>
  );
}

const editMovement = (m: Movement) => router.push({ pathname: '/nuevo', params: { id: String(m.id) } });

const adjustNote = (item: FixedItem) =>
  item.moved && item.adjusted
    ? t('fixed.note.both')
    : item.moved
      ? t('fixed.note.moved', { date: shortDate(item.planned) })
      : item.adjusted
        ? t('fixed.note.adjusted')
        : '';

/** Dos opciones centradas para un movimiento fijo: ver sus pagos en el calendario o editarlo. */
function FixedActions({ movement, onClose }: { movement: Movement | null; onClose: () => void }) {
  const go = (fn: (m: Movement) => void) => {
    if (!movement) return;
    onClose();
    fn(movement);
  };
  return (
    <Modal visible={!!movement} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={st.center}>
        <Pressable style={st.backdrop} onPress={onClose} accessibilityLabel={t('movements.actions.close')} />
        {movement && (
          <Animated.View entering={ZoomIn.duration(200)} style={st.box}>
            <T w={800} size={16} numberOfLines={1} style={layout.textCenter}>
              {movement.name}
            </T>
            <Row gap={14}>
              <Option
                label={t('movements.actions.calendar')}
                hint={t('movements.actions.calendarHint')}
                onPress={() =>
                  go((m) => router.push({ pathname: '/calendario', params: { fixed: String(m.fixed_id), date: m.date } }))
                }>
                <IconCalendar size={30} color={C.ink} />
              </Option>
              <Option label={t('common.edit')} hint={t('movements.actions.editHint')} onPress={() => go(editMovement)}>
                <IconWrench size={30} color={C.ink} />
              </Option>
            </Row>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

function Option({ label, hint, onPress, children }: { label: string; hint: string; onPress: () => void; children: ReactNode }) {
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={t('movements.actions.optionLabel', { label, hint })} style={st.option}>
      <View style={st.optionIcon}>{children}</View>
      <T w={800} size={14}>
        {label}
      </T>
      <T w={600} size={11.5} color={C.muted} style={layout.textCenter}>
        {hint}
      </T>
    </Tap>
  );
}
