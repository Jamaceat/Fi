import { StyleSheet } from 'react-native';

import { C } from '@/constants/theme';

/** Alto de cada bloque en la maqueta y espacio entre ellos. */
export const ITEM_H = 66;
export const GAP = 8;

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 20, gap: 18 },
  intro: { lineHeight: 20 },
  phone: { backgroundColor: C.bg, borderWidth: 1.5, borderColor: C.ring, borderRadius: 28, padding: 12, paddingTop: 16, gap: 14 },
  phoneHeader: { justifyContent: 'space-between', paddingHorizontal: 4 },
  bar: { height: 8, borderRadius: 4 },
  barKicker: { width: 70, backgroundColor: C.line },
  barTitle: { width: 110, height: 12, backgroundColor: C.ring },
  miniRound: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  item: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ITEM_H,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
  },
  badge: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  badgeLight: { backgroundColor: C.chip },
  badgeDark: { backgroundColor: C.glass },
});
