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
  [css, "@media (pointer: coarse)", "Coarse-pointer hardening must remain present."],
  [css, "@media (hover: hover) and (pointer: fine)", "Tooltips must remain capability-aware."],
  [css, "@media (prefers-reduced-motion: reduce)", "Reduced-motion support must remain present."],
  [css, "@media (forced-colors: active)", "Forced-colors support must remain present."],
  [css, "env(safe-area-inset-bottom)", "Mobile safe-area handling must remain present."],
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
  css,
  ".playground-sound-choices button.is-active",
  "Stale pre-Q7 sound-card active selector must not return.",
);
rejectText(
  css,
  ".playground-sound-choices button {",
  "Stale pre-Q7 mobile sound-card selector must not return.",
);
rejectText(
  css,
  "user-select: none;\n}\n\n.playground-surface",
  "Release gate sanity check failed: unexpected stylesheet structure.",
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
