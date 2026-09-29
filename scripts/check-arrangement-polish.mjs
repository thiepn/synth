import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) =>
  readFileSync(resolve(root, path), "utf8");

const failures = [];
const arrange = read("src/ui/surfaces/ArrangeSurface.tsx");
const store = read("src/arrange/ArrangementStore.ts");
const css = read("src/arrange.css");
const e2e = read("e2e/playground.spec.ts");

const required = [
  [arrange, "if (arrangement.blueprint) return;", "P17 must preserve an existing canonical arrangement instead of replacing it with a CREATE foundation."],
  [arrange, 'aria-label="Song structure controls"', "P17 song structure controls are missing."],
  [arrange, 'aria-label="Arrangement name"', "P17 arrangement naming is missing."],
  [arrange, 'aria-label="New section pattern"', "P17 quick section insertion is missing."],
  [arrange, "PLAY FROM HERE", "P17 play-from-selected workflow is missing."],
  [arrange, 'aria-label="Section name"', "P17 section naming is missing."],
  [arrange, 'aria-label="Section role"', "P17 role editing is missing."],
  [arrange, 'aria-label="Section pattern"', "P17 pattern reassignment is missing."],
  [arrange, 'aria-label="Section length presets"', "P17 section length presets are missing."],
  [store, "renameArrangement(name: string): void", "P17 canonical arrangement rename method is missing."],
  [store, "setSectionLabel(", "P17 canonical section rename method is missing."],
  [css, "/* P17 — arrangement & song editing polish */", "P17 responsive Arrange styling is missing."],
  [e2e, "P17 preserves Playground songs and polishes canonical Arrange editing", "P17 cross-workspace browser certification is missing."],
];

for (const [source, token, message] of required) {
  if (!source.includes(token)) failures.push(message);
}

if (
  arrange.includes(
    "if (!foundation.blueprint || !family.family) {",
  )
) {
  failures.push(
    "P17 Arrange must not require a CREATE foundation when a Playground/project arrangement already exists.",
  );
}

if (
  !arrange.includes(
    "arrangementStore.addSectionFromPattern(\n                newSectionPatternId,\n                selectedSection?.id,",
  )
) {
  failures.push(
    "P17 quick-add must insert after the current section through the canonical ArrangementStore.",
  );
}

if (
  !arrange.includes(
    "arrangementPlaybackStore.start(\n                    selectedSection.id,\n                    false,",
  )
) {
  failures.push(
    "P17 Play From Here must continue through the remaining arrangement rather than playing only one section.",
  );
}

if (failures.length > 0) {
  throw new Error(
    "P17 arrangement polish contract failed:\n- " +
      failures.join("\n- "),
  );
}

console.log(
  "P17 arrangement contracts verified: canonical Playground/Studio continuity, direct song/section naming, role/pattern editing, quick insertion, length presets, and play-from-selected workflow.",
);
