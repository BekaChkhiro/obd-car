import type { MetadataRoute } from 'next';
import { locales } from '@/i18n/config';
import { alternatesFor, routes, urlFor } from '@/lib/site';

/**
 * One entry per locale per route, each carrying the full alternates map.
 * Listing the alternates here as well as in the page head is belt and braces,
 * but it is the only signal a crawler gets before it has fetched the page.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return routes.flatMap((route) =>
    locales.map((locale) => ({
      url: urlFor(locale, route),
      lastModified,
      changeFrequency: route === '' ? ('weekly' as const) : ('monthly' as const),
      priority: route === '' ? 1 : 0.5,
      alternates: { languages: alternatesFor(route) },
    })),
  );
}
