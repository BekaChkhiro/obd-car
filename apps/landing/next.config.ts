import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
];

/**
 * Files under public/ are served with `max-age=0, must-revalidate` by default.
 * For the film that is expensive: 300 frames means 300 conditional requests on
 * every repeat visit, each paying a round trip to be told nothing changed.
 *
 * `immutable` says the bytes at this URL will never change, so the browser must
 * not even ask. That is only honest because both paths are versioned: the frame
 * directory carries a version segment (see STORY_VERSION in the home page), and
 * a font's filename changes when the font does. Republish the film to a new
 * version directory rather than overwriting one — overwriting is exactly the
 * case this header cannot survive.
 */
const immutable = [
  { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  trailingSlash: false,
  images: { formats: ['image/avif', 'image/webp'] },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/story-video/:path*', headers: immutable },
      { source: '/fonts/:path*', headers: immutable },
      { source: '/screens/:path*', headers: immutable },
    ];
  },
};

export default nextConfig;
