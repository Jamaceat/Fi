import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DatePicker } from '@/components/calendar';
import { draftValues, FixedForm, kindPatch, newFixedDraft, type FixedDraft } from '@/components/fixed-form';
import { IconCalendar, IconClose, IconTrash } from '@/components/icons';
import { AmountField, Field, PrimaryButton, RoundButton, Row, Screen, Segmented, Sheet, Stack, T, Tap } from '@/components/ui';
import { C } from '@/constants/theme';
import { deleteMovement, getMovement, insertFixed, insertMovement, updateMovement, type Movement } from '@/db/repo';
import { t, tList } from '@/i18n';
import { fromISO, longDate, periodOf, periodRange, todayISO, weekdayOf } from '@/lib/dates';
import { cleanAmount, dots } from '@/lib/format';
import type { Kind } from '@/lib/schedule';
import { useApp } from '@/state/app';
import { common, layout } from '@/styles/common';
import { styles as st } from '@/styles/screens/nuevo.styles';

type Freq = 'ocasional' | 'fijo';

const FREQS: Freq[] = ['ocasional', 'fijo'];

const categoriesOf = (kind: Kind) => tList(`categories.movement.${kind}`);
const defaultCategory = (kind: Kind) => t(`categories.movementDefault.${kind}`);

export default function Nuevo() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
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
  const linked = editing?.fixed_id != null;
  const kindCats = categoriesOf(tipo);
  const cats = kindCats.includes(cat) ? kindCats : [...kindCats, cat];
  const n = Number(amount) || 0;
  const isFixed = freq === 'fijo' && !editing;
  const fxDraft: FixedDraft = { ...fx, kind: tipo, amount, category: cat };
  const setFxPatch = (patch: Partial<FixedDraft>) => setFx((prev) => ({ ...prev, ...patch }));
  // El fijo arranca en el periodo de la fecha elegida (hoy, o el día tocado en el calendario).
  const fixedStart = periodRange(periodOf(date, settings.monthStart), settings.monthStart).from;

  const pickTipo = (next: Kind) => {
    setTipo(next);
    setCat(defaultCategory(next));
    setFx((prev) => ({ ...prev, ...kindPatch(prev, next, true, settings) }));
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
      if (editing) {
        await updateMovement(db, editing.id, {
          type: tipo,
          name: linked ? editing.name : name,
          category: cat,
          amount: n,
          date,
          note: note.trim(),
          paid: linked || paid ? 1 : 0,
        });
      } else if (freq === 'ocasional') {
        await insertMovement(db, { type: tipo, name, category: cat, amount: n, date, note: note.trim(), paid: paid ? 1 : 0 });
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

  return (
    <View style={layout.screen}>
      <Screen bottom={140} gap={20}>
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

        {!linked && (
          <Segmented
            options={[
              { id: 'gasto', label: t('common.expense'), activeBg: C.out, activeFg: C.white },
              { id: 'ingreso', label: t('common.income'), activeBg: C.in, activeFg: C.white },
            ]}
            value={tipo}
            onChange={pickTipo}
          />
        )}

        <View style={st.amount}>
          <T w={700} size={13} color={C.muted}>
            {t('newMovement.amount')}
          </T>
          <AmountField value={dots(amount)} onChangeText={(text) => setAmount(cleanAmount(text))} color={accent} autoFocus={!id} />
        </View>

        {!editing && (
          <Stack gap={10}>
            <T w={800} size={14}>
              {t('newMovement.frequency')}
            </T>
            <Row gap={10}>
              {FREQS.map((fid) => {
                const on = freq === fid;
                return (
                  <Tap
                    key={fid}
                    onPress={() => setFreq(fid)}
                    accessibilityState={{ selected: on }}
                    style={[st.freq, on && [st.freqOn, { borderColor: accent }]]}>
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
        )}

        <Stack gap={10}>
          <T w={800} size={14}>
            {t('newMovement.category')}
          </T>
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

        <Stack gap={10}>
          <Stack gap={6}>
            <T w={800} size={14}>
              {isFixed ? t(`newMovement.firstDate.${tipo}`) : t('newMovement.date')}
            </T>
            <Tap onPress={() => setDateOpen(true)} style={common.dateBtn}>
              <T w={600} size={14.5}>
                {date === todayISO() ? t('newMovement.todayDate', { date: longDate(date) }) : longDate(date)}
              </T>
              <IconCalendar color={C.muted} />
            </Tap>
          </Stack>
          {!isFixed && (
            <Stack gap={6}>
              <T w={800} size={14}>
                {t('newMovement.note')}{' '}
                <T w={500} size={14} color={C.muted}>
                  {t('common.optional')}
                </T>
              </T>
              <Field value={note} onChangeText={(text) => setNote(text.slice(0, 60))} placeholder={t('newMovement.notePlaceholder')} />
            </Stack>
          )}
        </Stack>

        {isFixed && (
          <FixedForm d={fxDraft} set={setFxPatch} startDate={fixedStart} accent={accent} hideAmount hideCategory nameOptional />
        )}

        {freq === 'ocasional' && !linked && (
          <Stack gap={6}>
            <T w={800} size={14}>
              {t(`newMovement.paidQuestion.${tipo}`)}
            </T>
            <Segmented
              options={[
                { id: 'si', label: t(`newMovement.paidYes.${tipo}`), activeBg: accent, activeFg: C.white },
                { id: 'no', label: t(`newMovement.paidNo.${tipo}`) },
              ]}
              value={paid ? 'si' : 'no'}
              onChange={(v) => setPaid(v === 'si')}
            />
          </Stack>
        )}
      </Screen>

      <View style={[common.footer, { paddingBottom: insets.bottom + 16 }]}>
        <PrimaryButton label={saveLabel} bg={accent} disabled={n <= 0 || saving} onPress={save} />
      </View>

      <Sheet visible={dateOpen} onClose={() => setDateOpen(false)} title={t('newMovement.date')}>
        <DatePicker value={date} onChange={pickDate} filter={tipo} />
      </Sheet>
    </View>
  );
}
