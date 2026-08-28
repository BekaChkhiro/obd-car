import Image from 'next/image';

/**
 * A device bezel that takes either a real screenshot or a rendered mock-up.
 *
 * The bezel colour is a fixed near-black in both themes: it is a physical
 * object, not a page surface, and a phone whose frame turned white in dark mode
 * would stop reading as a phone. What it wraps stays on the `.app-screen`
 * scope, which pins the app's own light palette.
 *
 * Drop a screenshot in `public/screens/` and pass `src` — the mock-up children
 * are the placeholder until then.
 */
export function PhoneFrame({
  src,
  alt,
  children,
  className = '',
  priority = false,
}: {
  src?: string;
  alt?: string;
  children?: React.ReactNode;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div className={`relative ${className}`}>
      {/* Side buttons, drawn behind the body so only the sliver that overhangs
          the edge shows — which is all a real phone shows from the front. */}
      <span
        aria-hidden="true"
        className="absolute -left-[3px] top-[16%] z-0 h-[4%] w-[3px] rounded-l-sm"
        style={{ background: 'linear-gradient(180deg,#6b7080,#3a3e4b)' }}
      />
      <span
        aria-hidden="true"
        className="absolute -left-[3px] top-[23%] z-0 h-[7%] w-[3px] rounded-l-sm"
        style={{ background: 'linear-gradient(180deg,#6b7080,#3a3e4b)' }}
      />
      <span
        aria-hidden="true"
        className="absolute -left-[3px] top-[32%] z-0 h-[7%] w-[3px] rounded-l-sm"
        style={{ background: 'linear-gradient(180deg,#6b7080,#3a3e4b)' }}
      />
      <span
        aria-hidden="true"
        className="absolute -right-[3px] top-[26%] z-0 h-[11%] w-[3px] rounded-r-sm"
        style={{ background: 'linear-gradient(180deg,#6b7080,#3a3e4b)' }}
      />

      {/* The rail. A single flat colour reads as a drawing of a phone; the
          gradient is what makes it read as a machined metal band catching light
          on its left and right edges. */}
      <div
        className="relative rounded-[2.9rem] p-[3px] shadow-[0_30px_60px_-20px_rgb(0_0_0/0.75)]"
        style={{
          background:
            'linear-gradient(145deg,#8f95a6 0%,#4a4f5e 18%,#2b2f3a 38%,#22252e 62%,#4a4f5e 84%,#8f95a6 100%)',
        }}
      >
        {/* Bezel: the black between the metal and the glass. */}
        <div
          className="rounded-[2.75rem] p-[0.42rem]"
          style={{ background: '#08080c' }}
        >
        {/* aspect-ratio reserves the box before paint, so nothing around the
            phone shifts once the screen content or image resolves. */}
        <div className="app-screen relative overflow-hidden rounded-[2.35rem] aspect-[9/19]">
          {/* Dynamic island */}
          <div
            className="absolute left-1/2 top-2 z-20 h-[1.15rem] w-[4.6rem] -translate-x-1/2 rounded-full"
            style={{ background: '#08080c' }}
            aria-hidden="true"
          >
            {/* Camera. Small, off-centre and barely lit — enough to stop the
                island reading as a plain black lozenge. */}
            <span
              className="absolute right-[0.42rem] top-1/2 h-[0.42rem] w-[0.42rem] -translate-y-1/2 rounded-full"
              style={{
                background:
                  'radial-gradient(circle at 35% 30%, #2b3550 0%, #10131c 60%, #05060a 100%)',
              }}
            />
          </div>
          {src ? (
            <Image
              src={src}
              alt={alt ?? ''}
              fill
              priority={priority}
              sizes="(max-width: 768px) 70vw, 320px"
              className="object-cover"
            />
          ) : (
            children
          )}

          {/* Screen glare: a soft diagonal sheen across the glass. Kept very
              low so it never fights the screenshot underneath. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10"
            style={{
              background:
                'linear-gradient(122deg, rgb(255 255 255 / 0.1) 0%, rgb(255 255 255 / 0.03) 18%, transparent 42%)',
            }}
          />
        </div>
        </div>
      </div>
    </div>
  );
}

/** iOS-style status bar. Purely decorative, so it is hidden from assistive tech. */
export function StatusBar() {
  return (
    <div
      className="flex items-center justify-between px-6 pb-1 pt-3.5"
      aria-hidden="true"
    >
      <span className="num text-[11px] font-semibold text-ink">9:41</span>
      <div className="flex items-center gap-1 text-ink">
        <svg viewBox="0 0 18 12" className="h-2.5 w-4" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="1" />
          <rect x="4.5" y="5.5" width="3" height="6.5" rx="1" />
          <rect x="9" y="3" width="3" height="9" rx="1" />
          <rect x="13.5" y="0" width="3" height="12" rx="1" />
        </svg>
        <svg viewBox="0 0 16 12" className="h-2.5 w-3.5" fill="currentColor">
          <path d="M8 10.6 6.1 8.5a2.7 2.7 0 0 1 3.8 0L8 10.6ZM8 6.6a5 5 0 0 0-3.5 1.4L3 6.4a7.1 7.1 0 0 1 10 0l-1.5 1.6A5 5 0 0 0 8 6.6ZM8 2.6a9 9 0 0 0-6.3 2.5L.2 3.6a11.1 11.1 0 0 1 15.6 0l-1.5 1.5A9 9 0 0 0 8 2.6Z" />
        </svg>
        <span className="ml-0.5 flex h-2.5 w-5 items-center rounded-[3px] border border-ink/40 p-[1.5px]">
          <span className="h-full w-[72%] rounded-[1px] bg-ink" />
        </span>
      </div>
    </div>
  );
}
