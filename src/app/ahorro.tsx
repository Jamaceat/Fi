import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { IconPlus, IconRefresh, IconTarget } from '@/components/icons';
import { AmountField, Card, Field, Header, PrimaryButton, Progress, Row, Screen, Sheet, T, Tap, Toast } from '@/components/ui';
import { C } from '@/constants/theme';
import { contributeGoal, deleteGoal, insertGoal, insertSavings, listGoals, listSavings, type Goal } from '@/db/repo';
import { periodName, periodRange, shortDate, todayISO } from '@/lib/dates';
import { cleanAmount, dots, fmt, signed } from '@/lib/format';
import { useApp, useLoad } from '@/state/app';

type SheetKind = 'update' | 'add' | 'goal' | 'newGoal';

const TITLES: Record<SheetKind, string> = {
  update: 'Actualizar saldo',
  add: 'Agregar dinero',
  goal: 'Aportar',
  newGoal: 'Nueva meta',
};
const INPUT_LABELS: Record<SheetKind, string> = {
  update: '¿Cuánto tienes ahorrado hoy?',
  add: '¿Cuánto vas a agregar?',
  goal: '¿Cuánto vas a aportar?',
  newGoal: '¿Cuánto necesitas reunir?',
};
const CONFIRM_LABELS: Record<SheetKind, string> = {
  update: 'Guardar y comparar',
  add: 'Agregar al ahorro',
  goal: 'Aportar a la meta',
  newGoal: 'Crear meta',
};

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
    if (!input) previewTitle = 'Escribe tu saldo para comparar';
    else {
      const d = amount - balance;
      previewTitle = d > 0 ? 'Ahorraste' : d < 0 ? 'Tu ahorro bajó' : 'Sin cambios';
      previewValue = fmt(d);
      previewNeg = d < 0;
    }
  } else if (sheet === 'add') {
    previewTitle = 'Nuevo total';
    previewValue = fmt(balance + amount);
  } else if (goal) {
    previewTitle = `Nuevo saldo · ${pctOf(goal.saved + amount, goal.target)}%`;
    previewValue = fmt(goal.saved + amount);
  } else if (sheet === 'newGoal') {
    previewTitle = 'Empiezas en $ 0 de';
    previewValue = fmt(amount);
  }

  const cantSave =
    sheet === 'update' ? !input : sheet === 'newGoal' ? amount <= 0 || !nameInput.trim() : amount <= 0;

  const confirm = async () => {
    if (cantSave || !sheet) return;
    const today = todayISO();
    if (sheet === 'update') {
      const d = amount - balance;
      const prev = lastDate;
      await insertSavings(db, { kind: 'update', date: today, delta: d, after: amount });
      setResult({
        negative: d < 0,
        title: d > 0 ? `Ahorraste ${fmt(d)}` : d < 0 ? `Tu ahorro bajó ${fmt(d)}` : 'Tu ahorro no cambió',
        text: entries.length ? `Comparado con el saldo del ${prev}` : 'Primer registro de tu ahorro',
      });
    } else if (sheet === 'add') {
      await insertSavings(db, { kind: 'add', date: today, delta: amount, after: balance + amount });
      setResult({ title: `Agregaste ${fmt(amount)}`, text: `Nuevo total: ${fmt(balance + amount)}` });
    } else if (sheet === 'goal' && goal) {
      await contributeGoal(db, goal.id, amount);
      const saved = goal.saved + amount;
      const left = Math.max(0, goal.target - saved);
      setResult({
        title: `Aportaste ${fmt(amount)} a ${goal.name}`,
        text: left > 0 ? `Llevas ${pctOf(saved, goal.target)}% · faltan ${fmt(left)}` : '¡Cumpliste esta meta!',
      });
    } else if (sheet === 'newGoal') {
      const name = nameInput.trim();
      await insertGoal(db, name, amount);
      setResult({ title: `Creaste la meta ${name}`, text: `Objetivo: ${fmt(amount)}` });
    }
    close();
    bump();
  };

  const askDeleteGoal = (g: Goal) =>
    Alert.alert(`¿Eliminar la meta ${g.name}?`, 'Se borra la meta y su progreso.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await deleteGoal(db, g.id);
          bump();
        },
      },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Screen bottom={48}>
        <Header onBack={() => router.back()} kicker={`${periodName(currentPeriod)} ${currentPeriod.year}`} title="Ahorro" />

        <View style={st.hero}>
          <View style={{ gap: 4 }}>
            <T w={700} size={13} color={C.inSub}>
              Total ahorrado
            </T>
            <T serif size={40} color="#F4F8FB" tabular numberOfLines={1} adjustsFontSizeToFit style={{ letterSpacing: -1 }}>
              {fmt(balance)}
            </T>
          </View>
          <Row gap={10}>
            <View style={st.heroTile}>
              <T w={700} size={12.5} color={C.inSub}>
                Este mes
              </T>
              <T w={800} size={16} color="#F4F8FB" tabular>
                {signed(monthTotal)}
              </T>
            </View>
            <View style={st.heroTile}>
              <T w={700} size={12.5} color={C.inSub}>
                Último registro
              </T>
              <T w={800} size={16} color="#F4F8FB">
                {lastDate}
              </T>
            </View>
          </Row>
        </View>

        <Row gap={10}>
          <ActionTile
            icon={<IconRefresh color={C.inDark} />}
            title="Actualizar saldo"
            desc="Compara con el anterior"
            onPress={() => open('update')}
          />
          <ActionTile
            icon={<IconPlus color={C.inDark} />}
            title="Agregar dinero"
            desc="Suma directo al ahorro"
            onPress={() => open('add')}
          />
        </Row>

        {result && <Toast title={result.title} text={result.text} warn={result.negative} onClose={() => setResult(null)} />}

        <View style={{ gap: 10 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ gap: 2, flex: 1 }}>
              <T w={800} size={16}>
                Metas
              </T>
              <T size={12.5} color={C.muted}>
                {goals.length
                  ? `${fmt(goalsSaved)} apartado en ${goals.length} ${goals.length === 1 ? 'meta' : 'metas'}`
                  : 'Aparta dinero para un objetivo'}
              </T>
            </View>
            <Tap style={st.newGoal} onPress={() => open('newGoal')}>
              <IconPlus size={16} />
              <T w={800} size={13.5}>
                Nueva meta
              </T>
            </Tap>
          </Row>
          {goals.map((g) => {
            const pct = pctOf(g.saved, g.target);
            const left = Math.max(0, g.target - g.saved);
            return (
              <Tap key={g.id} onLongPress={() => askDeleteGoal(g)} style={st.goal}>
                <Row gap={12}>
                  <View style={st.goalIcon}>
                    <IconTarget color={C.inDark} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T w={800} size={15}>
                      {g.name}
                    </T>
                    <T size={12.5} color={C.muted}>
                      {g.last_date ? `Último aporte ${shortDate(g.last_date)}` : 'Sin aportes todavía'}
                    </T>
                  </View>
                  <T w={800} size={15} color={C.inDark}>
                    {pct}%
                  </T>
                </Row>
                <View style={{ gap: 8 }}>
                  <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <T serif w={600} size={20} tabular>
                      {fmt(g.saved)}
                    </T>
                    <T w={600} size={12.5} color={C.muted}>
                      de {fmt(g.target)}
                    </T>
                  </Row>
                  <Progress pct={pct} color={C.in} track={C.inTrack} />
                </View>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T w={700} size={12.5} color={left > 0 ? C.muted : C.inDark}>
                    {left > 0 ? `Faltan ${fmt(left)}` : 'Meta cumplida'}
                  </T>
                  <Tap onPress={() => open('goal', g.id)} style={st.contribute}>
                    <T w={800} size={13} color="#FFFFFF">
                      Aportar
                    </T>
                  </Tap>
                </Row>
              </Tap>
            );
          })}
        </View>

        <View style={{ gap: 10 }}>
          <T w={800} size={16}>
            Historial
          </T>
          <Card style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
            {entries.length === 0 ? (
              <T size={13.5} color={C.muted} style={{ paddingVertical: 16, textAlign: 'center' }}>
                Aún no hay registros. Empieza actualizando tu saldo.
              </T>
            ) : (
              entries.map((e, i) => {
                const add = e.kind === 'add';
                return (
                  <Row key={e.id} gap={12} style={[{ paddingVertical: 12 }, i > 0 && { borderTopWidth: 1, borderTopColor: C.divider }]}>
                    <View style={[st.histIcon, { backgroundColor: add ? C.in : C.inSoft }]}>
                      {add ? <IconPlus color="#FFFFFF" /> : <IconRefresh color={C.inDark} />}
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <T w={700} size={15}>
                        {add ? 'Aporte directo' : 'Actualización de saldo'}
                      </T>
                      <T size={12.5} color={C.muted}>
                        {shortDate(e.date)} · Saldo {fmt(e.after)}
                      </T>
                    </View>
                    <T w={800} size={15} tabular color={e.delta < 0 ? C.out : C.in}>
                      {signed(e.delta)}
                    </T>
                  </Row>
                );
              })
            )}
          </Card>
        </View>
      </Screen>

      <Sheet visible={!!sheet} onClose={close} title={sheet === 'goal' && goal ? `Aportar a ${goal.name}` : sheet ? TITLES[sheet] : ''}>
        {sheet !== 'newGoal' && (
          <Row style={st.ref}>
            <View style={{ flex: 1, gap: 2 }}>
              <T w={700} size={13}>
                {sheet === 'update' ? 'Saldo anterior' : goal ? 'Llevas en esta meta' : 'Ahorro actual'}
              </T>
              <T size={12} color={C.muted}>
                {goal ? `Meta: ${fmt(goal.target)}` : `Registrado el ${lastDate}`}
              </T>
            </View>
            <T w={800} size={16} tabular>
              {fmt(goal ? goal.saved : balance)}
            </T>
          </Row>
        )}

        {sheet === 'newGoal' && (
          <View style={{ gap: 6 }}>
            <T w={800} size={14}>
              ¿Para qué estás ahorrando?
            </T>
            <Field value={nameInput} onChangeText={(t) => setNameInput(t.slice(0, 40))} placeholder="Ej. Viaje, portátil, matrícula" />
          </View>
        )}

        <View style={{ gap: 6 }}>
          <T w={800} size={14}>
            {sheet ? INPUT_LABELS[sheet] : ''}
          </T>
          <View style={st.amountBox}>
            <AmountField size={40} value={dots(input)} onChangeText={(t) => setInput(cleanAmount(t))} color={C.inDark} />
          </View>
        </View>

        {(sheet === 'add' || sheet === 'goal') && (
          <Row gap={8}>
            {[50000, 100000, 200000].map((v) => (
              <Tap key={v} style={st.quick} onPress={() => setInput(String((Number(input) || 0) + v))}>
                <T w={800} size={13.5}>
                  + {v / 1000} mil
                </T>
              </Tap>
            ))}
          </Row>
        )}

        <Row style={[st.preview, { backgroundColor: previewNeg ? C.outSoft : sheet === 'newGoal' || !input ? C.chip : C.inSoft }]}>
          <T w={700} size={13.5} color={previewNeg ? C.warn : C.inDark} style={{ flex: 1 }}>
            {previewTitle}
          </T>
          <T w={800} size={16} tabular color={previewNeg ? C.warn : C.inDark}>
            {previewValue}
          </T>
        </Row>

        <PrimaryButton label={sheet ? CONFIRM_LABELS[sheet] : ''} bg={C.in} disabled={cantSave} onPress={confirm} />
      </Sheet>
    </View>
  );
}

function ActionTile({ icon, title, desc, onPress }: { icon: React.ReactNode; title: string; desc: string; onPress: () => void }) {
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

const st = StyleSheet.create({
  hero: { backgroundColor: C.inDark, borderRadius: 24, padding: 22, gap: 18 },
  heroTile: { flex: 1, backgroundColor: C.in, borderRadius: 16, padding: 14, gap: 4 },
  action: { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 14, gap: 4 },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.inSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  newGoal: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  goal: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 16, gap: 14 },
  goalIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.inSoft, alignItems: 'center', justifyContent: 'center' },
  contribute: { height: 40, paddingHorizontal: 16, borderRadius: 12, backgroundColor: C.in, justifyContent: 'center' },
  histIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ref: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 14, gap: 12 },
  amountBox: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, paddingVertical: 14 },
  quick: { flex: 1, height: 44, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  preview: { borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
});
