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
import { applyGroove } from "../groove/grooveEngine";
import {
  STYLE_DNA_PROFILES,
  STYLE_DNA_VERSION,
  getStyleDNA,
  type RhythmArchetype,
  type StyleDNAId,
  type StyleDNAProfile,
} from "../style/styleDNA";

export const BEAT_GENERATOR_ID = "beat-generator";
export const BEAT_GENERATOR_VERSION = 2;

export type BeatStyleId = StyleDNAId;

export interface BeatStyleDefinition {
  id: BeatStyleId;
  label: string;
  code: string;
  baseSwing: number;
  family: StyleDNAProfile["family"];
  archetype: RhythmArchetype;
}

export const BEAT_STYLES: readonly BeatStyleDefinition[] =
  STYLE_DNA_PROFILES.map((profile) => ({
    id: profile.id,
    label: profile.label,
    code: profile.code,
    baseSwing: profile.baseSwing,
    family: profile.family,
    archetype: profile.archetype,
  }));

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
  stepCount: 4 | 8 | 16 | 32 | 64;
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
  return Array.from({ length: stepCount }, (_, index) => index).filter(
    (index) => index % 8 === 4,
  );
}

function quarterSteps(stepCount: number): number[] {
  return Array.from({ length: stepCount }, (_, index) => index).filter(
    (index) => index % 4 === 0,
  );
}

