import {
  DRUM_SYNTH_ENGINE_VERSION,
  type DrumMaterialSpec,
  type GenerationProvenance,
  type IntentVector,
  type Kit,
  type KitDNA,
  type Sound,
  type StyleVector,
} from "../domain/contracts";
import {
  DRUM_PADS,
  SEQUENCER_LANES,
  type DrumVoiceId,
} from "../music/foundationPattern";
import {
  validateGeneratedKit,
  type KitCoherenceValidation,
  type KitDirectionId,
} from "./kitGenerator";
import { SeededRandom, deriveSeed, shortSeed } from "./prng";

export const KIT_MUTATION_ID = "kit-mutation";
export const KIT_MUTATION_VERSION = 1;

export type KitSimilarityId =
  | "verySimilar"
  | "similar"
  | "different"
  | "wild";

export interface KitSimilarityDefinition {
  id: KitSimilarityId;
  label: string;
  code: string;
  distance: number;
}

export const KIT_SIMILARITIES: readonly KitSimilarityDefinition[] = [
  { id: "verySimilar", label: "VERY SIMILAR", code: "VS", distance: 0.14 },
  { id: "similar", label: "SIMILAR", code: "SIM", distance: 0.3 },
  { id: "different", label: "DIFFERENT", code: "DIF", distance: 0.58 },
  { id: "wild", label: "WILD", code: "WLD", distance: 0.88 },
];

export type KitMutationId =
  | "darker"
  | "brighter"
  | "heavier"
  | "cleaner"
  | "dirtier"
  | "tighter"
  | "bigger"
  | "stranger";

export interface KitMutationDefinition {
  id: KitMutationId;
  label: string;
  code: string;
  description: string;
}

export const KIT_MUTATIONS: readonly KitMutationDefinition[] = [
  {
    id: "darker",
    label: "DARKER",
    code: "DRK",
    description: "Lower brightness and air while preserving material weight.",
  },
  {
    id: "brighter",
    label: "BRIGHTER",
    code: "BRT",
    description: "Increase tone, air, and transient definition.",
  },
  {
    id: "heavier",
    label: "HEAVIER",
    code: "HVY",
    description: "Increase body, impact, depth, and low-end authority.",
  },
  {
    id: "cleaner",
    label: "CLEANER",
    code: "CLN",
    description: "Reduce noise and rough character while sharpening impact.",
  },
  {
    id: "dirtier",
    label: "DIRTIER",
    code: "DRT",
    description: "Increase noise, roughness, and nonlinear material character.",
  },
  {
    id: "tighter",
    label: "TIGHTER",
    code: "TGT",
    description: "Shorten tails and emphasize controlled transients.",
  },
  {
    id: "bigger",
    label: "BIGGER",
    code: "BIG",
    description: "Increase body, depth, air, and sustain coherently.",
  },
  {
    id: "stranger",
    label: "STRANGER",
    code: "STR",
    description: "Increase synthetic variance and unusual timbral relationships.",
  },
];

export interface KitMutationSource {
  specs: Record<DrumVoiceId, DrumMaterialSpec>;
  kit?: Kit;
  sounds?: Sound[];
  dna?: KitDNA;
  direction?: string;
  seed?: string;
}

export interface KitMutationRequest {
  source: KitMutationSource;
  seed: string;
  mutation: KitMutationId;
  similarity: KitSimilarityId;
  lockedVoices?: readonly DrumVoiceId[];
  targetVoice?: DrumVoiceId;
}

export interface KitMorphRequest {
  a: KitMutationSource;
  b: KitMutationSource;
  amount: number;
  lockedVoices?: readonly DrumVoiceId[];
  lockedSourceSpecs?: Record<DrumVoiceId, DrumMaterialSpec>;
  seed: string;
}

export interface KitMutationResult {
  specs: Record<DrumVoiceId, DrumMaterialSpec>;
  kit: Kit;
  sounds: Sound[];
  dna: KitDNA;
  effectiveSeed: string;
  displaySeed: string;
  mutationId: string;
  direction: KitDirectionId;
  distance: number;
  attempts: number;
  changedVoices: DrumVoiceId[];
  validation: KitCoherenceValidation;
}

const MAX_MUTATION_ATTEMPTS = 8;

const MATERIAL_KEYS = [
  "impact",
  "body",
  "noise",
  "air",
  "tone",
  "decay",
  "pitch",
  "character",
] as const;

type MaterialKey = (typeof MATERIAL_KEYS)[number];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function cloneSpec(spec: DrumMaterialSpec): DrumMaterialSpec {
  return { ...spec };
}

function cloneSpecs(
  specs: Record<DrumVoiceId, DrumMaterialSpec>,
): Record<DrumVoiceId, DrumMaterialSpec> {
  return Object.fromEntries(
    DRUM_PADS.map((pad) => [
      pad.voice,
      cloneSpec(specs[pad.voice]),
    ]),
  ) as Record<DrumVoiceId, DrumMaterialSpec>;
}

