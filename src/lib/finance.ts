import type { Fixed, FixedStatus } from '@/db/repo';
import { statusKey } from '@/db/repo';

import { occurrences, type HolidayRule, type Occurrence } from './schedule';

export type FixedItem = {
  fixed: Fixed;
  occ: Occurrence;
  status: FixedStatus | undefined;
  name: string;
  paid: boolean;
  /** Pagado: monto real registrado. Pendiente: monto esperado. */
  amount: number;
};

/**
 * Ocurrencias de todos los fijos con fecha nominal en [from, to).
 * Las descartadas ("Borrar" en Sin confirmar) no se muestran.
 */
export function fixedItems(
  fixed: Fixed[],
  statuses: Map<string, FixedStatus>,
  from: string,
  to: string,
  rule: HolidayRule,
): FixedItem[] {
  const items: FixedItem[] = [];
  for (const f of fixed) {
    const occs = occurrences(f, from, to, rule);
    occs.forEach((occ, i) => {
      const status = statuses.get(statusKey(f.id, occ.due));
      if (status?.status === 'skipped') return;
      const paid = status?.status === 'paid';
      let name = f.name;
      if (occs.length > 1) {
        name += f.preset === 'quincenal' && occs.length === 2 ? ` · ${i + 1}ª quincena` : ` · ${i + 1}º pago`;
      }
      items.push({ fixed: f, occ, status, name, paid, amount: paid ? status!.amount : f.amount });
    });
  }
  return items.sort((a, b) => (a.occ.date < b.occ.date ? -1 : a.occ.date > b.occ.date ? 1 : a.fixed.id - b.fixed.id));
}

export const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);
