// Paleta y tipografía tomadas del diseño (Diseño/project/*.dc.html).

export const C = {
  bg: '#F4F1EC',
  ink: '#1B1A17',
  card: '#FFFFFF',
  line: '#E4DFD6',
  divider: '#EEEAE3',
  muted: '#6B665E',
  muted2: '#5E5A53',
  faint: '#A39D93',
  ring: '#BDB6AA',
  segBg: '#E9E4DC',
  chip: '#F1ECE4',

  // Gasto
  out: '#B4501A',
  outDark: '#8A3C12',
  outSoft: '#FBEDE3',
  outBar: '#E08A4F',
  outBarLight: '#E9B08A',
  outText: '#F0A36F',
  warn: '#A2461A',
  danger: '#9A3F12',

  // Ingreso
  in: '#1D5C8C',
  inDark: '#164A72',
  inSoft: '#E3EEF6',
  inBarLight: '#8DB6D6',
  inText: '#9CC5E6',
  inTrack: '#EDF1F4',
  inTrack2: '#C9DCEA',
  inSub: '#BFD6E8',

  // Extraordinario
  extra: '#6E4FA3',
  extraDark: '#5B3E8A',
  extraSoft: '#EFEAF7',

  // Festivos (calendario)
  holiday: '#2F7A55',
  holidayDark: '#1F5A3D',
  holidaySoft: '#E0F0E6',

  // Tarjeta oscura
  hero: '#1B1A17',
  heroTile: '#2A2925',
  heroTrack: '#3A3833',
  heroSub: '#C9C3B8',
  outTrack: '#F1ECE4',
  switchOff: '#CFC9BF',
} as const;

export const F = {
  serif500: 'Fraunces_500Medium',
  serif600: 'Fraunces_600SemiBold',
  400: 'Manrope_400Regular',
  500: 'Manrope_500Medium',
  600: 'Manrope_600SemiBold',
  700: 'Manrope_700Bold',
  800: 'Manrope_800ExtraBold',
} as const;

export type Weight = 400 | 500 | 600 | 700 | 800;
