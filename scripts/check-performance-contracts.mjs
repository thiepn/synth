import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function requireText(path, text, message) {
  if (!read(path).includes(text)) {
    throw new Error(message + " [" + path + "]");
  }
}

requireText(
  "src/App.tsx",
  "lazy(loadCreateSurface)",
  "Mode workspaces must remain code-split.",
);
requireText(
  "src/audio/AudioTransport.ts",
  "UI_FRAME_INTERVAL_MS = 1000 / 30",
  "Transport UI publication must remain capped at 30 Hz.",
);
requireText(
  "src/audio/AudioTransport.ts",
  "transportScheduler.worker.ts",
  "Transport scheduling must retain the Worker wake-up path.",
);
requireText(
  "src/sample/SampleLabStore.ts",
  "sampleAnalysisWorkerClient.analyze",
  "Long sample analysis must retain Worker offloading.",
);
requireText(
  "src/project/ProjectStore.ts",
  "onlyUnpersisted",
  "Autosave must not rewrite immutable audio assets every time.",
);
requireText(
  "src/project/ProjectStore.ts",
  "requestIdleCallback",
  "Routine autosaves must retain idle-time scheduling.",
);
requireText(
  "src/project/ProjectStore.ts",
  "resetLoadedProjectTransientState",
  "ProjectStore must not statically own transient workspaces.",
);
requireText(
  "src/history/GenerationHistoryStore.ts",
  "HISTORY_NODE_LIMIT = 512",
  "Generation History must retain its long-session bound.",
);
requireText(
  "public/sw.js",
  "ASSET_MANIFEST_URL",
  "Offline shell must retain lazy-chunk precaching.",
);
requireText(
  "vite.config.ts",
  "synth-asset-manifest",
  "Production build must retain the offline chunk manifest.",
);

console.log("Runtime performance contracts verified.");
