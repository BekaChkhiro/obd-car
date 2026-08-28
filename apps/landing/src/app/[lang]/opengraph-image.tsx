import { ImageResponse } from 'next/og';
import { getDictionary } from '@/i18n';
import { isLocale, locales, defaultLocale } from '@/i18n/config';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

/**
 * A plain `export const alt` is a single string shared by every param this
 * route is generated for, so a Georgian page's card would carry English alt
 * text. `generateImageMetadata` receives the same `params` the page does,
 * which is what lets the alt text — and only the alt text, everything else
 * is identical — follow the locale.
 */
export function generateImageMetadata({ params }: { params: { lang: string } }) {
  const locale = isLocale(params.lang) ? params.lang : defaultLocale;
  return [{ id: 'card', contentType, size, alt: getDictionary(locale).meta.ogAlt }];
}

/**
 * Google Fonts serves woff2 to modern clients, which Satori cannot parse, and a
 * TTF to old ones. Asking with an ancient user-agent is the standard way to get
 * the parseable file. `text=` subsets it to the glyphs this card draws, which
 * keeps the fetch small.
 */
async function loadFont(family: string, weight: number, text: string) {
  const url = `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/533.20.25 (KHTML, like Gecko) Version/5.0.4 Safari/533.20.27',
    },
  }).then((res) => res.text());

  const src = /src:\s*url\(([^)]+)\)/.exec(css)?.[1];
  if (!src) throw new Error(`No font file in the Google Fonts response for ${family}`);
  return fetch(src).then((res) => res.arrayBuffer());
}

export default async function Image({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale = isLocale(lang) ? lang : defaultLocale;
  const dict = getDictionary(locale);

  const headline = dict.hero.title;
  const eyebrow = dict.hero.badge;

  // The card is the app's instrument panel on a night ground: the readings are
  // the product, so they are the image rather than a phone bezel screenshot.
  const readouts = [
    { label: dict.screens.engine, value: '1 680', unit: 'RPM', fault: false },
    { label: dict.screens.coolant, value: '104', unit: '°C', fault: true },
    { label: dict.screens.battery, value: '14.2', unit: 'V', fault: false },
  ];

  // Labels are set in small caps, and uppercasing Georgian Mkhedruli maps it to
  // Mtavruli — a separate Unicode block. Without both cases in the subset every
  // label would render as tofu, so the uppercased text goes in too.
  const text =
    headline + eyebrow + readouts.map((r) => r.label).join('') + 'AutoArea0123456789 RPM°CVP0301';
  const glyphs = text + text.toUpperCase();

  let fonts: { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }[] = [];
  try {
    const [regular, bold] = await Promise.all([
      loadFont('Noto+Sans+Georgian', 400, glyphs),
      loadFont('Noto+Sans+Georgian', 700, glyphs),
    ]);
    fonts = [
      { name: 'Noto', data: regular, weight: 400, style: 'normal' },
      { name: 'Noto', data: bold, weight: 700, style: 'normal' },
    ];
  } catch {
    // Without the font the Georgian headline would be empty boxes, so fall back
    // to the system stack rather than shipping a broken card.
    fonts = [];
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#08080c',
          color: '#f1f3f9',
          padding: '68px 72px',
          fontFamily: fonts.length ? 'Noto' : 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{ display: 'flex', width: 14, height: 14, borderRadius: 999, background: '#34d399' }}
          />
          <div style={{ fontSize: 22, letterSpacing: 5, textTransform: 'uppercase', color: '#767d91' }}>
            {eyebrow}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 72,
            fontWeight: 700,
            lineHeight: 1.12,
            letterSpacing: -1.5,
            maxWidth: 940,
          }}
        >
          {headline}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 56 }}>
            {readouts.map((readout) => (
              <div key={readout.label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div
                  style={{
                    fontSize: 19,
                    letterSpacing: 3.5,
                    textTransform: 'uppercase',
                    color: '#767d91',
                  }}
                >
                  {readout.label}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 7,
                    fontSize: 52,
                    fontWeight: 700,
                    color: readout.fault ? '#ff6f61' : '#f1f3f9',
                  }}
                >
                  {readout.value}
                  <span style={{ fontSize: 22, fontWeight: 400, color: '#767d91' }}>
                    {readout.unit}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '14px 22px',
              borderRadius: 16,
              background: '#ff6f61',
              color: '#08080c',
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: 1,
            }}
          >
            P0301
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
