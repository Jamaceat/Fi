import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  abs: { position: 'absolute', left: 0, top: 0 },
  /** Opción transparente sobre el fondo que se desliza; conserva el ancho del borde. */
  clear: { backgroundColor: 'transparent', borderColor: 'transparent' },
});
