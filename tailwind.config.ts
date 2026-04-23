import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        ink: "#0f0e17",
        paper: "#fffffe",
        accent: "#ff8906",
        accent2: "#f25f4c",
        cool: "#3da9fc",
        pop: "#e53170",
      },
    },
  },
  plugins: [],
};
export default config;
