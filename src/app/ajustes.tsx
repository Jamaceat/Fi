import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import {
  IconCalendar,
  IconChevronDown,
  IconChevronRight,
  IconDownload,
  IconLayout,
  IconRefresh,
  IconTrash,
} from '@/components/icons';
import { Field, Header, RadioDot, Row, Screen, Stack, Stepper, SwitchRow, T, Tap, Toast } from '@/components/ui';
import { C } from '@/constants/theme';
import { wipeData, type DefaultPeriod, type Settings } from '@/db/repo';
import { t } from '@/i18n';
import { authenticate, canLock } from '@/lib/auth';
import { longDate, toISO } from '@/lib/dates';
import { exportCsv } from '@/lib/export';
import { describePreset, presetName, PRESETS, unitLabel, UNITS, type HolidayRule, type Kind, type Preset } from '@/lib/schedule';
import { useApp } from '@/state/app';
import { common, layout } from '@/styles/common';
import { styles as st } from '@/styles/screens/ajustes.styles';

const CACHE_DAYS = [7, 30, 90, 180, 365] as const;

const PRESET_OPTS: Preset[] = [...PRESETS.map((p) => p.id), 'custom'];

const HOLIDAY_RULES: HolidayRule[] = ['mantener', 'antes', 'despues'];

/** Hora guardada → clave de su etiqueta. */
const HOURS = [
  ['7:00', 'morning'],
  ['12:00', 'noon'],
  ['19:00', 'evening'],
] as const;

const KINDS: Kind[] = ['gasto', 'ingreso'];

type ToastState = { title: string; text: string; warn?: boolean };

