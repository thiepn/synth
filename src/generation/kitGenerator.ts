import {
  DRUM_SYNTH_ENGINE_VERSION,
  type DrumMaterialSpec,
  type GenerationProvenance,
  type IntentVector,
  type Kit,
  type Sound,
  type StyleVector,
} from "../domain/contracts";
import {
  DRUM_PADS,
  SEQUENCER_LANES,
  type DrumVoiceId,
} from "../music/foundationPattern";
import { SeededRandom, deriveSeed, shortSeed } from "./prng";

export const KIT_GENERATOR_ID = "kit-generator";
export const KIT_GENERATOR_VERSION = 1;

export type KitDirectionId =
  | "tight"
  | "huge"
  | "dark"
  | "bright"
  | "clean"
  | "dirty"
  | "electronic"
  | "hybrid"
  | "vintage"
  | "industrial"
  | "experimental";

export interface KitDirection {
  id: KitDirectionId;
  label: string;
  code: string;
}

export const KIT_DIRECTIONS: readonly KitDirection[] = [
  { id: "tight", label: "TIGHT", code: "TGT" },
  { id: "huge", label: "HUGE", code: "HUG" },
  { id: "dark", label: "DARK", code: "DRK" },
  { id: "bright", label: "BRIGHT", code: "BRT" },
  { id: "clean", label: "CLEAN", code: "CLN" },
  { id: "dirty", label: "DIRTY", code: "DRT" },
  { id: "electronic", label: "ELECTRONIC", code: "ELC" },
  { id: "hybrid", label: "HYBRID", code: "HYB" },
  { id: "vintage", label: "VINTAGE", code: "VTG" },
  { id: "industrial", label: "INDUSTRIAL", code: "IND" },
  { id: "experimental", label: "EXPERIMENTAL", code: "EXP" },
];

export interface KitDNA {
  brightness: number;
  weight: number;
  tightness: number;
  roughness: number;
  synthetic: number;
  depth: number;
  air: number;
  variance: number;
}

export interface KitGenerationRequest {
  seed: string;
  direction: KitDirectionId;
  intensity: number;
}

export interface KitCoherenceMetrics {
  hatFamilyDistance: number;
  decayHierarchy: number;
  tonalSpread: number;
  materialSpread: number;
  lowEndFoundation: number;
  cymbalAir: number;
  directionFit: number;
}

export interface KitCoherenceValidation {
  valid: boolean;
  score: number;
  reasons: string[];
  metrics: KitCoherenceMetrics;
}

export interface GeneratedKitResult {
  kit: Kit;
  sounds: Sound[];
  specs: Record<DrumVoiceId, DrumMaterialSpec>;
  dna: KitDNA;
  effectiveSeed: string;
  displaySeed: string;
  direction: KitDirectionId;
  attempts: number;
  validation: KitCoherenceValidation;
}

const MAX_ATTEMPTS = 10;

