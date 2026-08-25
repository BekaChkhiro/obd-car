/** Locales the site is published in. `ka` is the primary market. */
export const locales = ['ka', 'en'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'ka';

/** BCP-47 tags for `<html lang>`, hreflang alternates and Open Graph. */
export const localeTags: Record<Locale, string> = {
  ka: 'ka-GE',
  en: 'en',
};

/** Native names for the language switcher — never translated. */
export const localeNames: Record<Locale, string> = {
  ka: 'ქართული',
  en: 'English',
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
