import { StyleSheet } from 'react-native';

import { C } from '@/constants/theme';

export const styles = StyleSheet.create({
  topSpacer: { width: 44 },
  amount: { alignItems: 'center', gap: 6, paddingTop: 8 },
  freq: { flex: 1, minHeight: 72, padding: 14, borderRadius: 16, backgroundColor: C.card, gap: 4, borderWidth: 1, borderColor: C.line },
  freqOn: { borderWidth: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cat: {
    width: '31.5%',
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  /** Cuerpo de cada paso del asistente. */
  step: { gap: 20 },
  backBtn: { height: 56, borderRadius: 18, paddingHorizontal: 18 },
});
