import Image from 'next/image';

import type { Dictionary } from '@/i18n';
import { screenshotFor } from '@/lib/screenshots';
import { site } from '@/lib/site';
import type { Locale } from '@/i18n/config';
import { PhoneFrame } from '@/components/PhoneFrame';
import { StoreButtons } from '@/components/StoreButtons';
import { ScreenDashboard } from '@/components/screens/ScreenDashboard';

/**
 * The closing panel: the film ends, and this is what the reader is left holding.
 *
 * The phone sits left because that is where the eye lands after the last shot —
 * the man walks out of frame to the left — and everything actionable is stacked
 * on the right, in the order someone actually uses it: what the thing is called,
 * where to get it, the code to get it on the device they are not reading this
 * on, and only then the accounts to follow.
 *
 * The QR points at the site root rather than at a store listing. The listings do
 * not exist yet, and a site can route a phone to the right store — so the code
 * never has to be regenerated.
 */

const SOCIAL_PATHS: Record<string, string> = {
  facebook:
    'M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.5-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.45 2.9h-2.33V22c4.78-.76 8.44-4.92 8.44-9.94Z',
  instagram:
    'M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.8 3.8 0 0 1-1.38-.9 3.8 3.8 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41 1.27-.06 1.65-.07 4.85-.07Zm0 5.68a4.16 4.16 0 1 0 0 8.32 4.16 4.16 0 0 0 0-8.32Zm0 6.86a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4Zm5.3-7.03a.97.97 0 1 1-1.94 0 .97.97 0 0 1 1.94 0Z',
  youtube:
    'M21.58 7.19a2.5 2.5 0 0 0-1.76-1.77C18.25 5 12 5 12 5s-6.25 0-7.82.42A2.5 2.5 0 0 0 2.42 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .42 4.81 2.5 2.5 0 0 0 1.76 1.77C5.75 19 12 19 12 19s6.25 0 7.82-.42a2.5 2.5 0 0 0 1.76-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.42-4.81ZM10 15.02V8.98L15.2 12 10 15.02Z',
  tiktok:
    'M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.1v12.4a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 1 1 .77-5.06V9.66a5.7 5.7 0 0 0-.77-.05A5.66 5.66 0 1 0 15.54 15V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.29 4.29 0 0 1-3.24-1.48Z',
};

export function Outro({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const socials = Object.entries(site.social).filter(
    (entry): entry is [string, string] => Boolean(entry[1]),
  );

  // No gutters of its own: the layout wrapper around <main> already supplies
  // them, and a second set inset the panel from the header above it.
  return (
    <section id="download" className="scroll-mt-8 pb-16 pt-6">
      {/* Same container as the header — `max-w-6xl` inside the layout's own
          gutters — so the two panels share an edge. */}
      <div
        data-glass-panel
        className="glass-strong mx-auto grid w-full max-w-6xl items-center gap-10 rounded-[2rem] p-7 sm:p-10 md:grid-cols-[minmax(0,20rem)_1fr] md:gap-14 lg:p-14"
      >
        <div className="mx-auto w-full max-w-[17rem] md:max-w-none">
          <PhoneFrame src={screenshotFor('dashboard', locale)} alt={dict.story.outro.shot}>
            <ScreenDashboard dict={dict} />
          </PhoneFrame>
        </div>

        <div>
          {/* The name, in the brand face. The film has just ended and the
              reader has been looking at footage, not at the header — this is
              where the product gets named again. */}
          <p
            style={{ fontFamily: 'var(--font-brand), var(--font-display)' }}
            className="text-[clamp(2.6rem,5.5vw,4rem)] leading-none tracking-[0.02em] text-ink"
          >
            AUTO <span className="text-ink-3">AREA</span>
          </p>

          <span className="eyebrow mt-6 inline-block">{dict.story.outro.eyebrow}</span>
          <h2 className="mt-2.5 text-[clamp(1.8rem,3.6vw,2.8rem)]">{dict.story.outro.title}</h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-3">
            {dict.story.outro.body}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-6">
            <StoreButtons dict={dict} />

            {/* The QR is for the other device: someone reading this on a laptop
                cannot tap a store button, and this is the shortest path from
                that screen to their phone. */}
            <div className="flex items-center gap-3">
              <span className="grid h-24 w-24 shrink-0 place-items-center rounded-2xl bg-white p-2 text-black shadow-[0_2px_14px_rgb(0_0_0/0.12)]">
                <Image
                  src="/qr-download.svg"
                  alt=""
                  aria-hidden="true"
                  width={96}
                  height={96}
                  className="h-full w-full"
                />
              </span>
              <span className="max-w-[7rem] text-[13px] leading-snug text-ink-3">
                {dict.story.outro.qr}
              </span>
            </div>
          </div>

          {socials.length > 0 && (
            <div className="mt-9 border-t border-hairline pt-6">
              <p className="eyebrow">{dict.story.outro.social}</p>
              <ul className="mt-3 flex items-center gap-2.5">
                {socials.map(([name, href]) => (
                  <li key={name}>
                    <a
                      href={href}
                      target="_blank"
                      rel="me noreferrer"
                      aria-label={name}
                      className="grid h-11 w-11 place-items-center rounded-full border border-hairline text-ink-2 transition-colors hover:border-hairline-strong hover:text-ink"
                    >
                      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor">
                        <path d={SOCIAL_PATHS[name]} />
                      </svg>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
