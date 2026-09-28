import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function requireText(path, text, message) {
  if (!read(path).includes(text)) {
    throw new Error(message + " [" + path + "]");
  }
}

function rejectText(path, text, message) {
  if (read(path).includes(text)) {
    throw new Error(message + " [" + path + "]");
  }
}

const playground = "src/ui/playground/PlaygroundSurface.tsx";
const css = "src/playground.css";

const required = [
  [playground, "setStepVelocity(", "Q1 velocity editing must remain available."],
  [playground, "fillSixteenth", "Q1 lane fills must remain available."],
  [playground, "duplicatePatternBar", "Q1 bar duplication must remain available."],
  [playground, "addPatternBar", "Q1 bar growth must remain available."],
  [playground, "toggleGridRecording", "P2 grid recording controls must remain available."],
  [playground, 'aria-label="Grid recording"', "P2 recording surface must remain visible."],
  [playground, "enablePlaygroundMidi", "P2 MIDI enablement must remain directly available from Playground."],
  [playground, "selectedSteps", "P3 note selection state must remain available."],
  [playground, "batchDuplicateSelection", "P3 batch duplication must remain available."],
  [playground, 'aria-label="Note selection tools"', "P3 selection toolbar must remain visible."],
  ["src/sequencer/SequencerStore.ts", "moveSelectedSteps(", "P3 canonical batch movement must remain in SequencerStore."],
  ["src/sequencer/SequencerStore.ts", "duplicateSelectedSteps(", "P3 canonical batch duplication must remain in SequencerStore."],
  ["src/sequencer/SequencerStore.ts", "pasteSelectedSteps(", "P3 metadata-preserving selection paste must remain in SequencerStore."],
  [playground, "batchPasteSelection", "P3 cross-bar copy paste must remain available."],
  [playground, 'aria-label="Melodic key"', "P4 key control must remain available."],
  [playground, "beginMelodicResize", "P4 drag note-length editing must remain available."],
  ["src/music/foundationPattern.ts", "MELODIC_LANES", "P4 bass, chords and lead lanes must remain canonical."],
  ["src/sequencer/SequencerStore.ts", "setMelodicNote(", "P4 melodic notes must write through SequencerStore."],
  ["src/audio/MelodicEngine.ts", "MELODIC_PRESETS", "P4 melodic playback engine must remain available."],
  ["src/render/offlineRenderer.ts", "scheduleOfflineMelodic(", "P4 melodic notes must remain in master exports."],
  ["src/sequencer/GridRecorder.ts", "recordRealtimeStep(", "P2 recorder must write through canonical SequencerStore state."],
  ["src/input/InputActionRouter.ts", "gridRecorder.recordHit(", "P2 MIDI/external pad input must feed grid recording."],
  ["src/audio/AudioTransport.ts", "seekToAbsoluteTick(", "P2 selected-bar recording requires transport seek support."],
  [playground, 'aria-label="Pattern bars"', "Q1 direct bar navigation must remain available."],
  [playground, "patternBanks", "Q2 A/B pattern banks must remain available."],
  [playground, "Undo Remix", "Q2 Remix recovery must remain visible."],
  [playground, "remixSelectedLane", "Q3 selected-lane Remix must remain available."],
  [playground, "densityDouble", "Q3 density transforms must remain available."],
  [playground, "touchEditMode", "Q4 touch edit modes must remain available."],
  [playground, 'className="playground-mobile-dock"', "Q4 mobile dock must remain available."],
  [playground, "startCountIn", "Q5 count-in must remain available."],
  [playground, "restartPlayback", "Q5 restart must remain available."],
  [playground, "followPlayhead", "Q5 playhead follow must remain available."],
  [playground, 'aria-label="Project session"', "Q6 session controls must remain available."],
  [playground, "createFreshProject", "Q6 fresh-project flow must remain available."],
  [playground, 'aria-label="Playground help and shortcuts"', "Q7 help must remain available."],
  [playground, "beginStepContextLongPress", "Q7 touch context actions must remain available."],
  [playground, "FAVORITE_SOUNDS_STORAGE_KEY", "Q7 favorite sounds must remain available."],
  [playground, "helpDialogRef", "Q8 modal focus handling must remain available."],
  [playground, "previousHelpFocusRef", "Q8 focus restoration must remain available."],
  [playground, 'document.documentElement.style.overflow = "hidden"', "Q8 modal scroll lock must remain available."],
  [playground, "nativeShareAvailable", "Q8 project share must retain safe download fallback."],
  [css, "@media (pointer: coarse)", "Coarse-pointer hardening must remain present."],
  [css, "@media (hover: hover) and (pointer: fine)", "Tooltips must remain capability-aware."],
  [css, "@media (prefers-reduced-motion: reduce)", "Reduced-motion support must remain present."],
  [css, "@media (forced-colors: active)", "Forced-colors support must remain present."],
  [css, "env(safe-area-inset-bottom)", "Mobile safe-area handling must remain present."],
  ["e2e/playground.spec.ts", "Playground A B banks preserve independent beat edits", "Q2 A/B behavior must remain browser-certified."],
  ["e2e/playground.spec.ts", "Playground lane transforms are deterministic and undoable", "Q3 transforms must remain browser-certified."],
  ["e2e/playground.spec.ts", "Playground velocity editing changes an existing hit without stopping flow", "Q1 velocity behavior must remain browser-certified."],
  ["e2e/playground.spec.ts", "Playground bar editing grows duplicates clears and deletes musical bars", "Q1 bar editing must remain browser-certified."],
  ["e2e/playground.spec.ts", "Playground records pad performance live into the selected bar and can erase it", "P2 performance recording must remain browser-certified."],
  ["e2e/playground.spec.ts", "Playground selection batch edits move duplicate delete and undo notes", "P3 selection and batch editing must remain browser-certified."],
  ["e2e/playground.spec.ts", "Playground melodic tracks edit pitch duration chords scale and survive drum regeneration", "P4 melodic editing must remain browser-certified."],
  ["e2e/playground.spec.ts", "Playground count in restart repeat and momentary monitoring stay responsive", "Q5 flow behavior must remain browser-certified."],
];

for (const [path, text, message] of required) {
  requireText(path, text, message);
}

rejectText(
  playground,
  'playbackCoordinator.toggleForMode("create")',
  "Playground must keep Q5 count-in aware transport flow instead of bypassing it.",
);
rejectText(
  playground,
  'event.key === "?" &&\n        !eventTargetConsumesKeyboard',
  "Help shortcut must not be disabled merely because an ordinary button has focus.",
);
rejectText(
  css,
  ".playground-sound-choices button.is-active",
  "Stale pre-Q7 sound-card active selector must not return.",
);
rejectText(
  css,
  ".playground-sound-choices button {",
  "Stale pre-Q7 mobile sound-card selector must not return.",
);
const ui = read(playground);
const cssText = read(css);

if ((ui.match(/className="playground-mobile-dock"/g) ?? []).length !== 1) {
  throw new Error("Playground must render exactly one mobile dock.");
}

if ((ui.match(/aria-modal="true"/g) ?? []).length !== 1) {
  throw new Error("Playground must expose exactly one modal help surface.");
}

if (!cssText.includes("repeat(7, minmax(0, 1fr))")) {
  throw new Error("Mobile dock must still account for all seven quick actions.");
}

console.log("Playground Q1-Q8 release contracts verified.");
