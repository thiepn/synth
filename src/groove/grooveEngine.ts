import type {
  GrooveProfile,
  InstrumentRole,
  Pattern,
  PatternLane,
  StepEvent,
} from "../domain/contracts";
import { FOUNDATION_STEP_TICKS } from "../music/foundationPattern";
import { SeededRandom, deriveSeed } from "../generation/prng";

export const GROOVE_ENGINE_VERSION = 1;

export type GroovePersonalityId = GrooveProfile["personality"];

export interface GroovePersonalityDefinition {
  id: GroovePersonalityId;
  label: string;
  code: string;
  timingScale: number;
  velocityScale: number;
  ghostScale: number;
  roleOffsetsMs: Partial<Record<InstrumentRole, number>>;
}

export const GROOVE_PERSONALITIES: readonly GroovePersonalityDefinition[] = [
  { id: "mechanical", label: "MECHANICAL", code: "MCH", timingScale: 0, velocityScale: 0, ghostScale: 0, roleOffsetsMs: {} },
  { id: "tight", label: "TIGHT", code: "TGT", timingScale: 0.35, velocityScale: 0.42, ghostScale: 0.18, roleOffsetsMs: { kick: -1.5, snare: 2.5, clap: 2.5, closedHat: 0, openHat: 1, percussion: 0.5, tom: 0 } },
  { id: "deep", label: "DEEP", code: "DPP", timingScale: 0.62, velocityScale: 0.72, ghostScale: 0.75, roleOffsetsMs: { kick: -3.5, snare: 9, clap: 8, closedHat: 1.5, openHat: 3, percussion: 2, tom: 1 } },
  { id: "laidBack", label: "LAID-BACK", code: "LDB", timingScale: 0.58, velocityScale: 0.55, ghostScale: 0.45, roleOffsetsMs: { kick: 2.5, snare: 13, clap: 12, closedHat: 4, openHat: 6, percussion: 5, tom: 4 } },
  { id: "pushing", label: "PUSHING", code: "PSH", timingScale: 0.48, velocityScale: 0.5, ghostScale: 0.28, roleOffsetsMs: { kick: -7, snare: -3, clap: -2, closedHat: -5, openHat: -4, percussion: -4, tom: -3 } },
  { id: "loose", label: "LOOSE", code: "LOS", timingScale: 1, velocityScale: 0.92, ghostScale: 0.62, roleOffsetsMs: { kick: -1, snare: 7, clap: 6, closedHat: -1, openHat: 2, percussion: 3, tom: 2 } },
  { id: "human", label: "HUMAN", code: "HMN", timingScale: 0.7, velocityScale: 0.7, ghostScale: 0.5, roleOffsetsMs: { kick: -1.5, snare: 5, clap: 5, closedHat: 0, openHat: 2, percussion: 1, tom: 1 } },
];

export interface GrooveApplyRequest {
  source: Pattern;
  seed: string;
  personality: GroovePersonalityId;
  humanization: number;
  ghostNoteAmount: number;
  swing: number;
}

export interface GrooveApplyResult {
  pattern: Pattern;
  changedEventCount: number;
  ghostNotesAdded: number;
  maxTimingOffsetUs: number;
  meanTimingOffsetUs: number;
}

const MAX_JITTER_MS = 13;
const MAX_GROUP_DRIFT_MS = 5.5;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
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

function profile(id: GroovePersonalityId): GroovePersonalityDefinition {
  return GROOVE_PERSONALITIES.find((entry) => entry.id === id) ??
    GROOVE_PERSONALITIES[GROOVE_PERSONALITIES.length - 1];
}

function eventStep(event: StepEvent): number {
  return Math.round(event.tick / FOUNDATION_STEP_TICKS);
}

function baseEvent(event: StepEvent): {
  velocity: number;
  timingOffsetUs: number;
  accent?: StepEvent["accent"];
} {
  return event.grooveBase
    ? { ...event.grooveBase }
    : {
        velocity: event.velocity,
        timingOffsetUs: event.timingOffsetUs,
        accent: event.accent,
      };
}

function accentFromVelocity(velocity: number): StepEvent["accent"] {
  if (velocity >= 0.85) return "accent";
  if (velocity <= 0.3) return "ghost";
  return "normal";
}

function velocityShape(
  role: InstrumentRole,
  step: number,
  baseVelocity: number,
  amount: number,
  definition: GroovePersonalityDefinition,
  phraseRandom: number,
): number {
  if (amount <= 0 || definition.velocityScale <= 0) return baseVelocity;

  let contour = 0;
  if (role === "closedHat" || role === "openHat") {
    contour = step % 4 === 0 ? 0.075 : step % 2 === 0 ? 0.025 : -0.045;
  } else if (role === "snare" || role === "clap") {
    contour = step % 8 === 4 ? 0.045 : 0;
  } else if (role === "kick") {
    contour = step % 4 === 0 ? 0.035 : -0.015;
  } else if (role === "percussion" || role === "tom") {
    contour = step % 2 === 0 ? 0.02 : -0.025;
  }

  return Math.min(
    1,
    Math.max(
      0.08,
      baseVelocity +
        (contour + phraseRandom * 0.085) *
          amount *
          definition.velocityScale,
    ),
  );
}

