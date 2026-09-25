import { StyleSheet } from 'react-native';

import { C } from '@/constants/theme';

export const styles = StyleSheet.create({
  steps: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, gap: 6, paddingVertical: 4 },
  bar: { height: 5, borderRadius: 3, backgroundColor: C.segBg },
});
