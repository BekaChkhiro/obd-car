'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * A statement scattered across the frame rather than set as a block. The page
 * runs two of them, one after the other, over the first half of the film.
 *
 *   corner   a top corner, under the header, in whatever the shot leaves open
 *   middle   one line along the bottom, set flush to the column; one or two
 *            words, sized together but revealed separately
 *   last     under it, also flush, and therefore much larger — it is the
 *            shorter string, and both rows are fitted to the same measure
 *
 * That last point is the whole mechanism: a row fitted to a fixed width gets
 * bigger the fewer characters it has. It cannot be expressed in CSS, because
 * `vw` units scale with the viewport and not with how wide a particular string
 * happens to draw, so each row is measured at a reference size and scaled by
 * the ratio. Pieces [1] and [2] share a row, so they are measured together and
 * sized as one — only their reveal is separate.
 *
 * The reveal is driven by scroll position, not by a timer. A timed stagger was
 * tried first — a second between pieces — and it desynchronised the moment
 * anyone scrolled quickly: the film ran on ahead while the words were still
 * counting out seconds. Tying each piece to a progress threshold keeps the
 * statement locked to the footage at any scroll speed, and makes it reversible,
 * so scrubbing back up unwinds it.
 *
 * It clears once the film reaches the garage, where the glass cards take over.
 */

type Props = {
  /** Sits in a top corner. */
  corner: string;
  /** Which corner. Statements alternate sides to stay clear of the cards. */
  side?: 'left' | 'right';
  /** Share of the column the corner piece is fitted to. */
  cornerMeasure?: number;
  /** Shares the first bottom row; sized as one, revealed word by word. */
  middle: string[];
  /** The closing row, and therefore the largest. */
  last: string;
  progress: number;
  /** Progress at which the corner piece starts to arrive. */
  from: number;
  /** Progress between one piece arriving and the next. */
  step: number;
  /** Scroll progress across which the whole statement fades out. */
  fade: { from: number; to: number };
};

/**
 * Default share of the column the corner piece is fitted to. It is per
 * statement because the fraction is a width, not a size: a two-letter word set
 * to 30% of the column comes out four times taller than a ten-letter one set to
 * the same 30%. Long corner words need a larger share to read at the same
 * weight as short ones.
 */
const DEFAULT_CORNER_MEASURE = 0.30;
/** Ceiling for the bottom pair together, as a share of viewport height. */
const MAX_BOTTOM_VH = 0.46;
/**
 * Leading. Set below 1 the rows collide: this face draws Georgian well outside
 * its line box, and the two bottom rows differ enough in size that the larger
 * one's ascenders reach into the smaller one's row.
 */
const LINE_HEIGHT = 1.2;
/**
 * Optical nudge for the corner piece, in em so it tracks the type size. The
 * glyphs carry side bearings, so aligning the box to the column leaves the ink
 * visibly short of the edge the header sets above it.
 */