function roleOffsetUs(
  role: InstrumentRole,
  definition: GroovePersonalityDefinition,
  amount: number,
): number {
  return Math.round((definition.roleOffsetsMs[role] ?? 0) * 1000 * amount);
}

function deterministicTimingOffsetUs(
  event: StepEvent,
  lane: PatternLane,
  request: GrooveApplyRequest,
  definition: GroovePersonalityDefinition,
): number {
  const base = baseEvent(event);
  if (
    request.humanization <= 0 ||
    definition.timingScale <= 0 ||
    lane.lock.timing ||
    lane.lock.rhythm
  ) {
    return base.timingOffsetUs;
  }

  const step = eventStep(event);
  const beatIndex = Math.floor(step / 4);
  const beatRandom = new SeededRandom(
    deriveSeed(request.seed, "beat:" + beatIndex),
  );
  const eventRandom = new SeededRandom(
    deriveSeed(request.seed, lane.id + ":event:" + step),
  );

  const groupDriftMs =
    beatRandom.range(-1, 1) *
    MAX_GROUP_DRIFT_MS *
    request.humanization *
    definition.timingScale;
  const localJitterMs =
    eventRandom.range(-1, 1) *
    MAX_JITTER_MS *
    request.humanization *
    definition.timingScale;

  return Math.round(
    base.timingOffsetUs +
      roleOffsetUs(lane.role, definition, request.humanization) +
      (groupDriftMs + localJitterMs) * 1000,
  );
}

function deterministicVelocity(
  event: StepEvent,
  lane: PatternLane,
  request: GrooveApplyRequest,
  definition: GroovePersonalityDefinition,
): number {
  const base = baseEvent(event);
  if (
    request.humanization <= 0 ||
    definition.velocityScale <= 0 ||
    lane.lock.dynamics ||
    lane.lock.rhythm
  ) {
    return base.velocity;
  }

  const step = eventStep(event);
  const random = new SeededRandom(
    deriveSeed(request.seed, lane.id + ":velocity:" + step),
  );

  return velocityShape(
    lane.role,
    step,
    base.velocity,
    request.humanization,
    definition,
    random.range(-1, 1),
  );
}

function occupiedSteps(lane: PatternLane): Set<number> {
  return new Set(lane.events.map(eventStep));
}

function ghostCandidates(role: InstrumentRole, stepCount: number): number[] {
  if (role === "snare" || role === "clap") {
    return Array.from({ length: stepCount }, (_, index) => index).filter(
      (step) => step % 4 === 1 || step % 4 === 3,
    );
  }
  if (role === "percussion" || role === "closedHat") {
    return Array.from({ length: stepCount }, (_, index) => index).filter(
      (step) => step % 2 === 1,
    );
  }
  return [];
}

function addGhostNotes(
  lane: PatternLane,
  request: GrooveApplyRequest,
  definition: GroovePersonalityDefinition,
  stepCount: number,
): number {
  if (
    lane.lock.rhythm ||
    request.ghostNoteAmount <= 0 ||
    definition.ghostScale <= 0
  ) {
    return 0;
  }

  const candidates = ghostCandidates(lane.role, stepCount);
  const occupied = occupiedSteps(lane);
  let added = 0;

  for (const step of candidates) {
    if (occupied.has(step)) continue;

    const random = new SeededRandom(
      deriveSeed(request.seed, lane.id + ":ghost:" + step),
    );
    const probability =
      request.ghostNoteAmount *
      definition.ghostScale *
      (lane.role === "snare" || lane.role === "clap" ? 0.42 : 0.28);

    if (!random.chance(probability)) continue;

    const velocity =
      lane.role === "closedHat"
        ? random.range(0.15, 0.27)
        : random.range(0.12, 0.25);

    lane.events.push({
      id:
        "evt-groove-" +
        lane.id.replace("lane-", "") +
        "-" +
        step +
        "-" +
        request.seed.slice(-6),
      tick: step * FOUNDATION_STEP_TICKS,
      velocity,
      probability: 1,
      timingOffsetUs:
        roleOffsetUs(lane.role, definition, request.humanization) +
        Math.round(random.range(-2.5, 2.5) * 1000 * request.humanization),
      accent: "ghost",
      generatorTags: [
        "groove-engine",
        "ghost",
        definition.id,
        "v" + GROOVE_ENGINE_VERSION,
      ],
      grooveBase: {
        velocity,
        timingOffsetUs: 0,
        accent: "ghost",
      },
    });
    occupied.add(step);
    added += 1;
  }

  lane.events.sort((a, b) => a.tick - b.tick);
  return added;
}

