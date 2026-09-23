import { PPQ } from "../domain/contracts";
import { hashSeed } from "../generation/prng";
import { modulationTarget } from "./parameterRegistry";

export type ModulationSourceKind =
  | "lfo"
  | "envelope"
  | "sampleHold"
  | "randomSmooth"
  | "step";

export type LfoShape = "sine" | "triangle" | "square" | "saw";
export type AutomationCurve = "hold" | "linear" | "smooth";

export interface ModulationSource {
  id: string;
  name: string;
  kind: ModulationSourceKind;
  enabled: boolean;
  rateBeats: number;
  phase: number;
  seed: string;
  shape: LfoShape;
  attack: number;
  stepValues: number[];
  bipolar: boolean;
}

export interface ModulationRoute {
  id: string;
  sourceId: string;
  targetId: string;
  depth: number;
  enabled: boolean;
}

export interface AutomationPoint {
  id: string;
  tick: number;
  value: number;
  curve: AutomationCurve;
}

export interface AutomationLane {
  id: string;
  targetId: string;
  enabled: boolean;
  loopLengthTicks?: number;
  points: AutomationPoint[];
}

export interface ModulationResolution {
  targetId: string;
  baseValue: number;
  automatedValue: number;
  modulationOffset: number;
  value: number;
  routeCount: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function positiveModulo(value: number, modulus: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(modulus) || modulus <= 0) {
    return 0;
  }
  return ((value % modulus) + modulus) % modulus;
}

function unit(seed: string): number {
  return hashSeed(seed) / 4294967296;
}

function signed(seed: string): number {
  return unit(seed) * 2 - 1;
}

function smoothstep(value: number): number {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
}

function normalizedRateBeats(source: ModulationSource): number {
  return Math.max(0.0625, Math.min(64, source.rateBeats));
}

function phaseAtTick(source: ModulationSource, tick: number): number {
  const beats = Math.max(0, tick) / PPQ;
  return positiveModulo(
    beats / normalizedRateBeats(source) + source.phase,
    1,
  );
}

function lfoValue(source: ModulationSource, phase: number): number {
  switch (source.shape) {
    case "triangle":
      return 1 - 4 * Math.abs(phase - 0.5);
    case "square":
      return phase < 0.5 ? 1 : -1;
    case "saw":
      return phase * 2 - 1;
    case "sine":
    default:
      return Math.sin(phase * Math.PI * 2);
  }
}

function envelopeValue(source: ModulationSource, phase: number): number {
  const attack = Math.max(0.02, Math.min(0.98, source.attack));
  if (phase <= attack) {
    return phase / attack;
  }
  return 1 - (phase - attack) / (1 - attack);
}

function randomIndex(
  source: ModulationSource,
  tick: number,
): { index: number; fraction: number } {
  const beats = Math.max(0, tick) / PPQ;
  const period = normalizedRateBeats(source);
  const position = beats / period + source.phase;
  const index = Math.floor(position);
  return {
    index,
    fraction: positiveModulo(position, 1),
  };
}

function randomValue(
  source: ModulationSource,
  index: number,
): number {
  const value = signed(
    [
      source.seed,
      source.id,
      source.kind,
      index,
    ].join("|"),
  );
  return source.bipolar ? value : (value + 1) / 2;
}

export function evaluateModulationSource(
  source: ModulationSource,
  tick: number,
): number {
  if (!source.enabled) return 0;

  if (source.kind === "lfo") {
    const raw = lfoValue(source, phaseAtTick(source, tick));
    return source.bipolar ? raw : (raw + 1) / 2;
  }

  if (source.kind === "envelope") {
    const raw = envelopeValue(source, phaseAtTick(source, tick));
    return source.bipolar ? raw * 2 - 1 : raw;
  }

  if (source.kind === "sampleHold") {
    const { index } = randomIndex(source, tick);
    return randomValue(source, index);
  }

  if (source.kind === "randomSmooth") {
    const { index, fraction } = randomIndex(source, tick);
    const a = randomValue(source, index);
    const b = randomValue(source, index + 1);
    const mix = smoothstep(fraction);
    return a + (b - a) * mix;
  }

  const values =
    source.stepValues.length > 0
      ? source.stepValues
      : [0.5];
  const beats = Math.max(0, tick) / PPQ;
  const stepDuration = normalizedRateBeats(source);
  const index =
    Math.floor(beats / stepDuration + source.phase) %
    values.length;
  const raw = clamp01(values[positiveModulo(index, values.length)] ?? 0.5);
  return source.bipolar ? raw * 2 - 1 : raw;
}

function sortedPoints(lane: AutomationLane): AutomationPoint[] {
  return [...lane.points].sort(
    (a, b) => a.tick - b.tick || a.id.localeCompare(b.id),
  );
}

