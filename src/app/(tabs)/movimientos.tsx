import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Card, Chip, EmptyBox, MovementRow, Row, Screen, Segmented, T } from '@/components/ui';
import { C } from '@/constants/theme';
import { listMovements } from '@/db/repo';
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
              onPress={() => router.push({ pathname: '/nuevo', params: { id: String(m.id) } })}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
