import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle } from 'react-native-reanimated';

import { C } from '@/constants/theme';
import { t } from '@/i18n';
import { cleanAmount, dots } from '@/lib/format';
import { layout } from '@/styles/common';

import { styles as s } from './amount-dialog.styles';
import { AmountField } from './amount-field';
import { Stack, T, Tap } from './ui';
import { useKeyboardHeight } from './use-keyboard-height';

const IN = FadeIn.duration(220).easing(Easing.out(Easing.cubic));

/**
 * Diálogo centrado sobre un fondo oscuro para escribir un monto y aceptarlo.
 * `max` = tope permitido: pasarse lo muestra en rojo con `overText` y bloquea Aceptar.
 */
export function AmountDialog({
  visible,
  title,
  hint,
  initial = 0,
  max,
  overText,
  accent = C.in,
  onAccept,
  onClose,
}: {
  visible: boolean;
  title: string;
  hint?: string;
  initial?: number;
  max?: number;
  overText?: string;
  accent?: string;
  onAccept: (amount: number) => void;
  onClose: () => void;
}) {
  const keyboard = useKeyboardHeight();
  // Queda centrado en lo que el teclado deja libre.
  const wrapStyle = useAnimatedStyle(() => ({ paddingBottom: 24 + keyboard.get() }));
  const [input, setInput] = useState('');
  const [wasVisible, setWasVisible] = useState(false);
  // Cada vez que se abre, arranca con el valor actual.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setInput(initial > 0 ? String(initial) : '');
  }

  const amount = Number(input) || 0;
  const over = max != null && amount > max;
  const disabled = amount <= 0 || over;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {visible && (
        <Animated.View style={[s.wrap, wrapStyle]}>
          <Animated.View entering={IN} style={s.backdrop}>
            <Pressable style={layout.fill} onPress={onClose} accessibilityLabel={t('ui.closePanel')} />
          </Animated.View>
          <Animated.View entering={IN} style={s.box}>
            <Stack gap={4}>
              <T w={800} size={17}>
                {title}
              </T>
              {!!hint && (
                <T size={13} color={C.muted}>
                  {hint}
                </T>
              )}
            </Stack>
            <View style={s.amountBox}>
              <AmountField size={36} autoFocus value={dots(input)} onChangeText={(text) => setInput(cleanAmount(text))} color={C.inDark} />
            </View>
            {over && !!overText && (
              <T w={700} size={13} color={C.warn}>
                {overText}
              </T>
            )}
            <View style={s.actions}>
              <Tap onPress={onClose} style={s.cancel} accessibilityRole="button">
                <T w={800} size={15}>
                  {t('common.cancel')}
                </T>
              </Tap>
              <Tap
                onPress={disabled ? undefined : () => onAccept(amount)}
                accessibilityRole="button"
                accessibilityState={{ disabled }}
                style={[s.accept, { backgroundColor: accent }, disabled && s.disabled]}>
                <T w={800} size={15} color={C.white}>
                  {t('common.accept')}
                </T>
              </Tap>
            </View>
          </Animated.View>
        </Animated.View>
      )}
    </Modal>
  );
}
