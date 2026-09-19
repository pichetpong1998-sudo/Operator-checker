/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontSize: {
        "xxl": "1.75rem",
      },
    },
  },
  plugins: [],
};
