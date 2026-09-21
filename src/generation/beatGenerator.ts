import {
  PPQ,
  type IntentVector,
  type Meter,
  type Pattern,
  type PatternLane,
  type StepEvent,
  type StyleVector,
} from "../domain/contracts";
import {
  FOUNDATION_STEP_TICKS,
  SEQUENCER_LANES,
} from "../music/foundationPattern";
import { SeededRandom, deriveSeed, shortSeed } from "./prng";

export const BEAT_GENERATOR_ID = "beat-generator";
export const BEAT_GENERATOR_VERSION = 1;

export type BeatStyleId =
  | "rock"
  | "funk"
  | "hipHop"
  | "house"
  | "trap"
  | "breakbeat"
  | "electronic";

export interface BeatStyleDefinition {
  id: BeatStyleId;
  label: string;
  code: string;
  baseSwing: number;
}

export const BEAT_STYLES: readonly BeatStyleDefinition[] = [
  { id: "rock", label: "ROCK", code: "RCK", baseSwing: 0 },
  { id: "funk", label: "FUNK", code: "FNK", baseSwing: 0.08 },
  { id: "hipHop", label: "HIP-HOP", code: "HHP", baseSwing: 0.06 },
  { id: "house", label: "HOUSE", code: "HSE", baseSwing: 0 },
  { id: "trap", label: "TRAP", code: "TRP", baseSwing: 0.02 },
  { id: "breakbeat", label: "BREAKS", code: "BRK", baseSwing: 0.04 },
  { id: "electronic", label: "ELECTRO", code: "ELC", baseSwing: 0 },
];

export interface BeatGenerationIntent {
  energy: number;
  density: number;
  complexity: number;
  syncopation: number;
  swing: number;
}

export interface BeatGenerationRequest {
  seed: string;
  style: BeatStyleId;
  intent: BeatGenerationIntent;
  stepCount: 4 | 8 | 16;
  bpm: number;
  meter?: Meter;
}

export interface BeatValidationMetrics {
  totalHits: number;
  kickHits: number;
  backbeatHits: number;
  hatHits: number;
  percussionHits: number;
  maxSimultaneousHits: number;
  syncopatedKickHits: number;
}

export interface BeatValidation {
  valid: boolean;
  score: number;
  reasons: string[];
  metrics: BeatValidationMetrics;
}

export interface BeatGenerationResult {
  pattern: Pattern;
  effectiveSeed: string;
  displaySeed: string;
  attempts: number;
  validation: BeatValidation;
}

type Grid = Map<string, number[]>;

const MAX_ATTEMPTS = 12;
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

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizeIntent(intent: BeatGenerationIntent): BeatGenerationIntent {
  return {
    energy: clamp01(intent.energy),
    density: clamp01(intent.density),
    complexity: clamp01(intent.complexity),
    syncopation: clamp01(intent.syncopation),
    swing: clamp01(intent.swing),
  };
}

function makeGrid(stepCount: number): Grid {
  return new Map(
    SEQUENCER_LANES.map((lane) => [
      lane.id,
      Array.from({ length: stepCount }, () => 0),
    ]),
  );
}

function lane(grid: Grid, laneId: string): number[] {
  const values = grid.get(laneId);
  if (!values) throw new Error("Unknown generator lane: " + laneId);
  return values;
}

function setHit(
  grid: Grid,
  laneId: string,
  step: number,
  velocity: number,
): void {
  const values = lane(grid, laneId);
  if (step < 0 || step >= values.length) return;
  values[step] = Math.max(values[step], clamp01(velocity));
}

function maybeHit(
  random: SeededRandom,
  grid: Grid,
  laneId: string,
  step: number,
  probability: number,
  velocity: number,
): void {
  if (random.chance(probability)) {
    setHit(grid, laneId, step, velocity);
  }
}

function varyVelocity(
  random: SeededRandom,
  base: number,
  intent: BeatGenerationIntent,
  spread = 0.11,
): number {
  const energyLift = (intent.energy - 0.5) * 0.16;
  const value = base + energyLift + random.range(-spread, spread);
  return Math.min(1, Math.max(0.12, value));
}

function backbeatSteps(stepCount: number): number[] {
  if (stepCount <= 4) return [2];
  if (stepCount <= 8) return [4];
  return [4, 12];
}

