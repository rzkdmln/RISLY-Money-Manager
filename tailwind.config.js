/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './js/**/*.js'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },
      },
      spacing: {
        '4.5': '1.125rem',
        '18': '4.5rem',
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15, 23, 42, .04), 0 12px 32px -20px rgba(15, 23, 42, .22)',
        lift: '0 20px 45px -22px rgba(15, 23, 42, .35)',
      },
    },
  },
  plugins: [],
}
