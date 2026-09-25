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