function quarterSteps(stepCount: number): number[] {
  if (stepCount <= 4) return [0];
  if (stepCount <= 8) return [0, 4];
  return [0, 4, 8, 12];
}

function eighthSteps(stepCount: number): number[] {
  return Array.from({ length: stepCount }, (_, index) => index).filter(
    (index) => index % 2 === 0,
  );
}

function offbeatEighthSteps(stepCount: number): number[] {
  return Array.from({ length: stepCount }, (_, index) => index).filter(
    (index) => index % 4 === 2,
  );
}

function oddSixteenths(stepCount: number): number[] {
  return Array.from({ length: stepCount }, (_, index) => index).filter(
    (index) => index % 2 === 1,
  );
}

function addBackbeat(
  random: SeededRandom,
  grid: Grid,
  intent: BeatGenerationIntent,
  laneId = LANE.snare,
): void {
  const steps = backbeatSteps(lane(grid, laneId).length);
  for (const step of steps) {
    setHit(
      grid,
      laneId,
      step,
      varyVelocity(random, 0.88, intent, 0.06),
    );
  }
}

function generateRock(
  random: SeededRandom,
  grid: Grid,
  intent: BeatGenerationIntent,
): void {
  const steps = lane(grid, LANE.kick).length;
  setHit(grid, LANE.kick, 0, varyVelocity(random, 0.94, intent, 0.05));
  addBackbeat(random, grid, intent);

  for (const step of eighthSteps(steps)) {
    const accent = step % 4 === 0 ? 0.68 : 0.48;
    maybeHit(
      random,
      grid,
      LANE.closedHat,
      step,
      0.72 + intent.density * 0.26,
      varyVelocity(random, accent, intent, 0.07),
    );
  }

  const kickCandidates =
    steps >= 16 ? [6, 8, 10, 14] : steps >= 8 ? [3, 6] : [3];
  for (const step of kickCandidates) {
    const offbeat = step % 4 !== 0;
    const probability =
      0.18 +
      intent.density * 0.26 +
      intent.complexity * 0.18 +
      (offbeat ? intent.syncopation * 0.22 : 0.12);
    maybeHit(
      random,
      grid,
      LANE.kick,
      step,
      probability,
      varyVelocity(random, offbeat ? 0.68 : 0.84, intent),
    );
  }

  if (intent.energy > 0.46) {
    setHit(
      grid,
      LANE.crash,
      0,
      varyVelocity(random, 0.66 + intent.energy * 0.2, intent, 0.04),
    );
  }

  const last = steps - 1;
  maybeHit(
    random,
    grid,
    LANE.openHat,
    last,
    0.08 + intent.energy * 0.35 + intent.complexity * 0.16,
    varyVelocity(random, 0.5, intent),
  );

  if (steps >= 8 && intent.complexity > 0.58) {
    maybeHit(
      random,
      grid,
      LANE.tom,
      last - 1,
      intent.complexity * 0.52,
      varyVelocity(random, 0.52, intent),
    );
    maybeHit(
      random,
      grid,
      LANE.tom,
      last,
      intent.complexity * 0.62,
      varyVelocity(random, 0.7, intent),
    );
  }
}

