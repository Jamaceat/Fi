import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { IconCalendar, IconChevronDown, IconDownload, IconRefresh, IconTrash } from '@/components/icons';
import { Field, Header, RadioDot, Row, Screen, Stepper, SwitchRow, T, Tap, Toast } from '@/components/ui';
import { C } from '@/constants/theme';
import { wipeData, type DefaultPeriod, type Settings } from '@/db/repo';
import { authenticate, canLock } from '@/lib/auth';
import { longDate, toISO } from '@/lib/dates';
import { exportCsv } from '@/lib/export';
import { describePreset, PRESETS, UNITS, type Kind, type Preset } from '@/lib/schedule';
import { useApp } from '@/state/app';

const CACHE_OPTS = [
  [7, '1 semana'],
  [30, '1 mes'],
  [90, '3 meses'],
  [180, '6 meses'],
  [365, '1 año'],
] as const;

const PRESET_OPTS: { id: Preset; label: string }[] = [
  ...PRESETS.map((p) => ({ id: p.id, label: p.name })),
  { id: 'custom', label: 'Personalizada' },
];

export default function Ajustes() {
  const db = useSQLiteContext();
  const { settings: s, updateSettings, bump, holidays, holidayYears, refreshHolidays } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<Kind | null>(null);
  const [wiping, setWiping] = useState(false);
  const [wipeText, setWipeText] = useState('');
  const [toast, setToast] = useState<{ title: string; text: string; warn?: boolean } | null>(null);

  const setDef = (kind: Kind, patch: Partial<DefaultPeriod>) =>
    updateSettings({ defs: { ...s.defs, [kind]: { ...s.defs[kind], ...patch } } });
  const toggle = (key: keyof Settings) => updateSettings({ [key]: !s[key] });

  const toggleLock = async () => {
    if (s.lock) return updateSettings({ lock: false });
    if (!(await canLock())) {
      Alert.alert('No disponible', 'Configura una huella, rostro o PIN en tu teléfono para usar el bloqueo.');
      return;
    }
    if (await authenticate()) updateSettings({ lock: true });
  };

  const doExport = async () => {
    try {
      const name = await exportCsv(db);
      setToast({ title: 'Exportación lista', text: `${name} con todos tus datos` });
    } catch (e) {
      setToast({ warn: true, title: 'No se pudo exportar', text: String(e) });
    }
  };

  const lastSync = [...holidayYears.values()].sort().at(-1);
  const years = [...holidayYears.keys()].sort();
  const doRefresh = async () => {
    setRefreshing(true);
    try {
      const r = await refreshHolidays();
      setToast(
        r.failed
          ? { warn: true, title: 'No se pudieron actualizar', text: 'Revisa tu conexión. Se siguen usando los festivos guardados.' }
          : { title: 'Festivos actualizados', text: `${r.updated} ${r.updated === 1 ? 'año descargado' : 'años descargados'} de Nager.Date.` },
      );
    } finally {
      setRefreshing(false);
    }
  };

  const cantWipe = wipeText.trim().toUpperCase() !== 'BORRAR';
  const doWipe = async () => {
    if (cantWipe) return;
    await wipeData(db);
    bump();
    setWiping(false);
    setWipeText('');
    setToast({ warn: true, title: 'Datos borrados', text: 'La app quedó en cero. Tus ajustes se mantienen.' });
  };

  return (
    <Screen bottom={48}>
      <Header onBack={() => router.back()} kicker="Mis finanzas" title="Ajustes" />

      {toast && <Toast title={toast.title} text={toast.text} warn={toast.warn} onClose={() => setToast(null)} />}

      <View style={{ gap: 10 }}>
        <View style={{ gap: 4 }}>
          <T w={800} size={16}>
            Periodicidad por defecto
          </T>
          <T size={12.5} color={C.muted}>
            Se preselecciona al crear un fijo nuevo. Puedes cambiarla en cada uno.
          </T>
        </View>
        <View style={st.box}>
          {(['gasto', 'ingreso'] as const).map((kind, i) => {
            const d = s.defs[kind];
            const isG = kind === 'gasto';
            const accent = isG ? C.ink : C.in;
            const custom = d.preset === 'custom';
            const isOpen = open === kind;
            return (
              <View key={kind} style={i > 0 && st.divider}>
                <Tap onPress={() => setOpen(isOpen ? null : kind)} style={st.defRow} accessibilityState={{ expanded: isOpen }}>
                  <View style={[st.defIcon, { backgroundColor: isG ? '#EFEBE4' : C.inSoft }]}>
                    <IconCalendar color={isG ? C.ink : C.inDark} />
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <T w={700} size={14.5}>
                      {isG ? 'Gastos fijos' : 'Ingresos fijos'}
                    </T>
                    <T w={600} size={12.5} color={C.muted}>
                      {describePreset(d.preset, d.n, d.unit)}
                    </T>
                  </View>
                  <View style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}>
                    <IconChevronDown size={16} color={C.faint} />
                  </View>
                </Tap>
                {isOpen && (
                  <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 12 }}>
                    <View style={st.optGrid}>
                      {PRESET_OPTS.map((p) => {
                        const sel = p.id === d.preset;
                        return (
                          <Tap
                            key={p.id}
                            onPress={() => setDef(kind, { preset: p.id })}
                            style={[st.opt, { backgroundColor: sel ? accent : C.card, borderColor: sel ? accent : C.line }]}>
                            <T w={700} size={13} color={sel ? '#FFFFFF' : C.ink}>
                              {p.label}
                            </T>
                          </Tap>
                        );
                      })}
                    </View>
                    <View style={{ gap: 10, opacity: custom ? 1 : 0.7 }}>
                      <Row style={{ justifyContent: 'space-between' }}>
                        <T w={700} size={13.5}>
                          Personalizada: cada
                        </T>
                        <Stepper
                          value={String(d.n)}
                          onDec={() => setDef(kind, { n: Math.max(1, d.n - 1), preset: 'custom' })}
                          onInc={() => setDef(kind, { n: Math.min(365, d.n + 1), preset: 'custom' })}
                          decLabel="Reducir intervalo"
                          incLabel="Aumentar intervalo"
                        />
                      </Row>
                      <Row gap={4} style={st.units}>
                        {UNITS.map((u) => {
                          const sel = u.id === d.unit;
                          return (
                            <Tap
                              key={u.id}
                              onPress={() => setDef(kind, { unit: u.id, preset: 'custom' })}
                              style={[st.unit, sel && { backgroundColor: custom ? accent : C.card }]}>
                              <T w={800} size={13} color={sel ? (custom ? '#FFFFFF' : C.ink) : C.muted2}>
                                {u.label}
                              </T>
                            </Tap>
                          );
                        })}
                      </Row>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <T w={800} size={16}>
          Mes y fechas
        </T>
        <View style={[st.box, { paddingHorizontal: 14 }]}>
          <Row gap={12} style={{ paddingVertical: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T w={700} size={14.5}>
                Tu mes empieza el día
              </T>
              <T size={12.5} color={C.muted}>
                Útil si organizas el mes desde tu día de pago.
              </T>
            </View>
            <Stepper
              value={String(s.monthStart)}
              onDec={() => updateSettings({ monthStart: s.monthStart <= 1 ? 28 : s.monthStart - 1 })}
              onInc={() => updateSettings({ monthStart: s.monthStart >= 28 ? 1 : s.monthStart + 1 })}
              decLabel="Día anterior"
              incLabel="Día siguiente"
            />
          </Row>
          <View style={[st.divider, { paddingVertical: 12, gap: 8 }]}>
            <T w={700} size={14.5}>
              Si un fijo cae en fin de semana o festivo
            </T>
            {(
              [
                ['mantener', 'Mantener la fecha'],
                ['antes', 'Mover al día hábil anterior'],
                ['despues', 'Mover al día hábil siguiente'],
              ] as const
            ).map(([id, label]) => (
              <RadioOption key={id} label={label} on={s.holiday === id} onPress={() => updateSettings({ holiday: id })} />
            ))}
          </View>
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <View style={{ gap: 4 }}>
          <T w={800} size={16}>
            Festivos de Colombia
          </T>
          <T size={12.5} color={C.muted}>
            Se descargan de Nager.Date y se guardan en el teléfono. Mientras estén vigentes no se vuelven a pedir.
          </T>
        </View>
        <View style={[st.box, { padding: 14, gap: 12 }]}>
          <T w={700} size={14.5}>
            Guardar festivos durante
          </T>
          <View style={st.optGrid}>
            {CACHE_OPTS.map(([days, label]) => {
              const sel = s.holidayCacheDays === days;
              return (
                <Tap
                  key={days}
                  onPress={() => updateSettings({ holidayCacheDays: days })}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: sel }}
                  style={[st.opt, { backgroundColor: sel ? C.holiday : C.card, borderColor: sel ? C.holiday : C.line }]}>
                  <T w={700} size={13} color={sel ? '#FFFFFF' : C.ink}>
                    {label}
                  </T>
                </Tap>
              );
            })}
          </View>
          <Row gap={12} style={[st.divider, { paddingTop: 12 }]}>
            <View style={[st.defIcon, { backgroundColor: C.holidaySoft }]}>
              <IconCalendar color={C.holidayDark} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T w={700} size={14}>
                {holidays.size > 0
                  ? `${holidays.size} festivos guardados${years.length ? ` · ${years[0]}–${years.at(-1)}` : ''}`
                  : 'Aún no hay festivos guardados'}
              </T>
              <T size={12.5} color={C.muted}>
                {lastSync ? `Actualizados el ${longDate(toISO(new Date(lastSync)))}` : 'Se descargan al tener conexión.'}
              </T>
            </View>
          </Row>
          <Tap onPress={refreshing ? undefined : doRefresh} style={[st.dataBtn, { height: 46, opacity: refreshing ? 0.5 : 1 }]}>
            <IconRefresh size={17} color={C.holidayDark} />
            <T w={800} size={14} color={C.holidayDark}>
              {refreshing ? 'Actualizando…' : 'Actualizar ahora'}
            </T>
          </Tap>
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <T w={800} size={16}>
          Avisos y alertas
        </T>
        <View style={[st.box, { paddingHorizontal: 14 }]}>
          <SwitchRow
            first
            label="Recordar pagos fijos"
            desc="Usa la anticipación que definas en cada fijo."
            on={s.remindFijos}
            onPress={() => toggle('remindFijos')}
          />
          <SwitchRow
            label="Alerta de gasto del mes"
            desc="Te avisa en Inicio cuando tus gastos se acercan a tus ingresos."
            on={s.budgetAlert}
            onPress={() => toggle('budgetAlert')}
          />
          {s.budgetAlert && (
            <Row style={[st.divider, { paddingVertical: 10 }]}>
              <T w={700} size={14.5} style={{ flex: 1 }}>
                Avisar al gastar el
              </T>
              <Stepper
                minWidth={56}
                value={`${s.budget} %`}
                onDec={() => updateSettings({ budget: Math.max(50, s.budget - 5) })}
                onInc={() => updateSettings({ budget: Math.min(100, s.budget + 5) })}
                decLabel="Bajar porcentaje"
                incLabel="Subir porcentaje"
              />
            </Row>
          )}
          <SwitchRow
            label="Resumen semanal"
            desc="Cada lunes: lo que gastaste y lo que viene."
            on={s.weekly}
            onPress={() => toggle('weekly')}
          />
          <View style={[st.divider, { paddingVertical: 12, gap: 8 }]}>
            <T w={700} size={14.5}>
              Hora de los avisos
            </T>
            <Row gap={8}>
              {(
                [
                  ['7:00', '7:00 a. m.'],
                  ['12:00', '12:00 m.'],
                  ['19:00', '7:00 p. m.'],
                ] as const
              ).map(([id, label]) => {
                const sel = s.hour === id;
                return (
                  <Tap
                    key={id}
                    onPress={() => updateSettings({ hour: id })}
                    style={[st.hour, { backgroundColor: sel ? C.inSoft : C.card, borderColor: sel ? C.in : C.line }]}>
                    <T w={700} size={13} color={sel ? C.inDark : C.ink}>
                      {label}
                    </T>
                  </Tap>
                );
              })}
            </Row>
          </View>
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <T w={800} size={16}>
          Privacidad y formato
        </T>
        <View style={[st.box, { paddingHorizontal: 14 }]}>
          <SwitchRow
            first
            label="Ocultar montos en Inicio"
            desc="Muestra $ •••• hasta que toques el saldo."
            on={s.hideAmounts}
            onPress={() => toggle('hideAmounts')}
          />
          <SwitchRow label="Bloquear con huella o PIN" desc="Se pide al abrir la app." on={s.lock} onPress={toggleLock} />
          <Row gap={12} style={[st.divider, { paddingVertical: 12 }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <T w={700} size={14.5}>
                Moneda
              </T>
              <T size={12.5} color={C.muted}>
                Formato $ 1.250.000
              </T>
            </View>
            <T w={700} size={13} color={C.muted}>
              Peso colombiano · COP
            </T>
          </Row>
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <T w={800} size={16}>
          Tus datos
        </T>
        <View style={{ gap: 10 }}>
          <Tap onPress={doExport} style={st.dataBtn}>
            <IconDownload />
            <T w={800} size={14.5}>
              Exportar datos (CSV)
            </T>
          </Tap>
          {!wiping ? (
            <Tap
              onPress={() => {
                setWiping(true);
                setWipeText('');
              }}
              style={st.dataBtn}>
              <IconTrash color={C.danger} />
              <T w={800} size={14.5} color={C.danger}>
                Borrar todos los datos
              </T>
            </Tap>
          ) : (
            <View style={st.wipe} accessibilityRole="alert">
              <T w={800} size={15}>
                ¿Borrar todos tus datos?
              </T>
              <T size={13} color={C.muted2} style={{ lineHeight: 19 }}>
                Se eliminan movimientos, gastos e ingresos fijos, ahorro, metas e historial. Tus ajustes se conservan. Esta
                acción no se puede deshacer; exporta antes si quieres una copia.
              </T>
              <T w={700} size={13}>
                Escribe BORRAR para confirmar
              </T>
              <Field value={wipeText} onChangeText={(t) => setWipeText(t.slice(0, 12))} placeholder="BORRAR" autoCapitalize="characters" autoCorrect={false} />
              <Row gap={8}>
                <Tap
                  onPress={() => {
                    setWiping(false);
                    setWipeText('');
                  }}
                  style={[st.confirmBtn, { backgroundColor: C.card, borderWidth: 1, borderColor: C.line }]}>
                  <T w={800} size={14}>
                    Cancelar
                  </T>
                </Tap>
                <Tap onPress={doWipe} style={[st.confirmBtn, { backgroundColor: C.danger, opacity: cantWipe ? 0.45 : 1 }]}>
                  <T w={800} size={14} color="#FFFFFF">
                    Borrar todo
                  </T>
                </Tap>
              </Row>
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}

function RadioOption({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      style={[st.radio, { backgroundColor: on ? C.inSoft : C.card, borderColor: on ? C.in : C.line }]}>
      <RadioDot on={on} accent={C.in} />
      <T w={700} size={13.5} color={on ? C.inDark : C.ink}>
        {label}
      </T>
    </Tap>
  );
}

const st = StyleSheet.create({
  box: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 18 },
  divider: { borderTopWidth: 1, borderTopColor: C.divider },
  defRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  defIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  optGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opt: { height: 40, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, justifyContent: 'center' },
  units: { backgroundColor: C.segBg, borderRadius: 12, padding: 4 },
  unit: { flex: 1, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  radio: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
  hour: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dataBtn: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  wipe: { backgroundColor: C.outSoft, borderRadius: 18, padding: 16, gap: 10 },
  confirmBtn: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
