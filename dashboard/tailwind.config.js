/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        werkwise: {
          50: '#eef2ff', 100: '#e0e7ff', 400: '#818cf8',
          500: '#6366f1', 600: '#4f46e5', 900: '#312e81', 950: '#1e1b4b',
        },
      },
    },
  },
  plugins: [],
};