function generateFunk(
  random: SeededRandom,
  grid: Grid,
  intent: BeatGenerationIntent,
): void {
  const steps = lane(grid, LANE.kick).length;
  setHit(grid, LANE.kick, 0, varyVelocity(random, 0.9, intent, 0.05));
  addBackbeat(random, grid, intent);

  const hatChance = 0.56 + intent.density * 0.4;
  for (let step = 0; step < steps; step += 1) {
    const base =
      step % 4 === 0
        ? 0.68
        : step % 2 === 0
          ? 0.5
          : 0.34;
    maybeHit(
      random,
      grid,
      LANE.closedHat,
      step,
      hatChance,
      varyVelocity(random, base, intent, 0.08),
    );
  }

  const kickCandidates =
    steps >= 16
      ? [3, 6, 9, 10, 14]
      : steps >= 8
        ? [3, 6, 7]
        : [1, 3];
  for (const step of kickCandidates) {
    maybeHit(
      random,
      grid,
      LANE.kick,
      step,
      0.16 +
        intent.density * 0.25 +
        intent.syncopation * 0.48 +
        intent.complexity * 0.12,
      varyVelocity(random, 0.68, intent, 0.13),
    );
  }

  const ghostCandidates =
    steps >= 16 ? [3, 7, 11, 15] : oddSixteenths(steps);
  for (const step of ghostCandidates) {
    maybeHit(
      random,
      grid,
      LANE.snare,
      step,
      0.06 + intent.complexity * 0.43 + intent.syncopation * 0.16,
      random.range(0.16, 0.3),
    );
  }

  for (const step of offbeatEighthSteps(steps)) {
    maybeHit(
      random,
      grid,
      LANE.openHat,
      step,
      0.04 + intent.energy * 0.16 + intent.complexity * 0.12,
      varyVelocity(random, 0.43, intent, 0.07),
    );
  }

  const percCandidates =
    steps >= 16 ? [2, 5, 10, 13] : oddSixteenths(steps);
  for (const step of percCandidates) {
    maybeHit(
      random,
      grid,
      LANE.percussion,
      step,
      0.08 + intent.complexity * 0.32 + intent.syncopation * 0.22,
      varyVelocity(random, 0.38, intent, 0.1),
    );
  }
}

function generateHipHop(
  random: SeededRandom,
  grid: Grid,
  intent: BeatGenerationIntent,
): void {
  const steps = lane(grid, LANE.kick).length;
  setHit(grid, LANE.kick, 0, varyVelocity(random, 0.91, intent, 0.07));
  addBackbeat(random, grid, intent);

  const kickCandidates =
    steps >= 16 ? [3, 7, 10, 14, 15] : steps >= 8 ? [3, 6, 7] : [3];
  for (const step of kickCandidates) {
    const probability =
      0.1 +
      intent.density * 0.3 +
      intent.syncopation * 0.35 +
      intent.complexity * 0.12;
    maybeHit(
      random,
      grid,
      LANE.kick,
      step,
      probability,
      varyVelocity(random, 0.72, intent, 0.14),
    );
  }

  for (const step of eighthSteps(steps)) {
    maybeHit(
      random,
      grid,
      LANE.closedHat,
      step,
      0.76 + intent.density * 0.2,
      varyVelocity(random, step % 4 === 0 ? 0.58 : 0.42, intent, 0.09),
    );
  }

  if (intent.density + intent.complexity > 0.92) {
    for (const step of oddSixteenths(steps)) {
      maybeHit(
        random,
        grid,
        LANE.closedHat,
        step,
        0.06 + intent.density * 0.28 + intent.complexity * 0.16,
        varyVelocity(random, 0.28, intent, 0.07),
      );
    }
  }

  for (const step of backbeatSteps(steps)) {
    maybeHit(
      random,
      grid,
      LANE.clap,
      step,
      0.2 + intent.energy * 0.5,
      varyVelocity(random, 0.52, intent, 0.08),
    );
  }

  maybeHit(
    random,
    grid,
    LANE.openHat,
    steps - 1,
    0.05 + intent.complexity * 0.3 + intent.energy * 0.18,
    varyVelocity(random, 0.45, intent),
  );
}

function generateHouse(
  random: SeededRandom,
  grid: Grid,
  intent: BeatGenerationIntent,
): void {
  const steps = lane(grid, LANE.kick).length;

  for (const step of quarterSteps(steps)) {
    setHit(
      grid,
      LANE.kick,
      step,
      varyVelocity(random, 0.88, intent, 0.05),
    );
  }

  addBackbeat(random, grid, intent, LANE.clap);

  for (const step of offbeatEighthSteps(steps)) {
    setHit(
      grid,
      LANE.openHat,
      step,
      varyVelocity(random, 0.54 + intent.energy * 0.14, intent, 0.06),
    );
  }

  for (const step of eighthSteps(steps)) {
    maybeHit(
      random,
      grid,
      LANE.closedHat,
      step,
      0.2 + intent.density * 0.45,
      varyVelocity(random, 0.34, intent, 0.06),
    );
  }

  const percCandidates =
    steps >= 16 ? [3, 7, 11, 15] : oddSixteenths(steps);
  for (const step of percCandidates) {
    maybeHit(
      random,
      grid,
      LANE.percussion,
      step,
      0.08 + intent.complexity * 0.34 + intent.syncopation * 0.18,
      varyVelocity(random, 0.34, intent, 0.08),
    );
  }

  if (intent.energy > 0.45) {
    setHit(
      grid,
      LANE.crash,
      0,
      varyVelocity(random, 0.58 + intent.energy * 0.2, intent, 0.05),
    );
  }
}

