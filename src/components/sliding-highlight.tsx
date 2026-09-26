import { useEffect, useRef, useState } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { styles as st } from './sliding-highlight.styles';

type Box = { x: number; y: number; width: number; height: number };

const TIMING = { duration: 260, easing: Easing.out(Easing.cubic) };

/** Estilo de las opciones con fondo propio mientras `ready`: sin fondo ni color de borde. */
export const clearOption = st.clear;

/**
 * Fondo que se desliza hasta la opción elegida de una barra (pestañas, unidades, chips…).
 *
 * Cada opción se mide con `onLayout={measure(key)}` y `layer()` va como primer hijo del
 * contenedor. Con `base`, `layer` también pinta el fondo de cada opción debajo del que se
 * desliza, para que las opciones con fondo propio no lo tapen. Mientras `ready` sea true
 * las opciones se pintan transparentes; antes de medir, cada una se pinta como siempre.
 */
export function useSlidingHighlight<K extends string | number>({
  keys,
  selected,
  color,
  border = color,
}: {
  keys: readonly K[];
  selected: K | null | undefined;
  color: string;
  border?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  const box = selected == null ? undefined : boxes[String(selected)];
  const ready = keys.every((k) => boxes[String(k)]) && (selected == null || !!box);

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const w = useSharedValue(0);
  const h = useSharedValue(0);
  const bg = useSharedValue(color);
  const bc = useSharedValue(border);
  // La primera vez (o tras quedar sin opción elegida) se ubica sin animar.
  const placed = useRef(false);

  const { x: bx, y: by, width: bw, height: bh } = box ?? {};
  useEffect(() => {
    if (bx === undefined || by === undefined || bw === undefined || bh === undefined) {
      placed.current = false;
      return;
    }
    const anim = placed.current && !reduceMotion;
    placed.current = true;
    x.set(anim ? withTiming(bx, TIMING) : bx);
    y.set(anim ? withTiming(by, TIMING) : by);
    w.set(anim ? withTiming(bw, TIMING) : bw);
    h.set(anim ? withTiming(bh, TIMING) : bh);
    bg.set(anim ? withTiming(color, TIMING) : color);
    bc.set(anim ? withTiming(border, TIMING) : border);
  }, [bx, by, bw, bh, color, border, reduceMotion, x, y, w, h, bg, bc]);

  const indicator = useAnimatedStyle(() => ({
    width: w.get(),
    height: h.get(),
    transform: [{ translateX: x.get() }, { translateY: y.get() }],
    backgroundColor: bg.get(),
    borderColor: bc.get(),
  }));

  const measure = (key: K) => (e: LayoutChangeEvent) => {
    const l = e.nativeEvent.layout;
    setBoxes((b) => {
      const o = b[String(key)];
      if (o && o.x === l.x && o.y === l.y && o.width === l.width && o.height === l.height) return b;
      return { ...b, [String(key)]: { x: l.x, y: l.y, width: l.width, height: l.height } };
    });
  };

  const layer = ({ base, style }: { base?: StyleProp<ViewStyle>; style?: StyleProp<ViewStyle> } = {}) =>
    ready && (
      <>
        {base &&
          keys.map((k) => {
            const b = boxes[String(k)];
            return (
              <View
                key={String(k)}
                pointerEvents="none"
                style={[st.abs, base, { left: b.x, top: b.y, width: b.width, height: b.height }]}
              />
            );
          })}
        {box && <Animated.View pointerEvents="none" style={[st.abs, style, indicator]} />}
      </>
    );

  return { measure, ready, layer };
}
