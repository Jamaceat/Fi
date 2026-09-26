import { StyleSheet } from 'react-native';

import { C, F } from '@/constants/theme';

export const styles = StyleSheet.create({
  search: {
    height: 48,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: C.in,
    backgroundColor: C.card,
    paddingLeft: 14,
    paddingRight: 4,
  },
  searchInput: { flex: 1, fontFamily: F[600], fontSize: 15, color: C.ink, padding: 0 },
  searchClear: { padding: 12 },
  hero: { backgroundColor: C.hero, borderRadius: 24, padding: 20, gap: 8 },
  incHero: { backgroundColor: C.inSoft, borderRadius: 20, padding: 16, gap: 6 },
  heroAmount: { letterSpacing: -0.5 },
  list: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 44 },
  iconOut: { backgroundColor: C.outSoft },
  iconIn: { backgroundColor: C.inSoft },
});
