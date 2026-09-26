import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';

import { IconChevronRight, IconClose, IconPlus, IconRefresh, IconSearch } from '@/components/icons';
import { EmptyBox, Header, RoundButton, Row, Screen, SectionTitle, Segmented, Stack, T, Tap } from '@/components/ui';
import { C } from '@/constants/theme';
import { listFixed, type Fixed } from '@/db/repo';
import { t } from '@/i18n';
import { shortDate, todayISO } from '@/lib/dates';
import { APPROX, fmt } from '@/lib/format';
import { describeSchedule, nextOccurrences, perYear } from '@/lib/schedule';
import { useApp, useLoad } from '@/state/app';
import { common, layout } from '@/styles/common';
import { styles as st } from '@/styles/screens/fijos.styles';

type Tab = 'gastos' | 'ingresos';

/** Un fijo es la plantilla que genera un movimiento en cada fecha; aquí solo se configura. */
type Template = { fixed: Fixed; next: string | null };

/** Minúsculas y sin tildes, para buscar sin importar cómo se escribió. */
const norm = (text: string) =>
  text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Lo que suma un fijo en un mes promedio según su periodicidad. */
const monthly = (f: Fixed) => (f.amount * perYear(f)) / 12;

export default function Fijos() {
  const { settings, holidays } = useApp();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'ingresos' ? 'ingresos' : 'gastos');
  const [lastParam, setLastParam] = useState(params.tab);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  // Inicio abre esta pestaña con ?tab=ingresos; se aplica una vez y se limpia el parámetro.
  if (params.tab !== lastParam) {
    setLastParam(params.tab);
    if (params.tab === 'ingresos' || params.tab === 'gastos') setTab(params.tab);
  }
  useEffect(() => {
    if (params.tab) router.setParams({ tab: undefined });
  }, [params.tab]);

  const templates =
    useLoad(
      async (d) => {
        const today = todayISO();
        const fixed = await listFixed(d);
        return fixed
          .filter((f) => f.active)
          .map((f): Template => ({
            fixed: f,
            next: nextOccurrences(f, today, 1, settings.holiday, holidays)[0]?.date ?? null,
          }));
      },
      [settings.holiday],
    ) ?? [];

  const q = searchOpen ? norm(query) : '';
  const match = (x: Template) => !q || norm(x.fixed.name).includes(q);
  const gastosAll = templates.filter((x) => x.fixed.type === 'gasto');
  const ingresosAll = templates.filter((x) => x.fixed.type === 'ingreso');
  const gastos = gastosAll.filter(match);
  const ingresos = ingresosAll.filter(match);
  const isGastos = tab === 'gastos';
  const other: Tab = isGastos ? 'ingresos' : 'gastos';
  const shown = isGastos ? gastos : ingresos;
  const all = isGastos ? gastosAll : ingresosAll;

  let searchStatus = '';
  if (q) {
    searchStatus = t(`fixed.search.results.${tab}`, { count: shown.length });
    const there = isGastos ? ingresos.length : gastos.length;
    if (there) searchStatus += t(`fixed.search.otherResults.${other}`, { count: there });
  }

  const perMonth = Math.round(all.reduce((s, x) => s + monthly(x.fixed), 0));
  const emptyHint = q ? t('fixed.empty.searchHint') : t('fixed.empty.addHint');

  return (
    <Screen>
      <Header
        title={t('fixed.title')}
        right={
          <Row gap={8}>
            <RoundButton
              label={searchOpen ? t('fixed.search.hide') : t('fixed.search.show')}
              onPress={() => {
                setSearchOpen(!searchOpen);
                setQuery('');
              }}
              bg={searchOpen ? C.in : C.card}
              border={searchOpen ? C.in : C.line}>
              <IconSearch color={searchOpen ? C.white : C.ink} />
            </RoundButton>
            <Tap
              style={common.pillBtn}
              onPress={() =>
                router.push({ pathname: '/fijo/[id]', params: { id: 'nuevo', kind: isGastos ? 'gasto' : 'ingreso' } })
              }>
              <IconPlus size={16} />
              <T w={800} size={13.5}>
                {t('common.add')}
              </T>
            </Tap>
          </Row>
        }
      />

      {searchOpen && (
        <Stack gap={6}>
          <Row gap={8} style={st.search}>
            <IconSearch color={C.muted} />
            <TextInput
              autoFocus
              value={query}
              onChangeText={(text) => setQuery(text.slice(0, 40))}
              placeholder={t(`fixed.search.placeholder.${tab}`)}
              placeholderTextColor={C.placeholder}
              style={st.searchInput}
            />
            {!!q && (
              <Tap onPress={() => setQuery('')} accessibilityLabel={t('fixed.search.clear')} style={st.searchClear}>
                <IconClose size={16} color={C.muted} />
              </Tap>
            )}
          </Row>
          {!!q && (
            <T w={600} size={12.5} color={C.muted}>
              {searchStatus}
            </T>
          )}
        </Stack>
      )}

      <Segmented
        options={[
          { id: 'gastos', label: t('common.expenses'), extra: String(gastos.length) },
          { id: 'ingresos', label: t('common.incomes'), extra: String(ingresos.length), activeFg: C.inDark },
        ]}
        value={tab}
        onChange={setTab}
      />

      <View style={isGastos ? st.hero : st.incHero}>
        <T w={600} size={13} color={isGastos ? C.heroSub : C.inDark}>
          {t(`fixed.summary.perMonth.${tab}`)}
        </T>
        <T
          serif
          size={isGastos ? 36 : 28}
          w={isGastos ? undefined : 600}
          color={isGastos ? C.bg : C.inDark}
          tabular
          numberOfLines={1}
          adjustsFontSizeToFit
          style={st.heroAmount}>
          {fmt(perMonth)}
        </T>
        <T size={13} color={isGastos ? C.heroSub : C.inDark}>
          {t('fixed.summary.hint')}
        </T>
      </View>

      <Stack gap={10}>
        <SectionTitle>{t(`fixed.${isGastos ? 'expenses' : 'incomes'}.title`)}</SectionTitle>
        {shown.length === 0 ? (
          <EmptyBox title={q ? t(`fixed.empty.noMatch.${tab}`) : t(`fixed.empty.none.${tab}`)} hint={emptyHint} />
        ) : (
          <View style={st.list}>
            {shown.map((x, i) => (
              <TemplateRow key={x.fixed.id} template={x} first={i === 0} />
            ))}
          </View>
        )}
      </Stack>
    </Screen>
  );
}