export function applyGroove(
  requestInput: GrooveApplyRequest,
): GrooveApplyResult {
  const request: GrooveApplyRequest = {
    ...requestInput,
    humanization: clamp01(requestInput.humanization),
    ghostNoteAmount: clamp01(requestInput.ghostNoteAmount),
    swing: clamp01(requestInput.swing),
  };
  const definition = profile(request.personality);
  const pattern = clonePattern(request.source);
  const stepCount = Math.max(
    1,
    Math.round(pattern.lengthTicks / FOUNDATION_STEP_TICKS),
  );

  let changedEventCount = 0;
  let ghostNotesAdded = 0;
  let timingAbsTotal = 0;
  let timingCount = 0;
  let maxTimingOffsetUs = 0;

  for (const lane of pattern.lanes) {
    if (lane.lock.rhythm) continue;

    for (const event of lane.events) {
      const base = baseEvent(event);
      const previousVelocity = event.velocity;
      const previousTiming = event.timingOffsetUs;

      if (!event.grooveBase) {
        event.grooveBase = {
          velocity: base.velocity,
          timingOffsetUs: base.timingOffsetUs,
          accent: base.accent,
        };
      }

      const velocity = deterministicVelocity(
        event,
        lane,
        request,
        definition,
      );
      const timingOffsetUs = deterministicTimingOffsetUs(
        event,
        lane,
        request,
        definition,
      );

      event.velocity = velocity;
      event.timingOffsetUs = timingOffsetUs;
      event.accent = accentFromVelocity(velocity);
      event.generatorTags = [
        ...(event.generatorTags ?? []).filter(
          (tag) => !tag.startsWith("groove-engine:"),
        ),
        "groove-engine:" + definition.id,
        "groove-engine:v" + GROOVE_ENGINE_VERSION,
      ];

      if (
        Math.abs(previousVelocity - velocity) > 0.0001 ||
        previousTiming !== timingOffsetUs
      ) {
        changedEventCount += 1;
      }

      timingAbsTotal += Math.abs(timingOffsetUs);
      timingCount += 1;
      maxTimingOffsetUs = Math.max(
        maxTimingOffsetUs,
        Math.abs(timingOffsetUs),
      );
    }

    ghostNotesAdded += addGhostNotes(
      lane,
      request,
      definition,
      stepCount,
    );
  }

  const roleTimingOffsetUs: GrooveProfile["roleTimingOffsetUs"] = {};
  for (const role of [
    "kick",
    "snare",
    "clap",
    "closedHat",
    "openHat",
    "tom",
    "percussion",
    "cymbal",
  ] as const) {
    const offset = roleOffsetUs(
      role,
      definition,
      request.humanization,
    );
    if (offset !== 0) roleTimingOffsetUs[role] = offset;
  }

  pattern.groove = {
    swing: request.swing,
    humanization: request.humanization,
    personality: request.personality,
    roleTimingOffsetUs,
    ghostNoteAmount: request.ghostNoteAmount,
    seed: request.seed,
    engineVersion: GROOVE_ENGINE_VERSION,
  };

  return {
    pattern,
    changedEventCount,
    ghostNotesAdded,
    maxTimingOffsetUs,
    meanTimingOffsetUs:
      timingCount > 0 ? Math.round(timingAbsTotal / timingCount) : 0,
  };
}

export function resetGroove(source: Pattern): Pattern {
  const pattern = clonePattern(source);

  for (const lane of pattern.lanes) {
    const retained: StepEvent[] = [];

    for (const event of lane.events) {
      const isGeneratedGhost =
        event.generatorTags?.includes("ghost") &&
        event.generatorTags.some((tag) => tag.startsWith("groove-engine"));

      if (isGeneratedGhost) continue;

      if (event.grooveBase) {
        event.velocity = event.grooveBase.velocity;
        event.timingOffsetUs = event.grooveBase.timingOffsetUs;
        event.accent = event.grooveBase.accent;
        delete event.grooveBase;
      }

      event.generatorTags = event.generatorTags?.filter(
        (tag) => !tag.startsWith("groove-engine"),
      );
      retained.push(event);
    }

    lane.events = retained;
  }

  pattern.groove = {
    swing: 0,
    humanization: 0,
    personality: "mechanical",
    roleTimingOffsetUs: {},
    ghostNoteAmount: 0,
    engineVersion: GROOVE_ENGINE_VERSION,
  };

  return pattern;
}

export function swingOffsetUsForStep(
  stepIndex: number,
  bpm: number,
  swing: number,
): number {
  const amount = clamp01(swing);
  if (amount <= 0 || stepIndex % 2 === 0) return 0;

  const safeBpm = Math.min(300, Math.max(30, bpm));
  const sixteenthSeconds = 60 / safeBpm / 4;
  return Math.round(sixteenthSeconds * amount * 0.3 * 1_000_000);
}