function generateTrap(
  random: SeededRandom,
  grid: Grid,
  intent: BeatGenerationIntent,
): void {
  const steps = lane(grid, LANE.kick).length;
  setHit(grid, LANE.kick, 0, varyVelocity(random, 0.94, intent, 0.06));
  addBackbeat(random, grid, intent, LANE.clap);

  const kickCandidates =
    steps >= 16 ? [3, 7, 10, 14, 15] : steps >= 8 ? [3, 6, 7] : [1, 3];
  for (const step of kickCandidates) {
    maybeHit(
      random,
      grid,
      LANE.kick,
      step,
      0.1 +
        intent.density * 0.25 +
        intent.syncopation * 0.46 +
        intent.complexity * 0.15,
      varyVelocity(random, 0.76, intent, 0.14),
    );
  }

  for (let step = 0; step < steps; step += 1) {
    const primary = step % 2 === 0;
    maybeHit(
      random,
      grid,
      LANE.closedHat,
      step,
      primary
        ? 0.78 + intent.density * 0.2
        : 0.1 + intent.density * 0.48 + intent.complexity * 0.24,
      varyVelocity(
        random,
        primary ? (step % 4 === 0 ? 0.55 : 0.43) : 0.27,
        intent,
        0.08,
      ),
    );
  }

  const openCandidates =
    steps >= 16 ? [7, 15] : steps >= 8 ? [7] : [3];
  for (const step of openCandidates) {
    maybeHit(
      random,
      grid,
      LANE.openHat,
      step,
      0.06 + intent.energy * 0.22 + intent.complexity * 0.28,
      varyVelocity(random, 0.48, intent, 0.08),
    );
  }

  maybeHit(
    random,
    grid,
    LANE.percussion,
    Math.max(0, steps - 2),
    0.04 + intent.complexity * 0.28,
    varyVelocity(random, 0.36, intent),
  );
}

function generateBreakbeat(
  random: SeededRandom,
  grid: Grid,
  intent: BeatGenerationIntent,
): void {
  const steps = lane(grid, LANE.kick).length;
  setHit(grid, LANE.kick, 0, varyVelocity(random, 0.92, intent, 0.05));
  addBackbeat(random, grid, intent);

  const kickCandidates =
    steps >= 16 ? [6, 10, 14] : steps >= 8 ? [3, 6] : [3];
  for (const step of kickCandidates) {
    maybeHit(
      random,
      grid,
      LANE.kick,
      step,
      0.3 +
        intent.density * 0.25 +
        intent.syncopation * 0.28 +
        intent.complexity * 0.12,
      varyVelocity(random, 0.74, intent, 0.11),
    );
  }

  for (const step of eighthSteps(steps)) {
    maybeHit(
      random,
      grid,
      LANE.closedHat,
      step,
      0.7 + intent.density * 0.25,
      varyVelocity(random, 0.45, intent, 0.09),
    );
  }

  for (const step of oddSixteenths(steps)) {
    maybeHit(
      random,
      grid,
      LANE.closedHat,
      step,
      0.04 + intent.complexity * 0.25 + intent.density * 0.18,
      varyVelocity(random, 0.27, intent, 0.08),
    );
  }

  maybeHit(
    random,
    grid,
    LANE.snare,
    steps - 1,
    0.08 + intent.complexity * 0.38,
    random.range(0.18, 0.32),
  );

  const percCandidates =
    steps >= 16 ? [2, 9, 13] : oddSixteenths(steps);
  for (const step of percCandidates) {
    maybeHit(
      random,
      grid,
      LANE.percussion,
      step,
      0.06 + intent.syncopation * 0.25 + intent.complexity * 0.25,
      varyVelocity(random, 0.35, intent),
    );
  }

  maybeHit(
    random,
    grid,
    LANE.openHat,
    Math.max(0, steps - 1),
    0.08 + intent.energy * 0.24 + intent.complexity * 0.18,
    varyVelocity(random, 0.48, intent),
  );
}

