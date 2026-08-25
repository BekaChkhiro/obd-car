/** @type {import('tailwindcss').Config} */
// Semantic color tokens mirror src/theme/colors.ts so className styling and
// imperative (style={}) code share a single source of truth. Keep the two
// files in sync — same keys, same hex values.
//
// Screens should reach for these names and not the raw Tailwind palette:
// `bg-surface` survives a theme change, `bg-zinc-900` does not.
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
        bg: '#eef1f7',
        'bg-warm': '#faf3ea',
        surface: '#ffffff',
        'surface-muted': '#f4f4f5',
        'surface-sunken': '#e8ecf4',

        border: '#e4e9f2',
        'border-strong': '#cbd3e1',

        'text-primary': '#0a0a0f',
        'text-secondary': '#4a5064',
        'text-muted': '#858b9d',
        'text-dim': '#a9aebd',
        'on-accent': '#ffffff',

        accent: '#0a0a0f',
        'accent-strong': '#000000',
        'accent-soft': '#e7e9f2',

        success: '#0f9d63',
        'success-soft': '#e6f6ef',
        warning: '#b7791f',
        'warning-soft': '#fdf3e2',
        danger: '#d92d20',
        'danger-soft': '#fdecea',
        info: '#4f46e5',
        'info-soft': '#ecebfc',
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
