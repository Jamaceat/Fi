import type { Fixed, FixedSegment, FixedStatus, Override } from '@/db/repo';
import { statusKey } from '@/db/repo';
import { t } from '@/i18n';

import { joinMeta } from './format';
import { occurrences, type HolidayRule, type HolidaySet, type Occurrence, type Preset, type Schedule } from './schedule';

export type FixedItem = {
  fixed: Fixed;
  /** `date` es la fecha real: la ajustada a mano si se cambió, si no la corrida por festivo. */
  occ: Occurrence;
  status: FixedStatus | undefined;
  name: string;
  paid: boolean;
  /** Pagado: monto real registrado. Pendiente: monto ajustado de esa fecha o el del tramo. */
  amount: number;
  /** Monto que le toca por la configuración vigente en su fecha (sin ajuste). */
  base: number;
  /** Fecha que le toca por la configuración (sin cambio manual). */
  planned: string;
  /** Pendiente con un monto distinto solo para esta fecha. */
  adjusted: boolean;
  /** Fecha cambiada a mano solo esta vez. */
  moved: boolean;
};

export type FixedData = {
  fixed: Fixed[];
  statuses: Map<string, FixedStatus>;
  overrides: Map<string, Override>;
  segments: Map<number, FixedSegment[]>;
};

type Tramo = { schedule: Schedule; amount: number; from: string; to: string | null };

/** Configuraciones de un fijo en el tiempo: las anteriores y la actual, de la más antigua a la más reciente. */
function tramos(f: Fixed, segs: FixedSegment[] = []): Tramo[] {
  const past = segs.map((s) => ({
    // Anticipado/vencido es del fijo, no del tramo: decide si se paga la primera fecha.
    schedule: { ...s, anticipated: f.anticipated, end_date: null },
    amount: s.amount,
    from: s.valid_from,
    to: s.valid_to as string | null,
  }));
  return [...past, { schedule: f, amount: f.amount, from: f.valid_from ?? f.start_date, to: null }];
}

/**
 * Ocurrencias de todos los fijos con fecha nominal en [from, to).
 * Cada una usa la configuración vigente en su fecha, así editar un fijo no reescribe el pasado.
 * Las descartadas ("Borrar" en Sin confirmar) no se muestran.
 */
export function fixedItems(
  { fixed, statuses, overrides, segments }: FixedData,
  from: string,
  to: string,
  rule: HolidayRule,
  holidays?: HolidaySet,
): FixedItem[] {
  const items: FixedItem[] = [];
  for (const f of fixed) {
    const occs: { occ: Occurrence; amount: number; preset: Preset }[] = [];
    for (const t of tramos(f, segments.get(f.id))) {
      const lo = t.from > from ? t.from : from;
      const hi = t.to && t.to < to ? t.to : to;
      if (lo >= hi) continue;
      for (const occ of occurrences(t.schedule, lo, hi, rule, holidays)) {
        occs.push({ occ, amount: t.amount, preset: t.schedule.preset });
      }
    }
    occs.forEach(({ occ, amount: base, preset }, i) => {
      const key = statusKey(f.id, occ.due);
      const status = statuses.get(key);
      if (status?.status === 'skipped') return;
      const paid = status?.status === 'paid';
      let name = f.name;
      if (occs.length > 1) {
        const suffix = preset === 'quincenal' && occs.length === 2 ? 'finance.nthFortnight' : 'finance.nthPayment';
        name = joinMeta(name, t(suffix, { n: i + 1 }));
      }
      const ov = overrides.get(key);
      const ovAmount = paid ? null : (ov?.amount ?? null);
      items.push({
        fixed: f,
        occ: { due: occ.due, date: ov?.date ?? occ.date },
        status,
        name,
        paid,
        amount: paid ? status!.amount : (ovAmount ?? base),
        base,
        planned: occ.date,
        adjusted: ovAmount != null,
        moved: ov?.date != null && ov.date !== occ.date,
      });
    });
  }
  return items.sort((a, b) => (a.occ.date < b.occ.date ? -1 : a.occ.date > b.occ.date ? 1 : a.fixed.id - b.fixed.id));
}

export const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);
