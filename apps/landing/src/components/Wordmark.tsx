import Image from 'next/image';

/**
 * The brand mark — the car silhouette with a diagnostic pulse running through
 * it — lifted from the app icon (apps/mobile/assets/icon.png) by
 * apps/landing/video/../scripts: the white ground is keyed out and the navy
 * outline remapped to a pale ink, because the header is dark glass over the
 * film and the original near-black outline disappeared against it. The pulse
 * keeps its blue-to-teal gradient untouched.
 *
 * The lettering stays live type rather than part of the image: it is sharper at
 * this size, and it is the piece a designer is most likely to want to restyle.
 *
 * If a vector of the mark ever exists, swap the <Image> for an inline SVG — it
 * would drop the request and let the outline inherit `currentColor`, which is
 * what the previous hand-drawn mark did.
 */
export function Wordmark({
  className = '',
  compact = false,
}: {
  className?: string;
  /** Drops the lettering below `sm`, where the header has no room for it. */
  compact?: boolean;
}) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <Image
        src="/logo-mark.png"
        alt=""
        aria-hidden="true"
        width={640}
        height={318}
        priority
        className="h-[26px] w-auto"
      />
      <span
        // The brand face, not `font-display`: it has one weight and its own
        // heavy drawing, so no font-bold here.
        style={{ fontFamily: 'var(--font-brand), var(--font-display)' }}
        className={`text-[18px] tracking-[0.01em] text-ink ${
          compact ? 'hidden sm:inline' : ''
        }`}
      >
        Auto<span className="ml-1.5 text-ink-3">Area</span>
      </span>
    </span>
  );
}
