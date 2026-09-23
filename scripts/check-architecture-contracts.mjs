import {
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import {
  relative,
  resolve,
} from "node:path";

const root = resolve(import.meta.dirname, "..");
const srcRoot = resolve(root, "src");

function filesUnder(directory) {
  const output = [];
  for (const name of readdirSync(directory)) {
    const path = resolve(directory, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      output.push(...filesUnder(path));
    } else if (/\.(ts|tsx)$/.test(name)) {
      output.push(path);
    }
  }
  return output;
}

function projectPath(path) {
  return relative(root, path).replaceAll("\\", "/");
}

function content(path) {
  return readFileSync(path, "utf8");
}

const sources = filesUnder(srcRoot);
const failures = [];

const localPatternClones = sources
  .filter((path) => projectPath(path) !== "src/domain/patternClone.ts")
  .filter((path) => /function\s+clonePattern\s*\(/.test(content(path)))
  .map(projectPath);

if (localPatternClones.length > 0) {
  failures.push(
    "Local clonePattern implementations remain: " +
      localPatternClones.join(", "),
  );
}

const localArrangementClones = sources
  .filter(
    (path) =>
      projectPath(path) !==
      "src/domain/arrangementClone.ts",
  )
  .filter((path) =>
    /function\s+clone(?:Arrangement)?Blueprint\s*\(/.test(
      content(path),
    ),
  )
  .map(projectPath);

if (localArrangementClones.length > 0) {
  failures.push(
    "Local ARRANGE blueprint clone implementations remain: " +
      localArrangementClones.join(", "),
  );
}

const localFamilyClones = sources
  .filter(
    (path) =>
      projectPath(path) !== "src/domain/familyClone.ts",
  )
  .filter((path) =>
    /function\s+cloneBeatFamily\s*\(/.test(content(path)),
  )
  .map(projectPath);

if (localFamilyClones.length > 0) {
  failures.push(
    "Local BeatFamily clone implementations remain: " +
      localFamilyClones.join(", "),
  );
}

const legacyModeImports = sources
  .filter((path) => {
    const source = content(path);
    const imports =
      source.match(
        /import\s+(?:type\s+)?\{[^}]*\}\s+from\s+["'][^"']+["'];?/g,
      ) ?? [];

    return imports.some(
      (statement) =>
        statement.includes("pulse/Primitives") &&
        /\b(?:MODES|ModeId|ModeDefinition)\b/.test(
          statement,
        ),
    );
  })
  .map(projectPath);

if (legacyModeImports.length > 0) {
  failures.push(
    "Mode identity is still imported from UI primitives: " +
      legacyModeImports.join(", "),
  );
}

const directSyncStoreHooks = sources
  .filter(
    (path) =>
      projectPath(path) !==
      "src/ui/store/useStoreSnapshot.ts",
  )
  .filter((path) =>
    /useSyncExternalStore\s*\(/.test(content(path)),
  )
  .map(projectPath);

if (directSyncStoreHooks.length > 0) {
  failures.push(
    "Direct useSyncExternalStore wrappers remain: " +
      directSyncStoreHooks.join(", "),
  );
}

const modeModel = readFileSync(
  resolve(srcRoot, "app/modeModel.ts"),
  "utf8",
);
if (!modeModel.includes("export type ModeId")) {
  failures.push("ModeId is not owned by src/app/modeModel.ts.");
}

const app = readFileSync(
  resolve(srcRoot, "App.tsx"),
  "utf8",
);
if (
  app.includes("./ui/surfaces/ModePlaceholder") ||
  app.includes("<ModePlaceholder")
) {
  failures.push("Obsolete ModePlaceholder path is still referenced.");
}
if (
  app.includes("./audio/AudioTransport") ||
  app.includes("./arrange/ArrangementPlaybackStore")
) {
  failures.push(
    "App shell bypasses PlaybackCoordinator for mode-change transport cleanup.",
  );
}

const transportUi = readFileSync(
  resolve(srcRoot, "ui/transport/TransportUI.tsx"),
  "utf8",
);
if (!transportUi.includes("playbackCoordinator")) {
  failures.push(
    "Transport UI is not routed through PlaybackCoordinator.",
  );
}

const inputRouter = readFileSync(
  resolve(srcRoot, "input/InputActionRouter.ts"),
  "utf8",
);
if (!inputRouter.includes("playbackCoordinator")) {
  failures.push(
    "External transport actions bypass PlaybackCoordinator.",
  );
}

const projectTypes = readFileSync(
  resolve(srcRoot, "project/projectTypes.ts"),
  "utf8",
);
if (
  !projectTypes.includes(
    "PROJECT_SCHEMA_VERSION",
  )
) {
  failures.push(
    "ProjectDocument version is not sourced from the canonical schema constant.",
  );
}

if (
  sources.some(
    (path) =>
      projectPath(path).endsWith(
        "ui/surfaces/ModePlaceholder.tsx",
      ),
  )
) {
  failures.push("Obsolete ModePlaceholder file still exists.");
}

const sequencerStoreSource = readFileSync(
  resolve(srcRoot, "sequencer/SequencerStore.ts"),
  "utf8",
);
if (
  sequencerStoreSource.includes("runtimePreview") ||
  sequencerStoreSource.includes("setRuntimePreview")
) {
  failures.push(
    "SequencerStore still owns playback-only runtime preview state.",
  );
}

const runtimePreviewCallers = sources
  .filter((path) =>
    /setRuntimePreview\s*\(/.test(content(path)),
  )
  .map(projectPath);

if (runtimePreviewCallers.length > 0) {
  failures.push(
    "Obsolete runtime-preview callers remain: " +
      runtimePreviewCallers.join(", "),
  );
}

const chaosBaseOwners = sources
  .filter((path) => {
    const project = projectPath(path);
    return (
      project !== "src/chaos/ChaosStore.ts" &&
      project !== "src/playback/CreativePatternResolver.ts"
    );
  })
  .filter((path) =>
    /chaosStore\.setBasePattern\s*\(/.test(content(path)),
  )
  .map(projectPath);

if (chaosBaseOwners.length > 0) {
  failures.push(
    "CHAOS base Pattern synchronization has multiple owners: " +
      chaosBaseOwners.join(", "),
  );
}

if (
  sources.some(
    (path) =>
      projectPath(path).endsWith(
        "performance/CreativePlaybackBridge.tsx",
      ),
  )
) {
  failures.push(
    "Obsolete React CreativePlaybackBridge still exists.",
  );
}

const drumEngineSource = readFileSync(
  resolve(srcRoot, "audio/DrumEngine.ts"),
  "utf8",
);
if (
  !drumEngineSource.includes("creativePatternResolver") ||
  drumEngineSource.includes("resolvePerformancePattern")
) {
  failures.push(
    "DrumEngine is not using the canonical creative-pattern resolver.",
  );
}

if (failures.length > 0) {
  throw new Error(
    "Architecture consolidation contract failed:\n- " +
      failures.join("\n- "),
  );
}

console.log(
  "Architecture consolidation contracts verified.",
);
