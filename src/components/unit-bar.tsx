import { C } from '@/constants/theme';
import { unitLabel, UNITS, type Unit } from '@/lib/schedule';

import { useSlidingHighlight } from './sliding-highlight';
import { Row, T, Tap } from './ui';
import { styles as st } from './unit-bar.styles';

/** Barra días/semanas/meses de la periodicidad personalizada; con `active` la elegida se rellena de `accent`. */
export function UnitBar({
  value,
  onChange,
  active,
  accent,
}: {
  value: Unit;
  onChange: (u: Unit) => void;
  active: boolean;
  accent: string;
}) {
  const fill = active ? accent : C.card;
  const hl = useSlidingHighlight({ keys: UNITS, selected: value, color: fill });
  return (
    <Row gap={4} style={st.units}>
      {hl.layer({ style: st.indicator })}
      {UNITS.map((u) => {
        const sel = u === value;
        return (
          <Tap
            key={u}
            onPress={() => onChange(u)}
            onLayout={hl.measure(u)}
            accessibilityState={{ selected: sel }}
            style={[st.unit, sel && !hl.ready && { backgroundColor: fill }]}>
            <T w={800} size={13} color={sel ? (active ? C.white : C.ink) : C.muted2}>
              {unitLabel(u)}
            </T>
          </Tap>
        );
      })}
    </Row>
  );
}
