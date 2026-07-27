/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        sb: {
          orange: '#F45B31',
          'orange-dark': '#D94828',
          'orange-light': '#FFF0EB',
          red: 'rgb(var(--sb-red) / <alpha-value>)',
          gold: '#F59E0B',
          bg: '#F9FAFB',
          card: '#FFFFFF',
          text: '#111827',
          muted: '#6B7280',
          border: '#E5E7EB',
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
