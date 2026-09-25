export const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const WD_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const WD_FULL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
export const WD_ABBR = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

/** Separador de miles con punto: 1250000 → "1.250.000" */
export const dots = (s: string | number) => String(s).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** $ 1.250.000 (siempre valor absoluto) */
export const fmt = (n: number) => '$ ' + dots(Math.round(Math.abs(n)));

export const signed = (n: number) => (n > 0 ? '+ ' : n < 0 ? '− ' : '') + fmt(n);

/** Limpia la entrada de un campo de monto: solo dígitos, sin ceros a la izquierda, máx 12. */
export const cleanAmount = (text: string) =>
  text.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 12);

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const initial = (name: string) => name.trim().charAt(0).toUpperCase() || '·';

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
  return dots(int) + (dec ? ',' + dec : '') + ' M';
};

/** Desglose por unidades, de mayor a menor y sin grupos en cero: 1250000 → 1 millón · 250 mil */
export const amountParts = (n: number) =>
  (
    [
      [1e9, 'mil millones', 'mil millones'],
      [1e6, 'millón', 'millones'],
      [1e3, 'mil', 'mil'],
      [1, 'peso', 'pesos'],
    ] as const
  )
    .map(([unit, one, many]) => {
      const value = Math.floor(n / unit) % 1000;
      return { unit, value, label: value === 1 ? one : many };
    })
    .filter((p) => p.value > 0);
