import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ground: "#002A33",
        tile: "#003B46",
        line: "#07575B",
        mist: "#66A5AD",
        ice: "#C4DFE6",
        ink: "#F4F5F7",
      },
      fontFamily: { sans: ["var(--font-montserrat)", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
