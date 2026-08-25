import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

/**
 * Preview deployments must not be indexed — two hosts serving identical copy is
 * exactly the duplicate-content case canonical tags exist to prevent, and a
 * preview URL outranking production is a real failure mode.
 */
const isProduction = process.env.VERCEL_ENV
  ? process.env.VERCEL_ENV === 'production'
  : process.env.NODE_ENV === 'production';

export default function robots(): MetadataRoute.Robots {
  if (!isProduction) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
