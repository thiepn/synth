import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const runtime = globalThis as typeof globalThis & {
  process?: {
    env?: Record<string, string | undefined>;
  };
};

const buildId =
  runtime.process?.env?.GITHUB_SHA?.slice(0, 12) ??
  ("local-" + Date.now().toString(36));

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
