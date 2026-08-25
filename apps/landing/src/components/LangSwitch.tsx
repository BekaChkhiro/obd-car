'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { locales, localeNames, type Locale } from '@/i18n/config';

/**
 * Swaps only the locale segment, so switching language from /ka/privacy lands
 * on /en/privacy rather than dumping the reader back on the home page.
 *
 * `hreflang` on each link mirrors the alternates in the document head — the
 * same relationship, expressed where a crawler following links will meet it.
 */
export function LangSwitch({ locale }: { locale: Locale }) {
  const pathname = usePathname();

  function hrefFor(target: Locale) {
    const segments = pathname.split('/');
    segments[1] = target;
    return segments.join('/') || `/${target}`;
  }

  return (
    <div className="flex items-center rounded-full border border-hairline p-0.5">
      {locales.map((option) => {
        const active = option === locale;
        return (
          <Link
            key={option}
            href={hrefFor(option)}
            hrefLang={option}
            aria-current={active ? 'true' : undefined}
            title={localeNames[option]}
            className={`num rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] transition-colors ${
              active ? 'bg-accent text-on-accent' : 'text-ink-3 hover:text-ink'
            }`}
          >
            {option}
          </Link>
        );
      })}
    </div>
  );
}
