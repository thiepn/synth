import type {
  InstrumentRole,
  Pattern,
  PatternLane,
  StepEvent,
} from "../domain/contracts";
import { FOUNDATION_STEP_TICKS } from "../music/foundationPattern";

export const RHYTHM_GLYPH_VERSION = 1;

export interface RhythmGlyphMetrics {
  density: number;
  syncopation: number;
  meanVelocity: number;
  velocityContrast: number;
  swing: number;
  kickActivity: number;
  backbeatActivity: number;
  hatActivity: number;
  percussionActivity: number;
  microtiming: number;
}

export interface RhythmGlyphNode {
  x: number;
  y: number;
  radius: number;
  kind: "kick" | "backbeat" | "accent";
}

export interface RhythmGlyphTick {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strength: number;
  kind: "hat" | "percussion" | "cymbal";
}

export interface RhythmGlyphGeometry {
  version: typeof RHYTHM_GLYPH_VERSION;
  signature: string;
  stepCount: number;
  mainPath: string;
  upperPath: string;
  lowerPath: string;
  axisPath: string;
  nodes: RhythmGlyphNode[];
  ticks: RhythmGlyphTick[];
  metrics: RhythmGlyphMetrics;
}

interface StepFeatures {
  kick: number;
  backbeat: number;
  hats: number;
  percussion: number;
  cymbal: number;
  total: number;
  velocityTotal: number;
  velocityCount: number;
  timingTotalUs: number;
  timingCount: number;
}

const X_MIN = 16;
const X_MAX = 184;
const CENTER_Y = 50;
const UPPER_BASE = 39;
const LOWER_BASE = 61;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function format(value: number): string {
  return round(value).toFixed(2).replace(/\.00$/, "");
}

function roleBucket(role: InstrumentRole): keyof Pick<
  StepFeatures,
  "kick" | "backbeat" | "hats" | "percussion" | "cymbal"
> {
  switch (role) {
    case "kick":
      return "kick";
    case "snare":
    case "clap":
      return "backbeat";
    case "closedHat":
    case "openHat":
      return "hats";
    case "tom":
    case "percussion":
      return "percussion";
    case "cymbal":
    case "fx":
    case "custom":
    default:
      return "cymbal";
  }
}

function stepIndexForEvent(event: StepEvent, stepCount: number): number {
  const step = Math.round(event.tick / FOUNDATION_STEP_TICKS);
  return Math.max(0, Math.min(stepCount - 1, step));
}

function eventMusicalSignature(event: StepEvent): string {
  return [
    event.tick,
    event.velocity.toFixed(4),
    event.probability.toFixed(4),
    event.timingOffsetUs,
    event.accent ?? "",
    event.ratchetCount ?? "",
    event.flamOffsetUs ?? "",
  ].join(":");
}

function laneMusicalSignature(lane: PatternLane): string {
  return [
    lane.role,
    lane.events
      .map(eventMusicalSignature)
      .sort()
      .join(","),
  ].join("=");
}

