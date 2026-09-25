import { StyleSheet } from 'react-native';

import { C } from '@/constants/theme';

export const styles = StyleSheet.create({
  deleteBtn: { borderWidth: 1.5 },
  confirm: { gap: 8 },
  current: { textAlign: 'center' },
  cancel: {
    height: 56,
    paddingHorizontal: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  save: { flex: 1 },
});
