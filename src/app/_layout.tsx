import { Fraunces_500Medium, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { PrimaryButton, T } from '@/components/ui';
import { C } from '@/constants/theme';
import { DB_NAME, migrateDbIfNeeded } from '@/db/schema';
import { t } from '@/i18n';
import { authenticate, canLock } from '@/lib/auth';
import { restoreBackupIfEmpty } from '@/lib/backup';
import { longDate, toISO } from '@/lib/dates';
import { AppProvider, useApp } from '@/state/app';
import { styles as st } from '@/styles/screens/root-layout.styles';

SplashScreen.preventAutoHideAsync();

/** Migra la base y, si está vacía, la recupera del respaldo automático (si existe). */
async function initDb(db: SQLiteDatabase) {
  await migrateDbIfNeeded(db);
  try {
    const restored = await restoreBackupIfEmpty(db);
    if (restored) {
      Alert.alert(t('backup.restoredTitle'), t('backup.restoredText', { date: longDate(toISO(new Date(restored))) }));
    }
  } catch (e) {
    Alert.alert(t('backup.restoreFailedTitle'), String(e));
  }
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={st.root}>
      <SQLiteProvider databaseName={DB_NAME} onInit={initDb}>
        <AppProvider>
          <StatusBar style="dark" />
          <LockGate>
            <Stack screenOptions={{ headerShown: false, contentStyle: st.scene }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="nuevo" options={{ animation: 'slide_from_bottom' }} />
              <Stack.Screen name="ahorro" />
              <Stack.Screen name="ajustes" />
              <Stack.Screen name="calendario" options={{ animation: 'fade_from_bottom' }} />
              <Stack.Screen name="fijo/[id]" />
              <Stack.Screen name="orden-inicio" />
            </Stack>
          </LockGate>
        </AppProvider>
      </SQLiteProvider>
    </GestureHandlerRootView>
  );
}

/** Pide huella o PIN al abrir la app si está activado en Ajustes. */
function LockGate({ children }: { children: ReactNode }) {
  const { settings } = useApp();
  const [unlocked, setUnlocked] = useState(!settings.lock);

  const tryUnlock = async () => {
    if (!(await canLock())) return setUnlocked(true);
    if (await authenticate()) setUnlocked(true);
  };

  useEffect(() => {
    if (!settings.lock) return;
    let alive = true;
    (async () => {
      const ok = !(await canLock()) || (await authenticate());
      if (alive && ok) setUnlocked(true);
    })();
    return () => {
      alive = false;
    };
    // Solo al abrir la app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (unlocked) return children;
  return (
    <View style={st.lock}>
      <T serif w={600} size={32} style={st.center}>
        {t('app.name')}
      </T>
      <T size={14} color={C.muted} style={st.center}>
        {t('lock.locked')}
      </T>
      <PrimaryButton label={t('lock.unlock')} onPress={tryUnlock} icon={false} />
    </View>
  );
}