function canonicalPatternSignature(pattern: Pattern): string {
  return [
    RHYTHM_GLYPH_VERSION,
    pattern.ppq,
    pattern.lengthTicks,
    pattern.meter.numerator,
    pattern.meter.denominator,
    pattern.groove?.swing?.toFixed(5) ?? "0",
    pattern.lanes
      .map(laneMusicalSignature)
      .sort()
      .join("|"),
  ].join(";");
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

function emptyStep(): StepFeatures {
  return {
    kick: 0,
    backbeat: 0,
    hats: 0,
    percussion: 0,
    cymbal: 0,
    total: 0,
    velocityTotal: 0,
    velocityCount: 0,
    timingTotalUs: 0,
    timingCount: 0,
  };
}

function collectFeatures(pattern: Pattern, stepCount: number): StepFeatures[] {
  const features = Array.from({ length: stepCount }, emptyStep);

  for (const lane of pattern.lanes) {
    const bucket = roleBucket(lane.role);

    for (const event of lane.events) {
      const step = stepIndexForEvent(event, stepCount);
      const target = features[step];
      const velocity = clamp01(event.velocity);

      target[bucket] = Math.max(target[bucket], velocity);
      target.total += velocity;
      target.velocityTotal += velocity;
      target.velocityCount += 1;
      target.timingTotalUs += event.timingOffsetUs;
      target.timingCount += 1;
    }
  }

  return features;
}

function stepX(
  stepIndex: number,
  stepCount: number,
  timingOffsetUs: number,
  microtimingScale: number,
): number {
  const denominator = Math.max(1, stepCount - 1);
  const base = X_MIN + (stepIndex / denominator) * (X_MAX - X_MIN);
  const shifted = base + timingOffsetUs * microtimingScale;
  return Math.max(X_MIN - 4, Math.min(X_MAX + 4, shifted));
}

function pathFromPoints(points: Array<[number, number]>): string {
  if (points.length === 0) return "";

  return points
    .map(([x, y], index) =>
      (index === 0 ? "M" : "L") + format(x) + " " + format(y),
    )
    .join(" ");
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length <= 1) return 0;
  const average = mean(values);
  const variance =
    values.reduce(
      (sum, value) => sum + Math.pow(value - average, 2),
      0,
    ) / values.length;
  return Math.sqrt(variance);
}

function computeMetrics(
  pattern: Pattern,
  features: StepFeatures[],
): RhythmGlyphMetrics {
  const stepCount = Math.max(1, features.length);
  const velocities: number[] = [];
  let totalEvents = 0;
  let primaryEvents = 0;
  let syncopatedEvents = 0;
  let kickTotal = 0;
  let backbeatTotal = 0;
  let hatTotal = 0;
  let percussionTotal = 0;
  let timingAbs = 0;
  let timingCount = 0;

  for (let step = 0; step < features.length; step += 1) {
    const feature = features[step];
    totalEvents += feature.velocityCount;
    kickTotal += feature.kick;
    backbeatTotal += feature.backbeat;
    hatTotal += feature.hats;
    percussionTotal += feature.percussion;

    const primaryAtStep =
      Number(feature.kick > 0) +
      Number(feature.backbeat > 0) +
      Number(feature.percussion > 0);
    primaryEvents += primaryAtStep;

    if (step % 4 !== 0) {
      syncopatedEvents += primaryAtStep;
    }

    if (feature.timingCount > 0) {
      timingAbs += Math.abs(feature.timingTotalUs / feature.timingCount);
      timingCount += 1;
    }
  }

  for (const lane of pattern.lanes) {
    for (const event of lane.events) velocities.push(clamp01(event.velocity));
  }

  const possiblePrimaryEvents = stepCount * Math.max(1, pattern.lanes.length);
  const syncopationDenominator = Math.max(1, primaryEvents);

  return {
    density: clamp01(totalEvents / Math.max(1, possiblePrimaryEvents * 0.38)),
    syncopation: clamp01(syncopatedEvents / syncopationDenominator),
    meanVelocity: clamp01(mean(velocities)),
    velocityContrast: clamp01(standardDeviation(velocities) / 0.35),
    swing: clamp01(pattern.groove?.swing ?? 0),
    kickActivity: clamp01(kickTotal / Math.max(1, stepCount * 0.32)),
    backbeatActivity: clamp01(
      backbeatTotal / Math.max(1, stepCount * 0.24),
    ),
    hatActivity: clamp01(hatTotal / Math.max(1, stepCount * 0.52)),
    percussionActivity: clamp01(
      percussionTotal / Math.max(1, stepCount * 0.26),
    ),
    microtiming: clamp01(
      (timingCount > 0 ? timingAbs / timingCount : 0) / 45_000,
    ),
  };
}

