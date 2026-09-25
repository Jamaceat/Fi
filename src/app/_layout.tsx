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
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { PrimaryButton, T } from '@/components/ui';
import { C } from '@/constants/theme';
import { DB_NAME, migrateDbIfNeeded } from '@/db/schema';
import { authenticate, canLock } from '@/lib/auth';
import { AppProvider, useApp } from '@/state/app';

SplashScreen.preventAutoHideAsync();

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
    <SQLiteProvider databaseName={DB_NAME} onInit={migrateDbIfNeeded}>
      <AppProvider>
        <StatusBar style="dark" />
        <LockGate>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="nuevo" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="ahorro" />
            <Stack.Screen name="ajustes" />
            <Stack.Screen name="fijo/[id]" />
          </Stack>
        </LockGate>
      </AppProvider>
    </SQLiteProvider>
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
    <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', padding: 24, gap: 20 }}>
      <T serif w={600} size={32} style={{ textAlign: 'center' }}>
        Mis finanzas
      </T>
      <T size={14} color={C.muted} style={{ textAlign: 'center' }}>
        La app está bloqueada.
      </T>
      <PrimaryButton label="Desbloquear" onPress={tryUnlock} icon={false} />
    </View>
  );
}
