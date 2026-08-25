import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Locale } from '@/i18n/config';

/** The three screens the marketing copy shows off — one real capture per locale. */
export type ScreenName = 'dashboard' | 'chat' | 'codes';

/**
 * No screenshot exists yet, and the mock-ups `PhoneFrame` falls back to are
 * real markup rather than lorem-ipsum, so there is nothing broken about
 * shipping without one. `existsSync` only runs at build time — every route
 * that calls this is statically generated — so a screenshot dropped into
 * `public/screens/` starts rendering on the next build with no import to
 * touch and no risk of a 404'd `<Image>` in the meantime.
 */
export function screenshotFor(name: ScreenName, locale: Locale): string | undefined {
  const file = `${name}-${locale}.png`;
  return existsSync(join(process.cwd(), 'public', 'screens', file)) ? `/screens/${file}` : undefined;
}
