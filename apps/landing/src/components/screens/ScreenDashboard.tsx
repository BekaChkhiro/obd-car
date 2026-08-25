'use client';

import { useEffect, useState } from 'react';
import type { Dictionary } from '@/i18n';
import { StatusBar } from '../PhoneFrame';

/**
 * The app's Live data tab, replayed on a fixed 12-second timeline: the engine
 * idles, coolant climbs past the driver's threshold, and the alert appears.
 * The sequence is the argument the page is making, so it is scripted rather
 * than random — a flicker would just be decoration.
 *
 * The server renders the resolved end state, so the readings and the alert are
 * in the initial HTML and a reduced-motion visitor keeps them.
 */
const CYCLE = 12;
const RPM_MAX = 7000;
const RPM_REDLINE = 6000;
const ARC = Math.PI * 74;
/** Coolant over the last five minutes: flat, then the climb the alert is about. */
const TREND = 'M 0 44 L 20 43 L 40 45 L 60 41 L 80 38 L 100 34 L 120 30 L 140 22 L 165 15 L 200 8';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function useTimeline() {
  const [t, setT] = useState(CYCLE);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    let start: number | undefined;
    let last = 0;

    const step = (now: number) => {
      start ??= now;
      // ~20fps is plenty for an instrument read-out and leaves the main thread
      // free for the rest of the page.
      if (now - last > 50) {
        last = now;
        setT(((now - start) / 1000) % CYCLE);
      }
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, []);

  return t;
}

function Readout({
  label,
  value,
  unit,
  fault = false,
}: {
  label: string;
  value: string;
  unit: string;
  fault?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface px-3 py-2.5">
      <p className="eyebrow text-[8px] leading-none">{label}</p>
      <p
        className={`num mt-1.5 text-[15px] font-semibold leading-none ${
          fault ? 'text-fault' : 'text-ink'
        }`}
      >
        {value}
        <span className="ml-0.5 text-[9px] font-normal text-ink-3">{unit}</span>
      </p>
    </div>
  );
}

