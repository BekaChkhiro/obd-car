import Link from 'next/link';
import { getDictionary } from '@/i18n';
import { defaultLocale } from '@/i18n/config';
import { pathFor } from '@/lib/site';

/**
 * `not-found` cannot read route params, so it falls back to the default locale.
 * A visitor who reached a broken English URL still gets a usable way out.
 */
export default function NotFound() {
  const dict = getDictionary(defaultLocale);

  return (
    <div className="shell flex min-h-[55vh] max-w-xl flex-col items-start justify-center py-24">
      {/* text-ink-3: at 13px bold, -4 reads under the 4.5:1 AA floor. */}
      <p className="num text-[13px] font-bold text-ink-3">404</p>
      <h1 className="mt-4 text-[clamp(2rem,4.5vw,3rem)]">{dict.notFound.title}</h1>
      <p className="lede mt-5">{dict.notFound.body}</p>
      <Link
        href={pathFor(defaultLocale)}
        className="mt-9 rounded-full bg-accent px-6 py-3 text-[15px] font-semibold text-on-accent transition-colors hover:bg-accent-hover"
      >
        {dict.notFound.cta}
      </Link>
    </div>
  );
}
