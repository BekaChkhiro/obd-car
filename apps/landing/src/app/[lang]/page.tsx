import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getDictionary } from '@/i18n';
import { isLocale, type Locale } from '@/i18n/config';
import { homeJsonLd, jsonLdScript } from '@/lib/jsonld';
import { BackgroundSequence } from '@/components/BackgroundSequence';
import { Outro } from '@/components/Outro';

/**
 * When each background card shows, as a fraction of the whole page's scroll.
 *
 * The statements own the first two thirds of the film and take the bottom band
 * with them, so the cards stay in the top-right corner until the last one is
 * gone. Each window sits inside the scene it describes:
 *   s06 adapter paired | s08 fault code | s09-s10 fixed
 */
const BACKDROP_CARD_TIMING = [
  { from: 0.58, to: 0.68, corner: 'top-right', tone: 'live' },
  { from: 0.75, to: 0.84, corner: 'top-right', tone: 'warn' },
  { from: 0.88, to: 1.0, corner: 'top-right', tone: 'live' },
] as const;

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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(homeJsonLd(locale, dict)) }}
      />

        {/* The film sits behind everything and is scrubbed by the page's own
          scroll — see BackgroundSequence. The sheet that used to carry the
          page is now transparent, so the content reads as glass floating on
          the footage rather than a card covering it. */}
      <BackgroundSequence
        sources={{
          sm: { dir: '/story-video/sm', width: 640, height: 360, frames: 150 },
          lg: { dir: '/story-video/lg', width: 1280, height: 720, frames: 300, ext: 'avif' },
        }}
        alt={dict.story.alt}
        statements={[
          // Over the driveway, while he is still stuck at the bonnet.
          {
            corner: dict.story.intro[0],
            middle: [dict.story.intro[1], dict.story.intro[2]],
            last: dict.story.intro[3],
            from: 0.015,
            step: 0.04,
            fade: { from: 0.22, to: 0.29 },
          },
          // Picks up as he reaches the garage and takes out the phone, and is
          // fully clear before the adapter goes into the port at 0.50 — that
          // shot has to be read, not competed with.
          {
            corner: dict.story.intro2[0],
            middle: [dict.story.intro2[1], dict.story.intro2[2]],
            last: dict.story.intro2[3],
            from: 0.27,
            step: 0.028,
            fade: { from: 0.41, to: 0.45 },
          },
          // Held over the adapter shot (scene 6, 0.50-0.60) and cleared as
          // the phone's connecting screen takes over in scene 7. It overlaps
          // the ELM327 card by a couple of points, which is fine: the
          // statement is anchored left and the card sits right.
          //
          // The corner word is long, so it needs twice the usual share of the
          // column to read at the same weight as the short ones above.
          {
            corner: dict.story.intro3[0],
            side: 'left',
            // Same share as the fourth statement's corner. Both words are ten
            // letters long, so the same fraction gives them the same size.
            cornerMeasure: 0.46,
            middle: [dict.story.intro3[1], dict.story.intro3[2]],
            last: dict.story.intro3[3],
            from: 0.45,
            step: 0.016,
            fade: { from: 0.575, to: 0.605 },
          },
          // Runs from the connecting screen through most of the fix (scenes 7
          // and 8) and is clear before the bonnet comes down at 0.80. It
          // overlaps the P0420 card, which is fine: the statement is anchored
          // left and in the bottom band, the card sits top right.
          {
            corner: dict.story.intro4[0],
            side: 'left',
            cornerMeasure: 0.46,
            middle: [dict.story.intro4[1], dict.story.intro4[2]],
            last: dict.story.intro4[3],
            from: 0.61,
            step: 0.016,
            fade: { from: 0.74, to: 0.79 },
          },
          // The closing line, over the bonnet coming down and the walk away.
          // It clears by the end of the film: the panel below is glass, so
          // anything still lit on the background layer reads straight through
          // it rather than behind it.
          {
            corner: dict.story.intro5[0],
            side: 'right',
            cornerMeasure: 0.34,
            middle: [dict.story.intro5[1], dict.story.intro5[2]],
            last: dict.story.intro5[3],
            from: 0.82,
            step: 0.018,
            fade: { from: 0.94, to: 1.0 },
          },
        ]}
        cards={dict.story.cards.slice(2).map((card, index) => ({
          ...card,
          ...BACKDROP_CARD_TIMING[index],
        }))}
      />

      {/*
        The film's scroll region. It has no content of its own — the footage and
        the statements over it live on the background layer (BackgroundSequence),
        and this element only gives them the distance they play across.
        `data-film-range` is what that layer measures, so the closing panel below
        can scroll in without dragging the film past its last frame.

        The heading and lede are screen-reader-only rather than absent: a page
        whose opening is painted into a canvas is invisible to assistive tech and
        to search without them, and neither costs anything visually.
      */}
      <div data-film-range style={{ height: '620vh' }}>
        <h1 className="sr-only">{dict.hero.title}</h1>
        <p className="sr-only">{dict.hero.lead}</p>
      </div>

      <Outro locale={locale} dict={dict} />
    </>
  );
}
