import { StyleSheet } from 'react-native';

import { C } from '@/constants/theme';

export const styles = StyleSheet.create({
  scene: { backgroundColor: C.bg },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingHorizontal: 12,
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  item: { flex: 1, minWidth: 0, height: 52, alignItems: 'center', justifyContent: 'center', gap: 4 },
  fab: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.ink,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
});
