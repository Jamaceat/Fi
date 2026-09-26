import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { listFixed, listGoals, listSavings, type Movement } from '@/db/repo';
import { t } from '@/i18n';

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

  const rows: string[] = [
    line([
      t('export.columns.record'),
      t('export.columns.date'),
      t('export.columns.type'),
      t('export.columns.name'),
      t('export.columns.category'),
      t('export.columns.amount'),
      t('export.columns.detail'),
      t('export.columns.note'),
    ]),
  ];
  for (const m of movs) {
    const detail =
      m.fixed_id != null
        ? t('export.fixedDetail', { name: fixedName.get(m.fixed_id) ?? '' })
        : m.savings_id != null
          ? t('export.savingsDetail')
          : t('export.occasional');
    rows.push(
      line([
        t('export.records.movement'),
        m.date,
        m.type,
        m.name,
        m.category,
        m.amount,
        detail + (m.extraordinary ? t('export.extraordinarySuffix') : ''),
        m.note,
      ]),
    );
  }
  for (const f of fixed) {
    rows.push(
      line([
        t('export.records.fixed'),
        f.start_date,
        f.type,
        f.name,
        f.category,
        f.amount,
        describeSchedule(f) + (f.active ? '' : t('export.deletedSuffix', { date: f.end_date ?? '' })),
        f.variable ? t('export.variableAmount') : '',
      ]),
    );
  }
  const goalName = new Map(goals.map((g) => [g.id, g.name]));
  const savingsKind = {
    add: t('export.savingsAdd'),
    update: t('export.savingsUpdate'),
    withdraw: t('export.savingsWithdraw'),
    goal: t('export.savingsGoal'),
  };
  for (const e of [...savings].reverse()) {
    rows.push(
      line([
        t('export.records.savings'),
        e.date,
        savingsKind[e.kind],
        e.goal_id != null ? (goalName.get(e.goal_id) ?? '') : '',
        '',
        e.delta,
        t('export.balance', { amount: e.after }),
        '',
      ]),
    );
  }
  for (const g of goals) {
    rows.push(line([t('export.records.goal'), g.last_date ?? '', '', g.name, '', g.saved, t('export.target', { amount: g.target }), '']));
  }

  const name = t('export.fileName', { year: new Date().getFullYear() });
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  // BOM para que Excel abra bien las tildes.
  file.write('﻿' + rows.join('\n'));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      dialogTitle: t('export.dialogTitle'),
      UTI: 'public.comma-separated-values-text',
    });
  }
  return name;
}
