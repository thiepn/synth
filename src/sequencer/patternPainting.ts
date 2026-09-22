import type {
  InstrumentRole,
  StepEvent,
} from "../domain/contracts";
import {
  FOUNDATION_STEP_TICKS,
  SEQUENCER_LANES,
} from "../music/foundationPattern";
import {
  SeededRandom,
  deriveSeed,
  shortSeed,
} from "../generation/prng";

export type PatternBrushId =
  | "draw"
  | "density"
  | "kick"
  | "hat"
  | "perc"
  | "fill"
  | "ghost"
  | "silence";

export type LaneActionId =
  | "generate"
  | "variate"
  | "simplify"
  | "humanize";

export interface PatternBrushDefinition {
  id: PatternBrushId;
  label: string;
  code: string;
  description: string;
}

export const PATTERN_BRUSHES: readonly PatternBrushDefinition[] = [
  {
    id: "draw",
    label: "DRAW",
    code: "DRW",
    description: "Paint normal hits into the touched lane.",
  },
  {
    id: "density",
    label: "DENSITY",
    code: "DNS",
    description: "Shape lane occupancy from the current density amount.",
  },
  {
    id: "kick",
    label: "KICK",
    code: "KCK",
    description: "Paint role-aware kick movement across the gesture.",
  },
  {
    id: "hat",
    label: "HAT",
    code: "HAT",
    description: "Paint closed-hat subdivision motion.",
  },
  {
    id: "perc",
    label: "PERC",
    code: "PRC",
    description: "Paint syncopated percussion activity.",
  },
  {
    id: "fill",
    label: "FILL",
    code: "FIL",
    description: "Paint tom/percussion fill material.",
  },
  {
    id: "ghost",
    label: "GHOST",
    code: "GST",
    description: "Paint quiet ghost material into the touched lane.",
  },
  {
    id: "silence",
    label: "SILENCE",
    code: "SIL",
    description: "Erase touched events without changing lane length.",
  },
];

export const LANE_ACTIONS: readonly {
  id: LaneActionId;
  label: string;
  code: string;
}[] = [
  { id: "generate", label: "GENERATE", code: "GEN" },
  { id: "variate", label: "VARIATE", code: "VAR" },
  { id: "simplify", label: "SIMPLIFY", code: "SMP" },
  { id: "humanize", label: "HUMANIZE", code: "HUM" },
];

export interface BrushDecision {
  targetLaneId: string;
  remove: boolean;
  event?: Omit<StepEvent, "id" | "tick">;
}

export interface BrushDecisionRequest {
  brush: PatternBrushId;
  hoveredLaneId: string;
  stepIndex: number;
  density: number;
  seed: string;
}

