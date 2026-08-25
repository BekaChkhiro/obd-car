# @obd-car/landing

Marketing site for the OBD-II AI Diagnostic Assistant. Next.js App Router,
statically generated, bilingual (ka / en), light and dark.

## Running

```bash
pnpm --filter @obd-car/landing dev        # http://localhost:3000 → /ka
pnpm --filter @obd-car/landing build
pnpm --filter @obd-car/landing typecheck
```

## Configuration

Copy `.env.example` to `.env.local` and set the real origin — it drives every
canonical URL, hreflang alternate, sitemap entry and JSON-LD `@id`:

```
NEXT_PUBLIC_SITE_URL=https://your-domain.tld
```

Set `NEXT_PUBLIC_APP_STORE_URL` / `NEXT_PUBLIC_PLAY_STORE_URL` once the listings
exist and the hero badges become real store links; until then they say "coming"
and open an early-access email.

## Routing

Every page lives under a locale segment. `src/proxy.ts` negotiates
`Accept-Language` on bare paths and 307s to `/ka` or `/en`, so an English
visitor is not bounced through the Georgian page first.

| Route                     | Page                        |
| ------------------------- | --------------------------- |
| `/ka`, `/en`              | Landing page                |
| `/ka/privacy`             | Privacy policy              |
| `/sitemap.xml`            | Both locales, w/ alternates |
| `/robots.txt`             | Disallows non-production    |
| `/manifest.webmanifest`   | PWA manifest                |
| `/{lang}/opengraph-image` | 1200×630 social card        |

## Phone mock-ups

The phones render the real app UI in HTML (`src/components/screens/`) rather
than screenshots, so they stay sharp at any density and follow the copy in
`src/i18n`. To swap in real screenshots, drop the files in `public/screens/`
and pass `src` to `PhoneFrame`:

```tsx
<PhoneFrame src="/screens/dashboard.png" alt="…" priority />
```

`PhoneFrame` renders the image instead of its children, so nothing else changes.

## SEO

- Per-locale `generateMetadata` with canonical + full `hreflang` map
  (`ka-GE`, `en`, `x-default`).
- One connected JSON-LD graph per page — `Organization`, `WebSite`,
  `MobileApplication`, `WebPage`, `HowTo`, `FAQPage`, `BreadcrumbList` — with
  stable `@id`s. No invented `offers` or `aggregateRating`.
- FAQ answers live in `<details>`, so the visible copy and the `FAQPage` data
  are the same text.
- `robots.ts` disallows everything outside production, so preview deployments
  cannot compete with the real domain.
- Fonts self-hosted via `next/font`, no render-blocking request and no CLS.

## Design tokens

`src/app/globals.css` carries the light palette verbatim from
`apps/mobile/src/theme/colors.ts` — keep the two in sync, the site and the app
are meant to read as the same product. The dark palette is web-only; the app
ships light, which is also why `.app-screen` pins the light tokens inside every
phone mock-up.
