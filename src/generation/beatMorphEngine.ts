import type {
  GrooveProfile,
  IntentVector,
  Pattern,
  PatternLane,
  StepEvent,
  StyleVector,
} from "../domain/contracts";
import {
  FOUNDATION_STEP_TICKS,
} from "../music/foundationPattern";
import {
  STYLE_DNA_VERSION,
  getStyleDNA,
  isStyleDNAId,
  styleIdFromVector,
  type StyleDNAId,
  type StyleDNAProfile,
} from "../style/styleDNA";
import {
  deriveRhythmGlyph,
} from "../visual/rhythmGlyph";
import {
  rhythmGlyphDistance,
  type RhythmGlyphDistance,
} from "../visual/rhythmGlyphSimilarity";
import {
  rerollBeat,
} from "./beatVariation";
import type {
  BeatGenerationIntent,
  BeatStyleId,
  BeatValidation,
} from "./beatGenerator";
import {
  SeededRandom,
  deriveSeed,
  shortSeed,
} from "./prng";

export const BEAT_MORPH_ENGINE_ID = "beat-morph";
export const BEAT_MORPH_ENGINE_VERSION = 1;
export const BEAT_REMIX_ENGINE_ID = "beat-remix";
export const BEAT_REMIX_ENGINE_VERSION = 1;

export interface BeatMorphDimensions {
  rhythm: number;
  dynamics: number;
  timing: number;
  groove: number;
  styleDNA: number;
}

export interface BeatMorphRequest {
  a: Pattern;
  b: Pattern;
  seed: string;
  dimensions: BeatMorphDimensions;
}

export interface BeatMorphResult {
  pattern: Pattern;
  dimensions: BeatMorphDimensions;
  styleA?: StyleDNAId;
  styleB?: StyleDNAId;
  distanceFromA: RhythmGlyphDistance;
  distanceFromB: RhythmGlyphDistance;
  sharedEventCount: number;
  aOnlyEventCount: number;
  bOnlyEventCount: number;
}

export interface BeatRemixRequest {
  source: Pattern;
  seed: string;
  targetStyle: BeatStyleId;
  intent: BeatGenerationIntent;
  amount: number;
  bpm: number;
}

