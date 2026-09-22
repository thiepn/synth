import type {
  BeatFamily,
  BeatFamilyMember,
  BeatFamilyRole,
  GenerationProvenance,
  IntentVector,
  Pattern,
  PatternLane,
  StepEvent,
  StyleVector,
} from "../domain/contracts";
import {
  FOUNDATION_STEP_TICKS,
  SEQUENCER_LANES,
} from "../music/foundationPattern";
import {
  rerollBeat,
} from "./beatVariation";
import {
  validateGeneratedBeat,
  type BeatGenerationIntent,
  type BeatStyleId,
  type BeatValidation,
} from "./beatGenerator";
import {
  SeededRandom,
  deriveSeed,
  shortSeed,
} from "./prng";
import {
  STYLE_DNA_VERSION,
  getStyleDNA,
  type StyleDNAProfile,
} from "../style/styleDNA";

export const BEAT_FAMILY_GENERATOR_ID = "beat-family";
export const BEAT_FAMILY_GENERATOR_VERSION = 2;

export interface BeatFamilyGenerationRequest {
  source: Pattern;
  seed: string;
  style: BeatStyleId;
  intent: BeatGenerationIntent;
  bpm: number;
}

export interface BeatFamilyPattern {
  role: BeatFamilyRole;
  label: string;
  kind: BeatFamilyMember["kind"];
  energy: number;
  pattern: Pattern;
  validation: BeatValidation;
}

export interface BeatFamilyGenerationResult {
  family: BeatFamily;
  patterns: BeatFamilyPattern[];
  effectiveSeed: string;
  displaySeed: string;
  coherenceScore: number;
  valid: boolean;
  reasons: string[];
}

