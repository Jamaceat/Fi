import type { SQLiteDatabase } from 'expo-sqlite';
import { Alert } from 'react-native';

import { totalFund } from '@/db/repo';
import { t } from '@/i18n';

import { fmt } from './format';

/** Lo que hay hoy en el fondo total. */
export const fundBalance = async (db: SQLiteDatabase) => (await totalFund(db)).balance;

/** Avisa que el fondo total no alcanza. `savedPending` = el gasto igual se guardó, como pendiente. */
export function alertNoFund(amount: number, fund: number, savedPending = false) {
  Alert.alert(
    t('fund.noMoney.title'),
    t(savedPending ? 'fund.noMoney.savedPending' : 'fund.noMoney.text', { amount: fmt(amount), fund: fmt(fund) }),
  );
}

/**
 * Un gasto solo se puede marcar pagado si el fondo total alcanza; si no, avisa y sigue pendiente.
 * `extra` = dinero que vuelve al fondo con este cambio (p. ej. el monto anterior al editar).
 */
export async function canPay(db: SQLiteDatabase, amount: number, extra = 0) {
  const fund = (await fundBalance(db)) + extra;
  if (amount <= fund) return true;
  alertNoFund(amount, fund);
  return false;
}
