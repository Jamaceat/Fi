import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import {
  IconCalendar,
  IconChevronDown,
  IconChevronRight,
  IconClock,
  IconDownload,
  IconLayout,
  IconRefresh,
  IconTrash,
  IconUpload,
} from '@/components/icons';
import {
  Field,
  Header,
  Label,
  RadioDot,
  Row,
  Screen,
  Segmented,
  Stack,
  Stepper,
  SwitchRow,
  T,
  Tap,
  Toast,
} from '@/components/ui';
import { C } from '@/constants/theme';
import { wipeData, type DefaultPeriod, type Settings } from '@/db/repo';
import { t } from '@/i18n';
import { authenticate, canLock } from '@/lib/auth';
import { clampDay, fromISO, fullDate, lastDayOfMonth, longDate, realTodayISO, todayISO, toISO } from '@/lib/dates';
import { pickBackup, shareBackup, type Backup } from '@/lib/backup';
import { exportCsv } from '@/lib/export';
import { describePreset, presetName, PRESETS, unitLabel, UNITS, type HolidayRule, type Kind, type Preset } from '@/lib/schedule';
import { useApp } from '@/state/app';
import { common, layout } from '@/styles/common';
import { styles as st } from '@/styles/screens/ajustes.styles';

const CACHE_DAYS = [7, 30, 90, 180, 365] as const;

const BACKUP_DAYS = [1, 3, 7, 15, 30] as const;

const PRESET_OPTS: Preset[] = [...PRESETS.map((p) => p.id), 'custom'];

const HOLIDAY_RULES: HolidayRule[] = ['mantener', 'antes', 'despues'];

/** Hora guardada → clave de su etiqueta. */
const HOURS = [
  ['7:00', 'morning'],
  ['12:00', 'noon'],
  ['19:00', 'evening'],
] as const;

const KINDS: Kind[] = ['gasto', 'ingreso'];

/** Pestañas de Ajustes: cada sección vive en una sola. */
const TABS = ['fechas', 'avisos', 'general', 'datos'] as const;
type Tab = (typeof TABS)[number];

type ToastState = { title: string; text: string; warn?: boolean };

