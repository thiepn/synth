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
  ["src/audio/MelodicEngine.ts", "class MelodicEngine", "P4 melodic playback engine must remain available."],
  ["src/audio/melodicSoundModel.ts", "MELODIC_PRESETS", "P4 melodic instrument presets must remain available without live-engine side effects."],
  ["src/midi/MidiStore.ts", "subscribeNoteEvents", "P4 raw MIDI note capture must remain available."],
  [playground, "toggleMelodicMidiRecording", "P4 melodic MIDI recording must remain directly available."],
  [playground, "buildPlaygroundSong", "P5 A/B song builder must remain directly available."],
  [playground, 'aria-label="Song arrangement"', "P5 song timeline must remain visible."],
  ["src/arrange/playgroundArrangement.ts", "createPlaygroundSong(", "P5 A/B arrangement adapter must remain canonical."],
  ["src/arrange/ArrangementStore.ts", "setSectionPattern(", "P5 section A/B switching must remain in ArrangementStore."],
  ["src/arrange/ArrangementStore.ts", "upsertPattern(", "P5 active bank edits must sync into arrangement playback."],
  ["src/arrange/ArrangementPlaybackStore.ts", "queueSection(", "P5 live section queuing must remain canonical."],
  ["src/arrange/ArrangementStore.ts", "setSectionRole(", "P5 semantic section roles must remain canonical."],
  [playground, 'aria-label="Song section role"', "P5 section role editing must remain available."],
  [playground, "selectOrQueueSongSection", "P5 song timeline clicks must queue sections during playback."],
  ["src/audio/melodicSoundModel.ts", "filterEnvelopeOctaves", "P6 melodic presets must retain expressive filter-envelope shaping."],
  ["src/audio/melodicSoundModel.ts", "unisonDetuneCents", "P6 melodic presets must retain layered unison timbres."],
  ["src/audio/MelodicEngine.ts", "melodicDriveCurve", "P6 real-time melodic playback must retain soft-drive synthesis."],
  ["src/render/offlineRenderer.ts", "offlineMelodicDriveCurve", "P6 exports must retain the richer melodic synthesis path."],
  [playground, 'source: "hybrid"', "P6 hybrid drum presets must remain directly available in Playground."],
  [playground, "soundPresetSourceLabel", "P6 drum preset source labels must remain discoverable."],
  [playground, 'aria-label="Choose melodic instrument"', "P6 direct melodic preset selection must remain available."],
  ["e2e/playground.spec.ts", "Playground P6 presets expose hybrid drums and direct melodic sound choice", "P6 drum and melodic preset workflow must remain browser-certified."],
  ["src/domain/contracts.ts", "mix?: LaneMix", "P7 melodic track mix must remain persisted with Pattern lanes."],
  ["src/sequencer/SequencerStore.ts", "setMelodicMixValue(", "P7 melodic mixing must remain canonical and undoable."],
  ["src/mix/MixerStore.ts", "resetPlaygroundChannel(", "P7 drum reset must preserve Studio-only processing."],
  [playground, 'className="playground-mix-strip"', "P7 selected-track mix strip must remain available."],
  [playground, 'aria-label="Playground master level"', "P7 master level must remain directly available."],
  ["e2e/playground.spec.ts", "Playground P7 mix strip controls drum melodic and master balance", "P7 simple mix workflow must remain browser-certified."],
  [playground, 'aria-label="Finish and export"', "P8 Finish surface must remain available from Playground."],
  [playground, 'sampleRate: 48_000', "P8 quick WAV export must remain fixed at 48 kHz."],
  [playground, 'bitDepth: 24', "P8 quick WAV export must remain 24-bit."],
  [playground, 'aria-label="Export full Song"', "P8 Song export must remain available when a song exists."],
  [playground, "readyArtifact", "P8 native sharing must retain prepared-artifact flow."],
  ["e2e/playground.spec.ts", "Playground P8 Finish exports a high quality exact WAV loop", "P8 Pattern WAV export must remain browser-certified."],
  ["e2e/playground.spec.ts", 'name: "Export full Song"', "P8 Song export availability must remain browser-certified."],
  [playground, 'aria-label="Feel and groove"', "P9 Feel surface must remain available in Playground."],
  [playground, 'entry.label + " feel"', "P9 Feel presets must remain explicitly accessible."],
  [playground, 'aria-label="Feel swing"', "P9 bounded Swing control must remain available."],
  ["src/groove/grooveEngine.ts", "return event.timingOffsetUs;", "P9 timing-lock safety must remain protected."],
  ["src/groove/grooveEngine.ts", "return event.velocity;", "P9 dynamics-lock safety must remain protected."],
  ["e2e/playground.spec.ts", "Playground P9 Feel applies deterministic humanization swing and reset", "P9 Feel workflow must remain browser-certified."],
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
  ["e2e/playground.spec.ts", "Playground builds and edits an A B song on the canonical arrangement timeline", "P5 simple song arrangement must remain browser-certified."],
  ["e2e/playground.spec.ts", "Playground records held melodic MIDI notes as one undoable take", "P4 melodic MIDI recording must remain browser-certified."],
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
