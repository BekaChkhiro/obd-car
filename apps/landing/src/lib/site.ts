import { defaultLocale, localeTags, locales, type Locale } from '@/i18n/config';

/**
 * Absolute origin, no trailing slash. Every canonical URL, hreflang alternate,
 * sitemap entry and JSON-LD `@id` derives from this, so a domain change is a
 * one-line change.
 */
export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://obdcar.ge'
).replace(/\/$/, '');

export const site = {
  name: 'OBD-II AI',
  legalName: 'OBD-II AI Diagnostic Assistant',
  email: 'hello@obdcar.ge',
  githubUrl: 'https://github.com/BekaChkhiro/obd-car',
  /** Empty until the listings exist — the store buttons render as "coming". */
  appStoreUrl: process.env.NEXT_PUBLIC_APP_STORE_URL || null,
  playStoreUrl: process.env.NEXT_PUBLIC_PLAY_STORE_URL || null,
  themeColor: '#0a0a0f',
  backgroundColor: '#eef1f7',
} as const;

/** Every indexable route, relative to a locale root. `''` is the home page. */
export const routes = ['', '/privacy'] as const;

export type Route = (typeof routes)[number];

export function pathFor(locale: Locale, route: Route = ''): string {
  return `/${locale}${route}`;
}

export function urlFor(locale: Locale, route: Route = ''): string {
  return `${siteUrl}${pathFor(locale, route)}`;
}

/**
 * hreflang map for a route. `x-default` points at the default locale rather
 * than a language picker — there isn't one, and pointing a crawler at a
 * redirect wastes the signal.
 */
export function alternatesFor(route: Route = '') {
  const languages: Record<string, string> = {};
  for (const locale of locales) {
    languages[localeTags[locale]] = urlFor(locale, route);
  }
  languages['x-default'] = urlFor(defaultLocale, route);
  return languages;
}
