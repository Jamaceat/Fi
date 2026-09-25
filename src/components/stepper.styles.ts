import { StyleSheet } from 'react-native';

import { C, F } from '@/constants/theme';

/** Geometría de la barra: horizontal, con los botones − y + a los lados. */
export const G = {
  HALF: 110, // media barra = recorrido del dedo hasta un extremo
  END: 30, // círculos − y +
  THUMB: 26,
} as const;

export const styles = StyleSheet.create({
  box: {
    height: 44,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.line,
    backgroundColor: C.card,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Mientras la ventana está abierta el valor "vive" allá.
  boxFaded: { opacity: 0.35 },
  value: { fontFamily: F[800], fontSize: 17, color: C.ink, fontVariant: ['tabular-nums'], textAlign: 'center' },

  modal: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: C.backdrop },
  panel: {
    backgroundColor: C.bg,
    borderRadius: 28,
    paddingTop: 22,
    paddingBottom: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 18,
    shadowColor: C.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  title: { fontFamily: F[700], fontSize: 14, color: C.muted },
  field: {
    minWidth: 120,
    height: 76,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: C.line,
    backgroundColor: C.card,
    paddingHorizontal: 18,
    fontFamily: F[800],
    fontSize: 40,
    color: C.ink,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  big: {
    maxWidth: 2 * G.HALF,
    fontFamily: F[800],
    fontSize: 40,
    color: C.ink,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },

  bar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  end: { width: G.END, height: G.END, borderRadius: G.END / 2, alignItems: 'center', justifyContent: 'center' },
  endDec: { backgroundColor: C.outBarLight },
  endInc: { backgroundColor: C.inBarLight },
  pressed: { opacity: 0.6 },
  // Más alta que la línea para que sea fácil tomarla con el dedo.
  track: { width: 2 * G.HALF, height: 44, justifyContent: 'center' },
  rail: { height: 10, borderRadius: 5, overflow: 'hidden', flexDirection: 'row' },
  segmentIdle: { opacity: 0.5 },
  center: {
    position: 'absolute',
    left: G.HALF - 1,
    top: 14,
    width: 2,
    height: 16,
    borderRadius: 1,
    backgroundColor: C.ring,
  },
  thumb: {
    position: 'absolute',
    top: (44 - G.THUMB) / 2,
    left: G.HALF - G.THUMB / 2,
    width: G.THUMB,
    height: G.THUMB,
    borderRadius: G.THUMB / 2,
    backgroundColor: C.card,
    borderWidth: 2,
    borderColor: C.ink,
  },

  done: { alignSelf: 'stretch', height: 48, borderRadius: 16, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  doneText: { fontFamily: F[800], fontSize: 15, color: C.white },
});
