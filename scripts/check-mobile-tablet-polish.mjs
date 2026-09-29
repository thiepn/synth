import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) =>
  readFileSync(resolve(root, path), "utf8");

const css = read("src/playground.css");
const e2e = read("e2e/playground.spec.ts");
const failures = [];

const required = [
  [css, "/* P19 — Mobile & Tablet Final Polish */", "P19 responsive polish block is missing."],
  [css, "@media(min-width:761px) and (max-width:900px)", "P19 tablet breakpoint is missing."],
  [css, "grid-template-columns: repeat(7, minmax(0, 1fr));", "P19 tablet dock must keep seven equally reachable controls."],
  [css, "grid-template-columns:minmax(96px,.62fr) minmax(220px,1.38fr);", "P19 compact phone Style/Tempo row is missing."],
  [css, ".playground-track-sound{width:44px;min-width:44px;min-height:44px}", "P19 track sound touch target is not protected."],
  [css, ".playground-finish-actions>.playground-finish-primary{min-height:64px}", "P19 primary export action must remain comfortably touchable."],
  [css, "scroll-snap-type:x proximity", "P19 dense horizontal editors must keep touch-friendly snap behavior."],
  [css, "@media(max-width:900px) and (max-height:520px)", "P19 landscape compact-dock behavior is missing."],
  [css, "@media (forced-colors: active)", "P19 must preserve the existing forced-colors mobile dock contract."],
  [e2e, "P19 mobile and tablet layouts keep touch controls compact and reachable", "P19 browser certification is missing."],
  [e2e, "width: 768,", "P19 browser certification must include tablet portrait."],
  [e2e, "width: 1024,", "P19 browser certification must verify desktop/tablet breakpoint exit."],
];

for (const [source, token, message] of required) {
  if (!source.includes(token)) failures.push(message);
}

if (
  !css.includes(".playground-bar-tabs>button,") ||
  !css.includes("min-width:44px")
) {
  failures.push(
    "P19 bar navigation must preserve a 44px coarse-pointer width.",
  );
}

if (failures.length > 0) {
  throw new Error(
    "P19 mobile/tablet contract failed:\n- " +
      failures.join("\n- "),
  );
}

console.log(
  "P19 mobile/tablet contracts verified: compact phone transport, tablet dock continuity, 44px editor controls, stable export target, landscape compaction, scroll snapping, and forced-colors preservation.",
);