const BASE_DNA: Record<KitDirectionId, KitDNA> = {
  tight: {
    brightness: 0.58,
    weight: 0.62,
    tightness: 0.9,
    roughness: 0.18,
    synthetic: 0.5,
    depth: 0.46,
    air: 0.48,
    variance: 0.18,
  },
  huge: {
    brightness: 0.56,
    weight: 0.9,
    tightness: 0.32,
    roughness: 0.34,
    synthetic: 0.48,
    depth: 0.9,
    air: 0.66,
    variance: 0.24,
  },
  dark: {
    brightness: 0.22,
    weight: 0.82,
    tightness: 0.5,
    roughness: 0.32,
    synthetic: 0.4,
    depth: 0.78,
    air: 0.22,
    variance: 0.2,
  },
  bright: {
    brightness: 0.9,
    weight: 0.48,
    tightness: 0.62,
    roughness: 0.2,
    synthetic: 0.58,
    depth: 0.38,
    air: 0.9,
    variance: 0.18,
  },
  clean: {
    brightness: 0.64,
    weight: 0.58,
    tightness: 0.76,
    roughness: 0.08,
    synthetic: 0.44,
    depth: 0.46,
    air: 0.62,
    variance: 0.12,
  },
  dirty: {
    brightness: 0.5,
    weight: 0.7,
    tightness: 0.44,
    roughness: 0.88,
    synthetic: 0.58,
    depth: 0.62,
    air: 0.46,
    variance: 0.34,
  },
  electronic: {
    brightness: 0.7,
    weight: 0.66,
    tightness: 0.76,
    roughness: 0.28,
    synthetic: 0.95,
    depth: 0.56,
    air: 0.68,
    variance: 0.28,
  },
  hybrid: {
    brightness: 0.58,
    weight: 0.68,
    tightness: 0.62,
    roughness: 0.3,
    synthetic: 0.58,
    depth: 0.64,
    air: 0.56,
    variance: 0.22,
  },
  vintage: {
    brightness: 0.38,
    weight: 0.68,
    tightness: 0.48,
    roughness: 0.5,
    synthetic: 0.36,
    depth: 0.66,
    air: 0.34,
    variance: 0.2,
  },
  industrial: {
    brightness: 0.68,
    weight: 0.84,
    tightness: 0.64,
    roughness: 0.92,
    synthetic: 0.88,
    depth: 0.7,
    air: 0.58,
    variance: 0.34,
  },
  experimental: {
    brightness: 0.6,
    weight: 0.62,
    tightness: 0.46,
    roughness: 0.72,
    synthetic: 0.9,
    depth: 0.62,
    air: 0.62,
    variance: 0.72,
  },
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function variation(
  random: SeededRandom,
  amount: number,
): number {
  return random.range(-amount, amount);
}

function deriveDNA(
  direction: KitDirectionId,
  intensity: number,
  random: SeededRandom,
): KitDNA {
  const base = BASE_DNA[direction];
  const strength = clamp01(intensity);
  const drift = 0.025 + base.variance * 0.08 * strength;

  return {
    brightness: clamp01(base.brightness + variation(random, drift)),
    weight: clamp01(base.weight + variation(random, drift)),
    tightness: clamp01(base.tightness + variation(random, drift)),
    roughness: clamp01(base.roughness + variation(random, drift)),
    synthetic: clamp01(base.synthetic + variation(random, drift)),
    depth: clamp01(base.depth + variation(random, drift)),
    air: clamp01(base.air + variation(random, drift)),
    variance: clamp01(
      base.variance * (0.55 + strength * 0.9) +
        variation(random, drift * 0.35),
    ),
  };
}

function roleNoise(
  random: SeededRandom,
  dna: KitDNA,
  scale = 1,
): number {
  return variation(
    random,
    (0.025 + dna.variance * 0.12) * scale,
  );
}

function baseSpec(
  voice: DrumVoiceId,
): DrumMaterialSpec {
  const defaults: Record<DrumVoiceId, Omit<DrumMaterialSpec, "voice" | "engineVersion">> = {
    kick: {
      impact: 0.78,
      body: 0.82,
      noise: 0.12,
      air: 0.08,
      tone: 0.48,
      decay: 0.58,
      pitch: 0.42,
      character: 0.36,
    },
    snare: {
      impact: 0.68,
      body: 0.62,
      noise: 0.72,
      air: 0.36,
      tone: 0.56,
      decay: 0.46,
      pitch: 0.5,
      character: 0.64,
    },
    clap: {
      impact: 0.58,
      body: 0.18,
      noise: 0.84,
      air: 0.48,
      tone: 0.62,
      decay: 0.42,
      pitch: 0.5,
      character: 0.72,
    },
    closedHat: {
      impact: 0.5,
      body: 0.18,
      noise: 0.54,
      air: 0.76,
      tone: 0.72,
      decay: 0.24,
      pitch: 0.62,
      character: 0.72,
    },
    openHat: {
      impact: 0.42,
      body: 0.2,
      noise: 0.62,
      air: 0.82,
      tone: 0.7,
      decay: 0.68,
      pitch: 0.6,
      character: 0.76,
    },
    tom: {
      impact: 0.62,
      body: 0.82,
      noise: 0.12,
      air: 0.08,
      tone: 0.48,
      decay: 0.58,
      pitch: 0.48,
      character: 0.42,
    },
    percussion: {
      impact: 0.54,
      body: 0.52,
      noise: 0.18,
      air: 0.22,
      tone: 0.58,
      decay: 0.36,
      pitch: 0.58,
      character: 0.66,
    },
    crash: {
      impact: 0.48,
      body: 0.18,
      noise: 0.68,
      air: 0.92,
      tone: 0.72,
      decay: 0.86,
      pitch: 0.62,
      character: 0.82,
    },
  };

  return {
    voice,
    engineVersion: DRUM_SYNTH_ENGINE_VERSION,
    ...defaults[voice],
  };
}

function generateVoiceSpec(
  voice: DrumVoiceId,
  dna: KitDNA,
  direction: KitDirectionId,
  seed: string,
): DrumMaterialSpec {
  const random = new SeededRandom(
    deriveSeed(seed, "voice:" + voice),
  );
  const base = baseSpec(voice);
  const tightDecay = 1 - dna.tightness;
  const rough = dna.roughness;
  const synthetic = dna.synthetic;
  const brightness = dna.brightness;
  const weight = dna.weight;
  const depth = dna.depth;
  const air = dna.air;

  let impact =
    base.impact * 0.42 +
    (0.38 + weight * 0.38 + dna.tightness * 0.2) * 0.58;
  let body =
    base.body * 0.5 +
    (0.22 + weight * 0.5 + depth * 0.28) * 0.5;
  let noise =
    base.noise * 0.5 +
    (0.08 + rough * 0.55 + brightness * 0.17) * 0.5;
  let airValue =
    base.air * 0.48 +
    (air * 0.7 + brightness * 0.3) * 0.52;
  let tone =
    base.tone * 0.35 +
    brightness * 0.65;
  let decay =
    base.decay * 0.42 +
    (0.16 + tightDecay * 0.42 + depth * 0.42) * 0.58;
  let pitch =
    base.pitch * 0.7 +
    (0.5 + (synthetic - 0.5) * 0.18) * 0.3;
  let character =
    base.character * 0.42 +
    (0.18 + synthetic * 0.5 + rough * 0.32) * 0.58;

  if (voice === "kick") {
    impact += weight * 0.12;
    body += weight * 0.14;
    noise *= 0.35 + brightness * 0.5 + rough * 0.3;
    airValue *= 0.2 + brightness * 0.38;
    decay += depth * 0.12 - dna.tightness * 0.1;
    pitch -= weight * 0.08;
    character += depth * 0.14;
  }

  if (voice === "snare") {
    body += weight * 0.06;
    noise += rough * 0.12;
    airValue += brightness * 0.08;
    character += synthetic * 0.08 + rough * 0.08;
  }

  if (voice === "clap") {
    body *= 0.45 + weight * 0.34;
    noise += rough * 0.12 + brightness * 0.06;
    airValue += air * 0.08;
    character += synthetic * 0.08 + dna.variance * 0.1;
  }

  if (voice === "closedHat" || voice === "openHat") {
    body *= 0.45 + depth * 0.2;
    noise += rough * 0.08;
    airValue = Math.max(airValue, 0.36 + air * 0.5);
    tone = clamp01(brightness * 0.75 + air * 0.25);
    pitch = clamp01(0.45 + brightness * 0.22 + synthetic * 0.16);
    character = clamp01(0.38 + synthetic * 0.38 + rough * 0.18);
  }

  if (voice === "closedHat") {
    decay = clamp01(0.08 + (1 - dna.tightness) * 0.25 + depth * 0.08);
  }

  if (voice === "openHat") {
    decay = clamp01(0.44 + (1 - dna.tightness) * 0.3 + depth * 0.18);
  }

  if (voice === "tom") {
    body += weight * 0.12;
    noise *= 0.25 + rough * 0.5;
    airValue *= 0.28 + brightness * 0.28;
    decay += depth * 0.1;
    character += synthetic * 0.08;
  }

  if (voice === "percussion") {
    body = clamp01(body * 0.72);
    noise += rough * 0.09;
    pitch += synthetic * 0.08 + dna.variance * 0.08;
    character += synthetic * 0.16 + dna.variance * 0.1;
  }

  if (voice === "crash") {
    body *= 0.38 + depth * 0.28;
    noise = clamp01(0.35 + rough * 0.35 + brightness * 0.15);
    airValue = clamp01(0.56 + air * 0.34 + brightness * 0.12);
    tone = clamp01(0.42 + brightness * 0.5);
    decay = clamp01(0.62 + depth * 0.28 + (1 - dna.tightness) * 0.14);
    character = clamp01(0.5 + synthetic * 0.28 + rough * 0.12);
  }

  if (direction === "vintage") {
    tone -= 0.08;
    airValue -= 0.12;
    noise += 0.06;
    character -= 0.04;
  } else if (direction === "industrial") {
    noise += 0.12;
    impact += 0.06;
    character += 0.12;
  } else if (direction === "electronic") {
    character += 0.1;
    pitch += voice === "kick" ? -0.03 : 0.05;
  } else if (direction === "clean") {
    noise -= 0.1;
    impact += 0.04;
  } else if (direction === "experimental") {
    pitch += roleNoise(random, dna, 1.8);
    character += roleNoise(random, dna, 1.8);
    decay += roleNoise(random, dna, 1.3);
  }

  const coherentNoise = roleNoise(random, dna);

  return {
    voice,
    engineVersion: DRUM_SYNTH_ENGINE_VERSION,
    impact: clamp01(impact + coherentNoise * 0.6),
    body: clamp01(body + coherentNoise * 0.55),
    noise: clamp01(noise + coherentNoise),
    air: clamp01(airValue + coherentNoise * 0.6),
    tone: clamp01(tone + coherentNoise * 0.5),
    decay: clamp01(decay + coherentNoise * 0.45),
    pitch: clamp01(pitch + coherentNoise * 0.42),
    character: clamp01(character + coherentNoise * 0.65),
  };
}

function intentVector(
  dna: KitDNA,
  intensity: number,
): IntentVector {
  return {
    energy: clamp01(dna.weight * 0.55 + dna.tightness * 0.2 + 0.2),
    density: 0.5,
    complexity: clamp01(0.32 + dna.variance * 0.5),
    syncopation: 0.5,
    space: clamp01(dna.depth),
    swing: 0,
    humanization: 0,
    mutationDistance: clamp01(intensity),
  };
}

function styleVector(direction: KitDirectionId): StyleVector {
  return { ["kit:" + direction]: 1 };
}

function synthSpec(
  voice: DrumVoiceId,
  spec: DrumMaterialSpec,
) {
  return {
    kind: "synth" as const,
    voice:
      voice === "closedHat" || voice === "openHat"
        ? ("hat" as const)
        : voice === "crash"
          ? ("custom" as const)
          : voice,
    engineVersion: DRUM_SYNTH_ENGINE_VERSION,
    params: {
      sourceVoice: voice,
      impact: spec.impact,
      body: spec.body,
      noise: spec.noise,
      air: spec.air,
      tone: spec.tone,
      decay: spec.decay,
      pitch: spec.pitch,
      character: spec.character,
    },
  };
}

function buildDomainKit(
  direction: KitDirectionId,
  effectiveSeed: string,
  specs: Record<DrumVoiceId, DrumMaterialSpec>,
  dna: KitDNA,
  intensity: number,
): { kit: Kit; sounds: Sound[] } {
  const code = shortSeed(effectiveSeed);
  const directionLabel =
    KIT_DIRECTIONS.find((entry) => entry.id === direction)?.label ??
    direction.toUpperCase();

  const provenance: GenerationProvenance = {
    seed: effectiveSeed,
    generatorId: KIT_GENERATOR_ID,
    generatorVersion: KIT_GENERATOR_VERSION,
    style: styleVector(direction),
    intent: intentVector(dna, intensity),
  };

  const sounds: Sound[] = DRUM_PADS.map((pad) => ({
    id: "sound-" + code + "-" + pad.voice,
    name: directionLabel + " " + pad.label,
    spec: synthSpec(pad.voice, specs[pad.voice]),
    provenance: {
      ...provenance,
      style: { ...provenance.style },
      intent: { ...provenance.intent },
    },
  }));

  const soundByVoice = new Map(
    DRUM_PADS.map((pad, index) => [
      pad.voice,
      sounds[index].id,
    ]),
  );

  const kit: Kit = {
    id: "kit-" + code,
    name: directionLabel + " / " + code,
    slots: SEQUENCER_LANES.map((lane) => ({
      id: lane.kitSlotId,
      role: lane.role,
      label: lane.name,
      soundId: soundByVoice.get(lane.voice) ?? "",
    })),
    provenance,
  };

  return { kit, sounds };
}

function abs(a: number, b: number): number {
  return Math.abs(a - b);
}

function average(
  specs: Record<DrumVoiceId, DrumMaterialSpec>,
  key: keyof Pick<
    DrumMaterialSpec,
    "impact" | "body" | "noise" | "air" | "tone" | "decay" | "pitch" | "character"
  >,
): number {
  return (
    DRUM_PADS.reduce(
      (sum, pad) => sum + specs[pad.voice][key],
      0,
    ) / DRUM_PADS.length
  );
}

function directionFit(
  specs: Record<DrumVoiceId, DrumMaterialSpec>,
  direction: KitDirectionId,
  tonalSpread: number,
  materialSpread: number,
): number {
  const impact = average(specs, "impact");
  const body = average(specs, "body");
  const noise = average(specs, "noise");
  const air = average(specs, "air");
  const tone = average(specs, "tone");
  const decay = average(specs, "decay");
  const character = average(specs, "character");

  switch (direction) {
    case "tight":
      return clamp01((1 - decay) * 0.58 + impact * 0.42);
    case "huge":
      return clamp01(body * 0.54 + decay * 0.46);
    case "dark":
      return clamp01((1 - tone) * 0.62 + (1 - air) * 0.38);
    case "bright":
      return clamp01(tone * 0.56 + air * 0.44);
    case "clean":
      return clamp01((1 - noise) * 0.72 + impact * 0.28);
    case "dirty":
      return clamp01(noise * 0.5 + character * 0.5);
    case "electronic":
      return clamp01(character * 0.7 + tone * 0.3);
    case "hybrid":
      return clamp01(
        1 - Math.abs(character - 0.62) * 1.7,
      );
    case "vintage":
      return clamp01(
        (1 - tone) * 0.42 +
          (1 - air) * 0.32 +
          noise * 0.26,
      );
    case "industrial":
      return clamp01(
        noise * 0.38 +
          character * 0.4 +
          impact * 0.22,
      );
    case "experimental":
      return clamp01(
        0.24 +
          tonalSpread * 0.68 +
          materialSpread * 0.72,
      );
  }
}

export function validateGeneratedKit(
  specs: Record<DrumVoiceId, DrumMaterialSpec>,
  direction: KitDirectionId,
): KitCoherenceValidation {
  const closed = specs.closedHat;
  const open = specs.openHat;
  const kick = specs.kick;
  const tom = specs.tom;
  const crash = specs.crash;

  const hatFamilyDistance =
    abs(closed.tone, open.tone) * 0.3 +
    abs(closed.pitch, open.pitch) * 0.3 +
    abs(closed.character, open.character) * 0.4;
  const decayHierarchy = open.decay - closed.decay;
  const tonalValues = DRUM_PADS.map((pad) => specs[pad.voice].tone);
  const tonalSpread = Math.max(...tonalValues) - Math.min(...tonalValues);
  const characterValues = DRUM_PADS.map(
    (pad) => specs[pad.voice].character,
  );
  const materialSpread =
    Math.max(...characterValues) - Math.min(...characterValues);
  const lowEndFoundation =
    kick.body * 0.45 +
    kick.impact * 0.3 +
    tom.body * 0.15 +
    (1 - kick.pitch) * 0.1;
  const cymbalAir =
    closed.air * 0.2 +
    open.air * 0.3 +
    crash.air * 0.5;
  const requestedDirectionFit = directionFit(
    specs,
    direction,
    tonalSpread,
    materialSpread,
  );

  const reasons: string[] = [];
  let score = 100;

  if (hatFamilyDistance > 0.2) {
    reasons.push("hat family lacks common material identity");
    score -= Math.round((hatFamilyDistance - 0.2) * 90);
  }

  if (decayHierarchy < 0.2) {
    reasons.push("open hat does not sustain clearly beyond closed hat");
    score -= 24;
  }

  if (lowEndFoundation < 0.52) {
    reasons.push("kick/tom low-end foundation is too weak");
    score -= 20;
  }

  if (cymbalAir < 0.5) {
    reasons.push("cymbal family is too closed");
    score -= 14;
  }

  if (tonalSpread > 0.72) {
    reasons.push("kit brightness relationship is incoherent");
    score -= 12;
  }

  if (materialSpread > 0.78) {
    reasons.push("voice character spread is excessive");
    score -= 12;
  }

  const minimumDirectionFit =
    direction === "experimental" ? 0.42 : 0.48;
  if (requestedDirectionFit < minimumDirectionFit) {
    reasons.push("kit does not express the requested direction strongly enough");
    score -= Math.round(
      (minimumDirectionFit - requestedDirectionFit) * 80 + 12,
    );
  }

  score = Math.max(0, Math.round(score));

  return {
    valid: score >= 76,
    score,
    reasons,
    metrics: {
      hatFamilyDistance,
      decayHierarchy,
      tonalSpread,
      materialSpread,
      lowEndFoundation,
      cymbalAir,
      directionFit: requestedDirectionFit,
    },
  };
}

export function generateKit(
  requestInput: KitGenerationRequest,
): GeneratedKitResult {
  const intensity = clamp01(requestInput.intensity);
  let best: GeneratedKitResult | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const effectiveSeed = deriveSeed(
      requestInput.seed,
      requestInput.direction + ":attempt:" + attempt,
    );
    const random = new SeededRandom(
      deriveSeed(effectiveSeed, "dna"),
    );
    const dna = deriveDNA(
      requestInput.direction,
      intensity,
      random,
    );

    const specs = Object.fromEntries(
      DRUM_PADS.map((pad) => [
        pad.voice,
        generateVoiceSpec(
          pad.voice,
          dna,
          requestInput.direction,
          effectiveSeed,
        ),
      ]),
    ) as Record<DrumVoiceId, DrumMaterialSpec>;

    const validation = validateGeneratedKit(
      specs,
      requestInput.direction,
    );
    const domain = buildDomainKit(
      requestInput.direction,
      effectiveSeed,
      specs,
      dna,
      intensity,
    );

    const result: GeneratedKitResult = {
      ...domain,
      specs,
      dna,
      effectiveSeed,
      displaySeed: shortSeed(effectiveSeed),
      direction: requestInput.direction,
      attempts: attempt + 1,
      validation,
    };

    if (!best || validation.score > best.validation.score) {
      best = result;
    }

    if (validation.valid) {
      return result;
    }
  }

  if (!best) {
    throw new Error("Kit Generator failed to produce a candidate.");
  }

  return best;
}

export const KIT_GENERATOR_META = Object.freeze({
  generatorId: KIT_GENERATOR_ID,
  generatorVersion: KIT_GENERATOR_VERSION,
  maxAttempts: MAX_ATTEMPTS,
  directions: KIT_DIRECTIONS.map((entry) => entry.id),
});
