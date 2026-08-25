import Link from 'next/link';
import type { Dictionary } from '@/i18n';
import type { Locale } from '@/i18n/config';
import { pathFor, site } from '@/lib/site';
import { navLinks } from './Header';
import { Wordmark } from './Wordmark';

export function Footer({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-hairline">
      <div className="shell flex flex-col gap-8 py-10 lg:flex-row lg:items-center lg:justify-between">
        <Link href={pathFor(locale)} aria-label={dict.meta.title}>
          <Wordmark />
        </Link>

        <nav aria-label={dict.footer.home}>
          <ul className="flex flex-wrap items-center gap-x-7 gap-y-2">
            <li>
              <Link
                href={pathFor(locale)}
                className="text-[14px] text-ink-2 transition-colors hover:text-ink"
              >
                {dict.footer.home}
              </Link>
            </li>
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
            <li>
              <a
                href="#download"
                className="text-[14px] text-ink-2 transition-colors hover:text-ink"
              >
                {dict.nav.download}
              </a>
            </li>
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={site.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="grid h-9 w-9 place-items-center rounded-full border border-hairline text-ink-2 transition-colors hover:border-hairline-strong hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="currentColor" aria-hidden="true">
              <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
            </svg>
          </a>
          <a
            href={`mailto:${site.email}`}
            aria-label={site.email}
            className="grid h-9 w-9 place-items-center rounded-full border border-hairline text-ink-2 transition-colors hover:border-hairline-strong hover:text-ink"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-[17px] w-[17px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="2.75" y="4.75" width="18.5" height="14.5" rx="3" />
              <path d="m4 7.5 8 5.5 8-5.5" />
            </svg>
          </a>
        </div>
      </div>

      <div className="border-t border-hairline">
        <div className="shell flex flex-col gap-2 py-5 text-[13px] text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <p>
            <span className="num">© {year}</span> {site.legalName}. {dict.footer.rights}
          </p>
          <Link
            href={pathFor(locale, '/privacy')}
            className="transition-colors hover:text-ink"
          >
            {dict.footer.terms}
          </Link>
        </div>
      </div>
    </footer>
  );
}
