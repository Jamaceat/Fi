import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { C } from '@/constants/theme';
import { t } from '@/i18n';
import { monthAbbr, monthName, samePeriod, type Period } from '@/lib/dates';

import { IconChevronDown, IconChevronLeft, IconChevronRight } from './icons';
import { styles as st } from './month-picker.styles';
import { PrimaryButton, RoundButton, Row, Sheet, Stack, T, Tap } from './ui';

const MONTHS = Array.from({ length: 12 }, (_, m) => m);
/** Años por página en la grilla de años. */
const YEARS_PAGE = 12;
const pageOf = (year: number) => Math.floor(year / YEARS_PAGE) * YEARS_PAGE;

/**
 * Hoja para saltar a cualquier mes: el año con flechas y los 12 meses en una grilla.
 * Tocar el año cambia a una grilla de años para moverse lejos más rápido.
 */
export function MonthPicker({
  visible,
  value,
  current,
  onPick,
  onClose,
}: {
  visible: boolean;
  /** Mes que se está viendo. */
  value: Period;
  /** Mes de hoy. */
  current: Period;
  onPick: (p: Period) => void;
  onClose: () => void;
}) {
  const [year, setYear] = useState(value.year);
  const [pickingYear, setPickingYear] = useState(false);
  const [pageStart, setPageStart] = useState(pageOf(value.year));
  // Cada vez que se abre, arranca en el año del mes que se está viendo, con la grilla de meses.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setYear(value.year);
      setPickingYear(false);
    }
  }

  const openYears = () => {
    setPageStart(pageOf(year));
    setPickingYear(true);
  };
  const pickYear = (y: number) => {
    setYear(y);
    setPickingYear(false);
  };
  const years = Array.from({ length: YEARS_PAGE }, (_, i) => pageStart + i);

  return (
    <Sheet visible={visible} onClose={onClose} title={t('home.picker.title')}>
      <Stack gap={14}>
        {pickingYear ? (
          <Row style={st.years}>
            <RoundButton label={t('home.picker.prevYears')} onPress={() => setPageStart((y) => y - YEARS_PAGE)}>
              <IconChevronLeft />
            </RoundButton>
            <T serif w={600} size={22} tabular accessibilityLiveRegion="polite">
              {t('home.picker.yearRange', { from: years[0], to: years[years.length - 1] })}
            </T>
            <RoundButton label={t('home.picker.nextYears')} onPress={() => setPageStart((y) => y + YEARS_PAGE)}>
              <IconChevronRight />
            </RoundButton>
          </Row>
        ) : (
          <Row style={st.years}>
            <RoundButton label={t('calendar.prevYear')} onPress={() => setYear((y) => y - 1)}>
              <IconChevronLeft />
            </RoundButton>
            <Tap
              onPress={openYears}
              accessibilityRole="button"
              accessibilityLabel={t('home.picker.openYears', { year })}
              style={st.yearBtn}>
              <T serif w={600} size={26} tabular accessibilityLiveRegion="polite">
                {year}
              </T>
              <IconChevronDown size={16} />
            </Tap>
            <RoundButton label={t('calendar.nextYear')} onPress={() => setYear((y) => y + 1)}>
              <IconChevronRight />
            </RoundButton>
          </Row>
        )}

        {pickingYear ? (
          <Animated.View key="years" entering={FadeIn.duration(180)} style={st.grid}>
            {years.map((y) => {
              const on = y === year;
              const today = y === current.year;
              return (
                <Tap
                  key={y}
                  onPress={() => pickYear(y)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={String(y)}
                  style={[st.cell, today && st.cellToday, on && st.cellOn]}>
                  <T w={700} size={14.5} tabular color={on ? C.white : C.ink}>
                    {y}
                  </T>
                  {today && <View style={[st.todayDot, { backgroundColor: on ? C.white : C.ink }]} />}
                </Tap>
              );
            })}
          </Animated.View>
        ) : (
          <Animated.View key="months" entering={FadeIn.duration(180)} style={st.grid}>
            {MONTHS.map((month) => {
              const p = { year, month };
              const on = samePeriod(p, value);
              const today = samePeriod(p, current);
              return (
                <Tap
                  key={month}
                  onPress={() => onPick(p)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={t('calendar.a11y.month', { month: monthName(month), year })}
                  style={[st.cell, today && st.cellToday, on && st.cellOn]}>
                  <T w={700} size={14.5} color={on ? C.white : C.ink}>
                    {monthAbbr(month)}
                  </T>
                  {today && <View style={[st.todayDot, { backgroundColor: on ? C.white : C.ink }]} />}
                </Tap>
              );
            })}
          </Animated.View>
        )}

        <PrimaryButton
          label={t('calendar.goToday')}
          icon={false}
          disabled={samePeriod(value, current)}
          onPress={() => onPick(current)}
        />
      </Stack>
    </Sheet>
  );
}
