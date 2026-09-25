import type { Movement } from '@/db/repo';
import { t } from '@/i18n';

/** Etiqueta de un movimiento: Fijo, Ocasional, Pendiente (gasto) o Por recibir (ingreso). */
export const movementBadge = (m: Pick<Movement, 'fixed_id' | 'paid' | 'type'>) =>
  m.fixed_id != null
    ? t('common.fixed')
    : m.paid
      ? t('common.occasional')
      : m.type === 'gasto'
        ? t('common.pending')
        : t('common.toReceive');
