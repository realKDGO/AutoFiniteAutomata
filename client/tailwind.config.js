/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#1683d8', hover: '#096fbf', soft: '#eaf5fd', ring: '#73b8eb' },
        accent: { DEFAULT: '#e6f3fc', strong: '#c6e7fa' },
        canvas: { DEFAULT: '#f7f9fc', dark: '#101721' },
        surface: { DEFAULT: '#ffffff', muted: '#f8fafc', dark: '#17212d', darkMuted: '#1d2937' },
        ink: { DEFAULT: '#17212b', muted: '#607083', soft: '#8391a2', dark: '#e6edf5', darkMuted: '#a9b7c6' },
        line: { DEFAULT: '#e4eaf0', strong: '#d7e0e9', dark: '#2a3949' },
        success: { DEFAULT: '#29865a', soft: '#eaf7f0' }, warning: { DEFAULT: '#b7791f', soft: '#fff7e8' }, danger: { DEFAULT: '#c94c4c', soft: '#fff0f0' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'], display: ['Poppins', 'Inter', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgb(15 23 42 / 0.025), 0 8px 24px rgb(15 23 42 / 0.055)', lift: '0 12px 28px rgb(22 131 216 / 0.12)' },
    },
  },
  plugins: [],
};