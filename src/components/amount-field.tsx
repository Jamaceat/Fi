import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
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

import { C } from '@/constants/theme';
import { t } from '@/i18n';
import { amountParts, compactAmount, dots } from '@/lib/format';

import { styles as st } from './amount-field.styles';

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
    <View style={st.root}>
      <Animated.View style={[st.head, pop]}>
        <Text style={[st.currency, { fontSize: fs * 0.65, lineHeight: fs * 1.2, color }]}>$</Text>
        {head.split('').map((ch, i) => (
          <Char key={i} ch={ch} size={fs} color={digits ? color : color + '55'} />
        ))}
        {focused && <Caret color={color} height={fs * 0.8} />}
      </Animated.View>

      {big && (
        <Animated.View entering={FadeIn.duration(320).easing(EASE)} exiting={FadeOut.duration(200)} style={st.breakdown}>
          <Text style={st.exact}>$ {dots(n)}</Text>
          <View style={st.parts}>
            {amountParts(n).map((p, i) => (
              <Animated.View
                key={p.unit}
                entering={FadeInDown.delay(80 + i * 90).duration(420).easing(EASE)}
                exiting={FadeOutUp.duration(220)}
                layout={slide()}
                style={st.part}>
                <View style={[st.dot, { backgroundColor: color, opacity: 1 - i * 0.22 }]} />
                <Text style={[st.partValue, { fontSize: 22 - i * 2, color }]}>{p.value}</Text>
                <Text style={[st.partLabel, { fontSize: 14 - i }]}>{p.label}</Text>
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
        accessibilityLabel={t('ui.amountLabel', { amount: dots(n) })}
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
    <Animated.View entering={FadeIn.duration(260).easing(EASE)} exiting={FadeOut.duration(140)} layout={slide()}>
      <Animated.Text
        style={[
          st.char,
          { fontSize: size, lineHeight: size * 1.2, color, paddingHorizontal: ch === ' ' ? size * 0.08 : 0 },
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
    o.value = withRepeat(
      withSequence(
        withTiming(0.15, { duration: 550, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 550, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [o]);
  const blink = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View layout={slide()} style={[st.caret, { height, backgroundColor: color }, blink]} />;
}
