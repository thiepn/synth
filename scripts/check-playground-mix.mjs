import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) =>
  readFileSync(resolve(root, path), "utf8");

const failures = [];
const contracts = read("src/domain/contracts.ts");
const clone = read("src/domain/patternClone.ts");
const sequencer = read("src/sequencer/SequencerStore.ts");
const mixerModel = read("src/mix/mixerModel.ts");
const mixerStore = read("src/mix/MixerStore.ts");
const drumEngine = read("src/audio/DrumEngine.ts");
const melodicEngine = read("src/audio/MelodicEngine.ts");
const offline = read("src/render/offlineRenderer.ts");
const playground = read("src/ui/playground/PlaygroundSurface.tsx");
const css = read("src/playground.css");
const e2e = read("e2e/playground.spec.ts");

const required = [
  [contracts, "export interface LaneMix", "Canonical melodic lane mix contract is missing."],
  [contracts, "mix?: LaneMix", "Pattern lanes no longer persist simple mix state."],
  [clone, "mix: lane.mix ? { ...lane.mix } : undefined", "Pattern cloning must deep-clone lane mix."],
  [sequencer, "setMelodicMixValue(", "Melodic mix editing must remain undoable in SequencerStore."],
  [sequencer, "resetMelodicMix(", "Melodic mix reset must remain available."],
  [mixerStore, "resetPlaygroundChannel(", "Playground drum reset must remain isolated from Studio-only processing."],
  [drumEngine, "reverbSend?: number", "Shared external audio routing must retain melodic space send support."],
  [melodicEngine, "clampLaneMix(lane.mix)", "Live melodic playback must read canonical lane mix."],
  [melodicEngine, "dbToLaneGain(laneMix.gainDb)", "Live melodic level trim is missing."],
  [offline, "clampLaneMix(lane.mix)", "Offline melodic rendering must read canonical lane mix."],
  [offline, "send.connect(graph.convolver)", "Offline melodic space send is missing."],
  [playground, 'className="playground-mix-strip"', "P7 selected-track mix strip must remain visible."],
  [playground, 'aria-label={label + " level"}', "P7 track Level control is missing."],
  [playground, 'aria-label={label + " pan"}', "P7 track Pan control is missing."],
  [playground, 'aria-label={label + " space"}', "P7 track Space control is missing."],
  [playground, 'aria-label="Playground master level"', "P7 master level control is missing."],
  [css, ".playground-mix-strip", "P7 mix strip styling is missing."],
  [e2e, "Playground P7 mix strip controls drum melodic and master balance", "P7 browser certification is missing."],
];

for (const [source, token, message] of required) {
  if (!source.includes(token)) {
    failures.push(message);
  }
}

const defaultSends = [
  ...mixerModel.matchAll(
    /(kick|snare|clap|closedHat|openHat|tom|percussion|crash): (0(?:\.\d+)?|1(?:\.0+)?),/g,
  ),
].filter((match) => {
  const index = match.index ?? 0;
  const tableStart = mixerModel.indexOf(
    "const DEFAULT_REVERB_SEND",
  );
  const tableEnd = mixerModel.indexOf(
    "export function defaultMixerChannel",
  );
  return index > tableStart && index < tableEnd;
});

if (defaultSends.length !== 8) {
  failures.push(
    "Expected musical Space defaults for all 8 drum voices; found " +
      defaultSends.length +
      ".",
  );
}

for (const match of defaultSends) {
  const value = Number(match[2]);
  const steps = Math.round(value / 0.05);
  if (
    value < 0 ||
    value > 1 ||
    Math.abs(value - steps * 0.05) > 0.00001
  ) {
    failures.push(
      "Drum Space default is off the 5% Playground control grid: " +
        match[1] +
        "=" +
        value,
    );
  }
}

const resetStart = mixerStore.indexOf(
  "resetPlaygroundChannel(",
);
const resetEnd = mixerStore.indexOf(
  "setMasterGainDb(",
  resetStart,
);
const resetBlock =
  resetStart >= 0 && resetEnd > resetStart
    ? mixerStore.slice(resetStart, resetEnd)
    : "";

for (const advanced of [
  "lowDb:",
  "midDb:",
  "highDb:",
  "compression:",
  "saturation:",
  "sidechain:",
]) {
  if (resetBlock.includes(advanced)) {
    failures.push(
      "Playground Reset must not overwrite Studio-only parameter " +
        advanced,
    );
  }
}

if (
  !melodicEngine.includes("reverbSend: laneMix.reverbSend") ||
  !offline.includes("laneMix.reverbSend > 0.0001")
) {
  failures.push(
    "Live/export melodic Space parity is incomplete.",
  );
}

if (failures.length > 0) {
  throw new Error(
    "P7 mix contract failed:\n- " +
      failures.join("\n- "),
  );
}

console.log(
  "P7 mix contracts verified: simple Level/Pan/Space, non-destructive reset, musical drum defaults, persistence, and live/export parity.",
);
