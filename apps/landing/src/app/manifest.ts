import type { MetadataRoute } from 'next';
import { defaultLocale, localeTags } from '@/i18n/config';
import { site } from '@/lib/site';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.legalName,
    short_name: site.name,
    description:
      'AI-powered OBD-II diagnostics — live vehicle data and fault codes, explained.',
    start_url: '/',
    display: 'standalone',
    background_color: site.backgroundColor,
    theme_color: site.themeColor,
    // There is one manifest for both locales, so it declares the primary
    // market's tag rather than a hardcoded literal that could drift from
    // config.ts the next time the default locale changes.
    lang: localeTags[defaultLocale],
    categories: ['productivity', 'utilities'],
    icons: [
      { src: '/icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
