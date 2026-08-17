/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        slate: {
          850: "#172033",
          950: "#0b1020",
        },
        accent: {
          DEFAULT: "#38bdf8",
          muted: "#0ea5e9",
        },
      },
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
        display: ["Outfit", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