export function deriveRhythmGlyph(pattern: Pattern): RhythmGlyphGeometry {
  const stepCount = Math.max(
    1,
    Math.round(pattern.lengthTicks / FOUNDATION_STEP_TICKS),
  );
  const features = collectFeatures(pattern, stepCount);
  const metrics = computeMetrics(pattern, features);
  const microtimingScale =
    (X_MAX - X_MIN) / Math.max(1, stepCount - 1) / 180_000;

  const upper: Array<[number, number]> = [];
  const lower: Array<[number, number]> = [];
  const main: Array<[number, number]> = [];
  const nodes: RhythmGlyphNode[] = [];
  const ticks: RhythmGlyphTick[] = [];

  for (let step = 0; step < stepCount; step += 1) {
    const feature = features[step];
    const timingOffsetUs =
      feature.timingCount > 0
        ? feature.timingTotalUs / feature.timingCount
        : 0;
    const x = stepX(
      step,
      stepCount,
      timingOffsetUs,
      microtimingScale,
    );

    const upperY =
      UPPER_BASE -
      feature.backbeat * 16 -
      feature.hats * 5 -
      feature.cymbal * 8 +
      feature.kick * 1.5;

    const lowerY =
      LOWER_BASE +
      feature.kick * 18 +
      feature.percussion * 10 +
      feature.cymbal * 5 -
      feature.backbeat * 1.5;

    const centerOffset =
      feature.kick * 5 -
      feature.backbeat * 5 +
      feature.percussion * 2.5 -
      feature.hats * 1.2;
    const centerY = CENTER_Y + centerOffset;

    upper.push([x, upperY]);
    lower.push([x, lowerY]);
    main.push([x, centerY]);

    if (feature.kick > 0) {
      nodes.push({
        x,
        y: lowerY,
        radius: 1.7 + feature.kick * 2.6,
        kind: "kick",
      });
    }

    if (feature.backbeat > 0) {
      nodes.push({
        x,
        y: upperY,
        radius: 1.5 + feature.backbeat * 2.2,
        kind: "backbeat",
      });
    }

    if (
      feature.velocityCount > 1 &&
      feature.velocityTotal / feature.velocityCount >= 0.78
    ) {
      nodes.push({
        x,
        y: centerY,
        radius:
          1.2 +
          clamp01(feature.velocityTotal / feature.velocityCount) * 1.4,
        kind: "accent",
      });
    }

    if (feature.hats > 0) {
      const height = 4 + feature.hats * 10;
      ticks.push({
        x1: x,
        y1: upperY + 2,
        x2: x,
        y2: upperY - height,
        strength: feature.hats,
        kind: "hat",
      });
    }

    if (feature.percussion > 0) {
      const direction = step % 2 === 0 ? -1 : 1;
      const width = 3 + feature.percussion * 8;
      ticks.push({
        x1: x,
        y1: lowerY - 1,
        x2: x + width * direction,
        y2: lowerY + 5 + feature.percussion * 5,
        strength: feature.percussion,
        kind: "percussion",
      });
    }

    if (feature.cymbal > 0) {
      const width = 4 + feature.cymbal * 9;
      ticks.push({
        x1: x - width,
        y1: upperY - 5,
        x2: x + width,
        y2: upperY - 5,
        strength: feature.cymbal,
        kind: "cymbal",
      });
    }
  }

  const axisY =
    CENTER_Y +
    (metrics.swing - 0.5) * 2 +
    (metrics.syncopation - 0.5) * 1.4;

  return {
    version: RHYTHM_GLYPH_VERSION,
    signature: fnv1a(canonicalPatternSignature(pattern)),
    stepCount,
    mainPath: pathFromPoints(main),
    upperPath: pathFromPoints(upper),
    lowerPath: pathFromPoints(lower),
    axisPath:
      "M" +
      format(X_MIN - 5) +
      " " +
      format(axisY) +
      " L" +
      format(X_MAX + 5) +
      " " +
      format(axisY),
    nodes,
    ticks,
    metrics,
  };
}
