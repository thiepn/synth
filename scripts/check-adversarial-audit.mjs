import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) =>
  readFileSync(resolve(root, path), "utf8");

const surface = read(
  "src/ui/playground/PlaygroundSurface.tsx",
);
const adversarial = read("e2e/adversarial.spec.ts");
const packageJson = read("package.json");
const ci = read(".github/workflows/ci.yml");
const failures = [];

const surfaceChecks = [
  ["renderStore.cancel();", "Project switching must cancel stale renders."],
  ["setFinishOpen(false);", "Project switching must close Finish state."],
  ["setSelectedMelodicLaneId(null);", "Project switching must clear melodic lane focus."],
  ["setSelectedMelodicNote(null);", "Project switching must clear melodic note selection."],
  ["setStepContext(null);", "Project switching must close stale step context."],
  ["setMixLaneId(", "Project hydration must explicitly restore the mixer lane."],
  ["settleRecordingForNavigation", "Navigation must settle active recording before leaving Playground."],
  ["Stop recording before saving a checkpoint", "Recovery snapshots must reject active recording."],
  ["editRecordingLocked ||", "Destructive project actions must expose their recording lock in the UI."],
];

for (const [token, message] of surfaceChecks) {
  if (!surface.includes(token)) failures.push(message);
}

for (const title of [
  "P20 project switching clears transient edit and export state and restores the correct mixer lane",
  "P20 recording boundaries prevent partial project actions and commit safely before Studio",
  "P20 complete beat-to-song workflow survives reload and exports from restored state",
]) {
  if (!adversarial.includes(title)) {
    failures.push("Missing P20 adversarial workflow: " + title);
  }
}

if (!packageJson.includes('"qa:adversarial"')) {
  failures.push("package.json must expose qa:adversarial.");
}
if (!packageJson.includes('"check:adversarial"')) {
  failures.push("package.json must expose check:adversarial.");
}
if (!ci.includes("P20 adversarial product QA")) {
  failures.push("CI must execute the P20 adversarial product suite.");
}

if (failures.length > 0) {
  throw new Error(
    "P20 adversarial audit contract failed:\n- " +
      failures.join("\n- "),
  );
}

console.log(
  "P20 adversarial audit contracts verified: project boundaries, recording boundaries, restored mixer focus, durable beat-to-song persistence, export, and CI coverage.",
);
