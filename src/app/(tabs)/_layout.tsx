import { router, Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconBars, IconCalendar, IconHome, IconList, IconPlus } from '@/components/icons';
import { T, Tap } from '@/components/ui';
import { C } from '@/constants/theme';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const ITEMS = [
  { name: 'index', label: 'Inicio', Icon: IconHome },
  { name: 'movimientos', label: 'Movimientos', Icon: IconList },
  { name: '+', label: 'Nuevo movimiento', Icon: IconPlus },
  { name: 'fijos', label: 'Fijos', Icon: IconCalendar },
  { name: 'historial', label: 'Meses', Icon: IconBars },
] as const;

function BottomNav({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;
  return (
    <View style={[st.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {ITEMS.map(({ name, label, Icon }) => {
        if (name === '+') {
          return (
            <Tap key={name} accessibilityLabel={label} onPress={() => router.push('/nuevo')} style={st.fab}>
              <Icon size={24} color="#FFFFFF" />
            </Tap>
          );
        }
        const on = current === name;
        return (
          <Tap
            key={name}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => navigation.navigate(name)}
            style={st.item}>
            <Icon size={22} color={on ? C.ink : C.muted} stroke={1.9} />
            <T w={on ? 800 : 700} size={10.5} color={on ? C.ink : C.muted} numberOfLines={1}>
              {label}
            </T>
          </Tap>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.bg } }}
      tabBar={(props) => <BottomNav {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="movimientos" />
      <Tabs.Screen name="fijos" />
      <Tabs.Screen name="historial" />
    </Tabs>
  );
}

const st = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingHorizontal: 12,
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  item: { flex: 1, minWidth: 0, height: 52, alignItems: 'center', justifyContent: 'center', gap: 4 },
  fab: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.ink,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
});
