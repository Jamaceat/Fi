import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { fillSavingsMovements } from '@/db/repo';
import { FILL_FIXED_MOVEMENTS, FILL_SAVINGS_SOURCE } from '@/db/schema';
import { t } from '@/i18n';

import { todayISO } from './dates';

/**
 * Respaldo de todos los datos en un CSV dentro de la carpeta de documentos de la app.
 * Si al abrir la app la base está vacía, se restaura desde aquí. Sin archivo = primera vez o
 * "Borrar todos los datos" (que también lo elimina). El mismo archivo se exporta e importa.
 *
 * Formato (se abre en Excel, una sección por tabla):
 *   #mis-finanzas-respaldo,1,<fecha ISO>
 *   #tabla,<nombre>
 *   <columnas>
 *   <filas…>
 * Los textos van siempre entre comillas y una celda vacía sin comillas es NULL, para no perder
 * la diferencia entre "" y NULL. Los números van sin comillas.
 */

const FILE_NAME = 'finanzas-respaldo.csv';
const TMP_NAME = 'finanzas-respaldo.tmp';
const MAGIC = '#mis-finanzas-respaldo';
const TABLE_MARK = '#tabla';
const FORMAT_VERSION = 1;

/** Tablas en orden de inserción (primero las referenciadas). Los festivos son caché y no se respaldan. */
const TABLES = [
  'fixed',
  'fixed_segments',
  'fixed_overrides',
  'movements',
  'fixed_status',
  'savings_entries',
  'goals',
  'settings',
] as const;
type Table = (typeof TABLES)[number];

/** Tablas que cuentan como "datos del usuario" (los ajustes sobreviven a Borrar todo). */
const DATA_TABLES = TABLES.filter((t) => t !== 'settings');

type Value = string | number | null;
type Row = Record<string, Value>;
export type Backup = { createdAt: string; tables: Partial<Record<Table, Row[]>>; raw: string };

const backupFile = () => new File(Paths.document, FILE_NAME);

// ——— CSV ———

const cell = (v: Value) => (v == null ? '' : typeof v === 'number' ? String(v) : `"${v.replace(/"/g, '""')}"`);

type Cell = { v: string; quoted: boolean };

/** Separa el texto en filas y celdas, respetando comillas (con comas y saltos de línea dentro). */
function parseCsv(text: string): Cell[][] {
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let cur = '';
  let quoted = false;
  let inQuotes = false;
  const endCell = () => {
    row.push({ v: cur, quoted });
    cur = '';
    quoted = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
      quoted = true;
    } else if (ch === ',') endCell();
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endCell();
      rows.push(row);
      row = [];
    } else cur += ch;
  }
  if (cur || quoted || row.length) {
    endCell();
    rows.push(row);
  }
  return rows;
}

const isBlank = (r: Cell[]) => r.length === 1 && !r[0].quoted && r[0].v === '';

/** Lee un respaldo. Lanza un error legible si el archivo no es un respaldo de la app. */
export function parseBackup(text: string): Backup {
  const raw = text.replace(/^﻿/, '');
  const rows = parseCsv(raw).filter((r) => !isBlank(r));
  const head = rows[0];
  if (!head || head[0].quoted || head[0].v !== MAGIC) throw new Error(t('backup.notABackup'));
  if (Number(head[1]?.v) > FORMAT_VERSION) throw new Error(t('backup.newerVersion'));
  const createdAt = head[2]?.v ?? '';

  const tables: Backup['tables'] = {};
  const known = new Set<string>(TABLES);
  let table: Table | null = null;
  let cols: string[] | null = null;
  for (const r of rows.slice(1)) {
    if (!r[0].quoted && r[0].v === TABLE_MARK) {
      const name = r[1]?.v ?? '';
      table = known.has(name) ? (name as Table) : null;
      cols = null;
      if (table) tables[table] = [];
    } else if (!table) {
      continue;
    } else if (!cols) {
      cols = r.map((c) => c.v);
    } else {
      const obj: Row = {};
      cols.forEach((c, i) => {
        const x = r[i];
        if (!x || (!x.quoted && x.v === '')) obj[c] = null;
        else if (x.quoted) obj[c] = x.v;
        else obj[c] = Number.isFinite(Number(x.v)) ? Number(x.v) : x.v;
      });
      tables[table]!.push(obj);
    }
  }
  return { createdAt, tables, raw };
}

// ——— Archivo ———

