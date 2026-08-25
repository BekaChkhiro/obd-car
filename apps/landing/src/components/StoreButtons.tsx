import type { Dictionary } from '@/i18n';
import { site } from '@/lib/site';

const mailto = `mailto:${site.email}?subject=${encodeURIComponent('Early access — OBD-II AI')}`;

const APPLE_PATH =
  'M17.05 12.54c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.62-1.7-3.19-1.72-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.87-.76-1.48.02-2.84.86-3.6 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.25 2.74 2.2 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.08 2.65-2.14.84-1.23 1.18-2.42 1.2-2.48-.03-.01-2.28-.88-2.3-3.5ZM14.87 6.1c.6-.74 1.02-1.75.9-2.77-.87.04-1.94.59-2.57 1.32-.56.64-1.06 1.68-.93 2.67.98.08 1.98-.5 2.6-1.22Z';

const PLAY_PATH =
  'M3.9 2.4a1.3 1.3 0 0 0-.5 1.05v17.1c0 .43.19.82.5 1.05l.1.06 9.58-9.6v-.12L4 2.34l-.1.06Zm12.9 6.4L5.2 2.05l9.15 9.15 2.45-2.4Zm3.1 1.75-2.42-1.4-2.6 2.6 2.6 2.6 2.46-1.4c.74-.42.74-1.98-.04-2.4ZM5.2 21.95l11.6-6.75-2.45-2.45-9.15 9.2Z';

function StoreLink({
  href,
  top,
  bottom,
  path,
  viewBox = '0 0 24 24',
  pending,
}: {
  href: string;
  top: string;
  bottom: string;
  path: string;
  viewBox?: string;
  pending: boolean;
}) {
  return (
    <a
      href={href}
      className={`flex items-center gap-2.5 rounded-2xl px-4 py-2.5 transition-colors ${
        pending
          ? 'border border-hairline-strong text-ink hover:bg-surface-muted'
          : 'bg-accent text-on-accent hover:bg-accent-hover'
      }`}
    >
      <svg viewBox={viewBox} className="h-6 w-6 shrink-0" fill="currentColor" aria-hidden="true">
        <path d={path} />
      </svg>
      <span className="flex flex-col items-start leading-none">
        <span className="text-[9.5px] opacity-70">{top}</span>
        <span className="mt-[3px] text-[14px] font-semibold">{bottom}</span>
      </span>
    </a>
  );
}

/**
 * Real store links once the listings exist. Until then each badge keeps its
 * shape but says "coming" and opens an email — the honest version of a button
 * that cannot yet do what it looks like it does.
 */
export function StoreButtons({ dict }: { dict: Dictionary }) {
  const iosPending = !site.appStoreUrl;
  const androidPending = !site.playStoreUrl;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <StoreLink
        href={site.appStoreUrl ?? mailto}
        path={APPLE_PATH}
        pending={iosPending}
        top={iosPending ? dict.store.soonIos.top : dict.store.ios.top}
        bottom={iosPending ? dict.store.soonIos.bottom : dict.store.ios.bottom}
      />
      <StoreLink
        href={site.playStoreUrl ?? mailto}
        path={PLAY_PATH}
        pending={androidPending}
        top={androidPending ? dict.store.soonAndroid.top : dict.store.android.top}
        bottom={androidPending ? dict.store.soonAndroid.bottom : dict.store.android.bottom}
      />
    </div>
  );
}
