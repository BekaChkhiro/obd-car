'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { IntroHeadline } from './IntroHeadline';
import type { SequenceCard, SequenceVariants } from './ScrollSequence';

/**
 * The story film as the site's background, scrubbed by the whole page's scroll.
 *
 * Where ScrollSequence pins one section, this pins the document: the canvas is
 * fixed to the viewport, and progress is the reader's position through the
 * entire page. Scrolling from the hero to the footer plays the film once.
 *
 * Frames come from apps/landing/video/publish_frames.sh.
 */

type Props = {
  sources: SequenceVariants;
  alt: string;
  cards?: SequenceCard[];
  /** Statements laid over the footage, each revealed by scroll position. */
  statements?: Array<{
    corner: string;
    side?: 'left' | 'right';
    cornerMeasure?: number;
    middle: string[];
    last: string;
    from: number;
    step: number;
    fade: { from: number; to: number };
  }>;
};

const frameUrl = (src: SequenceVariants['lg'], index: number) =>
  `${src.dir}/f${String(index + 1).padStart(4, '0')}.${src.ext ?? 'webp'}`;

/**
 * One-shot AVIF decode test. The desktop frames are AVIF because it carries the
 * film's native resolution for the bytes a downscaled WebP set was costing; the
 * phone set stays WebP and doubles as the fallback for anything that cannot
 * decode AVIF, which on this page would otherwise mean a blank background.
 */
function supportsAvif(): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.width > 0);
    img.onerror = () => resolve(false);
    img.src =
      'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=';
  });
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function cardOpacity(progress: number, card: SequenceCard) {
  const ramp = Math.max(0.02, (card.to - card.from) * 0.18);
  if (progress <= card.from || progress >= card.to) return 0;
  return clamp01(Math.min((progress - card.from) / ramp, (card.to - progress) / ramp));
}

const TONES = { warn: '#e0a33a', live: '#34d399', ai: '#8b83ff' } as const;

