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
  withDelay,
  withTiming,
  type EntryAnimationsValues,
  type EntryExitAnimationFunction,
  type LayoutAnimationFunction,
  type LayoutAnimationsValues,
  type SharedValue,
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
/**
 * Cada cambio va por pasos:
 * - borrar: primero sale lo que sobra (EXIT_MS) y después el número se acomoda;
 * - escribir: primero cae la tecla (STRIKE_MS) al lado del número actual y después todo se recentra (MOVE_MS).
 */
const EXIT_MS = 220;
const MOVE_MS = 240;
const STRIKE_MS = 110;
/** Rodillo tipo tragamonedas del primer dígito (desde 0): baja una sola vez hasta el valor. */
const SPIN_MS = 520;
const slide = (delay = 0) => LinearTransition.duration(MOVE_MS).easing(EASE).delay(delay);

/**
 * Tecla de máquina de escribir: el tipo cae desde arriba, algo grande, y golpea el papel (acelera, sin rebote).
 * Con `shift`, golpea medio ancho a la derecha (pegado al número que aún no se ha movido) y luego se recentra
 * junto con los demás.
 */
const strike =
  (size: number, shift: boolean): EntryExitAnimationFunction =>
  (values: EntryAnimationsValues) => {
    'worklet';
    const hit = { duration: STRIKE_MS, easing: Easing.in(Easing.quad) };
    const dx = shift ? values.targetWidth / 2 : 0;
    return {
      initialValues: {
        opacity: 0,
        transform: [{ translateX: dx }, { translateY: -size * 0.35 }, { scale: 1.3 }],
      },
      animations: {
        opacity: withTiming(1, { duration: 70 }),
        transform: [
          { translateX: withDelay(STRIKE_MS, withTiming(0, { duration: MOVE_MS, easing: EASE })) },
          { translateY: withTiming(0, hit) },
          { scale: withTiming(1, hit) },
        ],
      },
    };
  };

/**
 * Cursor. Al escribir se mueve antes que todo: salta a la derecha del hueco donde caerá la tecla y después se
 * recentra junto con el número. Al borrar espera a que el dígito suba y luego se desliza con el resto.
 * El salto es el doble del desplazamiento final (el número se recentra solo medio ancho del carácter).
 * Se mide desde el destino anterior (`last`) y no desde la posición actual: al escribir rápido la animación
 * previa sigue a medias y la posición actual haría que el salto se acumule y el cursor se descoloque.
 * Solo salta si el titular crece: en millones escribir puede acortarlo ("12,5 M" → "125 M") y ahí se desliza
 * con el resto.
 */
const caretMove =
  (moveDelay: number, dir: number, last: SharedValue<number | null>): LayoutAnimationFunction =>
  (values: LayoutAnimationsValues) => {
    'worklet';
    const move = { duration: MOVE_MS, easing: EASE };
    const prev = last.value ?? values.currentOriginX;
    last.value = values.targetOriginX;
    const lead = dir > 0 && values.targetOriginX > prev ? Math.min(moveDelay, STRIKE_MS) : 0;
    const ahead = 2 * values.targetOriginX - prev;
    return {
      initialValues: {
        originX: values.currentOriginX,
        originY: values.currentOriginY,
        width: values.currentWidth,
        height: values.currentHeight,
      },
      animations: {
        originX: lead
          ? withSequence(
              withTiming(ahead, { duration: lead, easing: EASE }),
              withDelay(moveDelay - lead, withTiming(values.targetOriginX, move)),
            )
          : withDelay(moveDelay, withTiming(values.targetOriginX, move)),
        originY: withTiming(values.targetOriginY, move),
        width: withTiming(values.targetWidth, move),
        height: withTiming(values.targetHeight, move),
      },
    };
  };

/**
 * Cambio de unidad (miles ↔ millones): el titular nuevo sube desde abajo mientras el viejo sale hacia arriba,
 * como un odómetro, en vez de mezclar teclas y borrados carácter por carácter.
 */