const CORNER_NUDGE_EM = 0.07;
/** Progress span each piece takes to arrive fully. */
const RAMP = 0.045;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function IntroHeadline({
  corner: cornerText,
  side = 'right',
  cornerMeasure = DEFAULT_CORNER_MEASURE,
  middle,
  last: lastText,
  progress,
  from,
  step,
  fade,
}: Props) {
  const columnRef = useRef<HTMLDivElement>(null);
  const cornerRef = useRef<HTMLSpanElement>(null);
  const midRef = useRef<HTMLSpanElement>(null);
  const lastRef = useRef<HTMLSpanElement>(null);
  const [sizes, setSizes] = useState({ corner: 0, mid: 0, last: 0 });

  const fit = useCallback(() => {
    const column = columnRef.current;
    const corner = cornerRef.current;
    const mid = midRef.current;
    const last = lastRef.current;
    if (!column || !corner || !mid || !last) return;

    // clientWidth counts the column's own padding, so fitting to it would
    // overshoot the measure by exactly the gutters.
    const style = getComputedStyle(column);
    const measure =
      column.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    if (!(measure > 0)) return;

    // Measured at a reference size. Every measured node must be inline-block:
    // a block-level span reports the container's width rather than the text's,
    // which makes every ratio exactly 1 and pins every row to the reference
    // size. Each row therefore sits in its own wrapper div for stacking, and
    // the span inside it is what gets measured.
    const natural = (node: HTMLSpanElement) => {
      node.style.fontSize = '100px';
      return node.getBoundingClientRect().width;
    };
    const cornerWidth = natural(corner);
    const midWidth = natural(mid);
    const lastWidth = natural(last);
    if (!cornerWidth || !midWidth || !lastWidth) return;

    let next = {
      corner: ((measure * cornerMeasure) / cornerWidth) * 100,
      mid: (measure / midWidth) * 100,
      last: (measure / lastWidth) * 100,
    };

    // Only the bottom pair can run off the top of the frame, so only those two
    // are measured against the height, and they scale together to keep their
    // relative sizes.
    const stack = (next.mid + next.last) * LINE_HEIGHT;
    const room = window.innerHeight * MAX_BOTTOM_VH;
    if (stack > room && stack > 0) {
      const scale = room / stack;
      next = { ...next, mid: next.mid * scale, last: next.last * scale };
    }

    // Written imperatively so the reference size never reaches the screen, and
    // also through state so React's next render does not wipe it — an inline
    // style React does not know about is dropped when it rewrites the attribute.
    corner.style.fontSize = `${next.corner}px`;
    mid.style.fontSize = `${next.mid}px`;
    last.style.fontSize = `${next.last}px`;
    setSizes(next);
  }, [middle.length, cornerMeasure]);

  useLayoutEffect(() => {
    fit();
    const column = columnRef.current;
    const observer = new ResizeObserver(fit);
    if (column) observer.observe(column);
    window.addEventListener('resize', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [fit]);

  // The brand face loads async; without this the fit is computed against the
  // fallback's metrics and every row lands at the wrong size.
  useEffect(() => {
    document.fonts?.ready.then(fit).catch(() => {});
  }, [fit]);

  const out = clamp01(1 - (progress - fade.from) / (fade.to - fade.from));
  if (out <= 0.01) return null;

  /**
   * Rises, sharpens and fades in across its own slice of the scroll. The blur
   * clearing is what makes it read as arriving rather than switching on.
   *
   * No CSS transition: progress is already eased upstream, and a transition on
   * top of it would lag a frame behind the footage — the very thing this is
   * meant to fix.
   */
  const reveal = (i: number) => {
    const t = clamp01((progress - (from + i * step)) / RAMP);
    return {
      opacity: t,
      transform: `translateY(${(1 - t) * 0.22}em)`,
      filter: `blur(${(1 - t) * 12}px)`,
    } as const;
  };

  const type = {
    fontFamily: 'var(--font-brand), var(--font-display)',
    lineHeight: LINE_HEIGHT,
    // The type sits straight on the footage, with no panel behind it.
    textShadow: '0 4px 28px rgb(0 0 0 / 0.55)',
  } as const;

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ opacity: out, transition: 'opacity 400ms linear' }}
    >
      {/* One column shared by both anchors, so the bottom rows and the corner
          piece align to the same measure as the header above them. */}
      <div
        ref={columnRef}
        className="mx-auto flex h-full w-full max-w-6xl flex-col justify-between px-5 py-2 sm:px-6 sm:py-4"
      >
        <div
          className={`flex pt-20 sm:pt-24 ${side === 'left' ? 'justify-start' : 'justify-end'}`}
          style={{
            [side === 'left' ? 'marginLeft' : 'marginRight']: `${-CORNER_NUDGE_EM}em`,
            fontSize: sizes.corner || undefined,
          }}
        >
          <span
            ref={cornerRef}
            className="inline-block whitespace-nowrap text-white"
            style={{
              ...type,
              // Measured while hidden, so the first paint never flashes at 100px.
              visibility: sizes.corner ? 'visible' : 'hidden',
              ...reveal(0),
            }}
          >
            {cornerText}
          </span>
        </div>

        <div className="pb-10 sm:pb-16">
          {/* Each row is wrapped so it stacks, while the measured span itself
              stays inline-block. Both words share one span, so the row is
              fitted as a whole; only the reveal is per word. */}
          <div>
            <span
              ref={midRef}
              className="inline-block whitespace-nowrap text-white"
              style={{
                ...type,
                fontSize: sizes.mid ? `${sizes.mid}px` : undefined,
                visibility: sizes.mid ? 'visible' : 'hidden',
              }}
            >
              {/* The gap is a margin, not a space character: whitespace at the
                  start of an inline-block is collapsed away, so a literal space
                  between the words vanished and they ran together. */}
              {middle.map((word, i) => (
                <span
                  key={word}
                  className="inline-block"
                  style={{ ...reveal(1 + i), marginLeft: i > 0 ? '0.28em' : undefined }}
                >
                  {word}
                </span>
              ))}
            </span>
          </div>
          <div>
            <span
              ref={lastRef}
              className="inline-block whitespace-nowrap text-white"
              style={{
                ...type,
                fontSize: sizes.last ? `${sizes.last}px` : undefined,
                visibility: sizes.last ? 'visible' : 'hidden',
                ...reveal(1 + middle.length),
              }}
            >
              {lastText}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
