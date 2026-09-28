import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

const failures = [];
const bundled = read("src/audio/bundledSampleLibrary.ts");
const melodic = read("src/audio/melodicSoundModel.ts");
const melodicEngine = read("src/audio/MelodicEngine.ts");
const drumEngine = read("src/audio/DrumEngine.ts");
const offline = read("src/render/offlineRenderer.ts");
const velocity = read("src/audio/velocityResponse.ts");

const bundledGainValues = [
  ...bundled.matchAll(
    /source: SAMPLE_SOURCE, gainDb: (-?\d+(?:\.\d+)?)/g,
  ),
].map((match) => Number(match[1]));

if (bundledGainValues.length !== 21) {
  failures.push(
    "Expected level trims for all 21 bundled 808 samples; found " +
      bundledGainValues.length +
      ".",
  );
}

if (
  bundledGainValues.some(
    (value) =>
      !Number.isFinite(value) ||
      value < -6 ||
      value > 6,
  )
) {
  failures.push(
    "Bundled sample normalization trims must stay inside +/-6 dB.",
  );
}

if (
  !bundled.includes(
    'id: "tr808-snare-dry"',
  ) ||
  !bundled.includes("gainDb: 5.2") ||
  !bundled.includes(
    "drumSoundStore.setSampleGainDb",
  )
) {
  failures.push(
    "Measured bundled-sample normalization is incomplete.",
  );
}

for (const [token, expected] of [
  ["velocityGainExponent:", 18],
  ["velocityToFilterOctaves:", 18],
  ["stereoWidth:", 18],
]) {
  const count =
    melodic.split(token).length - 1;
  if (count !== expected) {
    failures.push(
      "Expected " +
        expected +
        " melodic preset " +
        token +
        " values; found " +
        count +
        ".",
    );
  }
}

for (const token of [
  "melodicVelocityGain",
  "melodicLayerCompensation",
  "melodicVelocityFilterMultiplier",
  "melodicFilterEnvelopeVelocityScale",
  "melodicPresetStereoWidth",
]) {
  if (
    !melodicEngine.includes(token) ||
    !offline.includes(token)
  ) {
    failures.push(
      "Live/offline melodic expression parity missing: " +
        token +
        ".",
    );
  }
}

if (
  !melodicEngine.includes(
    "context.createStereoPanner()",
  ) ||
  !offline.includes(
    "context.createStereoPanner()",
  )
) {
  failures.push(
    "P6 deterministic melodic stereo voicing is missing.",
  );
}

if (
  !melodicEngine.includes(
    "MAX_ACTIVE_MELODIC_OSCILLATORS",
  ) ||
  !melodicEngine.includes(
    "enforcePolyphony(",
  )
) {
  failures.push(
    "P6 rich melodic presets must retain bounded click-safe polyphony.",
  );
}

for (const token of [
  "drumVelocityGain",
  "drumVelocityTone",
  "drumVelocityImpact",
]) {
  if (
    !drumEngine.includes(token) ||
    !offline.includes(token)
  ) {
    failures.push(
      "Live/offline drum velocity parity missing: " +
        token +
        ".",
    );
  }
}

if (
  !velocity.includes(
    "0.06 + Math.pow(safe, 0.9) * 0.94",
  ) ||
  velocity.includes(
    "0.22 + safe * 0.78",
  )
) {
  failures.push(
    "Expressive drum velocity curve regressed to the old high-floor response.",
  );
}

if (failures.length > 0) {
  throw new Error(
    "Sound-quality contract failed:\n- " +
      failures.join("\n- "),
  );
}

console.log(
  "P6 sound-quality contracts verified: normalized bundled samples, expressive velocity, stereo voicing, and live/export parity.",
);
