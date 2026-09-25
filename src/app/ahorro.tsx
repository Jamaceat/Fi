import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState, type ReactNode } from 'react';
import { Alert, View } from 'react-native';

import { IconPlus, IconRefresh, IconTarget } from '@/components/icons';
import {
  AmountField,
  Card,
  Field,
  Header,
  Label,
  PrimaryButton,
  Progress,
  Row,
  Screen,
  Sheet,
  Stack,
  T,
  Tap,
  Toast,
} from '@/components/ui';
import { C } from '@/constants/theme';
import { contributeGoal, deleteGoal, insertGoal, insertSavings, listGoals, listSavings, type Goal } from '@/db/repo';
import { t } from '@/i18n';
import { periodLabel, periodRange, shortDate, todayISO } from '@/lib/dates';
import { cleanAmount, dots, fmt, joinMeta, signed } from '@/lib/format';
import { useApp, useLoad } from '@/state/app';
import { common, layout } from '@/styles/common';
import { styles as st } from '@/styles/screens/ahorro.styles';

type SheetKind = 'update' | 'add' | 'goal' | 'newGoal';

/** Montos rápidos para sumar al campo. */
const QUICK_AMOUNTS = [50000, 100000, 200000];

const pctOf = (saved: number, target: number) => (target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0);

