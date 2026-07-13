/** @type {import('tailwindcss').Config} */

// Design language: precision instrument, not dashboard.
//
// A radiology workstation has one job — make the pixel data the only thing that
// competes for attention. So the chrome is near-black with hairline borders, nothing is
// rounded beyond 2px, there are no shadows or gradients anywhere near a viewport, and
// every number (HU, mm, slice index) is set in tabular monospace so it does not reflow
// as it counts. The single accent is a cold phosphor cyan, used only to mark what is
// active or selected.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Chrome, darkest to lightest.
        void: '#000000', // viewport background — must be true black
        base: '#0b0c0e', // app background
        panel: '#131518', // panels, toolbar
        raised: '#1b1e23', // buttons, inputs
        hover: '#242830',
        line: '#24282e', // hairline borders
        'line-bright': '#333941',

        ink: '#e6e9ed', // primary text
        'ink-dim': '#8b939e', // labels, secondary
        'ink-faint': '#5c646f', // disabled, hints

        accent: '#22d3ee', // active tool, selection — phosphor cyan
        'accent-dim': '#0e7490',
        warn: '#f59e0b',
        danger: '#f43f5e',
        ok: '#10b981',

        // MPR reference-line colors. These are the radiology convention (and what
        // Weasis and OHIF both use) — do not recolor them to match the theme.
        'mpr-axial': '#ef4444',
        'mpr-sagittal': '#eab308',
        'mpr-coronal': '#22c55e',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Dense UI: the default 16px base is far too large for a workstation.
        '2xs': ['0.6875rem', { lineHeight: '1rem' }], // 11px
        xs: ['0.75rem', { lineHeight: '1.125rem' }], // 12px
        sm: ['0.8125rem', { lineHeight: '1.25rem' }], // 13px
      },
      borderRadius: {
        DEFAULT: '2px',
        sm: '2px',
        md: '3px',
      },
      spacing: {
        rail: '9rem', // series thumbnail rail
        panel: '17rem', // right-hand inspector
      },
    },
  },
  plugins: [],
}
