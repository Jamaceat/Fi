import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { IconChevronLeft, IconChevronRight, IconGear, IconGrip, IconRefresh } from '@/components/icons';
import { Header, PrimaryButton, Row, Stack, T, Tap } from '@/components/ui';
import { C } from '@/constants/theme';
import { DEFAULT_SETTINGS, HOME_BLOCKS, type HomeBlock } from '@/db/repo';
import { t } from '@/i18n';
import { useApp } from '@/state/app';
import { common, layout } from '@/styles/common';
import { GAP, ITEM_H, styles as st } from '@/styles/screens/orden-inicio.styles';

const SLOT = ITEM_H + GAP;
// Llegan desacelerando, sin rebote.
const EASE = { duration: 220, easing: Easing.out(Easing.cubic) };

type Positions = Record<HomeBlock, number>;

const toPositions = (order: HomeBlock[]) => Object.fromEntries(order.map((id, i) => [id, i])) as Positions;

const toOrder = (pos: Positions) => [...HOME_BLOCKS].sort((a, b) => pos[a] - pos[b]);

/** Cómo se ve cada bloque en miniatura: colores del bloque real de Inicio. */
type Look = { bg: string; fg: string; sub: string; border?: string };
const DARK = { fg: C.bg, sub: C.heroSub };
const LIGHT = { bg: C.card, fg: C.ink, sub: C.muted, border: C.line };
const LOOKS: Record<HomeBlock, Look> = {
  hero: { bg: C.hero, ...DARK },
  savings: { bg: C.inDark, fg: C.inHeroText, sub: C.inSub },
  pending: LIGHT,
  calendar: LIGHT,
  breakdown: LIGHT,
  recent: LIGHT,
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
      style={st.screen}
      contentContainerStyle={[st.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}>
      <Header onBack={() => router.back()} kicker={t('settings.title')} title={t('homeOrder.title')} />

      <T size={13.5} color={C.muted} style={st.intro}>
        {t('homeOrder.intro')}
      </T>

      <View style={st.phone}>
        <Row style={st.phoneHeader}>
          <Stack gap={4}>
            <View style={[st.bar, st.barKicker]} />
            <View style={[st.bar, st.barTitle]} />
          </Stack>
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

      <Stack gap={10}>
        <PrimaryButton label={t('homeOrder.save')} onPress={save} disabled={!dirty} />
        <Tap
          onPress={isDefault ? undefined : () => apply([...DEFAULT_SETTINGS.homeOrder])}
          accessibilityState={{ disabled: isDefault }}
          style={[common.outlineBtn, isDefault && common.disabled]}>
          <IconRefresh size={17} />
          <T w={800} size={14.5}>
            {t('homeOrder.reset')}
          </T>
        </Tap>
      </Stack>
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
  const look = LOOKS[id];
  const title = t(`homeOrder.blocks.${id}.title`);
  const count = HOME_BLOCKS.length;
  const top = useSharedValue(index * SLOT);
  const startTop = useSharedValue(0);
  const active = useSharedValue(false);

  // Cuando otro bloque ocupa este lugar (o se restablece el orden), este se desliza al suyo.
  useAnimatedReaction(
    () => positions.get()[id],
    (pos, prev) => {
      if (pos !== prev && !active.get()) top.set(withTiming(pos * SLOT, EASE));
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
      top.set(withTiming(positions.get()[id] * SLOT, EASE));
      scheduleOnRN(onDrop, positions.get());
    });

  const style = useAnimatedStyle(() => ({
    top: top.get(),
    zIndex: active.get() ? 10 : 0,
    transform: [{ scale: withTiming(active.get() ? 1.04 : 1, EASE) }],
    shadowOpacity: withTiming(active.get() ? 0.18 : 0, EASE),
    elevation: active.get() ? 8 : 0,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        accessible
        accessibilityLabel={t('homeOrder.a11y.position', { title, position: index + 1, count })}
        accessibilityHint={t('homeOrder.a11y.hint')}
        accessibilityActions={[
          { name: 'up', label: t('homeOrder.a11y.up') },
          { name: 'down', label: t('homeOrder.a11y.down') },
        ]}
        onAccessibilityAction={(e) => onMove(e.nativeEvent.actionName === 'up' ? -1 : 1)}
        style={[st.item, { backgroundColor: look.bg, borderColor: look.border ?? look.bg }, style]}>
        <View style={[st.badge, look.border ? st.badgeLight : st.badgeDark]}>
          <T w={800} size={12} color={look.fg}>
            {index + 1}
          </T>
        </View>
        <Stack gap={2} style={layout.fillShrink}>
          <T w={800} size={14} color={look.fg} numberOfLines={1}>
            {title}
          </T>
          <T w={600} size={12} color={look.sub} numberOfLines={1}>
            {t(`homeOrder.blocks.${id}.desc`)}
          </T>
        </Stack>
        <IconGrip size={20} color={look.sub} />
      </Animated.View>
    </GestureDetector>
  );
}
