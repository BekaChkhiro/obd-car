// Centralised light-theme tokens used across the app.
// Kept in plain TS (not Tailwind config) so non-NativeWind code (Stack
// headers, React Navigation, status bar, ble-plx-driven dashboards) can
// reference the exact same hex values.
//
// The palette is deliberately narrow: a near-white ground, white cards, and a
// single deep navy that carries every emphasis — buttons, avatars, active
// states. Colour is reserved for meaning. On a diagnostic screen the only
// things that should shout are a fault and a live reading, so everything else
// stays neutral and lets those read at a glance.

export const colors = {
  /** Page ground — cool near-white, a shade off pure so white cards lift off it. */
  bg: '#eef1f7',
  /** Warm tint for the top of the app gradient. */
  bgWarm: '#faf3ea',
  /** Cards, bubbles, the composer. */
  surface: '#ffffff',
  /** Inset rows and secondary fills. */
  surfaceMuted: '#f4f4f5',
  /** Wells: progress tracks, disabled fills. */
  surfaceSunken: '#e8ecf4',

  border: '#e4e9f2',
  borderStrong: '#cbd3e1',

  textPrimary: '#0a0a0f',
  textSecondary: '#4a5064',
  textMuted: '#858b9d',
  textDim: '#a9aebd',
  /** Text and icons sitting on `accent`. */
  onAccent: '#ffffff',

  /** The one strong colour: near-black, carrying every emphasis in the app. */
  accent: '#0a0a0f',
  accentStrong: '#000000',
  /** Tinted fill for selected rows and badges. */
  accentSoft: '#e7e9f2',

  // Status colours are darkened from their dark-theme counterparts: a hue that
  // reads well on near-black is usually too light to meet contrast on white.
  success: '#0f9d63',
  successSoft: '#e6f6ef',
  warning: '#b7791f',
  warningSoft: '#fdf3e2',
  danger: '#d92d20',
  dangerSoft: '#fdecea',
  info: '#4f46e5',
  infoSoft: '#ecebfc',
} as const;

export type ColorToken = keyof typeof colors;
