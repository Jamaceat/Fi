import { StyleSheet } from 'react-native';

import { C } from '@/constants/theme';

export const styles = StyleSheet.create({
  intro: { lineHeight: 19 },

  // Estado del permiso
  status: { padding: 16, gap: 14, borderRadius: 18, borderWidth: 1 },
  statusOk: { backgroundColor: C.inSoft, borderColor: C.inTrack2 },
  statusWarn: { backgroundColor: C.outSoft, borderColor: C.outPanelLine },
  statusOff: { backgroundColor: C.card, borderColor: C.line },
  statusIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statusIconOk: { backgroundColor: C.in },
  statusIconWarn: { backgroundColor: C.warn },
  statusIconOff: { backgroundColor: C.chip },
  statusBtn: { height: 46 },

  // Fijos
  eachHeader: { justifyContent: 'space-between', paddingTop: 12, paddingBottom: 4 },
  kindLabel: { paddingTop: 12, paddingBottom: 2 },
  fixedRow: { paddingVertical: 12, gap: 10 },
  fixedIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fixedIconOut: { backgroundColor: C.outIconBg },
  fixedIconIn: { backgroundColor: C.inIconBg },
  remindDays: { paddingLeft: 46, justifyContent: 'space-between' },
  offNote: { paddingVertical: 12, lineHeight: 18 },

  // Hora
  hourBox: { padding: 14, gap: 10 },
  hour: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  /** Forma de cada hora, para su fondo y el que se desliza. */
  hourPlate: { borderRadius: 12, borderWidth: 1 },
  hourOn: { backgroundColor: C.inSoft, borderColor: C.in },
  hourOff: { backgroundColor: C.card, borderColor: C.line },

  settingRowCompact: { paddingVertical: 10 },
  weeklyNext: { paddingBottom: 12, marginTop: -4 },

  // Próximos avisos
  upcomingRow: { paddingVertical: 12, alignItems: 'flex-start' },
  dateTile: { width: 46, paddingVertical: 6, borderRadius: 12, backgroundColor: C.chip, alignItems: 'center' },
  more: { paddingVertical: 12, alignItems: 'center' },
});