function generateElectronic(
  random: SeededRandom,
  grid: Grid,
  intent: BeatGenerationIntent,
): void {
  const steps = lane(grid, LANE.kick).length;
  setHit(grid, LANE.kick, 0, varyVelocity(random, 0.92, intent, 0.05));

  const fourOnFloor =
    intent.density > 0.62 || intent.energy > 0.68;
  if (fourOnFloor) {
    for (const step of quarterSteps(steps)) {
      setHit(
        grid,
        LANE.kick,
        step,
        varyVelocity(random, 0.84, intent, 0.07),
      );
    }
  } else {
    addBackbeat(random, grid, intent, LANE.clap);
    const kickCandidates =
      steps >= 16 ? [6, 9, 14] : steps >= 8 ? [3, 6] : [3];
    for (const step of kickCandidates) {
      maybeHit(
        random,
        grid,
        LANE.kick,
        step,
        0.15 + intent.syncopation * 0.4 + intent.density * 0.22,
        varyVelocity(random, 0.7, intent),
      );
    }
  }

  for (const step of eighthSteps(steps)) {
    maybeHit(
      random,
      grid,
      LANE.closedHat,
      step,
      0.52 + intent.density * 0.4,
      varyVelocity(random, 0.42, intent, 0.1),
    );
  }

  const percCandidates =
    steps >= 16 ? [3, 7, 11, 15] : oddSixteenths(steps);
  for (const step of percCandidates) {
    maybeHit(
      random,
      grid,
      LANE.percussion,
      step,
      0.12 + intent.complexity * 0.34 + intent.syncopation * 0.2,
      varyVelocity(random, 0.38, intent, 0.11),
    );
  }

  if (!fourOnFloor) {
    for (const step of backbeatSteps(steps)) {
      maybeHit(
        random,
        grid,
        LANE.snare,
        step,
        0.25 + intent.energy * 0.4,
        varyVelocity(random, 0.66, intent),
      );
    }
  } else {
    addBackbeat(random, grid, intent, LANE.clap);
  }

  for (const step of offbeatEighthSteps(steps)) {
    maybeHit(
      random,
      grid,
      LANE.openHat,
      step,
      0.08 + intent.energy * 0.25 + intent.complexity * 0.16,
      varyVelocity(random, 0.46, intent),
    );
  }

  if (intent.energy > 0.5) {
    maybeHit(
      random,
      grid,
      LANE.crash,
      0,
      0.55 + intent.energy * 0.35,
      varyVelocity(random, 0.64, intent),
    );
  }
}

function generateStyle(
  style: BeatStyleId,
  random: SeededRandom,
  grid: Grid,
  intent: BeatGenerationIntent,
): void {
  switch (style) {
    case "rock":
      generateRock(random, grid, intent);
      break;
    case "funk":
      generateFunk(random, grid, intent);
      break;
    case "hipHop":
      generateHipHop(random, grid, intent);
      break;
    case "house":
      generateHouse(random, grid, intent);
      break;
    case "trap":
      generateTrap(random, grid, intent);
      break;
    case "breakbeat":
      generateBreakbeat(random, grid, intent);
      break;
    case "electronic":
      generateElectronic(random, grid, intent);
      break;
  }
}

function effectiveSwing(
  style: BeatStyleId,
  requestedSwing: number,
): number {
  const definition = BEAT_STYLES.find((entry) => entry.id === style);
  return clamp01((definition?.baseSwing ?? 0) + requestedSwing * 0.7);
}

function timingOffsetUs(
  stepIndex: number,
  bpm: number,
  swing: number,
): number {
  if (stepIndex % 2 === 0 || swing <= 0) return 0;

  const safeBpm = Math.min(300, Math.max(30, bpm));
  const sixteenthSeconds = 60 / safeBpm / 4;
  return Math.round(sixteenthSeconds * swing * 0.3 * 1_000_000);
}

function styleVector(style: BeatStyleId): StyleVector {
  return { [style]: 1 };
}

