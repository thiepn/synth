import {
  type IntentVector,
  type Pattern,
  type PatternLane,
  type StepEvent,
  type StyleVector,
} from "../domain/contracts";
import { FOUNDATION_STEP_TICKS } from "../music/foundationPattern";
import {
  BEAT_GENERATOR_VERSION,
  generateBeat,
  validateGeneratedBeat,
  type BeatGenerationIntent,
  type BeatGenerationRequest,
  type BeatStyleId,
  type BeatValidation,
} from "./beatGenerator";
import { SeededRandom, deriveSeed, shortSeed } from "./prng";

export const BEAT_VARIATION_ID = "beat-reroll";
export const BEAT_VARIATION_VERSION = 1;

export interface BeatVariationRequest {
  source: Pattern;
  seed: string;
  style: BeatStyleId;
  intent: BeatGenerationIntent;
  distance: number;
  bpm: number;
  targetLaneIds?: readonly string[];
}

export interface BeatVariationResult {
  accepted: boolean;
  pattern: Pattern;
  effectiveSeed: string;
  displaySeed: string;
  attempts: number;
  validation: BeatValidation;
  changedLaneIds: string[];
  changedStepCount: number;
  preservedLockedLaneIds: string[];
}

const MAX_VARIATION_ATTEMPTS = 10;
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

function styleVector(style: BeatStyleId): StyleVector {
  return { [style]: 1 };
}