export interface BeatRemixResult {
  accepted: boolean;
  pattern: Pattern;
  targetStyle: BeatStyleId;
  amount: number;
  validation: BeatValidation;
  changedLaneIds: string[];
  changedStepCount: number;
  effectiveSeed: string;
  displaySeed: string;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function lerp(a: number, b: number, amount: number): number {
  return a + (b - a) * clamp01(amount);
}

function cloneEvent(event: StepEvent): StepEvent {
  return {
    ...event,
    generatorTags: event.generatorTags
      ? [...event.generatorTags]
      : undefined,
    grooveBase: event.grooveBase
      ? { ...event.grooveBase }
      : undefined,
  };
}

function cloneLane(lane: PatternLane): PatternLane {
  return {
    ...lane,
    events: lane.events.map(cloneEvent),
    lock: { ...lane.lock },
    regionLocks: lane.regionLocks?.map((lock) => ({ ...lock })),
  };
}

function clonePattern(pattern: Pattern): Pattern {
  return {
    ...pattern,
    meter: { ...pattern.meter },
    lanes: pattern.lanes.map(cloneLane),
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
}

export function styleIdForPattern(
  pattern: Pattern,
): StyleDNAId | undefined {
  const explicit = pattern.provenance?.styleDnaId;
  if (explicit && isStyleDNAId(explicit)) {
    return explicit;
  }
  return styleIdFromVector(pattern.provenance?.style);
}

export function assertMorphCompatible(
  a: Pattern,
  b: Pattern,
): void {
  if (a.ppq !== b.ppq) {
    throw new Error("Morph endpoints must use the same PPQ.");
  }
  if (
    a.meter.numerator !== b.meter.numerator ||
    a.meter.denominator !== b.meter.denominator
  ) {
    throw new Error("Morph endpoints must use the same meter.");
  }
  if (a.lengthTicks !== b.lengthTicks) {
    throw new Error("Morph endpoints must have the same Pattern length.");
  }

  const bLaneIds = new Set(b.lanes.map((lane) => lane.id));
  const missing = a.lanes.find((lane) => !bLaneIds.has(lane.id));
  if (missing) {
    throw new Error(
      "Morph endpoint B is missing lane " + missing.id + ".",
    );
  }
}

function normalizedDimensions(
  input: BeatMorphDimensions,
): BeatMorphDimensions {
  return {
    rhythm: clamp01(input.rhythm),
    dynamics: clamp01(input.dynamics),
    timing: clamp01(input.timing),
    groove: clamp01(input.groove),
    styleDNA: clamp01(input.styleDNA),
  };
}

function eventMap(lane: PatternLane): Map<number, StepEvent> {
  return new Map(
    lane.events.map((event) => [
      Math.round(event.tick / FOUNDATION_STEP_TICKS),
      event,
    ]),
  );
}

function accentForVelocity(
  velocity: number,
): StepEvent["accent"] {
  if (velocity >= 0.85) return "accent";
  if (velocity <= 0.3) return "ghost";
  return "normal";
}

function discreteChoice<T>(
  a: T | undefined,
  b: T | undefined,
  amount: number,
  seed: string,
): T | undefined {
  if (amount <= 0.001) return a;
  if (amount >= 0.999) return b;

  const random = new SeededRandom(deriveSeed(seed, "switch"));
  const threshold = random.range(0.35, 0.65);
  return amount >= threshold ? b : a;
}

function styleMetric(
  profile: StyleDNAProfile,
  lane: PatternLane,
  step: number,
  event: StepEvent,
): number {
  switch (lane.role) {
    case "kick":
      return step % 4 === 0
        ? Math.max(
            0.48,
            profile.rhythm.fourOnFloor,
            1 - profile.rhythm.kickSyncopation * 0.3,
          )
        : profile.rhythm.kickSyncopation;
    case "snare":
      return event.accent === "ghost"
        ? Math.max(
            profile.rhythm.ghostNotes,
            profile.groove.ghostNotes,
          )
        : profile.rhythm.backbeatStrength;
    case "clap":
      return Math.max(
        0.05,
        profile.rhythm.clapBlend *
          profile.rhythm.backbeatStrength,
      );
    case "closedHat":
      return step % 2 === 1
        ? profile.rhythm.hatSixteenth
        : Math.max(0.45, 1 - profile.rhythm.hatSixteenth * 0.2);
    case "openHat":
      return profile.rhythm.openHat;
    case "percussion":
      return profile.rhythm.percussion;
    case "tom":
      return profile.rhythm.toms;
    case "cymbal":
      return profile.rhythm.crash;
    default:
      return 0.5;
  }
}

function styleProbabilityBias(
  probability: number,
  lane: PatternLane,
  step: number,
  event: StepEvent,
  styleA: StyleDNAId | undefined,
  styleB: StyleDNAId | undefined,
  rhythmAmount: number,
  styleAmount: number,
): number {
  if (
    !styleA ||
    !styleB ||
    styleA === styleB ||
    Math.abs(styleAmount - rhythmAmount) < 0.001
  ) {
    return clamp01(probability);
  }

  const a = getStyleDNA(styleA);
  const b = getStyleDNA(styleB);
  const metricA = styleMetric(a, lane, step, event);
  const metricB = styleMetric(b, lane, step, event);
  const structuralMetric = Math.max(
    0.08,
    lerp(metricA, metricB, rhythmAmount),
  );
  const styleMetricTarget = Math.max(
    0.08,
    lerp(metricA, metricB, styleAmount),
  );
  const ratio = Math.max(
    0.45,
    Math.min(1.55, styleMetricTarget / structuralMetric),
  );

  return clamp01(probability * ratio);
}

function blendEvent(
  laneA: PatternLane,
  laneB: PatternLane,
  eventA: StepEvent | undefined,
  eventB: StepEvent | undefined,
  step: number,
  dimensions: BeatMorphDimensions,
  seed: string,
  styleA: StyleDNAId | undefined,
  styleB: StyleDNAId | undefined,
): StepEvent | undefined {
  if (!eventA && !eventB) return undefined;

  let event: StepEvent;
  let probability: number;

  if (eventA && eventB) {
    const velocity = lerp(
      eventA.velocity,
      eventB.velocity,
      dimensions.dynamics,
    );
    probability = lerp(
      eventA.probability,
      eventB.probability,
      dimensions.rhythm,
    );
    const timingOffsetUs = Math.round(
      lerp(
        eventA.timingOffsetUs,
        eventB.timingOffsetUs,
        dimensions.timing,
      ),
    );

    event = {
      ...cloneEvent(eventA),
      id: eventA.id,
      tick: step * FOUNDATION_STEP_TICKS,
      durationTicks:
        discreteChoice(
          eventA.durationTicks,
          eventB.durationTicks,
          dimensions.rhythm,
          seed + ":duration",
        ),
      velocity,
      probability,
      timingOffsetUs,
      accent:
        dimensions.dynamics <= 0.001
          ? eventA.accent
          : dimensions.dynamics >= 0.999
            ? eventB.accent
            : accentForVelocity(velocity),
      ratchetCount: discreteChoice(
        eventA.ratchetCount,
        eventB.ratchetCount,
        dimensions.rhythm,
        seed + ":ratchet",
      ),
      flamOffsetUs: discreteChoice(
        eventA.flamOffsetUs,
        eventB.flamOffsetUs,
        dimensions.rhythm,
        seed + ":flam",
      ),
      grooveBase: undefined,
    };
  } else if (eventA) {
    probability =
      eventA.probability * (1 - dimensions.rhythm);
    if (probability <= 0.001) return undefined;
    event = {
      ...cloneEvent(eventA),
      probability,
      grooveBase: undefined,
    };
  } else {
    probability =
      (eventB?.probability ?? 1) * dimensions.rhythm;
    if (!eventB || probability <= 0.001) return undefined;
    event = {
      ...cloneEvent(eventB),
      id:
        "evt-morph-" +
        shortSeed(seed) +
        "-" +
        laneA.id.replace("lane-", "") +
        "-" +
        step,
      probability,
      grooveBase: undefined,
    };
  }

  event.probability = styleProbabilityBias(
    event.probability,
    dimensions.rhythm < 0.5 ? laneA : laneB,
    step,
    event,
    styleA,
    styleB,
    dimensions.rhythm,
    dimensions.styleDNA,
  );

  event.generatorTags = [
    ...(event.generatorTags ?? []).filter(
      (tag) =>
        !tag.startsWith("beat-morph") &&
        !tag.startsWith("groove-engine"),
    ),
    BEAT_MORPH_ENGINE_ID,
    "beat-morph:v" + BEAT_MORPH_ENGINE_VERSION,
  ];

  return event.probability <= 0.001 ? undefined : event;
}

function blendRoleOffsets(
  a: GrooveProfile["roleTimingOffsetUs"],
  b: GrooveProfile["roleTimingOffsetUs"],
  amount: number,
): GrooveProfile["roleTimingOffsetUs"] {
  const roles = new Set([
    ...Object.keys(a ?? {}),
    ...Object.keys(b ?? {}),
  ]);
  const result: NonNullable<GrooveProfile["roleTimingOffsetUs"]> = {};

  for (const role of roles) {
    const key = role as keyof NonNullable<
      GrooveProfile["roleTimingOffsetUs"]
    >;
    const value = Math.round(
      lerp(a?.[key] ?? 0, b?.[key] ?? 0, amount),
    );
    if (value !== 0) result[key] = value;
  }

  return result;
}

function blendGroove(
  a: GrooveProfile | undefined,
  b: GrooveProfile | undefined,
  amount: number,
  seed: string,
): GrooveProfile | undefined {
  if (!a && !b) return undefined;
  if (amount <= 0.001) {
    return a
      ? {
          ...a,
          roleTimingOffsetUs: a.roleTimingOffsetUs
            ? { ...a.roleTimingOffsetUs }
            : undefined,
        }
      : undefined;
  }
  if (amount >= 0.999) {
    return b
      ? {
          ...b,
          roleTimingOffsetUs: b.roleTimingOffsetUs
            ? { ...b.roleTimingOffsetUs }
            : undefined,
        }
      : undefined;
  }

  const ga = a ?? {
    swing: 0,
    humanization: 0,
    personality: "mechanical" as const,
    ghostNoteAmount: 0,
  };
  const gb = b ?? {
    swing: 0,
    humanization: 0,
    personality: "mechanical" as const,
    ghostNoteAmount: 0,
  };

  return {
    swing: lerp(ga.swing, gb.swing, amount),
    humanization: lerp(
      ga.humanization,
      gb.humanization,
      amount,
    ),
    personality:
      amount < 0.5 ? ga.personality : gb.personality,
    roleTimingOffsetUs: blendRoleOffsets(
      ga.roleTimingOffsetUs,
      gb.roleTimingOffsetUs,
      amount,
    ),
    ghostNoteAmount: lerp(
      ga.ghostNoteAmount ?? 0,
      gb.ghostNoteAmount ?? 0,
      amount,
    ),
    seed: deriveSeed(seed, "groove"),
    engineVersion: Math.max(
      ga.engineVersion ?? 0,
      gb.engineVersion ?? 0,
      BEAT_MORPH_ENGINE_VERSION,
    ),
  };
}

function blendStyleVector(
  a: StyleVector | undefined,
  b: StyleVector | undefined,
  amount: number,
): StyleVector {
  const keys = new Set([
    ...Object.keys(a ?? {}),
    ...Object.keys(b ?? {}),
  ]);
  const result: StyleVector = {};

  for (const key of keys) {
    const value = lerp(a?.[key] ?? 0, b?.[key] ?? 0, amount);
    if (value > 0.001) result[key] = value;
  }

  return result;
}

function blendIntent(
  a: IntentVector | undefined,
  b: IntentVector | undefined,
  dimensions: BeatMorphDimensions,
): IntentVector {
  const fallback: IntentVector = {
    energy: 0.5,
    density: 0.5,
    complexity: 0.5,
    syncopation: 0.5,
    space: 0.5,
    swing: 0,
    humanization: 0,
    mutationDistance: 0,
  };
  const ia = a ?? fallback;
  const ib = b ?? fallback;

  return {
    energy: lerp(ia.energy, ib.energy, dimensions.dynamics),
    density: lerp(ia.density, ib.density, dimensions.rhythm),
    complexity: lerp(
      ia.complexity,
      ib.complexity,
      dimensions.rhythm,
    ),
    syncopation: lerp(
      ia.syncopation,
      ib.syncopation,
      dimensions.rhythm,
    ),
    space: lerp(ia.space, ib.space, dimensions.rhythm),
    swing: lerp(ia.swing, ib.swing, dimensions.groove),
    humanization: lerp(
      ia.humanization,
      ib.humanization,
      dimensions.groove,
    ),
    mutationDistance:
      (dimensions.rhythm +
        dimensions.dynamics +
        dimensions.timing +
        dimensions.groove +
        dimensions.styleDNA) /
      5,
  };
}

export function morphPatterns(
  request: BeatMorphRequest,
): BeatMorphResult {
  assertMorphCompatible(request.a, request.b);

  const a = clonePattern(request.a);
  const b = clonePattern(request.b);
  const dimensions = normalizedDimensions(request.dimensions);
  const seedCode = shortSeed(request.seed);
  const styleA = styleIdForPattern(a);
  const styleB = styleIdForPattern(b);
  const bByLane = new Map(
    b.lanes.map((lane) => [lane.id, lane]),
  );

  let sharedEventCount = 0;
  let aOnlyEventCount = 0;
  let bOnlyEventCount = 0;

  const lanes = a.lanes.map((laneA) => {
    const laneB = bByLane.get(laneA.id);
    if (!laneB) return cloneLane(laneA);

    const laneDimensions: BeatMorphDimensions = {
      rhythm: laneA.lock.rhythm
        ? 0
        : dimensions.rhythm,
      dynamics: laneA.lock.dynamics
        ? 0
        : dimensions.dynamics,
      timing: laneA.lock.timing
        ? 0
        : dimensions.timing,
      groove: dimensions.groove,
      styleDNA: laneA.lock.rhythm
        ? 0
        : dimensions.styleDNA,
    };

    const aEvents = eventMap(laneA);
    const bEvents = eventMap(laneB);
    const steps = new Set([
      ...aEvents.keys(),
      ...bEvents.keys(),
    ]);
    const events: StepEvent[] = [];

    for (const step of [...steps].sort((x, y) => x - y)) {
      const eventA = aEvents.get(step);
      const eventB = bEvents.get(step);
      if (eventA && eventB) sharedEventCount += 1;
      else if (eventA) aOnlyEventCount += 1;
      else if (eventB) bOnlyEventCount += 1;

      const event = blendEvent(
        laneA,
        laneB,
        eventA,
        eventB,
        step,
        laneDimensions,
        deriveSeed(
          request.seed,
          laneA.id + ":" + step,
        ),
        styleA,
        styleB,
      );
      if (event) events.push(event);
    }

    return {
      ...cloneLane(laneA),
      kitSlotId:
        laneA.lock.sound || laneDimensions.rhythm < 0.5
          ? laneA.kitSlotId
          : laneB.kitSlotId,
      muted:
        laneDimensions.rhythm < 0.5
          ? laneA.muted
          : laneB.muted,
      solo:
        laneDimensions.rhythm < 0.5
          ? laneA.solo
          : laneB.solo,
      loopLengthTicks: discreteChoice(
        laneA.loopLengthTicks,
        laneB.loopLengthTicks,
        laneDimensions.rhythm,
        request.seed + ":" + laneA.id + ":loop",
      ),
      events,
    };
  });

  const grooveAmount =
    a.lanes.some((lane) => lane.lock.timing)
      ? 0
      : dimensions.groove;

  const styleVector = blendStyleVector(
    a.provenance?.style,
    b.provenance?.style,
    dimensions.styleDNA,
  );
  const exactStyleId =
    dimensions.styleDNA <= 0.001
      ? styleA
      : dimensions.styleDNA >= 0.999
        ? styleB
        : undefined;

  const pattern: Pattern = {
    ...clonePattern(a),
    id:
      "pattern-morph-" +
      seedCode +
      "-" +
      Math.round(
        dimensions.rhythm * 9 +
          dimensions.dynamics * 7 +
          dimensions.timing * 5 +
          dimensions.groove * 3 +
          dimensions.styleDNA,
      ).toString(16),
    name:
      "MORPH " +
      String(
        Math.round(
          ((dimensions.rhythm +
            dimensions.dynamics +
            dimensions.timing +
            dimensions.groove +
            dimensions.styleDNA) /
            5) *
            100,
        ),
      ).padStart(3, "0") +
      " / " +
      seedCode,
    lanes,
    groove: blendGroove(
      a.groove,
      b.groove,
      grooveAmount,
      request.seed,
    ),
    provenance: {
      seed: request.seed,
      generatorId: BEAT_MORPH_ENGINE_ID,
      generatorVersion: BEAT_MORPH_ENGINE_VERSION,
      sourceEntityId: a.id,
      mutationId:
        "morph:" +
        b.id +
        ":r" +
        Math.round(dimensions.rhythm * 100) +
        ":d" +
        Math.round(dimensions.dynamics * 100) +
        ":t" +
        Math.round(dimensions.timing * 100) +
        ":g" +
        Math.round(dimensions.groove * 100) +
        ":s" +
        Math.round(dimensions.styleDNA * 100),
      styleDnaId: exactStyleId,
      styleDnaVersion:
        styleA || styleB ? STYLE_DNA_VERSION : undefined,
      style: styleVector,
      intent: blendIntent(
        a.provenance?.intent,
        b.provenance?.intent,
        dimensions,
      ),
    },
  };

  const geometryA = deriveRhythmGlyph(a);
  const geometryB = deriveRhythmGlyph(b);
  const geometryMorph = deriveRhythmGlyph(pattern);

  return {
    pattern,
    dimensions,
    styleA,
    styleB,
    distanceFromA: rhythmGlyphDistance(
      geometryA,
      geometryMorph,
    ),
    distanceFromB: rhythmGlyphDistance(
      geometryB,
      geometryMorph,
    ),
    sharedEventCount,
    aOnlyEventCount,
    bOnlyEventCount,
  };
}

export function deriveBeatRemix(
  request: BeatRemixRequest,
): BeatRemixResult {
  const amount = clamp01(request.amount);
  const result = rerollBeat({
    source: request.source,
    seed: deriveSeed(
      request.seed,
      "remix:v" + BEAT_REMIX_ENGINE_VERSION,
    ),
    style: request.targetStyle,
    intent: request.intent,
    distance: amount,
    bpm: request.bpm,
  });

  const pattern = clonePattern(result.pattern);
  const sourceStyle = styleIdForPattern(request.source);
  const style: StyleVector =
    sourceStyle && sourceStyle !== request.targetStyle
      ? {
          [sourceStyle]: 1 - amount,
          [request.targetStyle]: amount,
        }
      : { [request.targetStyle]: 1 };

  pattern.id =
    "pattern-remix-" + shortSeed(result.effectiveSeed);
  pattern.name =
    "REMIX " +
    getStyleDNA(request.targetStyle).label +
    " / " +
    shortSeed(result.effectiveSeed);
  pattern.provenance = {
    seed: result.effectiveSeed,
    generatorId: BEAT_REMIX_ENGINE_ID,
    generatorVersion: BEAT_REMIX_ENGINE_VERSION,
    sourceEntityId: request.source.id,
    mutationId: "remix:" + request.targetStyle,
    styleDnaId: request.targetStyle,
    styleDnaVersion: STYLE_DNA_VERSION,
    style,
    intent: {
      energy: request.intent.energy,
      density: request.intent.density,
      complexity: request.intent.complexity,
      syncopation: request.intent.syncopation,
      space: clamp01(1 - request.intent.density),
      swing: request.intent.swing,
      humanization:
        pattern.groove?.humanization ?? 0,
      mutationDistance: amount,
    },
  };

  return {
    accepted: result.accepted,
    pattern,
    targetStyle: request.targetStyle,
    amount,
    validation: result.validation,
    changedLaneIds: result.changedLaneIds,
    changedStepCount: result.changedStepCount,
    effectiveSeed: result.effectiveSeed,
    displaySeed: result.displaySeed,
  };
}
