import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { IconCalendar, IconWrench } from '@/components/icons';
import { Card, Chip, EmptyBox, MovementRow, Row, Screen, Segmented, Stack, T, Tap, Title } from '@/components/ui';
import { C } from '@/constants/theme';
import { listMovements, setMovementPaid, type Movement } from '@/db/repo';
import { t } from '@/i18n';
import { periodLabel, shortDate } from '@/lib/dates';
import { sum } from '@/lib/finance';
import { fmt, fmtFlow, joinMeta } from '@/lib/format';
import { movementBadge } from '@/lib/labels';
import type { Kind } from '@/lib/schedule';
import { useApp, useLoad } from '@/state/app';
import { common, layout } from '@/styles/common';
import { styles as st } from '@/styles/screens/movimientos.styles';

type Filter = 'todos' | 'fijo' | 'ocasional';

const FILTERS: Filter[] = ['todos', 'fijo', 'ocasional'];

export default function Movimientos() {
  const db = useSQLiteContext();
  const { period, range, bump } = useApp();
  const [tab, setTab] = useState<Kind>('gasto');
  const [filter, setFilter] = useState<Filter>('todos');
  // Movimiento fijo tocado: abre el selector calendario / editar.
  const [picked, setPicked] = useState<Movement | null>(null);
  const movs = useLoad((db) => listMovements(db, range.from, range.to), [range.from, range.to]) ?? [];

  const g = tab === 'gasto';
  const accent = g ? C.out : C.in;
  const list = movs.filter(
    (m) =>
      m.type === tab &&
      (filter === 'todos' || (filter === 'fijo' ? m.fixed_id != null : m.fixed_id == null)),
  );

  return (
    <Screen gap={16}>
      <Title kicker={periodLabel(period)} title={t('movements.title')} />

      <Segmented
        options={[
          { id: 'gasto', label: t('common.expenses') },
          { id: 'ingreso', label: t('common.incomes') },
        ]}
        value={tab}
        onChange={setTab}
      />

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
            {fmt(sum(list))}
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
          {list.map((m, i) => (
            <MovementRow
              key={m.id}
              first={i === 0}
              name={m.name}
              meta={joinMeta(m.category, shortDate(m.date), !!m.extraordinary && t('common.extraordinaryLower'))}
              amount={fmtFlow(m.amount, !g)}
              income={!g}
              badge={movementBadge(m)}
              check={
                m.fixed_id == null
                  ? { on: !!m.paid, onToggle: () => setMovementPaid(db, m.id, !m.paid).then(bump) }
                  : undefined
              }
              onPress={() => (m.fixed_id != null ? setPicked(m) : editMovement(m))}
            />
          ))}
        </Card>
      )}

      <FixedActions movement={picked} onClose={() => setPicked(null)} />
    </Screen>
  );
}

const editMovement = (m: Movement) => router.push({ pathname: '/nuevo', params: { id: String(m.id) } });

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
