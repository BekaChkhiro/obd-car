/**
 * The mark is the OBD-II port itself — the 16-pin trapezoid every user of this
 * app has crouched under a steering wheel to find. Drawn rather than imported
 * so it inherits `currentColor` and needs no second asset request per theme.
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
      <svg
        aria-hidden="true"
        viewBox="0 0 28 20"
        className="h-[21px] w-[29px] text-ink"
        fill="none"
      >
        <path
          d="M2.6 3.4h22.8a1 1 0 0 1 1 1v7.9a4 4 0 0 1-4 4H5.6a4 4 0 0 1-4-4V4.4a1 1 0 0 1 1-1Z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <g fill="currentColor">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <rect key={`t${i}`} x={4.6 + i * 2.45} y={6} width="1.3" height="2.2" rx="0.4" />
          ))}
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <rect key={`b${i}`} x={4.6 + i * 2.45} y={10.4} width="1.3" height="2.2" rx="0.4" />
          ))}
        </g>
      </svg>
      <span
        className={`font-display text-[17px] font-bold tracking-[-0.02em] text-ink ${
          compact ? 'hidden sm:inline' : ''
        }`}
      >
        OBD<span className="text-ink-3">·</span>II<span className="ml-1 text-ink-3">AI</span>
      </span>
    </span>
  );
}
