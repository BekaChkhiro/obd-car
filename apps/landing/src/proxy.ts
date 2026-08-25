import { NextResponse, type NextRequest } from 'next/server';
import { defaultLocale, locales } from '@/i18n/config';

/**
 * Every page lives under a locale segment, so a bare path has to pick one.
 * Rather than hard-redirecting everyone to Georgian, negotiate against
 * Accept-Language — a visitor arriving from an English-language search lands on
 * the English page directly instead of bouncing through a redirect they then
 * have to undo.
 *
 * Runs as Next 16's `proxy` convention, the replacement for `middleware`.
 *
 * Redirects are 307, not 308: which locale a bare path resolves to depends on
 * the request, and a permanent redirect would let a browser cache one visitor's
 * answer for the next.
 */
function pickLocale(header: string | null): string {
  if (!header) return defaultLocale;

  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith('q='))
        ?.slice(2);
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((entry) => entry.tag && !Number.isNaN(entry.q))
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    // Match on the primary subtag so ka-GE, en-US and en-GB all resolve.
    const base = tag.split('-')[0];
    const hit = locales.find((locale) => locale === base);
    if (hit) return hit;
  }

  return defaultLocale;
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasLocale = locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );
  if (hasLocale) return NextResponse.next();

  const locale = pickLocale(request.headers.get('accept-language'));
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url, 307);
}

export const config = {
  /**
   * Skip the framework's own paths and the metadata routes. Anything matched
   * here would be redirected into a locale segment that does not serve it —
   * /sitemap.xml has to stay at the root for crawlers to find it.
   */
  matcher: [
    '/((?!_next/|api/|favicon\\.ico|icon\\.png|apple-icon\\.png|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|opengraph-image|.*\\.[\\w]+$).*)',
  ],
};
