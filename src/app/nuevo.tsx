import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DatePicker } from '@/components/calendar';
import { draftValues, FixedForm, kindPatch, newFixedDraft, type FixedDraft } from '@/components/fixed-form';
import { IconCalendar, IconClose, IconTrash } from '@/components/icons';
import { AmountField, Field, PrimaryButton, RoundButton, Row, Screen, Segmented, Sheet, T, Tap } from '@/components/ui';
import { C } from '@/constants/theme';
import { deleteMovement, getMovement, insertFixed, insertMovement, updateMovement, type Movement } from '@/db/repo';
import { fromISO, longDate, periodOf, periodRange, todayISO, weekdayOf } from '@/lib/dates';
import { cleanAmount, dots } from '@/lib/format';
import type { Kind } from '@/lib/schedule';
import { useApp } from '@/state/app';

const CATS: Record<Kind, string[]> = {
  gasto: ['Mercado', 'Vivienda', 'Servicios', 'Transporte', 'Salud', 'Ocio', 'Ropa', 'Educación', 'Otros'],
  ingreso: ['Salario', 'Freelance', 'Ventas', 'Inversiones', 'Regalos', 'Otros'],
};

export default function Nuevo() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { settings, bump } = useApp();
  // `date` y `kind` preseleccionan un movimiento nuevo (p. ej. desde el calendario).
  const { id, date: dateParam, kind } = useLocalSearchParams<{ id?: string; date?: string; kind?: string }>();
  const initialDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayISO();

  const [editing, setEditing] = useState<Movement | null>(null);
  const [tipo, setTipo] = useState<Kind>(kind === 'ingreso' ? 'ingreso' : 'gasto');
  const [freq, setFreq] = useState<'ocasional' | 'fijo'>('ocasional');
  const [cat, setCat] = useState(kind === 'ingreso' ? 'Salario' : 'Mercado');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(initialDate);
  const [note, setNote] = useState('');
  // Ocasional: ya pagado/recibido o pendiente.
  const [paid, setPaid] = useState(true);
  // Fijo: mismo formulario que Fijos > Agregar. Tipo y monto se comparten con esta pantalla.
  const [fx, setFx] = useState<FixedDraft>(() => newFixedDraft(kind === 'ingreso' ? 'ingreso' : 'gasto', settings, initialDate));
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
  const cats = CATS[tipo].includes(cat) ? CATS[tipo] : [...CATS[tipo], cat];
  const n = Number(amount) || 0;
  const isFixed = freq === 'fijo' && !editing;
  const fxDraft: FixedDraft = { ...fx, kind: tipo, amount, category: cat };
  const setFxPatch = (patch: Partial<FixedDraft>) => setFx((prev) => ({ ...prev, ...patch }));
  // El fijo arranca en el periodo de la fecha elegida (hoy, o el día tocado en el calendario).
  const fixedStart = periodRange(periodOf(date, settings.monthStart), settings.monthStart).from;

  const pickTipo = (t: Kind) => {
    setTipo(t);
    setCat(t === 'gasto' ? 'Mercado' : 'Salario');
    setFx((prev) => ({ ...prev, ...kindPatch(prev, t, true, settings) }));
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
    Alert.alert(
      '¿Eliminar este movimiento?',
      linked ? 'El fijo volverá a quedar pendiente en ese mes.' : 'Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await deleteMovement(db, editing.id);
            bump();
            router.back();
          },
        },
      ],
    );
  };

  const saveLabel = editing
    ? 'Guardar cambios'
    : freq === 'fijo'
      ? g
        ? 'Crear gasto fijo'
        : 'Crear ingreso fijo'
      : g
        ? 'Guardar gasto'
        : 'Guardar ingreso';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Screen bottom={140} gap={20}>
        <Row style={{ justifyContent: 'space-between' }}>
          <RoundButton label="Cerrar" onPress={() => router.back()}>
            <IconClose />
          </RoundButton>
          <T w={800} size={16}>
            {editing ? 'Editar movimiento' : 'Nuevo movimiento'}
          </T>
          {editing ? (
            <RoundButton label="Eliminar movimiento" onPress={remove}>
              <IconTrash color={C.danger} />
            </RoundButton>
          ) : (
            <View style={{ width: 44 }} />
          )}
        </Row>

        {!linked && (
          <Segmented
            options={[
              { id: 'gasto', label: 'Gasto', activeBg: C.out, activeFg: '#FFFFFF' },
              { id: 'ingreso', label: 'Ingreso', activeBg: C.in, activeFg: '#FFFFFF' },
            ]}
            value={tipo}
            onChange={pickTipo}
          />
        )}

        <View style={{ alignItems: 'center', gap: 6, paddingTop: 8 }}>
          <T w={700} size={13} color={C.muted}>
            Monto
          </T>
          <AmountField value={dots(amount)} onChangeText={(t) => setAmount(cleanAmount(t))} color={accent} autoFocus={!id} />
        </View>

        {!editing && (
          <View style={{ gap: 10 }}>
            <T w={800} size={14}>
              Frecuencia
            </T>
            <Row gap={10}>
              {(
                [
                  ['ocasional', 'Ocasional', 'Solo esta vez'],
                  ['fijo', 'Fijo', 'Se repite'],
                ] as const
              ).map(([fid, title, desc]) => {
                const on = freq === fid;
                return (
                  <Tap
                    key={fid}
                    onPress={() => setFreq(fid)}
                    accessibilityState={{ selected: on }}
                    style={[st.freq, { borderColor: on ? accent : C.line, borderWidth: on ? 2 : 1 }]}>
                    <T w={800} size={14.5}>
                      {title}
                    </T>
                    <T size={12.5} color={C.muted}>
                      {desc}
                    </T>
                  </Tap>
                );
              })}
            </Row>
          </View>
        )}

        <View style={{ gap: 10 }}>
          <T w={800} size={14}>
            Categoría
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
                  <T w={700} size={13} color={on ? '#FFFFFF' : C.ink} numberOfLines={1}>
                    {c}
                  </T>
                </Tap>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <View style={{ gap: 6 }}>
            <T w={800} size={14}>
              {isFixed ? (g ? 'Primer pago' : 'Primer ingreso') : 'Fecha'}
            </T>
            <Tap onPress={() => setDateOpen(true)} style={st.dateBtn}>
              <T w={600} size={14.5}>
                {date === todayISO() ? `Hoy · ${longDate(date)}` : longDate(date)}
              </T>
              <IconCalendar color={C.muted} />
            </Tap>
          </View>
          {!isFixed && (
            <View style={{ gap: 6 }}>
              <T w={800} size={14}>
                Nota{' '}
                <T w={500} size={14} color={C.muted}>
                  (opcional)
                </T>
              </T>
              <Field value={note} onChangeText={(t) => setNote(t.slice(0, 60))} placeholder="Ej. mercado de la semana" />
            </View>
          )}
        </View>

        {isFixed && (
          <FixedForm d={fxDraft} set={setFxPatch} startDate={fixedStart} accent={accent} hideAmount hideCategory nameOptional />
        )}

        {freq === 'ocasional' && !linked && (
          <View style={{ gap: 6 }}>
            <T w={800} size={14}>
              {g ? '¿Ya lo pagaste?' : '¿Ya lo recibiste?'}
            </T>
            <Segmented
              options={[
                { id: 'si', label: g ? 'Sí, pagado' : 'Sí, recibido', activeBg: accent, activeFg: '#FFFFFF' },
                { id: 'no', label: g ? 'No, pendiente' : 'No, por recibir' },
              ]}
              value={paid ? 'si' : 'no'}
              onChange={(v) => setPaid(v === 'si')}
            />
          </View>
        )}
      </Screen>

      <View style={[st.footer, { paddingBottom: insets.bottom + 16 }]}>
        <PrimaryButton label={saveLabel} bg={accent} disabled={n <= 0 || saving} onPress={save} />
      </View>

      <Sheet visible={dateOpen} onClose={() => setDateOpen(false)} title="Fecha">
        <DatePicker value={date} onChange={pickDate} filter={tipo} />
      </Sheet>
    </View>
  );
}

const st = StyleSheet.create({
  freq: { flex: 1, minHeight: 72, padding: 14, borderRadius: 16, backgroundColor: C.card, gap: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cat: {
    width: '31.5%',
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  dateBtn: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
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
});