function extendSixteenStepMotif(
  grid: Grid,
  stepCount: number,
  random: SeededRandom,
): void {
  if (stepCount <= 16) return;

  for (const values of grid.values()) {
    for (let blockStart = 16; blockStart < stepCount; blockStart += 16) {
      for (let offset = 0; offset < 16 && blockStart + offset < stepCount; offset += 1) {
        if (values[blockStart + offset] > 0) continue;
        const source = values[offset];
        if (source <= 0) continue;

        const variation = random.range(0.92, 1.04);
        values[blockStart + offset] = Math.min(1, source * variation);
      }
    }
  }
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
  laneId: string = LANE.snare,
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

function generateArchetype(
  archetype: RhythmArchetype,
  random: SeededRandom,
  grid: Grid,
  intent: BeatGenerationIntent,
): void {
  switch (archetype) {
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

function clearStep(values: number[], step: number): void {
  if (step < 0 || step >= values.length) return;
  values[step] = 0;
}

function applyStyleDNA(
  random: SeededRandom,
  grid: Grid,
  intent: BeatGenerationIntent,
  dna: StyleDNAProfile,
): void {
  const steps = lane(grid, LANE.kick).length;
  const rhythm = dna.rhythm;

  if (rhythm.halfTime >= 0.6 && steps >= 8) {
    const snare = lane(grid, LANE.snare);
    const clap = lane(grid, LANE.clap);
    for (let step = 0; step < steps; step += 1) {
      if (step % 16 === 4 || step % 16 === 12) {
        clearStep(snare, step);
        clearStep(clap, step);
      }
      if (step % 16 === 8) {
        const target = rhythm.clapBlend >= 0.5 ? LANE.clap : LANE.snare;
        setHit(
          grid,
          target,
          step,
          varyVelocity(random, 0.88, intent, 0.06),
        );
      }
    }
  }

  if (rhythm.fourOnFloor > 0) {
    for (const step of quarterSteps(steps)) {
      const probability =
        rhythm.fourOnFloor >= 0.85
          ? 1
          : rhythm.fourOnFloor * (0.62 + intent.energy * 0.3);
      maybeHit(
        random,
        grid,
        LANE.kick,
        step,
        probability,
        varyVelocity(random, 0.86, intent, 0.05),
      );
    }
  }

  const syncCandidates = Array.from(
    { length: steps },
    (_, step) => step,
  ).filter((step) => step % 4 !== 0);
  for (const step of syncCandidates) {
    maybeHit(
      random,
      grid,
      LANE.kick,
      step,
      rhythm.kickSyncopation *
        (0.06 + intent.syncopation * 0.2 + intent.complexity * 0.08),
      varyVelocity(random, 0.66, intent, 0.12),
    );
  }

  for (const step of backbeatSteps(steps)) {
    if (rhythm.halfTime >= 0.6) continue;
    maybeHit(
      random,
      grid,
      LANE.snare,
      step,
      rhythm.backbeatStrength * 0.45,
      varyVelocity(random, 0.82, intent, 0.07),
    );
    maybeHit(
      random,
      grid,
      LANE.clap,
      step,
      rhythm.clapBlend * 0.7,
      varyVelocity(random, 0.58, intent, 0.08),
    );
  }

  for (const step of oddSixteenths(steps)) {
    maybeHit(
      random,
      grid,
      LANE.closedHat,
      step,
      rhythm.hatSixteenth *
        (0.18 + intent.density * 0.42 + intent.complexity * 0.2),
      varyVelocity(random, 0.28, intent, 0.07),
    );
  }

  for (const step of offbeatEighthSteps(steps)) {
    maybeHit(
      random,
      grid,
      LANE.openHat,
      step,
      rhythm.openHat * (0.2 + intent.energy * 0.34),
      varyVelocity(random, 0.48, intent, 0.07),
    );
  }

  for (let step = 1; step < steps; step += 2) {
    maybeHit(
      random,
      grid,
      LANE.percussion,
      step,
      rhythm.percussion *
        (0.08 + intent.syncopation * 0.18 + intent.complexity * 0.12),
      varyVelocity(random, 0.36, intent, 0.1),
    );
  }

  const phraseStart = Math.max(0, steps - Math.min(4, steps));
  for (let step = phraseStart; step < steps; step += 1) {
    maybeHit(
      random,
      grid,
      LANE.tom,
      step,
      rhythm.toms *
        (0.05 + intent.complexity * 0.18 + intent.energy * 0.08),
      varyVelocity(random, 0.48 + (step - phraseStart) * 0.06, intent, 0.08),
    );
  }

  maybeHit(
    random,
    grid,
    LANE.crash,
    0,
    rhythm.crash * (0.22 + intent.energy * 0.55),
    varyVelocity(random, 0.68, intent, 0.05),
  );

  const ghostSteps = Array.from(
    { length: steps },
    (_, step) => step,
  ).filter((step) => step % 4 === 1 || step % 4 === 3);
  for (const step of ghostSteps) {
    maybeHit(
      random,
      grid,
      LANE.snare,
      step,
      rhythm.ghostNotes *
        (0.06 + intent.complexity * 0.15),
      random.range(0.14, 0.28),
    );
  }
}

function applyAdvancedStyleVocabulary(
  pattern: Pattern,
  dna: StyleDNAProfile,
  seed: string,
  intent: BeatGenerationIntent,
): Pattern {
  const next: Pattern = {
    ...pattern,
    lanes: pattern.lanes.map((laneValue) => ({
      ...laneValue,
      events: laneValue.events.map((event) => ({ ...event })),
    })),
  };
  const random = new SeededRandom(
    deriveSeed(seed, "style-advanced"),
  );

  for (const laneValue of next.lanes) {
    for (const event of laneValue.events) {
      const step = Math.round(
        event.tick / FOUNDATION_STEP_TICKS,
      );
      const latePhrase =
        step >= Math.max(
          0,
          next.lengthTicks / FOUNDATION_STEP_TICKS - 4,
        );

      if (
        laneValue.role === "closedHat" &&
        dna.rhythm.ratchets > 0 &&
        random.chance(
          dna.rhythm.ratchets *
            (0.04 + intent.complexity * 0.12),
        )
      ) {
        event.ratchetCount =
          dna.subdivision === "rolling"
            ? random.int(2, 4)
            : random.int(2, 3);
      }

      if (
        latePhrase &&
        (laneValue.role === "snare" ||
          laneValue.role === "tom" ||
          laneValue.role === "percussion") &&
        dna.fill.ratchetBias > 0 &&
        random.chance(
          dna.fill.ratchetBias *
            (0.05 + intent.complexity * 0.13),
        )
      ) {
        event.ratchetCount = Math.max(
          event.ratchetCount ?? 1,
          random.int(2, 3),
        );
      }

      if (
        (laneValue.role === "snare" ||
          laneValue.role === "tom") &&
        dna.rhythm.flams > 0 &&
        random.chance(
          dna.rhythm.flams *
            (0.03 + intent.complexity * 0.08),
        )
      ) {
        event.flamOffsetUs = random.int(12_000, 28_000);
      }

      event.generatorTags = [
        ...(event.generatorTags ?? []),
        "style-dna:" + dna.id,
        "style-dna:v" + STYLE_DNA_VERSION,
      ];
    }
  }

  return next;
}

function generateStyle(
  style: BeatStyleId,
  random: SeededRandom,
  grid: Grid,
  intent: BeatGenerationIntent,
): void {
  const dna = getStyleDNA(style);
  generateArchetype(dna.archetype, random, grid, intent);
  applyStyleDNA(random, grid, intent, dna);
}

function effectiveSwing(
  style: BeatStyleId,
  requestedSwing: number,
): number {
  const dna = getStyleDNA(style);
  return clamp01(dna.baseSwing + requestedSwing * 0.7);
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
  const dna = getStyleDNA(request.style);
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
        timingOffsetUs: 0,
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
      humanization: dna.groove.humanization,
      personality: dna.groove.personality,
      ghostNoteAmount: dna.groove.ghostNotes,
      engineVersion: STYLE_DNA_VERSION,
    },
    provenance: {
      seed: effectiveSeed,
      generatorId: BEAT_GENERATOR_ID,
      generatorVersion: BEAT_GENERATOR_VERSION,
      styleDnaId: request.style,
      styleDnaVersion: STYLE_DNA_VERSION,
      style: styleVector(request.style),
      intent: intentVector(request.intent),
    },
  };
}

function countLane(pattern: Pattern, laneId: string): number {
  return pattern.lanes.find((entry) => entry.id === laneId)?.events.length ?? 0;
}

function expectedBackbeatSteps(
  style: BeatStyleId,
  stepCount: number,
): number[] {
  const dna = getStyleDNA(style);

  if (dna.rhythm.halfTime >= 0.6 && stepCount >= 8) {
    return Array.from(
      { length: stepCount },
      (_, index) => index,
    ).filter((step) => step % 16 === 8);
  }

  return backbeatSteps(stepCount);
}

function countBackbeats(
  pattern: Pattern,
  style: BeatStyleId,
): number {
  const stepCount =
    pattern.lengthTicks / FOUNDATION_STEP_TICKS;
  const backbeats = new Set(
    expectedBackbeatSteps(style, stepCount),
  );
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
  const dna = getStyleDNA(style);
  const backbeatHits = countBackbeats(pattern, style);
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

  const backbeatRequired = dna.rhythm.backbeatStrength >= 0.5;
  if (backbeatHits === 0 && backbeatRequired) {
    reasons.push("missing backbeat");
    score -= 35;
  }

  const minimumHats = Math.max(
    1,
    Math.floor(
      stepCount *
        (0.12 + dna.rhythm.hatSixteenth * 0.14),
    ),
  );
  if (hatHits < minimumHats) {
    reasons.push("insufficient subdivision motion");
    score -= 18;
  }

  const minimumHitFactor =
    0.3 +
    dna.rhythm.hatSixteenth * 0.12 +
    dna.rhythm.percussion * 0.08;
  if (
    totalHits <
    Math.max(3, Math.floor(stepCount * minimumHitFactor))
  ) {
    reasons.push("generation too empty");
    score -= 20;
  }

  if (totalHits > stepCount * (3.1 + dna.rhythm.percussion * 0.45)) {
    reasons.push("generation too dense");
    score -= 20;
  }

  if (maxSimultaneousHits > 5) {
    reasons.push("too many stacked voices");
    score -= 15;
  }

  if (
    dna.rhythm.fourOnFloor >= 0.85 &&
    kickHits < quarterSteps(stepCount).length
  ) {
    reasons.push("style pulse lost four-on-floor foundation");
    score -= 40;
  }

  if (
    dna.subdivision === "rolling" &&
    hatHits < Math.max(2, stepCount / 2)
  ) {
    reasons.push("rolling subdivision layer too sparse");
    score -= 25;
  }

  if (
    dna.rhythm.kickSyncopation >= 0.72 &&
    stepCount >= 8 &&
    syncopatedKickHits === 0
  ) {
    reasons.push("style grammar lacks syncopated kick movement");
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
      (backbeatRequired && reason === "missing backbeat") ||
      reason === "style pulse lost four-on-floor foundation"
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
      requestInput.stepCount === 16 ||
      requestInput.stepCount === 32 ||
      requestInput.stepCount === 64
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
    extendSixteenStepMotif(grid, request.stepCount, random);

    const rawPattern = buildPattern(
      request,
      effectiveSeed,
      grid,
    );
    const dna = getStyleDNA(request.style);
    const vocabularyPattern = applyAdvancedStyleVocabulary(
      rawPattern,
      dna,
      effectiveSeed,
      request.intent,
    );
    const pattern = applyGroove({
      source: vocabularyPattern,
      seed: deriveSeed(effectiveSeed, "style-groove"),
      personality: dna.groove.personality,
      humanization: dna.groove.humanization,
      ghostNoteAmount: dna.groove.ghostNotes,
      swing: vocabularyPattern.groove?.swing ?? 0,
    }).pattern;
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
