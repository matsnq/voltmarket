/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7ff',
          100: '#d9ecff',
          500: '#1673e6',
          600: '#0e5cc4',
          700: '#0d4a9c',
          900: '#0f2f5c',
        },
      },
    },
  },
  plugins: [],
};
