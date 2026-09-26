import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import {
  draftFromFixed,
  draftValues,
  FixedForm,
  fixedAccent,
  kindPatch,
  newFixedDraft,
  scheduleChanged,
  type ApplyTo,
  type FixedDraft,
} from '@/components/fixed-form';
import { IconTrash } from '@/components/icons';
import { Header, PrimaryButton, Row, Screen, Segmented, T, Tap } from '@/components/ui';
import { C } from '@/constants/theme';
import { endFixed, getFixed, hasResolved, insertFixed, updateFixed, type Fixed } from '@/db/repo';
import { t } from '@/i18n';
import { periodRange } from '@/lib/dates';
import { describeSchedule, type Kind } from '@/lib/schedule';
import { useApp } from '@/state/app';
import { common, layout } from '@/styles/common';
import { styles as st } from '@/styles/screens/fijo-editar.styles';

export default function EditarFijo() {
  const db = useSQLiteContext();
  const { settings, currentPeriod, bump } = useApp();
  const { id, kind: kindParam } = useLocalSearchParams<{ id: string; kind?: string }>();
  const isNew = id === 'nuevo';

  const [original, setOriginal] = useState<Fixed | null>(null);
  const [d, setD] = useState<FixedDraft>(() => newFixedDraft(kindParam === 'ingreso' ? 'ingreso' : 'gasto', settings));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [applyTo, setApplyTo] = useState<ApplyTo>('siguientes');
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

  const footer = (
    <Row gap={10}>
      <Tap onPress={() => router.back()} style={st.cancel}>
        <T w={800} size={15}>
          {t('common.cancel')}
        </T>
      </Tap>
      <View style={st.save}>
        <PrimaryButton
          label={isNew ? t('fixedEdit.create') : t('common.saveChanges')}
          bg={accent}
          disabled={cantSave}
          onPress={save}
          icon={false}
        />
      </View>
    </Row>
  );

  return (
    <View style={layout.screen}>
      <Screen bottom={130} footer={footer} stickyFooter={settings.stickyFooter}>
        <Header
          onBack={() => router.back()}
          kicker={t(`fixedEdit.kicker.${d.kind}`)}
          title={isNew ? t('fixedEdit.newTitle') : t('fixedEdit.editTitle')}
        />

        <Segmented
          options={[
            { id: 'gasto', label: t('common.expense') },
            { id: 'ingreso', label: t('common.income'), activeFg: C.inDark },
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
          <Tap onPress={() => setConfirmDelete(true)} style={[common.outlineBtn, st.deleteBtn]}>
            <IconTrash color={C.danger} />
            <T w={800} size={14.5} color={C.danger}>
              {t(`fixedEdit.delete.${d.kind}`)}
            </T>
          </Tap>
        )}
        {confirmDelete && (
          <View style={[common.dangerPanel, st.confirm]} accessibilityRole="alert">
            <T w={800} size={15}>
              {t('fixedEdit.confirmTitle', { name: d.name.trim() || t('fixedEdit.thisFixed') })}
            </T>
            <T size={13} color={C.muted2}>
              {t('fixedEdit.confirmText')}
            </T>
            <Row gap={8}>
              <Tap onPress={() => setConfirmDelete(false)} style={[common.confirmBtn, common.confirmCancel]}>
                <T w={800} size={14}>
                  {t('common.cancel')}
                </T>
              </Tap>
              <Tap onPress={doDelete} style={[common.confirmBtn, common.confirmDanger]}>
                <T w={800} size={14} color={C.white}>
                  {t('common.delete')}
                </T>
              </Tap>
            </Row>
          </View>
        )}
        {!isNew && original && (
          <T size={12} color={C.muted} style={st.current}>
            {t('fixedEdit.current', { schedule: describeSchedule(original) })}
          </T>
        )}
      </Screen>
    </View>
  );
}