/** Hay al menos un registro en alguna tabla de datos. */
export async function hasData(db: SQLiteDatabase) {
  const union = DATA_TABLES.map((t) => `SELECT 1 FROM ${t}`).join(' UNION ALL ');
  const row = await db.getFirstAsync<{ any_row: number }>(`SELECT EXISTS (${union}) AS any_row`);
  return row?.any_row === 1;
}

async function readBackup(): Promise<Backup | null> {
  const file = backupFile();
  if (!file.exists) return null;
  try {
    return parseBackup(await file.text());
  } catch {
    return null;
  }
}

/** Fecha ISO del último respaldo guardado, o null si no hay. */
export async function lastBackupAt() {
  return (await readBackup())?.createdAt ?? null;
}

/** Reemplaza el archivo de respaldo. Escribe a un temporal y lo mueve, para no dejarlo a medias. */
function saveBackupText(text: string) {
  const tmp = new File(Paths.document, TMP_NAME);
  tmp.create({ overwrite: true });
  tmp.write(text);
  tmp.moveSync(backupFile(), { overwrite: true });
}

/** Guarda todos los datos en el archivo de respaldo. */
export async function writeBackup(db: SQLiteDatabase) {
  const createdAt = new Date().toISOString();
  const lines = [[MAGIC, FORMAT_VERSION, createdAt].join(',')];
  for (const table of TABLES) {
    // Las columnas salen del esquema: una tabla vacía también deja su encabezado.
    const cols = (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`)).map((c) => c.name);
    const rows = await db.getAllAsync<Row>(`SELECT * FROM ${table}`);
    lines.push('', `${TABLE_MARK},${table}`, cols.join(','));
    for (const r of rows) lines.push(cols.map((c) => cell(r[c])).join(','));
  }
  // BOM para que Excel abra bien las tildes.
  saveBackupText('﻿' + lines.join('\n'));
  return createdAt;
}

/** Respalda solo si hay datos y ya pasó la frecuencia elegida desde el último respaldo. */
export async function backupIfDue(db: SQLiteDatabase, last: string | null, everyDays: number) {
  if (last && Date.now() - new Date(last).getTime() < everyDays * 86_400_000) return null;
  // Una base vacía nunca pisa un respaldo bueno.
  if (!(await hasData(db))) return null;
  return writeBackup(db);
}

export function deleteBackup() {
  const file = backupFile();
  if (file.exists) file.delete();
}

/** Comparte una copia del respaldo actual (hay que haberlo escrito antes). */
export async function shareBackup() {
  const name = t('backup.fileName', { date: todayISO() });
  const copy = new File(Paths.cache, name);
  backupFile().copySync(copy, { overwrite: true });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(copy.uri, {
      mimeType: 'text/csv',
      dialogTitle: t('backup.shareTitle'),
      UTI: 'public.comma-separated-values-text',
    });
  }
  return name;
}

/** Abre el selector de archivos y lee el respaldo elegido. null si se canceló. */
export async function pickBackup(): Promise<Backup | null> {
  const picked = await File.pickFileAsync();
  if (picked.canceled) return null;
  return parseBackup(await picked.result.text());
}

// ——— Restaurar ———

/** Reemplaza el contenido de cada tabla incluida en el respaldo. */
async function restore(db: SQLiteDatabase, backup: Backup) {
  await db.withTransactionAsync(async () => {
    for (const table of TABLES) {
      const rows = backup.tables[table];
      if (!rows) continue;
      // Solo columnas que existen hoy: un respaldo de otra versión del esquema no rompe la carga.
      const cols = new Set((await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`)).map((c) => c.name));
      await db.runAsync(`DELETE FROM ${table}`);
      for (const row of rows) {
        const keys = Object.keys(row).filter((k) => cols.has(k));
        if (!keys.length) continue;
        await db.runAsync(
          `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
          keys.map((k) => row[k]),
        );
      }
    }
    await db.execAsync(FILL_FIXED_MOVEMENTS);
    await db.execAsync(FILL_SAVINGS_SOURCE);
    await fillSavingsMovements(db);
  });
}

/**
 * Si la base no tiene datos y existe un respaldo, lo carga completo (ajustes incluidos).
 * Devuelve la fecha del respaldo restaurado, o null si no había nada que restaurar.
 */
export async function restoreBackupIfEmpty(db: SQLiteDatabase) {
  if (await hasData(db)) return null;
  const backup = await readBackup();
  if (!backup) return null;
  await restore(db, backup);
  return backup.createdAt;
}

/** Carga un respaldo importado: reemplaza los datos actuales y queda como el respaldo automático. */
export async function importBackup(db: SQLiteDatabase, backup: Backup) {
  await restore(db, backup);
  saveBackupText(backup.raw);
}
