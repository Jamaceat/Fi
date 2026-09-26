import { useEffect } from 'react';
import { Keyboard, Platform } from 'react-native';
import { Easing, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

const EASE = Easing.out(Easing.cubic);

/**
 * Alto del teclado, animado. Con edge-to-edge (y dentro de Modals translúcidos)
 * Android no redimensiona la ventana y KeyboardAvoidingView no sirve, así que
 * se escucha el teclado directamente y cada contenedor reserva ese espacio.
 */
export function useKeyboardHeight() {
  const reduceMotion = useReducedMotion();
  const height = useSharedValue(0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    // iOS avisa antes y trae la duración; Android avisa cuando ya terminó.
    const move = (to: number, duration: number) =>
      height.set(withTiming(to, { duration: reduceMotion ? 0 : duration || 200, easing: EASE }));
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) =>
      move(e.endCoordinates.height, e.duration),
    );
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (e) => move(0, e.duration));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [height, reduceMotion]);
  return height;
}