export function BackgroundSequence({ sources, alt, cards = [], statements = [] }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /**
   * A second, deliberately tiny canvas holding the same frame. It is scaled up
   * to fill the viewport, which blurs it almost for free — a CSS blur over a
   * full-resolution canvas every frame is expensive, upscaling a sixth-size one
   * is not — and then clipped to the glass panel.
   *
   * This exists because `backdrop-filter` does not see the film: the footage is
   * a fixed, composited canvas, and Chrome leaves such layers out of the
   * backdrop image, so the panels above sampled a sharp frame at any blur
   * radius. Painting the blur ourselves is the only reliable way to get it.
   */
  const blurRef = useRef<HTMLCanvasElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);
  const imagesRef = useRef<Array<HTMLImageElement | null>>([]);
  const loadedRef = useRef<boolean[]>([]);
  const drawnRef = useRef(-1);
  const rafRef = useRef(0);
  /** Where the scroll actually is. */
  const targetRef = useRef(0);
  /** Where the film is, easing toward the target — this is what gets drawn. */
  const progressRef = useRef(0);
  const sizeRef = useRef({ w: 0, h: 0 });

  const [source, setSource] = useState<SequenceVariants['lg'] | null>(null);
  const [reduced, setReduced] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const narrow = window.matchMedia('(max-width: 900px)');
    let avif = false;
    let cancelled = false;

    const apply = () => {
      if (cancelled) return;
      setReduced(motion.matches);
      // Wide screens get the large set only if this browser can decode it;
      // otherwise the phone set is the safe universal fallback.
      const wide = !narrow.matches && (avif || (sources.lg.ext ?? 'webp') !== 'avif');
      setSource(wide ? sources.lg : sources.sm);
    };

    // Draw the fallback immediately, then upgrade once the probe resolves —
    // waiting on the probe would leave the page blank for a round trip.
    apply();
    void supportsAvif().then((ok) => {
      avif = ok;
      apply();
    });

    motion.addEventListener('change', apply);
    narrow.addEventListener('change', apply);
    return () => {
      cancelled = true;
      motion.removeEventListener('change', apply);
      narrow.removeEventListener('change', apply);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Paints the wanted frame, letterbox-free: scaled to cover, centred. */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    const last = source.frames - 1;
    const wanted = Math.round(clamp01(progressRef.current) * last);

    let index = wanted;
    while (index > 0 && !loadedRef.current[index]) index -= 1;
    if (!loadedRef.current[index]) return;

    const image = imagesRef.current[index];
    const ctx = canvas.getContext('2d');
    if (!image || !ctx) return;

    const { w, h } = sizeRef.current;
    const scale = Math.max(w / image.width, h / image.height);
    const dw = image.width * scale;
    const dh = image.height * scale;
    ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);

    const blur = blurRef.current;
    const blurCtx = blur?.getContext('2d');
    if (blur && blurCtx) {
      const bs = Math.max(blur.width / image.width, blur.height / image.height);
      const bw = image.width * bs;
      const bh = image.height * bs;
      blurCtx.drawImage(image, (blur.width - bw) / 2, (blur.height - bh) / 2, bw, bh);
    }

    drawnRef.current = index;
  }, [source]);

  /** Clip the frosted layer to the glass panel, in viewport coordinates. */
  const clipToPanel = useCallback(() => {
    const layer = clipRef.current;
    if (!layer) return;
    const panel = document.querySelector<HTMLElement>('[data-glass-panel]');
    if (!panel) {
      layer.style.clipPath = 'inset(100%)';
      return;
    }
    const r = panel.getBoundingClientRect();
    const radius = getComputedStyle(panel).borderTopLeftRadius || '0px';
    layer.style.clipPath =
      `inset(${r.top}px ${window.innerWidth - r.right}px ` +
      `${window.innerHeight - r.bottom}px ${r.left}px round ${radius})`;
  }, []);

  // --- keep the canvas backing store matched to the viewport -----------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const resize = () => {
      // Cap DPR at 2: a 3x backing store on a phone costs a lot of fill rate for
      // a background that is behind a scrim anyway.
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w, h };

      // A sixth of the viewport is enough: it is only ever seen upscaled and
      // blurred, and this keeps the second draw close to free.
      const blur = blurRef.current;
      if (blur) {
        blur.width = Math.max(1, Math.round(w / 6));
        blur.height = Math.max(1, Math.round(h / 6));
      }
      drawnRef.current = -1;
      draw();
      clipToPanel();
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [draw, clipToPanel]);

  // --- load ------------------------------------------------------------------
  useEffect(() => {
    if (!source) return;
    const { frames } = source;
    imagesRef.current = new Array(frames).fill(null);
    loadedRef.current = new Array(frames).fill(false);
    drawnRef.current = -1;

    let cancelled = false;
    const load = (index: number) =>
      new Promise<void>((resolve) => {
        const image = new Image();
        image.decoding = 'async';
        image.src = frameUrl(source, index);
        image.onload = () => {
          if (!cancelled) {
            imagesRef.current[index] = image;
            loadedRef.current[index] = true;
          }
          resolve();
        };
        image.onerror = () => resolve();
      });

    const run = async () => {
      await load(0);
      draw();
      const CONCURRENCY = 4;
      for (let start = 1; start < frames && !cancelled; start += CONCURRENCY) {
        const batch = [];
        for (let i = start; i < Math.min(start + CONCURRENCY, frames); i += 1) batch.push(load(i));
        await Promise.all(batch);
        draw();
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [source, draw]);

  // --- document scroll drives the film, with easing --------------------------
  //
  // Native scroll is stepped: a wheel notch or a trackpad flick lands as a jump,
  // and mapping it straight onto frame index makes the film stutter. So scroll
  // sets a target and a rAF loop eases the drawn position toward it. The loop
  // parks itself once the two converge, so an idle page costs nothing.
  useEffect(() => {
    if (reduced || !source) return;

    // Time-based rather than per-frame, so the feel is the same at 60 and 120 Hz,
    // and a dropped frame catches up instead of slowing the film down.
    const HALF_LIFE = 90;      // ms for the remaining gap to halve
    const EPSILON = 0.00035;   // below this the gap is under one frame's worth
    let lastTime = 0;

    // The film is scrubbed across its own region rather than the whole document:
    // the closing call-to-action scrolls in after it, and mapping to the full
    // height would hold the footage a frame short of its end until the reader
    // hit the very bottom of the page.
    const readScroll = () => {
      const region = document.querySelector<HTMLElement>('[data-film-range]');
      const start = region ? region.offsetTop : 0;
      const distance = region
        ? region.offsetHeight - window.innerHeight
        : document.documentElement.scrollHeight - window.innerHeight;
      targetRef.current =
        distance <= 0 ? 0 : clamp01((window.scrollY - start) / distance);
    };

    const settle = () => {
      progressRef.current = targetRef.current;
      rafRef.current = 0;
      lastTime = 0;
      setProgress(progressRef.current);
      draw();
      clipToPanel();
    };

    const tick = (now: number) => {
      const gap = targetRef.current - progressRef.current;
      if (Math.abs(gap) < EPSILON) return settle();

      // A long delta means the loop was paused — a background tab, a stalled
      // main thread. Clamping it stops the film lurching on the way back.
      const delta = lastTime ? Math.min(now - lastTime, 120) : 16;
      lastTime = now;
      progressRef.current += gap * (1 - Math.pow(0.5, delta / HALF_LIFE));
      setProgress(progressRef.current);
      draw();
      clipToPanel();
      rafRef.current = window.requestAnimationFrame(tick);
    };

    const start = () => {
      readScroll();
      clipToPanel();
      if (!rafRef.current) {
        lastTime = 0;
        rafRef.current = window.requestAnimationFrame(tick);
      }
    };

    // Coming back to a tab that was scrolled while hidden: rAF was parked, so
    // jump to wherever the scroll ended up rather than easing across the gap.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      readScroll();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      settle();
    };
    document.addEventListener('visibilitychange', onVisible);

    // First paint jumps straight to position: easing in from zero on load would
    // read as an unrequested animation.
    readScroll();
    progressRef.current = targetRef.current;
    setProgress(progressRef.current);
    draw();
    clipToPanel();

    window.addEventListener('scroll', start, { passive: true });
    window.addEventListener('resize', start);
    return () => {
      window.removeEventListener('scroll', start);
      window.removeEventListener('resize', start);
      document.removeEventListener('visibilitychange', onVisible);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [reduced, source, draw, clipToPanel]);

  // z-0, not a negative index: Chrome does not include negative-z layers in the
  // backdrop image, so `backdrop-filter` on the panels above sampled a sharp
  // frame no matter how large the blur was set. Sitting at 0, with the page
  // content lifted to z-10, puts the film in the same stacking context and
  // below the panels — where the filter can actually see it.
  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
      <canvas ref={canvasRef} className="block h-full w-full" role="img" aria-label={alt} />

      {/* The frosted layer: the same frame at a sixth of the size, stretched
          back out and lightly blurred, clipped to whatever carries
          `data-glass-panel`. The blur is deliberately gentle — the panel is
          meant to read like the header bar, which lets the footage through —
          and the panel's own dark veil does most of the settling.
          `scale(1.06)` hides the soft edge the blur leaves at the boundary. */}
      <div ref={clipRef} className="absolute inset-0" style={{ clipPath: 'inset(100%)' }}>
        <canvas
          ref={blurRef}
          aria-hidden="true"
          className="block h-full w-full"
          style={{
            filter: 'blur(9px) saturate(130%) brightness(0.9)',
            transform: 'scale(1.06)',
          }}
        />
      </div>

      {/* Scrim. Without it the page's own text sits on moving footage and is
          unreadable half the time; the vertical gradient keeps the darkest part
          under the header and footer, where the type is densest. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgb(6 7 11 / 0.52) 0%, rgb(6 7 11 / 0.12) 22%, rgb(6 7 11 / 0.12) 78%, rgb(6 7 11 / 0.38) 100%)',
        }}
      />

      {statements.map((statement) => (
        <IntroHeadline key={statement.corner} {...statement} progress={progress} />
      ))}

      {/* Cards ride the footage at the screen edge. They are the only content
          on the page now, so they show at every width — narrow screens just get
          them centred at the bottom, clear of the header. */}
      {cards.map((card) => {
        const opacity = cardOpacity(progress, card);
        if (opacity <= 0.01) return null;
        const bottom = card.corner.startsWith('bottom');
        const right = card.corner.endsWith('right');
        return (
          <div
            key={card.title}
            className={`absolute left-1/2 w-[min(19rem,86vw)] -translate-x-1/2 rounded-2xl p-4 sm:left-auto sm:translate-x-0 ${
              bottom ? 'bottom-10' : 'bottom-10 sm:bottom-auto sm:top-28'
            } ${right ? 'sm:right-8' : 'sm:left-8'}`}
            style={{
              opacity,
              transform: `translateY(${(1 - opacity) * (bottom ? 14 : -14)}px)`,
              background: 'rgb(10 12 18 / 0.52)',
              backdropFilter: 'blur(18px) saturate(150%)',
              WebkitBackdropFilter: 'blur(18px) saturate(150%)',
              border: '1px solid rgb(255 255 255 / 0.14)',
              boxShadow: '0 16px 44px -16px rgb(0 0 0 / 0.7)',
            }}
          >
            {card.eyebrow && (
              <p
                // Brand face, and deliberately not uppercased: it has no
                // Georgian capitals, and its lowercase is drawn as capitals.
                style={{ fontFamily: 'var(--font-brand), var(--font-mono)' }}
                className="flex items-center gap-2 text-[12px] tracking-[0.12em] text-white/65"
              >
                {card.tone && (
                  <span
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: TONES[card.tone], boxShadow: `0 0 10px ${TONES[card.tone]}` }}
                  />
                )}
                {card.eyebrow}
              </p>
            )}
            <p className="mt-1.5 text-[15px] font-semibold leading-snug text-white">{card.title}</p>
            {card.body && (
              <p className="mt-1 text-[13px] leading-relaxed text-white/70">{card.body}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