function average(
  specs: Record<DrumVoiceId, DrumMaterialSpec>,
  key: MaterialKey,
): number {
  return (
    DRUM_PADS.reduce(
      (sum, pad) => sum + specs[pad.voice][key],
      0,
    ) / DRUM_PADS.length
  );
}

export function inferKitDNA(
  specs: Record<DrumVoiceId, DrumMaterialSpec>,
): KitDNA {
  const tone = average(specs, "tone");
  const air = average(specs, "air");
  const body = average(specs, "body");
  const impact = average(specs, "impact");
  const noise = average(specs, "noise");
  const character = average(specs, "character");
  const decay = average(specs, "decay");

  const pitchValues = DRUM_PADS.map(
    (pad) => specs[pad.voice].pitch,
  );
  const characterValues = DRUM_PADS.map(
    (pad) => specs[pad.voice].character,
  );
  const spread =
    (Math.max(...pitchValues) - Math.min(...pitchValues)) * 0.42 +
    (Math.max(...characterValues) - Math.min(...characterValues)) * 0.58;

  return {
    brightness: clamp01(tone * 0.64 + air * 0.36),
    weight: clamp01(body * 0.62 + impact * 0.38),
    tightness: clamp01(1 - decay * 0.76 + impact * 0.24),
    roughness: clamp01(noise * 0.56 + character * 0.44),
    synthetic: clamp01(character * 0.7 + average(specs, "pitch") * 0.3),
    depth: clamp01(body * 0.52 + decay * 0.48),
    air: clamp01(air),
    variance: clamp01(spread),
  };
}

function normalizeDirection(value: string | undefined): KitDirectionId {
  switch (value) {
    case "tight":
    case "huge":
    case "dark":
    case "bright":
    case "clean":
    case "dirty":
    case "electronic":
    case "hybrid":
    case "vintage":
    case "industrial":
    case "experimental":
      return value;
    default:
      return "hybrid";
  }
}

function similarityDistance(id: KitSimilarityId): number {
  return (
    KIT_SIMILARITIES.find((entry) => entry.id === id)?.distance ??
    0.3
  );
}

function mutateSpec(
  source: DrumMaterialSpec,
  voice: DrumVoiceId,
  mutation: KitMutationId,
  distance: number,
  random: SeededRandom,
): DrumMaterialSpec {
  const next = cloneSpec(source);
  const a = clamp01(distance);
  const shift = (key: MaterialKey, delta: number) => {
    next[key] = clamp01(next[key] + delta * a);
  };

  switch (mutation) {
    case "darker":
      shift("tone", -0.26);
      shift("air", -0.2);
      shift("body", 0.06);
      if (voice === "kick" || voice === "tom") shift("pitch", -0.05);
      break;
    case "brighter":
      shift("tone", 0.28);
      shift("air", 0.24);
      shift("impact", 0.05);
      if (voice === "closedHat" || voice === "openHat" || voice === "crash") {
        shift("pitch", 0.06);
      }
      break;
    case "heavier":
      shift("body", 0.26);
      shift("impact", 0.17);
      shift("decay", 0.08);
      if (voice === "kick" || voice === "tom") {
        shift("pitch", -0.09);
        shift("character", 0.08);
      }
      break;
    case "cleaner":
      shift("noise", -0.3);
      shift("character", -0.12);
      shift("impact", 0.08);
      shift("tone", 0.04);
      break;
    case "dirtier":
      shift("noise", 0.28);
      shift("character", 0.22);
      shift("impact", 0.04);
      shift("air", 0.03);
      break;
    case "tighter":
      shift("decay", -0.3);
      shift("impact", 0.12);
      shift("body", -0.04);
      break;
    case "bigger":
      shift("body", 0.2);
      shift("decay", 0.24);
      shift("air", 0.11);
      shift("impact", 0.08);
      break;
    case "stranger": {
      const scale = 0.16 + a * 0.22;
      shift("pitch", random.range(-scale, scale));
      shift("character", random.range(-scale, scale));
      shift("tone", random.range(-scale * 0.7, scale * 0.7));
      shift("decay", random.range(-scale * 0.55, scale * 0.55));
      shift("noise", random.range(-scale * 0.45, scale * 0.55));
      break;
    }
  }

  const micro = 0.012 + a * 0.035;
  for (const key of MATERIAL_KEYS) {
    if (mutation === "stranger" && ["pitch", "character", "tone", "decay", "noise"].includes(key)) {
      continue;
    }
    next[key] = clamp01(next[key] + random.range(-micro, micro));
  }

  next.voice = voice;
  next.engineVersion = DRUM_SYNTH_ENGINE_VERSION;
  return next;
}

