import { StyleSheet } from 'react-native';

import { C } from '@/constants/theme';

/** Utilidades de disposición que se repiten en toda la app. */
export const layout = StyleSheet.create({
  fill: { flex: 1 },
  /** Ocupa el espacio libre y permite que el texto se recorte con `numberOfLines`. */
  fillShrink: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  between: { justifyContent: 'space-between' },
  betweenStart: { justifyContent: 'space-between', alignItems: 'flex-start' },
  betweenBaseline: { justifyContent: 'space-between', alignItems: 'baseline' },
  end: { justifyContent: 'flex-end' },
  alignEnd: { alignItems: 'flex-end' },
  center: { alignItems: 'center', justifyContent: 'center' },
  wrap: { flexWrap: 'wrap' },
  textCenter: { textAlign: 'center' },
  screen: { flex: 1, backgroundColor: C.bg },
});

/** Piezas visuales compartidas por varias pantallas. */
export const common = StyleSheet.create({
  box: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 18 },
  boxPadded: { paddingHorizontal: 14 },
  listCard: { paddingHorizontal: 16, paddingVertical: 4 },
  divider: { borderTopWidth: 1, borderTopColor: C.divider },
  amountBox: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, paddingVertical: 14 },
  dateBtn: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  /** Botón blanco a lo ancho con ícono y texto (Exportar, Restablecer, Eliminar fijo…). */
  outlineBtn: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  /** Botón redondeado pequeño con ícono y texto (Agregar, Nueva meta). */
  pillBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  /** Aviso de confirmación destructiva (borrar datos, eliminar fijo). */
  dangerPanel: { backgroundColor: C.outSoft, borderRadius: 18, padding: 16, gap: 10 },
  confirmBtn: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  confirmCancel: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  confirmDanger: { backgroundColor: C.danger },
  /** Barra inferior fija con el botón principal. */
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 14,
    paddingHorizontal: 20,
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  iconTile: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  bodyText: { lineHeight: 19 },
});
