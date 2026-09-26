import { StyleSheet } from 'react-native';

import { C } from '@/constants/theme';

export const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: C.dialogBackdrop },
  box: { width: '100%', maxWidth: 360, backgroundColor: C.bg, borderRadius: 26, padding: 20, gap: 14 },
  ref: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 14 },
  amountBox: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  actions: { flexDirection: 'row', gap: 10 },
  cancel: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: C.line,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accept: { flex: 1, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
});
