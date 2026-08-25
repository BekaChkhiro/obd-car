import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { homeJsonLd, jsonLdScript } from '@/lib/jsonld';
import { pathFor } from '@/lib/site';
import { screenshotFor, type ScreenName } from '@/lib/screenshots';
import { PhoneFrame } from '@/components/PhoneFrame';
import { ScreenChat } from '@/components/screens/ScreenChat';
import { ScreenCodes } from '@/components/screens/ScreenCodes';
import { ScreenDashboard } from '@/components/screens/ScreenDashboard';
import { StoreButtons } from '@/components/StoreButtons';
import { CornerMarks, HeroChips } from '@/components/HeroChips';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dict = getDictionary(lang);

  // `absolute` overrides the layout's template — the home page is the one page
  // whose title should not carry the site name twice.
  return {
    title: { absolute: dict.meta.title },
    description: dict.meta.description,
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const locale = lang as Locale;
  const dict = getDictionary(locale);

  /** Feature cards echo the reference's tinted trio, tinted from our own tokens. */
  const featureTints = ['var(--accent-soft)', 'var(--ai-soft)', 'var(--live-soft)'];
  const featureScreens = [
    <ScreenDashboard key="dash" dict={dict} />,
    <ScreenChat key="chat" dict={dict} />,
    <ScreenCodes key="codes" dict={dict} />,
  ];
  // Same order as featureScreens, so a real capture in public/screens/ replaces
  // the matching mock-up the moment it exists — see PhoneFrame's own doc comment.
  const featureScreenNames: ScreenName[] = ['dashboard', 'chat', 'codes'];
  const featureScreenAlts = [
    dict.screens.liveData,
    dict.screens.chat.title,
    dict.screens.codesScreen.title,
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(homeJsonLd(locale, dict)) }}
      />

      {/* ---------------------------------------------------------------- Hero */}
      <section className="hero-wash relative overflow-hidden">
        <div className="grid-paper absolute inset-0" aria-hidden="true" />
        <div className="shell relative pb-0 pt-14 sm:pt-20">
          <CornerMarks />

          <div className="mx-auto max-w-3xl text-center">
            <span className="eyebrow inline-block rounded-full border border-hairline bg-surface px-4 py-1.5">
              {dict.hero.badge}
            </span>
            <h1 className="mt-7 text-[clamp(2rem,4.4vw,3.15rem)] font-extrabold">
              {dict.hero.title}
            </h1>
            <p className="lede mx-auto mt-6 max-w-xl">{dict.hero.lead}</p>
            <div className="mt-9 flex justify-center">
              <StoreButtons dict={dict} />
            </div>
            <p className="mt-4 text-[13px] text-ink-3">{dict.hero.note}</p>
          </div>

          <div className="relative mx-auto mt-14 max-w-[19rem] sm:max-w-[20rem]">
            <HeroChips dict={dict} />
            {/* priority: this is the hero's largest asset and, once a real
                screenshot lands, its likely LCP element — worth the eager load
                that would be wasted on every other PhoneFrame further down. */}
            <PhoneFrame src={screenshotFor('dashboard', locale)} alt={dict.screens.liveData} priority>
              <ScreenDashboard dict={dict} />
            </PhoneFrame>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- Intro */}
      <section className="border-t border-hairline">
        <div className="shell grid gap-8 py-14 md:grid-cols-2 md:items-center md:gap-16">
          <p className="max-w-sm text-[14.5px] leading-relaxed text-ink-3">
            {dict.intro.body}
          </p>
          <div className="flex items-start gap-5">
            <span className="mt-1.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M6 13l6 6 6-6" />
              </svg>
            </span>
            <h2 className="text-[clamp(1.6rem,3.2vw,2.4rem)]">{dict.intro.title}</h2>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Features */}
      <section id="features" className="scroll-mt-8">
        <div className="shell pb-16">
          <h2 className="sr-only">{dict.features.eyebrow}</h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {dict.features.items.map((item, index) => (
              <li
                key={item.title}
                className="relative flex flex-col overflow-hidden rounded-[1.75rem] border border-hairline pt-7"
                style={{ background: featureTints[index] }}
              >
                <div className="px-7">
                  <h3 className="text-[20px]">{item.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{item.body}</p>
                </div>
                {/* The phone is cropped by the card: the screen continues past the
                    bottom edge, which reads as a device sitting in the card rather
                    than an image pasted into it. */}
                <div className="mt-7 h-[15.5rem] overflow-hidden px-10">
                  <PhoneFrame
                    src={screenshotFor(featureScreenNames[index], locale)}
                    alt={featureScreenAlts[index]}
                    className="mx-auto max-w-[13rem]"
                  >
                    {featureScreens[index]}
                  </PhoneFrame>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ----------------------------------------------------------------- How */}
      <section id="how" className="scroll-mt-8 border-t border-hairline">
        <div className="shell band">
          <div className="grid gap-6 md:grid-cols-2 md:items-end md:gap-16">
            <div>
              <p className="eyebrow">{dict.how.eyebrow}</p>
              <h2 className="mt-4 text-[clamp(1.75rem,3.4vw,2.6rem)]">{dict.how.title}</h2>
            </div>
            <p className="lede max-w-md text-[15px]">{dict.how.lead}</p>
          </div>

          {/* Numbered because this genuinely is a sequence — nothing can pair with
              an adapter that is not plugged in yet. */}
          <div className="mt-14 grid items-center gap-8 lg:grid-cols-[1fr_auto_1fr] lg:gap-10">
            <ol className="contents">
              {dict.how.steps.map((step, index) => {
                const column = index % 2 === 0 ? 'lg:col-start-1' : 'lg:col-start-3';
                // Written out rather than interpolated: Tailwind scans the source
                // for literal class strings, so `lg:row-start-${n}` would never
                // be generated.
                const row = ['lg:row-start-1', 'lg:row-start-1', 'lg:row-start-2', 'lg:row-start-2'][
                  index
                ];
                return (
                  <li
                    key={step.title}
                    className={`card p-6 ${column} ${row} ${
                      index % 2 === 0 ? 'lg:ml-8' : 'lg:mr-8'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-4">
                      <h3 className="text-[17px]">{step.title}</h3>
                      {/* text-ink-3, not the fainter -4: at 12px bold this is real
                          copy next to the step title, not a decorative accent, and
                          -4 falls well under the 4.5:1 AA floor at this weight. */}
                      <span className="num text-[12px] font-bold text-ink-3">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                    </div>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{step.body}</p>
                  </li>
                );
              })}
            </ol>

            <div className="order-first mx-auto max-w-[15rem] lg:order-none lg:col-start-2 lg:row-span-2 lg:row-start-1">
              <PhoneFrame src={screenshotFor('chat', locale)} alt={dict.screens.chat.title}>
                <ScreenChat dict={dict} />
              </PhoneFrame>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- Codes */}
      <section id="codes" className="scroll-mt-8 bg-ground">
        <div className="shell band">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
            <div>
              <p className="eyebrow">{dict.codes.eyebrow}</p>
              <h2 className="mt-4 text-[clamp(1.75rem,3.4vw,2.4rem)]">{dict.codes.title}</h2>
              <p className="lede mt-5 max-w-md text-[15px]">{dict.codes.lead}</p>

              <div
                className="mt-8 rounded-3xl border p-6"
                style={{ background: 'var(--warn-soft)', borderColor: 'var(--warn)' }}
              >
                <h3 className="text-[16px]" style={{ color: 'var(--warn)' }}>
                  {dict.codes.warningTitle}
                </h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
                  {dict.codes.warningBody}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <dl className="grid gap-3 sm:grid-cols-3">
                {dict.codes.kinds.map((kind, index) => (
                  <div key={kind.code} className="card p-5">
                    <dt className="flex items-center justify-between gap-2">
                      <span className="num text-[15px] font-bold text-ink">{kind.code}</span>
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{
                          background: ['var(--fault)', 'var(--warn)', 'var(--ink-3)'][index],
                        }}
                      />
                    </dt>
                    <dd>
                      <p className="eyebrow mt-3 text-ink">{kind.label}</p>
                      <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{kind.body}</p>
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="card p-6">
                <h3 className="text-[16px]">{dict.codes.lettersTitle}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
                  {dict.codes.lettersBody}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- FAQ */}
      <section id="faq" className="scroll-mt-8 border-t border-hairline">
        <div className="shell band grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-16">
          <div>
            <p className="eyebrow">{dict.faq.eyebrow}</p>
            <h2 className="mt-4 text-[clamp(1.75rem,3.4vw,2.4rem)]">{dict.faq.title}</h2>
          </div>

          {/* <details> keeps every answer in the DOM whether open or shut, so the
              visible copy and the FAQPage structured data are the same text. */}
          <div className="border-t border-hairline">
            {dict.faq.items.map((item) => (
              <details key={item.q} className="group border-b border-hairline">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[15.5px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-5 w-5 shrink-0 text-ink-3 transition-transform duration-200 group-open:rotate-45"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </summary>
                <p className="pb-5 pr-8 text-[14.5px] leading-relaxed text-ink-2">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Download */}
      <section id="download" className="scroll-mt-8">
        <div className="shell pb-16">
          <div className="grid items-center gap-8 overflow-hidden rounded-[2rem] border border-hairline bg-ground px-8 pt-12 sm:px-12 md:grid-cols-[1.15fr_0.85fr] md:gap-4 md:pt-0">
            <div className="md:py-14">
              <p className="eyebrow">{dict.download.kicker}</p>
              <h2 className="mt-4 text-[clamp(1.9rem,3.8vw,2.9rem)]">{dict.download.title}</h2>
              <p className="lede mt-5 max-w-md text-[15px]">{dict.download.body}</p>
              <div className="mt-8">
                <StoreButtons dict={dict} />
              </div>
              <p className="mt-4 text-[13px] text-ink-3">{dict.download.note}</p>
            </div>

            {/* Cropped at the card's bottom edge, the same treatment as the
                feature cards, so the two sections read as one system. */}
            <div className="mx-auto h-[17rem] max-w-[14rem] overflow-hidden md:h-[21rem] md:self-end">
              <PhoneFrame src={screenshotFor('dashboard', locale)} alt={dict.screens.liveData}>
                <ScreenDashboard dict={dict} />
              </PhoneFrame>
            </div>
          </div>

          <p className="mt-6 text-center text-[13px] text-ink-3">
            <Link
              href={pathFor(locale, '/privacy')}
              className="underline decoration-hairline-strong underline-offset-4 transition-colors hover:text-ink"
            >
              {dict.footer.terms}
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
