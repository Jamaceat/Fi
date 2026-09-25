import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { IconCalendar, IconWrench } from '@/components/icons';
import { Card, Chip, EmptyBox, MovementRow, Row, Screen, Segmented, T, Tap } from '@/components/ui';
import { C } from '@/constants/theme';
import { listMovements, type Movement } from '@/db/repo';
import { periodName, shortDate } from '@/lib/dates';
import { sum } from '@/lib/finance';
import { fmt, plural } from '@/lib/format';
import type { Kind } from '@/lib/schedule';
import { useApp, useLoad } from '@/state/app';

type Filter = 'todos' | 'fijo' | 'ocasional';

export default function Movimientos() {
  const { period, range } = useApp();
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
  const noun = g ? 'gastos' : 'ingresos';
  const summaryTitle =
    filter === 'todos' ? `Total de ${noun}` : filter === 'fijo' ? `Total ${noun} fijos` : `Total ${noun} ocasionales`;

  return (
    <Screen gap={16}>
      <View style={{ gap: 2 }}>
        <T w={600} size={13} color={C.muted}>
          {periodName(period)} {period.year}
        </T>
        <T serif w={600} size={32} style={{ letterSpacing: -0.5 }}>
          Movimientos
        </T>
      </View>

      <Segmented
        options={[
          { id: 'gasto', label: 'Gastos' },
          { id: 'ingreso', label: 'Ingresos' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <Row gap={8}>
        {(
          [
            ['todos', 'Todos'],
            ['fijo', 'Fijos'],
            ['ocasional', 'Ocasionales'],
          ] as const
        ).map(([id, label]) => (
          <Chip key={id} label={label} on={filter === id} onPress={() => setFilter(id)} />
        ))}
      </Row>

      <Card style={{ paddingVertical: 16, paddingHorizontal: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ gap: 2 }}>
          <T w={600} size={13} color={C.muted}>
            {summaryTitle}
          </T>
          <T serif w={600} size={26} color={accent} tabular>
            {fmt(sum(list))}
          </T>
        </View>
        <T w={700} size={12.5} color={C.muted}>
          {plural(list.length, 'movimiento', 'movimientos')}
        </T>
      </Card>

      {list.length === 0 ? (
        <EmptyBox title={`Sin ${noun} en este filtro`} hint="Toca + en la barra inferior para registrar uno." />
      ) : (
        <Card style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
          {list.map((m, i) => (
            <MovementRow
              key={m.id}
              first={i === 0}
              name={m.name}
              meta={`${m.category} · ${shortDate(m.date)}${m.extraordinary ? ' · extraordinario' : ''}`}
              amount={(g ? '− ' : '+ ') + fmt(m.amount)}
              income={!g}
              badge={m.fixed_id != null ? 'Fijo' : 'Ocasional'}
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
        <Pressable style={st.backdrop} onPress={onClose} accessibilityLabel="Cerrar opciones" />
        {movement && (
          <Animated.View entering={ZoomIn.duration(200)} style={st.box}>
            <T w={800} size={16} numberOfLines={1} style={{ textAlign: 'center' }}>
              {movement.name}
            </T>
            <Row gap={14}>
              <Option
                label="Calendario"
                hint="Pagos pasados y futuros"
                onPress={() =>
                  go((m) => router.push({ pathname: '/calendario', params: { fixed: String(m.fixed_id), date: m.date } }))
                }>
                <IconCalendar size={30} color={C.ink} />
              </Option>
              <Option label="Editar" hint="Este movimiento" onPress={() => go(editMovement)}>
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
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${hint}`} style={st.option}>
      <View style={st.optionIcon}>{children}</View>
      <T w={800} size={14}>
        {label}
      </T>
      <T w={600} size={11.5} color={C.muted} style={{ textAlign: 'center' }}>
        {hint}
      </T>
    </Tap>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
  box: { width: '100%', maxWidth: 340, backgroundColor: C.bg, borderRadius: 26, padding: 18, gap: 16 },
  option: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 18,
    paddingHorizontal: 8,
    borderRadius: 20,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
  },
  optionIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: C.chip, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
});
