import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { IconChevronLeft, IconChevronRight, IconGear, IconGrip, IconRefresh } from '@/components/icons';
import { Header, PrimaryButton, Row, T, Tap } from '@/components/ui';
import { C } from '@/constants/theme';
import { DEFAULT_SETTINGS, HOME_BLOCKS, type HomeBlock } from '@/db/repo';
import { useApp } from '@/state/app';

/** Alto de cada bloque en la maqueta y espacio entre ellos. */
const ITEM_H = 66;
const GAP = 8;
const SLOT = ITEM_H + GAP;
const SPRING = { damping: 20, stiffness: 220 };

type Positions = Record<HomeBlock, number>;

const toPositions = (order: HomeBlock[]) => Object.fromEntries(order.map((id, i) => [id, i])) as Positions;

const toOrder = (pos: Positions) => [...HOME_BLOCKS].sort((a, b) => pos[a] - pos[b]);

/** Cómo se ve cada bloque en miniatura: colores del bloque real de Inicio. */
const DARK = { fg: C.bg, sub: C.heroSub };
const LIGHT = { bg: C.card, fg: C.ink, sub: C.muted, border: C.line };
const META: Record<HomeBlock, { title: string; desc: string; bg: string; fg: string; sub: string; border?: string }> = {
  hero: { title: 'Balance del mes', desc: 'Disponible, ingresos y gastos', bg: C.hero, ...DARK },
  savings: { title: 'Ahorro total', desc: 'Saldo y lo ahorrado este mes', bg: C.inDark, fg: '#F4F8FB', sub: C.inSub },
  pending: { title: 'Ingreso fijo pendiente', desc: 'Solo aparece si falta uno por recibir', ...LIGHT },
  calendar: { title: 'Calendario', desc: 'Pagos y festivos del mes', ...LIGHT },
  breakdown: { title: 'Gastos e ingresos', desc: 'Fijos frente a ocasionales', ...LIGHT },
  recent: { title: 'Últimos movimientos', desc: 'Los 4 más recientes', ...LIGHT },
};

