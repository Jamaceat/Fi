import { StyleSheet } from 'react-native';

import { C } from '@/constants/theme';

export const styles = StyleSheet.create({
  years: { justifyContent: 'space-between' },
  yearBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: {
    flexBasis: '30%',
    flexGrow: 1,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  cellOn: { backgroundColor: C.ink, borderColor: C.ink },
  cellToday: { borderColor: C.ink, borderWidth: 1.5 },
  todayDot: { width: 5, height: 5, borderRadius: 3 },
});
