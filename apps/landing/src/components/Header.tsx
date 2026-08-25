import Link from 'next/link';
import type { Dictionary } from '@/i18n';
import type { Locale } from '@/i18n/config';
import { pathFor } from '@/lib/site';
import { LangSwitch } from './LangSwitch';
import { ThemeToggle } from './ThemeToggle';
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
  return (
    <header className="relative z-30 border-b border-hairline bg-sheet/70 backdrop-blur-md">
      <div className="shell flex h-[4.25rem] items-center justify-between gap-2 sm:gap-4">
        <Link href={pathFor(locale)} aria-label={dict.meta.title}>
          <Wordmark compact />
        </Link>

        <nav aria-label={dict.nav.features} className="hidden lg:block">
          <ul className="flex items-center gap-8">
            {navLinks(dict).map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="text-[14px] text-ink-2 transition-colors hover:text-ink"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <LangSwitch locale={locale} />
          <ThemeToggle dict={dict} />
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
