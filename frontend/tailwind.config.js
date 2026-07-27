/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        gr8: {
          orange: '#FF4500',
          'orange-dark': '#E03D00',
          red: 'rgb(var(--gr8-red) / <alpha-value>)',
          gold: '#F59E0B',
          bg: '#F8F9FA',
          card: '#FFFFFF',
          text: '#1A1A2E',
          muted: '#6B7280',
          border: '#E5E7EB',
        },
      },
    },
  },
  plugins: [],
}
