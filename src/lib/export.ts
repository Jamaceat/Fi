import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { listFixed, listGoals, listSavings, type Movement } from '@/db/repo';

import { describeSchedule } from './schedule';

const cell = (v: string | number | null | undefined) => {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const line = (xs: (string | number | null | undefined)[]) => xs.map(cell).join(',');

/** Genera un CSV con todos los datos y abre el diálogo para compartirlo. Devuelve el nombre del archivo. */
export async function exportCsv(db: SQLiteDatabase) {
  const [movs, fixed, savings, goals] = await Promise.all([
    db.getAllAsync<Movement>('SELECT * FROM movements ORDER BY date, id'),
    listFixed(db),
    listSavings(db),
    listGoals(db),
  ]);
  const fixedName = new Map(fixed.map((f) => [f.id, f.name]));

  const rows: string[] = [line(['registro', 'fecha', 'tipo', 'nombre', 'categoria', 'monto', 'detalle', 'nota'])];
  for (const m of movs) {
    const detail = m.fixed_id != null ? `Fijo: ${fixedName.get(m.fixed_id) ?? ''}` : 'Ocasional';
    rows.push(
      line(['movimiento', m.date, m.type, m.name, m.category, m.amount, detail + (m.extraordinary ? ' (extraordinario)' : ''), m.note]),
    );
  }
  for (const f of fixed) {
    rows.push(
      line([
        'fijo',
        f.start_date,
        f.type,
        f.name,
        f.category,
        f.amount,
        describeSchedule(f) + (f.active ? '' : ` (eliminado ${f.end_date})`),
        f.variable ? 'monto variable' : '',
      ]),
    );
  }
  for (const e of [...savings].reverse()) {
    rows.push(line(['ahorro', e.date, e.kind === 'add' ? 'aporte' : 'actualizacion', '', '', e.delta, `saldo ${e.after}`, '']));
  }
  for (const g of goals) {
    rows.push(line(['meta', g.last_date ?? '', '', g.name, '', g.saved, `objetivo ${g.target}`, '']));
  }

  const name = `movimientos-${new Date().getFullYear()}.csv`;
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  // BOM para que Excel abra bien las tildes.
  file.write('﻿' + rows.join('\n'));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Exportar datos', UTI: 'public.comma-separated-values-text' });
  }
  return name;
}
