import { t } from '@/i18n';

/** Monto oculto con "Ocultar montos en Inicio". */
export const MASKED_AMOUNT = '$ ••••';

/** Prefijo de los montos estimados (fijos de monto variable). */
export const APPROX = '≈ ';

const MINUS = '− ';
const PLUS = '+ ';

/** Separador de miles con punto: 1250000 → "1.250.000" */
export const dots = (s: string | number) => String(s).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Decimal con coma: 2.5 → "2,5" */
export const decimal = (n: number, digits = 1) => String(Math.round(n * 10 ** digits) / 10 ** digits).replace('.', ',');

/** $ 1.250.000 (siempre valor absoluto) */
export const fmt = (n: number) => '$ ' + dots(Math.round(Math.abs(n)));

/** Con signo según el valor: "+ $ 5.000", "− $ 5.000" o "$ 0". */
export const signed = (n: number) => (n > 0 ? PLUS : n < 0 ? MINUS : '') + fmt(n);

/** Con signo según el tipo: + para ingresos, − para gastos. */
export const fmtFlow = (n: number, income: boolean) => (income ? PLUS : MINUS) + fmt(n);

/** Solo el signo menos cuando es negativo: "− $ 5.000" o "$ 5.000". */
export const fmtBalance = (n: number) => (n < 0 ? MINUS : '') + fmt(n);

/** Limpia la entrada de un campo de monto: solo dígitos, sin ceros a la izquierda, máx 12. */
export const cleanAmount = (text: string) =>
  text.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 12);

export const initial = (name: string) => name.trim().charAt(0).toUpperCase() || '·';

/** Une los datos de una línea secundaria: "Mercado · 22 sep". Omite los vacíos. */
export const joinMeta = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' · ');

/**
 * Monto compacto para titulares: por debajo del millón se muestra completo;
 * desde el millón se expresa en millones truncando (nunca redondea hacia arriba).
 * 5000 → "5.000" · 1250000 → "1,25 M" · 48900000 → "48,9 M" · 1250000000 → "1.250 M"
 */
export const compactAmount = (n: number) => {
  if (n < 1e6) return dots(n);
  const m = n / 1e6;
  const d = m < 10 ? 2 : m < 100 ? 1 : 0;
  const p = 10 ** d;
  const [int, dec = ''] = String(Math.floor(m * p) / p).split('.');
  return `${dots(int)}${dec ? ',' + dec : ''} ${t('format.millionAbbr')}`;
};

const AMOUNT_UNITS = [
  [1e9, 'format.units.billion'],
  [1e6, 'format.units.million'],
  [1e3, 'format.units.thousand'],
  [1, 'format.units.peso'],
] as const;

/** Desglose por unidades, de mayor a menor y sin grupos en cero: 1250000 → 1 millón · 250 mil */
export const amountParts = (n: number) =>
  AMOUNT_UNITS.map(([unit, key]) => {
    const value = Math.floor(n / unit) % 1000;
    return { unit, value, label: t(key, { count: value }) };
  }).filter((p) => p.value > 0);