const ROLES: readonly {
  role: BeatFamilyRole;
  label: string;
  kind: BeatFamilyMember["kind"];
  energy: number;
}[] = [
  { role: "core", label: "CORE", kind: "core", energy: 0.56 },
  { role: "aVariation", label: "A VAR", kind: "variation", energy: 0.58 },
  { role: "bVariation", label: "B VAR", kind: "variation", energy: 0.62 },
  { role: "build", label: "BUILD", kind: "section", energy: 0.78 },
  { role: "breakdown", label: "BREAKDOWN", kind: "section", energy: 0.3 },
  { role: "drop", label: "DROP", kind: "section", energy: 0.94 },
  { role: "fill1", label: "FILL 1", kind: "fill", energy: 0.72 },
  { role: "fill2", label: "FILL 2", kind: "fill", energy: 0.82 },
  { role: "transition", label: "TRANSITION", kind: "transition", energy: 0.68 },
];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function cloneEvent(event: StepEvent): StepEvent {
  return {
    ...event,
    generatorTags: event.generatorTags ? [...event.generatorTags] : undefined,
    grooveBase: event.grooveBase ? { ...event.grooveBase } : undefined,
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

function styleVector(style: BeatStyleId): StyleVector {
  return { [style]: 1 };
}

function intentVector(
  intent: BeatGenerationIntent,
  energy: number,
  distance: number,
): IntentVector {
  return {
    energy: clamp01(energy),
    density: clamp01(intent.density),
    complexity: clamp01(intent.complexity),
    syncopation: clamp01(intent.syncopation),
    space: clamp01(1 - intent.density),
    swing: clamp01(intent.swing),
    humanization: 0,
    mutationDistance: clamp01(distance),
  };
}

function decorate(
  source: Pattern,
  pattern: Pattern,
  familyId: string,
  role: BeatFamilyRole,
  seed: string,
  style: BeatStyleId,
  intent: BeatGenerationIntent,
  energy: number,
  distance: number,
): Pattern {
  const next = clonePattern(pattern);
  const code = shortSeed(seed);
  const label = ROLES.find((entry) => entry.role === role)?.label ?? role;

  next.id = "pattern-family-" + role + "-" + code;
  next.name = label + " / " + code;
  next.lanes = next.lanes.map((lane) => ({
    ...lane,
    muted: false,
    solo: false,
  }));
  next.groove = source.groove
    ? {
        ...source.groove,
        roleTimingOffsetUs: source.groove.roleTimingOffsetUs
          ? { ...source.groove.roleTimingOffsetUs }
          : undefined,
      }
    : undefined;
  next.provenance = {
    seed,
    generatorId: BEAT_FAMILY_GENERATOR_ID,
    generatorVersion: BEAT_FAMILY_GENERATOR_VERSION,
    sourceEntityId: source.id,
    styleDnaId: request.style,
    styleDnaVersion: STYLE_DNA_VERSION,
    styleDnaId: style,
    styleDnaVersion: STYLE_DNA_VERSION,
    mutationId: "family:" + role,
    familyId,
    familyRole: role,
    style: styleVector(style),
    intent: intentVector(intent, energy, distance),
  };

  return next;
}

function lane(pattern: Pattern, id: string): PatternLane | undefined {
  return pattern.lanes.find((entry) => entry.id === id);
}

function laneLengthSteps(pattern: Pattern, laneValue: PatternLane): number {
  return Math.max(
    1,
    Math.min(
      patternSteps(pattern),
      Math.round(
        (laneValue.loopLengthTicks ?? pattern.lengthTicks) /
          FOUNDATION_STEP_TICKS,
      ),
    ),
  );
}

function stepOf(event: StepEvent): number {
  return Math.round(event.tick / FOUNDATION_STEP_TICKS);
}

function eventAt(laneValue: PatternLane, step: number): StepEvent | undefined {
  return laneValue.events.find((event) => stepOf(event) === step);
}

function addHit(
  pattern: Pattern,
  laneId: string,
  step: number,
  velocity: number,
  seed: string,
  extra: Partial<StepEvent> = {},
): void {
  const target = lane(pattern, laneId);
  if (!target || target.lock.rhythm) return;
  const localStep = step % laneLengthSteps(pattern, target);
  if (eventAt(target, localStep)) return;

  target.events.push({
    id:
      "evt-family-" +
      shortSeed(seed) +
      "-" +
      laneId.replace("lane-", "") +
      "-" +
      localStep,
    tick: localStep * FOUNDATION_STEP_TICKS,
    velocity: clamp01(velocity),
    probability: 1,
    timingOffsetUs: 0,
    accent:
      velocity >= 0.85
        ? "accent"
        : velocity <= 0.3
          ? "ghost"
          : "normal",
    generatorTags: ["beat-family"],
    ...extra,
  });
  target.events.sort((a, b) => a.tick - b.tick);
}

function scaleLane(
  pattern: Pattern,
  laneId: string,
  multiplier: number,
): void {
  const target = lane(pattern, laneId);
  if (!target || target.lock.dynamics) return;
  const activeTicks =
    laneLengthSteps(pattern, target) * FOUNDATION_STEP_TICKS;
  for (const event of target.events) {
    if (event.tick >= activeTicks) continue;
    event.velocity = clamp01(Math.max(0.08, event.velocity * multiplier));
    event.accent =
      event.velocity >= 0.85
        ? "accent"
        : event.velocity <= 0.3
          ? "ghost"
          : "normal";
    delete event.grooveBase;
  }
}

function removeSome(
  pattern: Pattern,
  laneId: string,
  probability: number,
  seed: string,
  protect?: (event: StepEvent) => boolean,
): void {
  const target = lane(pattern, laneId);
  if (!target || target.lock.rhythm) return;
  const random = new SeededRandom(deriveSeed(seed, laneId));
  const activeTicks =
    laneLengthSteps(pattern, target) * FOUNDATION_STEP_TICKS;

  target.events = target.events.filter((event) => {
    if (event.tick >= activeTicks) return true;
    if (protect?.(event)) return true;
    return !random.chance(probability);
  });
}

function patternSteps(pattern: Pattern): number {
  return Math.max(
    1,
    Math.round(pattern.lengthTicks / FOUNDATION_STEP_TICKS),
  );
}

function makeBuild(
  source: Pattern,
  seed: string,
  dna: StyleDNAProfile,
): Pattern {
  const next = clonePattern(source);
  const steps = patternSteps(next);
  const start = Math.max(0, steps - Math.min(8, steps));
  const random = new SeededRandom(deriveSeed(seed, "build-style"));

  for (let step = start; step < steps; step += 1) {
    if (
      step % 2 === 1 &&
      random.chance(0.28 + dna.fill.density * 0.62)
    ) {
      addHit(
        next,
        "lane-closed-hat",
        step,
        0.42 +
          ((step - start) / Math.max(1, steps - start)) *
            (0.16 + dna.rhythm.hatSixteenth * 0.16),
        seed,
      );
    }
  }

  for (let step = Math.max(0, steps - 4); step < steps; step += 1) {
    addHit(
      next,
      step % 2 === 0 ? "lane-snare" : "lane-percussion",
      step,
      0.42 + ((step - (steps - 4)) / 4) * 0.34,
      seed,
      step === steps - 1 &&
      random.chance(0.18 + dna.fill.ratchetBias * 0.62)
        ? { ratchetCount: dna.fill.ratchetBias > 0.65 ? 3 : 2 }
        : {},
    );
  }

  scaleLane(next, "lane-kick", 1.08);
  scaleLane(next, "lane-snare", 1.08);
  return next;
}

function makeBreakdown(source: Pattern, seed: string): Pattern {
  const next = clonePattern(source);

  removeSome(next, "lane-closed-hat", 0.56, seed);
  removeSome(next, "lane-open-hat", 0.72, seed);
  removeSome(next, "lane-percussion", 0.64, seed);
  removeSome(next, "lane-tom", 0.8, seed);
  removeSome(next, "lane-clap", 0.48, seed);
  removeSome(
    next,
    "lane-kick",
    0.35,
    seed,
    (event) => stepOf(event) === 0,
  );

  scaleLane(next, "lane-kick", 0.88);
  scaleLane(next, "lane-snare", 0.82);
  return next;
}

function makeDrop(
  source: Pattern,
  seed: string,
  dna: StyleDNAProfile,
): Pattern {
  const next = clonePattern(source);
  const steps = patternSteps(next);

  scaleLane(next, "lane-kick", 1.16);
  scaleLane(next, "lane-snare", 1.14);
  scaleLane(next, "lane-clap", 1.12);
  if (dna.rhythm.crash > 0.12) {
    addHit(
      next,
      "lane-crash",
      0,
      0.72 + dna.rhythm.crash * 0.22,
      seed,
    );
  }

  const random = new SeededRandom(deriveSeed(seed, "drop-style"));
  for (let step = 2; step < steps; step += 4) {
    if (random.chance(0.22 + dna.rhythm.openHat * 0.68)) {
      addHit(next, "lane-open-hat", step, 0.48 + dna.rhythm.openHat * 0.2, seed);
    }
  }

  return next;
}

function makeFill(
  source: Pattern,
  seed: string,
  variant: 1 | 2,
  dna: StyleDNAProfile,
): Pattern {
  const next = clonePattern(source);
  const steps = patternSteps(next);
  const span = Math.min(variant === 1 ? 4 : 8, steps);
  const start = Math.max(0, steps - span);

  for (let step = start; step < steps; step += 1) {
    const progress = (step - start) / Math.max(1, span - 1);
    const random = new SeededRandom(
      deriveSeed(seed, "fill-target:" + step),
    );
    const tom = dna.fill.tomBias;
    const snare = dna.fill.snareBias;
    const perc = dna.fill.percussionBias;
    const total = Math.max(0.001, tom + snare + perc);
    const roll = random.range(0, total);
    const target =
      roll < tom
        ? "lane-tom"
        : roll < tom + snare
          ? "lane-snare"
          : "lane-percussion";

    addHit(
      next,
      target,
      step,
      0.42 + progress * 0.42,
      seed,
      step === steps - 1
        ? random.chance(dna.fill.flamBias)
          ? { flamOffsetUs: random.int(14_000, 28_000) }
          : random.chance(0.25 + dna.fill.ratchetBias * 0.7)
            ? {
                ratchetCount:
                  dna.fill.ratchetBias > 0.68 ? 3 : 2,
              }
            : {}
        : variant === 2 &&
            step >= steps - 3 &&
            random.chance(dna.fill.ratchetBias * 0.62)
          ? { ratchetCount: 2 }
          : {},
    );
  }

  return next;
}

function makeTransition(
  source: Pattern,
  seed: string,
  dna: StyleDNAProfile,
): Pattern {
  const next = makeFill(
    source,
    deriveSeed(seed, "fill"),
    1,
    dna,
  );
  const steps = patternSteps(next);
  const boundary = Math.max(0, steps - Math.min(4, steps));

  removeSome(
    next,
    "lane-kick",
    0.7,
    deriveSeed(seed, "space"),
    (event) => stepOf(event) < boundary,
  );
  addHit(next, "lane-open-hat", Math.max(0, steps - 2), 0.62, seed);
  addHit(next, "lane-crash", Math.max(0, steps - 1), 0.72, seed);
  return next;
}

function criticalValidationScore(validation: BeatValidation): number {
  const critical = validation.reasons.some((reason) =>
    [
      "missing kick foundation",
      "missing backbeat",
    ].includes(reason),
  );
  return critical ? Math.min(validation.score, 45) : validation.score;
}

function familyRoleEnergy(
  role: BeatFamilyRole,
  dna: StyleDNAProfile,
): number {
  switch (role) {
    case "core":
      return dna.arrangement.verse;
    case "aVariation":
      return clamp01(
        dna.arrangement.verse * 0.82 +
          dna.arrangement.preChorus * 0.18,
      );
    case "bVariation":
      return clamp01(
        dna.arrangement.verse * 0.55 +
          dna.arrangement.chorus * 0.45,
      );
    case "build":
      return dna.arrangement.build;
    case "breakdown":
      return dna.arrangement.breakdown;
    case "drop":
      return dna.arrangement.drop;
    case "fill1":
      return clamp01(
        dna.arrangement.verse * 0.45 +
          dna.arrangement.build * 0.55,
      );
    case "fill2":
      return clamp01(
        dna.arrangement.build * 0.45 +
          dna.arrangement.drop * 0.55,
      );
    case "transition":
      return clamp01(
        dna.arrangement.preChorus * 0.55 +
          dna.arrangement.build * 0.45,
      );
  }
}

function patternDistance(a: Pattern, b: Pattern): number {
  let total = 0;
  let changed = 0;

  for (const definition of SEQUENCER_LANES) {
    const aLane = lane(a, definition.id);
    const bLane = lane(b, definition.id);
    if (!aLane || !bLane) continue;

    const steps = new Set([
      ...aLane.events.map(stepOf),
      ...bLane.events.map(stepOf),
    ]);

    for (const step of steps) {
      total += 1;
      const av = eventAt(aLane, step);
      const bv = eventAt(bLane, step);
      if (!av || !bv) {
        changed += 1;
      } else if (
        Math.abs(av.velocity - bv.velocity) > 0.1 ||
        av.ratchetCount !== bv.ratchetCount ||
        av.flamOffsetUs !== bv.flamOffsetUs
      ) {
        changed += 0.5;
      }
    }
  }

  return total > 0 ? changed / total : 0;
}

export function generateBeatFamily(
  request: BeatFamilyGenerationRequest,
): BeatFamilyGenerationResult {
  const effectiveSeed = deriveSeed(
    request.seed,
    "family:v" + BEAT_FAMILY_GENERATOR_VERSION,
  );
  const familyId = "family-" + shortSeed(effectiveSeed);
  const source = clonePattern(request.source);
  const styleDna = getStyleDNA(request.style);

  let aPattern = source;
  let bPattern = source;

  try {
    const a = rerollBeat({
      source,
      seed: deriveSeed(effectiveSeed, "a"),
      style: request.style,
      intent: request.intent,
      distance: 0.18,
      bpm: request.bpm,
    });
    if (a.accepted) aPattern = a.pattern;
  } catch {
    aPattern = source;
  }

  try {
    const b = rerollBeat({
      source,
      seed: deriveSeed(effectiveSeed, "b"),
      style: request.style,
      intent: request.intent,
      distance: 0.34,
      bpm: request.bpm,
    });
    if (b.accepted) bPattern = b.pattern;
  } catch {
    bPattern = source;
  }

  const raw: Record<BeatFamilyRole, Pattern> = {
    core: source,
    aVariation: aPattern,
    bVariation: bPattern,
    build: makeBuild(
      source,
      deriveSeed(effectiveSeed, "build"),
      styleDna,
    ),
    breakdown: makeBreakdown(
      source,
      deriveSeed(effectiveSeed, "breakdown"),
    ),
    drop: makeDrop(
      source,
      deriveSeed(effectiveSeed, "drop"),
      styleDna,
    ),
    fill1: makeFill(
      source,
      deriveSeed(effectiveSeed, "fill1"),
      1,
      styleDna,
    ),
    fill2: makeFill(
      source,
      deriveSeed(effectiveSeed, "fill2"),
      2,
      styleDna,
    ),
    transition: makeTransition(
      source,
      deriveSeed(effectiveSeed, "transition"),
      styleDna,
    ),
  };

  const patterns: BeatFamilyPattern[] = ROLES.map((entry, index) => {
    const seed = deriveSeed(effectiveSeed, entry.role);
    const distance = entry.role === "core"
      ? 0
      : patternDistance(source, raw[entry.role]);
    const pattern = decorate(
      source,
      raw[entry.role],
      familyId,
      entry.role,
      seed,
      request.style,
      request.intent,
      entry.energy,
      distance,
    );
    const validation = validateGeneratedBeat(pattern, request.style);

    return {
      role: entry.role,
      label: entry.label,
      kind: entry.kind,
      energy: familyRoleEnergy(entry.role, styleDna),
      pattern,
      validation,
    };
  });

  const memberScores = patterns.map((entry) =>
    criticalValidationScore(entry.validation),
  );
  const avgScore =
    memberScores.reduce((sum, value) => sum + value, 0) /
    Math.max(1, memberScores.length);
  const aDistance = patternDistance(
    patterns[0].pattern,
    patterns[1].pattern,
  );
  const bDistance = patternDistance(
    patterns[0].pattern,
    patterns[2].pattern,
  );
  const reasons: string[] = [];
  let coherenceScore = avgScore;
  const allRhythmLocked = source.lanes.every((lane) => lane.lock.rhythm);

  if (allRhythmLocked) {
    reasons.push("all rhythm lanes are locked");
    coherenceScore -= 45;
  }

  if (aDistance < 0.02) {
    reasons.push("A variation is too close to core");
    coherenceScore -= 8;
  }
  if (bDistance < aDistance) {
    reasons.push("B variation is not more distinct than A");
    coherenceScore -= 8;
  }
  if (patterns[3].energy <= patterns[4].energy) {
    reasons.push("build energy does not exceed breakdown");
    coherenceScore -= 10;
  }
  if (patterns[5].energy <= patterns[3].energy) {
    reasons.push("drop energy does not exceed build");
    coherenceScore -= 10;
  }

  coherenceScore = Math.max(0, Math.round(coherenceScore));

  const familyProvenance: GenerationProvenance = {
    seed: effectiveSeed,
    generatorId: BEAT_FAMILY_GENERATOR_ID,
    generatorVersion: BEAT_FAMILY_GENERATOR_VERSION,
    sourceEntityId: source.id,
    familyId,
    familyRole: "core",
    style: styleVector(request.style),
    intent: intentVector(
      request.intent,
      request.intent.energy,
      0,
    ),
  };

  const family: BeatFamily = {
    id: familyId,
    name: "BEAT FAMILY / " + shortSeed(effectiveSeed),
    corePatternId: patterns[0].pattern.id,
    members: patterns.map((entry, index) => ({
      id: familyId + "-member-" + index,
      role: entry.role,
      label: entry.label,
      patternId: entry.pattern.id,
      energy: clamp01(entry.energy),
      kind: entry.kind,
    })),
    provenance: familyProvenance,
  };

  return {
    family,
    patterns,
    effectiveSeed,
    displaySeed: shortSeed(effectiveSeed),
    coherenceScore,
    valid:
      coherenceScore >= 58 &&
      patterns.every(
        (entry) => criticalValidationScore(entry.validation) >= 45,
      ),
    reasons,
  };
}
