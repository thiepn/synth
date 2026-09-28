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
const renderStore = read("src/render/RenderStore.ts");
const wav = read("src/render/wavEncoder.ts");
const e2e = read("e2e/playground.spec.ts");

const finishStart = playground.indexOf(
  "function PlaygroundFinishPanel(",
);
const finishEnd = playground.indexOf(
  "\n\ninterface SoundPreset",
  finishStart,
);
const finish =
  finishStart >= 0 && finishEnd > finishStart
    ? playground.slice(finishStart, finishEnd)
    : "";

const required = [
  [playground, 'aria-label="Finish and export"', "P8 Finish surface is missing."],
  [playground, '>Finish\n', "P8 session action must remain labeled Finish."],
  [finish, 'sampleRate: 48_000', "P8 quick export must remain fixed at 48 kHz."],
  [finish, 'bitDepth: 24', "P8 quick export must remain 24-bit WAV."],
  [finish, 'dither: true', "P8 quick integer WAV export must retain dither."],
  [finish, 'includeSafetyLimiter: true', "P8 quick export must retain output safety limiting."],
  [finish, 'tailMode: loop ? "none" : "auto"', "P8 exact-loop vs natural-tail behavior regressed."],
  [finish, '{ kind: "arrangement" }', "P8 Song export must use canonical arrangement rendering."],
  [finish, '{ kind: "pattern" }', "P8 Pattern export must use canonical pattern rendering."],
  [finish, "readyArtifact", "P8 native sharing must prepare an artifact before the share gesture."],
  [finish, "shareReadyAudio", "P8 prepared native share action is missing."],
  [finish, "navigator.share(shareData)", "P8 native file sharing integration is missing."],
  [finish, "Project file", "P8 editable project backup escape hatch is missing."],
  [finish, "Use Studio", "P8 advanced export handoff is missing."],
  [css, ".playground-finish-panel", "P8 Finish styling is missing."],
  [e2e, "Playground P8 Finish exports a high quality exact WAV loop", "P8 Pattern WAV browser certification is missing."],
  [e2e, 'name: "Export full Song"', "P8 Song-range browser certification is missing."],
  [renderStore, "renderWav(", "Canonical RenderStore WAV pipeline is missing."],
  [wav, "sanitizeExportName", "P8 must retain sanitized export filenames."],
];

for (const [source, token, message] of required) {
  if (!source.includes(token)) {
    failures.push(message);
  }
}

for (const forbidden of [
  "renderStems(",
  'bitDepth === "32f"',
  "fixedTailSeconds",
  'type="number"',
]) {
  if (finish.includes(forbidden)) {
    failures.push(
      "Playground Finish must stay simple; Studio-only export control leaked in: " +
        forbidden,
    );
  }
}

const nativeShareCall =
  finish.indexOf("navigator.share(shareData)");
const readyShare =
  finish.indexOf("const shareReadyAudio");
if (
  nativeShareCall < 0 ||
  readyShare < 0 ||
  nativeShareCall > readyShare
) {
  failures.push(
    "Native share helper must remain prepared before the explicit share-ready action.",
  );
}

if (
  !finish.includes(
    'readySignature === sourceSignature',
  ) ||
  !finish.includes("sequencer.revision") ||
  !finish.includes("mixer.revision") ||
  !finish.includes("mastering.revision") ||
  !finish.includes("arrangement.revision")
) {
  failures.push(
    "Prepared WAV sharing must invalidate when musical or mix state changes.",
  );
}

if (failures.length > 0) {
  throw new Error(
    "P8 Finish contract failed:\n- " +
      failures.join("\n- "),
  );
}

console.log(
  "P8 Finish contracts verified: simple 48k/24-bit WAV, Pattern/Song range, exact loops, safe native sharing, project backup, and Studio handoff.",
);
