import { useEffect, useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { Field, Label, RadioDot, Row, Stack, Stepper, SwitchRow, T, Tap, useScrollIntoView } from '@/components/ui';
import { C } from '@/constants/theme';
import type { Fixed } from '@/db/repo';
import { t, tList } from '@/i18n';
import { diffDays, fromISO, monthShort, todayISO, weekdayAbbr, weekdayInitials, weekdayName, weekdayOf } from '@/lib/dates';
import { APPROX, cleanAmount, decimal, dots, fmt, joinMeta } from '@/lib/format';
import {
  isWeekly,
  nextOccurrences,
  perYear,
  presetDesc,
  presetName,
  PRESETS,
  unitLabel,
  UNITS,
  unitWord,
  type Kind,
  type Preset,
  type Schedule,
  type Unit,
} from '@/lib/schedule';
import { useApp } from '@/state/app';
import { common, layout } from '@/styles/common';

import { styles as st } from './fixed-form.styles';

/** Categorías sugeridas para un fijo del tipo dado. */
export const fixedCategories = (kind: Kind) => tList(`categories.fixed.${kind}`);

const defaultCategory = (kind: Kind) => t(`categories.fixedDefault.${kind}`);

export type FixedDraft = {
  kind: Kind;
  name: string;
  category: string;
  amount: string;
  preset: Preset;
  day: number;
  day1: number;
  day2: number;
  weekday: number;
  customN: number;
  customUnit: Unit;
  anticipated: boolean;
  variable: boolean;
  autoMove: boolean;
  remind: boolean;
  remindDays: number;
};

export type ApplyTo = 'siguientes' | 'todos';

type Settings = ReturnType<typeof useApp>['settings'];

/** Borrador de un fijo nuevo con los valores por defecto de Ajustes; `date` fija el día inicial. */
export function newFixedDraft(kind: Kind, settings: Settings, date = todayISO()): FixedDraft {
  const def = settings.defs[kind];
  return {
    kind,
    name: '',
    category: defaultCategory(kind),
    amount: '',
    preset: def.preset,
    day: fromISO(date).getDate(),
    day1: 15,
    day2: 30,
    weekday: weekdayOf(date),
    customN: def.n,
    customUnit: def.unit,
    anticipated: true,
    variable: false,
    autoMove: true,
    remind: true,
    remindDays: 2,
  };
}

export function draftFromFixed(f: Fixed): FixedDraft {
  return {
    kind: f.type,
    name: f.name,
    category: f.category,
    amount: String(f.amount),
    preset: f.preset,
    day: f.day,
    day1: f.day1,
    day2: f.day2,
    weekday: f.weekday,
    customN: f.custom_n,
    customUnit: f.custom_unit,
    anticipated: !!f.anticipated,
    variable: !!f.variable,
    autoMove: !!f.auto_move,
    remind: !!f.remind,
    remindDays: f.remind_days,
  };
}

/** Cambio de tipo: en un fijo nuevo también toma la frecuencia por defecto de ese tipo. */
export function kindPatch(d: FixedDraft, kind: Kind, isNew: boolean, settings: Settings): Partial<FixedDraft> {
  const patch: Partial<FixedDraft> = {
    kind,
    category: fixedCategories(kind).includes(d.category) ? d.category : defaultCategory(kind),
  };
  if (isNew) {
    const def = settings.defs[kind];
    Object.assign(patch, { preset: def.preset, customN: def.n, customUnit: def.unit });
  }
  return patch;
}

export const draftSchedule = (d: FixedDraft, startDate: string): Schedule => ({
  preset: d.preset,
  day: d.day,
  day1: d.day1,
  day2: d.day2,
  weekday: d.weekday,
  custom_n: d.customN,
  custom_unit: d.customUnit,
  anticipated: d.anticipated ? 1 : 0,
  start_date: startDate,
  end_date: null,
});

/** Columnas de `fixed` (sin start_date) a partir del borrador. */
export const draftValues = (d: FixedDraft, name = d.name.trim()) => ({
  type: d.kind,
  name,
  category: d.category,
  amount: Number(d.amount) || 0,
  preset: d.preset,
  day: d.day,
  day1: d.day1,
  day2: d.day2,
  weekday: d.weekday,
  custom_n: d.customN,
  custom_unit: d.customUnit,
  anticipated: d.anticipated ? 1 : 0,
  variable: d.variable ? 1 : 0,
  auto_move: d.autoMove ? 1 : 0,
  remind: d.remind ? 1 : 0,
  remind_days: d.remindDays,
});

// Cambios que afectan fechas o montos: preguntamos si también reescriben los pagos anteriores.
export const scheduleChanged = (original: Fixed | null, d: FixedDraft) =>
  !!original &&
  (original.amount !== (Number(d.amount) || 0) ||
    original.preset !== d.preset ||
    original.day !== d.day ||
    original.day1 !== d.day1 ||
    original.day2 !== d.day2 ||
    original.weekday !== d.weekday ||
    original.custom_n !== d.customN ||
    original.custom_unit !== d.customUnit);

export const fixedAccent = (kind: Kind) => (kind === 'gasto' ? C.ink : C.in);

const clampDay = (v: number) => Math.min(31, Math.max(1, v));

const APPLY_OPTIONS: ApplyTo[] = ['siguientes', 'todos'];

/** "Hoy", "Mañana" o "En 5 días". */
const inDays = (diff: number) =>
  diff === 0 ? t('common.today') : diff === 1 ? t('common.tomorrow') : t('fixedForm.inDays', { count: diff });

const remindLabel = (days: number) => (days === 0 ? t('fixedForm.remind.sameDay') : t('fixedForm.remind.daysBefore', { count: days }));

/** Bloques del formulario, en el orden en que se dibujan. El día de pago va dentro de `frequency`. */
export type FixedSection = 'summary' | 'info' | 'frequency' | 'upcoming' | 'applyTo' | 'options';

const ALL_SECTIONS: FixedSection[] = ['summary', 'info', 'frequency', 'upcoming', 'applyTo', 'options'];

/** Las filas de periodicidad se deslizan cuando el selector de día se abre o se cierra. */
const SLIDE_MS = 260;
const SLIDE = LinearTransition.duration(SLIDE_MS);

type Props = {
  d: FixedDraft;
  set: (patch: Partial<FixedDraft>) => void;
  startDate: string;
  original?: Fixed | null;
  lockAnticipated?: boolean;
  applyTo?: ApplyTo;
  onApplyTo?: (v: ApplyTo) => void;
  /** El monto se edita fuera del formulario (p. ej. en Nuevo movimiento). */
  hideAmount?: boolean;
  /** Sin nombre se usa la categoría. */
  nameOptional?: boolean;
  /** La categoría se elige fuera del formulario. */
  hideCategory?: boolean;
  accent?: string;
  /** Solo dibuja estos bloques (p. ej. un paso del asistente de Nuevo movimiento). */
  sections?: FixedSection[];
};

/** Secciones del formulario de un fijo: resumen, datos, frecuencia, días, próximos pagos y opciones. */
export function FixedForm({
  d,
  set,
  startDate,
  original = null,
  lockAnticipated = false,
  applyTo = 'siguientes',
  onApplyTo,
  hideAmount,
  nameOptional,
  hideCategory,
  accent = fixedAccent(d.kind),
  sections = ALL_SECTIONS,
}: Props) {
  const { settings, holidays } = useApp();
  const show = (s: FixedSection) => sections.includes(s);
  const scrollIntoView = useScrollIntoView();
  // Periodicidad elegida (fila + selector de día): se centra en pantalla al cambiarla.
  // Una ref fija por opción: Animated.View solo entrega la ref al montarse, así que no sirve moverla entre filas.
  const [presetViews] = useState(() => new Map<Preset, View | null>());
  const presetRef = (id: Preset) => (v: View | null) => {
    presetViews.set(id, v);
  };
  const shownPreset = useRef(d.preset);

  useEffect(() => {
    if (shownPreset.current === d.preset) return;
    shownPreset.current = d.preset;
    // Espera a que termine el despliegue para medir la posición final.
    const timer = setTimeout(() => scrollIntoView(presetViews.get(d.preset) ?? null), SLIDE_MS + 40);
    return () => clearTimeout(timer);
  }, [d.preset, presetViews, scrollIntoView]);
  const kind = d.kind;
  const isGasto = kind === 'gasto';
  const amount = Number(d.amount) || 0;
  const isCustom = d.preset === 'custom';
  const isQuincenal = d.preset === 'quincenal';
  const schedule = draftSchedule(d, startDate);
  const weekly = isWeekly(schedule);
  const py = perYear(schedule);
  const today = todayISO();
  const upcoming = nextOccurrences(schedule, today, 3, settings.holiday, holidays);
  const categories = fixedCategories(kind);
  const cats = categories.includes(d.category) ? categories : [...categories, d.category];
  const heroSub = isGasto ? C.heroSub : C.inSub;
  const heroTile = [st.heroTile, isGasto ? st.heroTileOut : st.heroTileIn];
  const upcomingFg = isGasto ? C.outPanelText : C.inDark;
  const amountText = (d.variable ? APPROX : '') + fmt(amount);
  const every = { n: d.customN, unit: unitWord(d.customUnit, d.customN) };

  const dayQuestion = weekly
    ? t('fixedForm.day.weekdayQuestion')
    : isQuincenal
      ? t('fixedForm.day.twoDaysQuestion')
      : t(`fixedForm.day.question.${kind}`);

  const dayHelp = t(`fixedForm.help.day.${weekly ? 'weekday' : isQuincenal ? 'twoDays' : 'month'}`);

  const anticipatedDesc = lockAnticipated
    ? t(`fixedForm.options.anticipatedLocked.${kind}`)
    : d.anticipated
      ? t(`fixedForm.options.anticipatedOn.${kind}`)
      : t(`fixedForm.options.anticipatedOff.${kind}`);

  const stepper = (key: 'day' | 'day1' | 'day2', label: string, first: boolean) => (
    <Row key={key} style={[st.stepRow, !first && common.divider]}>
      <T w={700} size={14.5} style={layout.fill}>
        {label}
      </T>
      <Stepper
        value={String(d[key])}
        minWidth={48}
        onChange={(v) => set({ [key]: clampDay(v) })}
        inputLabel={label}
        onDec={() => set({ [key]: clampDay(d[key] - 1) })}
        onInc={() => set({ [key]: clampDay(d[key] + 1) })}
        decLabel={t('fixedForm.day.decrease', { label: label.toLowerCase() })}
        incLabel={t('fixedForm.day.increase', { label: label.toLowerCase() })}
      />
    </Row>
  );

  const firstLabel = t(`fixedForm.day.first.${kind}`);
  const dayStepper = isQuincenal
    ? [stepper('day1', firstLabel, true), stepper('day2', t(`fixedForm.day.second.${kind}`), false)]
    : stepper(
        'day',
        isCustom && d.customUnit === 'dias' ? t('fixedForm.day.firstDay', { label: firstLabel }) : t('fixedForm.day.ofMonth'),
        true,
      );

  // Se despliega debajo de la periodicidad elegida para no tener que bajar a buscarlo.
  const dayPicker = (
    <Animated.View key={`${d.preset}-${weekly}`} entering={FadeInDown.duration(SLIDE_MS)} style={st.dayPanel}>
      <Label text={dayQuestion} help={dayHelp} size={13.5} />
      {weekly ? (
        <Row gap={6}>
          {weekdayInitials().map((l, i) => {
            const sel = i === d.weekday;
            return (
              <Tap
                key={i}
                accessibilityLabel={weekdayName(i)}
                accessibilityState={{ selected: sel }}
                onPress={() => set({ weekday: i })}
                style={[st.wd, { backgroundColor: sel ? accent : C.card, borderColor: sel ? accent : C.line }]}>
                <T w={800} size={14} color={sel ? C.white : C.ink}>
                  {l}
                </T>
              </Tap>
            );
          })}
        </Row>
      ) : (
        <>
          <View style={[common.box, common.boxPadded]}>{dayStepper}</View>
          <T size={12.5} color={C.muted}>
            {t('fixedForm.day.shortMonthHint')}
          </T>
        </>
      )}
    </Animated.View>
  );

  return (
    <>
      {show('summary') && (
        <View style={[st.hero, isGasto ? st.heroOut : st.heroIn]}>
          <Row style={layout.betweenStart} gap={12}>
            <Stack gap={2} style={layout.fill}>
              <T w={700} size={13} color={heroSub} numberOfLines={1}>
                {d.name.trim() || (nameOptional ? d.category : t('fixedForm.unnamed'))}
              </T>
              <T serif size={32} color={C.white} tabular numberOfLines={1} adjustsFontSizeToFit>
                {amountText}
              </T>
              <T size={12.5} color={heroSub}>
                {t(`fixedForm.perEach.${kind}`)}
              </T>
            </Stack>
            <T w={800} size={12} color={C.white} style={[st.pill, isGasto ? st.heroTileOut : st.heroTileIn]}>
              {presetName(d.preset)}
            </T>
          </Row>
          <Row gap={10}>
            <View style={heroTile}>
              <T w={600} size={12} color={heroSub}>
                {t('fixedForm.monthlyEquivalent')}
              </T>
              <T w={800} size={16} color={C.white} tabular>
                {APPROX + fmt((amount * py) / 12)}
              </T>
            </View>
            <View style={heroTile}>
              <T w={600} size={12} color={heroSub}>
                {t('fixedForm.perYear')}
              </T>
              <T w={800} size={16} color={C.white} tabular>
                {decimal(py)}
              </T>
            </View>
          </Row>
        </View>
      )}

      {show('info') && (
        <Stack gap={12}>
          <Stack gap={6}>
            <Label
              text={t('fixedForm.name')}
              optional={nameOptional}
              help={
                nameOptional
                  ? `${t(`fixedForm.help.name.${kind}`)} ${t('fixedForm.help.nameOptional')}`
                  : t(`fixedForm.help.name.${kind}`)
              }
            />
            <Field
              value={d.name}
              onChangeText={(text) => set({ name: text.slice(0, 40) })}
              placeholder={t(`fixedForm.namePlaceholder.${kind}`)}
            />
          </Stack>
          {!hideCategory && (
            <Stack gap={6}>
              <Label text={t('fixedForm.category')} help={t('fixedForm.help.category')} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.catList}>
                {cats.map((c) => {
                  const on = c === d.category;
                  return (
                    <Tap
                      key={c}
                      onPress={() => set({ category: c })}
                      accessibilityState={{ selected: on }}
                      style={[st.catChip, { backgroundColor: on ? accent : C.card, borderColor: on ? accent : C.line }]}>
                      <T w={700} size={13} color={on ? C.white : C.ink}>
                        {c}
                      </T>
                    </Tap>
                  );
                })}
              </ScrollView>
            </Stack>
          )}
          {!hideAmount && (
            <Stack gap={6}>
              <Label
                text={d.variable ? t('fixedForm.amountApprox') : t(`fixedForm.amountEach.${kind}`)}
                help={t(`fixedForm.help.amount.${kind}`)}
              />
              <Row gap={6} style={st.amountRow}>
                <T serif size={22}>
                  $
                </T>
                <TextInput
                  value={dots(d.amount)}
                  onChangeText={(text) => set({ amount: cleanAmount(text) })}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={C.placeholder}
                  style={st.amountInput}
                />
              </Row>
            </Stack>
          )}
        </Stack>
      )}

      {show('frequency') && (
        <Stack gap={10}>
          <Label text={t(`fixedForm.frequencyQuestion.${kind}`)} help={t('fixedForm.help.frequency')} size={16} />
          <Animated.View layout={SLIDE} style={common.box}>
            {PRESETS.map((p, i) => {
              const sel = p.id === d.preset;
              return (
                <Animated.View key={p.id} ref={presetRef(p.id)} layout={SLIDE} style={i > 0 && common.divider}>
                  <Tap onPress={() => set({ preset: p.id })} style={st.presetRow}>
                    <RadioDot on={sel} accent={accent} />
                    <Stack gap={1} style={layout.fill}>
                      <T w={sel ? 800 : 700} size={14.5}>
                        {presetName(p.id)}
                      </T>
                      <T size={12.5} color={C.muted}>
                        {presetDesc(p.id)}
                      </T>
                    </Stack>
                    {p.id === settings.defs[kind].preset && (
                      <T w={800} size={11} color={C.muted} style={st.defTag}>
                        {t('fixedForm.default')}
                      </T>
                    )}
                  </Tap>
                  {sel && <View style={st.dayPanelWrap}>{dayPicker}</View>}
                </Animated.View>
              );
            })}
          </Animated.View>
          <Animated.View
            ref={presetRef('custom')}
            layout={SLIDE}
            style={[common.box, st.customBox, isCustom ? { borderColor: accent } : st.customBoxOff]}>
            <Tap onPress={() => set({ preset: 'custom' })} style={st.customHead}>
              <RadioDot on={isCustom} accent={accent} />
              <Stack gap={1} style={layout.fill}>
                <Label text={presetName('custom')} help={t('fixedForm.help.custom')} size={14.5} />
                <T size={12.5} color={C.muted}>
                  {presetDesc('custom')}
                </T>
              </Stack>
            </Tap>
            <Row style={layout.between}>
              <T w={700} size={14}>
                {t('fixedForm.every')}
              </T>
              <Stepper
                value={String(d.customN)}
                onDec={() => set({ customN: Math.max(1, d.customN - 1), preset: 'custom' })}
                onInc={() => set({ customN: Math.min(365, d.customN + 1), preset: 'custom' })}
                decLabel={t('fixedForm.intervalDecrease')}
                incLabel={t('fixedForm.intervalIncrease')}
              />
            </Row>
            <Row gap={4} style={st.units}>
              {UNITS.map((u) => {
                const sel = u === d.customUnit;
                return (
                  <Tap
                    key={u}
                    onPress={() => set({ customUnit: u, preset: 'custom' })}
                    accessibilityState={{ selected: sel }}
                    style={[st.unit, sel && (isCustom ? { backgroundColor: accent } : st.unitOn)]}>
                    <T w={800} size={13} color={sel && isCustom ? C.white : sel ? C.ink : C.muted2}>
                      {unitLabel(u)}
                    </T>
                  </Tap>
                );
              })}
            </Row>
            <T w={600} size={12.5} color={C.muted}>
              {isCustom ? t('fixedForm.repeats', every) : t('fixedForm.tapToUse', every)}
            </T>
            {isCustom && dayPicker}
          </Animated.View>
        </Stack>
      )}

      {show('upcoming') && (
        <Stack gap={10}>
          <Label text={t(`fixedForm.upcoming.${kind}`)} help={t('fixedForm.help.upcoming')} size={16} />
          <View style={[st.upcoming, isGasto ? st.upcomingOut : st.upcomingIn]}>
            {upcoming.map((o, i) => {
              const dd = fromISO(o.date);
              const month = monthShort(dd.getMonth());
              return (
                <Row
                  key={o.due}
                  gap={12}
                  style={[st.upcomingRow, i > 0 && (isGasto ? st.upcomingDividerOut : st.upcomingDividerIn)]}>
                  <View style={st.dateBadge}>
                    <T w={800} size={16} color={upcomingFg}>
                      {dd.getDate()}
                    </T>
                    <T w={700} size={10.5} color={upcomingFg}>
                      {month}
                    </T>
                  </View>
                  <T w={700} size={13.5} color={upcomingFg} style={layout.fill}>
                    {joinMeta(
                      t('fixedForm.upcomingDate', { weekday: weekdayAbbr(weekdayOf(o.date)), day: dd.getDate(), month }),
                      inDays(diffDays(o.date, today)),
                    )}
                  </T>
                  <T w={800} size={13.5} color={upcomingFg} tabular>
                    {amountText}
                  </T>
                </Row>
              );
            })}
          </View>
        </Stack>
      )}

      {show('applyTo') && scheduleChanged(original, d) && onApplyTo && (
        <Stack gap={10}>
          <Label text={t('fixedForm.applyTo.title')} help={t('fixedForm.help.applyTo')} size={16} />
          <View style={common.box}>
            {APPLY_OPTIONS.map((id, i) => (
              <Tap key={id} onPress={() => onApplyTo(id)} style={[st.presetRow, i > 0 && common.divider]}>
                <RadioDot on={applyTo === id} accent={accent} />
                <Stack gap={1} style={layout.fill}>
                  <T w={applyTo === id ? 800 : 700} size={14.5}>
                    {t(`fixedForm.applyTo.${id}.name`)}
                  </T>
                  <T size={12.5} color={C.muted}>
                    {t(`fixedForm.applyTo.${id}.desc`)}
                  </T>
                </Stack>
              </Tap>
            ))}
          </View>
        </Stack>
      )}

      {show('options') && (
        <Stack gap={10}>
          <T w={800} size={16}>
            {t('fixedForm.options.title')}
          </T>
          <View style={[common.box, common.boxPadded]}>
            <SwitchRow
              first
              accent={accent}
              label={t('fixedForm.options.variable')}
              desc={t(`fixedForm.options.variableDesc.${kind}`)}
              help={t(`fixedForm.help.variable.${kind}`)}
              on={d.variable}
              onPress={() => set({ variable: !d.variable })}
            />
            <SwitchRow
              accent={accent}
              label={t(`fixedForm.options.anticipated.${kind}`)}
              desc={anticipatedDesc}
              help={t(`fixedForm.options.anticipatedHelp.${kind}`)}
              on={d.anticipated}
              disabled={lockAnticipated}
              onPress={() => set({ anticipated: !d.anticipated })}
            />
            <SwitchRow
              accent={accent}
              label={t(`fixedForm.options.autoMove.${kind}`)}
              desc={t('fixedForm.options.autoMoveDesc')}
              help={t(`fixedForm.help.autoMove.${kind}`)}
              on={d.autoMove}
              onPress={() => set({ autoMove: !d.autoMove })}
            />
            <SwitchRow
              accent={accent}
              label={t('fixedForm.options.remind')}
              desc={t(`fixedForm.options.remindDesc.${kind}`)}
              help={t(`fixedForm.help.remind.${kind}`)}
              on={d.remind}
              onPress={() => set({ remind: !d.remind })}
            />
            {d.remind && (
              <Row style={[st.stepRow, common.divider]}>
                <Label
                  text={t('fixedForm.remind.label')}
                  help={t('fixedForm.help.remindDays')}
                  w={700}
                  size={14.5}
                  style={layout.fill}
                />
                <Stepper
                  minWidth={96}
                  value={remindLabel(d.remindDays)}
                  onDec={() => set({ remindDays: Math.max(0, d.remindDays - 1) })}
                  onInc={() => set({ remindDays: Math.min(7, d.remindDays + 1) })}
                  decLabel={t('fixedForm.remind.decrease')}
                  incLabel={t('fixedForm.remind.increase')}
                />
              </Row>
            )}
          </View>
        </Stack>
      )}
    </>
  );
}
