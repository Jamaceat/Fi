import { es } from './locales/es';

// Textos de la app por idioma. Para agregar uno: crear `locales/<código>.ts` con el tipo
// `Dictionary` (TypeScript exige las mismas claves que `es`) y registrarlo en `DICTIONARIES`.

export type Dictionary = typeof es;

const DICTIONARIES = { es } satisfies Record<string, Dictionary>;

export type Locale = keyof typeof DICTIONARIES;

export const LOCALE: Locale = 'es';

// ——— Tipos de claves ———

type Join<P extends string, K extends string> = P extends '' ? K : `${P}.${K}`;

/** Rutas "a.b.c" del diccionario cuyo valor es de tipo `V`. */
type Paths<T, V, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends V
    ? Join<P, K>
    : T[K] extends readonly unknown[]
      ? never
      : T[K] extends object
        ? Paths<T[K], V, Join<P, K>>
        : never;
}[keyof T & string];

type StringKey = Paths<Dictionary, string>;
type PluralKey<K> = K extends `${infer Base}_${'one' | 'other'}` ? Base : never;

/** Clave de un texto. Los plurales (`clave_one` / `clave_other`) se piden sin sufijo y con `count`. */
export type TranslationKey = StringKey | PluralKey<StringKey>;

/** Clave de una lista de textos (meses, días, categorías…). */
export type ListKey = Paths<Dictionary, readonly string[]>;

export type TranslationParams = Record<string, string | number> & { count?: number };

// ——— Búsqueda ———

const lookup = (path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>((node, k) => (node as Record<string, unknown> | undefined)?.[k], DICTIONARIES[LOCALE]);

// Español: singular solo para 1.
const pluralSuffix = (count: number) => (count === 1 ? 'one' : 'other');

const interpolate = (text: string, params?: TranslationParams) =>
  params ? text.replace(/\{\{(\w+)\}\}/g, (match, name: string) => (name in params ? String(params[name]) : match)) : text;

/**
 * Texto traducido. `{{nombre}}` se reemplaza por `params.nombre`; con `params.count`
 * se usa la forma `_one` o `_other` si la clave es plural.
 */
export function t(key: TranslationKey, params?: TranslationParams): string {
  const count = params?.count;
  const raw = (count !== undefined && lookup(`${key}_${pluralSuffix(count)}`)) || lookup(key);
  if (typeof raw !== 'string') {
    if (__DEV__) console.warn(`[i18n] Falta el texto "${key}" (${LOCALE})`);
    return key;
  }
  return interpolate(raw, params);
}

/** Lista de textos traducida. */
export function tList(key: ListKey): readonly string[] {
  const raw = lookup(key);
  return Array.isArray(raw) ? raw : [];
}
