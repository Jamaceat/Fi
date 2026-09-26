import { StyleSheet } from 'react-native';

import { C, F } from '@/constants/theme';

export const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: 12, alignSelf: 'stretch' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 72 },
  currency: { fontFamily: F.serif500, marginRight: 4 },
  char: { fontFamily: F.serif500 },
  breakdown: { alignItems: 'center', gap: 10 },
  exact: { fontFamily: F[600], fontSize: 13, color: C.muted, fontVariant: ['tabular-nums'] },
  parts: { gap: 6 },
  part: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, alignSelf: 'center' },
  partValue: { fontFamily: F.serif600, minWidth: 48, textAlign: 'right' },
  partLabel: { fontFamily: F[600], color: C.muted },
  reel: { overflow: 'hidden' },
  reelStrip: { alignItems: 'center' },
  caret: { width: 2, borderRadius: 1, marginLeft: 4 },
  hidden: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.02, color: 'transparent' },
});