export interface LaneActionRequest {
  action: LaneActionId;
  laneId: string;
  role: InstrumentRole;
  events: readonly StepEvent[];
  laneLengthSteps: number;
  density: number;
  amount: number;
  seed: string;
  dynamicsLocked: boolean;
  timingLocked: boolean;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function accentFromVelocity(
  velocity: number,
): StepEvent["accent"] {
  if (velocity >= 0.85) return "accent";
  if (velocity <= 0.3) return "ghost";
  return "normal";
}

function targetLaneForBrush(
  brush: PatternBrushId,
  hoveredLaneId: string,
  stepIndex: number,
): string {
  if (brush === "kick") return "lane-kick";
  if (brush === "hat") return "lane-closed-hat";
  if (brush === "perc") return "lane-percussion";
  if (brush === "fill") {
    return stepIndex % 3 === 2
      ? "lane-percussion"
      : "lane-tom";
  }
  return hoveredLaneId;
}

function roleForLane(laneId: string): InstrumentRole {
  return (
    SEQUENCER_LANES.find((lane) => lane.id === laneId)?.role ??
    "custom"
  );
}

function densityWeight(
  role: InstrumentRole,
  step: number,
): number {
  if (role === "kick") {
    if (step % 4 === 0) return 0.96;
    if (step % 2 === 0) return 0.7;
    return 0.46;
  }

  if (role === "snare" || role === "clap") {
    if (step % 8 === 4) return 0.98;
    if (step % 4 === 3) return 0.58;
    return 0.34;
  }

  if (role === "closedHat") {
    return step % 2 === 0 ? 0.94 : 0.62;
  }

  if (role === "openHat") {
    return step % 4 === 2 ? 0.9 : 0.3;
  }

  if (role === "tom") {
    return step % 16 >= 12 ? 0.84 : 0.28;
  }

  if (role === "percussion") {
    return step % 2 === 1 ? 0.72 : 0.45;
  }

  if (role === "cymbal") {
    return step % 16 === 0 ? 0.94 : 0.18;
  }

  return 0.5;
}

function brushVelocity(
  role: InstrumentRole,
  step: number,
  density: number,
  random: SeededRandom,
): number {
  let base = 0.68;

  if (role === "kick") {
    base = step % 4 === 0 ? 0.94 : 0.72;
  } else if (role === "snare" || role === "clap") {
    base = step % 8 === 4 ? 0.9 : 0.54;
  } else if (role === "closedHat") {
    base = step % 4 === 0 ? 0.66 : step % 2 === 0 ? 0.54 : 0.4;
  } else if (role === "openHat") {
    base = 0.5;
  } else if (role === "tom") {
    base = 0.56 + (step % 4) * 0.08;
  } else if (role === "percussion") {
    base = step % 2 === 1 ? 0.46 : 0.36;
  } else if (role === "cymbal") {
    base = 0.7;
  }

  return Math.min(
    1,
    Math.max(
      0.12,
      base +
        (density - 0.5) * 0.12 +
        random.range(-0.07, 0.07),
    ),
  );
}

export function decideBrushStep(
  request: BrushDecisionRequest,
): BrushDecision {
  const density = clamp01(request.density);
  const targetLaneId = targetLaneForBrush(
    request.brush,
    request.hoveredLaneId,
    request.stepIndex,
  );
  const role = roleForLane(targetLaneId);
  const random = new SeededRandom(
    deriveSeed(
      request.seed,
      [
        request.brush,
        targetLaneId,
        request.stepIndex,
      ].join(":"),
    ),
  );

  if (request.brush === "silence") {
    return {
      targetLaneId,
      remove: true,
    };
  }

  if (request.brush === "density") {
    const threshold =
      density *
      (0.55 + densityWeight(role, request.stepIndex) * 0.65);

    if (!random.chance(Math.min(1, threshold))) {
      return {
        targetLaneId,
        remove: true,
      };
    }
  }

  if (
    request.brush === "kick" ||
    request.brush === "hat" ||
    request.brush === "perc" ||
    request.brush === "fill"
  ) {
    const threshold =
      0.24 +
      density * 0.62 +
      densityWeight(role, request.stepIndex) * 0.2;

    if (!random.chance(Math.min(1, threshold))) {
      return {
        targetLaneId,
        remove: true,
      };
    }
  }

  const ghost = request.brush === "ghost";
  const velocity = ghost
    ? random.range(0.14, 0.28)
    : brushVelocity(
        role,
        request.stepIndex,
        density,
        random,
      );

  const ratchetCount =
    request.brush === "fill" &&
    request.stepIndex % 4 === 3 &&
    random.chance(0.3 + density * 0.45)
      ? random.int(2, 3)
      : undefined;
  const flamOffsetUs =
    request.brush === "fill" &&
    !ratchetCount &&
    random.chance(0.18 + density * 0.25)
      ? random.int(12_000, 28_000)
      : undefined;

  return {
    targetLaneId,
    remove: false,
    event: {
      velocity,
      probability:
        request.brush === "ghost"
          ? 0.82
          : request.brush === "perc" && density < 0.55
            ? 0.78
            : 1,
      timingOffsetUs: 0,
      accent: ghost ? "ghost" : accentFromVelocity(velocity),
      ratchetCount,
      flamOffsetUs,
      generatorTags: [
        "pattern-brush",
        request.brush,
      ],
    },
  };
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

function laneActionEvent(
  laneId: string,
  step: number,
  velocity: number,
  seed: string,
  extra: Partial<StepEvent> = {},
): StepEvent {
  return {
    id:
      "evt-lane-" +
      shortSeed(seed) +
      "-" +
      laneId.replace("lane-", "") +
      "-" +
      step,
    tick: step * FOUNDATION_STEP_TICKS,
    velocity,
    probability: 1,
    timingOffsetUs: 0,
    accent: accentFromVelocity(velocity),
    generatorTags: ["lane-action"],
    ...extra,
  };
}

function generatedSteps(
  request: LaneActionRequest,
  random: SeededRandom,
): StepEvent[] {
  const events: StepEvent[] = [];
  const density = clamp01(request.density);
  const length = request.laneLengthSteps;

  for (let step = 0; step < length; step += 1) {
    const weight = densityWeight(request.role, step);
    let probability = density * (0.38 + weight * 0.78);

    if (request.role === "kick" && step === 0) probability = 1;
    if (
      (request.role === "snare" || request.role === "clap") &&
      step % 8 === 4
    ) {
      probability = Math.max(probability, 0.94);
    }
    if (request.role === "closedHat" && step % 2 === 0) {
      probability = Math.max(probability, 0.72);
    }
    if (request.role === "cymbal" && step === 0) {
      probability = Math.max(probability, 0.8);
    }

    if (!random.chance(Math.min(1, probability))) continue;

    const velocity = brushVelocity(
      request.role,
      step,
      density,
      random,
    );

    events.push(
      laneActionEvent(
        request.laneId,
        step,
        velocity,
        request.seed,
      ),
    );
  }

  if (events.length === 0 && length > 0) {
    let strongestStep = 0;
    let strongestWeight = -1;

    for (let step = 0; step < length; step += 1) {
      const weight = densityWeight(request.role, step);
      if (weight > strongestWeight) {
        strongestWeight = weight;
        strongestStep = step;
      }
    }

    events.push(
      laneActionEvent(
        request.laneId,
        strongestStep,
        brushVelocity(
          request.role,
          strongestStep,
          density,
          random,
        ),
        request.seed,
      ),
    );
  }

  return events;
}

function variedSteps(
  request: LaneActionRequest,
  random: SeededRandom,
): StepEvent[] {
  const length = request.laneLengthSteps;
  const amount = clamp01(request.amount);
  const density = clamp01(request.density);
  const byStep = new Map(
    request.events
      .filter((event) => event.tick / FOUNDATION_STEP_TICKS < length)
      .map((event) => [Math.round(event.tick / FOUNDATION_STEP_TICKS), cloneEvent(event)]),
  );

  const result: StepEvent[] = [];

  for (let step = 0; step < length; step += 1) {
    const existing = byStep.get(step);

    if (existing) {
      const anchor =
        densityWeight(request.role, step) > 0.82;
      const keepProbability =
        anchor
          ? 0.98
          : 0.96 - amount * 0.28;

      if (!random.chance(keepProbability)) continue;

      if (!request.dynamicsLocked) {
        existing.velocity = Math.min(
          1,
          Math.max(
            0.08,
            existing.velocity +
              random.range(-0.12, 0.12) * amount,
          ),
        );
        existing.accent = accentFromVelocity(existing.velocity);
        delete existing.grooveBase;
        existing.generatorTags = existing.generatorTags?.filter(
          (tag) => !tag.startsWith("groove-engine"),
        );
      }

      result.push(existing);
      continue;
    }

    const addProbability =
      amount *
      density *
      densityWeight(request.role, step) *
      0.38;

    if (!random.chance(addProbability)) continue;

    result.push(
      laneActionEvent(
        request.laneId,
        step,
        brushVelocity(
          request.role,
          step,
          density,
          random,
        ),
        request.seed,
      ),
    );
  }

  if (result.length === 0 && byStep.size > 0) {
    const fallback = [...byStep.values()].sort(
      (a, b) => b.velocity - a.velocity,
    )[0];
    if (fallback) result.push(fallback);
  }

  return result.sort((a, b) => a.tick - b.tick);
}

function simplifiedSteps(
  request: LaneActionRequest,
): StepEvent[] {
  const amount = clamp01(request.amount);
  const active = request.events
    .filter(
      (event) =>
        event.tick / FOUNDATION_STEP_TICKS < request.laneLengthSteps,
    )
    .map(cloneEvent);

  if (active.length <= 1) return active;

  const targetCount = Math.max(
    1,
    Math.round(
      active.length *
        (1 - (0.3 + amount * 0.45)),
    ),
  );

  return active
    .sort((a, b) => {
      const stepA = Math.round(a.tick / FOUNDATION_STEP_TICKS);
      const stepB = Math.round(b.tick / FOUNDATION_STEP_TICKS);
      const scoreA =
        a.velocity * 0.52 +
        densityWeight(request.role, stepA) * 0.48;
      const scoreB =
        b.velocity * 0.52 +
        densityWeight(request.role, stepB) * 0.48;
      return scoreB - scoreA;
    })
    .slice(0, targetCount)
    .sort((a, b) => a.tick - b.tick);
}

function humanizedSteps(
  request: LaneActionRequest,
): StepEvent[] {
  const amount = clamp01(request.amount);

  return request.events.map((source) => {
    const event = cloneEvent(source);
    const step = Math.round(event.tick / FOUNDATION_STEP_TICKS);
    const random = new SeededRandom(
      deriveSeed(
        request.seed,
        request.laneId + ":" + step,
      ),
    );

    if (!request.dynamicsLocked) {
      event.velocity = Math.min(
        1,
        Math.max(
          0.08,
          event.velocity +
            random.range(-0.1, 0.1) * amount,
        ),
      );
      event.accent = accentFromVelocity(event.velocity);
    }

    if (!request.timingLocked) {
      event.timingOffsetUs = Math.round(
        Math.max(
          -50_000,
          Math.min(
            50_000,
            event.timingOffsetUs +
              random.range(-10_000, 10_000) * amount,
          ),
        ),
      );
    }

    delete event.grooveBase;
    event.generatorTags = [
      ...(event.generatorTags ?? []).filter(
        (tag) => !tag.startsWith("groove-engine"),
      ),
      "lane-humanize",
    ];

    return event;
  });
}

export function applyLaneAction(
  request: LaneActionRequest,
): StepEvent[] {
  const random = new SeededRandom(
    deriveSeed(
      request.seed,
      request.action +
        ":" +
        request.laneId,
    ),
  );

  switch (request.action) {
    case "generate":
      return generatedSteps(request, random);
    case "variate":
      return variedSteps(request, random);
    case "simplify":
      return simplifiedSteps(request);
    case "humanize":
      return humanizedSteps(request);
  }
}
