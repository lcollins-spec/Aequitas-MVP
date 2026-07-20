/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand green — primary action color (buttons, links, active nav).
        // 500 and 800 are the exact locked brand hexes; the rest of the ramp
        // is interpolated within the same hue for a coherent scale.
        primary: {
          50: '#eafcf1',
          100: '#d1f5e0',
          200: '#a6ecc2',
          300: '#7ce3a5',
          400: '#63e096',
          500: '#4bde80',
          600: '#3aab68',
          700: '#2e8654',
          800: '#2C5E3E',
          900: '#1c3f2a',
          950: '#0f2618',
        },
        // Brand purple — sidebar/nav chrome + heading text color.
        // Deliberately NOT named `purple` so Tailwind's stock purple-* scale
        // (already used elsewhere for unrelated semantics) stays untouched.
        brandPurple: {
          50: '#efe9f3',
          100: '#d9cbe0',
          200: '#b294c4',
          300: '#8a63a2',
          400: '#6b4a82',
          500: '#5a3a6e',
          600: '#4f3164',
          700: '#492B5E',
          800: '#3a2249',
          900: '#2a1836',
        },
      },
      fontFamily: {
        heading: ['"Instrument Serif"', 'Times New Roman', 'serif'],
        body: ['Newsreader', 'Times New Roman', 'serif'],
        sans: ['Newsreader', 'Times New Roman', 'serif'],
      },
    },
  },
  plugins: [],
}
