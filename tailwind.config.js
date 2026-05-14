/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,html}'],
  prefix: 'pe-',
  theme: {
    extend: {
      colors: {
        'pe-bg': '#0f1115',
        'pe-surface': '#1a1d24',
        'pe-border': '#2a2e38',
        'pe-text': '#e6e8ee',
        'pe-muted': '#9aa3b2',
        'pe-accent': '#6366f1',
        'pe-accent-hover': '#7c7fee',
      },
      transitionDuration: {
        DEFAULT: '200ms',
      },
    },
  },
  plugins: [],
};
