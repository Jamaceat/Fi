import { View } from 'react-native';

import { C } from '@/constants/theme';
import { t } from '@/i18n';

import { Stack, T, Tap } from './ui';
import { styles as st } from './step-indicator.styles';

/** Barra de progreso de un asistente por pasos; los pasos ya visitados se pueden tocar para volver. */
export function StepIndicator({
  labels,
  current,
  reached,
  accent,
  onPick,
}: {
  labels: string[];
  current: number;
  /** Último paso al que se llegó: hasta ahí se puede saltar. */
  reached: number;
  accent: string;
  onPick: (i: number) => void;
}) {
  return (
    <Stack gap={10}>
      <T w={700} size={12.5} color={C.muted}>
        {t('ui.stepOf', { n: current + 1, total: labels.length })}
      </T>
      <View style={st.steps}>
        {labels.map((label, i) => {
          const on = i === current;
          const done = i <= reached;
          return (
            <Tap
              key={label}
              onPress={() => onPick(i)}
              disabled={!done || on}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: on, disabled: !done }}
              style={st.step}>
              <View
                style={[st.bar, i <= current && { backgroundColor: accent }, i > current && done && { backgroundColor: C.ring }]}
              />
              <T w={on ? 800 : 700} size={12} color={on ? C.ink : done ? C.muted : C.faint} numberOfLines={1}>
                {label}
              </T>
            </Tap>
          );
        })}
      </View>
    </Stack>
  );
}
