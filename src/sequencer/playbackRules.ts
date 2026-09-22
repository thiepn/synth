import type { StepEvent } from "../domain/contracts";

export const SEQUENCER_ADVANCED_LIMITS = Object.freeze({
  maxSteps: 64,
  maxRatchets: 4,
  maxFlamOffsetUs: 60_000,
  maxManualTimingOffsetUs: 50_000,
});

function hash32(input: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

function unitFloat(seed: string): number {
  let state = hash32(seed) || 0x9e3779b9;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 4294967296;
}

export function eventPassesProbability(
  patternId: string,
  laneId: string,
  event: StepEvent,
  laneCycleIndex: number,
): boolean {
  if (event.probability >= 1) return true;
  if (event.probability <= 0) return false;

  const value = unitFloat(
    [
      patternId,
      laneId,
      event.id,
      laneCycleIndex,
      event.probability.toFixed(6),
    ].join(":"),
  );

  return value < event.probability;
}

export function normalizedRatchetCount(event: StepEvent): number {
  const raw = Math.round(event.ratchetCount ?? 1);
  return Math.min(
    SEQUENCER_ADVANCED_LIMITS.maxRatchets,
    Math.max(1, raw),
  );
}

export function normalizedFlamOffsetUs(event: StepEvent): number {
  const raw = Math.round(event.flamOffsetUs ?? 0);
  return Math.min(
    SEQUENCER_ADVANCED_LIMITS.maxFlamOffsetUs,
    Math.max(0, raw),
  );
}

export function clampManualTimingOffsetUs(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const limit = SEQUENCER_ADVANCED_LIMITS.maxManualTimingOffsetUs;
  return Math.round(Math.max(-limit, Math.min(limit, value)));
}
