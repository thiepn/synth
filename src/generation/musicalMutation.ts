import type {
  IntentVector,
  Pattern,
  PatternLane,
  StepEvent,
  StyleVector,
} from "../domain/contracts";
import {
  applyGroove,
  resetGroove,
  type GroovePersonalityId,
} from "../groove/grooveEngine";
import { FOUNDATION_STEP_TICKS } from "../music/foundationPattern";
import {
  validateGeneratedBeat,
  type BeatGenerationIntent,
  type BeatStyleId,
  type BeatValidation,
} from "./beatGenerator";
import { rerollBeat } from "./beatVariation";
import { SeededRandom, deriveSeed, shortSeed } from "./prng";

export const MUSICAL_MUTATION_ID = "musical-mutation";
export const MUSICAL_MUTATION_VERSION = 1;

export type MusicalMutationId =
  | "harder"
  | "space"
  | "funkier"
  | "push"
  | "drag"
  | "dirty"
  | "break"
  | "weird"
  | "thin";

export interface MusicalMutationDefinition {
  id: MusicalMutationId;
  label: string;
  code: string;
  description: string;
}

export const MUSICAL_MUTATIONS: readonly MusicalMutationDefinition[] = [
  {
    id: "harder",
    label: "HARDER",
    code: "HRD",
    description: "Stronger anchors, more impact, selective reinforcement.",
  },
  {
    id: "space",
    label: "SPACE",
    code: "SPC",
    description: "Open the groove by removing busy support activity.",
  },
  {
    id: "funkier",
    label: "FUNKIER",
    code: "FNK",
    description: "More syncopation, ghosts, pocket, and rhythmic dialogue.",
  },
  {
    id: "push",
    label: "PUSH",
    code: "PSH",
    description: "Move the pocket forward and strengthen forward motion.",
  },
  {
    id: "drag",
    label: "DRAG",
    code: "DRG",
    description: "Lay the groove back with softer forward momentum.",
  },
  {
    id: "dirty",
    label: "DIRTY",
    code: "DRT",
    description: "Increase dynamic contrast, ghosts, and loose irregularity.",
  },
  {
    id: "break",
    label: "BREAK",
    code: "BRK",
    description: "Strip the pulse and emphasize transitional drum movement.",
  },
  {
    id: "weird",
    label: "WEIRD",
    code: "WRD",
    description: "Increase syncopation and structural surprise coherently.",
  },
  {
    id: "thin",
    label: "THIN",
    code: "THN",
    description: "Remove secondary layers while preserving the core pulse.",
  },
];

export interface MusicalMutationRequest {
  source: Pattern;
  seed: string;
  mutation: MusicalMutationId;
  amount: number;
  style: BeatStyleId;
  intent: BeatGenerationIntent;
  bpm: number;
}

export interface GrooveFieldMutationRequest {
  source: Pattern;
  seed: string;
  targetDensity: number;
  targetSyncopation: number;
  style: BeatStyleId;
  intent: BeatGenerationIntent;
  bpm: number;
}

export interface MusicalMutationResult {
  accepted: boolean;
  pattern: Pattern;
  effectiveSeed: string;
  displaySeed: string;
  mutationId: string;
  validation: BeatValidation;
  changedLaneIds: string[];
  changedStepCount: number;
  targetIntent: BeatGenerationIntent;
  groove: {
    personality: GroovePersonalityId;
    humanization: number;
    ghostNoteAmount: number;
    swing: number;
  };
}

interface GrooveSettings {
  personality: GroovePersonalityId;
  humanization: number;
  ghostNoteAmount: number;
  swing: number;
  seed: string;
}

const LANE = Object.freeze({
  kick: "lane-kick",
  snare: "lane-snare",
  clap: "lane-clap",
  closedHat: "lane-closed-hat",
  openHat: "lane-open-hat",
  tom: "lane-tom",
  percussion: "lane-percussion",
  crash: "lane-crash",
});

const CRITICAL_REASONS = new Set([
  "missing kick foundation",
  "missing backbeat",
  "house pulse lost four-on-floor foundation",
]);

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
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

