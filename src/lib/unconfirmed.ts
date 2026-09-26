import type { Movement } from '@/db/repo';

import { fixedItems, type FixedData, type FixedItem } from './finance';
import type { HolidayRule, HolidaySet, Kind } from './schedule';

/**
 * Algo de un mes ya cerrado que nunca se marcó: la ocurrencia de un fijo o un ocasional pendiente.
 * `date` decide a qué mes pertenece (fecha nominal del fijo o fecha del ocasional).
 */
export type Unconfirmed = { key: string; date: string; type: Kind; name: string; amount: number } & (
  | { item: FixedItem; mov?: never }
  | { mov: Movement; item?: never }
);

/**
 * Todo lo sin confirmar antes de `before` (inicio del mes actual), del más antiguo al más reciente.
 * `unpaid` = ocasionales pendientes anteriores a `before` (listUnpaidBefore).
 */
export function unconfirmedOf(
  fixedData: FixedData,
  unpaid: Movement[],
  before: string,
  rule: HolidayRule,
  holidays?: HolidaySet,
): Unconfirmed[] {
  // Desde el inicio del fijo más antiguo: nada de meses anteriores se queda sin revisar.
  const from = fixedData.fixed.reduce((min, f) => (f.start_date < min ? f.start_date : min), before);
  const items = from < before ? fixedItems(fixedData, from, before, rule, holidays).filter((i) => !i.paid) : [];
  const list: Unconfirmed[] = [
    ...items.map((item) => ({
      key: `f-${item.fixed.id}-${item.occ.due}`,
      date: item.occ.due,
      type: item.fixed.type,
      name: item.name,
      amount: item.amount,
      item,
    })),
    ...unpaid.map((mov) => ({ key: `m-${mov.id}`, date: mov.date, type: mov.type, name: mov.name, amount: mov.amount, mov })),
  ];
  return list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
