/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#FBF6EC',
        sheet: '#FFFDF8',
        ink: '#3A3350',
        soft: '#7D7590',
        line: '#EADFCB',
        tangerine: '#F2803A',
        leaf: '#5DA567',
        sky: '#6DB8E0',
        berry: '#E4574A',
        butter: '#F6CD4C',
      },
      fontFamily: {
        display: ['Jua', 'Gowun Dodum', 'system-ui', 'sans-serif'],
        body: ['"Gowun Dodum"', 'system-ui', '-apple-system', 'sans-serif'],
        hand: ['Gaegu', '"Gowun Dodum"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        paper: '0 2px 0 rgba(90,70,40,0.10), 0 6px 14px -6px rgba(90,70,40,0.25)',
        lift: '0 3px 0 rgba(90,70,40,0.14), 0 10px 20px -8px rgba(90,70,40,0.35)',
      },
    },
  },
  plugins: [],
};
