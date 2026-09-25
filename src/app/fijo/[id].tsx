import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconTrash } from '@/components/icons';
import {
  Field,
  Header,
  PrimaryButton,
  RadioDot,
  Row,
  Screen,
  Segmented,
  Stepper,
  SwitchRow,
  T,
  Tap,
} from '@/components/ui';
import { C, F } from '@/constants/theme';
import { endFixed, getFixed, insertFixed, updateFixed, type Fixed } from '@/db/repo';
import { diffDays, fromISO, periodRange, todayISO, weekdayOf } from '@/lib/dates';
import { cleanAmount, dots, fmt, MONTHS_SHORT, WD_ABBR, WD_FULL, WD_SHORT } from '@/lib/format';
import {
  describeSchedule,
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

const CATS: Record<Kind, string[]> = {
  gasto: ['Vivienda', 'Servicios', 'Transporte', 'Salud', 'Educación', 'Mercado', 'Ocio', 'Otros'],
  ingreso: ['Salario', 'Freelance', 'Ventas', 'Inversiones', 'Otros'],
};

type Draft = {
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

const wrapDay = (v: number) => (v < 1 ? 31 : v > 31 ? 1 : v);

export default function EditarFijo() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { settings, currentPeriod, bump, holidays } = useApp();
  const { id, kind: kindParam } = useLocalSearchParams<{ id: string; kind?: string }>();
  const isNew = id === 'nuevo';

  const [original, setOriginal] = useState<Fixed | null>(null);
  const [d, setD] = useState<Draft>(() => {
    const kind: Kind = kindParam === 'ingreso' ? 'ingreso' : 'gasto';
    const def = settings.defs[kind];
    const today = todayISO();
    return {
      kind,
      name: '',
      category: kind === 'gasto' ? 'Otros' : 'Salario',
      amount: '',
      preset: def.preset,
      day: fromISO(today).getDate(),
      day1: 15,
      day2: 30,
      weekday: weekdayOf(today),
      customN: def.n,
      customUnit: def.unit,
      anticipated: true,
      variable: false,
      autoMove: true,
      remind: true,
      remindDays: 2,
    };
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [applyTo, setApplyTo] = useState<'siguientes' | 'todos'>('siguientes');

  useEffect(() => {
    if (isNew) return;
    getFixed(db, Number(id)).then((f) => {
      if (!f) return;
      setOriginal(f);
      setD({
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
      });
    });
  }, [db, id, isNew]);

  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));
  const isGasto = d.kind === 'gasto';
  const accent = isGasto ? C.ink : C.in;
  const amount = Number(d.amount) || 0;
  const isCustom = d.preset === 'custom';
  const isQuincenal = d.preset === 'quincenal';

  const schedule: Schedule = {
    preset: d.preset,
    day: d.day,
    day1: d.day1,
    day2: d.day2,
    weekday: d.weekday,
    custom_n: d.customN,
    custom_unit: d.customUnit,
    anticipated: d.anticipated ? 1 : 0,
    start_date: original?.start_date ?? periodRange(currentPeriod, settings.monthStart).from,
    end_date: null,
  };
  const weekly = isWeekly(schedule);
  const py = perYear(schedule);
  const today = todayISO();
  const upcoming = nextOccurrences(schedule, today, 3, settings.holiday, holidays);
  const unit = UNITS.find((u) => u.id === d.customUnit)!;
  const unitWord = d.customN === 1 ? unit.one : unit.many;
  const cantSave = amount <= 0 || !d.name.trim();
  const cats = CATS[d.kind].includes(d.category) ? CATS[d.kind] : [...CATS[d.kind], d.category];
  // Cambios que afectan fechas o montos: preguntamos si también reescriben los pagos anteriores.
  const scheduleChanged =
    !!original &&
    (original.amount !== amount ||
      original.preset !== d.preset ||
      original.day !== d.day ||
      original.day1 !== d.day1 ||
      original.day2 !== d.day2 ||
      original.weekday !== d.weekday ||
      original.custom_n !== d.customN ||
      original.custom_unit !== d.customUnit);

  const pickKind = (kind: Kind) => {
    if (kind === d.kind) return;
    const patch: Partial<Draft> = { kind, category: CATS[kind].includes(d.category) ? d.category : kind === 'gasto' ? 'Otros' : 'Salario' };
    if (isNew) {
      const def = settings.defs[kind];
      Object.assign(patch, { preset: def.preset, customN: def.n, customUnit: def.unit });
    }
    set(patch);
  };

  const save = async () => {
    if (cantSave) return;
    const values = {
      type: d.kind,
      name: d.name.trim(),
      category: d.category,
      amount,
      preset: d.preset,
      day: d.day,
      day1: d.day1,
      day2: d.day2,
      weekday: d.weekday,
      custom_n: d.customN,
      custom_unit: d.customUnit,
      anticipated: schedule.anticipated,
      variable: d.variable ? 1 : 0,
      auto_move: d.autoMove ? 1 : 0,
      remind: d.remind ? 1 : 0,
      remind_days: d.remindDays,
    };
    if (isNew) await insertFixed(db, { ...values, start_date: schedule.start_date });
    else await updateFixed(db, Number(id), values, scheduleChanged ? applyTo : 'siguientes');
    bump();
    router.back();
  };

  const doDelete = async () => {
    await endFixed(db, Number(id));
    bump();
    router.back();
  };

  const stepper = (key: 'day' | 'day1' | 'day2', label: string, first: boolean) => (
    <Row key={key} style={[st.stepRow, !first && st.divider]}>
      <T w={700} size={14.5} style={{ flex: 1 }}>
        {label}
      </T>
      <Stepper
        value={String(d[key])}
        onDec={() => set({ [key]: wrapDay(d[key] - 1) })}
        onInc={() => set({ [key]: wrapDay(d[key] + 1) })}
        decLabel={`Restar un día a ${label.toLowerCase()}`}
        incLabel={`Sumar un día a ${label.toLowerCase()}`}
      />
    </Row>
  );
  const firstWord = isGasto ? 'Primer cobro' : 'Primer pago';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Screen bottom={130}>
        <Header
          onBack={() => router.back()}
          kicker={isGasto ? 'Gasto fijo' : 'Ingreso fijo'}
          title={isNew ? 'Nuevo fijo' : 'Editar fijo'}
        />

        <Segmented
          options={[
            { id: 'gasto', label: 'Gasto' },
            { id: 'ingreso', label: 'Ingreso', activeFg: C.inDark },
          ]}
          value={d.kind}
          onChange={pickKind}
        />

        <View style={[st.hero, { backgroundColor: isGasto ? C.hero : C.inDark }]}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} gap={12}>
            <View style={{ flex: 1, gap: 2 }}>
              <T w={700} size={13} color={isGasto ? C.heroSub : C.inSub} numberOfLines={1}>
                {d.name.trim() || 'Sin nombre'}
              </T>
              <T serif size={32} color="#FFFFFF" tabular>
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
            </T>
            <Field
              value={d.name}
              onChangeText={(t) => set({ name: t.slice(0, 40) })}
              placeholder={isGasto ? 'Ej. Arriendo, gimnasio' : 'Ej. Salario, arriendo cobrado'}
            />
          </View>
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

        {scheduleChanged && (
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
                <Tap key={o.id} onPress={() => setApplyTo(o.id)} style={[st.presetRow, i > 0 && st.divider]}>
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
                d.anticipated
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

        {!isNew && !confirmDelete && (
          <Tap onPress={() => setConfirmDelete(true)} style={st.deleteBtn}>
            <IconTrash color={C.danger} />
            <T w={800} size={14.5} color={C.danger}>
              {isGasto ? 'Eliminar gasto fijo' : 'Eliminar ingreso fijo'}
            </T>
          </Tap>
        )}
        {confirmDelete && (
          <View style={st.confirm} accessibilityRole="alert">
            <T w={800} size={15}>
              ¿Eliminar {d.name.trim() || 'este fijo'}?
            </T>
            <T size={13} color={C.muted2}>
              Los pagos ya registrados se quedan en tu historial. Solo dejará de repetirse.
            </T>
            <Row gap={8}>
              <Tap onPress={() => setConfirmDelete(false)} style={[st.confirmBtn, { backgroundColor: C.card, borderWidth: 1, borderColor: C.line }]}>
                <T w={800} size={14}>
                  Cancelar
                </T>
              </Tap>
              <Tap onPress={doDelete} style={[st.confirmBtn, { backgroundColor: C.danger }]}>
                <T w={800} size={14} color="#FFFFFF">
                  Eliminar
                </T>
              </Tap>
            </Row>
          </View>
        )}
        {!isNew && original && (
          <T size={12} color={C.muted} style={{ textAlign: 'center' }}>
            Actual: {describeSchedule(original)}
          </T>
        )}
      </Screen>

      <Row gap={10} style={[st.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Tap onPress={() => router.back()} style={st.cancel}>
          <T w={800} size={15}>
            Cancelar
          </T>
        </Tap>
        <View style={{ flex: 1 }}>
          <PrimaryButton label={isNew ? 'Crear fijo' : 'Guardar cambios'} bg={accent} disabled={cantSave} onPress={save} icon={false} />
        </View>
      </Row>
    </View>
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
  deleteBtn: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: C.line,
    backgroundColor: C.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirm: { backgroundColor: C.outSoft, borderRadius: 18, padding: 16, gap: 8 },
  confirmBtn: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 14,
    paddingHorizontal: 20,
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  cancel: {
    height: 56,
    paddingHorizontal: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
