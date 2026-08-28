import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { JetBrains_Mono, Noto_Sans_Georgian, Noto_Serif_Georgian } from 'next/font/google';

import '../globals.css';
import { getDictionary } from '@/i18n';
import { isLocale, locales, localeTags, type Locale } from '@/i18n/config';
import { alternatesFor, site, siteUrl, urlFor } from '@/lib/site';
import { Header } from '@/components/Header';

/**
 * Georgian is not an afterthought here, so the type system is picked for its
 * Georgian drawing rather than for its Latin. Noto Serif Georgian carries the
 * headlines in both scripts — a display face with no Georgian glyphs would fall
 * back silently mid-headline and break the page's voice. JetBrains Mono is
 * Latin-only on purpose: it is used only for readings, fault codes and labels,
 * which are Latin and numeric in either language.
 */
const display = Noto_Serif_Georgian({
  subsets: ['georgian', 'latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display-face',
  display: 'swap',
});

const body = Noto_Sans_Georgian({
  subsets: ['georgian', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-mono-face',
  display: 'swap',
});

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#e7ebf3' },
    { media: '(prefers-color-scheme: dark)', color: '#050508' },
  ],
  colorScheme: 'light dark',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};

  const dict = getDictionary(lang);
  const url = urlFor(lang);

  return {
    metadataBase: new URL(siteUrl),
    title: { default: dict.meta.title, template: dict.meta.titleTemplate },
    description: dict.meta.description,
    keywords: [...dict.meta.keywords],
    applicationName: site.name,
    category: 'automotive',
    authors: [{ name: site.legalName, url: siteUrl }],
    creator: site.legalName,
    publisher: site.legalName,
    // Canonical points at this locale's URL; the alternates map tells crawlers
    // the locales are translations of one another, not duplicates.
    alternates: { canonical: url, languages: alternatesFor('') },
    openGraph: {
      type: 'website',
      url,
      siteName: site.legalName,
      title: dict.meta.title,
      description: dict.meta.description,
      locale: localeTags[lang].replace('-', '_'),
      alternateLocale: locales
        .filter((l) => l !== lang)
        .map((l) => localeTags[l].replace('-', '_')),
      // No `images` entry here: the sibling opengraph-image route is picked up
      // automatically, and a file-based image takes priority over one listed
      // in this config — an entry here would just be silently dropped.
    },
    twitter: {
      card: 'summary_large_image',
      title: dict.meta.title,
      description: dict.meta.description,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    manifest: '/manifest.webmanifest',
    formatDetection: { telephone: false, address: false, email: false },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const locale = lang as Locale;
  const dict = getDictionary(locale);

  return (
    <html
      lang={localeTags[locale]}
      dir="ltr"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-accent focus:px-5 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-on-accent"
        >
          {dict.nav.skipToContent}
        </a>


        <div className="relative z-10 mx-auto w-full max-w-[102rem] px-2 sm:px-4">
          {/* overflow-clip, not overflow-hidden: `hidden` makes this a scroll
              container, which silently breaks `position: sticky` for anything
              inside it. `clip` rounds the corners without that side effect. */}
          <Header locale={locale} dict={dict} />
          <main id="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
