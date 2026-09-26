import { StyleSheet } from 'react-native';

import { C } from '@/constants/theme';

export const styles = StyleSheet.create({
  defRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  defIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  defIconOut: { backgroundColor: C.dividerSoft },
  defIconIn: { backgroundColor: C.inSoft },
  defIconHoliday: { backgroundColor: C.holidaySoft },
  defIconNeutral: { backgroundColor: C.chip },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  defPanel: { paddingHorizontal: 14, paddingBottom: 14, gap: 12 },
  optGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opt: { height: 40, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, justifyContent: 'center' },
  customPanel: { gap: 10 },
  customPanelOff: { opacity: 0.7 },
  settingRow: { paddingVertical: 12 },
  settingRowCompact: { paddingVertical: 10 },
  radioGroup: { paddingVertical: 12, gap: 8 },
  holidayBox: { padding: 14, gap: 12 },
  holidayStatus: { paddingTop: 12 },
  backupBox: { padding: 14, gap: 12 },
  backupStatus: { paddingTop: 12 },
  refreshBtn: { height: 46 },
  refreshing: { opacity: 0.5 },
  radio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  radioOn: { backgroundColor: C.inSoft, borderColor: C.in },
  radioOff: { backgroundColor: C.card, borderColor: C.line },
});
