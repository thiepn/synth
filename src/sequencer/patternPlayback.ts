import type { Pattern } from "../domain/contracts";
import {
  FOUNDATION_STEP_TICKS,
  laneDefinitionById,
  type DrumVoiceId,
} from "../music/foundationPattern";
import {
  eventPassesProbability,
  normalizedFlamOffsetUs,
  normalizedRatchetCount,
} from "./playbackRules";

export interface PatternPlaybackHit {
  voice: DrumVoiceId;
  kitSlotId: string;
  velocity: number;
  timingOffsetUs: number;
  ratchetCount: number;
  flamOffsetUs: number;
  laneId: string;
  laneStepIndex: number;
  laneCycleIndex: number;
}

export function getPatternHitsForAbsoluteStep(
  pattern: Pattern,
  absoluteStepInput: number,
  probabilityCycleOffset = 0,
): PatternPlaybackHit[] {
  const absoluteStep = Math.max(0, Math.floor(absoluteStepInput));
  const patternLength = Math.max(
    1,
    Math.round(pattern.lengthTicks / FOUNDATION_STEP_TICKS),
  );
  const soloActive = pattern.lanes.some((lane) => lane.solo);
  const hits: PatternPlaybackHit[] = [];

  for (const lane of pattern.lanes) {
    if (lane.muted) continue;
    if (soloActive && !lane.solo) continue;

    const laneLength = Math.max(
      1,
      Math.min(
        patternLength,
        Math.round(
          (lane.loopLengthTicks ?? pattern.lengthTicks) /
            FOUNDATION_STEP_TICKS,
        ),
      ),
    );
    const laneStepIndex = absoluteStep % laneLength;
    const laneCycleIndex =
      probabilityCycleOffset +
      Math.floor(absoluteStep / laneLength);
    const tick = laneStepIndex * FOUNDATION_STEP_TICKS;
    const event = lane.events.find((entry) => entry.tick === tick);
    if (!event) continue;

    if (
      !eventPassesProbability(
        pattern.id,
        lane.id,
        event,
        laneCycleIndex,
      )
    ) {
      continue;
    }

    const definition = laneDefinitionById(lane.id);
    if (!definition) continue;

    hits.push({
      voice: definition.voice,
      kitSlotId: lane.kitSlotId,
      velocity: event.velocity,
      timingOffsetUs: event.timingOffsetUs,
      ratchetCount: normalizedRatchetCount(event),
      flamOffsetUs: normalizedFlamOffsetUs(event),
      laneId: lane.id,
      laneStepIndex,
      laneCycleIndex,
    });
  }

  return hits;
}
