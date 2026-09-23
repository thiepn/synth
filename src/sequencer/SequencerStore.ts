import type {
  Pattern,
  PatternLane,
  StepEvent,
} from "../domain/contracts";
import {
  clonePattern,
  cloneStepEvent,
} from "../domain/patternClone";
import {
  FOUNDATION_STEP_TICKS,
  SEQUENCER_LANES,
  createFoundationPattern,
  laneDefinitionById,
} from "../music/foundationPattern";
import {
  clampManualTimingOffsetUs,
} from "./playbackRules";
import {
  getPatternHitsForAbsoluteStep,
  type PatternPlaybackHit,
} from "./patternPlayback";
import {
  applyLaneAction as applyLaneActionEvents,
  decideBrushStep,
  type LaneActionId,
  type PatternBrushId,
} from "./patternPainting";

export const SEQUENCER_LENGTH_OPTIONS = [4, 8, 16, 32, 64] as const;
export type SequencerLengthSteps =
  (typeof SEQUENCER_LENGTH_OPTIONS)[number];

export type SequencerHit = PatternPlaybackHit;

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

function normalizeVelocity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_STEP_VELOCITY;
  return Math.min(1, Math.max(0.05, value));
}

function lengthStepsFromPattern(pattern: Pattern): SequencerLengthSteps {
  const steps = Math.round(pattern.lengthTicks / FOUNDATION_STEP_TICKS);
  if (steps <= 4) return 4;
  if (steps <= 8) return 8;
  if (steps <= 16) return 16;
  if (steps <= 32) return 32;
  return 64;
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
  private activeGestureKey: string | null = null;
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

  isLaneSoundLocked(laneId: string): boolean {
    return Boolean(
      this.pattern.lanes.find((lane) => lane.id === laneId)?.lock.sound,
    );
  }

  getSoundLockedLaneIds(): string[] {
    return this.pattern.lanes
      .filter((lane) => lane.lock.sound)
      .map((lane) => lane.id);
  }

  toggleLaneSoundLock(laneId: string): void {
    const lane = this.pattern.lanes.find((entry) => entry.id === laneId);
    if (!lane) return;

    this.commit((draft) => {
      const draftLane = draft.lanes.find((entry) => entry.id === laneId);
      if (!draftLane) return;
      draftLane.lock = {
        ...draftLane.lock,
        sound: !draftLane.lock.sound,
      };
    });
  }

  getLaneValues(laneId: string): number[] {
    const lane = this.pattern.lanes.find((entry) => entry.id === laneId);
    const length = lengthStepsFromPattern(this.pattern);

    if (!lane) {
      return Array.from({ length }, () => 0);
    }

    const laneLength = this.getLaneLengthSteps(laneId);

    return Array.from({ length }, (_, stepIndex) => {
      const localStep = stepIndex % laneLength;
      return eventAtStep(lane, localStep)?.velocity ?? 0;
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
    return getPatternHitsForAbsoluteStep(
      this.pattern,
      stepIndex,
    );
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

  setStepProbability(
    laneId: string,
    stepIndex: number,
    probability: number,
  ): void {
    this.updateAdvancedEvent(
      laneId,
      stepIndex,
      "probability",
      Math.max(0, Math.min(1, probability)),
    );
  }

  setStepRatchetCount(
    laneId: string,
    stepIndex: number,
    count: number,
  ): void {
    this.updateAdvancedEvent(
      laneId,
      stepIndex,
      "ratchetCount",
      Math.max(1, Math.min(4, Math.round(count))),
    );
  }

  setStepFlamOffsetUs(
    laneId: string,
    stepIndex: number,
    offsetUs: number,
  ): void {
    this.updateAdvancedEvent(
      laneId,
      stepIndex,
      "flamOffsetUs",
      Math.max(0, Math.min(40_000, Math.round(offsetUs))),
    );
  }

  setStepTimingOffsetUs(
    laneId: string,
    stepIndex: number,
    offsetUs: number,
  ): void {
    this.updateAdvancedEvent(
      laneId,
      stepIndex,
      "timingOffsetUs",
      clampManualTimingOffsetUs(offsetUs),
    );
  }

  getLaneLengthSteps(laneId: string): number {
    const lane = this.pattern.lanes.find((entry) => entry.id === laneId);
    if (!lane) return lengthStepsFromPattern(this.pattern);
    return Math.max(
      1,
      Math.min(
        lengthStepsFromPattern(this.pattern),
        Math.round(
          (lane.loopLengthTicks ?? this.pattern.lengthTicks) /
            FOUNDATION_STEP_TICKS,
        ),
      ),
    );
  }

  setLaneLengthSteps(laneId: string, steps: number): void {
    const safe = Math.max(
      1,
      Math.min(lengthStepsFromPattern(this.pattern), Math.round(steps)),
    );
    this.commit((draft) => {
      const lane = draft.lanes.find((entry) => entry.id === laneId);
      if (!lane) return;
      lane.loopLengthTicks =
        safe === lengthStepsFromPattern(draft)
          ? undefined
          : safe * FOUNDATION_STEP_TICKS;
    });
  }

  beginPaintGesture(gestureId: string): void {
    this.activeGestureKey = "gesture:" + gestureId;
  }

  paintBrushStep(
    gestureId: string,
    brush: PatternBrushId,
    hoveredLaneId: string,
    stepIndex: number,
    density: number,
    seed: string,
  ): void {
    if (!this.isValidStep(stepIndex)) return;

    const decision = decideBrushStep({
      brush,
      hoveredLaneId,
      stepIndex,
      density,
      seed,
    });
    const targetLane = this.pattern.lanes.find(
      (lane) => lane.id === decision.targetLaneId,
    );
    if (!targetLane) return;

    const laneLength = this.getLaneLengthSteps(decision.targetLaneId);
    if (stepIndex >= laneLength) return;

    const gestureKey = "gesture:" + gestureId;

    this.commit(
      (draft) => {
        const lane = draft.lanes.find(
          (entry) => entry.id === decision.targetLaneId,
        );
        if (!lane) return;

        const existing = eventAtStep(lane, stepIndex);

        if (decision.remove) {
          if (!existing) return;
          lane.events = lane.events.filter(
            (event) => event.id !== existing.id,
          );
          return;
        }

        if (!decision.event) return;

        const next: StepEvent = {
          ...(existing ? cloneStepEvent(existing) : createStepEvent(
            decision.targetLaneId,
            stepIndex,
            decision.event.velocity,
          )),
          ...decision.event,
          id:
            existing?.id ??
            "evt-paint-" +
              decision.targetLaneId +
              "-" +
              stepIndex,
          tick: stepIndex * FOUNDATION_STEP_TICKS,
          grooveBase: undefined,
        };
        next.generatorTags = [
          ...(next.generatorTags ?? []).filter(
            (tag) => !tag.startsWith("groove-engine"),
          ),
          "paint-gesture",
        ];

        if (existing) {
          lane.events = lane.events.map((event) =>
            event.id === existing.id ? next : event,
          );
        } else {
          lane.events.push(next);
          lane.events.sort((a, b) => a.tick - b.tick);
        }
      },
      gestureKey,
    );
  }

  endPaintGesture(gestureId: string): void {
    const gestureKey = "gesture:" + gestureId;
    if (this.activeGestureKey !== gestureKey) return;
    this.activeGestureKey = null;
    this.lastCoalesceKey = null;
    this.lastCoalesceAt = 0;
  }

  applyLaneGestureAction(
    laneId: string,
    action: LaneActionId,
    density: number,
    amount: number,
    seed: string,
  ): boolean {
    const sourceLane = this.pattern.lanes.find(
      (lane) => lane.id === laneId,
    );
    if (!sourceLane) return false;

    if (
      action !== "humanize" &&
      sourceLane.lock.rhythm
    ) {
      return false;
    }

    if (
      action === "humanize" &&
      sourceLane.lock.dynamics &&
      sourceLane.lock.timing
    ) {
      return false;
    }

    const definition = laneDefinitionById(laneId);
    if (!definition) return false;
    const laneLength = this.getLaneLengthSteps(laneId);
    const activeEvents = sourceLane.events.filter(
      (event) =>
        event.tick < laneLength * FOUNDATION_STEP_TICKS,
    );

    const nextActive = applyLaneActionEvents({
      action,
      laneId,
      role: sourceLane.role,
      events: activeEvents,
      laneLengthSteps: laneLength,
      density,
      amount,
      seed,
      dynamicsLocked: sourceLane.lock.dynamics,
      timingLocked: sourceLane.lock.timing,
    });

    this.commit((draft) => {
      const lane = draft.lanes.find(
        (entry) => entry.id === laneId,
      );
      if (!lane) return;

      const dormant = lane.events
        .filter(
          (event) =>
            event.tick >= laneLength * FOUNDATION_STEP_TICKS,
        )
        .map(cloneStepEvent);

      lane.events = [
        ...nextActive.map(cloneStepEvent),
        ...dormant,
      ].sort((a, b) => a.tick - b.tick);
    });

    return true;
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
      throw new Error("Generated pattern length is not supported by Sequencer V2.");
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
        loopLengthTicks:
          current?.loopLengthTicks ?? lane.loopLengthTicks,
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

  restoreProjectPattern(nextPattern: Pattern): void {
    const restored = clonePattern(nextPattern);
    this.validatePatternShape(restored, "Project");
    this.pattern = restored;
    this.undoStack = [];
    this.redoStack = [];
    this.lastCoalesceKey = null;
    this.lastCoalesceAt = 0;
    this.activeGestureKey = null;
    this.revision += 1;
    this.publish();
  }

  restorePatternSnapshot(nextPattern: Pattern): void {
    this.validatePatternShape(nextPattern, "History");

    const monitoringById = new Map(
      this.pattern.lanes.map((lane) => [
        lane.id,
        {
          muted: lane.muted ?? false,
          solo: lane.solo ?? false,
        },
      ]),
    );
    const restored = clonePattern(nextPattern);

    restored.lanes = restored.lanes.map((lane) => {
      const monitoring = monitoringById.get(lane.id);
      return {
        ...lane,
        muted: monitoring?.muted ?? lane.muted ?? false,
        solo: monitoring?.solo ?? lane.solo ?? false,
      };
    });

    this.pushUndo();
    this.pattern = restored;
    this.redoStack = [];
    this.lastCoalesceKey = null;
    this.lastCoalesceAt = 0;
    this.revision += 1;
    this.publish();
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
        if (
          lane.loopLengthTicks &&
          lane.loopLengthTicks > draft.lengthTicks
        ) {
          lane.loopLengthTicks = draft.lengthTicks;
        }
      }
    });
  }

  duplicate(): void {
    const length = lengthStepsFromPattern(this.pattern);
    const sourceLength = length < 64 ? length : 32;
    const targetStart = length < 64 ? length : 32;
    const nextLength = Math.min(64, length < 64 ? length * 2 : 64);

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
            ...cloneStepEvent(source),
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

  private updateAdvancedEvent(
    laneId: string,
    stepIndex: number,
    key: "probability" | "ratchetCount" | "flamOffsetUs" | "timingOffsetUs",
    value: number,
  ): void {
    if (!this.isValidStep(stepIndex)) return;

    this.commit(
      (draft) => {
        const lane = draft.lanes.find((entry) => entry.id === laneId);
        if (!lane) return;
        let event = eventAtStep(lane, stepIndex);
        if (!event) {
          event = createStepEvent(
            laneId,
            stepIndex,
            laneDefaultVelocity(laneId, stepIndex),
          );
          lane.events.push(event);
          lane.events.sort((a, b) => a.tick - b.tick);
        }

        if (key === "timingOffsetUs") {
          event.timingOffsetUs = value;
          delete event.grooveBase;
          event.generatorTags = event.generatorTags?.filter(
            (tag) => !tag.startsWith("groove-engine"),
          );
        } else if (key === "probability") {
          event.probability = value;
        } else if (key === "ratchetCount") {
          event.ratchetCount = value <= 1 ? undefined : value;
        } else {
          event.flamOffsetUs = value <= 0 ? undefined : value;
        }
      },
      key + ":" + laneId + ":" + stepIndex,
    );
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
      (
        this.activeGestureKey === coalesceKey ||
        now - this.lastCoalesceAt < 900
      );

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

  private validatePatternShape(
    pattern: Pattern,
    sourceLabel: string,
  ): void {
    const allowedLengths = new Set(
      SEQUENCER_LENGTH_OPTIONS.map(
        (steps) => steps * FOUNDATION_STEP_TICKS,
      ),
    );

    if (pattern.ppq !== this.pattern.ppq) {
      throw new Error(
        sourceLabel + " Pattern PPQ does not match the sequencer.",
      );
    }

    if (!allowedLengths.has(pattern.lengthTicks)) {
      throw new Error(
        sourceLabel +
          " Pattern length is not supported by Sequencer V2.",
      );
    }

    const nextLaneIds = new Set(
      pattern.lanes.map((lane) => lane.id),
    );
    const missingLane = SEQUENCER_LANES.find(
      (definition) => !nextLaneIds.has(definition.id),
    );
    if (missingLane) {
      throw new Error(
        sourceLabel +
          " Pattern is missing lane " +
          missingLane.id,
      );
    }
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
