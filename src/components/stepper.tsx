import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { C } from '@/constants/theme';
import { t } from '@/i18n';
import { layout } from '@/styles/common';

import { IconMinus, IconPlus } from './icons';
import { G, styles as st } from './stepper.styles';
import { useKeyboardHeight } from './use-keyboard-height';

/**
 * Inicio de cada zona, como fracción de media barra: quieto, un solo paso, de a uno lento,
 * rápido y muy rápido (solo el tramo final).
 */
const ZONES = [0.1, 0.35, 0.6, 0.85] as const;
/** Pausa entre pasos (ms) según la zona; null = un solo paso al entrar, sin repetir. */
const DELAYS = [0, null, 420, 150, 55] as const;
// Llegan desacelerando, sin rebote.
const EASE = Easing.out(Easing.cubic);
const RETURN = { duration: 200, easing: EASE };
const OPEN = { duration: 260, easing: EASE };
const CLOSE = { duration: 180, easing: EASE };

function zoneOf(d: number) {
  'worklet';
  const a = Math.abs(d);
  const level = a < ZONES[0] ? 0 : a < ZONES[1] ? 1 : a < ZONES[2] ? 2 : a < ZONES[3] ? 3 : 4;
  return d < 0 ? -level : level;
}

const TONES = {
  dec: [C.outSoft, C.outPanelLine, C.outBarLight, C.outBar],
  inc: [C.inSoft, C.inTrack2, C.inBarLight, C.inBar],
} as const;
const tone = (zone: number) => (zone === 0 ? C.chip : TONES[zone < 0 ? 'dec' : 'inc'][Math.abs(zone) - 1]);

/** Tramos de la barra de izquierda a derecha; el color se intensifica hacia los extremos, donde va más rápido. */
const SEGMENTS = (() => {
  const bounds = [0, ...ZONES, 1];
  const half = bounds.slice(0, -1).map((start, level) => ({ level, flex: bounds[level + 1] - start }));
  return [
    ...half.toReversed().map((s) => ({ zone: -s.level, flex: s.flex })),
    ...half.map((s) => ({ zone: s.level, flex: s.flex })),
  ];
})();

/**
 * Contador: una caja con el número. Al tocarla, el valor se abre en una ventana centrada donde
 * se puede escribir (si hay `onChange`) o ajustar con una barra: arrastrando hacia − o + el valor
 * cambia solo, más rápido cuanto más cerca del extremo.
 */
