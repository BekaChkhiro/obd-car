import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getDictionary } from '@/i18n';
import { isLocale, locales, type Locale } from '@/i18n/config';
import { jsonLdScript, privacyJsonLd } from '@/lib/jsonld';
import { alternatesFor, pathFor, site, urlFor } from '@/lib/site';

const EFFECTIVE_DATE = '2026-05-19';

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dict = getDictionary(lang);
  const url = urlFor(lang, '/privacy');

  return {
    title: dict.privacyPage.title,
    description: dict.privacyPage.description,
    alternates: { canonical: url, languages: alternatesFor('/privacy') },
    openGraph: {
      type: 'article',
      url,
      title: dict.privacyPage.title,
      description: dict.privacyPage.description,
    },
  };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const locale = lang as Locale;
  const dict = getDictionary(locale);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(privacyJsonLd(locale, dict)) }}
      />

      <article className="shell max-w-3xl py-16 lg:py-20">
        <nav aria-label={dict.footer.terms} className="mb-8">
          <Link
            href={pathFor(locale)}
            className="eyebrow inline-flex items-center gap-1.5 transition-colors hover:text-ink"
          >
            <span aria-hidden="true">←</span>
            {site.name}
          </Link>
        </nav>

        <h1 className="text-[clamp(2rem,4.5vw,3rem)]">{dict.privacyPage.title}</h1>
        <p className="eyebrow mt-4">
          {dict.privacyPage.effective}{' '}
          <time className="num" dateTime={EFFECTIVE_DATE}>
            {EFFECTIVE_DATE}
          </time>
        </p>
        <p className="lede mt-6">{dict.privacyPage.intro}</p>

        <div className="mt-12 flex flex-col gap-10">
          {dict.privacyPage.sections.map((section, index) => (
            <section key={section.title}>
              <h2 className="flex items-baseline gap-3 text-[21px]">
                {/* text-ink-3: at 13px bold, -4 reads under the 4.5:1 AA floor. */}
                <span className="num text-[13px] font-bold text-ink-3">
                  {String(index + 1).padStart(2, '0')}
                </span>
                {section.title}
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">{section.body}</p>
            </section>
          ))}
        </div>

        <section className="card mt-12 p-6">
          <h2 className="text-[18px]">{dict.privacyPage.contactTitle}</h2>
          <p className="mt-2 text-ink-2">
            {dict.privacyPage.contactBody}{' '}
            <a
              href={`mailto:${site.email}`}
              className="font-semibold text-ink underline decoration-hairline-strong underline-offset-4 transition-colors hover:decoration-ink"
            >
              {site.email}
            </a>
          </p>
          <p className="mt-4">
            <a
              href={`${site.githubUrl}/blob/main/docs/PRIVACY_POLICY.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[14px] text-ink-2 underline decoration-hairline-strong underline-offset-4 transition-colors hover:text-ink"
            >
              {dict.privacyPage.fullDoc} →
            </a>
          </p>
        </section>
      </article>
    </>
  );
}
