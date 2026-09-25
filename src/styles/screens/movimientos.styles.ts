import { StyleSheet } from 'react-native';

import { C } from '@/constants/theme';

export const styles = StyleSheet.create({
  summary: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: C.backdropDark },
  box: { width: '100%', maxWidth: 340, backgroundColor: C.bg, borderRadius: 26, padding: 18, gap: 16 },
  option: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 18,
    paddingHorizontal: 8,
    borderRadius: 20,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
  },
  optionIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: C.chip,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
});
