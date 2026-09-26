import { StyleSheet } from 'react-native';

import { C } from '@/constants/theme';

export const styles = StyleSheet.create({
  // Sobresale un poco del texto para que no quede pegado al borde.
  pill: {
    position: 'absolute',
    top: -4,
    bottom: -4,
    left: -10,
    right: -10,
    borderRadius: 14,
    backgroundColor: C.loading,
    overflow: 'hidden',
  },
  shine: { position: 'absolute', top: 0, left: 0 },
});