export default function Ahorro() {
  const db = useSQLiteContext();
  const { currentPeriod, settings, bump } = useApp();
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [goalId, setGoalId] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [result, setResult] = useState<{ title: string; text: string; negative?: boolean } | null>(null);

  const data = useLoad(async (d) => {
    const [entries, goals] = await Promise.all([listSavings(d), listGoals(d)]);
    return { entries, goals };
  }, []);
  const entries = data?.entries ?? [];
  const goals = data?.goals ?? [];

  const balance = entries[0]?.after ?? 0;
  const lastDate = entries[0] ? shortDate(entries[0].date) : '—';
  const range = periodRange(currentPeriod, settings.monthStart);
  const monthTotal = entries.filter((e) => e.date >= range.from && e.date < range.to).reduce((s, e) => s + e.delta, 0);
  const goalsSaved = goals.reduce((s, g) => s + g.saved, 0);
  const goal = sheet === 'goal' ? goals.find((g) => g.id === goalId) : undefined;
  const amount = Number(input) || 0;

  const open = (k: SheetKind, gid: number | null = null) => {
    setSheet(k);
    setGoalId(gid);
    setInput('');
    setNameInput('');
  };
  const close = () => setSheet(null);

  let previewTitle = '';
  let previewValue = '';
  let previewNeg = false;
  if (sheet === 'update') {
    if (!input) previewTitle = t('savings.preview.typeBalance');
    else {
      const d = amount - balance;
      previewTitle = d > 0 ? t('savings.preview.saved') : d < 0 ? t('savings.preview.dropped') : t('savings.preview.noChange');
      previewValue = fmt(d);
      previewNeg = d < 0;
    }
  } else if (sheet === 'add') {
    previewTitle = t('savings.preview.newTotal');
    previewValue = fmt(balance + amount);
  } else if (goal) {
    previewTitle = t('savings.preview.newGoalBalance', { pct: pctOf(goal.saved + amount, goal.target) });
    previewValue = fmt(goal.saved + amount);
  } else if (sheet === 'newGoal') {
    previewTitle = t('savings.preview.startAt');
    previewValue = fmt(amount);
  }
  const previewStyle = previewNeg
    ? st.previewNegative
    : sheet === 'newGoal' || !input
      ? st.previewNeutral
      : st.previewPositive;
  const previewColor = previewNeg ? C.warn : C.inDark;

  const cantSave =
    sheet === 'update' ? !input : sheet === 'newGoal' ? amount <= 0 || !nameInput.trim() : amount <= 0;

  const sheetTitle = sheet === 'goal' && goal ? t('savings.sheet.contributeTo', { name: goal.name }) : sheet ? t(`savings.sheet.title.${sheet}`) : '';

  const confirm = async () => {
    if (cantSave || !sheet) return;
    const today = todayISO();
    if (sheet === 'update') {
      const d = amount - balance;
      await insertSavings(db, { kind: 'update', date: today, delta: d, after: amount });
      setResult({
        negative: d < 0,
        title:
          d > 0
            ? t('savings.result.saved', { amount: fmt(d) })
            : d < 0
              ? t('savings.result.dropped', { amount: fmt(d) })
              : t('savings.result.unchanged'),
        text: entries.length ? t('savings.result.comparedTo', { date: lastDate }) : t('savings.result.first'),
      });
    } else if (sheet === 'add') {
      await insertSavings(db, { kind: 'add', date: today, delta: amount, after: balance + amount });
      setResult({
        title: t('savings.result.added', { amount: fmt(amount) }),
        text: t('savings.result.newTotal', { amount: fmt(balance + amount) }),
      });
    } else if (sheet === 'goal' && goal) {
      await contributeGoal(db, goal.id, amount);
      const saved = goal.saved + amount;
      const left = Math.max(0, goal.target - saved);
      setResult({
        title: t('savings.result.contributed', { amount: fmt(amount), name: goal.name }),
        text: left > 0 ? t('savings.result.progress', { pct: pctOf(saved, goal.target), left: fmt(left) }) : t('savings.result.goalDone'),
      });
    } else if (sheet === 'newGoal') {
      const name = nameInput.trim();
      await insertGoal(db, name, amount);
      setResult({ title: t('savings.result.goalCreated', { name }), text: t('savings.result.target', { amount: fmt(amount) }) });
    }
    close();
    bump();
  };

  const askDeleteGoal = (g: Goal) =>
    Alert.alert(t('savings.deleteGoal.title', { name: g.name }), t('savings.deleteGoal.text'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteGoal(db, g.id);
          bump();
        },
      },
    ]);

  return (
    <View style={layout.screen}>
      <Screen bottom={48}>
        <Header onBack={() => router.back()} kicker={periodLabel(currentPeriod)} title={t('savings.title')} />

        <View style={st.hero}>
          <Stack gap={4}>
            <T w={700} size={13} color={C.inSub}>
              {t('savings.total')}
            </T>
            <T serif size={40} color={C.inHeroText} tabular numberOfLines={1} adjustsFontSizeToFit style={st.heroAmount}>
              {fmt(balance)}
            </T>
          </Stack>
          <Row gap={10}>
            <View style={st.heroTile}>
              <T w={700} size={12.5} color={C.inSub}>
                {t('savings.thisMonth')}
              </T>
              <T w={800} size={16} color={C.inHeroText} tabular>
                {signed(monthTotal)}
              </T>
            </View>
            <View style={st.heroTile}>
              <T w={700} size={12.5} color={C.inSub}>
                {t('savings.lastEntry')}
              </T>
              <T w={800} size={16} color={C.inHeroText}>
                {lastDate}
              </T>
            </View>
          </Row>
        </View>

        <Row gap={10}>
          <ActionTile
            icon={<IconRefresh color={C.inDark} />}
            title={t('savings.sheet.title.update')}
            desc={t('savings.actions.updateDesc')}
            onPress={() => open('update')}
          />
          <ActionTile
            icon={<IconPlus color={C.inDark} />}
            title={t('savings.sheet.title.add')}
            desc={t('savings.actions.addDesc')}
            onPress={() => open('add')}
          />
        </Row>

        {result && <Toast title={result.title} text={result.text} warn={result.negative} onClose={() => setResult(null)} />}

        <Stack gap={10}>
          <Row style={layout.between}>
            <Stack gap={2} style={layout.fill}>
              <T w={800} size={16}>
                {t('savings.goals.title')}
              </T>
              <T size={12.5} color={C.muted}>
                {goals.length
                  ? t('savings.goals.summary', { amount: fmt(goalsSaved), count: goals.length })
                  : t('savings.goals.empty')}
              </T>
            </Stack>
            <Tap style={common.pillBtn} onPress={() => open('newGoal')}>
              <IconPlus size={16} />
              <T w={800} size={13.5}>
                {t('savings.sheet.title.newGoal')}
              </T>
            </Tap>
          </Row>
          {goals.map((g) => {
            const pct = pctOf(g.saved, g.target);
            const left = Math.max(0, g.target - g.saved);
            return (
              <Tap key={g.id} onLongPress={() => askDeleteGoal(g)} style={st.goal}>
                <Row gap={12}>
                  <View style={[common.iconTile, st.goalIcon]}>
                    <IconTarget color={C.inDark} />
                  </View>
                  <Stack gap={2} style={layout.fill}>
                    <T w={800} size={15}>
                      {g.name}
                    </T>
                    <T size={12.5} color={C.muted}>
                      {g.last_date ? t('savings.goals.lastContribution', { date: shortDate(g.last_date) }) : t('savings.goals.noContributions')}
                    </T>
                  </Stack>
                  <T w={800} size={15} color={C.inDark}>
                    {t('savings.percent', { pct })}
                  </T>
                </Row>
                <Stack gap={8}>
                  <Row style={layout.betweenBaseline}>
                    <T serif w={600} size={20} tabular>
                      {fmt(g.saved)}
                    </T>
                    <T w={600} size={12.5} color={C.muted}>
                      {t('fixed.ofTotal', { amount: fmt(g.target) })}
                    </T>
                  </Row>
                  <Progress pct={pct} color={C.in} track={C.inTrack} />
                </Stack>
                <Row style={layout.between}>
                  <T w={700} size={12.5} color={left > 0 ? C.muted : C.inDark}>
                    {left > 0 ? t('savings.goals.left', { amount: fmt(left) }) : t('savings.goals.done')}
                  </T>
                  <Tap onPress={() => open('goal', g.id)} style={st.contribute}>
                    <T w={800} size={13} color={C.white}>
                      {t('savings.sheet.title.goal')}
                    </T>
                  </Tap>
                </Row>
              </Tap>
            );
          })}
        </Stack>

        <Stack gap={10}>
          <T w={800} size={16}>
            {t('savings.history.title')}
          </T>
          <Card style={common.listCard}>
            {entries.length === 0 ? (
              <T size={13.5} color={C.muted} style={st.emptyHistory}>
                {t('savings.history.empty')}
              </T>
            ) : (
              entries.map((e, i) => {
                const add = e.kind === 'add';
                return (
                  <Row key={e.id} gap={12} style={[st.histRow, i > 0 && common.divider]}>
                    <View style={[common.iconTile, add ? st.histIconAdd : st.histIconUpdate]}>
                      {add ? <IconPlus color={C.white} /> : <IconRefresh color={C.inDark} />}
                    </View>
                    <Stack gap={2} style={layout.fill}>
                      <T w={700} size={15}>
                        {add ? t('savings.history.add') : t('savings.history.update')}
                      </T>
                      <T size={12.5} color={C.muted}>
                        {joinMeta(shortDate(e.date), t('savings.history.balance', { amount: fmt(e.after) }))}
                      </T>
                    </Stack>
                    <T w={800} size={15} tabular color={e.delta < 0 ? C.out : C.in}>
                      {signed(e.delta)}
                    </T>
                  </Row>
                );
              })
            )}
          </Card>
        </Stack>
      </Screen>

      <Sheet visible={!!sheet} onClose={close} title={sheetTitle}>
        {sheet !== 'newGoal' && (
          <Row style={st.ref}>
            <Stack gap={2} style={layout.fill}>
              <T w={700} size={13}>
                {sheet === 'update'
                  ? t('savings.sheet.previousBalance')
                  : goal
                    ? t('savings.sheet.goalSaved')
                    : t('savings.sheet.currentSavings')}
              </T>
              <T size={12} color={C.muted}>
                {goal
                  ? t('savings.sheet.goalTarget', { amount: fmt(goal.target) })
                  : t('savings.sheet.recordedOn', { date: lastDate })}
              </T>
            </Stack>
            <T w={800} size={16} tabular>
              {fmt(goal ? goal.saved : balance)}
            </T>
          </Row>
        )}

        {sheet === 'newGoal' && (
          <Stack gap={6}>
            <Label text={t('savings.sheet.goalName')} help={t('savings.help.goalName')} />
            <Field
              value={nameInput}
              onChangeText={(text) => setNameInput(text.slice(0, 40))}
              placeholder={t('savings.sheet.goalNamePlaceholder')}
            />
          </Stack>
        )}

        <Stack gap={6}>
          {sheet && <Label key={sheet} text={t(`savings.sheet.input.${sheet}`)} help={t(`savings.help.input.${sheet}`)} />}
          <View style={common.amountBox}>
            <AmountField size={40} value={dots(input)} onChangeText={(text) => setInput(cleanAmount(text))} color={C.inDark} />
          </View>
        </Stack>

        {(sheet === 'add' || sheet === 'goal') && (
          <Row gap={8}>
            {QUICK_AMOUNTS.map((v) => (
              <Tap key={v} style={st.quick} onPress={() => setInput(String((Number(input) || 0) + v))}>
                <T w={800} size={13.5}>
                  {t('savings.sheet.quickAdd', { n: v / 1000 })}
                </T>
              </Tap>
            ))}
          </Row>
        )}

        <Row style={[st.preview, previewStyle]}>
          <T w={700} size={13.5} color={previewColor} style={layout.fill}>
            {previewTitle}
          </T>
          <T w={800} size={16} tabular color={previewColor}>
            {previewValue}
          </T>
        </Row>

        <PrimaryButton label={sheet ? t(`savings.sheet.confirm.${sheet}`) : ''} bg={C.in} disabled={cantSave} onPress={confirm} />
      </Sheet>
    </View>
  );
}

function ActionTile({ icon, title, desc, onPress }: { icon: ReactNode; title: string; desc: string; onPress: () => void }) {
  return (
    <Tap onPress={onPress} style={st.action}>
      <View style={st.actionIcon}>{icon}</View>
      <T w={800} size={14.5}>
        {title}
      </T>
      <T size={12} color={C.muted}>
        {desc}
      </T>
    </Tap>
  );
}
