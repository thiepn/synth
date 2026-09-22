import type {
  Pattern,
  PatternLane,
  StepEvent,
} from "../domain/contracts";
import {
  FOUNDATION_STEP_TICKS,
  SEQUENCER_LANES,
  createFoundationPattern,
  laneDefinitionById,
  type DrumVoiceId,
} from "../music/foundationPattern";

export const SEQUENCER_LENGTH_OPTIONS = [4, 8, 16] as const;
export type SequencerLengthSteps =
  (typeof SEQUENCER_LENGTH_OPTIONS)[number];

export interface SequencerHit {
  voice: DrumVoiceId;
  velocity: number;
  timingOffsetUs: number;
  laneId: string;
}

export interface SequencerSnapshot {
  pattern: Pattern;
  lengthSteps: SequencerLengthSteps;
  revision: number;
  canUndo: boolean;
  canRedo: boolean;
  soloLaneCount: number;
}

type StoreListener = () => void;

const HISTORY_LIMIT = 100;
const DEFAULT_STEP_VELOCITY = 0.76;

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

function normalizeVelocity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_STEP_VELOCITY;
  return Math.min(1, Math.max(0.05, value));
}

function lengthStepsFromPattern(pattern: Pattern): SequencerLengthSteps {
  const steps = Math.round(pattern.lengthTicks / FOUNDATION_STEP_TICKS);
  if (steps <= 4) return 4;
  if (steps <= 8) return 8;
  return 16;
}

function eventAtStep(
  lane: PatternLane,
  stepIndex: number,
): StepEvent | undefined {
  const targetTick = stepIndex * FOUNDATION_STEP_TICKS;
  return lane.events.find((event) => event.tick === targetTick);
}

function eventId(laneId: string, stepIndex: number): string {
  return "evt-" + laneId + "-" + stepIndex;
}

function accentFromVelocity(
  velocity: number,
): StepEvent["accent"] {
  if (velocity >= 0.85) return "accent";
  if (velocity <= 0.3) return "ghost";
  return "normal";
}

function createStepEvent(
  laneId: string,
  stepIndex: number,
  velocity: number,
): StepEvent {
  const safeVelocity = normalizeVelocity(velocity);

  return {
    id: eventId(laneId, stepIndex),
    tick: stepIndex * FOUNDATION_STEP_TICKS,
    velocity: safeVelocity,
    probability: 1,
    timingOffsetUs: 0,
    accent: accentFromVelocity(safeVelocity),
  };
}

function laneDefaultVelocity(
  laneId: string,
  stepIndex: number,
): number {
  const definition = laneDefinitionById(laneId);
  const fromSeed = definition?.defaultValues[stepIndex] ?? 0;
  return fromSeed > 0 ? fromSeed : DEFAULT_STEP_VELOCITY;
}

export class SequencerStore {
  private pattern = createFoundationPattern();
  private undoStack: Pattern[] = [];
  private redoStack: Pattern[] = [];
  private revision = 0;
  private lastCoalesceKey: string | null = null;
  private lastCoalesceAt = 0;
  private listeners = new Set<StoreListener>();
  private snapshot: SequencerSnapshot = this.buildSnapshot();

  readonly subscribe = (listener: StoreListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): SequencerSnapshot => this.snapshot;

  isLaneRhythmLocked(laneId: string): boolean {
    return Boolean(
      this.pattern.lanes.find((lane) => lane.id === laneId)?.lock.rhythm,
    );
  }

  getLockedLaneIds(): string[] {
    return this.pattern.lanes
      .filter((lane) => lane.lock.rhythm)
      .map((lane) => lane.id);
  }

  toggleLaneRhythmLock(laneId: string): void {
    const lane = this.pattern.lanes.find((entry) => entry.id === laneId);
    if (!lane) return;

    this.commit((draft) => {
      const draftLane = draft.lanes.find((entry) => entry.id === laneId);
      if (!draftLane) return;
      draftLane.lock = {
        ...draftLane.lock,
        rhythm: !draftLane.lock.rhythm,
      };
    });
  }

  getLaneValues(laneId: string): number[] {
    const lane = this.pattern.lanes.find((entry) => entry.id === laneId);
    const length = lengthStepsFromPattern(this.pattern);

    if (!lane) {
      return Array.from({ length }, () => 0);
    }

    return Array.from({ length }, (_, stepIndex) => {
      return eventAtStep(lane, stepIndex)?.velocity ?? 0;
    });
  }

  getStepVelocity(
    laneId: string,
    stepIndex: number,
  ): number | undefined {
    const lane = this.pattern.lanes.find((entry) => entry.id === laneId);
    return lane ? eventAtStep(lane, stepIndex)?.velocity : undefined;
  }

  getHitsForStep(stepIndex: number): SequencerHit[] {
    const length = lengthStepsFromPattern(this.pattern);
    const normalizedStep =
      ((Math.floor(stepIndex) % length) + length) % length;
    const soloActive = this.pattern.lanes.some((lane) => lane.solo);

    const hits: SequencerHit[] = [];

    for (const lane of this.pattern.lanes) {
      if (lane.muted) continue;
      if (soloActive && !lane.solo) continue;

      const event = eventAtStep(lane, normalizedStep);
      if (!event || event.probability <= 0) continue;

      const definition = laneDefinitionById(lane.id);
      if (!definition) continue;

      hits.push({
        voice: definition.voice,
        velocity: event.velocity,
        timingOffsetUs: event.timingOffsetUs,
        laneId: lane.id,
      });
    }

    return hits;
  }

