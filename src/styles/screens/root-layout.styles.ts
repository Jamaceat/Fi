import { StyleSheet } from 'react-native';

import { C } from '@/constants/theme';

export const styles = StyleSheet.create({
  root: { flex: 1 },
  scene: { backgroundColor: C.bg },
  lock: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', padding: 24, gap: 20 },
  center: { textAlign: 'center' },
});
