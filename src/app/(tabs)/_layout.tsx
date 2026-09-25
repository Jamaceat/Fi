import { router, Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconBars, IconCalendar, IconHome, IconList, IconPlus } from '@/components/icons';
import { T, Tap } from '@/components/ui';
import { C } from '@/constants/theme';
import { t } from '@/i18n';
import { styles as st } from '@/styles/screens/tabs-layout.styles';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const ITEMS = [
  { name: 'index', label: 'tabs.home', Icon: IconHome },
  { name: 'movimientos', label: 'tabs.movements', Icon: IconList },
  { name: '+', label: 'tabs.new', Icon: IconPlus },
  { name: 'fijos', label: 'tabs.fixed', Icon: IconCalendar },
  { name: 'historial', label: 'tabs.months', Icon: IconBars },
] as const;

function BottomNav({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;
  return (
    <View style={[st.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {ITEMS.map(({ name, label, Icon }) => {
        if (name === '+') {
          return (
            <Tap key={name} accessibilityLabel={t(label)} onPress={() => router.push('/nuevo')} style={st.fab}>
              <Icon size={24} color={C.white} />
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
              {t(label)}
            </T>
          </Tap>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, sceneStyle: st.scene }} tabBar={(props) => <BottomNav {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="movimientos" />
      <Tabs.Screen name="fijos" />
      <Tabs.Screen name="historial" />
    </Tabs>
  );
}
