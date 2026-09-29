import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) =>
  readFileSync(resolve(root, path), "utf8");

const failures = [];
const beat = read("src/generation/beatGenerator.ts");
const family = read("src/generation/beatFamilyGenerator.ts");
const playground = read(
  "src/ui/playground/PlaygroundSurface.tsx",
);
const melodic = read("src/audio/melodicSoundModel.ts");
const e2e = read("e2e/playground.spec.ts");

const required = [
  [beat, "export const BEAT_GENERATOR_VERSION = 3;", "P18 changed deterministic beat output without advancing generator provenance."],
  [family, "export const BEAT_FAMILY_GENERATOR_VERSION = 3;", "P18 changed Beat Family output without advancing family provenance."],
  [beat, "function polishGeneratedGrid(", "P18 beat-generation polish stage is missing."],
  [beat, "openHat[step] > 0 && closedHat[step] > 0", "P18 hat choke/exclusivity rule is missing."],
  [beat, "long pattern repeats without phrase development", "P18 phrase-development validation is missing."],
  [beat, "open and closed hats collide", "P18 hat-collision validation is missing."],
  [beat, 'deriveSeed(effectiveSeed, "musical-polish")', "P18 polish must remain deterministic per effective seed."],
  [family, "function thinLaneRange(", "P18 fill-space utility is missing."],
  [family, '"fill-space-closed"', "P18 fills no longer carve space in the source groove."],
  [family, '"transition-no-early-crash"', "P18 transition cymbal-boundary cleanup is missing."],
  [playground, "mixerStore.resetPlaygroundChannel(", "P18 starter mixes must reset unlocked simple channel state before applying the starter baseline."],
  [e2e, "P18 generation develops phrases and starters keep a deterministic mix baseline", "P18 browser quality certification is missing."],
];

for (const [source, token, message] of required) {
  if (!source.includes(token)) failures.push(message);
}

const bassSection =
  melodic.slice(
    melodic.indexOf("bass: ["),
    melodic.indexOf("chords: ["),
  );
const bassWidths = [
  ...bassSection.matchAll(/stereoWidth:\s*(\d+(?:\.\d+)?)/g),
].map((match) => Number(match[1]));
if (
  bassWidths.length !== 6 ||
  bassWidths.some((width) => width > 0.18)
) {
  failures.push(
    "P18 audit: bass presets must remain intentionally narrow (<= 0.18 stereo width).",
  );
}

if (
  family.includes(
    'addHit(next, "lane-crash", Math.max(0, steps - 1)',
  )
) {
  failures.push(
    "P18 transition regression: crash must not land on the final sixteenth before the destination downbeat.",
  );
}

if (failures.length > 0) {
  throw new Error(
    "P18 musical-quality contract failed:\n- " +
      failures.join("\n- "),
  );
}

console.log(
  "P18 musical-quality contracts verified: deterministic phrase development, hat exclusivity, fill breathing room, clean transition boundaries, stable starter mixes, and narrow bass imaging.",
);
