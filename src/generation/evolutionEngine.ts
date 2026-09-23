import type {
  BeatFamilyRole,
  Pattern,
} from "../domain/contracts";
import type {
  BeatGenerationIntent,
  BeatStyleId,
  BeatValidation,
} from "./beatGenerator";
import {
  generateBeatFamily,
  type BeatFamilyGenerationResult,
  type BeatFamilyPattern,
} from "./beatFamilyGenerator";
import {
  rerollBeat,
  type BeatVariationResult,
} from "./beatVariation";
import { deriveSeed, shortSeed } from "./prng";

export const EVOLVE_ENGINE_ID = "evolve";
export const EVOLVE_ENGINE_VERSION = 1;

export type EvolutionBars = 4 | 8 | 16 | 32 | 64;
export type EvolutionArcId =
  | "steady"
  | "rise"
  | "wave"
  | "contrast";

export type EvolutionSegmentRole =
  | "anchor"
  | "variation"
  | "build"
  | "breakdown"
  | "drop"
  | "fill"
  | "return";

export interface EvolutionRequest {
  source: Pattern;
  seed: string;
  bars: EvolutionBars;
  intensity: number;
  arc: EvolutionArcId;
  style: BeatStyleId;
  intent: BeatGenerationIntent;
  bpm: number;
}

export interface EvolutionSegment {
  id: string;
  index: number;
  startTick: number;
  lengthTicks: number;
  energy: number;
  novelty: number;
  role: EvolutionSegmentRole;
  familyRole: BeatFamilyRole;
  pattern: Pattern;
  validation: BeatValidation;
  changedStepCount: number;
}