function isGrooveGeneratedGhost(event: StepEvent): boolean {
  return Boolean(
    event.generatorTags?.includes("ghost") &&
      event.generatorTags.some((tag) => tag.startsWith("groove-engine")),
  );
}

function baselineEvent(event: StepEvent): StepEvent {
  const base = cloneEvent(event);

  if (event.grooveBase) {
    base.velocity = event.grooveBase.velocity;
    base.timingOffsetUs = event.grooveBase.timingOffsetUs;
    base.accent = event.grooveBase.accent;
  }

  delete base.grooveBase;
  base.generatorTags = base.generatorTags?.filter(
    (tag) => !tag.startsWith("groove-engine"),
  );

  return base;
}

function mutationBaseline(source: Pattern): Pattern {
  const baseline = resetGroove(source);

  for (const sourceLane of source.lanes) {
    if (!sourceLane.lock.rhythm) continue;

    const targetLane = baseline.lanes.find(
      (lane) => lane.id === sourceLane.id,
    );
    if (!targetLane) continue;

    targetLane.events = sourceLane.events.map((event) => {
      const result = baselineEvent(event);

      if (isGrooveGeneratedGhost(event) && result.accent !== "ghost") {
        result.accent = "ghost";
      }

      return result;
    });
  }

  return baseline;
}

function stepCount(pattern: Pattern): number {
  return Math.max(
    1,
    Math.round(pattern.lengthTicks / FOUNDATION_STEP_TICKS),
  );
}

function stepOf(event: StepEvent): number {
  return Math.round(event.tick / FOUNDATION_STEP_TICKS);
}

function eventAt(lane: PatternLane, step: number): StepEvent | undefined {
  return lane.events.find((event) => stepOf(event) === step);
}

function addHit(
  lane: PatternLane,
  step: number,
  velocity: number,
  seedCode: string,
  tag: string,
): void {
  if (eventAt(lane, step)) return;

  lane.events.push({
    id:
      "evt-mut-" +
      seedCode +
      "-" +
      lane.id.replace("lane-", "") +
      "-" +
      step,
    tick: step * FOUNDATION_STEP_TICKS,
    velocity: clamp01(velocity),
    probability: 1,
    timingOffsetUs: 0,
    accent:
      velocity >= 0.85
        ? "accent"
        : velocity <= 0.3
          ? "ghost"
          : "normal",
    generatorTags: [
      MUSICAL_MUTATION_ID,
      tag,
      "v" + MUSICAL_MUTATION_VERSION,
    ],
  });

  lane.events.sort((a, b) => a.tick - b.tick);
}

function removeWhere(
  lane: PatternLane,
  predicate: (event: StepEvent) => boolean,
  random: SeededRandom,
  probability: number,
): void {
  lane.events = lane.events.filter((event) => {
    if (!predicate(event)) return true;
    return !random.chance(probability);
  });
}

function modifyVelocities(
  lane: PatternLane,
  delta: (event: StepEvent) => number,
): void {
  if (lane.lock.dynamics) return;

  for (const event of lane.events) {
    const velocity = Math.min(
      1,
      Math.max(0.08, event.velocity + delta(event)),
    );
    event.velocity = velocity;
    event.accent =
      velocity >= 0.85
        ? "accent"
        : velocity <= 0.3
          ? "ghost"
          : "normal";
  }
}

function lane(pattern: Pattern, laneId: string): PatternLane | undefined {
  return pattern.lanes.find((entry) => entry.id === laneId);
}

function mutableLane(
  pattern: Pattern,
  laneId: string,
): PatternLane | undefined {
  const value = lane(pattern, laneId);
  return value && !value.lock.rhythm ? value : undefined;
}

function normalizedIntent(
  intent: BeatGenerationIntent,
): BeatGenerationIntent {
  return {
    energy: clamp01(intent.energy),
    density: clamp01(intent.density),
    complexity: clamp01(intent.complexity),
    syncopation: clamp01(intent.syncopation),
    swing: clamp01(intent.swing),
  };
}

