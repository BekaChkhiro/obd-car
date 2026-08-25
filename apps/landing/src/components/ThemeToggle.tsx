'use client';

import { useEffect, useState } from 'react';
import type { Dictionary } from '@/i18n';

type Theme = 'light' | 'dark';

/**
 * The stylesheet already handles the un-stamped "system" case, so this only
 * writes an explicit override. It shows the icon for the theme you would switch
 * *to*, which is what makes a single unlabelled button readable without a
 * tooltip.
 */
export function ThemeToggle({ dict }: { dict: Dictionary }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  // Resolved after mount: before hydration the active theme may be the OS
  // preference, which the server cannot know.
  useEffect(() => {
    const stamped = document.documentElement.getAttribute('data-theme');
    if (stamped === 'dark' || stamped === 'light') {
      setTheme(stamped);
      return;
    }
    setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      // Private-mode storage denial is not worth surfacing — the theme still
      // applies for this page view.
    }
  }

  const goingDark = theme !== 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`${dict.theme.toggle} — ${goingDark ? dict.theme.dark : dict.theme.light}`}
      className="grid h-9 w-9 place-items-center rounded-full border border-hairline text-ink-2 transition-colors hover:border-hairline-strong hover:text-ink"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-[17px] w-[17px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      >
        {goingDark ? (
          <path d="M20 13.4A8.2 8.2 0 1 1 10.6 4a6.6 6.6 0 0 0 9.4 9.4Z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
          </>
        )}
      </svg>
    </button>
  );
}
