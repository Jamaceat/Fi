import { useEffect, useState } from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { C } from '@/constants/theme';

import { styles as st } from './loading-backdrop.styles';

const FADE = { duration: 220, easing: Easing.out(Easing.quad) };
/** Tiempo que tarda el brillo en cruzar el fondo. */
const SWEEP = 1100;
/** Ancho del brillo respecto al fondo. */
const SHINE = 0.6;

/**
 * Fondo que aparece detrás de un texto mientras `active`, con un brillo que lo recorre de
 * izquierda a derecha, para indicar que lo que depende de él está cargando. Va como primer
 * hijo de un contenedor con `position: 'relative'` (el predeterminado); `style` ajusta
 * cuánto sobresale y el redondeo.
 */
export function LoadingBackdrop({ active, style }: { active: boolean; style?: StyleProp<ViewStyle> }) {
  const reduceMotion = useReducedMotion();
  const [{ width, height }, setSize] = useState({ width: 0, height: 0 });
  const shown = useSharedValue(0);
  const sweep = useSharedValue(0);

  useEffect(() => {
    shown.set(withTiming(active ? 1 : 0, FADE));
    if (active && !reduceMotion) {
      sweep.set(0);
      sweep.set(withRepeat(withTiming(1, { duration: SWEEP, easing: Easing.inOut(Easing.quad) }), -1));
    } else {
      cancelAnimation(sweep);
    }
  }, [active, reduceMotion, shown, sweep]);

  const band = width * SHINE;
  const pill = useAnimatedStyle(() => ({ opacity: shown.get() }));
  // Entra por completo desde fuera de la izquierda y sale por completo por la derecha.
  const shine = useAnimatedStyle(
    () => ({ transform: [{ translateX: -band + sweep.get() * (width + band) }] }),
    [band, width],
  );

  const measure = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setSize((s) => (s.width === w && s.height === h ? s : { width: w, height: h }));
  };

  return (
    <Animated.View pointerEvents="none" onLayout={measure} style={[st.pill, style, pill]}>
      {width > 0 && height > 0 && !reduceMotion && (
        <Animated.View style={[st.shine, { width: band, height }, shine]}>
          {/* Medidas explícitas: con porcentajes el degradado no siempre llena todo el alto. */}
          <Svg width={band} height={height}>
            <Defs>
              <LinearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={C.loadingShine} stopOpacity={0} />
                <Stop offset="0.5" stopColor={C.loadingShine} stopOpacity={0.75} />
                <Stop offset="1" stopColor={C.loadingShine} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={band} height={height} fill="url(#shine)" />
          </Svg>
        </Animated.View>
      )}
    </Animated.View>
  );
}
