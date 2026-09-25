import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Field, RadioDot, Row, Stepper, SwitchRow, T, Tap } from '@/components/ui';
import { C, F } from '@/constants/theme';
import type { Fixed } from '@/db/repo';
import { diffDays, fromISO, todayISO, weekdayOf } from '@/lib/dates';
import { cleanAmount, dots, fmt, MONTHS_SHORT, WD_ABBR, WD_FULL, WD_SHORT } from '@/lib/format';
import {
  isWeekly,
  nextOccurrences,
  perYear,
  PRESETS,
  UNITS,
  type Kind,
  type Preset,
  type Schedule,
  type Unit,
} from '@/lib/schedule';
import { useApp } from '@/state/app';

export const FIXED_CATS: Record<Kind, string[]> = {
  gasto: ['Vivienda', 'Servicios', 'Transporte', 'Salud', 'Educación', 'Mercado', 'Ocio', 'Otros'],
  ingreso: ['Salario', 'Freelance', 'Ventas', 'Inversiones', 'Otros'],
};

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

type Settings = ReturnType<typeof useApp>['settings'];

/** Borrador de un fijo nuevo con los valores por defecto de Ajustes; `date` fija el día inicial. */
export function newFixedDraft(kind: Kind, settings: Settings, date = todayISO()): FixedDraft {
  const def = settings.defs[kind];
  return {
    kind,
    name: '',
    category: kind === 'gasto' ? 'Otros' : 'Salario',
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
    category: FIXED_CATS[kind].includes(d.category) ? d.category : kind === 'gasto' ? 'Otros' : 'Salario',
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

const wrapDay = (v: number) => (v < 1 ? 31 : v > 31 ? 1 : v);

type Props = {
  d: FixedDraft;
  set: (patch: Partial<FixedDraft>) => void;
  startDate: string;
  original?: Fixed | null;
  lockAnticipated?: boolean;
  applyTo?: 'siguientes' | 'todos';
  onApplyTo?: (v: 'siguientes' | 'todos') => void;
  /** El monto se edita fuera del formulario (p. ej. en Nuevo movimiento). */
  hideAmount?: boolean;
  /** Sin nombre se usa la categoría. */
  nameOptional?: boolean;
  /** La categoría se elige fuera del formulario. */
  hideCategory?: boolean;
  accent?: string;
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
}: Props) {
  const { settings, holidays } = useApp();
  const isGasto = d.kind === 'gasto';
  const amount = Number(d.amount) || 0;
  const isCustom = d.preset === 'custom';
  const isQuincenal = d.preset === 'quincenal';
  const schedule = draftSchedule(d, startDate);
  const weekly = isWeekly(schedule);
  const py = perYear(schedule);
  const today = todayISO();
  const upcoming = nextOccurrences(schedule, today, 3, settings.holiday, holidays);
  const unit = UNITS.find((u) => u.id === d.customUnit)!;
  const unitWord = d.customN === 1 ? unit.one : unit.many;
  const cats = FIXED_CATS[d.kind].includes(d.category) ? FIXED_CATS[d.kind] : [...FIXED_CATS[d.kind], d.category];
  const firstWord = isGasto ? 'Primer cobro' : 'Primer pago';

  const stepper = (key: 'day' | 'day1' | 'day2', label: string, first: boolean) => (
    <Row key={key} style={[st.stepRow, !first && st.divider]}>
      <T w={700} size={14.5} style={{ flex: 1 }}>
        {label}
      </T>
      <Stepper
        value={String(d[key])}
        gap={14}
        minWidth={48}
        onChange={(v) => set({ [key]: Math.min(31, Math.max(1, v)) })}
        inputLabel={label}
        onDec={() => set({ [key]: wrapDay(d[key] - 1) })}
        onInc={() => set({ [key]: wrapDay(d[key] + 1) })}
        decLabel={`Restar un día a ${label.toLowerCase()}`}
        incLabel={`Sumar un día a ${label.toLowerCase()}`}
      />
    </Row>
  );

  return (
    <>
      <View style={[st.hero, { backgroundColor: isGasto ? C.hero : C.inDark }]}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} gap={12}>
          <View style={{ flex: 1, gap: 2 }}>
            <T w={700} size={13} color={isGasto ? C.heroSub : C.inSub} numberOfLines={1}>
              {d.name.trim() || (nameOptional ? d.category : 'Sin nombre')}
            </T>
            <T serif size={32} color="#FFFFFF" tabular numberOfLines={1} adjustsFontSizeToFit>
              {(d.variable ? '≈ ' : '') + fmt(amount)}
            </T>
            <T size={12.5} color={isGasto ? C.heroSub : C.inSub}>
              {isGasto ? 'por cada pago' : 'por cada ingreso'}
            </T>
          </View>
          <T w={800} size={12} color="#FFFFFF" style={[st.pill, { backgroundColor: isGasto ? C.heroTile : C.in }]}>
            {isCustom ? 'Personalizada' : PRESETS.find((p) => p.id === d.preset)!.name}
          </T>
        </Row>
        <Row gap={10}>
          <View style={[st.heroTile, { backgroundColor: isGasto ? C.heroTile : C.in }]}>
            <T w={600} size={12} color={isGasto ? C.heroSub : C.inSub}>
              Equivale al mes
            </T>
            <T w={800} size={16} color="#FFFFFF" tabular>
              ≈ {fmt((amount * py) / 12)}
            </T>
          </View>
          <View style={[st.heroTile, { backgroundColor: isGasto ? C.heroTile : C.in }]}>
            <T w={600} size={12} color={isGasto ? C.heroSub : C.inSub}>
              Pagos al año
            </T>
            <T w={800} size={16} color="#FFFFFF" tabular>
              {(Math.round(py * 10) / 10).toString().replace('.', ',')}
            </T>
          </View>
        </Row>
      </View>

      <View style={{ gap: 12 }}>
        <View style={{ gap: 6 }}>
          <T w={800} size={14}>
            Nombre
            {nameOptional && (
              <T w={500} size={14} color={C.muted}>
                {' '}
                (opcional)
              </T>
            )}
          </T>
          <Field
            value={d.name}
            onChangeText={(t) => set({ name: t.slice(0, 40) })}
            placeholder={isGasto ? 'Ej. Arriendo, gimnasio' : 'Ej. Salario, arriendo cobrado'}
          />
        </View>
        {!hideCategory && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {cats.map((c) => {
              const on = c === d.category;
              return (
                <Tap
                  key={c}
                  onPress={() => set({ category: c })}
                  style={[st.catChip, { backgroundColor: on ? accent : C.card, borderColor: on ? accent : C.line }]}>
                  <T w={700} size={13} color={on ? '#FFFFFF' : C.ink}>
                    {c}
                  </T>
                </Tap>
              );
            })}
          </ScrollView>
        )}
        {!hideAmount && (
          <View style={{ gap: 6 }}>
            <T w={800} size={14}>
              {d.variable ? 'Monto aproximado' : isGasto ? 'Monto de cada pago' : 'Monto de cada ingreso'}
            </T>
            <Row gap={6} style={st.amountRow}>
              <T serif size={22}>
                $
              </T>
              <TextInput
                value={dots(d.amount)}
                onChangeText={(t) => set({ amount: cleanAmount(t) })}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#8A847A"
                style={{ flex: 1, fontFamily: F.serif500, fontSize: 24, color: C.ink, padding: 0 }}
              />
            </Row>
          </View>
        )}
      </View>

      <View style={{ gap: 10 }}>
        <T w={800} size={16}>
          {isGasto ? '¿Cada cuánto lo pagas?' : '¿Cada cuánto lo recibes?'}
        </T>
        <View style={st.box}>
          {PRESETS.map((p, i) => {
            const sel = p.id === d.preset;
            return (
              <Tap key={p.id} onPress={() => set({ preset: p.id })} style={[st.presetRow, i > 0 && st.divider]}>
                <RadioDot on={sel} accent={accent} />
                <View style={{ flex: 1, gap: 1 }}>
                  <T w={sel ? 800 : 700} size={14.5}>
                    {p.name}
                  </T>
                  <T size={12.5} color={C.muted}>
                    {p.desc}
                  </T>
                </View>
                {p.id === settings.defs[d.kind].preset && (
                  <T w={800} size={11} color={C.muted} style={st.defTag}>
                    Por defecto
                  </T>
                )}
              </Tap>
            );
          })}
        </View>
        <View style={[st.box, { padding: 14, gap: 12, borderColor: isCustom ? accent : C.line, backgroundColor: isCustom ? C.card : '#FAF8F4' }]}>
          <Tap onPress={() => set({ preset: 'custom' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <RadioDot on={isCustom} accent={accent} />
            <View style={{ flex: 1, gap: 1 }}>
              <T w={800} size={14.5}>
                Personalizada
              </T>
              <T size={12.5} color={C.muted}>
                Tú defines cada cuánto se repite
              </T>
            </View>
          </Tap>
          <Row style={{ justifyContent: 'space-between' }}>
            <T w={700} size={14}>
              Cada
            </T>
            <Stepper
              value={String(d.customN)}
              onDec={() => set({ customN: Math.max(1, d.customN - 1), preset: 'custom' })}
              onInc={() => set({ customN: Math.min(365, d.customN + 1), preset: 'custom' })}
              decLabel="Reducir intervalo"
              incLabel="Aumentar intervalo"
            />
          </Row>
          <Row gap={4} style={st.units}>
            {UNITS.map((u) => {
              const sel = u.id === d.customUnit;
              return (
                <Tap
                  key={u.id}
                  onPress={() => set({ customUnit: u.id, preset: 'custom' })}
                  style={[st.unit, sel && { backgroundColor: isCustom ? accent : C.card }]}>
                  <T w={800} size={13} color={sel && isCustom ? '#FFFFFF' : sel ? C.ink : C.muted2}>
                    {u.label}
                  </T>
                </Tap>
              );
            })}
          </Row>
          <T w={600} size={12.5} color={C.muted}>
            {isCustom ? `Se repite cada ${d.customN} ${unitWord}` : `Toca para usar: cada ${d.customN} ${unitWord}`}
          </T>
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <T w={800} size={16}>
          {weekly ? '¿Qué día de la semana?' : isQuincenal ? '¿Qué días del mes?' : isGasto ? '¿Qué día vence?' : '¿Qué día te pagan?'}
        </T>
        {weekly ? (
          <Row gap={6}>
            {WD_SHORT.map((l, i) => {
              const sel = i === d.weekday;
              return (
                <Tap
                  key={i}
                  accessibilityLabel={WD_FULL[i]}
                  onPress={() => set({ weekday: i })}
                  style={[st.wd, { backgroundColor: sel ? accent : C.card, borderColor: sel ? accent : C.line }]}>
                  <T w={800} size={14} color={sel ? '#FFFFFF' : C.ink}>
                    {l}
                  </T>
                </Tap>
              );
            })}
          </Row>
        ) : (
          <>
            <View style={[st.box, { paddingHorizontal: 14 }]}>
              {isQuincenal
                ? [stepper('day1', firstWord, true), stepper('day2', isGasto ? 'Segundo cobro' : 'Segundo pago', false)]
                : stepper('day', isCustom && d.customUnit === 'dias' ? `${firstWord} (día)` : 'Día del mes', true)}
            </View>
            <T size={12.5} color={C.muted}>
              Si el mes es más corto, cuenta el último día del mes.
            </T>
          </>
        )}
      </View>

      <View style={{ gap: 10 }}>
        <T w={800} size={16}>
          {isGasto ? 'Próximos pagos' : 'Próximos ingresos'}
        </T>
        <View style={[st.upcoming, { backgroundColor: isGasto ? '#F6E7DC' : C.inSoft }]}>
          {upcoming.map((o, i) => {
            const dd = fromISO(o.date);
            const diff = diffDays(o.date, today);
            const when = diff === 0 ? 'Hoy' : diff === 1 ? 'Mañana' : `En ${diff} días`;
            const fg = isGasto ? '#7A3413' : C.inDark;
            return (
              <Row
                key={o.due}
                gap={12}
                style={[{ paddingVertical: 10 }, i > 0 && { borderTopWidth: 1, borderTopColor: isGasto ? '#EBCDB8' : C.inTrack2 }]}>
                <View style={st.dateBadge}>
                  <T w={800} size={16} color={fg}>
                    {dd.getDate()}
                  </T>
                  <T w={700} size={10.5} color={fg}>
                    {MONTHS_SHORT[dd.getMonth()]}
                  </T>
                </View>
                <T w={700} size={13.5} color={fg} style={{ flex: 1 }}>
                  {WD_ABBR[weekdayOf(o.date)]} {dd.getDate()} {MONTHS_SHORT[dd.getMonth()]} · {when}
                </T>
                <T w={800} size={13.5} color={fg} tabular>
                  {(d.variable ? '≈ ' : '') + fmt(amount)}
                </T>
              </Row>
            );
          })}
        </View>
      </View>

      {scheduleChanged(original, d) && onApplyTo && (
        <View style={{ gap: 10 }}>
          <T w={800} size={16}>
            ¿A qué pagos aplica el cambio?
          </T>
          <View style={st.box}>
            {(
              [
                {
                  id: 'siguientes',
                  name: 'Solo a los siguientes',
                  desc: 'Los pagos anteriores conservan su fecha y monto.',
                },
                {
                  id: 'todos',
                  name: 'A todos, también los anteriores',
                  desc: 'Úsalo para corregir un error al crearlo.',
                },
              ] as const
            ).map((o, i) => (
              <Tap key={o.id} onPress={() => onApplyTo(o.id)} style={[st.presetRow, i > 0 && st.divider]}>
                <RadioDot on={applyTo === o.id} accent={accent} />
                <View style={{ flex: 1, gap: 1 }}>
                  <T w={applyTo === o.id ? 800 : 700} size={14.5}>
                    {o.name}
                  </T>
                  <T size={12.5} color={C.muted}>
                    {o.desc}
                  </T>
                </View>
              </Tap>
            ))}
          </View>
        </View>
      )}

      <View style={{ gap: 10 }}>
        <T w={800} size={16}>
          Opciones
        </T>
        <View style={[st.box, { paddingHorizontal: 14 }]}>
          <SwitchRow
            first
            accent={accent}
            label="Monto variable"
            desc={
              isGasto
                ? 'El valor cambia cada vez, como los servicios. Te pediremos confirmarlo.'
                : 'El valor cambia cada vez, como comisiones. Te pediremos confirmarlo.'
            }
            on={d.variable}
            onPress={() => set({ variable: !d.variable })}
          />
          <SwitchRow
            accent={accent}
            label={isGasto ? 'Pago anticipado' : 'Ingreso anticipado'}
            desc={
              lockAnticipated
                ? `Ya tiene ${isGasto ? 'pagos' : 'ingresos'} registrados, así que no se puede cambiar.`
                : d.anticipated
                ? isGasto
                  ? 'Lo pagas desde este periodo.'
                  : 'Lo recibes desde este periodo.'
                : isGasto
                  ? 'Pago vencido: lo pagas desde el periodo siguiente.'
                  : 'Ingreso vencido: lo recibes desde el periodo siguiente.'
            }
            help={
              isGasto
                ? '• Anticipado: pagas antes de usar el servicio, como el arriendo. El primer pago es en este periodo.\n• Vencido (apagado): pagas después de usarlo, como los servicios públicos. El primer pago llega el periodo siguiente.'
                : '• Anticipado: te pagan al comenzar el periodo. El primer ingreso llega en este periodo.\n• Vencido (apagado): te pagan cuando el periodo termina, como un salario mes vencido. El primer ingreso llega el periodo siguiente.'
            }
            on={d.anticipated}
            disabled={lockAnticipated}
            onPress={() => set({ anticipated: !d.anticipated })}
          />
          <SwitchRow
            accent={accent}
            label={isGasto ? 'Registrar al marcar pagado' : 'Registrar al marcar recibido'}
            desc="Crea el movimiento automáticamente en tu lista del mes."
            on={d.autoMove}
            onPress={() => set({ autoMove: !d.autoMove })}
          />
          <SwitchRow
            accent={accent}
            label="Recordatorio"
            desc={isGasto ? 'Te avisamos antes de que venza.' : 'Te avisamos si no llega en la fecha esperada.'}
            on={d.remind}
            onPress={() => set({ remind: !d.remind })}
          />
          {d.remind && (
            <Row style={[st.stepRow, st.divider]}>
              <T w={700} size={14.5} style={{ flex: 1 }}>
                Avisar con
              </T>
              <Stepper
                minWidth={96}
                value={d.remindDays === 0 ? 'El mismo día' : d.remindDays === 1 ? '1 día antes' : `${d.remindDays} días antes`}
                onDec={() => set({ remindDays: Math.max(0, d.remindDays - 1) })}
                onInc={() => set({ remindDays: Math.min(7, d.remindDays + 1) })}
                decLabel="Menos días de anticipación"
                incLabel="Más días de anticipación"
              />
            </Row>
          )}
        </View>
      </View>
    </>
  );
}

const st = StyleSheet.create({
  hero: { borderRadius: 24, padding: 20, gap: 16 },
  heroTile: { flex: 1, borderRadius: 16, padding: 12, gap: 4 },
  pill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' },
  catChip: { height: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, justifyContent: 'center' },
  amountRow: {
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
    paddingHorizontal: 14,
  },
  box: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 18 },
  presetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, minHeight: 56 },
  divider: { borderTopWidth: 1, borderTopColor: C.divider },
  defTag: { backgroundColor: C.chip, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, overflow: 'hidden' },
  units: { backgroundColor: C.segBg, borderRadius: 12, padding: 4 },
  unit: { flex: 1, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  wd: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepRow: { paddingVertical: 10, gap: 12 },
  upcoming: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 4 },
  dateBadge: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#FFFFFFAA', alignItems: 'center', justifyContent: 'center' },
});