export default function Ajustes() {
  const db = useSQLiteContext();
  const { settings: s, updateSettings, bump, holidays, holidayYears, refreshHolidays } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<Kind | null>(null);
  const [wiping, setWiping] = useState(false);
  const [wipeText, setWipeText] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);

  const setDef = (kind: Kind, patch: Partial<DefaultPeriod>) =>
    updateSettings({ defs: { ...s.defs, [kind]: { ...s.defs[kind], ...patch } } });
  const toggle = (key: keyof Settings) => updateSettings({ [key]: !s[key] });

  const toggleLock = async () => {
    if (s.lock) return updateSettings({ lock: false });
    if (!(await canLock())) {
      Alert.alert(t('settings.lock.unavailableTitle'), t('settings.lock.unavailableText'));
      return;
    }
    if (await authenticate()) updateSettings({ lock: true });
  };

  const doExport = async () => {
    try {
      const name = await exportCsv(db);
      setToast({ title: t('settings.data.exported'), text: t('settings.data.exportedText', { name }) });
    } catch (e) {
      setToast({ warn: true, title: t('settings.data.exportFailed'), text: String(e) });
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
          ? { warn: true, title: t('settings.holidays.failed'), text: t('settings.holidays.failedText') }
          : { title: t('settings.holidays.updated'), text: t('settings.holidays.updatedText', { count: r.updated }) },
      );
    } finally {
      setRefreshing(false);
    }
  };

  const wipeWord = t('settings.data.wipeWord');
  const cantWipe = wipeText.trim().toUpperCase() !== wipeWord;
  const closeWipe = () => {
    setWiping(false);
    setWipeText('');
  };
  const doWipe = async () => {
    if (cantWipe) return;
    await wipeData(db);
    bump();
    closeWipe();
    setToast({ warn: true, title: t('settings.data.wiped'), text: t('settings.data.wipedText') });
  };

  const holidaySummary =
    holidays.size > 0
      ? years.length
        ? t('settings.holidays.savedRange', { count: holidays.size, from: years[0], to: years.at(-1)! })
        : t('settings.holidays.saved', { count: holidays.size })
      : t('settings.holidays.none');

  return (
    <Screen bottom={48}>
      <Header onBack={() => router.back()} kicker={t('app.name')} title={t('settings.title')} />

      {toast && <Toast title={toast.title} text={toast.text} warn={toast.warn} onClose={() => setToast(null)} />}

      <Stack gap={10}>
        <Stack gap={4}>
          <T w={800} size={16}>
            {t('settings.defaults.title')}
          </T>
          <T size={12.5} color={C.muted}>
            {t('settings.defaults.text')}
          </T>
        </Stack>
        <View style={common.box}>
          {KINDS.map((kind, i) => {
            const d = s.defs[kind];
            const isG = kind === 'gasto';
            const accent = isG ? C.ink : C.in;
            const custom = d.preset === 'custom';
            const isOpen = open === kind;
            return (
              <View key={kind} style={i > 0 && common.divider}>
                <Tap onPress={() => setOpen(isOpen ? null : kind)} style={st.defRow} accessibilityState={{ expanded: isOpen }}>
                  <View style={[st.defIcon, isG ? st.defIconOut : st.defIconIn]}>
                    <IconCalendar color={isG ? C.ink : C.inDark} />
                  </View>
                  <Stack gap={1} style={layout.fill}>
                    <T w={700} size={14.5}>
                      {t(`settings.defaults.kind.${kind}`)}
                    </T>
                    <T w={600} size={12.5} color={C.muted}>
                      {describePreset(d.preset, d.n, d.unit)}
                    </T>
                  </Stack>
                  <View style={isOpen && st.chevronOpen}>
                    <IconChevronDown size={16} color={C.faint} />
                  </View>
                </Tap>
                {isOpen && (
                  <View style={st.defPanel}>
                    <View style={st.optGrid}>
                      {PRESET_OPTS.map((id) => {
                        const sel = id === d.preset;
                        return (
                          <Tap
                            key={id}
                            onPress={() => setDef(kind, { preset: id })}
                            accessibilityState={{ selected: sel }}
                            style={[st.opt, { backgroundColor: sel ? accent : C.card, borderColor: sel ? accent : C.line }]}>
                            <T w={700} size={13} color={sel ? C.white : C.ink}>
                              {presetName(id)}
                            </T>
                          </Tap>
                        );
                      })}
                    </View>
                    <View style={[st.customPanel, !custom && st.customPanelOff]}>
                      <Row style={layout.between}>
                        <T w={700} size={13.5}>
                          {t('settings.defaults.customEvery')}
                        </T>
                        <Stepper
                          value={String(d.n)}
                          onDec={() => setDef(kind, { n: Math.max(1, d.n - 1), preset: 'custom' })}
                          onInc={() => setDef(kind, { n: Math.min(365, d.n + 1), preset: 'custom' })}
                          decLabel={t('fixedForm.intervalDecrease')}
                          incLabel={t('fixedForm.intervalIncrease')}
                        />
                      </Row>
                      <Row gap={4} style={st.units}>
                        {UNITS.map((u) => {
                          const sel = u === d.unit;
                          return (
                            <Tap
                              key={u}
                              onPress={() => setDef(kind, { unit: u, preset: 'custom' })}
                              accessibilityState={{ selected: sel }}
                              style={[st.unit, sel && (custom ? { backgroundColor: accent } : st.unitOn)]}>
                              <T w={800} size={13} color={sel ? (custom ? C.white : C.ink) : C.muted2}>
                                {unitLabel(u)}
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
      </Stack>

      <Stack gap={10}>
        <T w={800} size={16}>
          {t('settings.month.title')}
        </T>
        <View style={[common.box, common.boxPadded]}>
          <Row gap={12} style={st.settingRow}>
            <Stack gap={2} style={layout.fill}>
              <T w={700} size={14.5}>
                {t('settings.month.start')}
              </T>
              <T size={12.5} color={C.muted}>
                {t('settings.month.startText')}
              </T>
            </Stack>
            <Stepper
              value={String(s.monthStart)}
              onDec={() => updateSettings({ monthStart: Math.max(1, s.monthStart - 1) })}
              onInc={() => updateSettings({ monthStart: Math.min(28, s.monthStart + 1) })}
              decLabel={t('settings.month.prevDay')}
              incLabel={t('settings.month.nextDay')}
            />
          </Row>
          <View style={[common.divider, st.radioGroup]}>
            <T w={700} size={14.5}>
              {t('settings.month.holidayRule')}
            </T>
            {HOLIDAY_RULES.map((id) => (
              <RadioOption
                key={id}
                label={t(`settings.month.rules.${id}`)}
                on={s.holiday === id}
                onPress={() => updateSettings({ holiday: id })}
              />
            ))}
          </View>
        </View>
      </Stack>

      <Stack gap={10}>
        <Stack gap={4}>
          <T w={800} size={16}>
            {t('settings.holidays.title')}
          </T>
          <T size={12.5} color={C.muted}>
            {t('settings.holidays.text')}
          </T>
        </Stack>
        <View style={[common.box, st.holidayBox]}>
          <T w={700} size={14.5}>
            {t('settings.holidays.cacheFor')}
          </T>
          <View style={st.optGrid}>
            {CACHE_DAYS.map((days) => {
              const sel = s.holidayCacheDays === days;
              return (
                <Tap
                  key={days}
                  onPress={() => updateSettings({ holidayCacheDays: days })}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: sel }}
                  style={[st.opt, { backgroundColor: sel ? C.holiday : C.card, borderColor: sel ? C.holiday : C.line }]}>
                  <T w={700} size={13} color={sel ? C.white : C.ink}>
                    {t(`settings.holidays.cacheOptions.d${days}`)}
                  </T>
                </Tap>
              );
            })}
          </View>
          <Row gap={12} style={[common.divider, st.holidayStatus]}>
            <View style={[st.defIcon, st.defIconHoliday]}>
              <IconCalendar color={C.holidayDark} />
            </View>
            <Stack gap={2} style={layout.fill}>
              <T w={700} size={14}>
                {holidaySummary}
              </T>
              <T size={12.5} color={C.muted}>
                {lastSync
                  ? t('settings.holidays.lastSync', { date: longDate(toISO(new Date(lastSync))) })
                  : t('settings.holidays.willDownload')}
              </T>
            </Stack>
          </Row>
          <Tap onPress={refreshing ? undefined : doRefresh} style={[common.outlineBtn, st.refreshBtn, refreshing && st.refreshing]}>
            <IconRefresh size={17} color={C.holidayDark} />
            <T w={800} size={14} color={C.holidayDark}>
              {refreshing ? t('settings.holidays.refreshing') : t('settings.holidays.refresh')}
            </T>
          </Tap>
        </View>
      </Stack>

      <Stack gap={10}>
        <T w={800} size={16}>
          {t('settings.alerts.title')}
        </T>
        <View style={[common.box, common.boxPadded]}>
          <SwitchRow
            first
            label={t('settings.alerts.remindFixed')}
            desc={t('settings.alerts.remindFixedText')}
            on={s.remindFijos}
            onPress={() => toggle('remindFijos')}
          />
          <SwitchRow
            label={t('settings.alerts.budget')}
            desc={t('settings.alerts.budgetText')}
            on={s.budgetAlert}
            onPress={() => toggle('budgetAlert')}
          />
          {s.budgetAlert && (
            <Row style={[common.divider, st.settingRowCompact]}>
              <T w={700} size={14.5} style={layout.fill}>
                {t('settings.alerts.budgetAt')}
              </T>
              <Stepper
                minWidth={56}
                value={t('settings.alerts.percent', { pct: s.budget })}
                onDec={() => updateSettings({ budget: Math.max(50, s.budget - 5) })}
                onInc={() => updateSettings({ budget: Math.min(100, s.budget + 5) })}
                decLabel={t('settings.alerts.percentDown')}
                incLabel={t('settings.alerts.percentUp')}
              />
            </Row>
          )}
          <SwitchRow
            label={t('settings.alerts.weekly')}
            desc={t('settings.alerts.weeklyText')}
            on={s.weekly}
            onPress={() => toggle('weekly')}
          />
          <View style={[common.divider, st.radioGroup]}>
            <T w={700} size={14.5}>
              {t('settings.alerts.hour')}
            </T>
            <Row gap={8}>
              {HOURS.map(([id, key]) => {
                const sel = s.hour === id;
                return (
                  <Tap
                    key={id}
                    onPress={() => updateSettings({ hour: id })}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: sel }}
                    style={[st.hour, sel ? st.radioOn : st.radioOff]}>
                    <T w={700} size={13} color={sel ? C.inDark : C.ink}>
                      {t(`settings.alerts.hours.${key}`)}
                    </T>
                  </Tap>
                );
              })}
            </Row>
          </View>
        </View>
      </Stack>

      <Stack gap={10}>
        <T w={800} size={16}>
          {t('settings.privacy.title')}
        </T>
        <View style={[common.box, common.boxPadded]}>
          <SwitchRow
            first
            label={t('settings.privacy.hideAmounts')}
            desc={t('settings.privacy.hideAmountsText')}
            on={s.hideAmounts}
            onPress={() => toggle('hideAmounts')}
          />
          <SwitchRow label={t('settings.privacy.lock')} desc={t('settings.privacy.lockText')} on={s.lock} onPress={toggleLock} />
          <Row gap={12} style={[common.divider, st.settingRow]}>
            <Stack gap={2} style={layout.fill}>
              <T w={700} size={14.5}>
                {t('settings.privacy.currency')}
              </T>
              <T size={12.5} color={C.muted}>
                {t('settings.privacy.currencyFormat')}
              </T>
            </Stack>
            <T w={700} size={13} color={C.muted}>
              {t('settings.privacy.currencyName')}
            </T>
          </Row>
        </View>
      </Stack>

      <Stack gap={10}>
        <T w={800} size={16}>
          {t('settings.home.title')}
        </T>
        <Tap onPress={() => router.push('/orden-inicio')} style={[common.box, st.defRow]} accessibilityRole="button">
          <View style={[st.defIcon, st.defIconNeutral]}>
            <IconLayout />
          </View>
          <Stack gap={1} style={layout.fill}>
            <T w={700} size={14.5}>
              {t('settings.home.reorder')}
            </T>
            <T w={600} size={12.5} color={C.muted}>
              {t('settings.home.reorderText')}
            </T>
          </Stack>
          <IconChevronRight size={16} color={C.faint} />
        </Tap>
      </Stack>

      <Stack gap={10}>
        <T w={800} size={16}>
          {t('settings.data.title')}
        </T>
        <Stack gap={10}>
          <Tap onPress={doExport} style={common.outlineBtn}>
            <IconDownload />
            <T w={800} size={14.5}>
              {t('settings.data.export')}
            </T>
          </Tap>
          {!wiping ? (
            <Tap
              onPress={() => {
                setWiping(true);
                setWipeText('');
              }}
              style={common.outlineBtn}>
              <IconTrash color={C.danger} />
              <T w={800} size={14.5} color={C.danger}>
                {t('settings.data.wipeAll')}
              </T>
            </Tap>
          ) : (
            <View style={common.dangerPanel} accessibilityRole="alert">
              <T w={800} size={15}>
                {t('settings.data.wipeTitle')}
              </T>
              <T size={13} color={C.muted2} style={common.bodyText}>
                {t('settings.data.wipeText')}
              </T>
              <T w={700} size={13}>
                {t('settings.data.wipeTypeToConfirm', { word: wipeWord })}
              </T>
              <Field
                value={wipeText}
                onChangeText={(text) => setWipeText(text.slice(0, 12))}
                placeholder={wipeWord}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <Row gap={8}>
                <Tap onPress={closeWipe} style={[common.confirmBtn, common.confirmCancel]}>
                  <T w={800} size={14}>
                    {t('common.cancel')}
                  </T>
                </Tap>
                <Tap onPress={doWipe} style={[common.confirmBtn, common.confirmDanger, cantWipe && common.disabled]}>
                  <T w={800} size={14} color={C.white}>
                    {t('settings.data.wipeConfirm')}
                  </T>
                </Tap>
              </Row>
            </View>
          )}
        </Stack>
      </Stack>
    </Screen>
  );
}

function RadioOption({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      style={[st.radio, on ? st.radioOn : st.radioOff]}>
      <RadioDot on={on} accent={C.in} />
      <T w={700} size={13.5} color={on ? C.inDark : C.ink}>
        {label}
      </T>
    </Tap>
  );
}
