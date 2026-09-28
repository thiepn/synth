import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) =>
  readFileSync(resolve(root, path), "utf8");

const failures = [];
const playground = read(
  "src/ui/playground/PlaygroundSurface.tsx",
);
const groove = read("src/groove/grooveEngine.ts");
const drum = read("src/audio/DrumEngine.ts");
const melodic = read("src/audio/MelodicEngine.ts");
const offline = read("src/render/offlineRenderer.ts");
const css = read("src/playground.css");
const e2e = read("e2e/playground.spec.ts");

const feelStart = playground.indexOf(
  "function PlaygroundFeelStrip(",
);
const feelEnd = playground.indexOf(
  "\n\nfunction PlaygroundMixStrip(",
  feelStart,
);
const feel =
  feelStart >= 0 && feelEnd > feelStart
    ? playground.slice(feelStart, feelEnd)
    : "";

const required = [
  [playground, 'aria-label="Feel and groove"', "P9 Feel surface is missing."],
  [playground, '"Straight feel"', "P9 Straight preset is missing."],
  [playground, '"Tight feel"', "P9 Tight preset is missing."],
  [playground, '"Laid-back feel"', "P9 Laid-back preset is missing."],
  [playground, '"Human feel"', "P9 Human preset is missing."],
  [feel, 'aria-label="Feel swing"', "P9 Swing control is missing."],
  [feel, 'max="50"', "P9 Playground Swing must stay in the simple 0–50% range."],
  [feel, "applyGroove({", "P9 must reuse the canonical groove engine."],
  [feel, "resetGroove(source)", "P9 must reuse canonical groove reset."],
  [feel, "sequencerStore.applyPatternTransform(", "P9 Feel must remain one undoable Pattern transform."],
  [groove, "if (lane.lock.timing) {\n    return event.timingOffsetUs;", "P9 timing lock safety is missing."],
  [groove, "if (lane.lock.dynamics) {\n    return event.velocity;", "P9 dynamics lock safety is missing."],
  [groove, "if (lane.lock.rhythm) {\n          retained.push(event);", "P9 Reset must preserve locked groove ghosts."],
  [drum, "swingOffsetUsForStep(", "Realtime drums must retain Groove Swing playback."],
  [melodic, "swingOffsetUsForStep(", "Realtime melodic tracks must retain Groove Swing playback."],
  [offline, "swingOffsetUsForStep(", "Offline renders must retain Groove Swing playback."],
  [css, ".playground-feel-strip", "P9 Feel responsive styling is missing."],
  [e2e, "Playground P9 Feel applies deterministic humanization swing and reset", "P9 browser certification is missing."],
];

for (const [source, token, message] of required) {
  if (!source.includes(token)) {
    failures.push(message);
  }
}

const presetIds = [
  ...playground.matchAll(
    /id: "(straight|tight|laidBack|human)",/g,
  ),
].map((match) => match[1]);

for (const expected of [
  "straight",
  "tight",
  "laidBack",
  "human",
]) {
  if (!presetIds.includes(expected)) {
    failures.push(
      "P9 Feel preset set is incomplete: " +
        expected,
    );
  }
}

for (const forbidden of [
  "Math.random(",
  'aria-label="Ghost',
  'aria-label="Humanization',
  'aria-label="Timing',
  'aria-label="Jitter',
  "roleTimingOffsetUs",
]) {
  if (feel.includes(forbidden)) {
    failures.push(
      "Playground Feel must remain musical and simple; advanced control leaked in: " +
        forbidden,
    );
  }
}

if (
  !feel.includes(
    'source.groove?.seed ??',
  ) ||
  !feel.includes(
    '"playground-feel"',
  )
) {
  failures.push(
    "P9 Feel must use a stable deterministic seed.",
  );
}

if (
  !groove.includes(
    "if (!lane.lock.dynamics)",
  ) ||
  !groove.includes(
    "if (!lane.lock.timing)",
  )
) {
  failures.push(
    "P9 Groove reset must respect timing and dynamics locks.",
  );
}

if (failures.length > 0) {
  throw new Error(
    "P9 Feel contract failed:\n- " +
      failures.join("\n- "),
  );
}

console.log(
  "P9 Feel contracts verified: four simple musical presets, bounded Swing, deterministic undoable groove transforms, lock-safe apply/reset, mobile UI, and realtime/export parity.",
);
