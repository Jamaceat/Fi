import { StyleSheet } from 'react-native';

import { C } from '@/constants/theme';

export const styles = StyleSheet.create({
  /**
   * Fondo de carga de la barra del mes (título y botones): de borde a borde de la pantalla
   * (compensa el margen lateral de 20 de `Screen`) y con aire arriba y abajo.
   */
  barLoading: { top: -12, bottom: -12, left: -20, right: -20, borderRadius: 0 },
  titleBtn: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, flexShrink: 1 },
  titleIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: C.chip, marginBottom: 5 },
  deck: { gap: 18 },
  /** Carta del mes anterior, encima de la nueva mientras sale volando. */
  leaving: { position: 'absolute', top: 0, left: 0, right: 0 },
  hero: { backgroundColor: C.hero, borderRadius: 24, padding: 22, gap: 18 },
  heroAmount: { letterSpacing: -1 },
  tile: { flex: 1, backgroundColor: C.heroTile, borderRadius: 16, padding: 14, gap: 6 },
  fund: { paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  fundIcon: { backgroundColor: C.extraSoft },
  shortcuts: { paddingVertical: 14, paddingHorizontal: 8, gap: 16 },
  shortcutRow: { alignItems: 'flex-start' },
  shortcut: { flex: 1, alignItems: 'center', gap: 8 },
  shortcutIcon: { width: 48, height: 48, borderRadius: 16 },
  unconfirmedIcon: { backgroundColor: C.outSoft },
  notificationsIcon: { backgroundColor: C.inSoft },
  /** Contador de sin confirmar sobre el ícono. */
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: C.card,
    backgroundColor: C.out,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savings: {
    backgroundColor: C.inDark,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  savingsBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.in, alignItems: 'center', justifyContent: 'center' },
  pending: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pendingIcon: { backgroundColor: C.inSoft },
  review: { height: 36, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.in, justifyContent: 'center' },
  breakdown: { padding: 18, gap: 16 },
  separator: { height: 1, backgroundColor: C.divider },
  emptyRecent: { paddingVertical: 16, textAlign: 'center' },
});
