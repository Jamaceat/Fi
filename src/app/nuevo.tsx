import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, BackHandler, View } from 'react-native';
import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated';

import { DatePicker } from '@/components/calendar';
import { draftValues, FixedForm, kindPatch, newFixedDraft, type FixedDraft } from '@/components/fixed-form';
import { IconCalendar, IconChevronLeft, IconClose, IconTrash } from '@/components/icons';
import { clearOption, useSlidingHighlight } from '@/components/sliding-highlight';
import { StepIndicator } from '@/components/step-indicator';
import {
  AmountField,
  Field,
  Label,
  PrimaryButton,
  RoundButton,
  Row,
  Screen,
  Segmented,
  Sheet,
  Stack,
  T,
  Tap,
} from '@/components/ui';
import { C } from '@/constants/theme';
import { deleteMovement, getMovement, insertFixed, insertMovement, updateMovement, type Movement } from '@/db/repo';
import { alertNoFund, fundBalance } from '@/lib/fund';
import { t, tList } from '@/i18n';
import { fromISO, longDate, periodOf, periodRange, todayISO, weekdayOf } from '@/lib/dates';
import { cleanAmount, dots } from '@/lib/format';
import type { Kind } from '@/lib/schedule';
import { useApp } from '@/state/app';
import { common, layout } from '@/styles/common';
import { styles as st } from '@/styles/screens/nuevo.styles';

type Freq = 'ocasional' | 'fijo';

const FREQS: Freq[] = ['ocasional', 'fijo'];

/**
 * Pasos del asistente. Ocasional: monto → detalle → fecha y estado.
 * Fijo: monto → detalle → repetición (primera fecha, periodicidad, día) → resumen (próximos pagos y opciones).
 */
type StepId = 'amount' | 'details' | 'when' | 'repeat' | 'review';

const STEPS: Record<Freq, StepId[]> = {
  ocasional: ['amount', 'details', 'when'],
  fijo: ['amount', 'details', 'repeat', 'review'],
};

const categoriesOf = (kind: Kind) => tList(`categories.movement.${kind}`);
const defaultCategory = (kind: Kind) => t(`categories.movementDefault.${kind}`);

