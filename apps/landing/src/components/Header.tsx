import Link from 'next/link';
import type { Dictionary } from '@/i18n';
import type { Locale } from '@/i18n/config';
import { pathFor } from '@/lib/site';
import { LangSwitch } from './LangSwitch';
import { Wordmark } from './Wordmark';

/** Section links, also mirrored in the footer so both ends of a long page navigate. */
export function navLinks(dict: Dictionary) {
  return [
    { href: '#features', label: dict.nav.features },
    { href: '#how', label: dict.nav.how },
    { href: '#codes', label: dict.nav.codes },
    { href: '#faq', label: dict.nav.faq },
  ];
}

export function Header({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  // Floats over the film rather than sitting on a sheet: sticky, rounded and
  // glass, so the footage keeps running underneath it.
  return (
    <header className="glass sticky top-2 z-30 mx-auto mt-2 w-full max-w-6xl rounded-[1.25rem] sm:top-4 sm:mt-4 sm:rounded-[1.5rem]">
      {/* The bar carries its own width rather than sitting inside `.shell`.
          Stretched to the outer container it left a wide empty margin of glass
          either side of the logo and the button — the panel should end where
          the content does. */}
      <div className="flex h-[4.25rem] items-center justify-between gap-2 px-5 sm:gap-4 sm:px-6">
        <Link href={pathFor(locale)} aria-label={dict.meta.title}>
          <Wordmark compact />
        </Link>

        {/* Section nav removed with the sections it pointed at. */}

        <div className="flex items-center gap-2">
          <LangSwitch locale={locale} />
          <a
            href="#download"
            className="whitespace-nowrap rounded-full bg-accent px-3.5 py-2.5 text-[12.5px] font-semibold text-on-accent transition-colors hover:bg-accent-hover sm:px-4 sm:text-[13px]"
          >
            <span className="hidden sm:inline">{dict.nav.cta}</span>
            <span className="sm:hidden">{dict.nav.ctaShort}</span>
          </a>
        </div>
      </div>
    </header>
  );
}
