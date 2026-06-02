/** @type {import('tailwindcss').Config} */
// Semantic color tokens mirror src/theme/colors.ts so className styling and
// imperative (style={}) code share a single source of truth. Keep the two
// files in sync — same keys, same hex values.
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: '#08080a',
        surface: '#111114',
        'surface-elevated': '#16161a',
        border: '#26262c',
        'border-strong': '#3a3a42',
        accent: '#22d3ee',
        'accent-dim': '#0891b2',
        success: '#34d399',
        warning: '#fbbf24',
        danger: '#f87171',
        info: '#818cf8',
      },
      letterSpacing: {
        // Single eyebrow/label tracking value — replaces scattered
        // tracking-[2px] / tracking-[3px] magic values.
        eyebrow: '2px',
      },
    },
  },
  plugins: [],
};
