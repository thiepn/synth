import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function requireText(path, text, message) {
  const content = read(path);
  if (!content.includes(text)) {
    throw new Error(message + " [" + path + "]");
  }
}

function rejectText(path, text, message) {
  const content = read(path);
  if (content.includes(text)) {
    throw new Error(message + " [" + path + "]");
  }
}

rejectText(
  "index.html",
  "user-scalable=no",
  "Viewport zoom must remain user-scalable.",
);
rejectText(
  "index.html",
  "maximum-scale=1",
  "Viewport maximum-scale lock must not return.",
);

requireText(
  "src/App.tsx",
  'className="skip-link"',
  "The app shell must keep a keyboard skip link.",
);
requireText(
  "src/App.tsx",
  "<AccessibilityBridge",
  "The app shell must keep the accessibility bridge.",
);
requireText(
  "src/App.tsx",
  "tabIndex={active === mode.id ? 0 : -1}",
  "Mode navigation must keep roving keyboard focus.",
);
requireText(
  "src/App.tsx",
  'event.key === "ArrowRight"',
  "Mode navigation must keep arrow-key navigation.",
);

requireText(
  "src/interaction.css",
  "repeat(7",
  "Mobile mode navigation must account for all seven modes.",
);
requireText(
  "src/interaction.css",
  "@media (forced-colors: active)",
  "Forced-colors support must remain present.",
);
requireText(
  "src/interaction.css",
  "@media (pointer: coarse)",
  "Coarse-pointer touch targets must remain hardened.",
);

requireText(
  "src/ui/surfaces/SequenceSurface.tsx",
  "handleMatrixKeyDown",
  "Sequencer matrix must retain keyboard navigation.",
);
requireText(
  "src/ui/modulation/ModulationPanel.tsx",
  "automation-keyboard-editor",
  "Automation editing must retain a keyboard alternative.",
);
requireText(
  "src/ui/sample/SampleLabPanel.tsx",
  "sample-lab-manual-cut",
  "Sample Lab manual cuts must retain a keyboard alternative.",
);
requireText(
  "src/ui/surfaces/PerformanceSurface.tsx",
  "nudgeXY",
  "LIVE XY control must retain keyboard operation.",
);

requireText(
  "src/ui/playground/PlaygroundSurface.tsx",
  'aria-label="Playground help and shortcuts"',
  "Playground must retain its discoverable help surface.",
);
requireText(
  "src/ui/playground/PlaygroundSurface.tsx",
  "beginStepContextLongPress",
  "Playground step context actions must remain touch-discoverable.",
);
requireText(
  "src/ui/playground/PlaygroundSurface.tsx",
  "FAVORITE_SOUNDS_STORAGE_KEY",
  "Playground favorite sound discovery must remain available.",
);
requireText(
  "src/playground.css",
  "@media (hover: hover) and (pointer: fine)",
  "Playground custom tooltips must stay pointer-capability aware.",
);

console.log("Interaction accessibility contracts verified.");
