import type { Pattern } from "../domain/contracts";
import { hashSeed } from "../generation/prng";
import {
  FOUNDATION_STEP_TICKS,
  SEQUENCER_LANES,
  type DrumVoiceId,
} from "../music/foundationPattern";
import type { PatternPlaybackHit } from "../sequencer/patternPlayback";
import type { PerformanceResolvedState } from "./PerformanceStore";

export interface PerformancePlaybackResult {
  hits: PatternPlaybackHit[];
  velocityScale: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function unit(key: string): number {
  return hashSeed(key) / 4294967296;
}

function isAnchor(hit: PatternPlaybackHit): boolean {
  if (
    (hit.voice === "snare" || hit.voice === "clap") &&
    hit.laneStepIndex % 4 === 0
  ) {
    return true;
  }

  return hit.voice === "kick" && hit.laneStepIndex % 16 === 0;
}

function laneForVoice(pattern: Pattern, voice: DrumVoiceId) {
  const definition = SEQUENCER_LANES.find((lane) => lane.voice === voice);
  if (!definition) return undefined;
  return pattern.lanes.find((lane) => lane.id === definition.id);
}

function generatedHit(
  pattern: Pattern,
  voice: DrumVoiceId,
  absoluteStep: number,
  velocity: number,
  ratchetCount = 1,
): PatternPlaybackHit | undefined {
  const definition = SEQUENCER_LANES.find((lane) => lane.voice === voice);
  const lane = laneForVoice(pattern, voice);
  if (!definition || !lane || lane.muted) return undefined;

  const patternSteps = Math.max(1, Math.round(pattern.lengthTicks / FOUNDATION_STEP_TICKS));
  const laneSteps = Math.max(
    1,
    Math.min(
      patternSteps,
      Math.round((lane.loopLengthTicks ?? pattern.lengthTicks) / FOUNDATION_STEP_TICKS),
    ),
  );

  return {
    voice,
    kitSlotId: lane.kitSlotId,
    velocity: clamp01(velocity),
    timingOffsetUs: 0,
    ratchetCount,
    flamOffsetUs: 0,
    laneId: lane.id,
    laneStepIndex: absoluteStep % laneSteps,
    laneCycleIndex: Math.floor(absoluteStep / laneSteps),
  };
}

function addIfMissing(
  target: PatternPlaybackHit[],
  hit: PatternPlaybackHit | undefined,
): void {
  if (!hit) return;
  if (target.some((entry) => entry.laneId === hit.laneId)) return;
  target.push(hit);
}

export function applyPerformanceToHits(
  sourceHits: readonly PatternPlaybackHit[],
  pattern: Pattern,
  absoluteStep: number,
  absoluteTick: number,
  state: PerformanceResolvedState,
): PerformancePlaybackResult {
  const breakActive = state.momentary.break;
  const buildActive = state.momentary.build;
  const dropActive = state.momentary.drop;

  let density = state.macros.density;
  let energy = 0.7 + state.macros.energy * 0.6;

  if (breakActive) {
    density *= 0.48;
    energy *= 0.68;
  }

  if (buildActive) {
    density = Math.max(density, 0.82);
    energy *= 1.12;
  }

  const filtered: PatternPlaybackHit[] = [];

  for (const hit of sourceHits) {
    if (state.trackMutes.has(hit.laneId)) continue;
    if (dropActive && (hit.voice === "kick" || hit.voice === "tom")) {
      continue;
    }

    if (density < 0.999 && !isAnchor(hit)) {
      const threshold = unit(
        [
          "perform-density",
          hit.laneId,
          hit.laneStepIndex,
          hit.laneCycleIndex,
        ].join("|"),
      );
      if (threshold > density) continue;
    }

    if (
      breakActive &&
      hit.voice === "kick" &&
      hit.laneStepIndex % 16 !== 0
    ) {
      continue;
    }

    filtered.push({ ...hit });
  }

  if (state.fillActive) {
    const phase = absoluteStep % 4;
    const fillVoice: DrumVoiceId =
      phase === 0
        ? "snare"
        : phase === 1
          ? "tom"
          : phase === 2
            ? "snare"
            : "percussion";
    addIfMissing(
      filtered,
      generatedHit(
        pattern,
        fillVoice,
        absoluteStep,
        0.58 + phase * 0.08,
        phase === 3 ? 2 : 1,
      ),
    );
  }

  if (buildActive && absoluteStep % 2 === 1) {
    addIfMissing(
      filtered,
      generatedHit(
        pattern,
        "closedHat",
        absoluteStep,
        0.48 + (absoluteStep % 4 === 3 ? 0.16 : 0),
      ),
    );
  }

  if (state.momentary.stutter) {
    for (const hit of filtered) {
      hit.ratchetCount = Math.max(3, Math.min(4, hit.ratchetCount + 2));
    }
  }

  return {
    hits: filtered,
    velocityScale: Math.max(0.35, Math.min(1.35, energy)),
  };
}