export function ScreenDashboard({ dict }: { dict: Dictionary }) {
  const t = useTimeline();

  const climb = 1 - Math.pow(1 - clamp((t - 0.5) / 6, 0, 1), 3);
  const coolant = 88 + 17 * climb;
  const rpm = 1680 + 150 * Math.sin(t * 1.55) + 55 * Math.sin(t * 4.3);
  const alerting = coolant > 100;

  const s = dict.screens;

  return (
    <div className="flex h-full flex-col">
      <StatusBar />

      <div className="flex items-center justify-between px-5 pb-3 pt-2">
        <div>
          <p className="eyebrow text-[8px]">{s.telemetry}</p>
          <p className="mt-0.5 text-[17px] font-bold leading-tight text-ink">
            {s.liveData}
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-live-soft px-2 py-1">
          <span className="relative grid h-1.5 w-1.5 place-items-center">
            <span
              className="absolute h-1.5 w-1.5 rounded-full bg-live"
              style={{ animation: 'pulse-ring 2.4s ease-out infinite' }}
            />
            <span className="h-1.5 w-1.5 rounded-full bg-live" />
          </span>
          <span className="eyebrow text-[8px] text-live">{s.live}</span>
        </span>
      </div>

      <div className="mx-4 rounded-3xl border border-hairline bg-surface px-4 pb-3 pt-4">
        <div className="relative mx-auto w-full max-w-[10rem]">
          <svg viewBox="0 0 180 100" className="w-full" aria-hidden="true">
            <path
              d="M 16 90 A 74 74 0 0 1 164 90"
              fill="none"
              stroke="var(--surface-sunken)"
              strokeWidth="9"
              strokeLinecap="round"
            />
            {/* Redline band. A full-length dash offset from the start paints the
                wrong end of the arc, so the dash is sized to the band and pushed
                forward with a negative offset. */}
            <path
              d="M 16 90 A 74 74 0 0 1 164 90"
              fill="none"
              stroke="var(--fault)"
              strokeWidth="9"
              strokeDasharray={`${ARC * (1 - RPM_REDLINE / RPM_MAX)} ${ARC}`}
              strokeDashoffset={-ARC * (RPM_REDLINE / RPM_MAX)}
              opacity="0.35"
            />
            <path
              d="M 16 90 A 74 74 0 0 1 164 90"
              fill="none"
              stroke="var(--ink)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={ARC}
              strokeDashoffset={ARC * (1 - clamp(rpm / RPM_MAX, 0, 1))}
            />
          </svg>
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
            <span className="num text-[26px] font-bold leading-none text-ink">
              {Math.round(rpm).toLocaleString('en-US')}
            </span>
            <span className="eyebrow mt-1 text-[8px]">{s.engine} · RPM</span>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 px-4">
        <Readout label={s.speed} value="45" unit="km/h" />
        <Readout
          label={s.coolant}
          value={Math.round(coolant).toString()}
          unit="°C"
          fault={alerting}
        />
        <Readout label={s.fuel} value="38" unit="%" />
        <Readout label={s.battery} value="14.2" unit="V" />
      </div>

      {/* Height stays reserved either way, so the screen never resizes mid-loop. */}
      <div
        className="mx-4 mt-3 flex items-center gap-2 rounded-2xl px-3 py-2.5 transition-opacity duration-500"
        style={{ background: 'var(--fault-soft)', opacity: alerting ? 1 : 0 }}
        aria-hidden={!alerting}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 shrink-0 text-fault"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M12 8.5v4.2M12 16.2v.1M10.3 3.9 2.5 17.6A1.9 1.9 0 0 0 4.2 20.5h15.6a1.9 1.9 0 0 0 1.7-2.9L13.7 3.9a1.9 1.9 0 0 0-3.4 0Z" />
        </svg>
        <span className="num text-[9.5px] font-medium leading-tight text-fault">
          {s.alert}
        </span>
      </div>

      {/* The app's rolling five-minute chart. It also fills the space between
          the alert row and the tab bar — without it the tall phone leaves an
          empty band that reads as a screen still loading. */}
      <div className="mx-4 mb-3 mt-3 flex flex-1 flex-col rounded-2xl border border-hairline bg-surface px-3 pb-2 pt-2.5">
        <p className="eyebrow text-[8px] leading-none">{s.history}</p>
        {/* The chart takes whatever height is left, the way it does in the app —
            which also keeps a tall phone from ending in an empty band. */}
        <svg
          viewBox="0 0 200 54"
          preserveAspectRatio="none"
          className="mt-2 w-full flex-1"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="coolant-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--fault)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--fault)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="0" y1="14" x2="200" y2="14" stroke="var(--hairline)" strokeWidth="1" strokeDasharray="3 4" />
          <path d={`${TREND} L 200 54 L 0 54 Z`} fill="url(#coolant-fill)" />
          <path d={TREND} fill="none" stroke="var(--fault)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="200" cy="8" r="3" fill="var(--fault)" />
        </svg>
      </div>

      <TabBar dict={dict} active="data" />
    </div>
  );
}

export function TabBar({
  dict,
  active,
}: {
  dict: Dictionary;
  active: 'garage' | 'data' | 'ai' | 'profile';
}) {
  const items = [
    {
      key: 'garage' as const,
      label: dict.screens.tabs.garage,
      d: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10',
    },
    { key: 'data' as const, label: dict.screens.tabs.data, d: 'M4 19V9M10 19V5M16 19v-6M22 19H2' },
    {
      key: 'ai' as const,
      label: dict.screens.tabs.ai,
      d: 'M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.4 10.1 12.8 4.5 10.9 10.1 9 12 3.5Z',
    },
    {
      key: 'profile' as const,
      label: dict.screens.tabs.profile,
      d: 'M12 12.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0',
    },
  ];

  return (
    <div className="mt-auto flex items-center justify-around border-t border-hairline bg-surface px-2 pb-4 pt-2.5">
      {items.map((item) => (
        <span
          key={item.key}
          className={`flex flex-col items-center gap-1 ${
            item.key === active ? 'text-ink' : 'text-ink-4'
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-[15px] w-[15px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={item.d} />
          </svg>
          <span className="eyebrow text-[7px] leading-none">{item.label}</span>
        </span>
      ))}
    </div>
  );
}