export function Stepper({
  value,
  onDec,
  onInc,
  decLabel = t('ui.decrease'),
  incLabel = t('ui.increase'),
  minWidth = 40,
  onChange,
  inputLabel,
}: {
  value: string;
  onDec: () => void;
  onInc: () => void;
  decLabel?: string;
  incLabel?: string;
  /** Ancho mínimo del valor dentro de la caja. */
  minWidth?: number;
  /** Si se pasa, el número también se puede escribir directamente. */
  onChange?: (n: number) => void;
  inputLabel?: string;
}) {
  // Texto mientras se escribe; al salir del campo vuelve a mostrar `value` (ya ajustado por quien llama).
  const [typing, setTyping] = useState<string | null>(null);
  const [zone, setZone] = useState(0);
  const [open, setOpen] = useState(false);

  // Los pasos repetidos usan siempre los manejadores del último render (con el valor ya actualizado).
  const handlers = useRef({ onDec, onInc });
  useEffect(() => {
    handlers.current = { onDec, onInc };
  });

  // Repite el paso mientras el control esté fuera del reposo, al ritmo de la zona.
  // La primera zona solo da un paso al entrar desde el reposo (o desde el otro lado).
  const prevZone = useRef(0);
  useEffect(() => {
    const prev = prevZone.current;
    prevZone.current = zone;
    if (zone === 0) return;
    const delay = DELAYS[Math.abs(zone)];
    let id: ReturnType<typeof setTimeout> | undefined;
    const step = () => {
      (zone > 0 ? handlers.current.onInc : handlers.current.onDec)();
      if (delay !== null) id = setTimeout(step, delay);
    };
    // Al salir del reposo o cambiar de lado da el primer paso ya; al cambiar de ritmo solo reprograma.
    if (Math.sign(zone) !== Math.sign(prev)) step();
    else if (delay !== null) id = setTimeout(step, delay);
    return () => clearTimeout(id);
  }, [zone]);

  // ——— Ventana ———

  const box = useRef<View>(null);
  const { width: screenW, height: screenH } = useWindowDimensions();
  const progress = useSharedValue(0); // 0: en la caja, 1: ventana abierta
  const origin = useSharedValue({ x: 0, y: 0 }); // centro de la caja respecto al centro de la pantalla

  const show = () => {
    box.current?.measureInWindow((x, y, w, h) => {
      origin.set({ x: x + w / 2 - screenW / 2, y: y + h / 2 - screenH / 2 });
      progress.set(0);
      setOpen(true);
    });
  };
  const hide = () => {
    Keyboard.dismiss();
    progress.set(
      withTiming(0, CLOSE, (done) => {
        if (done) scheduleOnRN(setOpen, false);
      }),
    );
  };

  // La ventana sale desde la caja y crece hasta el centro; al cerrar vuelve a ella.
  const panelStyle = useAnimatedStyle(() => {
    const p = progress.get();
    const o = origin.get();
    return {
      opacity: Math.min(1, p * 1.5),
      transform: [{ translateX: o.x * (1 - p) }, { translateY: o.y * (1 - p) }, { scale: 0.35 + 0.65 * p }],
    };
  });
  const backdropStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, progress.get()) }));
  // El panel se centra en el espacio que deja libre el teclado.
  const keyboard = useKeyboardHeight();
  const modalStyle = useAnimatedStyle(() => ({ paddingBottom: keyboard.get() }));

  // ——— Barra ———

  const deflect = useSharedValue(0); // posición del control, −1 … 1
  const zoneUI = useSharedValue(0);

  const pan = Gesture.Pan()
    .minDistance(0)
    .onUpdate((e) => {
      const d = Math.max(-1, Math.min(1, e.translationX / G.HALF));
      deflect.set(d);
      const z = zoneOf(d);
      if (z === zoneUI.get()) return;
      zoneUI.set(z);
      scheduleOnRN(setZone, z);
    })
    .onFinalize(() => {
      deflect.set(withTiming(0, RETURN));
      if (zoneUI.get() !== 0) {
        zoneUI.set(0);
        scheduleOnRN(setZone, 0);
      }
    });

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: deflect.get() * G.HALF }] }));

  return (
    <>
      <Pressable
        ref={box}
        onPress={show}
        style={({ pressed }) => [st.box, (open || pressed) && st.boxFaded]}
        accessibilityRole="adjustable"
        accessibilityLabel={inputLabel}
        accessibilityValue={{ text: value }}
        accessibilityHint={t('ui.dialHint')}
        accessibilityActions={[
          { name: 'activate' },
          { name: 'decrement', label: decLabel },
          { name: 'increment', label: incLabel },
        ]}
        onAccessibilityAction={(e) => {
          const name = e.nativeEvent.actionName;
          if (name === 'activate') show();
          else (name === 'increment' ? onInc : onDec)();
        }}>
        <Text style={[st.value, { minWidth }]}>{value}</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="none"
        statusBarTranslucent
        onShow={() => progress.set(withTiming(1, OPEN))}
        onRequestClose={hide}>
        {/* Los gestos dentro de un Modal necesitan su propia raíz. */}
        <GestureHandlerRootView style={layout.fill}>
          <Animated.View style={[st.modal, modalStyle]}>
            <Animated.View style={[st.backdrop, backdropStyle]}>
              <Pressable style={layout.fill} onPress={hide} accessibilityLabel={t('ui.closePanel')} />
            </Animated.View>

            <Animated.View style={[st.panel, panelStyle]}>
              {inputLabel ? <Text style={st.title}>{inputLabel}</Text> : null}

              {onChange ? (
                <TextInput
                  value={typing ?? value}
                  onChangeText={(text) => {
                    const digits = text.replace(/\D/g, '');
                    setTyping(digits);
                    if (digits) onChange(Number(digits));
                  }}
                  onBlur={() => setTyping(null)}
                  selectTextOnFocus
                  keyboardType="number-pad"
                  maxLength={3}
                  accessibilityLabel={inputLabel}
                  style={st.field}
                />
              ) : (
                <Text style={st.big} numberOfLines={1} adjustsFontSizeToFit accessibilityLiveRegion="polite">
                  {value}
                </Text>
              )}

              <View style={st.bar}>
                <Pressable
                  onPress={onDec}
                  accessibilityLabel={decLabel}
                  hitSlop={8}
                  style={({ pressed }) => [st.end, st.endDec, pressed && st.pressed]}>
                  <IconMinus size={14} />
                </Pressable>
                <GestureDetector gesture={pan}>
                  <View style={st.track} accessibilityHint={t('ui.barHint')}>
                    <View style={st.rail}>
                      {SEGMENTS.map((s, i) => (
                        <View
                          key={i}
                          style={[{ flex: s.flex, backgroundColor: tone(s.zone) }, zone !== 0 && s.zone !== zone && st.segmentIdle]}
                        />
                      ))}
                    </View>
                    <View style={st.center} />
                    <Animated.View style={[st.thumb, thumbStyle]} />
                  </View>
                </GestureDetector>
                <Pressable
                  onPress={onInc}
                  accessibilityLabel={incLabel}
                  hitSlop={8}
                  style={({ pressed }) => [st.end, st.endInc, pressed && st.pressed]}>
                  <IconPlus size={14} />
                </Pressable>
              </View>

              <Pressable onPress={hide} accessibilityRole="button" style={({ pressed }) => [st.done, pressed && st.pressed]}>
                <Text style={st.doneText}>{t('ui.done')}</Text>
              </Pressable>
            </Animated.View>
          </Animated.View>
        </GestureHandlerRootView>
      </Modal>
    </>
  );
}
