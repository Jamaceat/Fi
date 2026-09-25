import { StyleSheet } from 'react-native';

import { C } from '@/constants/theme';

export const styles = StyleSheet.create({
  hero: { backgroundColor: C.inDark, borderRadius: 24, padding: 22, gap: 18 },
  heroAmount: { letterSpacing: -1 },
  heroTile: { flex: 1, backgroundColor: C.in, borderRadius: 16, padding: 14, gap: 4 },
  action: { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 14, gap: 4 },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.inSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  goal: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 16, gap: 14 },
  goalIcon: { backgroundColor: C.inSoft },
  contribute: { height: 40, paddingHorizontal: 16, borderRadius: 12, backgroundColor: C.in, justifyContent: 'center' },
  emptyHistory: { paddingVertical: 16, textAlign: 'center' },
  histRow: { paddingVertical: 12 },
  histIconAdd: { backgroundColor: C.in },
  histIconUpdate: { backgroundColor: C.inSoft },
  ref: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 14, gap: 12 },
  quick: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: { borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
  previewNeutral: { backgroundColor: C.chip },
  previewPositive: { backgroundColor: C.inSoft },
  previewNegative: { backgroundColor: C.outSoft },
});
