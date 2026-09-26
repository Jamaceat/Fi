// Paleta y tipografía tomadas del diseño (Diseño/project/*.dc.html).

export const C = {
  bg: '#F4F1EC',
  ink: '#1B1A17',
  card: '#FFFFFF',
  white: '#FFFFFF',
  line: '#E4DFD6',
  divider: '#EEEAE3',
  dividerSoft: '#EFEBE4',
  muted: '#6B665E',
  muted2: '#5E5A53',
  faint: '#A39D93',
  ring: '#BDB6AA',
  segBg: '#E9E4DC',
  chip: '#F1ECE4',
  chipMuted: '#E9E5DE',
  placeholder: '#8A847A',
  dashed: '#D5CFC4',
  dashedDark: '#C9C2B6',
  handle: '#D3CDC2',
  panelOff: '#FAF8F4',
  /** Fondo de un texto mientras carga, y el brillo que lo recorre. */
  loading: '#EAE4DA',
  loadingShine: '#FFFFFF',
  shadow: '#000000',
  backdrop: 'rgba(27,26,23,0.42)',
  backdropDark: 'rgba(0,0,0,0.45)',
  /** Fondo detrás de un diálogo centrado: casi negro, para que solo se vea el diálogo. */
  dialogBackdrop: 'rgba(0,0,0,0.78)',
  glass: 'rgba(255,255,255,0.14)',
  glassStrong: '#FFFFFFAA',

  // Gasto
  out: '#B4501A',
  outDark: '#8A3C12',
  outSoft: '#FBEDE3',
  outIconBg: '#FBEBDF',
  outBar: '#E08A4F',
  outBarLight: '#E9B08A',
  outText: '#F0A36F',
  outPanel: '#F6E7DC',
  outPanelLine: '#EBCDB8',
  outPanelText: '#7A3413',
  warn: '#A2461A',
  danger: '#9A3F12',

  // Ingreso
  in: '#1D5C8C',
  inDark: '#164A72',
  inSoft: '#E3EEF6',
  inIconBg: '#E3EDF5',
  inBar: '#5A8DB5',
  inBarLight: '#8DB6D6',
  inText: '#9CC5E6',
  inTrack: '#EDF1F4',
  inTrack2: '#C9DCEA',
  inSub: '#BFD6E8',
  inHeroText: '#F4F8FB',

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

/**
 * Colores de las metas (barra del ahorro total y tarjetas). Se leen bien sobre el azul del ahorro
 * y sobre blanco. El libre usa C.inText.
 */
export const GOAL_COLORS = ['#E0A43A', '#4FB08A', '#D9709A', '#9C84DD', '#46AFC0', '#C98A5A'] as const;

/** Color fijo de una meta según su id (no cambia al borrar otras). */
export const goalColor = (id: number) => GOAL_COLORS[Math.abs(id - 1) % GOAL_COLORS.length];

/** Fondo suave del ícono de una meta: su color con transparencia. */
export const goalSoft = (id: number) => `${goalColor(id)}26`;

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