export interface EvolutionPlan {
  id: string;
  name: string;
  seed: string;
  displaySeed: string;
  bars: EvolutionBars;
  intensity: number;
  arc: EvolutionArcId;
  sourcePatternId: string;
  totalTicks: number;
  family: BeatFamilyGenerationResult;
  segments: EvolutionSegment[];
  coherenceScore: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function energyAt(
  index: number,
  bars: number,
  arc: EvolutionArcId,
): number {
  const t = bars <= 1 ? 0 : index / (bars - 1);

  switch (arc) {
    case "rise":
      return clamp01(
        0.34 +
          t * 0.62 -
          (index > 0 && index % 8 === 0 ? 0.18 : 0),
      );
    case "wave":
      return clamp01(
        0.58 +
          Math.sin(t * Math.PI * 4 - Math.PI / 2) * 0.28,
      );
    case "contrast": {
      const phrase = Math.floor(index / 4);
      const high = phrase % 2 === 1;
      const local = (index % 4) / 3;
      return clamp01(
        high
          ? 0.72 + local * 0.2
          : 0.34 + local * 0.16,
      );
    }
    case "steady":
    default:
      return clamp01(
        0.56 +
          Math.sin(t * Math.PI * 2) * 0.08,
      );
  }
}

function familyEntry(
  family: BeatFamilyGenerationResult,
  role: BeatFamilyRole,
): BeatFamilyPattern {
  return (
    family.patterns.find((entry) => entry.role === role) ??
    family.patterns[0]
  )!;
}

function chooseFamilyRole(input: {
  index: number;
  bars: number;
  energy: number;
  previousEnergy: number;
  intensity: number;
}): { familyRole: BeatFamilyRole; role: EvolutionSegmentRole } {
  const { index, bars, energy, previousEnergy, intensity } = input;
  const phraseEnd = index > 0 && (index + 1) % 4 === 0;
  const returnPoint = index > 0 && index % 8 === 0;
  const final = index === bars - 1;

  if (index === 0) {
    return { familyRole: "core", role: "anchor" };
  }

  if (returnPoint && !final) {
    return { familyRole: "core", role: "return" };
  }

  if (phraseEnd && intensity > 0.18 && !final) {
    return {
      familyRole: (Math.floor(index / 4) % 2 === 0 ? "fill1" : "fill2"),
      role: "fill",
    };
  }

  if (energy <= 0.4) {
    return { familyRole: "breakdown", role: "breakdown" };
  }

  if (energy >= 0.88) {
    return { familyRole: "drop", role: "drop" };
  }

  if (energy > previousEnergy + 0.06 && energy >= 0.66) {
    return { familyRole: "build", role: "build" };
  }

  if (energy >= 0.7) {
    return { familyRole: "bVariation", role: "variation" };
  }

  if (index % 3 === 0) {
    return { familyRole: "aVariation", role: "variation" };
  }

  return { familyRole: "core", role: "variation" };
}

function variationDistance(
  index: number,
  intensity: number,
  role: EvolutionSegmentRole,
  energy: number,
): number {
  if (role === "anchor" || role === "return") return 0;
  if (role === "fill") return 0;

  const phrasePosition = (index % 4) / 3;
  const roleScale =
    role === "drop"
      ? 0.7
      : role === "breakdown"
        ? 0.52
        : role === "build"
          ? 0.62
          : 0.42;

  return clamp01(
    intensity *
      (0.08 +
        phrasePosition * 0.16 +
        roleScale * 0.18 +
        Math.abs(energy - 0.55) * 0.14),
  );
}

function decorateSegmentPattern(
  pattern: Pattern,
  source: Pattern,
  request: EvolutionRequest,
  index: number,
  familyRole: BeatFamilyRole,
  novelty: number,
): Pattern {
  const next: Pattern = {
    ...pattern,
    meter: { ...pattern.meter },
    lanes: pattern.lanes.map((lane) => ({
      ...lane,
      events: lane.events.map((event) => ({
        ...event,
        generatorTags: event.generatorTags
          ? [...event.generatorTags]
          : undefined,
        grooveBase: event.grooveBase
          ? { ...event.grooveBase }
          : undefined,
      })),
      lock: { ...lane.lock },
      regionLocks: lane.regionLocks?.map((lock) => ({ ...lock })),
    })),
    groove: pattern.groove
      ? {
          ...pattern.groove,
          roleTimingOffsetUs: pattern.groove.roleTimingOffsetUs
            ? { ...pattern.groove.roleTimingOffsetUs }
            : undefined,
        }
      : undefined,
    provenance: pattern.provenance
      ? {
          ...pattern.provenance,
          style: { ...pattern.provenance.style },
          intent: { ...pattern.provenance.intent },
        }
      : undefined,
  };

  const segmentSeed = deriveSeed(
    request.seed,
    "segment:" + index,
  );
  next.id =
    "pattern-evolve-" +
    String(index).padStart(2, "0") +
    "-" +
    shortSeed(segmentSeed);
  next.name =
    "EVOLVE " +
    String(index + 1).padStart(2, "0") +
    " / " +
    familyRole.toUpperCase();

  next.provenance = {
    seed: segmentSeed,
    generatorId: EVOLVE_ENGINE_ID,
    generatorVersion: EVOLVE_ENGINE_VERSION,
    sourceEntityId: source.id,
    mutationId:
      "evolve:" +
      request.arc +
      ":" +
      index +
      ":" +
      Math.round(novelty * 100),
    styleDnaId: pattern.provenance?.styleDnaId ?? request.style,
    styleDnaVersion: pattern.provenance?.styleDnaVersion,
    familyId: pattern.provenance?.familyId,
    familyRole,
    style: { ...(pattern.provenance?.style ?? { [request.style]: 1 }) },
    intent: {
      ...(pattern.provenance?.intent ?? {
        energy: request.intent.energy,
        density: request.intent.density,
        complexity: request.intent.complexity,
        syncopation: request.intent.syncopation,
        space: 1 - request.intent.density,
        swing: request.intent.swing,
        humanization: source.groove?.humanization ?? 0,
        mutationDistance: novelty,
      }),
      mutationDistance: novelty,
    },
  };

  return next;
}

function evolvedPattern(
  base: BeatFamilyPattern,
  request: EvolutionRequest,
  index: number,
  novelty: number,
): {
  pattern: Pattern;
  validation: BeatValidation;
  changedStepCount: number;
} {
  if (novelty <= 0.001) {
    return {
      pattern: base.pattern,
      validation: base.validation,
      changedStepCount: 0,
    };
  }

  let result: BeatVariationResult | undefined;

  try {
    result = rerollBeat({
      source: base.pattern,
      seed: deriveSeed(
        request.seed,
        "bar-variation:" + index,
      ),
      style: request.style,
      intent: {
        ...request.intent,
        energy: clamp01(
          request.intent.energy * 0.55 +
            energyAt(index, request.bars, request.arc) * 0.45,
        ),
      },
      distance: novelty,
      bpm: request.bpm,
    });
  } catch {
    result = undefined;
  }

  if (!result?.accepted) {
    return {
      pattern: base.pattern,
      validation: base.validation,
      changedStepCount: 0,
    };
  }

  return {
    pattern: result.pattern,
    validation: result.validation,
    changedStepCount: result.changedStepCount,
  };
}

export function generateEvolutionPlan(
  request: EvolutionRequest,
): EvolutionPlan {
  const intensity = clamp01(request.intensity);
  const family = generateBeatFamily({
    source: request.source,
    seed: deriveSeed(request.seed, "family"),
    style: request.style,
    intent: request.intent,
    bpm: request.bpm,
  });

  if (!family.valid || family.patterns.length === 0) {
    throw new Error(
      "EVOLVE could not build a coherent source family: " +
        (family.reasons[0] ?? "family validation failed"),
    );
  }

  const segments: EvolutionSegment[] = [];
  let previousEnergy = energyAt(
    0,
    request.bars,
    request.arc,
  );

  for (let index = 0; index < request.bars; index += 1) {
    const energy = energyAt(
      index,
      request.bars,
      request.arc,
    );
    const choice = chooseFamilyRole({
      index,
      bars: request.bars,
      energy,
      previousEnergy,
      intensity,
    });
    const base = familyEntry(family, choice.familyRole);
    const novelty = variationDistance(
      index,
      intensity,
      choice.role,
      energy,
    );
    const evolved = evolvedPattern(
      base,
      request,
      index,
      novelty,
    );
    const pattern = decorateSegmentPattern(
      evolved.pattern,
      request.source,
      request,
      index,
      choice.familyRole,
      novelty,
    );

    segments.push({
      id:
        "evolve-segment-" +
        String(index).padStart(2, "0") +
        "-" +
        shortSeed(deriveSeed(request.seed, "segment:" + index)),
      index,
      startTick: index * request.source.lengthTicks,
      lengthTicks: request.source.lengthTicks,
      energy,
      novelty,
      role: choice.role,
      familyRole: choice.familyRole,
      pattern,
      validation: evolved.validation,
      changedStepCount: evolved.changedStepCount,
    });

    previousEnergy = energy;
  }

  const averageQuality =
    segments.reduce(
      (sum, segment) => sum + segment.validation.score,
      0,
    ) / Math.max(1, segments.length);
  const coherenceScore = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        family.coherenceScore * 0.6 +
          averageQuality * 0.4,
      ),
    ),
  );

  return {
    id:
      "evolution-" +
      shortSeed(
        [
          request.seed,
          request.source.id,
          request.arc,
          request.bars,
          request.intensity.toFixed(4),
        ].join("|"),
      ),
    name:
      "EVOLVE " +
      request.arc.toUpperCase() +
      " / " +
      request.bars +
      " BARS",
    seed: request.seed,
    displaySeed: shortSeed(request.seed),
    bars: request.bars,
    intensity,
    arc: request.arc,
    sourcePatternId: request.source.id,
    totalTicks: request.source.lengthTicks * request.bars,
    family,
    segments,
    coherenceScore,
  };
}
