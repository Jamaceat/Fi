import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState, type ReactNode } from 'react';
import { Alert, View } from 'react-native';

import { AmountDialog } from '@/components/amount-dialog';
import { IconClose, IconMinus, IconPlus, IconRefresh, IconTarget } from '@/components/icons';
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
import { C, goalColor, goalSoft } from '@/constants/theme';
import {
  contributeGoal,
  deleteGoal,
  insertGoal,
  insertSavings,
  listGoals,
  listSavings,
  totalFund,
  type Goal,
  type SavingsEntry,
} from '@/db/repo';
import { t } from '@/i18n';
import { periodLabel, periodRange, shortDate, todayISO } from '@/lib/dates';
import { cleanAmount, dots, fmt, joinMeta, signed } from '@/lib/format';
import { useApp, useLoad } from '@/state/app';
import { common, layout } from '@/styles/common';
import { styles as st } from '@/styles/screens/ahorro.styles';

type SheetKind = 'update' | 'add' | 'withdraw' | 'goal' | 'newGoal';

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
  /** Nueva meta: aporte inicial opcional (sale del fondo total), aparte del objetivo. */
  const [startInput, setStartInput] = useState('');
  const [startOpen, setStartOpen] = useState(false);
  const [result, setResult] = useState<{ title: string; text: string; negative?: boolean } | null>(null);

  const data = useLoad(async (d) => {
    const [entries, goals, fund] = await Promise.all([listSavings(d), listGoals(d), totalFund(d)]);
    return { entries, goals, fund: fund.balance };
  }, []);
  const entries = data?.entries ?? [];
  const goals = data?.goals ?? [];
  /** Lo que se puede pasar al ahorro: el fondo total, nunca menos de 0. */
  const fund = data?.fund ?? 0;
  const fundAvailable = Math.max(0, fund);

  // Ahorro total = libre + bloqueado en metas. Solo lo libre se puede retirar.
  const free = entries[0]?.after ?? 0;
  const freeAvailable = Math.max(0, free);
  const locked = goals.reduce((s, g) => s + g.saved, 0);
  const total = free + locked;

  const lastDate = entries[0] ? shortDate(entries[0].date) : '—';
  const range = periodRange(currentPeriod, settings.monthStart);
  const monthTotal = entries.filter((e) => e.date >= range.from && e.date < range.to).reduce((s, e) => s + e.delta, 0);
  const goalsById = new Map(goals.map((g) => [g.id, g]));
  const goal = sheet === 'goal' ? goalsById.get(goalId ?? -1) : undefined;
  const amount = Number(input) || 0;

  /** Agregar dinero y aportar a una meta sacan la plata del fondo total. */
  const fromFund = sheet === 'add' || sheet === 'goal';
  const overFund = fromFund && amount > fundAvailable;
  const overFree = sheet === 'withdraw' && amount > freeAvailable;
  const belowLocked = sheet === 'update' && !!input && amount < locked;
  const start = Number(startInput) || 0;
  const overStart = sheet === 'newGoal' && start > fundAvailable;
  /** Tope de los montos rápidos y del botón "Todo". */
  const limit = fromFund ? fundAvailable : sheet === 'withdraw' ? freeAvailable : null;

  const open = (k: SheetKind, gid: number | null = null) => {
    setSheet(k);
    setGoalId(gid);
    setInput('');
    setNameInput('');
    setStartInput('');
  };
  const close = () => setSheet(null);

  /** Suma un monto rápido sin pasarse del tope. */
  const addQuick = (v: number) => {
    const next = amount + v;
    setInput(String(limit == null ? next : Math.min(limit, next)));
  };

  let previewTitle = '';
  let previewValue = '';
  let previewNeg = false;
  if (sheet === 'update') {
    if (!input) previewTitle = t('savings.preview.typeBalance');
    else if (belowLocked) {
      previewTitle = t('savings.preview.belowLocked');
      previewValue = fmt(locked);
      previewNeg = true;
    } else {
      const d = amount - total;
      previewTitle = d > 0 ? t('savings.preview.saved') : d < 0 ? t('savings.preview.dropped') : t('savings.preview.noChange');
      previewValue = fmt(d);
      previewNeg = d < 0;
    }
  } else if (fromFund && fundAvailable <= 0) {
    previewTitle = t('savings.preview.noFund', { amount: fmt(fund) });
    previewNeg = true;
  } else if (overFund) {
    previewTitle = t('savings.preview.notEnough');
    previewValue = fmt(fundAvailable);
    previewNeg = true;
  } else if (sheet === 'withdraw') {
    if (freeAvailable <= 0) {
      previewTitle = t('savings.preview.noFree');
      previewNeg = true;
    } else if (overFree) {
      previewTitle = t('savings.preview.notEnoughFree');
      previewValue = fmt(freeAvailable);
      previewNeg = true;
    } else {
      previewTitle = t('savings.preview.freeLeft');
      previewValue = fmt(free - amount);
    }
  } else if (sheet === 'add') {
    previewTitle = t('savings.preview.newTotal');
    previewValue = fmt(total + amount);
  } else if (goal) {
    previewTitle = t('savings.preview.newGoalBalance', { pct: pctOf(goal.saved + amount, goal.target) });
    previewValue = fmt(goal.saved + amount);
  } else if (overStart) {
    previewTitle = t('savings.preview.notEnough');
    previewValue = fmt(fundAvailable);
    previewNeg = true;
  } else if (sheet === 'newGoal') {
    previewTitle = t('savings.preview.startAt', { amount: fmt(start) });
    previewValue = fmt(amount);
  }
  const previewStyle = previewNeg
    ? st.previewNegative
    : sheet === 'newGoal' || !input
      ? st.previewNeutral
      : st.previewPositive;
  const previewColor = previewNeg ? C.warn : C.inDark;

  const cantSave =
    sheet === 'update'
      ? !input || belowLocked
      : sheet === 'newGoal'
        ? amount <= 0 || !nameInput.trim() || overStart
        : amount <= 0 || overFund || overFree;

  const sheetTitle = sheet === 'goal' && goal ? t('savings.sheet.contributeTo', { name: goal.name }) : sheet ? t(`savings.sheet.title.${sheet}`) : '';

  // Tarjeta de referencia arriba de la hoja: el saldo que se va a modificar.
  let refTitle = '';
  let refSub = '';
  let refValue = 0;
  if (sheet === 'update') {
    refTitle = t('savings.sheet.previousBalance');
    refSub = joinMeta(
      t('savings.sheet.recordedOn', { date: lastDate }),
      locked > 0 ? t('savings.sheet.lockedInGoals', { amount: fmt(locked) }) : '',
    );
    refValue = total;
  } else if (sheet === 'add') {
    refTitle = t('savings.sheet.currentSavings');
    refSub = t('savings.sheet.fundAvailable', { amount: fmt(fund) });
    refValue = total;
  } else if (sheet === 'withdraw') {
    refTitle = t('savings.sheet.freeSavings');
    refSub = t('savings.sheet.lockedInGoals', { amount: fmt(locked) });
    refValue = free;
  } else if (goal) {
    refTitle = t('savings.sheet.goalSaved');
    refSub = joinMeta(t('savings.sheet.goalTarget', { amount: fmt(goal.target) }), t('savings.sheet.fundShort', { amount: fmt(fund) }));
    refValue = goal.saved;
  }

  const confirm = async () => {
    if (cantSave || !sheet) return;
    const today = todayISO();
    // El fondo pudo cambiar desde que se abrió la hoja: se vuelve a comprobar antes de guardar.
    const spend = fromFund ? amount : sheet === 'newGoal' ? start : 0;
    const current = spend > 0 ? (await totalFund(db)).balance : 0;
    if (spend > current) {
      bump();
      return;
    }
    if (sheet === 'update') {
      const d = amount - total;
      await insertSavings(db, { kind: 'update', date: today, delta: d, after: amount - locked });
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
      await insertSavings(db, { kind: 'add', date: today, delta: amount, after: free + amount });
      setResult({
        title: t('savings.result.added', { amount: fmt(amount) }),
        text: t('savings.result.fundLeft', { amount: fmt(total + amount), fund: fmt(current - amount) }),
      });
    } else if (sheet === 'withdraw') {
      await insertSavings(db, { kind: 'withdraw', date: today, delta: -amount, after: free - amount });
      setResult({
        title: t('savings.result.withdrew', { amount: fmt(amount) }),
        text: t('savings.result.withdrewText', { free: fmt(free - amount) }),
      });
    } else if (sheet === 'goal' && goal) {
      await contributeGoal(db, goal.id, amount, free);
      const saved = goal.saved + amount;
      const left = Math.max(0, goal.target - saved);
      setResult({
        title: t('savings.result.contributed', { amount: fmt(amount), name: goal.name }),
        text: joinMeta(
          left > 0 ? t('savings.result.progress', { pct: pctOf(saved, goal.target), left: fmt(left) }) : t('savings.result.goalDone'),
          t('savings.result.fundRemaining', { fund: fmt(current - amount) }),
        ),
      });
    } else if (sheet === 'newGoal') {
      const name = nameInput.trim();
      const id = await insertGoal(db, name, amount);
      if (start > 0) await contributeGoal(db, id, start, free);
      setResult({
        title: t('savings.result.goalCreated', { name }),
        text: joinMeta(
          t('savings.result.target', { amount: fmt(amount) }),
          start > 0 && t('savings.result.started', { amount: fmt(start) }),
          start > 0 && t('savings.result.fundRemaining', { fund: fmt(current - start) }),
        ),
      });
    }
    close();
    bump();
  };

  const askDeleteGoal = (g: Goal) =>
    Alert.alert(
      t('savings.deleteGoal.title', { name: g.name }),
      g.saved > 0 ? t('savings.deleteGoal.textRefund', { amount: fmt(g.saved) }) : t('savings.deleteGoal.text'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            await deleteGoal(db, g.id);
            bump();
          },
        },
      ],
    );

  const lockedGoals = goals.filter((g) => g.saved > 0);

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
              {fmt(total)}
            </T>
          </Stack>
          {locked > 0 && (
            <Stack gap={10}>
              <View style={st.split}>
                {free > 0 && <View style={[st.splitPart, { flex: free, backgroundColor: C.inText }]} />}
                {lockedGoals.map((g) => (
                  <View key={g.id} style={[st.splitPart, { flex: g.saved, backgroundColor: goalColor(g.id) }]} />
                ))}
              </View>
              <View style={st.legend}>
                <LegendItem color={C.inText} label={t('savings.free')} amount={free} />
                {lockedGoals.map((g) => (
                  <LegendItem key={g.id} color={goalColor(g.id)} label={g.name} amount={g.saved} />
                ))}
              </View>
            </Stack>
          )}
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
          <ActionTile
            icon={<IconMinus color={C.inDark} />}
            title={t('savings.sheet.title.withdraw')}
            desc={t('savings.actions.withdrawDesc')}
            onPress={() => open('withdraw')}
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
                  ? t('savings.goals.summary', { amount: fmt(locked), count: goals.length })
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
                  <View style={[common.iconTile, { backgroundColor: goalSoft(g.id) }]}>
                    <IconTarget color={goalColor(g.id)} />
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
                  <Progress pct={pct} color={goalColor(g.id)} track={C.inTrack} />
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
              entries.map((e, i) => (
                <Row key={e.id} gap={12} style={[st.histRow, i > 0 && common.divider]}>
                  <HistoryIcon entry={e} />
                  <Stack gap={2} style={layout.fill}>
                    <T w={700} size={15}>
                      {t(`savings.history.${e.kind}`)}
                    </T>
                    <T size={12.5} color={C.muted}>
                      {joinMeta(
                        shortDate(e.date),
                        e.kind === 'goal'
                          ? (goalsById.get(e.goal_id ?? -1)?.name ?? '')
                          : t('savings.history.balance', { amount: fmt(e.after) }),
                      )}
                    </T>
                  </Stack>
                  <T w={800} size={15} tabular color={e.delta < 0 ? C.out : C.in}>
                    {signed(e.delta)}
                  </T>
                </Row>
              ))
            )}
          </Card>
        </Stack>
      </Screen>

      <Sheet visible={!!sheet} onClose={close} title={sheetTitle}>
        {sheet !== 'newGoal' && (
          <Row style={st.ref}>
            <Stack gap={2} style={layout.fill}>
              <T w={700} size={13}>
                {refTitle}
              </T>
              <T size={12} color={C.muted}>
                {refSub}
              </T>
            </Stack>
            <T w={800} size={16} tabular>
              {fmt(refValue)}
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

        {sheet === 'newGoal' &&
          (start > 0 ? (
            <Row gap={10} style={st.ref}>
              <Stack gap={2} style={layout.fill}>
                <T w={700} size={13}>
                  {t('savings.sheet.startLabel')}
                </T>
                <T w={800} size={16} tabular color={C.inDark}>
                  {fmt(start)}
                </T>
              </Stack>
              <Tap onPress={() => setStartOpen(true)} style={st.startEdit}>
                <T w={800} size={13}>
                  {t('common.edit')}
                </T>
              </Tap>
              <Tap onPress={() => setStartInput('')} style={st.startEdit} accessibilityLabel={t('savings.sheet.startRemove')}>
                <IconClose size={16} />
              </Tap>
            </Row>
          ) : (
            <Tap onPress={() => setStartOpen(true)} style={st.startBtn}>
              <IconPlus size={18} color={C.inDark} />
              <T w={800} size={14.5} color={C.inDark}>
                {t('savings.sheet.startNow')}
              </T>
            </Tap>
          ))}

        {limit != null && (
          <Row gap={8}>
            {QUICK_AMOUNTS.map((v) => (
              <Tap key={v} style={st.quick} onPress={() => addQuick(v)}>
                <T w={800} size={13.5}>
                  {t('savings.sheet.quickAdd', { n: v / 1000 })}
                </T>
              </Tap>
            ))}
            {limit > 0 && (
              <Tap style={st.quick} onPress={() => setInput(String(limit))}>
                <T w={800} size={13.5}>
                  {t('savings.sheet.useAll')}
                </T>
              </Tap>
            )}
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

      <AmountDialog
        visible={startOpen}
        title={t('savings.sheet.startNow')}
        hint={`${t('savings.sheet.startHint')} ${t('savings.sheet.fundAvailable', { amount: fmt(fund) })}`}
        initial={start}
        max={fundAvailable}
        overText={t('savings.preview.notEnough')}
        onAccept={(v) => {
          setStartInput(String(v));
          setStartOpen(false);
        }}
        onClose={() => setStartOpen(false)}
      />
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

function LegendItem({ color, label, amount }: { color: string; label: string; amount: number }) {
  return (
    <View style={st.legendItem}>
      <View style={[st.legendDot, { backgroundColor: color }]} />
      <T w={700} size={12} color={C.inSub} numberOfLines={1}>
        {joinMeta(label, fmt(amount))}
      </T>
    </View>
  );
}

function HistoryIcon({ entry: e }: { entry: SavingsEntry }) {
  if (e.kind === 'goal' && e.goal_id != null) {
    return (
      <View style={[common.iconTile, { backgroundColor: goalSoft(e.goal_id) }]}>
        <IconTarget color={goalColor(e.goal_id)} />
      </View>
    );
  }
  if (e.kind === 'add') {
    return (
      <View style={[common.iconTile, st.histIconAdd]}>
        <IconPlus color={C.white} />
      </View>
    );
  }
  if (e.kind === 'withdraw') {
    return (
      <View style={[common.iconTile, st.histIconWithdraw]}>
        <IconMinus color={C.out} />
      </View>
    );
  }
  return (
    <View style={[common.iconTile, st.histIconUpdate]}>
      <IconRefresh color={C.inDark} />
    </View>
  );
}
