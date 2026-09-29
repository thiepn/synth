import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) =>
  readFileSync(resolve(root, path), "utf8");

const css = read("src/playground.css");
const e2e = read("e2e/playground.spec.ts");
const failures = [];

const checks = [
  [/\/\* P19 — Mobile & Tablet Final Polish \*\//, "P19 responsive polish marker is missing."],
  [/@media\(min-width:761px\) and \(max-width:900px\)/, "P19 tablet breakpoint is missing."],
  [/\.playground-mobile-dock\{display:grid\}/, "P19 tablet dock continuity is missing."],
  [/\.playground-actions\{display:none\}/, "P19 tablet must hide the redundant hero transport."],
  [/grid-template-columns:\s*minmax\(76px,\s*\.55fr\)\s*minmax\(190px,\s*1\.45fr\)/, "P19 compact phone Style/Tempo row is missing."],
  [/\.playground-bar-tabs > button \{\s*min-width:\s*44px;/, "P19 bar tabs must keep a 44px touch width."],
  [/\.playground-track-head \{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*44px;/, "P19 mobile track sound column must be 44px."],
  [/\.playground-finish-actions>button\{min-height:64px\}/, "P19 export actions must remain comfortably touchable."],
  [/@media \(forced-colors: active\)[\s\S]*?\.playground-mobile-dock/, "P19 must preserve forced-colors support for the dock."],
];

for (const [pattern, message] of checks) {
  if (!pattern.test(css)) failures.push(message);
}

for (const [token, message] of [
  ["P19 mobile and tablet layouts keep touch controls compact and reachable", "P19 browser certification is missing."],
  ["width: 390,", "P19 browser certification must include a common phone viewport."],
  ["width: 768,", "P19 browser certification must include tablet portrait."],
  ["width: 1024,", "P19 browser certification must verify the desktop/tablet breakpoint exit."],
]) {
  if (!e2e.includes(token)) failures.push(message);
}

if (failures.length > 0) {
  throw new Error(
    "P19 mobile/tablet contract failed:\n- " +
      failures.join("\n- "),
  );
}

console.log(
  "P19 mobile/tablet contracts verified: compact phone transport, tablet dock continuity, 44px editor controls, stable export target, and forced-colors preservation.",
);
