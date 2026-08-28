/**
 * Shared shapes for the scroll-scrubbed film.
 *
 * This file was a component — a sequence pinned to one section of the page.
 * That was replaced by BackgroundSequence, which pins the film to the whole
 * document instead, so only the types survive. They live here rather than in
 * BackgroundSequence so the page and layout can describe a sequence without
 * importing the client component that renders it.
 */

export type SequenceSource = {
  /** Directory under /public holding f0001.<ext> … */
  dir: string;
  width: number;
  height: number;
  /** Frame count for this source; the phone set carries half as many. */
  frames: number;
  /** File extension of the frames. Defaults to webp. */
  ext?: 'webp' | 'avif';
};

export type SequenceVariants = { sm: SequenceSource; lg: SequenceSource };

/** A frosted panel that floats over the footage for part of the scroll. */
export type SequenceCard = {
  /** Progress window (0–1) the card is visible across, fades included. */
  from: number;
  to: number;
  corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Small label above the title — a status, a code, a device name. */
  eyebrow?: string;
  title: string;
  body?: string;
  /** Colour of the status dot; omit for no dot. */
  tone?: 'warn' | 'live' | 'ai';
};
