import { ka, type Dictionary } from './dictionaries/ka';
import { en } from './dictionaries/en';
import type { Locale } from './config';

const dictionaries: Record<Locale, Dictionary> = { ka, en };

/**
 * Plain modules rather than dynamic imports: every route is statically
 * generated, so both locales resolve at build time anyway and an async
 * boundary would buy nothing but complexity.
 */
export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

export type { Dictionary };
export * from './config';