function adjustIntent(
  intent: BeatGenerationIntent,
  mutation: MusicalMutationId,
  amount: number,
): BeatGenerationIntent {
  const next = normalizedIntent(intent);
  const a = clamp01(amount);

  switch (mutation) {
    case "harder":
      next.energy = clamp01(next.energy + 0.18 * a);
      next.density = clamp01(next.density + 0.08 * a);
      next.complexity = clamp01(next.complexity + 0.08 * a);
      break;
    case "space":
      next.density = clamp01(next.density - 0.24 * a);
      next.complexity = clamp01(next.complexity - 0.1 * a);
      break;
    case "funkier":
      next.syncopation = clamp01(next.syncopation + 0.3 * a);
      next.complexity = clamp01(next.complexity + 0.15 * a);
      next.swing = clamp01(next.swing + 0.1 * a);
      break;
    case "push":
      next.energy = clamp01(next.energy + 0.08 * a);
      break;
    case "drag":
      next.energy = clamp01(next.energy - 0.05 * a);
      next.swing = clamp01(next.swing + 0.06 * a);
      break;
    case "dirty":
      next.complexity = clamp01(next.complexity + 0.16 * a);
      next.syncopation = clamp01(next.syncopation + 0.08 * a);
      break;
    case "break":
      next.density = clamp01(next.density - 0.12 * a);
      next.complexity = clamp01(next.complexity + 0.12 * a);
      break;
    case "weird":
      next.complexity = clamp01(next.complexity + 0.32 * a);
      next.syncopation = clamp01(next.syncopation + 0.34 * a);
      break;
    case "thin":
      next.density = clamp01(next.density - 0.3 * a);
      next.complexity = clamp01(next.complexity - 0.12 * a);
      break;
  }

  return next;
}

function grooveSettings(source: Pattern): GrooveSettings {
  return {
    personality: source.groove?.personality ?? "human",
    humanization: clamp01(source.groove?.humanization ?? 0),
    ghostNoteAmount: clamp01(source.groove?.ghostNoteAmount ?? 0),
    swing: clamp01(source.groove?.swing ?? 0),
    seed:
      source.groove?.seed ??
      "groove:" + (source.provenance?.seed ?? source.id),
  };
}

function adjustGroove(
  settings: GrooveSettings,
  mutation: MusicalMutationId,
  amount: number,
  targetIntent: BeatGenerationIntent,
): GrooveSettings {
  const a = clamp01(amount);
  const next = { ...settings };

  switch (mutation) {
    case "harder":
      if (next.personality === "mechanical") next.personality = "tight";
      next.humanization = clamp01(next.humanization * (1 - 0.18 * a));
      break;
    case "space":
      next.ghostNoteAmount = clamp01(next.ghostNoteAmount - 0.2 * a);
      break;
    case "funkier":
      next.personality = "deep";
      next.humanization = clamp01(
        Math.max(next.humanization, 0.42 + 0.22 * a),
      );
      next.ghostNoteAmount = clamp01(
        Math.max(next.ghostNoteAmount, 0.25 + 0.3 * a),
      );
      next.swing = clamp01(
        Math.max(next.swing, targetIntent.swing),
      );
      break;
    case "push":
      next.personality = "pushing";
      next.humanization = clamp01(
        Math.max(next.humanization, 0.35 + 0.35 * a),
      );
      break;
    case "drag":
      next.personality = "laidBack";
      next.humanization = clamp01(
        Math.max(next.humanization, 0.38 + 0.32 * a),
      );
      next.swing = clamp01(
        Math.max(next.swing, targetIntent.swing),
      );
      break;
    case "dirty":
      next.personality = "loose";
      next.humanization = clamp01(next.humanization + 0.28 * a);
      next.ghostNoteAmount = clamp01(
        next.ghostNoteAmount + 0.34 * a,
      );
      break;
    case "break":
      if (next.personality === "mechanical") next.personality = "human";
      next.humanization = clamp01(
        Math.max(next.humanization, 0.28 + 0.18 * a),
      );
      break;
    case "weird":
      next.personality = "loose";
      next.humanization = clamp01(next.humanization + 0.22 * a);
      next.ghostNoteAmount = clamp01(
        next.ghostNoteAmount + 0.18 * a,
      );
      break;
    case "thin":
      next.ghostNoteAmount = clamp01(next.ghostNoteAmount - 0.28 * a);
      break;
  }

  return next;
}

