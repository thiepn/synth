import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) =>
  readFileSync(resolve(root, path), "utf8");

const failures = [];
const app = read("src/App.tsx");
const playground = read(
  "src/ui/playground/PlaygroundSurface.tsx",
);
const css = read("src/playground.css");
const e2e = read("e2e/playground.spec.ts");

const required = [
  [playground, 'className="playground-control-deck"', "P16 unified Creative controls deck is missing."],
  [playground, 'aria-label="Creative controls"', "P16 Creative controls landmark is missing."],
  [playground, 'onOpenStudio: (mode?: ModeId) => void;', "P16 context-aware Studio handoff contract is missing."],
  [app, 'onOpenStudio={(targetMode = "create") => {', "App does not accept targeted Playground Studio handoffs."],
  [app, 'setModeId(targetMode);', "Targeted Studio handoff does not select the requested mode."],
  [playground, 'onOpenStudio("archive");', "Finish does not hand off to MASTER + EXPORT."],
  [playground, 'onClick={() => onOpenStudio("sound")}', "Motion does not hand off to SOUND modulation."],
  [playground, 'onClick={() => openStudio("arrange")}', "Song does not hand off to ARRANGE."],
  [playground, 'aria-label="Open advanced Arrange Studio"', "Advanced Arrange handoff is not discoverable."],
  [css, "/* Playground P16 — workflow consolidation */", "P16 workflow styling is missing."],
  [css, ".playground-control-deck{", "P16 Creative controls deck styling is missing."],
  [css, ".playground-song__studio{", "P16 contextual Arrange button styling is missing."],
  [e2e, "Playground P16 consolidates creative controls and targets advanced Studio workspaces", "P16 browser certification is missing."],
  [playground, "onClick={() => onOpenStudio()}", "Project health alert must not pass a React MouseEvent into the targeted Studio handoff."],
];

for (const [source, token, message] of required) {
  if (!source.includes(token)) failures.push(message);
}

if (
  !playground.includes(
    '<section\n        className="playground-control-deck"\n        aria-label="Creative controls"',
  )
) {
  failures.push(
    "P16 Creative controls must remain a single named parent region rather than another detached toolbar.",
  );
}

if (
  playground.includes("onClick={openStudio}")
) {
  failures.push(
    "P16 targeted openStudio must not be passed directly as a React click handler because the MouseEvent could be mistaken for a mode.",
  );
}

if (failures.length > 0) {
  throw new Error(
    "P16 workflow consolidation contract failed:\n- " +
      failures.join("\n- "),
  );
}

console.log(
  "P16 workflow contracts verified: one Creative controls deck, safe targeted Studio handoffs for Arrange/Sound/Export, responsive styling, and browser coverage.",
);