function styleVector(direction: KitDirectionId): StyleVector {
  return { ["kit:" + direction]: 1 };
}

function intentVector(
  dna: KitDNA,
  distance: number,
): IntentVector {
  return {
    energy: clamp01(dna.weight * 0.55 + dna.tightness * 0.18 + 0.2),
    density: 0.5,
    complexity: clamp01(0.3 + dna.variance * 0.56),
    syncopation: 0.5,
    space: clamp01(dna.depth),
    swing: 0,
    humanization: 0,
    mutationDistance: clamp01(distance),
  };
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

function buildArtifacts(
  specs: Record<DrumVoiceId, DrumMaterialSpec>,
  dna: KitDNA,
  seed: string,
  direction: KitDirectionId,
  mutationId: string,
  distance: number,
  sourceKit?: Kit,
): { kit: Kit; sounds: Sound[] } {
  const code = shortSeed(seed);
  const provenance: GenerationProvenance = {
    seed,
    generatorId: KIT_MUTATION_ID,
    generatorVersion: KIT_MUTATION_VERSION,
    sourceEntityId: sourceKit?.id,
    mutationId,
    styleDnaId: sourceKit?.provenance?.styleDnaId,
    styleDnaVersion: sourceKit?.provenance?.styleDnaVersion,
    style: sourceKit?.provenance?.style
      ? {
          ...sourceKit.provenance.style,
          ...styleVector(direction),
        }
      : styleVector(direction),
    intent: intentVector(dna, distance),
  };

  const sounds: Sound[] = DRUM_PADS.map((pad) => ({
    id: "sound-mut-" + code + "-" + pad.voice,
    name:
      (sourceKit?.name ?? direction.toUpperCase()) +
      " " +
      pad.label,
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
    id: "kit-mut-" + code,
    name:
      mutationId
        .replace("kit:", "")
        .replace("voice:", "")
        .replace("morph:", "")
        .toUpperCase() +
      " / " +
      code,
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

function changedVoices(
  before: Record<DrumVoiceId, DrumMaterialSpec>,
  after: Record<DrumVoiceId, DrumMaterialSpec>,
): DrumVoiceId[] {
  return DRUM_PADS.map((pad) => pad.voice).filter((voice) =>
    MATERIAL_KEYS.some(
      (key) => Math.abs(before[voice][key] - after[voice][key]) > 0.0001,
    ),
  );
}

function assertLockedVoicesPreserved(
  before: Record<DrumVoiceId, DrumMaterialSpec>,
  after: Record<DrumVoiceId, DrumMaterialSpec>,
  locked: ReadonlySet<DrumVoiceId>,
): void {
  for (const voice of locked) {
    for (const key of MATERIAL_KEYS) {
      if (before[voice][key] !== after[voice][key]) {
        throw new Error(
          "Kit mutation invariant failed: locked voice changed: " +
            voice +
            "." +
            key,
        );
      }
    }
  }
}

function validationDirection(
  source: KitMutationSource,
  mutation: KitMutationId,
): KitDirectionId {
  switch (mutation) {
    case "darker":
      return "dark";
    case "brighter":
      return "bright";
    case "heavier":
    case "bigger":
      return "huge";
    case "cleaner":
      return "clean";
    case "dirtier":
      return "dirty";
    case "tighter":
      return "tight";
    case "stranger":
      return "experimental";
    default:
      return normalizeDirection(source.direction);
  }
}

export function mutateKit(
  request: KitMutationRequest,
): KitMutationResult {
  const distance = similarityDistance(request.similarity);
  const locked = new Set(request.lockedVoices ?? []);
  const targets = request.targetVoice
    ? [request.targetVoice]
    : DRUM_PADS.map((pad) => pad.voice);
  const mutableTargets = targets.filter((voice) => !locked.has(voice));

  if (mutableTargets.length === 0) {
    throw new Error(
      request.targetVoice
        ? "Selected sound is locked."
        : "All sounds are locked.",
    );
  }

  const sourceDirection = normalizeDirection(request.source.direction);
  const targetDirection = validationDirection(
    request.source,
    request.mutation,
  );
  const direction =
    request.targetVoice || distance < 0.5
      ? sourceDirection
      : targetDirection;

  let best: KitMutationResult | null = null;

  for (let attempt = 0; attempt < MAX_MUTATION_ATTEMPTS; attempt += 1) {
    const effectiveSeed = deriveSeed(
      request.seed,
      request.mutation +
        ":" +
        request.similarity +
        ":attempt:" +
        attempt +
        ":v" +
        KIT_MUTATION_VERSION,
    );
    const specs = cloneSpecs(request.source.specs);

    for (const voice of mutableTargets) {
      specs[voice] = mutateSpec(
        request.source.specs[voice],
        voice,
        request.mutation,
        distance,
        new SeededRandom(
          deriveSeed(effectiveSeed, "voice:" + voice),
        ),
      );
    }

    assertLockedVoicesPreserved(
      request.source.specs,
      specs,
      locked,
    );

    const targetDna = inferKitDNA(specs);
    const validation = validateGeneratedKit(
      specs,
      direction,
      request.targetVoice
        ? { requireDirectionFit: false }
        : undefined,
    );
    const mutationId = request.targetVoice
      ? "voice:" + request.targetVoice + ":" + request.mutation
      : "kit:" + request.mutation;
    const artifacts = buildArtifacts(
      specs,
      targetDna,
      effectiveSeed,
      direction,
      mutationId,
      distance,
      request.source.kit,
    );

    const result: KitMutationResult = {
      ...artifacts,
      specs,
      dna: targetDna,
      effectiveSeed,
      displaySeed: shortSeed(effectiveSeed),
      mutationId,
      direction,
      distance,
      attempts: attempt + 1,
      changedVoices: changedVoices(request.source.specs, specs),
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
    throw new Error("Kit mutation failed to produce a candidate.");
  }

  return best;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function morphDna(
  a: KitDNA,
  b: KitDNA,
  amount: number,
): KitDNA {
  const t = clamp01(amount);

  return {
    brightness: lerp(a.brightness, b.brightness, t),
    weight: lerp(a.weight, b.weight, t),
    tightness: lerp(a.tightness, b.tightness, t),
    roughness: lerp(a.roughness, b.roughness, t),
    synthetic: lerp(a.synthetic, b.synthetic, t),
    depth: lerp(a.depth, b.depth, t),
    air: lerp(a.air, b.air, t),
    variance: lerp(a.variance, b.variance, t),
  };
}

export function morphKitSpecs(
  request: KitMorphRequest,
): KitMutationResult {
  const amount = clamp01(request.amount);
  const effectiveSeed = deriveSeed(
    request.seed,
    "morph:" +
      Math.round(amount * 1000) +
      ":v" +
      KIT_MUTATION_VERSION,
  );
  const locked = new Set(request.lockedVoices ?? []);
  if (locked.size >= DRUM_PADS.length) {
    throw new Error("All sounds are locked.");
  }

  const specs = {} as Record<DrumVoiceId, DrumMaterialSpec>;

  for (const pad of DRUM_PADS) {
    const voice = pad.voice;
    const a = request.a.specs[voice];
    const b = request.b.specs[voice];

    if (locked.has(voice)) {
      specs[voice] = cloneSpec(
        request.lockedSourceSpecs?.[voice] ?? a,
      );
      continue;
    }

    specs[voice] = {
      voice,
      engineVersion: DRUM_SYNTH_ENGINE_VERSION,
      impact: lerp(a.impact, b.impact, amount),
      body: lerp(a.body, b.body, amount),
      noise: lerp(a.noise, b.noise, amount),
      air: lerp(a.air, b.air, amount),
      tone: lerp(a.tone, b.tone, amount),
      decay: lerp(a.decay, b.decay, amount),
      pitch: lerp(a.pitch, b.pitch, amount),
      character: lerp(a.character, b.character, amount),
    };
  }

  assertLockedVoicesPreserved(
    request.lockedSourceSpecs ?? request.a.specs,
    specs,
    locked,
  );

  const aDna = request.a.dna ?? inferKitDNA(request.a.specs);
  const bDna = request.b.dna ?? inferKitDNA(request.b.specs);
  const dna = morphDna(aDna, bDna, amount);
  const direction =
    amount < 0.5
      ? normalizeDirection(request.a.direction)
      : normalizeDirection(request.b.direction);
  const validation = validateGeneratedKit(
    specs,
    direction,
    { requireDirectionFit: false },
  );
  const mutationId =
    "morph:" +
    (request.a.kit?.id ?? "A") +
    ":" +
    (request.b.kit?.id ?? "B");
  const artifacts = buildArtifacts(
    specs,
    dna,
    effectiveSeed,
    direction,
    mutationId,
    amount,
    amount < 0.5 ? request.a.kit : request.b.kit,
  );

  return {
    ...artifacts,
    specs,
    dna,
    effectiveSeed,
    displaySeed: shortSeed(effectiveSeed),
    mutationId,
    direction,
    distance: amount,
    attempts: 1,
    changedVoices: changedVoices(
      request.a.specs,
      specs,
    ).filter((voice) => !locked.has(voice)),
    validation,
  };
}

export const KIT_MUTATION_META = Object.freeze({
  generatorId: KIT_MUTATION_ID,
  generatorVersion: KIT_MUTATION_VERSION,
  maxMutationAttempts: MAX_MUTATION_ATTEMPTS,
  similarities: KIT_SIMILARITIES.map((entry) => entry.id),
  mutations: KIT_MUTATIONS.map((entry) => entry.id),
});
