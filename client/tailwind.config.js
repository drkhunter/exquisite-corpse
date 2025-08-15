/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './app/components/**/*.{vue,js,ts}',
    './app/layouts/**/*.{vue,js,ts}',
    './app/pages/**/*.{vue,js,ts}',
    './app/composables/**/*.{js,ts}',
    './app/plugins/**/*.{js,ts}',
    './app.vue',
    './error.vue'
  ],
  theme: {
    extend: {
      borderRadius: { '2xl': '1rem' },
      boxShadow: { card: '0 1px 2px rgba(0,0,0,0.05)' },
    }
  },
  plugins: []
}