function automationTick(lane: AutomationLane, tick: number): number {
  if (!lane.loopLengthTicks || lane.loopLengthTicks <= 0) {
    return Math.max(0, tick);
  }
  return positiveModulo(Math.max(0, tick), lane.loopLengthTicks);
}

export function evaluateAutomationLane(
  lane: AutomationLane,
  tick: number,
): number | undefined {
  if (!lane.enabled || lane.points.length === 0) return undefined;

  const points = sortedPoints(lane);
  const localTick = automationTick(lane, tick);
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return undefined;
  if (localTick <= first.tick) return clamp01(first.value);
  if (localTick >= last.tick) return clamp01(last.value);

  let left = first;
  let right = last;

  for (let index = 1; index < points.length; index += 1) {
    const candidate = points[index];
    if (!candidate) continue;
    if (candidate.tick >= localTick) {
      right = candidate;
      left = points[index - 1] ?? first;
      break;
    }
  }

  if (left.curve === "hold" || right.tick <= left.tick) {
    return clamp01(left.value);
  }

  let progress =
    (localTick - left.tick) /
    Math.max(1, right.tick - left.tick);
  if (left.curve === "smooth") {
    progress = smoothstep(progress);
  }

  return clamp01(
    left.value + (right.value - left.value) * progress,
  );
}

export function resolveModulatedTarget(input: {
  targetId: string;
  baseValue: number;
  tick: number;
  sources: readonly ModulationSource[];
  routes: readonly ModulationRoute[];
  automationLanes: readonly AutomationLane[];
}): ModulationResolution {
  const target = modulationTarget(input.targetId);
  const min = target?.min ?? 0;
  const max = target?.max ?? 1;
  const base = clamp(input.baseValue, min, max);
  const normalizedBase =
    max > min ? (base - min) / (max - min) : 0;

  const lane = input.automationLanes.find(
    (entry) =>
      entry.targetId === input.targetId &&
      entry.enabled,
  );
  const automatedNormalized =
    lane !== undefined
      ? evaluateAutomationLane(lane, input.tick) ?? normalizedBase
      : normalizedBase;

  const sourceById = new Map(
    input.sources.map((source) => [source.id, source]),
  );

  let modulationOffset = 0;
  let routeCount = 0;

  for (const route of input.routes) {
    if (!route.enabled || route.targetId !== input.targetId) continue;
    const source = sourceById.get(route.sourceId);
    if (!source || !source.enabled) continue;

    const value = evaluateModulationSource(source, input.tick);
    modulationOffset += value * clamp(route.depth, -1, 1) * 0.5;
    routeCount += 1;
  }

  const normalizedValue = clamp01(
    automatedNormalized + modulationOffset,
  );
  const resolved = min + normalizedValue * (max - min);

  return {
    targetId: input.targetId,
    baseValue: base,
    automatedValue: min + automatedNormalized * (max - min),
    modulationOffset,
    value: clamp(resolved, min, max),
    routeCount,
  };
}

export function createDefaultSource(
  kind: ModulationSourceKind,
  id: string,
): ModulationSource {
  const defaults: Record<
    ModulationSourceKind,
    Pick<
      ModulationSource,
      "name" | "rateBeats" | "shape" | "attack" | "stepValues" | "bipolar"
    >
  > = {
    lfo: {
      name: "LFO",
      rateBeats: 4,
      shape: "sine",
      attack: 0.25,
      stepValues: [0.5],
      bipolar: true,
    },
    envelope: {
      name: "Envelope",
      rateBeats: 4,
      shape: "sine",
      attack: 0.18,
      stepValues: [0.5],
      bipolar: false,
    },
    sampleHold: {
      name: "Sample & Hold",
      rateBeats: 1,
      shape: "square",
      attack: 0.25,
      stepValues: [0.5],
      bipolar: true,
    },
    randomSmooth: {
      name: "Random Smooth",
      rateBeats: 2,
      shape: "sine",
      attack: 0.25,
      stepValues: [0.5],
      bipolar: true,
    },
    step: {
      name: "Step Mod",
      rateBeats: 0.5,
      shape: "square",
      attack: 0.25,
      stepValues: [0.1, 0.75, 0.35, 0.9, 0.25, 0.65, 0.45, 0.8],
      bipolar: true,
    },
  };

  const preset = defaults[kind];

  return {
    id,
    name: preset.name,
    kind,
    enabled: true,
    rateBeats: preset.rateBeats,
    phase: 0,
    seed: "MOD-" + id,
    shape: preset.shape,
    attack: preset.attack,
    stepValues: [...preset.stepValues],
    bipolar: preset.bipolar,
  };
}
