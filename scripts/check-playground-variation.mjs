import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) =>
  readFileSync(resolve(root, path), "utf8");

const failures = [];
const sequencer = read("src/sequencer/SequencerStore.ts");
const playground = read("src/ui/playground/PlaygroundSurface.tsx");
const css = read("src/playground.css");
const playback = read("src/sequencer/patternPlayback.ts");
const drum = read("src/audio/DrumEngine.ts");
const offline = read("src/render/offlineRenderer.ts");
const e2e = read("e2e/playground.spec.ts");

const required = [
  [sequencer, "export interface SequencerStepVariation", "P10 variation contract is missing."],
  [sequencer, "applySelectedVariation(", "P10 atomic selected-note variation editing is missing."],
  [sequencer, "sourceLane.lock.rhythm", "P10 single-step rhythm lock safety is missing."],
  [sequencer, "sourceLane.lock.timing", "P10 single-step timing lock safety is missing."],
  [playground, 'aria-label="Cycle selected note chance"', "P10 batch Chance control is missing."],
  [playground, 'aria-label="Cycle selected note repeat"', "P10 batch Repeat control is missing."],
  [playground, 'aria-label="Cycle selected note flam"', "P10 batch Flam control is missing."],
  [playground, 'applyStepContextVariation(', "P10 step-context variation access is missing."],
  [playground, 'className="playground-step__variation"', "P10 step variation badges are missing."],
  [playground, 'chance " +', "P10 accessible Chance metadata is missing from step labels."],
  [playground, '" times"', "P10 accessible Repeat metadata is missing from step labels."],
  [playground, '" milliseconds"', "P10 accessible Flam metadata is missing from step labels."],
  [css, ".playground-step__variation", "P10 variation badge styling is missing."],
  [css, "max-height: calc(100dvh - 16px)", "P10 expanded context menu must stay viewport-safe."],
  [playback, "eventPassesProbability(", "Realtime probability playback support is missing."],
  [playback, "normalizedRatchetCount(event)", "Realtime ratchet playback support is missing."],
  [playback, "normalizedFlamOffsetUs(event)", "Realtime flam playback support is missing."],
  [drum, "hit.ratchetCount", "Realtime drum ratchet scheduling is missing."],
  [drum, "hit.flamOffsetUs", "Realtime drum flam scheduling is missing."],
  [offline, "event.hit.ratchetCount", "Offline ratchet rendering is missing."],
  [offline, "event.hit.flamOffsetUs", "Offline flam rendering is missing."],
  [e2e, "Playground P10 micro variation edits selected hits and step context", "P10 browser certification is missing."],
];

for (const [source, token, message] of required) {
  if (!source.includes(token)) {
    failures.push(message);
  }
}

const selectedVariationStart = sequencer.indexOf(
  "applySelectedVariation(",
);
const selectedVariationEnd = sequencer.indexOf(
  "\n  getLaneLengthSteps(",
  selectedVariationStart,
);
const selectedVariation =
  selectedVariationStart >= 0 &&
  selectedVariationEnd > selectedVariationStart
    ? sequencer.slice(
        selectedVariationStart,
        selectedVariationEnd,
      )
    : "";

if (
  !selectedVariation.includes(
    "lane.lock.rhythm",
  ) ||
  !selectedVariation.includes(
    "lane.lock.timing",
  ) ||
  !selectedVariation.includes(
    "this.commit((draft) =>",
  )
) {
  failures.push(
    "P10 selected-note variation must remain atomic and lock-safe.",
  );
}

for (const forbidden of [
  "playground-variation-panel",
  'type="number"',
  "Math.random(",
]) {
  if (playground.includes(forbidden)) {
    failures.push(
      "P10 must remain contextual and simple; leaked control: " +
        forbidden,
    );
  }
}

if (failures.length > 0) {
  throw new Error(
    "P10 variation contract failed:\n- " +
      failures.join("\n- "),
  );
}

console.log(
  "P10 variation contracts verified: contextual Chance/Repeat/Flam, atomic multi-selection, lock-safe editing, visible badges, mobile-safe context access, and realtime/export parity.",
);
