import type {
  GenerationProvenance,
  Pattern,
  PatternLane,
  StepEvent,
} from "./contracts";

export function cloneStepEvent(
  event: StepEvent,
): StepEvent {
  return {
    ...event,
    pitchesMidi: event.pitchesMidi
      ? [...event.pitchesMidi]
      : undefined,
    generatorTags: event.generatorTags
      ? [...event.generatorTags]
      : undefined,
    grooveBase: event.grooveBase
      ? { ...event.grooveBase }
      : undefined,
  };
}

export function clonePatternLane(
  lane: PatternLane,
): PatternLane {
  return {
    ...lane,
    mix: lane.mix ? { ...lane.mix } : undefined,
    events: lane.events.map(cloneStepEvent),
    lock: { ...lane.lock },
    regionLocks: lane.regionLocks?.map(
      (lock) => ({ ...lock }),
    ),
  };
}

export function cloneGenerationProvenance(
  provenance: GenerationProvenance | undefined,
): GenerationProvenance | undefined {
  return provenance
    ? {
        ...provenance,
        style: { ...provenance.style },
        intent: { ...provenance.intent },
      }
    : undefined;
}

export function clonePattern(
  pattern: Pattern,
): Pattern {
  return {
    ...pattern,
    meter: { ...pattern.meter },
    harmonicContext: pattern.harmonicContext
      ? { ...pattern.harmonicContext }
      : undefined,
    lanes: pattern.lanes.map(clonePatternLane),
    groove: pattern.groove
      ? {
          ...pattern.groove,
          roleTimingOffsetUs:
            pattern.groove.roleTimingOffsetUs
              ? {
                  ...pattern.groove.roleTimingOffsetUs,
                }
              : undefined,
        }
      : undefined,
    provenance: cloneGenerationProvenance(
      pattern.provenance,
    ),
  };
}
