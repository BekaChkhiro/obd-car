import type { Dictionary } from '@/i18n';
import { localeTags, type Locale } from '@/i18n/config';
import { site, siteUrl, urlFor, type Route } from '@/lib/site';

/**
 * Structured data is emitted as one connected graph rather than a pile of
 * standalone blocks: the Organization, the WebSite, the app and each page carry
 * stable `@id`s and reference one another, which is what lets a crawler treat
 * them as facts about a single entity instead of four unrelated ones.
 *
 * Nothing here is invented for the sake of a rich result. There is no `offers`
 * and no `aggregateRating` — the app is not priced or rated yet, and a
 * fabricated rating is both a policy violation and a lie.
 */

const ORG_ID = `${siteUrl}/#organization`;
const SITE_ID = `${siteUrl}/#website`;
const APP_ID = `${siteUrl}/#app`;

type JsonLdNode = Record<string, unknown>;

function organization(): JsonLdNode {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: site.legalName,
    alternateName: site.name,
    url: siteUrl,
    email: site.email,
    logo: {
      '@type': 'ImageObject',
      url: `${siteUrl}/icon.png`,
      width: 512,
      height: 512,
    },
    sameAs: [site.githubUrl],
  };
}

function website(dict: Dictionary): JsonLdNode {
  return {
    '@type': 'WebSite',
    '@id': SITE_ID,
    url: siteUrl,
    name: site.legalName,
    description: dict.meta.description,
    publisher: { '@id': ORG_ID },
    inLanguage: Object.values(localeTags),
  };
}

function application(locale: Locale, dict: Dictionary): JsonLdNode {
  return {
    '@type': 'MobileApplication',
    '@id': APP_ID,
    name: site.legalName,
    alternateName: site.name,
    url: urlFor(locale),
    description: dict.meta.description,
    applicationCategory: 'UtilitiesApplication',
    applicationSubCategory: 'Automotive diagnostics',
    operatingSystem: 'iOS, Android',
    inLanguage: Object.values(localeTags),
    publisher: { '@id': ORG_ID },
    // `generateImageMetadata` is what lets this route's alt text follow the
    // locale (see the opengraph-image file), and it puts the image's `id`
    // ('card' — there is only the one) on the end of the path.
    screenshot: `${siteUrl}/${locale}/opengraph-image/card`,
    featureList: dict.features.items.map((item) => `${item.title} — ${item.body}`),
    softwareRequirements:
      'An ELM327-compatible OBD-II adapter (Bluetooth LE, Bluetooth Classic or WiFi)',
  };
}

function faqPage(dict: Dictionary): JsonLdNode {
  return {
    '@type': 'FAQPage',
    mainEntity: dict.faq.items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

function howTo(dict: Dictionary): JsonLdNode {
  return {
    '@type': 'HowTo',
    name: dict.how.title,
    description: dict.how.lead,
    step: dict.how.steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.title,
      text: step.body,
    })),
  };
}

function webPage(
  locale: Locale,
  route: Route,
  name: string,
  description: string,
): JsonLdNode {
  return {
    '@type': 'WebPage',
    '@id': `${urlFor(locale, route)}#webpage`,
    url: urlFor(locale, route),
    name,
    description,
    isPartOf: { '@id': SITE_ID },
    about: { '@id': APP_ID },
    inLanguage: localeTags[locale],
  };
}

function breadcrumbs(locale: Locale, trail: { name: string; route: Route }[]): JsonLdNode {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: urlFor(locale, crumb.route),
    })),
  };
}

/** Graph for the landing page: entity, site, product, page, steps and FAQ. */
export function homeJsonLd(locale: Locale, dict: Dictionary) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organization(),
      website(dict),
      application(locale, dict),
      webPage(locale, '', dict.meta.title, dict.meta.description),
      howTo(dict),
      faqPage(dict),
    ],
  };
}

/** Graph for the privacy page — no FAQ, but a breadcrumb trail back home. */
export function privacyJsonLd(locale: Locale, dict: Dictionary) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organization(),
      webPage(locale, '/privacy', dict.privacyPage.title, dict.privacyPage.description),
      breadcrumbs(locale, [
        { name: site.name, route: '' },
        { name: dict.privacyPage.title, route: '/privacy' },
      ]),
    ],
  };
}

/**
 * `dangerouslySetInnerHTML` is the documented way to emit JSON-LD, but the
 * payload still has to be safe inside a <script> element: `<` is escaped so a
 * string in the dictionary can never close the tag early.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
