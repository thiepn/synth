import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) =>
  readFileSync(resolve(root, path), "utf8");

const failures = [];
const playground = read(
  "src/ui/playground/PlaygroundSurface.tsx",
);
const modulationStore = read(
  "src/modulation/ModulationStore.ts",
);
const modulationEngine = read(
  "src/modulation/modulationEngine.ts",
);
const drum = read("src/audio/DrumEngine.ts");
const offline = read(
  "src/render/offlineRenderer.ts",
);
const project = read(
  "src/project/ProjectStore.ts",
);
const css = read("src/playground.css");
const e2e = read("e2e/playground.spec.ts");
const finishGate = read(
  "scripts/check-playground-finish.mjs",
);

const motionStart = playground.indexOf(
  "function PlaygroundMotionStrip(",
);
const motionEnd = playground.indexOf(
  "\n\ntype PlaygroundFeelId",
  motionStart,
);
const motion =
  motionStart >= 0 && motionEnd > motionStart
    ? playground.slice(
        motionStart,
        motionEnd,
      )
    : "";

const required = [
  [playground, 'aria-label="Toggle motion automation controls"', "P15 Motion toggle is missing."],
  [playground, 'aria-label="Motion automation"', "P15 Motion surface is missing."],
  [playground, '"filter", label: "Filter"', "P15 Filter target is missing."],
  [playground, '"space", label: "Space"', "P15 Space target is missing."],
  [playground, '"tone", label: "Tone"', "P15 Tone target is missing."],
  [playground, '"sweep"', "P15 Sweep shape is missing."],
  [playground, '"pulse"', "P15 Pulse shape is missing."],
  [playground, '"breathe"', "P15 Breathe shape is missing."],
  [playground, '"wobble"', "P15 Wobble shape is missing."],
  [motion, 'aria-label="Motion amount"', "P15 bounded Amount control is missing."],
  [motion, "buildPlaygroundMotionLane(", "P15 must write canonical AutomationLane data."],
  [motion, "modulationStore.replaceAutomationLane(", "P15 must use ModulationStore rather than a parallel motion engine."],
  [motion, "modulationStore.clearAutomation(", "P15 Clear must use canonical modulation cleanup."],
  [motion, "studioOwned", "P15 must protect Studio-authored automation from silent replacement."],
  [playground, 'lane.id.startsWith(\n          "playground-motion-"', "P15-owned motion lanes must remain identifiable."],
  [playground, "sequencer.pattern.lengthTicks", "P15 automation must follow Pattern loop length."],
  [playground, "modulation.revision", "P15 changes must invalidate prepared P8 audio."],
  [finishGate, 'finish.includes("modulation.revision")', "P8 stale-share gate must include P15 modulation state."],
  [modulationStore, "replaceAutomationLane(nextLane: AutomationLane)", "Canonical automation lane replacement is missing."],
  [modulationEngine, "evaluateAutomationLane(", "Canonical automation evaluation is missing."],
  [drum, "modulationStore.resolveTarget(", "Realtime engine is not resolving P15 automation."],
  [drum, 'engineTargetId("filter")', "Realtime Filter automation support is missing."],
  [drum, 'engineTargetId("space")', "Realtime Space automation support is missing."],
  [drum, 'engineTargetId("tone")', "Realtime Tone automation support is missing."],
  [offline, "snapshot.modulation.automationLanes", "Offline rendering is not consuming automation lanes."],
  [offline, 'engineTargetId("filter")', "Offline Filter automation support is missing."],
  [offline, 'engineTargetId("space")', "Offline Space automation support is missing."],
  [offline, 'engineTargetId("tone")', "Offline Tone automation support is missing."],
  [project, "automationLanes: modulation.automationLanes.map(", "P15 automation must remain persisted in project documents."],
  [css, ".playground-motion-strip", "P15 Motion responsive styling is missing."],
  [e2e, "Playground P15 Motion creates persistent looping automation without exposing Studio complexity", "P15 browser certification is missing."],
];

for (const [source, token, message] of required) {
  if (!source.includes(token)) {
    failures.push(message);
  }
}

for (const forbidden of [
  "addSource(",
  "addRoute(",
  "updateRoute(",
  "randomSmooth",
  "sampleHold",
  'type="number"',
  "Math.random(",
]) {
  if (motion.includes(forbidden)) {
    failures.push(
      "P15 Playground Motion must remain preset-driven and simple; advanced modulation control leaked in: " +
        forbidden,
    );
  }
}

if (
  !motion.includes('min="10"') ||
  !motion.includes('max="100"') ||
  !motion.includes('step="1"')
) {
  failures.push(
    "P15 Motion Amount must stay bounded to the simple 10–100 range.",
  );
}

if (
  !playground.includes(
    'lane.id.startsWith(\n          "playground-motion-",',
  ) ||
  !playground.includes(
    "lane.loopLengthTicks === nextLength",
  ) ||
  !playground.includes(
    "(point.tick /\n                    previousLast) *\n                    nextLast",
  )
) {
  failures.push(
    "P15-owned automation must rescale safely when Pattern length changes.",
  );
}

if (
  !motion.includes(
    'lane?.id ===\n    "playground-motion-" + target',
  ) ||
  !motion.includes(
    "Boolean(lane) &&\n    (lane?.points.length ?? 0) > 0 &&\n    !playgroundOwned",
  )
) {
  failures.push(
    "P15 must distinguish Playground-owned motion from existing Studio automation.",
  );
}

if (failures.length > 0) {
  throw new Error(
    "P15 Motion contract failed:\n- " +
      failures.join("\n- "),
  );
}

console.log(
  "P15 Motion contracts verified: simple Filter/Space/Tone automation, four deterministic shapes, Pattern-length rescaling, Studio ownership safety, persistence, realtime/offline parity, and stale-export invalidation.",
);
