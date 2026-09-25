import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutUp,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { C, F } from '@/constants/theme';
import { amountParts, compactAmount, dots } from '@/lib/format';

/** Desde este monto el titular se compacta ("1,25 M") y aparece el desglose por unidades. */
const BIG = 1e6;
// Movimiento suave: desaceleración sin rebote, desplazamientos cortos.
const EASE = Easing.out(Easing.cubic);
const SOFT = { duration: 280, easing: EASE };
const slide = () => LinearTransition.duration(280).easing(EASE);

/**
 * Campo de monto. El TextInput real es invisible y solo captura el teclado; lo que se ve
 * se dibuja con Text animado (evita el recorte/scroll horizontal del TextInput en Android).
 */
export function AmountField({
  value,
  onChangeText,
  color = C.ink,
  size = 52,
  autoFocus,
}: {
  value: string;
  onChangeText: (t: string) => void;
  color?: string;
  size?: number;
  autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const digits = value.replace(/\D/g, '');
  const n = Number(digits) || 0;
  const big = n >= BIG;
  const head = digits ? compactAmount(n) : '0';
  // Encoge el titular cuando es largo para que nunca desborde.
  const fs = Math.round(size * Math.min(1, 7 / Math.max(head.length, 1)) ** 0.8);

  const scale = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    scale.value = withSequence(withTiming(1.02, { duration: 90, easing: EASE }), withTiming(1, { duration: 260, easing: EASE }));
  }, [digits, scale]);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View style={{ alignItems: 'center', gap: 12, alignSelf: 'stretch' }}>
      <Animated.View style={[st.head, pop]}>
        <Text style={{ fontFamily: F.serif500, fontSize: fs * 0.65, lineHeight: fs * 1.2, color, marginRight: 4 }}>
          $
        </Text>
        {head.split('').map((ch, i) => (
          <Char key={i} ch={ch} size={fs} color={digits ? color : color + '55'} />
        ))}
        {focused && <Caret color={color} height={fs * 0.8} />}
      </Animated.View>

      {big && (
        <Animated.View entering={FadeIn.duration(320).easing(EASE)} exiting={FadeOut.duration(200)} style={{ alignItems: 'center', gap: 10 }}>
          <Text style={{ fontFamily: F[600], fontSize: 13, color: C.muted, fontVariant: ['tabular-nums'] }}>
            $ {dots(n)}
          </Text>
          <View style={{ gap: 6 }}>
            {amountParts(n).map((p, i) => (
              <Animated.View
                key={p.unit}
                entering={FadeInDown.delay(80 + i * 90).duration(420).easing(EASE)}
                exiting={FadeOutUp.duration(220)}
                layout={slide()}
                style={st.part}>
                <View style={[st.dot, { backgroundColor: color, opacity: 1 - i * 0.22 }]} />
                <Text style={{ fontFamily: F.serif600, fontSize: 22 - i * 2, color, minWidth: 48, textAlign: 'right' }}>
                  {p.value}
                </Text>
                <Text style={{ fontFamily: F[600], fontSize: 14 - i, color: C.muted }}>{p.label}</Text>
              </Animated.View>
            ))}
          </View>
        </Animated.View>
      )}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="number-pad"
        autoFocus={autoFocus}
        caretHidden
        contextMenuHidden
        selection={{ start: value.length, end: value.length }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={`Monto, ${dots(n)} pesos`}
        style={st.hidden}
      />
    </View>
  );
}

/** Un carácter del titular: entra desde abajo y "rueda" cuando cambia su valor. */
function Char({ ch, size, color }: { ch: string; size: number; color: string }) {
  const y = useSharedValue(0);
  const o = useSharedValue(1);
  const prev = useRef(ch);

  useEffect(() => {
    if (prev.current === ch) return;
    prev.current = ch;
    y.value = size * 0.12;
    o.value = 0.35;
    y.value = withTiming(0, SOFT);
    o.value = withTiming(1, SOFT);
  }, [ch, size, y, o]);

  const roll = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: y.value }] }));

  return (
    <Animated.View
      entering={FadeIn.duration(260).easing(EASE)}
      exiting={FadeOut.duration(140)}
      layout={slide()}>
      <Animated.Text
        style={[
          { fontFamily: F.serif500, fontSize: size, lineHeight: size * 1.2, color, paddingHorizontal: ch === ' ' ? size * 0.08 : 0 },
          roll,
        ]}>
        {ch}
      </Animated.Text>
    </Animated.View>
  );
}

function Caret({ color, height }: { color: string; height: number }) {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withRepeat(withSequence(
        withTiming(0.15, { duration: 550, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 550, easing: Easing.inOut(Easing.quad) }),
      ), -1);
  }, [o]);
  const blink = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      layout={slide()}
      style={[{ width: 2, height, borderRadius: 1, backgroundColor: color, marginLeft: 4 }, blink]}
    />
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 72 },
  hidden: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.02, color: 'transparent' },
  part: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, alignSelf: 'center' },
});
