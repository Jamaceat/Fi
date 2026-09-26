import { StyleSheet } from 'react-native';

import { C } from '@/constants/theme';

export const styles = StyleSheet.create({
  units: { backgroundColor: C.segBg, borderRadius: 12, padding: 4 },
  unit: { flex: 1, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  indicator: { borderRadius: 9 },
});
