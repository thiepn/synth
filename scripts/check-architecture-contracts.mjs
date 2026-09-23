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

if (failures.length > 0) {
  throw new Error(
    "Architecture consolidation contract failed:\n- " +
      failures.join("\n- "),
  );
}

console.log(
  "Architecture consolidation contracts verified.",
);