  toggleStep(laneId: string, stepIndex: number): void {
    if (!this.isValidStep(stepIndex)) return;

    const lane = this.pattern.lanes.find((entry) => entry.id === laneId);
    if (!lane) return;

    this.commit((draft) => {
      const draftLane = draft.lanes.find((entry) => entry.id === laneId);
      if (!draftLane) return;

      const existing = eventAtStep(draftLane, stepIndex);
      if (existing) {
        draftLane.events = draftLane.events.filter(
          (event) => event.id !== existing.id,
        );
      } else {
        draftLane.events.push(
          createStepEvent(
            laneId,
            stepIndex,
            laneDefaultVelocity(laneId, stepIndex),
          ),
        );
        draftLane.events.sort((a, b) => a.tick - b.tick);
      }
    });
  }

  setStepVelocity(
    laneId: string,
    stepIndex: number,
    velocity: number,
  ): void {
    if (!this.isValidStep(stepIndex)) return;

    const lane = this.pattern.lanes.find((entry) => entry.id === laneId);
    if (!lane) return;

    const safeVelocity = normalizeVelocity(velocity);
    const existing = eventAtStep(lane, stepIndex);
    if (
      existing &&
      Math.abs(existing.velocity - safeVelocity) < 0.0001
    ) {
      return;
    }

    this.commit(
      (draft) => {
        const draftLane = draft.lanes.find((entry) => entry.id === laneId);
        if (!draftLane) return;

        const draftEvent = eventAtStep(draftLane, stepIndex);
        if (draftEvent) {
          draftEvent.velocity = safeVelocity;
          draftEvent.accent = accentFromVelocity(safeVelocity);
          delete draftEvent.grooveBase;
          draftEvent.generatorTags = draftEvent.generatorTags?.filter(
            (tag) => !tag.startsWith("groove-engine"),
          );
        } else {
          draftLane.events.push(
            createStepEvent(laneId, stepIndex, safeVelocity),
          );
          draftLane.events.sort((a, b) => a.tick - b.tick);
        }
      },
      "velocity:" + laneId + ":" + stepIndex,
    );
  }

  cycleStepVelocity(laneId: string, stepIndex: number): void {
    const current = this.getStepVelocity(laneId, stepIndex);
    if (current === undefined) {
      this.setStepVelocity(laneId, stepIndex, 0.5);
      return;
    }

    const next =
      current < 0.45
        ? 0.62
        : current < 0.72
          ? 0.86
          : current < 0.95
            ? 1
            : 0.32;

    this.setStepVelocity(laneId, stepIndex, next);
  }

  toggleMute(laneId: string): void {
    const lane = this.pattern.lanes.find((entry) => entry.id === laneId);
    if (!lane) return;

    this.commit((draft) => {
      const draftLane = draft.lanes.find((entry) => entry.id === laneId);
      if (draftLane) draftLane.muted = !draftLane.muted;
    });
  }

  toggleSolo(laneId: string): void {
    const lane = this.pattern.lanes.find((entry) => entry.id === laneId);
    if (!lane) return;

    this.commit((draft) => {
      const draftLane = draft.lanes.find((entry) => entry.id === laneId);
      if (draftLane) draftLane.solo = !draftLane.solo;
    });
  }

  clearPattern(): void {
    if (this.pattern.lanes.every((lane) => lane.events.length === 0)) {
      return;
    }

    this.commit((draft) => {
      for (const lane of draft.lanes) {
        lane.events = [];
      }
    });
  }

  resetPattern(): void {
    const next = createFoundationPattern();
    if (JSON.stringify(next) === JSON.stringify(this.pattern)) return;

    this.pushUndo();
    this.pattern = next;
    this.redoStack = [];
    this.lastCoalesceKey = null;
    this.lastCoalesceAt = 0;
    this.revision += 1;
    this.publish();
  }

  applyGeneratedPattern(nextPattern: Pattern): void {
    const allowedLengths = new Set(
      SEQUENCER_LENGTH_OPTIONS.map(
        (steps) => steps * FOUNDATION_STEP_TICKS,
      ),
    );

    if (nextPattern.ppq !== this.pattern.ppq) {
      throw new Error("Generated pattern PPQ does not match the sequencer.");
    }

    if (!allowedLengths.has(nextPattern.lengthTicks)) {
      throw new Error("Generated pattern length is not supported by V1.");
    }

    const nextLaneIds = new Set(nextPattern.lanes.map((lane) => lane.id));
    const missingLane = SEQUENCER_LANES.find(
      (definition) => !nextLaneIds.has(definition.id),
    );
    if (missingLane) {
      throw new Error("Generated pattern is missing lane " + missingLane.id);
    }

    const currentById = new Map(
      this.pattern.lanes.map((lane) => [lane.id, lane]),
    );
    const generated = clonePattern(nextPattern);

    generated.lanes = generated.lanes.map((lane) => {
      const current = currentById.get(lane.id);
      return {
        ...lane,
        muted: current?.muted ?? false,
        solo: current?.solo ?? false,
        lock: current ? { ...current.lock } : { ...lane.lock },
        regionLocks: current?.regionLocks?.map((lock) => ({ ...lock })),
      };
    });

    this.pushUndo();
    this.pattern = generated;
    this.redoStack = [];
    this.lastCoalesceKey = null;
    this.lastCoalesceAt = 0;
    this.revision += 1;
    this.publish();
  }

