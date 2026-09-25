import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { C } from '@/constants/theme';

type P = { size?: number; color?: string; stroke?: number };

const base = (size: number, color: string, stroke: number) =>
  ({
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: stroke,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }) as const;

function make(paths: string[], def = 2) {
  function Icon({ size = 18, color = C.ink, stroke = def }: P) {
    return (
      <Svg {...base(size, color, stroke)}>
        {paths.map((d) => (
          <Path key={d} d={d} />
        ))}
      </Svg>
    );
  }
  return Icon;
}

export const IconChevronLeft = make(['M15 5l-7 7 7 7']);
export const IconChevronRight = make(['M9 5l7 7-7 7']);
export const IconChevronDown = make(['M6 9l6 6 6-6']);
export const IconClose = make(['M6 6l12 12M18 6 6 18']);
export const IconCheck = make(['M5 12.5l4.5 4.5L19 7.5'], 2.6);
export const IconPlus = make(['M12 5v14M5 12h14'], 2.2);
export const IconMinus = make(['M5 12h14'], 2.2);
export const IconIncome = make(['M17 7 7 17M7 9v8h8'], 2.2);
export const IconExpense = make(['M7 17 17 7M9 7h8v8'], 2.2);
export const IconArrowUp = make(['M12 19V5M6 11l6-6 6 6'], 2.2);
export const IconArrowDown = make(['M12 5v14M6 13l6 6 6-6'], 2.2);
export const IconHome = make(['M4 10.5 12 4l8 6.5V20h-5v-5.5H9V20H4z'], 1.9);
export const IconList = make(['M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01'], 1.9);
export const IconBars = make(['M5 20v-9M12 20V5M19 20v-7'], 1.9);
export const IconRefresh = make(['M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4']);
export const IconTrash = make(['M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3'], 1.9);
export const IconDownload = make(['M12 4v11M7 10l5 5 5-5M5 20h14'], 1.9);
export const IconExpand = make(['M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5'], 2);
export const IconCollapse = make(['M4 14h6v6M20 10h-6V4M14 10l6.5-6.5M10 14l-6.5 6.5'], 2);
export const IconGrip = make(['M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01'], 3.2);
export const IconLayout = make(['M4 4h16v6H4zM4 14h7v6H4zM15 14h5v6h-5z'], 1.9);
export const IconWrench = make(
  ['M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z'],
  1.9,
);
export const IconPending = make(['M20.5 12a8.5 8.5 0 1 1-4.2-7.3', 'M12 7.5V12l2.8 1.8', 'M19.5 3.5v4M19.5 10h.01'], 1.9);
export const IconGear = ({ size = 19, color = C.ink, stroke = 1.9 }: P) => (
  <Svg {...base(size, color, stroke)}>
    <Circle cx={12} cy={12} r={3} />
    <Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Svg>
);

export const IconCalendar = ({ size = 18, color = C.ink, stroke = 1.9 }: P) => (
  <Svg {...base(size, color, stroke)}>
    <Rect x={3.5} y={5} width={17} height={15} rx={3} />
    <Path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
);

export const IconClock = ({ size = 20, color = C.ink, stroke = 2 }: P) => (
  <Svg {...base(size, color, stroke)}>
    <Circle cx={12} cy={12} r={8.5} />
    <Path d="M12 7.5V12l3 2" />
  </Svg>
);

export const IconSearch = ({ size = 18, color = C.ink, stroke = 2 }: P) => (
  <Svg {...base(size, color, stroke)}>
    <Circle cx={11} cy={11} r={6.5} />
    <Path d="M20 20l-4.2-4.2" />
  </Svg>
);

export const IconHelp = ({ size = 16, color = C.ink, stroke = 2 }: P) => (
  <Svg {...base(size, color, stroke)}>
    <Circle cx={12} cy={12} r={9} />
    <Path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.2-2.5 3.8M12 17.2h.01" />
  </Svg>
);

export const IconTarget = ({ size = 20, color = C.ink, stroke = 1.9 }: P) => (
  <Svg {...base(size, color, stroke)}>
    <Circle cx={12} cy={12} r={8.5} />
    <Circle cx={12} cy={12} r={4.5} />
    <Circle cx={12} cy={12} r={0.8} />
  </Svg>
);