function TemplateRow({ template: { fixed: f, next }, first }: { template: Template; first: boolean }) {
  const income = f.type === 'ingreso';
  return (
    <Tap
      onPress={() => router.push({ pathname: '/fijo/[id]', params: { id: String(f.id) } })}
      accessibilityLabel={t('fixed.editLabel', { name: f.name })}
      style={[st.row, !first && common.divider]}>
      <View style={[common.iconTile, income ? st.iconIn : st.iconOut]}>
        <IconRefresh size={18} color={income ? C.inDark : C.outDark} stroke={1.9} />
      </View>
      <Stack gap={2} style={layout.fillShrink}>
        <T w={700} size={15} numberOfLines={1}>
          {f.name}
        </T>
        <T w={600} size={12.5} color={C.muted} numberOfLines={1}>
          {describeSchedule(f)}
        </T>
        {next && (
          <T w={700} size={11.5} color={C.muted} numberOfLines={1}>
            {t(`fixed.next.${f.type}`, { date: shortDate(next) })}
          </T>
        )}
      </Stack>
      <T w={800} size={15} color={income ? C.in : C.ink} tabular>
        {(f.variable ? APPROX : '') + fmt(f.amount)}
      </T>
      <IconChevronRight size={16} color={C.faint} />
    </Tap>
  );
}
