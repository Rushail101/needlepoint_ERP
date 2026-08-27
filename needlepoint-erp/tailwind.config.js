/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Ink: near-black workshop palette with a warm plum undertone
        ink: {
          950: '#15121A',
          900: '#1F1A24',
          800: '#2A2330',
          700: '#3D3542',
          600: '#544A5C',
        },
        // Paper: unbleached cotton text tones
        paper: {
          100: '#F3EDE7',
          300: '#CFC5CE',
          400: '#A79CAE',
        },
        // Thread: the spool-orange accent, carried over from the original brand mark
        thread: {
          100: '#4A2E1D',
          400: '#F0803C',
          500: '#F0803C',
          600: '#D66A2B',
          700: '#B4551F',
        },
        // Legacy alias so any missed class still resolves sensibly
        brand: {
          50: '#4A2E1D',
          100: '#4A2E1D',
          500: '#F0803C',
          600: '#F0803C',
          700: '#D66A2B',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