function baselineSignature(laneValue: PatternLane): string {
  return laneValue.events
    .map((event) => [
      event.tick,
      event.velocity.toFixed(4),
      event.probability.toFixed(4),
      event.timingOffsetUs,
    ].join(":"))
    .sort()
    .join("|");
}

function assertStructuralLocks(
  before: Pattern,
  after: Pattern,
): void {
  for (const sourceLane of before.lanes) {
    if (!sourceLane.lock.rhythm) continue;
    const nextLane = after.lanes.find(
      (entry) => entry.id === sourceLane.id,
    );

    if (
      !nextLane ||
      baselineSignature(sourceLane) !== baselineSignature(nextLane)
    ) {
      throw new Error(
        "Mutation invariant failed: locked rhythm changed: " +
          sourceLane.id,
      );
    }
  }
}

function directMutation(
  source: Pattern,
  mutation: MusicalMutationId,
  amount: number,
  random: SeededRandom,
  seedCode: string,
): Pattern {
  const pattern = clonePattern(source);
  const steps = stepCount(pattern);
  const a = clamp01(amount);

  if (mutation === "harder") {
    for (const laneValue of pattern.lanes) {
      if (laneValue.lock.rhythm) continue;
      if (["kick", "snare", "clap", "tom"].includes(laneValue.role)) {
        modifyVelocities(
          laneValue,
          () => 0.07 + 0.1 * a,
        );
      }
    }

    const kick = mutableLane(pattern, LANE.kick);
    if (kick) {
      for (const step of [6, 10, 14].filter((step) => step < steps)) {
        if (random.chance(0.14 + 0.5 * a)) {
          addHit(kick, step, 0.72 + 0.2 * a, seedCode, mutation);
        }
      }
    }

    const clap = mutableLane(pattern, LANE.clap);
    if (clap) {
      for (const step of [4, 12].filter((step) => step < steps)) {
        if (random.chance(0.2 + 0.5 * a)) {
          addHit(clap, step, 0.58 + 0.18 * a, seedCode, mutation);
        }
      }
    }

    const crash = mutableLane(pattern, LANE.crash);
    if (crash && steps >= 4) {
      addHit(crash, 0, 0.6 + 0.25 * a, seedCode, mutation);
    }
  }

  if (mutation === "space") {
    for (const laneId of [
      LANE.closedHat,
      LANE.percussion,
      LANE.tom,
      LANE.clap,
    ]) {
      const target = mutableLane(pattern, laneId);
      if (!target) continue;

      removeWhere(
        target,
        (event) => {
          const step = stepOf(event);
          return step % 4 !== 0 || target.role === "percussion";
        },
        random,
        0.18 + 0.52 * a,
      );
    }

    const open = mutableLane(pattern, LANE.openHat);
    if (open && steps >= 8 && random.chance(0.35 + 0.45 * a)) {
      const step = steps >= 16 ? 14 : steps - 2;
      addHit(open, step, 0.42 + 0.12 * a, seedCode, mutation);
    }
  }

  if (mutation === "push") {
    for (const laneId of [LANE.kick, LANE.closedHat, LANE.openHat]) {
      const target = lane(pattern, laneId);
      if (!target || target.lock.rhythm) continue;
      modifyVelocities(target, () => 0.025 + 0.045 * a);
    }
  }

  if (mutation === "drag") {
    for (const laneId of [LANE.closedHat, LANE.percussion]) {
      const target = lane(pattern, laneId);
      if (!target || target.lock.rhythm) continue;
      modifyVelocities(target, () => -(0.015 + 0.035 * a));
    }
  }

  if (mutation === "dirty") {
    for (const laneValue of pattern.lanes) {
      if (laneValue.lock.rhythm || laneValue.lock.dynamics) continue;
      modifyVelocities(laneValue, (event) => {
        if (event.velocity >= 0.7) return 0.05 + 0.08 * a;
        if (event.velocity <= 0.45) return -(0.03 + 0.08 * a);
        return random.range(-0.025, 0.025) * a;
      });
    }

    const perc = mutableLane(pattern, LANE.percussion);
    if (perc) {
      for (let step = 1; step < steps; step += 2) {
        if (random.chance(0.05 + 0.22 * a)) {
          addHit(
            perc,
            step,
            random.range(0.22, 0.38),
            seedCode,
            mutation,
          );
        }
      }
    }
  }

  if (mutation === "break") {
    const kick = mutableLane(pattern, LANE.kick);
    if (kick) {
      removeWhere(
        kick,
        (event) => stepOf(event) !== 0,
        random,
        0.2 + 0.42 * a,
      );
    }

    const hats = mutableLane(pattern, LANE.closedHat);
    if (hats) {
      removeWhere(
        hats,
        (event) => stepOf(event) % 4 !== 0,
        random,
        0.25 + 0.4 * a,
      );
    }

    const tom = mutableLane(pattern, LANE.tom);
    if (tom && steps >= 8) {
      const fillSteps =
        steps >= 16 ? [13, 14, 15] : [steps - 2, steps - 1];
      fillSteps.forEach((step, index) => {
        addHit(
          tom,
          step,
          0.46 + index * 0.13 + 0.08 * a,
          seedCode,
          mutation,
        );
      });
    }

    const perc = mutableLane(pattern, LANE.percussion);
    if (perc && steps >= 8) {
      const step = steps >= 16 ? 11 : steps - 3;
      addHit(perc, step, 0.42 + 0.1 * a, seedCode, mutation);
    }
  }

  if (mutation === "thin") {
    for (const laneId of [
      LANE.clap,
      LANE.openHat,
      LANE.tom,
      LANE.percussion,
      LANE.crash,
    ]) {
      const target = mutableLane(pattern, laneId);
      if (!target) continue;

      removeWhere(
        target,
        () => true,
        random,
        0.5 + 0.45 * a,
      );
    }

    const hats = mutableLane(pattern, LANE.closedHat);
    if (hats) {
      removeWhere(
        hats,
        (event) => stepOf(event) % 2 !== 0,
        random,
        0.4 + 0.5 * a,
      );
    }
  }

  return pattern;
}