function intentVector(intent: BeatGenerationIntent): IntentVector {
  return {
    energy: intent.energy,
    density: intent.density,
    complexity: intent.complexity,
    syncopation: intent.syncopation,
    space: clamp01(1 - intent.density),
    swing: intent.swing,
    humanization: 0,
    mutationDistance: 1,
  };
}

function buildPattern(
  request: BeatGenerationRequest,
  effectiveSeed: string,
  grid: Grid,
): Pattern {
  const style = BEAT_STYLES.find((entry) => entry.id === request.style);
  const swing = effectiveSwing(request.style, request.intent.swing);
  const seedCode = shortSeed(effectiveSeed);

  const lanes: PatternLane[] = SEQUENCER_LANES.map((definition) => {
    const values = lane(grid, definition.id);
    const events: StepEvent[] = [];

    values.forEach((velocity, stepIndex) => {
      if (velocity <= 0) return;

      events.push({
        id:
          "evt-gen-" +
          seedCode +
          "-" +
          definition.code.toLowerCase() +
          "-" +
          stepIndex,
        tick: stepIndex * FOUNDATION_STEP_TICKS,
        velocity,
        probability: 1,
        timingOffsetUs: timingOffsetUs(
          stepIndex,
          request.bpm,
          swing,
        ),
        accent:
          velocity >= 0.85
            ? "accent"
            : velocity <= 0.3
              ? "ghost"
              : "normal",
        generatorTags: [
          BEAT_GENERATOR_ID,
          request.style,
          "v" + BEAT_GENERATOR_VERSION,
        ],
      });
    });

    return {
      id: definition.id,
      role: definition.role,
      kitSlotId: definition.kitSlotId,
      events,
      muted: false,
      solo: false,
      lock: {
        rhythm: false,
        sound: false,
        dynamics: false,
        timing: false,
      },
    };
  });

  return {
    id: "pattern-gen-" + seedCode,
    name: (style?.label ?? request.style.toUpperCase()) + " / " + seedCode,
    meter: request.meter ?? { numerator: 4, denominator: 4 },
    ppq: PPQ,
    lengthTicks: request.stepCount * FOUNDATION_STEP_TICKS,
    lanes,
    groove: {
      swing,
      humanization: 0,
      personality:
        request.style === "funk" || request.style === "hipHop"
          ? "deep"
          : request.style === "house"
            ? "tight"
            : "human",
    },
    provenance: {
      seed: effectiveSeed,
      generatorId: BEAT_GENERATOR_ID,
      generatorVersion: BEAT_GENERATOR_VERSION,
      style: styleVector(request.style),
      intent: intentVector(request.intent),
    },
  };
}

function countLane(pattern: Pattern, laneId: string): number {
  return pattern.lanes.find((entry) => entry.id === laneId)?.events.length ?? 0;
}

function countBackbeats(pattern: Pattern): number {
  const backbeats = new Set(backbeatSteps(pattern.lengthTicks / FOUNDATION_STEP_TICKS));
  let count = 0;

  for (const laneId of [LANE.snare, LANE.clap]) {
    const laneValue = pattern.lanes.find((entry) => entry.id === laneId);
    if (!laneValue) continue;

    for (const event of laneValue.events) {
      const step = Math.round(event.tick / FOUNDATION_STEP_TICKS);
      if (backbeats.has(step)) count += 1;
    }
  }

  return count;
}

function countSyncopatedKicks(pattern: Pattern): number {
  const laneValue = pattern.lanes.find((entry) => entry.id === LANE.kick);
  if (!laneValue) return 0;

  return laneValue.events.filter((event) => {
    const step = Math.round(event.tick / FOUNDATION_STEP_TICKS);
    return step % 4 !== 0;
  }).length;
}

