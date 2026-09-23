import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const runtime = globalThis as typeof globalThis & {
  process?: {
    env?: Record<string, string | undefined>;
  };
};

const buildId =
  runtime.process?.env?.GITHUB_SHA?.slice(0, 12) ??
  ("local-" + Date.now().toString(36));

function synthAssetManifest(): Plugin {
  return {
    name: "synth-asset-manifest",
    apply: "build",
    generateBundle(_options, bundle) {
      const assets = Object.values(bundle)
        .map((entry) => entry.fileName)
        .filter(
          (fileName) =>
            fileName.endsWith(".js") ||
            fileName.endsWith(".css"),
        )
        .sort();

      this.emitFile({
        type: "asset",
        fileName: "asset-manifest.json",
        source: JSON.stringify(
          {
            buildId,
            assets,
          },
          null,
          2,
        ),
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), synthAssetManifest()],
  define: {
    __SYNTH_BUILD_ID__: JSON.stringify(buildId),
  },
  build: {
    target: "es2022",
  },
});