function styleVector(style: BeatStyleId): StyleVector {
  return { [style]: 1 };
}

function intentVector(
  intent: BeatGenerationIntent,
  amount: number,
  humanization: number,
): IntentVector {
  return {
    energy: clamp01(intent.energy),
    density: clamp01(intent.density),
    complexity: clamp01(intent.complexity),
    syncopation: clamp01(intent.syncopation),
    space: clamp01(1 - intent.density),
    swing: clamp01(intent.swing),
    humanization: clamp01(humanization),
    mutationDistance: clamp01(amount),
  };
}

function countChanges(
  source: Pattern,
  next: Pattern,
): { changedLaneIds: string[]; changedStepCount: number } {
  const changedLaneIds: string[] = [];
  let changedStepCount = 0;

  for (const sourceLane of source.lanes) {
    const nextLane = next.lanes.find((entry) => entry.id === sourceLane.id);
    if (!nextLane) continue;

    const sourceMap = new Map(
      sourceLane.events.map((event) => [stepOf(event), event]),
    );
    const nextMap = new Map(
      nextLane.events.map((event) => [stepOf(event), event]),
    );
    const allSteps = new Set([...sourceMap.keys(), ...nextMap.keys()]);
    let changed = false;

    for (const step of allSteps) {
      const a = sourceMap.get(step);
      const b = nextMap.get(step);
      const comparableA = a
        ? [a.velocity.toFixed(4), a.timingOffsetUs, a.accent].join(":")
        : "-";
      const comparableB = b
        ? [b.velocity.toFixed(4), b.timingOffsetUs, b.accent].join(":")
        : "-";

      if (comparableA !== comparableB) {
        changed = true;
        changedStepCount += 1;
      }
    }

    if (changed) changedLaneIds.push(sourceLane.id);
  }

  return { changedLaneIds, changedStepCount };
}