function intentVector(
  intent: BeatGenerationIntent,
  distance: number,
): IntentVector {
  return {
    energy: clamp01(intent.energy),
    density: clamp01(intent.density),
    complexity: clamp01(intent.complexity),
    syncopation: clamp01(intent.syncopation),
    space: clamp01(1 - intent.density),
    swing: clamp01(intent.swing),
    humanization: 0,
    mutationDistance: clamp01(distance),
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

function eventComparable(event: StepEvent | undefined): string {
  if (!event) return "-";
  return [
    event.tick,
    event.velocity.toFixed(4),
    event.timingOffsetUs,
    event.probability.toFixed(4),
  ].join(":");
}

function mergeLane(
  source: PatternLane,
  candidate: PatternLane,
  distance: number,
  random: SeededRandom,
  seedCode: string,
): PatternLane {
  if (distance <= 0.001) {
    return cloneLane(source);
  }

  if (distance >= 0.999) {
    return {
      ...cloneLane(candidate),
      muted: source.muted,
      solo: source.solo,
      lock: { ...source.lock },
      regionLocks: source.regionLocks?.map((lock) => ({ ...lock })),
    };
  }

  const sourceByStep = eventMap(source);
  const candidateByStep = eventMap(candidate);
  const allSteps = new Set([
    ...sourceByStep.keys(),
    ...candidateByStep.keys(),
  ]);
  const mergedEvents: StepEvent[] = [];

  const structuralChance = Math.pow(distance, 1.35);
  const velocityMix = Math.pow(distance, 0.82);
  const timingMix = Math.pow(distance, 0.92);

  for (const step of [...allSteps].sort((a, b) => a - b)) {
    const sourceEvent = sourceByStep.get(step);
    const candidateEvent = candidateByStep.get(step);

    if (sourceEvent && candidateEvent) {
      const sourceBaseVelocity =
        sourceEvent.grooveBase?.velocity ?? sourceEvent.velocity;
      const sourceBaseTiming =
        sourceEvent.grooveBase?.timingOffsetUs ??
        sourceEvent.timingOffsetUs;
      const velocity =
        sourceBaseVelocity +
        (candidateEvent.velocity - sourceBaseVelocity) * velocityMix;
      const timingOffsetUs = Math.round(
        sourceBaseTiming +
          (candidateEvent.timingOffsetUs - sourceBaseTiming) *
            timingMix,
      );

      mergedEvents.push({
        ...cloneEvent(sourceEvent),
        id: sourceEvent.id,
        velocity,
        timingOffsetUs,
        grooveBase: undefined,
        accent:
          velocity >= 0.85
            ? "accent"
            : velocity <= 0.3
              ? "ghost"
              : "normal",
        generatorTags: [
          ...(sourceEvent.generatorTags ?? []).filter(
            (tag) => !tag.startsWith("groove-engine"),
          ),
          BEAT_VARIATION_ID,
          "v" + BEAT_VARIATION_VERSION,
        ],
      });
      continue;
    }

    if (sourceEvent && !candidateEvent) {
      if (!random.chance(structuralChance)) {
        mergedEvents.push(cloneEvent(sourceEvent));
      }
      continue;
    }

    if (!sourceEvent && candidateEvent && random.chance(structuralChance)) {
      mergedEvents.push({
        ...cloneEvent(candidateEvent),
        id:
          "evt-var-" +
          seedCode +
          "-" +
          source.id.replace("lane-", "") +
          "-" +
          step,
        generatorTags: [
          ...(candidateEvent.generatorTags ?? []),
          BEAT_VARIATION_ID,
          "v" + BEAT_VARIATION_VERSION,
        ],
      });
    }
  }

  return {
    ...cloneLane(source),
    events: mergedEvents.sort((a, b) => a.tick - b.tick),
  };
}

function laneMusicalSignature(lane: PatternLane): string {
  return lane.events
    .map((event) => eventComparable(event))
    .sort()
    .join("|");
}

function assertProtectedLanesPreserved(
  source: Pattern,
  next: Pattern,
  targetLaneIds: Set<string> | null,
): void {
  for (const sourceLane of source.lanes) {
    const protectedByTarget =
      targetLaneIds !== null && !targetLaneIds.has(sourceLane.id);
    const protectedLane = sourceLane.lock.rhythm || protectedByTarget;
    if (!protectedLane) continue;

    const nextLane = next.lanes.find((lane) => lane.id === sourceLane.id);
    if (
      !nextLane ||
      laneMusicalSignature(sourceLane) !==
        laneMusicalSignature(nextLane)
    ) {
      throw new Error(
        "Reroll invariant failed: protected lane changed: " +
          sourceLane.id,
      );
    }
  }
}

function countChanges(
  source: Pattern,
  next: Pattern,
  targetLaneIds: Set<string> | null,
): { changedLaneIds: string[]; changedStepCount: number } {
  const changedLaneIds: string[] = [];
  let changedStepCount = 0;

  for (const sourceLane of source.lanes) {
    if (targetLaneIds && !targetLaneIds.has(sourceLane.id)) continue;

    const nextLane = next.lanes.find((lane) => lane.id === sourceLane.id);
    if (!nextLane) continue;

    const sourceByStep = eventMap(sourceLane);
    const nextByStep = eventMap(nextLane);
    const steps = new Set([
      ...sourceByStep.keys(),
      ...nextByStep.keys(),
    ]);
    let laneChanged = false;

    for (const step of steps) {
      if (
        eventComparable(sourceByStep.get(step)) !==
        eventComparable(nextByStep.get(step))
      ) {
        changedStepCount += 1;
        laneChanged = true;
      }
    }

    if (laneChanged) changedLaneIds.push(sourceLane.id);
  }

  return { changedLaneIds, changedStepCount };
}

function forceOneChangeIfPossible(
  source: Pattern,
  candidate: Pattern,
  merged: Pattern,
  targetLaneIds: Set<string> | null,
  seedCode: string,
): Pattern {
  const result = clonePattern(merged);

  for (const sourceLane of source.lanes) {
    if (sourceLane.lock.rhythm) continue;
    if (targetLaneIds && !targetLaneIds.has(sourceLane.id)) continue;

    const candidateLane = candidate.lanes.find(
      (lane) => lane.id === sourceLane.id,
    );
    const resultLane = result.lanes.find(
      (lane) => lane.id === sourceLane.id,
    );
    if (!candidateLane || !resultLane) continue;

    const sourceByStep = eventMap(sourceLane);
    const candidateByStep = eventMap(candidateLane);
    const steps = new Set([
      ...sourceByStep.keys(),
      ...candidateByStep.keys(),
    ]);

    for (const step of [...steps].sort((a, b) => a - b)) {
      const sourceEvent = sourceByStep.get(step);
      const candidateEvent = candidateByStep.get(step);

      if (
        eventComparable(sourceEvent) ===
        eventComparable(candidateEvent)
      ) {
        continue;
      }

      resultLane.events = resultLane.events.filter(
        (event) =>
          Math.round(event.tick / FOUNDATION_STEP_TICKS) !== step,
      );

      if (candidateEvent) {
        resultLane.events.push({
          ...cloneEvent(candidateEvent),
          id:
            sourceEvent?.id ??
            "evt-var-" +
              seedCode +
              "-" +
              sourceLane.id.replace("lane-", "") +
              "-" +
              step,
          generatorTags: [
            ...(candidateEvent.generatorTags ?? []),
            BEAT_VARIATION_ID,
            "v" + BEAT_VARIATION_VERSION,
          ],
        });
        resultLane.events.sort((a, b) => a.tick - b.tick);
      }

      return result;
    }
  }

  return result;
}

function newCriticalFailure(
  sourceValidation: BeatValidation,
  nextValidation: BeatValidation,
): boolean {
  const sourceCritical = new Set(
    sourceValidation.reasons.filter((reason) =>
      CRITICAL_REASONS.has(reason),
    ),
  );

  return nextValidation.reasons.some(
    (reason) =>
      CRITICAL_REASONS.has(reason) && !sourceCritical.has(reason),
  );
}

export function rerollBeat(
  request: BeatVariationRequest,
): BeatVariationResult {
  const distance = clamp01(request.distance);
  const source = clonePattern(request.source);
  const sourceValidation = validateGeneratedBeat(source, request.style);
  const targetLaneIds =
    request.targetLaneIds && request.targetLaneIds.length > 0
      ? new Set(request.targetLaneIds)
      : null;

  const preservedLockedLaneIds = source.lanes
    .filter(
      (lane) =>
        lane.lock.rhythm &&
        (!targetLaneIds || targetLaneIds.has(lane.id)),
    )
    .map((lane) => lane.id);

  const mutableLaneIds = source.lanes
    .filter(
      (lane) =>
        !lane.lock.rhythm &&
        (!targetLaneIds || targetLaneIds.has(lane.id)),
    )
    .map((lane) => lane.id);

  if (mutableLaneIds.length === 0) {
    throw new Error(
      targetLaneIds ? "Selected lane is locked." : "All lanes are locked.",
    );
  }

  let best: BeatVariationResult | null = null;

  for (let attempt = 0; attempt < MAX_VARIATION_ATTEMPTS; attempt += 1) {
    const effectiveSeed = deriveSeed(
      request.seed,
      "variation:" + attempt,
    );
    const candidateRequest: BeatGenerationRequest = {
      seed: deriveSeed(effectiveSeed, "candidate"),
      style: request.style,
      intent: request.intent,
      stepCount: Math.round(
        source.lengthTicks / FOUNDATION_STEP_TICKS,
      ) as 4 | 8 | 16 | 32 | 64,
      bpm: request.bpm,
      meter: source.meter,
    };
    const candidateResult = generateBeat(candidateRequest);
    const seedCode = shortSeed(effectiveSeed);
    const random = new SeededRandom(
      deriveSeed(effectiveSeed, "merge"),
    );

    const merged = clonePattern(source);
    merged.lanes = source.lanes.map((sourceLane) => {
      const candidateLane = candidateResult.pattern.lanes.find(
        (lane) => lane.id === sourceLane.id,
      );
      if (!candidateLane) return cloneLane(sourceLane);

      const targeted =
        !targetLaneIds || targetLaneIds.has(sourceLane.id);

      if (!targeted || sourceLane.lock.rhythm) {
        return cloneLane(sourceLane);
      }

      return mergeLane(
        sourceLane,
        candidateLane,
        distance,
        random,
        seedCode,
      );
    });

    let changeSummary = countChanges(
      source,
      merged,
      targetLaneIds,
    );

    const canForceChange =
      distance >= 0.08 && changeSummary.changedStepCount === 0;
    const mergedWithFallback = canForceChange
      ? forceOneChangeIfPossible(
          source,
          candidateResult.pattern,
          merged,
          targetLaneIds,
          seedCode,
        )
      : merged;

    changeSummary = countChanges(
      source,
      mergedWithFallback,
      targetLaneIds,
    );

    assertProtectedLanesPreserved(
      source,
      mergedWithFallback,
      targetLaneIds,
    );

    mergedWithFallback.id = "pattern-var-" + seedCode;
    mergedWithFallback.name =
      (request.style === "hipHop"
        ? "HIP-HOP"
        : request.style === "breakbeat"
          ? "BREAKS"
          : request.style.toUpperCase()) +
      " / " +
      seedCode;
    mergedWithFallback.groove = targetLaneIds
      ? source.groove
        ? {
            ...source.groove,
            roleTimingOffsetUs: source.groove.roleTimingOffsetUs
              ? { ...source.groove.roleTimingOffsetUs }
              : undefined,
          }
        : undefined
      : candidateResult.pattern.groove
        ? {
            ...candidateResult.pattern.groove,
            roleTimingOffsetUs:
              candidateResult.pattern.groove.roleTimingOffsetUs
                ? {
                    ...candidateResult.pattern.groove.roleTimingOffsetUs,
                  }
                : undefined,
          }
        : source.groove
          ? { ...source.groove }
          : undefined;
    mergedWithFallback.provenance = {
      seed: effectiveSeed,
      generatorId: BEAT_VARIATION_ID,
      generatorVersion: BEAT_VARIATION_VERSION,
      sourceEntityId: source.id,
      mutationId:
        targetLaneIds && targetLaneIds.size === 1
          ? "reroll:" + [...targetLaneIds][0]
          : "reroll:unlocked",
      style: styleVector(request.style),
      intent: intentVector(request.intent, distance),
    };

    const validation = validateGeneratedBeat(
      mergedWithFallback,
      request.style,
    );
    const minimumScore = Math.min(
      72,
      Math.max(55, sourceValidation.score - 15),
    );
    const acceptable =
      validation.score >= minimumScore &&
      !newCriticalFailure(sourceValidation, validation);

    const result: BeatVariationResult = {
      accepted: acceptable,
      pattern: mergedWithFallback,
      effectiveSeed,
      displaySeed: seedCode,
      attempts: attempt + 1,
      validation,
      changedLaneIds: changeSummary.changedLaneIds,
      changedStepCount: changeSummary.changedStepCount,
      preservedLockedLaneIds,
    };

    if (
      !best ||
      validation.score > best.validation.score ||
      (validation.score === best.validation.score &&
        result.changedStepCount > best.changedStepCount)
    ) {
      best = result;
    }

    if (acceptable) return result;
  }

  if (!best) {
    throw new Error("Reroll engine failed to produce a candidate.");
  }

  return best;
}

export const BEAT_VARIATION_META = Object.freeze({
  generatorId: BEAT_VARIATION_ID,
  generatorVersion: BEAT_VARIATION_VERSION,
  sourceGeneratorVersion: BEAT_GENERATOR_VERSION,
  maxAttempts: MAX_VARIATION_ATTEMPTS,
});