  applyPatternTransform(nextPattern: Pattern): void {
    if (JSON.stringify(nextPattern) === JSON.stringify(this.pattern)) {
      return;
    }
    this.applyGeneratedPattern(nextPattern);
  }

  setLengthSteps(nextLength: SequencerLengthSteps): void {
    if (!SEQUENCER_LENGTH_OPTIONS.includes(nextLength)) return;

    const currentLength = lengthStepsFromPattern(this.pattern);
    if (currentLength === nextLength) return;

    this.commit((draft) => {
      draft.lengthTicks = nextLength * FOUNDATION_STEP_TICKS;

      for (const lane of draft.lanes) {
        lane.events = lane.events.filter(
          (event) => event.tick < draft.lengthTicks,
        );
      }
    });
  }

  duplicate(): void {
    const length = lengthStepsFromPattern(this.pattern);
    const sourceLength = length < 16 ? length : 8;
    const targetStart = length < 16 ? length : 8;
    const nextLength = Math.min(16, length < 16 ? length * 2 : 16);

    this.commit((draft) => {
      draft.lengthTicks = nextLength * FOUNDATION_STEP_TICKS;

      for (const lane of draft.lanes) {
        const sourceEvents = lane.events.filter(
          (event) => event.tick < sourceLength * FOUNDATION_STEP_TICKS,
        );

        lane.events = lane.events.filter(
          (event) =>
            event.tick < targetStart * FOUNDATION_STEP_TICKS ||
            event.tick >=
              (targetStart + sourceLength) * FOUNDATION_STEP_TICKS,
        );

        for (const source of sourceEvents) {
          const sourceStep = Math.round(
            source.tick / FOUNDATION_STEP_TICKS,
          );
          const targetStep = targetStart + sourceStep;
          if (targetStep >= nextLength) continue;

          lane.events.push({
            ...cloneEvent(source),
            id: eventId(lane.id, targetStep),
            tick: targetStep * FOUNDATION_STEP_TICKS,
          });
        }

        lane.events.sort((a, b) => a.tick - b.tick);
      }
    });
  }

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;

    this.redoStack.push(clonePattern(this.pattern));
    this.pattern = previous;
    this.lastCoalesceKey = null;
    this.lastCoalesceAt = 0;
    this.revision += 1;
    this.publish();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;

    this.undoStack.push(clonePattern(this.pattern));
    this.pattern = next;
    this.lastCoalesceKey = null;
    this.lastCoalesceAt = 0;
    this.revision += 1;
    this.publish();
  }

  private isValidStep(stepIndex: number): boolean {
    return (
      Number.isInteger(stepIndex) &&
      stepIndex >= 0 &&
      stepIndex < lengthStepsFromPattern(this.pattern)
    );
  }

  private commit(
    mutator: (draft: Pattern) => void,
    coalesceKey: string | null = null,
  ): void {
    const before = clonePattern(this.pattern);
    const draft = clonePattern(this.pattern);
    mutator(draft);

    if (JSON.stringify(before) === JSON.stringify(draft)) return;

    const now = Date.now();
    const shouldCoalesce =
      coalesceKey !== null &&
      this.lastCoalesceKey === coalesceKey &&
      now - this.lastCoalesceAt < 900;

    if (!shouldCoalesce) {
      this.undoStack.push(before);
      if (this.undoStack.length > HISTORY_LIMIT) {
        this.undoStack.shift();
      }
    }

    this.redoStack = [];
    this.pattern = draft;
    this.lastCoalesceKey = coalesceKey;
    this.lastCoalesceAt = coalesceKey === null ? 0 : now;
    this.revision += 1;
    this.publish();
  }

  private pushUndo(): void {
    this.undoStack.push(clonePattern(this.pattern));
    if (this.undoStack.length > HISTORY_LIMIT) {
      this.undoStack.shift();
    }
  }

  private publish(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) {
      listener();
    }
  }

  private buildSnapshot(): SequencerSnapshot {
    return {
      pattern: clonePattern(this.pattern),
      lengthSteps: lengthStepsFromPattern(this.pattern),
      revision: this.revision,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      soloLaneCount: this.pattern.lanes.filter((lane) => lane.solo).length,
    };
  }
}

export const sequencerStore = new SequencerStore();

export const SEQUENCER_META = Object.freeze({
  stepTicks: FOUNDATION_STEP_TICKS,
  laneCount: SEQUENCER_LANES.length,
  maxHistory: HISTORY_LIMIT,
});
