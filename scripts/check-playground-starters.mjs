import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) =>
  readFileSync(resolve(root, path), "utf8");

const failures = [];
const playground = read(
  "src/ui/playground/PlaygroundSurface.tsx",
);
const e2e = read("e2e/playground.spec.ts");
const css = read("src/playground.css");

const startersStart = playground.indexOf(
  "type PlaygroundStarterId",
);
const startersEnd = playground.indexOf(
  "\n\nconst LANE_COLORS",
  startersStart,
);
const starterDefinitions =
  startersStart >= 0 &&
  startersEnd > startersStart
    ? playground.slice(
        startersStart,
        startersEnd,
      )
    : "";

const applyStart = playground.indexOf(
  "const applyStarterSound = async",
);
const applyEnd = playground.indexOf(
  "\n\n  const remix =",
  applyStart,
);
const starterOrchestration =
  applyStart >= 0 && applyEnd > applyStart
    ? playground.slice(
        applyStart,
        applyEnd,
      )
    : "";

const required = [
  [playground, 'aria-label="Toggle musical starter kits"', "P13 Starter toggle is missing."],
  [playground, 'aria-label="Musical starter kits"', "P13 Starter chooser is missing."],
  [playground, '"Dusty Pocket"', "P13 Dusty Pocket starter is missing."],
  [playground, '"Neon House"', "P13 Neon House starter is missing."],
  [playground, '"808 Night"', "P13 808 Night starter is missing."],
  [playground, '"Warm Lo-Fi"', "P13 Warm Lo-Fi starter is missing."],
  [playground, '"Gospel Pocket"', "P13 Gospel Pocket starter is missing."],
  [playground, '"Live Rock"', "P13 Live Rock starter is missing."],
  [starterDefinitions, '"playground-starter:"', "P13 starter Pattern generation must use a stable deterministic seed."],
  [starterDefinitions, '"playground-starter-groove:"', "P13 starter Groove must use a stable deterministic seed."],
  [starterDefinitions, "preserveStarterLocks(", "P13 starter Pattern lock preservation is missing."],
  [starterDefinitions, "applyGroove({", "P13 starters must reuse the canonical Groove Engine."],
  [starterOrchestration, '"Before starter · "', "P13 must checkpoint the project before applying a starter."],
  [starterOrchestration, 'duplicateActivePatternBank(', "P13 must initialize Pattern B."],
  [starterOrchestration, 'switchPatternBank(\n          "A"', "P13 must return the user to Pattern A."],
  [starterOrchestration, "lane.lock.sound", "P13 must inspect sound locks across Pattern banks."],
  [starterOrchestration, "locks.channels[voice]", "P13 must respect channel mix locks."],
  [starterOrchestration, "!locks.master", "P13 must respect the master mix lock."],
  [starterOrchestration, "applyStarterSound(", "P13 starter sound orchestration is missing."],
  [starterOrchestration, "applyStarterMix(starter)", "P13 starter mix orchestration is missing."],
  [css, ".playground-starter-panel", "P13 Starter responsive styling is missing."],
  [e2e, "Playground P13 starter kits create an editable polished A B baseline", "P13 browser certification is missing."],
  [e2e, "mobileStarterBox!.height", "P13 mobile starter reachability is not browser-certified."],
];

for (const [source, token, message] of required) {
  if (!source.includes(token)) {
    failures.push(message);
  }
}

const ids = [
  ...starterDefinitions.matchAll(
    /id: "(dusty-pocket|neon-house|808-night|warm-lofi|gospel-pocket|live-rock)",/g,
  ),
].map((match) => match[1]);

if (new Set(ids).size !== 6) {
  failures.push(
    "P13 must retain exactly six curated starter IDs.",
  );
}

if (
  starterDefinitions.includes("Math.random(") ||
  starterOrchestration.includes("Math.random(")
) {
  failures.push(
    "P13 starters must remain deterministic.",
  );
}

const checkpointIndex =
  starterOrchestration.indexOf(
    "projectStore.createVersion",
  );
const tempoIndex =
  starterOrchestration.indexOf(
    "audioTransport.setBpm",
  );
if (
  checkpointIndex < 0 ||
  tempoIndex < 0 ||
  checkpointIndex > tempoIndex
) {
  failures.push(
    "P13 recovery checkpoint must be created before musical state changes.",
  );
}

for (const forbidden of [
  "playground-starter-advanced",
  'type="number"',
  "masteringStore.",
  "modulationStore.",
]) {
  if (
    starterDefinitions.includes(forbidden) ||
    starterOrchestration.includes(forbidden)
  ) {
    failures.push(
      "P13 Starter must remain simple; advanced control leaked in: " +
        forbidden,
    );
  }
}

if (failures.length > 0) {
  throw new Error(
    "P13 starter contract failed:\n- " +
      failures.join("\n- "),
  );
}

console.log(
  "P13 Starter contracts verified: six deterministic one-tap musical baselines, recovery-before-change, editable A/B generation, canonical sounds/Groove/mix, lock preservation, and mobile-safe UI.",
);
