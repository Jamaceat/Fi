import { router } from 'expo-router';

import type { Movement } from '@/db/repo';
import { t } from '@/i18n';

/** Etiqueta de un movimiento: Fijo, Ahorro, Ocasional, Pendiente (gasto) o Por recibir (ingreso). */
export const movementBadge = (m: Pick<Movement, 'fixed_id' | 'paid' | 'type' | 'savings_id'>) =>
  m.fixed_id != null
    ? t('common.fixed')
    : m.savings_id != null
      ? t('common.savings')
      : m.paid
        ? t('common.occasional')
        : m.type === 'gasto'
          ? t('common.pending')
          : t('common.toReceive');

/** Abre un movimiento: los del ahorro se manejan desde Ahorro; el resto, en el editor. */
export const openMovement = (m: Pick<Movement, 'id' | 'savings_id'>) =>
  m.savings_id != null ? router.push('/ahorro') : router.push({ pathname: '/nuevo', params: { id: String(m.id) } });
