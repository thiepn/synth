import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const buildId = "build-" + Date.now().toString(36);

export default defineConfig({
  base: "./",
  plugins: [react()],
  define: {
    __SYNTH_BUILD_ID__: JSON.stringify(buildId),
  },
  build: {
    target: "es2022",
  },
});