export default function Nuevo() {
  const db = useSQLiteContext();
  const { settings, bump } = useApp();
  // `date` y `kind` preseleccionan un movimiento nuevo (p. ej. desde el calendario).
  const { id, date: dateParam, kind } = useLocalSearchParams<{ id?: string; date?: string; kind?: string }>();
  const initialKind: Kind = kind === 'ingreso' ? 'ingreso' : 'gasto';
  const initialDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayISO();

  const [editing, setEditing] = useState<Movement | null>(null);
  const [tipo, setTipo] = useState<Kind>(initialKind);
  const [freq, setFreq] = useState<Freq>('ocasional');
  const [cat, setCat] = useState(() => defaultCategory(initialKind));
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(initialDate);
  const [note, setNote] = useState('');
  // Ocasional: ya pagado/recibido o pendiente.
  const [paid, setPaid] = useState(true);
  // Fijo: mismo formulario que Fijos > Agregar. Tipo y monto se comparten con esta pantalla.
  const [fx, setFx] = useState<FixedDraft>(() => newFixedDraft(initialKind, settings, initialDate));
  const [dateOpen, setDateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Asistente: paso actual, último paso alcanzado y sentido de la animación.
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [dir, setDir] = useState(1);

  useEffect(() => {
    if (!id) return;
    getMovement(db, Number(id)).then((m) => {
      if (!m) return;
      setEditing(m);
      setTipo(m.type);
      setCat(m.category);
      setAmount(String(m.amount));
      setDate(m.date);
      setNote(m.note);
      setFreq(m.fixed_id != null ? 'fijo' : 'ocasional');
      setPaid(!!m.paid);
    });
  }, [db, id]);

  const g = tipo === 'gasto';
  const accent = g ? C.out : C.in;
  const freqHl = useSlidingHighlight({ keys: FREQS, selected: freq, color: 'transparent', border: accent });
  const linked = editing?.fixed_id != null;
  const kindCats = categoriesOf(tipo);
  const cats = kindCats.includes(cat) ? kindCats : [...kindCats, cat];
  const n = Number(amount) || 0;
  const isFixed = freq === 'fijo' && !editing;
  const fxDraft: FixedDraft = { ...fx, kind: tipo, amount, category: cat };
  const setFxPatch = (patch: Partial<FixedDraft>) => setFx((prev) => ({ ...prev, ...patch }));
  // El fijo arranca en el periodo de la fecha elegida (hoy, o el día tocado en el calendario).
  const fixedStart = periodRange(periodOf(date, settings.monthStart), settings.monthStart).from;

  // Editar no usa el asistente: todo en una sola pantalla.
  const wizard = !id;
  const steps = STEPS[isFixed ? 'fijo' : 'ocasional'];
  const stepId = steps[step];
  const isLast = step === steps.length - 1;

  const goTo = (i: number) => {
    setDir(i > step ? 1 : -1);
    setStep(i);
    setReached((r) => Math.max(r, i));
  };

  // Atrás del sistema (Android) retrocede un paso antes de cerrar la pantalla.
  useEffect(() => {
    if (!wizard || step === 0) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setDir(-1);
      setStep((s) => s - 1);
      return true;
    });
    return () => sub.remove();
  }, [wizard, step]);

  const pickTipo = (next: Kind) => {
    setTipo(next);
    setCat(defaultCategory(next));
    setFx((prev) => ({ ...prev, ...kindPatch(prev, next, true, settings) }));
  };

  const pickFreq = (next: Freq) => {
    setFreq(next);
    // Cambian los pasos siguientes: hay que recorrerlos de nuevo.
    setReached(0);
  };

  const pickDate = (iso: string) => {
    setDate(iso);
    // En un fijo, la fecha elegida también marca el día en que se repite.
    const dd = fromISO(iso);
    setFxPatch({ day: dd.getDate(), day1: dd.getDate(), weekday: weekdayOf(iso) });
    setDateOpen(false);
  };

  const save = async () => {
    if (n <= 0 || saving) return;
    setSaving(true);
    const name = note.trim() || cat;
    try {
      // Un gasto pagado sale del fondo total: si no alcanza, el ocasional se guarda como pendiente.
      let willPay = !isFixed && (linked || paid);
      if (willPay && g) {
        // Al editar, lo que ya estaba pagado vuelve al fondo antes de comparar.
        const back = editing?.paid ? (editing.type === 'gasto' ? editing.amount : -editing.amount) : 0;
        const fund = (await fundBalance(db)) + back;
        if (n > fund) {
          // El pago de un fijo no puede quedar pendiente: no se guarda.
          if (linked) {
            alertNoFund(n, fund);
            return;
          }
          alertNoFund(n, fund, true);
          willPay = false;
        }
      }
      if (editing) {
        await updateMovement(db, editing.id, {
          type: tipo,
          name: linked ? editing.name : name,
          category: cat,
          amount: n,
          date,
          note: note.trim(),
          paid: willPay ? 1 : 0,
        });
      } else if (freq === 'ocasional') {
        await insertMovement(db, { type: tipo, name, category: cat, amount: n, date, note: note.trim(), paid: willPay ? 1 : 0 });
      } else {
        // Fijo: solo crea la regla. Anticipado no es pagado: la primera ocurrencia
        // queda pendiente en Fijos hasta que se marque.
        await insertFixed(db, { ...draftValues(fxDraft, fx.name.trim() || cat), start_date: fixedStart });
      }
      bump();
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!editing) return;
    Alert.alert(t('newMovement.deleteTitle'), linked ? t('newMovement.deleteLinked') : t('newMovement.deleteText'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteMovement(db, editing.id);
          bump();
          router.back();
        },
      },
    ]);
  };

  const saveLabel = editing ? t('common.saveChanges') : t(`newMovement.save.${freq}.${tipo}`);

  // ——— Bloques ———

  const tipoPicker = !linked && (
    <Stack gap={10}>
      <Label text={t('newMovement.type')} help={t('newMovement.help.type')} />
      <Segmented
        options={[
          { id: 'gasto', label: t('common.expense'), activeBg: C.out, activeFg: C.white },
          { id: 'ingreso', label: t('common.income'), activeBg: C.in, activeFg: C.white },
        ]}
        value={tipo}
        onChange={pickTipo}
      />
    </Stack>
  );

  const amountInput = (
    <View style={st.amount}>
      <Label
        text={t('newMovement.amount')}
        help={t('newMovement.help.amount')}
        w={700}
        size={13}
        color={C.muted}
        style={st.amountLabel}
      />
      <AmountField
        value={dots(amount)}
        onChangeText={(text) => setAmount(cleanAmount(text))}
        color={accent}
        autoFocus={wizard && !amount}
      />
    </View>
  );

  const freqPicker = !editing && (
    <Stack gap={10}>
      <Label text={t('newMovement.frequency')} help={t('newMovement.help.frequency')} />
      <Row gap={10}>
        {freqHl.layer({ base: st.freqPlate, style: st.freqRing })}
        {FREQS.map((fid) => {
          const on = freq === fid;
          return (
            <Tap
              key={fid}
              onPress={() => pickFreq(fid)}
              onLayout={freqHl.measure(fid)}
              accessibilityState={{ selected: on }}
              style={[st.freq, freqHl.ready ? clearOption : on && [st.freqOn, { borderColor: accent }]]}>
              <T w={800} size={14.5}>
                {t(`newMovement.freq.${fid}.title`)}
              </T>
              <T size={12.5} color={C.muted}>
                {t(`newMovement.freq.${fid}.desc`)}
              </T>
            </Tap>
          );
        })}
      </Row>
    </Stack>
  );

  const categoryGrid = (
    <Stack gap={10}>
      <Label text={t('newMovement.category')} help={t(`newMovement.help.category.${tipo}`)} />
      <View style={st.grid}>
        {cats.map((c) => {
          const on = c === cat;
          return (
            <Tap
              key={c}
              onPress={() => setCat(c)}
              accessibilityState={{ selected: on }}
              style={[st.cat, { backgroundColor: on ? accent : C.card, borderColor: on ? accent : C.line }]}>
              <T w={700} size={13} color={on ? C.white : C.ink} numberOfLines={1}>
                {c}
              </T>
            </Tap>
          );
        })}
      </View>
    </Stack>
  );

  const noteField = (
    <Stack gap={6}>
      <Label text={t('newMovement.note')} help={t('newMovement.help.note')} optional />
      <Field value={note} onChangeText={(text) => setNote(text.slice(0, 60))} placeholder={t('newMovement.notePlaceholder')} />
    </Stack>
  );

  const dateButton = (
    <Stack gap={6}>
      <Label
        text={isFixed ? t(`newMovement.firstDate.${tipo}`) : t('newMovement.date')}
        help={isFixed ? t(`newMovement.help.firstDate.${tipo}`) : t('newMovement.help.date')}
      />
      <Tap onPress={() => setDateOpen(true)} style={common.dateBtn}>
        <T w={600} size={14.5}>
          {date === todayISO() ? t('newMovement.todayDate', { date: longDate(date) }) : longDate(date)}
        </T>
        <IconCalendar color={C.muted} />
      </Tap>
    </Stack>
  );

  const paidPicker = freq === 'ocasional' && !linked && (
    <Stack gap={6}>
      <Label text={t(`newMovement.paidQuestion.${tipo}`)} help={t(`newMovement.help.paid.${tipo}`)} />
      <Segmented
        options={[
          { id: 'si', label: t(`newMovement.paidYes.${tipo}`), activeBg: accent, activeFg: C.white },
          { id: 'no', label: t(`newMovement.paidNo.${tipo}`) },
        ]}
        value={paid ? 'si' : 'no'}
        onChange={(v) => setPaid(v === 'si')}
      />
    </Stack>
  );

  const fixedForm = (sections: Parameters<typeof FixedForm>[0]['sections']) => (
    <FixedForm
      d={fxDraft}
      set={setFxPatch}
      startDate={fixedStart}
      accent={accent}
      hideAmount
      hideCategory
      nameOptional
      sections={sections}
    />
  );

  const stepBody = (s: StepId) => {
    switch (s) {
      case 'amount':
        return (
          <>
            {tipoPicker}
            {amountInput}
            {freqPicker}
          </>
        );
      case 'details':
        return (
          <>
            {categoryGrid}
            {isFixed ? fixedForm(['info']) : noteField}
          </>
        );
      case 'when':
        return (
          <>
            {dateButton}
            {paidPicker}
          </>
        );
      case 'repeat':
        return (
          <>
            {dateButton}
            {fixedForm(['frequency'])}
          </>
        );
      case 'review':
        return fixedForm(['summary', 'upcoming', 'options']);
    }
  };

  const stepTitle = (s: StepId) =>
    s === 'details' || s === 'when' ? t(`newMovement.stepTitle.${s}.${tipo}`) : t(`newMovement.stepTitle.${s}`);

  const canNext = n > 0 && !saving;

  const footer = wizard ? (
    <Row gap={10}>
      {step > 0 && (
        <Tap
          onPress={() => goTo(step - 1)}
          accessibilityRole="button"
          accessibilityLabel={t('newMovement.prev')}
          style={[common.outlineBtn, st.backBtn]}>
          <IconChevronLeft size={18} />
          <T w={800} size={15}>
            {t('newMovement.prev')}
          </T>
        </Tap>
      )}
      <View style={layout.fill}>
        {isLast ? (
          <PrimaryButton label={saveLabel} bg={accent} disabled={!canNext} onPress={save} />
        ) : (
          <PrimaryButton
            label={t('newMovement.next')}
            bg={accent}
            icon={false}
            disabled={!canNext}
            onPress={() => goTo(step + 1)}
          />
        )}
      </View>
    </Row>
  ) : (
    <PrimaryButton label={saveLabel} bg={accent} disabled={!canNext} onPress={save} />
  );

  return (
    <View style={layout.screen}>
      {/* Con `key` cada paso arranca con el scroll arriba. */}
      <Screen
        key={wizard ? stepId : 'edit'}
        bottom={140}
        gap={20}
        footer={footer}
        stickyFooter={settings.stickyFooter}>
        <Row style={layout.between}>
          <RoundButton label={t('common.close')} onPress={() => router.back()}>
            <IconClose />
          </RoundButton>
          <T w={800} size={16}>
            {editing ? t('newMovement.editTitle') : t('newMovement.newTitle')}
          </T>
          {editing ? (
            <RoundButton label={t('newMovement.deleteLabel')} onPress={remove}>
              <IconTrash color={C.danger} />
            </RoundButton>
          ) : (
            <View style={st.topSpacer} />
          )}
        </Row>

        {wizard ? (
          <>
            <StepIndicator
              labels={steps.map((s) => t(`newMovement.steps.${s}`))}
              current={step}
              reached={n > 0 ? reached : 0}
              accent={accent}
              onPick={goTo}
            />
            <Animated.View key={stepId} entering={(dir > 0 ? FadeInRight : FadeInLeft).duration(220)} style={st.step}>
              <T serif w={600} size={26}>
                {stepTitle(stepId)}
              </T>
              {stepBody(stepId)}
            </Animated.View>
          </>
        ) : (
          <>
            {stepBody('amount')}
            {stepBody('details')}
            {stepBody('when')}
          </>
        )}
      </Screen>

      <Sheet visible={dateOpen} onClose={() => setDateOpen(false)} title={t('newMovement.date')}>
        <DatePicker value={date} onChange={pickDate} filter={tipo} />
      </Sheet>
    </View>
  );
}
