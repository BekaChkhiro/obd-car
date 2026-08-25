import type { Dictionary } from '@/i18n';

/**
 * The reference layout this page follows floats customer avatars around the
 * phone. Faces would be a promise we cannot keep — there are no users yet — so
 * the same orbit carries live readings instead. It is also the more truthful
 * ornament: what surrounds this product is data, not a crowd.
 *
 * Decorative and duplicated from the phone screen, so it is hidden from
 * assistive technology and from narrow viewports where it would collide.
 */
const positions = [
  'left-[-9.5rem] top-[10%]',
  'right-[-10rem] top-[28%]',
  'left-[-11rem] bottom-[32%]',
  'right-[-9rem] bottom-[14%]',
];

const delays = ['0s', '1.1s', '0.55s', '1.7s'];

export function HeroChips({ dict }: { dict: Dictionary }) {
  const chips = [
    { value: '1 680', unit: 'RPM', label: dict.hero.chips.rpm, tone: 'var(--ink)' },
    { value: '104', unit: '°C', label: dict.hero.chips.coolant, tone: 'var(--fault)' },
    { value: 'P0301', unit: '', label: dict.hero.chips.code, tone: 'var(--fault)' },
    { value: '14.2', unit: 'V', label: dict.hero.chips.battery, tone: 'var(--live)' },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden="true">
      {chips.map((chip, index) => (
        <div
          key={chip.label}
          className={`absolute ${positions[index]} rounded-2xl border border-hairline bg-surface px-3.5 py-2.5 shadow-[var(--shadow-card)]`}
          style={{
            animation: 'float-chip 5.5s ease-in-out infinite',
            animationDelay: delays[index],
          }}
        >
          <p className="eyebrow text-[8px] leading-none">{chip.label}</p>
          <p className="num mt-1.5 text-[15px] font-bold leading-none" style={{ color: chip.tone }}>
            {chip.value}
            {chip.unit ? (
              <span className="ml-0.5 text-[9px] font-normal text-ink-3">{chip.unit}</span>
            ) : null}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Thin corner marks that frame the hero, the way a gauge face is framed. */
export function CornerMarks() {
  const corners = [
    'left-0 top-0 border-l border-t rounded-tl-lg',
    'right-0 top-0 border-r border-t rounded-tr-lg',
    'left-0 bottom-0 border-b border-l rounded-bl-lg',
    'right-0 bottom-0 border-b border-r rounded-br-lg',
  ];

  return (
    <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden="true">
      {corners.map((corner) => (
        <span
          key={corner}
          className={`absolute h-8 w-8 border-hairline-strong ${corner}`}
        />
      ))}
    </div>
  );
}