export default function OrdenInicio() {
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useApp();
  const [order, setOrder] = useState<HomeBlock[]>(settings.homeOrder);
  const [dragging, setDragging] = useState(false);
  const positions = useSharedValue<Positions>(toPositions(settings.homeOrder));

  const apply = (next: HomeBlock[]) => {
    setOrder(next);
    positions.set(toPositions(next));
  };

  const move = (id: HomeBlock, delta: number) => {
    const from = order.indexOf(id);
    const to = from + delta;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    next.splice(from, 1);
    next.splice(to, 0, id);
    apply(next);
  };

  const onDrop = (pos: Positions) => {
    setOrder(toOrder(pos));
    setDragging(false);
  };

  const dirty = order.join() !== settings.homeOrder.join();
  const isDefault = order.join() === DEFAULT_SETTINGS.homeOrder.join();

  const save = () => {
    updateSettings({ homeOrder: order });
    router.back();
  };

  return (
    <ScrollView
      scrollEnabled={!dragging}
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 32, gap: 18 }}>
      <Header onBack={() => router.back()} kicker="Ajustes" title="Orden de Inicio" />

      <T size={13.5} color={C.muted} style={{ lineHeight: 20 }}>
        Mantén presionado un bloque y arrástralo para cambiar su lugar. El encabezado y la alerta de gasto siempre van
        arriba.
      </T>

      <View style={st.phone}>
        <Row style={{ justifyContent: 'space-between', paddingHorizontal: 4 }}>
          <View style={{ gap: 4 }}>
            <View style={[st.bar, { width: 70, backgroundColor: C.line }]} />
            <View style={[st.bar, { width: 110, height: 12, backgroundColor: C.ring }]} />
          </View>
          <Row gap={5}>
            {[IconChevronLeft, IconChevronRight, IconGear].map((Icon, i) => (
              <View key={i} style={st.miniRound}>
                <Icon size={11} color={C.faint} />
              </View>
            ))}
          </Row>
        </Row>

        <View style={{ height: HOME_BLOCKS.length * SLOT - GAP }}>
          {HOME_BLOCKS.map((id) => (
            <Item
              key={id}
              id={id}
              index={order.indexOf(id)}
              positions={positions}
              onStart={() => setDragging(true)}
              onDrop={onDrop}
              onMove={(d) => move(id, d)}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <PrimaryButton label="Guardar orden" onPress={save} disabled={!dirty} />
        <Tap
          onPress={isDefault ? undefined : () => apply([...DEFAULT_SETTINGS.homeOrder])}
          accessibilityState={{ disabled: isDefault }}
          style={[st.reset, { opacity: isDefault ? 0.45 : 1 }]}>
          <IconRefresh size={17} />
          <T w={800} size={14.5}>
            Restablecer orden original
          </T>
        </Tap>
      </View>
    </ScrollView>
  );
}

function Item({
  id,
  index,
  positions,
  onStart,
  onDrop,
  onMove,
}: {
  id: HomeBlock;
  index: number;
  positions: SharedValue<Positions>;
  onStart: () => void;
  onDrop: (pos: Positions) => void;
  onMove: (delta: number) => void;
}) {
  const m = META[id];
  const count = HOME_BLOCKS.length;
  const top = useSharedValue(index * SLOT);
  const startTop = useSharedValue(0);
  const active = useSharedValue(false);

  // Cuando otro bloque ocupa este lugar (o se restablece el orden), este se desliza al suyo.
  useAnimatedReaction(
    () => positions.get()[id],
    (pos, prev) => {
      if (pos !== prev && !active.get()) top.set(withSpring(pos * SLOT, SPRING));
    },
  );

  const pan = Gesture.Pan()
    .activateAfterLongPress(180)
    .onStart(() => {
      active.set(true);
      startTop.set(top.get());
      scheduleOnRN(onStart);
    })
    .onUpdate((e) => {
      const y = Math.min(Math.max(startTop.get() + e.translationY, 0), (count - 1) * SLOT);
      top.set(y);
      const to = Math.round(y / SLOT);
      const from = positions.get()[id];
      if (to === from) return;
      // Mueve el bloque y corre un lugar a los que quedan entre la posición vieja y la nueva.
      const next = { ...positions.get() };
      for (const k of Object.keys(next) as HomeBlock[]) {
        const p = next[k];
        if (from < to && p > from && p <= to) next[k] = p - 1;
        else if (to < from && p >= to && p < from) next[k] = p + 1;
      }
      next[id] = to;
      positions.set(next);
    })
    .onFinalize(() => {
      if (!active.get()) return;
      active.set(false);
      top.set(withSpring(positions.get()[id] * SLOT, SPRING));
      scheduleOnRN(onDrop, positions.get());
    });

  const style = useAnimatedStyle(() => ({
    top: top.get(),
    zIndex: active.get() ? 10 : 0,
    transform: [{ scale: withSpring(active.get() ? 1.04 : 1) }],
    shadowOpacity: withSpring(active.get() ? 0.18 : 0),
    elevation: active.get() ? 8 : 0,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        accessible
        accessibilityLabel={`${m.title}, posición ${index + 1} de ${count}`}
        accessibilityHint="Usa las acciones Subir o Bajar para moverlo"
        accessibilityActions={[
          { name: 'up', label: 'Subir' },
          { name: 'down', label: 'Bajar' },
        ]}
        onAccessibilityAction={(e) => onMove(e.nativeEvent.actionName === 'up' ? -1 : 1)}
        style={[st.item, { backgroundColor: m.bg, borderColor: m.border ?? m.bg }, style]}>
        <View style={[st.badge, { backgroundColor: m.border ? C.chip : 'rgba(255,255,255,0.14)' }]}>
          <T w={800} size={12} color={m.fg}>
            {index + 1}
          </T>
        </View>
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <T w={800} size={14} color={m.fg} numberOfLines={1}>
            {m.title}
          </T>
          <T w={600} size={12} color={m.sub} numberOfLines={1}>
            {m.desc}
          </T>
        </View>
        <IconGrip size={20} color={m.sub} />
      </Animated.View>
    </GestureDetector>
  );
}

const st = StyleSheet.create({
  phone: { backgroundColor: C.bg, borderWidth: 1.5, borderColor: C.ring, borderRadius: 28, padding: 12, paddingTop: 16, gap: 14 },
  bar: { height: 8, borderRadius: 4 },
  miniRound: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  item: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ITEM_H,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
  },
  badge: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  reset: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