export function validateGeneratedBeat(
  pattern: Pattern,
  style: BeatStyleId,
): BeatValidation {
  const stepCount = Math.max(
    1,
    Math.round(pattern.lengthTicks / FOUNDATION_STEP_TICKS),
  );
  const kickHits = countLane(pattern, LANE.kick);
  const snareHits = countLane(pattern, LANE.snare);
  const clapHits = countLane(pattern, LANE.clap);
  const hatHits =
    countLane(pattern, LANE.closedHat) +
    countLane(pattern, LANE.openHat);
  const percussionHits =
    countLane(pattern, LANE.percussion) +
    countLane(pattern, LANE.tom);
  const backbeatHits = countBackbeats(pattern);
  const syncopatedKickHits = countSyncopatedKicks(pattern);
  const totalHits = pattern.lanes.reduce(
    (sum, laneValue) => sum + laneValue.events.length,
    0,
  );

  let maxSimultaneousHits = 0;
  for (let step = 0; step < stepCount; step += 1) {
    const tick = step * FOUNDATION_STEP_TICKS;
    const simultaneous = pattern.lanes.filter((laneValue) =>
      laneValue.events.some((event) => event.tick === tick),
    ).length;
    maxSimultaneousHits = Math.max(maxSimultaneousHits, simultaneous);
  }

  const metrics: BeatValidationMetrics = {
    totalHits,
    kickHits,
    backbeatHits,
    hatHits,
    percussionHits,
    maxSimultaneousHits,
    syncopatedKickHits,
  };

  const reasons: string[] = [];
  let score = 100;

  if (kickHits === 0) {
    reasons.push("missing kick foundation");
    score -= 50;
  }

  if (backbeatHits === 0 && style !== "house") {
    reasons.push("missing backbeat");
    score -= 35;
  }

  const minimumHats = Math.max(1, Math.floor(stepCount / 4));
  if (hatHits < minimumHats) {
    reasons.push("insufficient subdivision motion");
    score -= 18;
  }

  if (totalHits < Math.max(3, Math.floor(stepCount * 0.55))) {
    reasons.push("generation too empty");
    score -= 20;
  }

  if (totalHits > stepCount * 3.2) {
    reasons.push("generation too dense");
    score -= 20;
  }

  if (maxSimultaneousHits > 5) {
    reasons.push("too many stacked voices");
    score -= 15;
  }

  if (style === "house" && kickHits < quarterSteps(stepCount).length) {
    reasons.push("house pulse lost four-on-floor foundation");
    score -= 40;
  }

  if (style === "trap" && hatHits < Math.max(2, stepCount / 2)) {
    reasons.push("trap subdivision layer too sparse");
    score -= 25;
  }

  if (
    style === "funk" &&
    stepCount >= 8 &&
    syncopatedKickHits === 0
  ) {
    reasons.push("funk groove lacks syncopated kick movement");
    score -= 18;
  }

  if (snareHits + clapHits > Math.max(2, stepCount * 0.45)) {
    reasons.push("backbeat layer overcrowded");
    score -= 12;
  }

  score = Math.max(0, Math.round(score));

  return {
    valid: score >= 72 && !reasons.some((reason) =>
      reason === "missing kick foundation" ||
      reason === "missing backbeat" ||
      reason === "house pulse lost four-on-floor foundation"
    ),
    score,
    reasons,
    metrics,
  };
}

export function generateBeat(
  requestInput: BeatGenerationRequest,
): BeatGenerationResult {
  const request: BeatGenerationRequest = {
    ...requestInput,
    intent: normalizeIntent(requestInput.intent),
    stepCount:
      requestInput.stepCount === 4 ||
      requestInput.stepCount === 8 ||
      requestInput.stepCount === 16
        ? requestInput.stepCount
        : 16,
  };

  let bestResult: BeatGenerationResult | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const effectiveSeed = deriveSeed(
      request.seed,
      request.style + ":attempt:" + attempt,
    );
    const random = new SeededRandom(effectiveSeed);
    const grid = makeGrid(request.stepCount);
    generateStyle(request.style, random, grid, request.intent);

    const pattern = buildPattern(
      request,
      effectiveSeed,
      grid,
    );
    const validation = validateGeneratedBeat(pattern, request.style);
    const result: BeatGenerationResult = {
      pattern,
      effectiveSeed,
      displaySeed: shortSeed(effectiveSeed),
      attempts: attempt + 1,
      validation,
    };

    if (!bestResult || validation.score > bestResult.validation.score) {
      bestResult = result;
    }

    if (validation.valid) {
      return result;
    }
  }

  if (!bestResult) {
    throw new Error("Beat Generator failed to produce a candidate.");
  }

  return bestResult;
}
