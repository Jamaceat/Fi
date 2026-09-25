import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconCalendar, IconClose, IconTrash } from '@/components/icons';
import { AmountField, Field, PrimaryButton, RoundButton, Row, Screen, Segmented, Sheet, T, Tap } from '@/components/ui';
import { C } from '@/constants/theme';
import {
  deleteMovement,
  getFixed,
  getMovement,
  insertFixed,
  insertMovement,
  markPaid,
  updateMovement,
  type Movement,
} from '@/db/repo';
import { fromISO, longDate, periodOf, periodRange, toISO, todayISO } from '@/lib/dates';
import { cleanAmount, dots } from '@/lib/format';
import { occurrences, type Kind } from '@/lib/schedule';
import { useApp } from '@/state/app';

const CATS: Record<Kind, string[]> = {
  gasto: ['Mercado', 'Vivienda', 'Servicios', 'Transporte', 'Salud', 'Ocio', 'Ropa', 'Educación', 'Otros'],
  ingreso: ['Salario', 'Freelance', 'Ventas', 'Inversiones', 'Regalos', 'Otros'],
};

export default function Nuevo() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { settings, bump } = useApp();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [editing, setEditing] = useState<Movement | null>(null);
  const [tipo, setTipo] = useState<Kind>('gasto');
  const [freq, setFreq] = useState<'ocasional' | 'fijo'>('ocasional');
  const [cat, setCat] = useState('Mercado');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [day, setDay] = useState(fromISO(todayISO()).getDate());
  const [dayOpen, setDayOpen] = useState(false);
  const [iosDateOpen, setIosDateOpen] = useState(false);
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
    });
  }, [db, id]);

  const g = tipo === 'gasto';
  const accent = g ? C.out : C.in;
  const linked = editing?.fixed_id != null;
  const cats = CATS[tipo].includes(cat) ? CATS[tipo] : [...CATS[tipo], cat];
  const n = Number(amount) || 0;

  const pickTipo = (t: Kind) => {
    setTipo(t);
    setCat(t === 'gasto' ? 'Mercado' : 'Salario');
  };

  const openDate = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: fromISO(date),
        mode: 'date',
        onChange: (e, d) => {
          if (e.type === 'set' && d) {
            setDate(toISO(d));
            setDay(d.getDate());
          }
        },
      });
    } else {
      setIosDateOpen(true);
    }
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
        });
      } else if (freq === 'ocasional') {
        await insertMovement(db, { type: tipo, name, category: cat, amount: n, date, note: note.trim() });
      } else {
        // Fijo: crea la regla mensual y registra este primer pago/ingreso.
        const range = periodRange(periodOf(date, settings.monthStart), settings.monthStart);
        const fixedId = await insertFixed(db, {
          type: tipo,
          name,
          category: cat,
          amount: n,
          preset: 'mensual',
          day,
          day1: 15,
          day2: 30,
          weekday: 0,
          custom_n: 1,
          custom_unit: 'meses',
          variable: 0,
          auto_move: 1,
          remind: 1,
          remind_days: 2,
          start_date: range.from,
        });
        const f = await getFixed(db, fixedId);
        const occ = f && occurrences(f, range.from, range.to)[0];
        if (f && occ) await markPaid(db, f, occ.due, { date, forceMovement: true });
        else await insertMovement(db, { type: tipo, name, category: cat, amount: n, date, note: note.trim(), fixed_id: fixedId });
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

  const saveLabel = editing ? 'Guardar cambios' : g ? 'Guardar gasto' : 'Guardar ingreso';

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
                  ['fijo', 'Fijo', 'Se repite cada mes'],
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
            {freq === 'fijo' && (
              <Row style={st.dayRow}>
                <T w={600} size={13.5} style={{ flex: 1 }}>
                  {g ? 'Se paga cada mes el' : 'Se recibe cada mes el'}
                </T>
                <Tap onPress={() => setDayOpen(true)} style={st.dayBtn}>
                  <T w={800} size={14}>
                    Día {day}
                  </T>
                </Tap>
              </Row>
            )}
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
              Fecha
            </T>
            <Tap onPress={openDate} style={st.dateBtn}>
              <T w={600} size={14.5}>
                {date === todayISO() ? `Hoy · ${longDate(date)}` : longDate(date)}
              </T>
              <IconCalendar color={C.muted} />
            </Tap>
          </View>
          <View style={{ gap: 6 }}>
            <T w={800} size={14}>
              Nota{' '}
              <T w={500} size={14} color={C.muted}>
                (opcional)
              </T>
            </T>
            <Field value={note} onChangeText={(t) => setNote(t.slice(0, 60))} placeholder="Ej. mercado de la semana" />
          </View>
        </View>
      </Screen>

      <View style={[st.footer, { paddingBottom: insets.bottom + 16 }]}>
        <PrimaryButton label={saveLabel} bg={accent} disabled={n <= 0 || saving} onPress={save} />
      </View>

      <Sheet visible={dayOpen} onClose={() => setDayOpen(false)} title="Día del mes">
        <View style={st.days}>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <Tap
              key={d}
              onPress={() => {
                setDay(d);
                setDayOpen(false);
              }}
              style={[st.dayCell, d === day && { backgroundColor: accent, borderColor: accent }]}>
              <T w={800} size={14} color={d === day ? '#FFFFFF' : C.ink}>
                {d}
              </T>
            </Tap>
          ))}
        </View>
        <T size={12.5} color={C.muted}>
          Si el mes es más corto, cuenta el último día del mes.
        </T>
      </Sheet>

      {Platform.OS === 'ios' && (
        <Sheet visible={iosDateOpen} onClose={() => setIosDateOpen(false)} title="Fecha">
          <DateTimePicker
            value={fromISO(date)}
            mode="date"
            display="inline"
            accentColor={accent}
            onChange={(_, d) => {
              if (d) {
                setDate(toISO(d));
                setDay(d.getDate());
              }
            }}
          />
          <PrimaryButton label="Listo" bg={accent} onPress={() => setIosDateOpen(false)} />
        </Sheet>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  freq: { flex: 1, minHeight: 72, padding: 14, borderRadius: 16, backgroundColor: C.card, gap: 4 },
  dayRow: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    paddingVertical: 6,
    paddingRight: 6,
    paddingLeft: 14,
  },
  dayBtn: { height: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.chip, justifyContent: 'center' },
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
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayCell: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