const rise =
  (size: number): EntryExitAnimationFunction =>
  () => {
    'worklet';
    const up = { duration: 280, easing: EASE };
    return {
      initialValues: { opacity: 0, transform: [{ translateY: size * 0.6 }] },
      animations: {
        opacity: withDelay(60, withTiming(1, up)),
        transform: [{ translateY: withDelay(60, withTiming(0, up)) }],
      },
    };
  };

/** Dígito borrado: sube y se desvanece. */
const liftOff =
  (size: number): EntryExitAnimationFunction =>
  () => {
    'worklet';
    const up = { duration: EXIT_MS, easing: EASE };
    return {
      initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
      animations: {
        opacity: withTiming(0, up),
        transform: [{ translateY: withTiming(-size * 0.6, up) }],
      },
    };
  };

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

  // Sentido del último cambio (1 escribió, -1 borró), para ordenar los pasos de la animación.
  const [seen, setSeen] = useState(digits);
  const [dir, setDir] = useState(0);
  // Primer dígito tras estar en 0: gira como rodillo de tragamonedas en vez de caer como tecla.
  const [spin, setSpin] = useState(false);
  // Cruzó el millón (en cualquier sentido): el titular cambia de forma y se reemplaza entero.
  const [flip, setFlip] = useState(false);
  if (seen !== digits) {
    setSeen(digits);
    setDir(Math.sign(digits.length - seen.length));
    setSpin(!seen && !!digits);
    setFlip(Number(seen) >= BIG !== big);
  }
  // Lo que entra o sale va siempre primero; el reacomodo del número espera a que termine.
  // Al cambiar de unidad no hay pasos: sale el viejo y entra el nuevo a la vez.
  const moveDelay = flip ? 0 : dir < 0 ? EXIT_MS : dir > 0 ? (spin ? SPIN_MS : STRIKE_MS) : 0;

  // Golpe de tecla: al escribir, la línea baja un pelo justo cuando el tipo toca el papel (o el rodillo frena).
  const jolt = useSharedValue(0);
  useEffect(() => {
    if (dir <= 0 || flip) return;
    jolt.value = withDelay(
      spin ? SPIN_MS : STRIKE_MS,
      withSequence(
        withTiming(fs * 0.03, { duration: 60, easing: Easing.in(Easing.quad) }),
        withTiming(0, { duration: 160, easing: EASE }),
      ),
    );
  }, [digits, dir, spin, flip, fs, jolt]);
  const hit = useAnimatedStyle(() => ({
    transform: [{ translateY: jolt.value }],
  }));

  return (
    <View style={st.root}>
      <Animated.View style={[st.head, hit]}>
        <Text style={[st.currency, { fontSize: fs * 0.65, lineHeight: fs * 1.2, color }]}>$</Text>
        {digits ? (
          // Claves separadas por unidad: al cruzar el millón se desmonta todo el titular y se monta el nuevo.
          glyphs(head).map((g) => (
            <Char
              key={(big ? 'm' : 'n') + g.key}
              ch={g.ch}
              sep={g.sep}
              size={fs}
              color={color}
              typed={dir > 0}
              moveDelay={moveDelay}
              spin={spin && g.key === 'd0'}
              flip={flip}
            />
          ))
        ) : (
          // Sin exiting: el rodillo del primer dígito arranca justo desde este 0.
          <Animated.View key="placeholder" entering={FadeIn.delay(moveDelay).duration(200)} layout={slide(moveDelay)}>
            <Text style={[st.char, { fontSize: fs, lineHeight: fs * 1.2, color: color + '55' }]}>0</Text>
          </Animated.View>
        )}
        {focused && <Caret color={color} height={fs * 0.8} moveDelay={moveDelay} dir={dir} />}
      </Animated.View>

      {big && (
        <Animated.View
          entering={FadeIn.duration(320).easing(EASE)}
          exiting={FadeOut.duration(200)}
          style={st.breakdown}>
          <Text style={st.exact}>$ {dots(n)}</Text>
          <View style={st.parts}>
            {amountParts(n).map((p, i) => (
              <Animated.View
                key={p.unit}
                entering={FadeInDown.delay(80 + i * 90)
                  .duration(420)
                  .easing(EASE)}
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

/**
 * Claves estables por carácter: cada dígito por su posición entre los dígitos (desde la izquierda) y cada
 * separador por cuántos dígitos tiene a su derecha. Así, al pasar de "1.000" a "100" solo sale el último
 * dígito y el punto, en vez de reciclar posiciones y parecer que se borran dos ceros.
 */
function glyphs(text: string) {
  const total = text.replace(/\D/g, '').length;
  let seen = 0;
  return text.split('').map((ch) => {
    if (/\d/.test(ch)) return { ch, sep: false, key: `d${seen++}` };
    return { ch, sep: true, key: `s${ch}${total - seen}` };
  });
}

/** Un carácter del titular: entra como tecla de máquina de escribir, sube al borrarse y "rueda" si cambia su valor. */
function Char({
  ch,
  sep,
  size,
  color,
  typed,
  moveDelay,
  spin,
  flip,
}: {
  ch: string;
  sep: boolean;
  size: number;
  color: string;
  typed: boolean;
  moveDelay: number;
  spin: boolean;
  flip: boolean;
}) {
  // Solo gira al montarse; al frenar el rodillo se cambia por el texto normal.
  const [spinning, setSpinning] = useState(spin);
  useEffect(() => {
    if (!spinning) return;
    const id = setTimeout(() => setSpinning(false), SPIN_MS);
    return () => clearTimeout(id);
  }, [spinning]);

  const y = useSharedValue(0);
  const o = useSharedValue(1);
  const prev = useRef(ch);

  useEffect(() => {
    if (prev.current === ch) return;
    prev.current = ch;
    y.value = size * 0.12;
    o.value = 0.35;
    // El cambio de valor va junto con el reacomodo: después de que salga lo borrado.
    y.value = withDelay(moveDelay, withTiming(0, SOFT));
    o.value = withDelay(moveDelay, withTiming(1, SOFT));
  }, [ch, size, moveDelay, y, o]);

  const roll = useAnimatedStyle(() => ({
    opacity: o.value,
    transform: [{ translateY: y.value }],
  }));

  return (
    <Animated.View
      // Los separadores aparecen/desaparecen en silencio (tras la tecla): el golpe y el borrado son solo de los dígitos.
      entering={
        spin
          ? undefined
          : flip
            ? rise(size)
            : sep
              ? FadeIn.delay(moveDelay).duration(180).easing(EASE)
              : strike(size, typed)
      }
      exiting={sep ? FadeOut.duration(EXIT_MS) : liftOff(size)}
      layout={slide(moveDelay)}>
      {spinning ? (
        <Reel target={ch} size={size} color={color} />
      ) : (
        <Animated.Text
          style={[
            st.char,
            {
              fontSize: size,
              lineHeight: size * 1.2,
              color,
              paddingHorizontal: ch === ' ' ? size * 0.08 : 0,
            },
            roll,
          ]}>
          {ch}
        </Animated.Text>
      )}
    </Animated.View>
  );
}

/**
 * Rodillo de tragamonedas: una sola casilla. El dígito baja desde arriba empujando el 0 hacia abajo y
 * frena sin rebote en su sitio (igual para cualquier dígito, sin pasar por los intermedios).
 */
function Reel({ target, size, color }: { target: string; size: number; color: string }) {
  const lh = size * 1.2;
  const strip = [target, '0'];
  const y = useSharedValue(-lh);
  useEffect(() => {
    y.value = withTiming(0, { duration: SPIN_MS, easing: EASE });
  }, [y]);
  const roll = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
  }));

  return (
    <View style={[st.reel, { height: lh }]}>
      <Animated.View style={[st.reelStrip, roll]}>
        {strip.map((d, i) => (
          <Text key={i} style={[st.char, { fontSize: size, lineHeight: lh, color }]}>
            {d}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

function Caret({ color, height, moveDelay, dir }: { color: string; height: number; moveDelay: number; dir: number }) {
  const o = useSharedValue(1);
  // Último destino del cursor (se actualiza en el hilo de UI desde la animación de layout).
  const last = useSharedValue<number | null>(null);
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
  return <Animated.View layout={caretMove(moveDelay, dir, last)} style={[st.caret, { height, backgroundColor: color }, blink]} />;
}