export default function Ajustes() {
  const db = useSQLiteContext();
  const {
    settings: s,
    updateSettings,
    bump,
    holidays,
    holidayYears,
    refreshHolidays,
    lastBackup,
    backupNow,
    removeBackup,
    loadBackup,
    simulatedToday,
    setSimulatedToday,
  } = useApp();
  const [tab, setTab] = useState<Tab>('fechas');
  const [refreshing, setRefreshing] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
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

  const doBackup = async () => {
    setBackingUp(true);
    try {
      await backupNow();
      setToast({ title: t('settings.backup.saved'), text: t('settings.backup.savedText') });
    } catch (e) {
      setToast({ warn: true, title: t('settings.backup.failed'), text: String(e) });
    } finally {
      setBackingUp(false);
    }
  };

  const doExportBackup = async () => {
    try {
      await backupNow();
      const name = await shareBackup();
      setToast({ title: t('settings.backup.exported'), text: t('settings.backup.exportedText', { name }) });
    } catch (e) {
      setToast({ warn: true, title: t('settings.backup.exportFailed'), text: String(e) });
    }
  };

  const applyImport = async (backup: Backup) => {
    try {
      await loadBackup(backup);
      setToast({ title: t('settings.backup.imported'), text: t('settings.backup.importedText') });
    } catch (e) {
      setToast({ warn: true, title: t('settings.backup.importFailed'), text: String(e) });
    }
  };

  const doImport = async () => {
    let backup: Backup | null;
    try {
      backup = await pickBackup();
    } catch (e) {
      setToast({ warn: true, title: t('settings.backup.importFailed'), text: e instanceof Error ? e.message : String(e) });
      return;
    }
    if (!backup) return;
    const created = backup.createdAt ? new Date(backup.createdAt) : null;
    Alert.alert(
      t('settings.backup.importConfirmTitle'),
      created && !isNaN(created.getTime())
        ? t('settings.backup.importConfirmText', { date: longDate(toISO(created)) })
        : t('settings.backup.importConfirmTextNoDate'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('settings.backup.importConfirm'), style: 'destructive', onPress: () => applyImport(backup) },
      ],
    );
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
    // Sin respaldo, la próxima apertura con la base vacía se toma como un inicio desde cero.
    removeBackup();
    bump();
    closeWipe();
    setToast({ warn: true, title: t('settings.data.wiped'), text: t('settings.data.wipedText') });
  };

  // Cada parte de la fecha se mueve dentro de sus límites, sin pasar al mes o año vecino.
  const today = todayISO();
  const sim = fromISO(today);
  const [simY, simM, simD] = [sim.getFullYear(), sim.getMonth(), sim.getDate()];
  const simulate = (y: number, m: number, d: number) => setSimulatedToday(toISO(clampDay(y, m, d)));
  const simulateDay = (n: number) => simulate(simY, simM, Math.min(Math.max(1, simD + n), lastDayOfMonth(simY, simM)));
  const simulateMonth = (n: number) => simulate(simY, Math.min(Math.max(0, simM + n), 11), simD);
  const simulateYear = (n: number) => simulate(Math.min(Math.max(2000, simY + n), 2100), simM, simD);

  const holidaySummary =
    holidays.size > 0
      ? years.length
        ? t('settings.holidays.savedRange', { count: holidays.size, from: years[0], to: years.at(-1)! })
        : t('settings.holidays.saved', { count: holidays.size })
      : t('settings.holidays.none');

  return (
    <Screen bottom={48}>
      <Header onBack={() => router.back()} kicker={t('app.name')} title={t('settings.title')} />

      <Segmented options={TABS.map((id) => ({ id, label: t(`settings.tabs.${id}`) }))} value={tab} onChange={setTab} />

      {toast && <Toast title={toast.title} text={toast.text} warn={toast.warn} onClose={() => setToast(null)} />}

      {tab === 'fechas' && (
        <>
          <Stack gap={10}>
            <Stack gap={4}>
              <Label text={t('settings.defaults.title')} help={t('settings.help.defaults')} size={16} />
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
                    <Tap
                      onPress={() => setOpen(isOpen ? null : kind)}
                      style={st.defRow}
                      accessibilityState={{ expanded: isOpen }}>
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
                  <Label text={t('settings.month.start')} help={t('settings.help.monthStart')} w={700} size={14.5} />
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
                <Label text={t('settings.month.holidayRule')} help={t('settings.help.holidayRule')} w={700} size={14.5} />
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
              <Label text={t('settings.holidays.cacheFor')} help={t('settings.help.cacheFor')} w={700} size={14.5} />
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
              <Tap
                onPress={refreshing ? undefined : doRefresh}
                style={[common.outlineBtn, st.refreshBtn, refreshing && st.refreshing]}>
                <IconRefresh size={17} color={C.holidayDark} />
                <T w={800} size={14} color={C.holidayDark}>
                  {refreshing ? t('settings.holidays.refreshing') : t('settings.holidays.refresh')}
                </T>
              </Tap>
            </View>
          </Stack>
        </>
      )}

      {tab === 'avisos' && (
        <Stack gap={10}>
          <T w={800} size={16}>
            {t('settings.alerts.title')}
          </T>
          <View style={[common.box, common.boxPadded]}>
            <SwitchRow
              first
              label={t('settings.alerts.remindFixed')}
              desc={t('settings.alerts.remindFixedText')}
              help={t('settings.help.remindFixed')}
              on={s.remindFijos}
              onPress={() => toggle('remindFijos')}
            />
            <SwitchRow
              label={t('settings.alerts.budget')}
              desc={t('settings.alerts.budgetText')}
              help={t('settings.help.budget')}
              on={s.budgetAlert}
              onPress={() => toggle('budgetAlert')}
            />
            {s.budgetAlert && (
              <Row style={[common.divider, st.settingRowCompact]}>
                <Label
                  text={t('settings.alerts.budgetAt')}
                  help={t('settings.help.budgetAt')}
                  w={700}
                  size={14.5}
                  style={layout.fill}
                />
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
              help={t('settings.help.weekly')}
              on={s.weekly}
              onPress={() => toggle('weekly')}
            />
            <View style={[common.divider, st.radioGroup]}>
              <Label text={t('settings.alerts.hour')} help={t('settings.help.hour')} w={700} size={14.5} />
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
      )}

      {tab === 'general' && (
        <>
          <Stack gap={10}>
            <T w={800} size={16}>
              {t('settings.privacy.title')}
            </T>
            <View style={[common.box, common.boxPadded]}>
              <SwitchRow
                first
                label={t('settings.privacy.hideAmounts')}
                desc={t('settings.privacy.hideAmountsText')}
                help={t('settings.help.hideAmounts')}
                on={s.hideAmounts}
                onPress={() => toggle('hideAmounts')}
              />
              <SwitchRow
                label={t('settings.privacy.lock')}
                desc={t('settings.privacy.lockText')}
                help={t('settings.help.lock')}
                on={s.lock}
                onPress={toggleLock}
              />
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
              {t('settings.forms.title')}
            </T>
            <View style={[common.box, common.boxPadded]}>
              <SwitchRow
                first
                label={t('settings.forms.stickyFooter')}
                desc={t('settings.forms.stickyFooterText')}
                help={t('settings.help.stickyFooter')}
                on={s.stickyFooter}
                onPress={() => toggle('stickyFooter')}
              />
            </View>
          </Stack>
        </>
      )}

      {tab === 'datos' && (
        <>
          <Stack gap={10}>
            <Stack gap={4}>
              <T w={800} size={16}>
                {t('settings.backup.title')}
              </T>
              <T size={12.5} color={C.muted}>
                {t('settings.backup.text')}
              </T>
            </Stack>
            <View style={[common.box, st.backupBox]}>
              <Label text={t('settings.backup.every')} help={t('settings.help.backupEvery')} w={700} size={14.5} />
              <View style={st.optGrid}>
                {BACKUP_DAYS.map((days) => {
                  const sel = s.backupDays === days;
                  return (
                    <Tap
                      key={days}
                      onPress={() => updateSettings({ backupDays: days })}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: sel }}
                      style={[st.opt, { backgroundColor: sel ? C.in : C.card, borderColor: sel ? C.in : C.line }]}>
                      <T w={700} size={13} color={sel ? C.white : C.ink}>
                        {t(`settings.backup.options.d${days}`)}
                      </T>
                    </Tap>
                  );
                })}
              </View>
              <Row gap={12} style={[common.divider, st.backupStatus]}>
                <View style={[st.defIcon, st.defIconIn]}>
                  <IconClock size={18} color={C.inDark} />
                </View>
                <Stack gap={2} style={layout.fill}>
                  <T w={700} size={14}>
                    {lastBackup
                      ? t('settings.backup.last', { date: longDate(toISO(new Date(lastBackup))) })
                      : t('settings.backup.none')}
                  </T>
                  <T size={12.5} color={C.muted}>
                    {lastBackup ? t('settings.backup.nextText') : t('settings.backup.noneText')}
                  </T>
                </Stack>
              </Row>
              <Tap
                onPress={backingUp ? undefined : doBackup}
                style={[common.outlineBtn, st.refreshBtn, backingUp && st.refreshing]}>
                <IconRefresh size={17} color={C.inDark} />
                <T w={800} size={14} color={C.inDark}>
                  {backingUp ? t('settings.backup.saving') : t('settings.backup.now')}
                </T>
              </Tap>
              <Row gap={8}>
                <Tap onPress={doExportBackup} style={[common.outlineBtn, st.refreshBtn, layout.fill]}>
                  <IconDownload size={17} />
                  <T w={800} size={14}>
                    {t('settings.backup.export')}
                  </T>
                </Tap>
                <Tap onPress={doImport} style={[common.outlineBtn, st.refreshBtn, layout.fill]}>
                  <IconUpload size={17} />
                  <T w={800} size={14}>
                    {t('settings.backup.import')}
                  </T>
                </Tap>
              </Row>
            </View>
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

          {__DEV__ && (
            <Stack gap={10}>
              <Stack gap={4}>
                <T w={800} size={16}>
                  {t('settings.dev.title')}
                </T>
                <T size={12.5} color={C.muted}>
                  {t('settings.dev.text')}
                </T>
              </Stack>
              <View style={[common.box, st.backupBox]}>
                <Row gap={12}>
                  <View style={[st.defIcon, simulatedToday ? st.defIconHoliday : st.defIconNeutral]}>
                    <IconCalendar color={simulatedToday ? C.holidayDark : C.ink} />
                  </View>
                  <Stack gap={2} style={layout.fill}>
                    <T w={700} size={14}>
                      {fullDate(today)}
                    </T>
                    <T size={12.5} color={C.muted}>
                      {simulatedToday ? t('settings.dev.simulated', { date: longDate(realTodayISO()) }) : t('settings.dev.real')}
                    </T>
                  </Stack>
                </Row>
                <Row style={[common.divider, st.settingRowCompact]}>
                  <T w={700} size={14.5} style={layout.fill}>
                    {t('settings.dev.day')}
                  </T>
                  <Stepper
                    value={String(simD)}
                    onDec={() => simulateDay(-1)}
                    onInc={() => simulateDay(1)}
                    decLabel={t('settings.dev.prevDay')}
                    incLabel={t('settings.dev.nextDay')}
                  />
                </Row>
                <Row style={st.settingRowCompact}>
                  <T w={700} size={14.5} style={layout.fill}>
                    {t('settings.dev.month')}
                  </T>
                  <Stepper
                    value={String(simM + 1)}
                    onDec={() => simulateMonth(-1)}
                    onInc={() => simulateMonth(1)}
                    decLabel={t('settings.dev.prevMonth')}
                    incLabel={t('settings.dev.nextMonth')}
                  />
                </Row>
                <Row style={st.settingRowCompact}>
                  <T w={700} size={14.5} style={layout.fill}>
                    {t('settings.dev.year')}
                  </T>
                  <Stepper
                    minWidth={56}
                    value={String(simY)}
                    onDec={() => simulateYear(-1)}
                    onInc={() => simulateYear(1)}
                    decLabel={t('settings.dev.prevYear')}
                    incLabel={t('settings.dev.nextYear')}
                  />
                </Row>
                {simulatedToday && (
                  <Tap onPress={() => setSimulatedToday(null)} style={[common.outlineBtn, st.refreshBtn]}>
                    <IconRefresh size={17} />
                    <T w={800} size={14}>
                      {t('settings.dev.reset')}
                    </T>
                  </Tap>
                )}
              </View>
            </Stack>
          )}
        </>
      )}
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
