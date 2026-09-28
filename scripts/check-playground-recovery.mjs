import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) =>
  readFileSync(resolve(root, path), "utf8");

const failures = [];

const projectStore = read("src/project/ProjectStore.ts");
const playground = read(
  "src/ui/playground/PlaygroundSurface.tsx",
);
const css = read("src/playground.css");
const e2e = read("e2e/playground.spec.ts");

const required = [
  [projectStore, "const AUTOSAVE_DELAY_MS = 750", "P12 autosave cadence changed or is missing."],
  [projectStore, 'document.addEventListener("visibilitychange"', "P12 must save dirty projects when the page becomes hidden."],
  [projectStore, 'globalThis.addEventListener("pagehide"', "P12 must save dirty projects on pagehide."],
  [projectStore, "async createVersion(", "P12 checkpoint creation is missing."],
  [projectStore, "async restoreVersion(", "P12 checkpoint restore is missing."],
  [projectStore, "await this.refreshStorageEstimate();", "P12 checkpoint storage estimates must remain current."],
  [playground, 'aria-label="Create recovery checkpoint"', "P12 recovery checkpoint action is missing."],
  [playground, 'aria-label="Recovery checkpoints"', "P12 checkpoint list is missing."],
  [playground, '"Before restore " +', "P12 safe pre-restore checkpoint is missing."],
  [playground, "await projectStore.createVersion(", "P12 restore must protect the current state before restoring."],
  [playground, "await projectStore.restoreVersion(", "P12 Playground restore path is missing."],
  [playground, 'aria-label="Protect local project storage"', "P12 persistent-storage action is missing."],
  [playground, "projectStore.requestPersistentStorage()", "P12 storage protection must use canonical project storage."],
  [playground, "project.versions.slice(0, 4)", "P12 Playground recovery must stay limited to four recent checkpoints."],
  [playground, "performanceStore.setActive(false);\n      setJamOpen(false);", "P12 recovery must close transient Jam state before restoring."],
  [css, ".playground-project-recovery", "P12 recovery UI styling is missing."],
  [css, ".playground-project-checkpoint>button{min-height:44px}", "P12 mobile restore controls must remain touch-safe."],
  [e2e, "Playground P12 recovery checkpoints restore safely without losing the current state", "P12 browser recovery certification is missing."],
  [e2e, "Before restore", "P12 browser certification must verify the automatic safety checkpoint."],
];

for (const [source, token, message] of required) {
  if (!source.includes(token)) {
    failures.push(message);
  }
}

const restoreStart = playground.indexOf(
  "const restoreRecoveryCheckpoint = async (",
);
const restoreEnd = playground.indexOf(
  "\n\n  const protectProjectStorage",
  restoreStart,
);
const restoreFlow =
  restoreStart >= 0 && restoreEnd > restoreStart
    ? playground.slice(restoreStart, restoreEnd)
    : "";

const protectIndex = restoreFlow.indexOf(
  "await projectStore.createVersion(",
);
const restoreIndex = restoreFlow.indexOf(
  "await projectStore.restoreVersion(",
);

if (
  protectIndex < 0 ||
  restoreIndex < 0 ||
  protectIndex >= restoreIndex
) {
  failures.push(
    "P12 restore must create the safety checkpoint before loading the selected checkpoint.",
  );
}

for (const forbidden of [
  "deleteVersion(",
  "importBackup(",
  "deleteProject(",
]) {
  if (restoreFlow.includes(forbidden)) {
    failures.push(
      "P12 Playground restore flow leaked destructive project-manager control: " +
        forbidden,
    );
  }
}

const recoveryStart = playground.indexOf(
  'className="playground-project-recovery"',
);
const recoveryEnd = playground.indexOf(
  "\n            <footer>",
  recoveryStart,
);
const recoveryUi =
  recoveryStart >= 0 && recoveryEnd > recoveryStart
    ? playground.slice(recoveryStart, recoveryEnd)
    : "";

for (const forbidden of [
  "deleteVersion(",
  "importBackup(",
  "deleteProject(",
]) {
  if (recoveryUi.includes(forbidden)) {
    failures.push(
      "P12 recovery UI must stay lightweight; Studio-only project control leaked in: " +
        forbidden,
    );
  }
}

if (failures.length > 0) {
  throw new Error(
    "P12 recovery contract failed:\n- " +
      failures.join("\n- "),
  );
}

console.log(
  "P12 recovery contracts verified: autosave lifecycle, visible recent checkpoints, safe pre-restore protection, storage persistence status, mobile restore access, and no destructive project-manager leakage.",
);
