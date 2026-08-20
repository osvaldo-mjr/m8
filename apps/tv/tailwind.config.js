/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.ts'],
  theme: {
    extend: {
      colors: {
        felt: {
          900: 'var(--m8-felt-900)',
          700: 'var(--m8-felt-700)',
          500: 'var(--m8-felt-500)',
        },
        chalk: 'var(--m8-chalk)',
        brass: 'var(--m8-brass)',
        clay: 'var(--m8-clay)',
        ash: 'var(--m8-ash)',
      },
    },
  },
  plugins: [],
}
