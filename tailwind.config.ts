import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'baby-powder': '#FFFDFA',
        'jet-black': '#333333',
        'cosmic-latte': '#FEF7E7',
        'azul': '#046BB1',
        'persian-red': '#BE3B3B',
        'jasper': '#BE593B',
        'fulvous': '#E48715',
        'xanthous': '#E7B02F',
        'asparagus': '#62A758',
        'viridian': '#2D8879',
        'verdigris': '#38A7AD',
        'marian-blue': '#3B4C99',
        'rose-pompadour': '#E26F8E',
        'battleship-grey': '#9C9C9C',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