function newCriticalFailure(
  source: BeatValidation,
  next: BeatValidation,
  allowed: ReadonlySet<string> = new Set(),
): boolean {
  const before = new Set(
    source.reasons.filter((reason) => CRITICAL_REASONS.has(reason)),
  );

  return next.reasons.some(
    (reason) =>
      CRITICAL_REASONS.has(reason) &&
      !allowed.has(reason) &&
      !before.has(reason),
  );
}

function decorateProvenance(
  pattern: Pattern,
  source: Pattern,
  seed: string,
  mutationId: string,
  style: BeatStyleId,
  intent: BeatGenerationIntent,
  amount: number,
  humanization: number,
): void {
  pattern.provenance = {
    seed,
    generatorId: MUSICAL_MUTATION_ID,
    generatorVersion: MUSICAL_MUTATION_VERSION,
    sourceEntityId: source.id,
    mutationId,
    style: styleVector(style),
    intent: intentVector(intent, amount, humanization),
  };
}

function finalizeMutation(
  source: Pattern,
  baseline: Pattern,
  effectiveSeed: string,
  mutationId: string,
  style: BeatStyleId,
  targetIntent: BeatGenerationIntent,
  amount: number,
  settings: GrooveSettings,
): MusicalMutationResult {
  assertStructuralLocks(
    mutationBaseline(source),
    baseline,
  );

  decorateProvenance(
    baseline,
    source,
    effectiveSeed,
    mutationId,
    style,
    targetIntent,
    amount,
    settings.humanization,
  );

  const grooved = applyGroove({
    source: baseline,
    seed: settings.seed,
    personality: settings.personality,
    humanization: settings.humanization,
    ghostNoteAmount: settings.ghostNoteAmount,
    swing: settings.swing,
  });

  grooved.pattern.id = "pattern-mut-" + shortSeed(effectiveSeed);
  grooved.pattern.name =
    mutationId.replace("mutation:", "").replace("field:", "FIELD ").toUpperCase() +
    " / " +
    shortSeed(effectiveSeed);

  const sourceValidation = validateGeneratedBeat(source, style);
  const validation = validateGeneratedBeat(grooved.pattern, style);
  const isBreak = mutationId === "mutation:break";
  const isWeird = mutationId === "mutation:weird";
  const maximumFloor = isBreak ? 58 : isWeird ? 64 : 72;
  const allowedDrop = isBreak ? 45 : isWeird ? 32 : 22;
  const minimumScore = Math.min(
    maximumFloor,
    Math.max(42, sourceValidation.score - allowedDrop),
  );
  const allowedCritical = new Set<string>();
  if (isBreak) {
    allowedCritical.add("house pulse lost four-on-floor foundation");
  }

  const accepted =
    validation.score >= minimumScore &&
    !newCriticalFailure(
      sourceValidation,
      validation,
      allowedCritical,
    );

  const changes = countChanges(source, grooved.pattern);

  return {
    accepted,
    pattern: grooved.pattern,
    effectiveSeed,
    displaySeed: shortSeed(effectiveSeed),
    mutationId,
    validation,
    changedLaneIds: changes.changedLaneIds,
    changedStepCount: changes.changedStepCount,
    targetIntent,
    groove: {
      personality: settings.personality,
      humanization: settings.humanization,
      ghostNoteAmount: settings.ghostNoteAmount,
      swing: settings.swing,
    },
  };
}

