import * as LocalAuthentication from 'expo-local-authentication';

import { t } from '@/i18n';

/** true si el dispositivo tiene huella/rostro o PIN configurado. */
export async function canLock() {
  const [hw, enrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return hw && enrolled;
}

export async function authenticate() {
  const r = await LocalAuthentication.authenticateAsync({ promptMessage: t('lock.prompt') });
  return r.success;
}
