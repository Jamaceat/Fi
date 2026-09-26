import { useEffect } from 'react';
import { Dimensions, Keyboard, Platform, type KeyboardMetrics } from 'react-native';
import { Easing, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

const EASE = Easing.out(Easing.cubic);

/**
 * Cuánto tapa el teclado desde el fondo de la pantalla. En Android `height` no
 * incluye la barra de navegación que queda debajo, así que se mide desde su borde superior.
 */
const covered = (m: KeyboardMetrics | undefined) =>
  m ? Math.max(m.height, Dimensions.get('screen').height - m.screenY) : 0;

/**
 * Alto del teclado, animado. Con edge-to-edge (y dentro de Modals translúcidos)
 * Android no redimensiona la ventana y KeyboardAvoidingView no sirve, así que
 * se escucha el teclado directamente y cada contenedor reserva ese espacio.
 */
export function useKeyboardHeight() {
  const reduceMotion = useReducedMotion();
  // Si se monta con el teclado ya abierto (p. ej. al cambiar de paso), arranca con su alto.
  const height = useSharedValue(Keyboard.isVisible() ? covered(Keyboard.metrics()) : 0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    // iOS avisa antes y trae la duración; Android avisa cuando ya terminó.
    const move = (to: number, duration: number) =>
      height.set(withTiming(to, { duration: reduceMotion ? 0 : duration || 200, easing: EASE }));
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) =>
      move(covered(e.endCoordinates), e.duration),
    );
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (e) => move(0, e.duration));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [height, reduceMotion]);
  return height;
}