export function mutateMusically(
  request: MusicalMutationRequest,
): MusicalMutationResult {
  const amount = clamp01(request.amount);
  const targetIntent = adjustIntent(
    request.intent,
    request.mutation,
    amount,
  );
  const effectiveSeed = deriveSeed(
    request.seed,
    request.mutation + ":v" + MUSICAL_MUTATION_VERSION,
  );
  const seedCode = shortSeed(effectiveSeed);
  const sourceBaseline = mutationBaseline(request.source);
  const random = new SeededRandom(
    deriveSeed(effectiveSeed, "transform"),
  );

  let baseline: Pattern;

  if (request.mutation === "funkier" || request.mutation === "weird") {
    try {
      const rerolled = rerollBeat({
        source: sourceBaseline,
        seed: deriveSeed(effectiveSeed, "derive"),
        style: request.mutation === "funkier" ? "funk" : request.style,
        intent: targetIntent,
        distance:
          request.mutation === "funkier"
            ? 0.2 + amount * 0.45
            : 0.4 + amount * 0.45,
        bpm: request.bpm,
      });

      baseline = resetGroove(
        rerolled.accepted ? rerolled.pattern : sourceBaseline,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes("locked")
      ) {
        baseline = sourceBaseline;
      } else {
        throw error;
      }
    }
  } else {
    baseline = directMutation(
      sourceBaseline,
      request.mutation,
      amount,
      random,
      seedCode,
    );
  }

  const settings = adjustGroove(
    grooveSettings(request.source),
    request.mutation,
    amount,
    targetIntent,
  );

  return finalizeMutation(
    request.source,
    baseline,
    effectiveSeed,
    "mutation:" + request.mutation,
    request.mutation === "funkier" ? "funk" : request.style,
    targetIntent,
    amount,
    settings,
  );
}

function densityMetric(pattern: Pattern): number {
  const total = pattern.lanes.reduce(
    (sum, laneValue) => sum + laneValue.events.length,
    0,
  );
  return clamp01(
    total /
      Math.max(1, stepCount(pattern) * pattern.lanes.length * 0.36),
  );
}

function syncopationMetric(pattern: Pattern): number {
  let primary = 0;
  let offbeat = 0;

  for (const laneValue of pattern.lanes) {
    if (
      !["kick", "snare", "clap", "tom", "percussion"].includes(
        laneValue.role,
      )
    ) {
      continue;
    }

    for (const event of laneValue.events) {
      primary += 1;
      if (stepOf(event) % 4 !== 0) offbeat += 1;
    }
  }

  return primary > 0 ? clamp01(offbeat / primary) : 0;
}

export function mutateGrooveField(
  request: GrooveFieldMutationRequest,
): MusicalMutationResult {
  const targetDensity = clamp01(request.targetDensity);
  const targetSyncopation = clamp01(request.targetSyncopation);
  const currentDensity = densityMetric(request.source);
  const currentSyncopation = syncopationMetric(request.source);
  const deltaDensity = targetDensity - currentDensity;
  const deltaSyncopation = targetSyncopation - currentSyncopation;
  const fieldDistance = clamp01(
    Math.sqrt(
      deltaDensity * deltaDensity +
        deltaSyncopation * deltaSyncopation,
    ) / Math.SQRT2,
  );

  const targetIntent: BeatGenerationIntent = {
    ...normalizedIntent(request.intent),
    density: targetDensity,
    syncopation: targetSyncopation,
    complexity: clamp01(
      request.intent.complexity +
        Math.abs(deltaSyncopation) * 0.18,
    ),
  };

  const effectiveSeed = deriveSeed(
    request.seed,
    "field:" +
      Math.round(targetDensity * 100) +
      ":" +
      Math.round(targetSyncopation * 100),
  );
  const baseline = mutationBaseline(request.source);

  const rerolled = rerollBeat({
    source: baseline,
    seed: deriveSeed(effectiveSeed, "derive"),
    style: request.style,
    intent: targetIntent,
    distance: clamp01(0.08 + fieldDistance * 0.82),
    bpm: request.bpm,
  });

  const derivedBaseline = resetGroove(
    rerolled.accepted ? rerolled.pattern : baseline,
  );
  const settings = grooveSettings(request.source);

  return finalizeMutation(
    request.source,
    derivedBaseline,
    effectiveSeed,
    "field:" +
      Math.round(targetSyncopation * 100) +
      ":" +
      Math.round(targetDensity * 100),
    request.style,
    targetIntent,
    fieldDistance,
    settings,
  );
}

export const MUSICAL_MUTATION_META = Object.freeze({
  generatorId: MUSICAL_MUTATION_ID,
  generatorVersion: MUSICAL_MUTATION_VERSION,
  commands: MUSICAL_MUTATIONS.map((entry) => entry.id),
});
