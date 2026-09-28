import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) =>
  readFileSync(resolve(root, path), "utf8");

const failures = [];
const playground = read(
  "src/ui/playground/PlaygroundSurface.tsx",
);
const css = read("src/playground.css");
const performance = read(
  "src/performance/PerformanceStore.ts",
);
const performancePlayback = read(
  "src/performance/performancePlayback.ts",
);
const drum = read("src/audio/DrumEngine.ts");
const melodic = read("src/audio/MelodicEngine.ts");
const e2e = read("e2e/playground.spec.ts");

const required = [
  [playground, 'aria-label="Toggle live jam controls"', "P11 Jam toggle is missing."],
  [playground, 'aria-label="Live jam controls"', "P11 Jam surface is missing."],
  [playground, 'aria-label="Live energy"', "P11 Energy macro is missing."],
  [playground, 'aria-label="Live filter"', "P11 Filter macro is missing."],
  [playground, 'aria-label="Live space"', "P11 Space macro is missing."],
  [playground, 'aria-label="Queue live fill"', "P11 Fill action is missing."],
  [playground, 'action="drop"', "P11 Drop gesture is missing."],
  [playground, 'action="build"', "P11 Build gesture is missing."],
  [playground, 'action="stutter"', "P11 Stutter gesture is missing."],
  [playground, "performanceStore.setActive(jamOpen)", "P11 Jam must activate the canonical PerformanceStore."],
  [playground, "performanceStore.setActive(false);", "P11 Jam must explicitly deactivate on exit."],
  [playground, '"Jam closed while recording"', "P11 Jam must close when pattern recording starts."],
  [playground, "if (!finishOpen && jamOpen)", "P11 Jam must close before Finish/export."],
  [performance, 'nextBoundaryTick("beat")', "P11 momentary gestures must remain beat-quantized."],
  [performance, "triggerFill(): void", "P11 Fill must use the canonical performance fill scheduler."],
  [performance, 'registerProjectTransientReset(', "P11 state must remain project-transient."],
  [performancePlayback, "state.fillActive", "P11 Fill playback transform is missing."],
  [performancePlayback, "state.momentary.stutter", "P11 Stutter playback transform is missing."],
  [performancePlayback, "state.momentary.build", "P11 Build playback transform is missing."],
  [performancePlayback, "state.momentary.drop", "P11 Drop playback transform is missing."],
  [drum, "performanceStore.resolveAtTick(", "Realtime engine is not consuming P11 performance state."],
  [drum, "live?.filter", "Realtime P11 Filter macro is not connected."],
  [drum, "live?.space", "Realtime P11 Space macro is not connected."],
  [melodic, "drumEngine.connectExternalAudio(", "Melodic tracks must remain routed through the shared master performance path."],
  [css, ".playground-jam-strip", "P11 Jam responsive styling is missing."],
  [e2e, "Playground P11 Jam performs live macros fill and hold effects safely", "P11 browser certification is missing."],
];

for (const [source, token, message] of required) {
  if (!source.includes(token)) {
    failures.push(message);
  }
}

const jamStart = playground.indexOf(
  "function PlaygroundJamStrip(",
);
const jamEnd = playground.indexOf(
  "\n\ntype PlaygroundFeelId",
  jamStart,
);
const jam =
  jamStart >= 0 && jamEnd > jamStart
    ? playground.slice(jamStart, jamEnd)
    : "";

for (const forbidden of [
  'setMacro("density"',
  'setMacro("drive"',
  'setMacro("morph"',
  "chaosStore",
  "startRecording()",
  "recordSceneLaunch(",
  'action="break"',
  'action="repeat"',
]) {
  if (jam.includes(forbidden)) {
    failures.push(
      "P11 Playground Jam must stay simple; Studio-only performance control leaked in: " +
        forbidden,
    );
  }
}

if (
  !jam.includes('min="0"') ||
  !jam.includes('max="100"') ||
  !jam.includes('step="1"')
) {
  failures.push(
    "P11 Jam macros must remain simple bounded 0–100 controls.",
  );
}

if (
  !playground.includes(
    "return () => {\n      performanceStore.setActive(false);",
  ) ||
  !playground.includes(
    "performanceStore.setActive(false);\n    setJamOpen(false);",
  )
) {
  failures.push(
    "P11 transient performance state must not leak across Playground lifecycle boundaries.",
  );
}

if (failures.length > 0) {
  throw new Error(
    "P11 Jam contract failed:\n- " +
      failures.join("\n- "),
  );
}

console.log(
  "P11 Jam contracts verified: simple Energy/Filter/Space, beat-quantized Fill/Drop/Build/Stutter, transient lifecycle safety, mobile UI, shared master routing, and no Studio performance-console leakage.",
);
