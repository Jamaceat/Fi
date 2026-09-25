import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  draftFromFixed,
  draftValues,
  FixedForm,
  fixedAccent,
  kindPatch,
  newFixedDraft,
  scheduleChanged,
  type FixedDraft,
} from '@/components/fixed-form';
import { IconTrash } from '@/components/icons';
import { Header, PrimaryButton, Row, Screen, Segmented, T, Tap } from '@/components/ui';
import { C } from '@/constants/theme';
import { endFixed, getFixed, hasResolved, insertFixed, updateFixed, type Fixed } from '@/db/repo';
import { periodRange } from '@/lib/dates';
import { describeSchedule, type Kind } from '@/lib/schedule';
import { useApp } from '@/state/app';

export default function EditarFijo() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { settings, currentPeriod, bump } = useApp();
  const { id, kind: kindParam } = useLocalSearchParams<{ id: string; kind?: string }>();
  const isNew = id === 'nuevo';

  const [original, setOriginal] = useState<Fixed | null>(null);
  const [d, setD] = useState<FixedDraft>(() => newFixedDraft(kindParam === 'ingreso' ? 'ingreso' : 'gasto', settings));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [applyTo, setApplyTo] = useState<'siguientes' | 'todos'>('siguientes');
  // Con pagos ya marcados, pasar entre anticipado y vencido cambiaría cuál es la primera fecha.
  const [lockAnticipated, setLockAnticipated] = useState(false);

  useEffect(() => {
    if (isNew) return;
    hasResolved(db, Number(id)).then(setLockAnticipated);
    getFixed(db, Number(id)).then((f) => {
      if (!f) return;
      setOriginal(f);
      setD(draftFromFixed(f));
    });
  }, [db, id, isNew]);

  const set = (patch: Partial<FixedDraft>) => setD((prev) => ({ ...prev, ...patch }));
  const isGasto = d.kind === 'gasto';
  const accent = fixedAccent(d.kind);
  const startDate = original?.start_date ?? periodRange(currentPeriod, settings.monthStart).from;
  const cantSave = (Number(d.amount) || 0) <= 0 || !d.name.trim();

  const pickKind = (kind: Kind) => {
    if (kind !== d.kind) set(kindPatch(d, kind, isNew, settings));
  };

  const save = async () => {
    if (cantSave) return;
    const values = draftValues(d);
    if (isNew) await insertFixed(db, { ...values, start_date: startDate });
    else await updateFixed(db, Number(id), values, scheduleChanged(original, d) ? applyTo : 'siguientes');
    bump();
    router.back();
  };

  const doDelete = async () => {
    await endFixed(db, Number(id));
    bump();
    router.back();
  };

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

        <FixedForm
          d={d}
          set={set}
          startDate={startDate}
          original={original}
          lockAnticipated={lockAnticipated}
          applyTo={applyTo}
          onApplyTo={setApplyTo}
        />

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
