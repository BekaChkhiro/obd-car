// Centralised dark-theme tokens used across the app.
// Kept in plain TS (not Tailwind config) so non-NativeWind code (Stack
// headers, React Navigation, status bar, ble-plx-driven dashboards) can
// reference the exact same hex values.

export const colors = {
  bg: '#08080a',
  surface: '#111114',
  surfaceElevated: '#16161a',
  border: '#26262c',
  borderStrong: '#3a3a42',

  textPrimary: '#fafafa',
  textSecondary: '#a1a1aa',
  textMuted: '#71717a',
  textDim: '#52525b',

  accent: '#22d3ee',
  accentDim: '#0891b2',
  success: '#34d399',
  warning: '#fbbf24',
  danger: '#f87171',
  info: '#818cf8',
} as const;

export type ColorToken = keyof typeof colors;
