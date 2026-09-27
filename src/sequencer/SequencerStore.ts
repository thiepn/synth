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

export const SEQUENCER_MIN_STEPS = 4;
export const SEQUENCER_MAX_STEPS = 128;
export const SEQUENCER_LENGTH_QUANTUM = 4;
export const SEQUENCER_BAR_STEPS = 16;
export const SEQUENCER_LENGTH_OPTIONS: readonly number[] = [
  4,
  8,
  16,
  32,
  64,
  128,
];
export type SequencerLengthSteps = number;

export type SequencerHit = PatternPlaybackHit;

export interface LaneClipboardData {
  sourceLaneId: string;
  laneLengthSteps: number;
  events: StepEvent[];
}

export interface SequencerStepSelection {
  laneId: string;
  stepIndex: number;
}

export interface StepSelectionClipboardEntry {
  laneId: string;
  offsetSteps: number;
  event: StepEvent;
}

export interface StepSelectionClipboardData {
  widthSteps: number;
  entries: StepSelectionClipboardEntry[];
}

export type SequencerStepDynamic =
  | "ghost"
  | "normal"
  | "accent";

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

function isSupportedSequencerLengthSteps(
  steps: number,
): boolean {
  return (
    Number.isInteger(steps) &&
    steps >= SEQUENCER_MIN_STEPS &&
    steps <= SEQUENCER_MAX_STEPS &&
    steps % SEQUENCER_LENGTH_QUANTUM === 0
  );
}

function lengthStepsFromPattern(pattern: Pattern): SequencerLengthSteps {
  const steps = Math.round(
    pattern.lengthTicks / FOUNDATION_STEP_TICKS,
  );
  return Math.max(
    SEQUENCER_MIN_STEPS,
    Math.min(SEQUENCER_MAX_STEPS, steps),
  );
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
  private transientMutedLaneIds = new Set<string>();
  private transientSoloLaneIds = new Set<string>();
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
    return this.filterHitsForTransientMonitoring(
      getPatternHitsForAbsoluteStep(
        this.pattern,
        stepIndex,
      ),
    );
  }

  setTransientMute(
    laneId: string,
    active: boolean,
  ): void {
    if (!this.pattern.lanes.some((lane) => lane.id === laneId)) return;
    if (active) {
      this.transientMutedLaneIds.add(laneId);
    } else {
      this.transientMutedLaneIds.delete(laneId);
    }
  }

  setTransientSolo(
    laneId: string,
    active: boolean,
  ): void {
    if (!this.pattern.lanes.some((lane) => lane.id === laneId)) return;
    if (active) {
      this.transientSoloLaneIds.add(laneId);
    } else {
      this.transientSoloLaneIds.delete(laneId);
    }
  }

  clearTransientMonitoring(): void {
    this.transientMutedLaneIds.clear();
    this.transientSoloLaneIds.clear();
  }

  filterHitsForTransientMonitoring(
    hits: readonly SequencerHit[],
  ): SequencerHit[] {
    const soloActive = this.transientSoloLaneIds.size > 0;

    return hits.filter((hit) => {
      if (this.transientMutedLaneIds.has(hit.laneId)) {
        return false;
      }

      if (
        soloActive &&
        !this.transientSoloLaneIds.has(hit.laneId)
      ) {
        return false;
      }

      return true;
    });
  }

  toggleStep(laneId: string, stepIndex: number): void {
    if (!this.isValidStep(stepIndex)) return;

    const enabled =
      this.getStepVelocity(laneId, stepIndex) === undefined;
    this.setStepEnabled(laneId, stepIndex, enabled);
  }

  setStepEnabled(
    laneId: string,
    stepIndex: number,
    enabled: boolean,
    gestureId?: string,
  ): void {
    if (!this.isValidStep(stepIndex)) return;

    const lane = this.pattern.lanes.find((entry) => entry.id === laneId);
    if (!lane) return;

    const existing = eventAtStep(lane, stepIndex);
    if (Boolean(existing) === enabled) return;

    this.commit(
      (draft) => {
        const draftLane = draft.lanes.find(
          (entry) => entry.id === laneId,
        );
        if (!draftLane) return;

        const draftExisting = eventAtStep(
          draftLane,
          stepIndex,
        );

        if (enabled) {
          if (draftExisting) return;
          draftLane.events.push(
            createStepEvent(
              laneId,
              stepIndex,
              laneDefaultVelocity(laneId, stepIndex),
            ),
          );
          draftLane.events.sort((a, b) => a.tick - b.tick);
        } else if (draftExisting) {
          draftLane.events = draftLane.events.filter(
            (event) => event.id !== draftExisting.id,
          );
        }
      },
      gestureId ? "gesture:" + gestureId : null,
    );
  }

  setStepVelocity(
    laneId: string,
    stepIndex: number,
    velocity: number,
    gestureId?: string,
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
      gestureId
        ? "gesture:" + gestureId
        : "velocity:" + laneId + ":" + stepIndex,
    );
  }

  deleteSelectedSteps(
    selection: readonly SequencerStepSelection[],
  ): boolean {
    const keys = new Set(
      selection.map(
        (entry) => entry.laneId + ":" + entry.stepIndex,
      ),
    );
    if (keys.size === 0) return false;

    const beforeRevision = this.revision;
    this.commit((draft) => {
      for (const lane of draft.lanes) {
        if (lane.lock.rhythm) continue;
        lane.events = lane.events.filter((event) => {
          const stepIndex = Math.round(
            event.tick / FOUNDATION_STEP_TICKS,
          );
          return !keys.has(
            lane.id + ":" + stepIndex,
          );
        });
      }
    });

    return this.revision !== beforeRevision;
  }

  adjustSelectedVelocity(
    selection: readonly SequencerStepSelection[],
    delta: number,
  ): boolean {
    if (!Number.isFinite(delta) || selection.length === 0) {
      return false;
    }

    const keys = new Set(
      selection.map(
        (entry) => entry.laneId + ":" + entry.stepIndex,
      ),
    );
    const beforeRevision = this.revision;

    this.commit((draft) => {
      for (const lane of draft.lanes) {
        if (lane.lock.dynamics) continue;
        for (const event of lane.events) {
          const stepIndex = Math.round(
            event.tick / FOUNDATION_STEP_TICKS,
          );
          if (
            !keys.has(lane.id + ":" + stepIndex)
          ) {
            continue;
          }

          event.velocity = normalizeVelocity(
            event.velocity + delta,
          );
          event.accent = accentFromVelocity(
            event.velocity,
          );
          delete event.grooveBase;
          event.generatorTags =
            event.generatorTags?.filter(
              (tag) =>
                !tag.startsWith("groove-engine"),
            );
        }
      }
    });

    return this.revision !== beforeRevision;
  }

  setSelectedDynamic(
    selection: readonly SequencerStepSelection[],
    dynamic: SequencerStepDynamic,
  ): boolean {
    if (selection.length === 0) return false;

    const velocity =
      dynamic === "accent"
        ? 0.96
        : dynamic === "ghost"
          ? 0.22
          : 0.76;
    const keys = new Set(
      selection.map(
        (entry) => entry.laneId + ":" + entry.stepIndex,
      ),
    );
    const beforeRevision = this.revision;

    this.commit((draft) => {
      for (const lane of draft.lanes) {
        if (lane.lock.dynamics) continue;
        for (const event of lane.events) {
          const stepIndex = Math.round(
            event.tick / FOUNDATION_STEP_TICKS,
          );
          if (
            !keys.has(lane.id + ":" + stepIndex)
          ) {
            continue;
          }

          event.velocity = velocity;
          event.accent = dynamic;
          delete event.grooveBase;
          event.generatorTags =
            event.generatorTags?.filter(
              (tag) =>
                !tag.startsWith("groove-engine"),
            );
        }
      }
    });

    return this.revision !== beforeRevision;
  }

  nudgeSelectedTiming(
    selection: readonly SequencerStepSelection[],
    deltaUs: number,
  ): boolean {
    if (
      !Number.isFinite(deltaUs) ||
      selection.length === 0
    ) {
      return false;
    }

    const keys = new Set(
      selection.map(
        (entry) => entry.laneId + ":" + entry.stepIndex,
      ),
    );
    const beforeRevision = this.revision;

    this.commit((draft) => {
      for (const lane of draft.lanes) {
        if (lane.lock.timing) continue;
        for (const event of lane.events) {
          const stepIndex = Math.round(
            event.tick / FOUNDATION_STEP_TICKS,
          );
          if (
            !keys.has(lane.id + ":" + stepIndex)
          ) {
            continue;
          }

          event.timingOffsetUs =
            clampManualTimingOffsetUs(
              event.timingOffsetUs + deltaUs,
            );
          delete event.grooveBase;
          event.generatorTags =
            event.generatorTags?.filter(
              (tag) =>
                !tag.startsWith("groove-engine"),
            );
        }
      }
    });

    return this.revision !== beforeRevision;
  }

  moveSelectedSteps(
    selection: readonly SequencerStepSelection[],
    deltaSteps: number,
  ): SequencerStepSelection[] | null {
    const delta = Math.trunc(deltaSteps);
    if (delta === 0 || selection.length === 0) {
      return null;
    }

    const byLane = new Map<string, Set<number>>();
    for (const entry of selection) {
      if (!this.isValidStep(entry.stepIndex)) continue;
      const steps =
        byLane.get(entry.laneId) ?? new Set<number>();
      steps.add(entry.stepIndex);
      byLane.set(entry.laneId, steps);
    }
    if (byLane.size === 0) return null;

    const moved: SequencerStepSelection[] = [];

    for (const [laneId, steps] of byLane) {
      const lane = this.pattern.lanes.find(
        (entry) => entry.id === laneId,
      );
      if (!lane || lane.lock.rhythm) return null;

      const laneLength = this.getLaneLengthSteps(laneId);
      const selectedSet = new Set(steps);
      const occupied = new Set(
        lane.events
          .map((event) =>
            Math.round(
              event.tick / FOUNDATION_STEP_TICKS,
            ),
          )
          .filter((step) => !selectedSet.has(step)),
      );

      for (const stepIndex of steps) {
        const target = stepIndex + delta;
        if (
          target < 0 ||
          target >= laneLength ||
          occupied.has(target)
        ) {
          return null;
        }
        moved.push({
          laneId,
          stepIndex: target,
        });
      }
    }

    if (moved.length === 0) return null;

    this.commit((draft) => {
      for (const [laneId, steps] of byLane) {
        const lane = draft.lanes.find(
          (entry) => entry.id === laneId,
        );
        if (!lane) continue;

        for (const event of lane.events) {
          const stepIndex = Math.round(
            event.tick / FOUNDATION_STEP_TICKS,
          );
          if (!steps.has(stepIndex)) continue;

          const target = stepIndex + delta;
          event.tick =
            target * FOUNDATION_STEP_TICKS;
          event.id = eventId(laneId, target);
          delete event.grooveBase;
        }
        lane.events.sort((a, b) => a.tick - b.tick);
      }
    });

    return moved;
  }

  duplicateSelectedSteps(
    selection: readonly SequencerStepSelection[],
    deltaSteps: number,
  ): SequencerStepSelection[] | null {
    const delta = Math.trunc(deltaSteps);
    if (delta === 0 || selection.length === 0) {
      return null;
    }

    const byLane = new Map<string, Set<number>>();
    for (const entry of selection) {
      if (!this.isValidStep(entry.stepIndex)) continue;
      const steps =
        byLane.get(entry.laneId) ?? new Set<number>();
      steps.add(entry.stepIndex);
      byLane.set(entry.laneId, steps);
    }
    if (byLane.size === 0) return null;

    const duplicated: SequencerStepSelection[] = [];

    for (const [laneId, steps] of byLane) {
      const lane = this.pattern.lanes.find(
        (entry) => entry.id === laneId,
      );
      if (!lane || lane.lock.rhythm) return null;

      const laneLength = this.getLaneLengthSteps(laneId);
      const occupied = new Set(
        lane.events.map((event) =>
          Math.round(
            event.tick / FOUNDATION_STEP_TICKS,
          ),
        ),
      );

      for (const stepIndex of steps) {
        if (!eventAtStep(lane, stepIndex)) continue;
        const target = stepIndex + delta;
        if (
          target < 0 ||
          target >= laneLength ||
          occupied.has(target)
        ) {
          return null;
        }
        duplicated.push({
          laneId,
          stepIndex: target,
        });
      }
    }

    if (duplicated.length === 0) return null;

    this.commit((draft) => {
      for (const [laneId, steps] of byLane) {
        const lane = draft.lanes.find(
          (entry) => entry.id === laneId,
        );
        if (!lane) continue;

        const copies = lane.events
          .filter((event) =>
            steps.has(
              Math.round(
                event.tick / FOUNDATION_STEP_TICKS,
              ),
            ),
          )
          .map((event) => {
            const sourceStep = Math.round(
              event.tick / FOUNDATION_STEP_TICKS,
            );
            const target = sourceStep + delta;
            const copy = cloneStepEvent(event);
            copy.id = eventId(laneId, target);
            copy.tick =
              target * FOUNDATION_STEP_TICKS;
            copy.generatorTags = [
              ...(copy.generatorTags ?? []).filter(
                (tag) => tag !== "selection-duplicate",
              ),
              "selection-duplicate",
            ];
            delete copy.grooveBase;
            return copy;
          });

        lane.events.push(...copies);
        lane.events.sort((a, b) => a.tick - b.tick);
      }
    });

    return duplicated;
  }

  copySelectedSteps(
    selection: readonly SequencerStepSelection[],
  ): StepSelectionClipboardData | null {
    const events: {
      laneId: string;
      stepIndex: number;
      event: StepEvent;
    }[] = [];

    for (const entry of selection) {
      const lane = this.pattern.lanes.find(
        (candidate) =>
          candidate.id === entry.laneId,
      );
      const event = lane
        ? eventAtStep(lane, entry.stepIndex)
        : undefined;
      if (!event) continue;
      events.push({
        laneId: entry.laneId,
        stepIndex: entry.stepIndex,
        event: cloneStepEvent(event),
      });
    }

    if (events.length === 0) return null;

    const minStep = Math.min(
      ...events.map((entry) => entry.stepIndex),
    );
    const maxStep = Math.max(
      ...events.map((entry) => entry.stepIndex),
    );

    return {
      widthSteps: maxStep - minStep + 1,
      entries: events.map((entry) => ({
        laneId: entry.laneId,
        offsetSteps:
          entry.stepIndex - minStep,
        event: cloneStepEvent(entry.event),
      })),
    };
  }

  pasteSelectedSteps(
    clipboard: StepSelectionClipboardData,
    startStepInput: number,
  ): SequencerStepSelection[] | null {
    const startStep = Math.max(
      0,
      Math.trunc(startStepInput),
    );
    if (
      clipboard.entries.length === 0 ||
      clipboard.widthSteps <= 0
    ) {
      return null;
    }

    const targets: {
      laneId: string;
      stepIndex: number;
      event: StepEvent;
    }[] = [];

    for (const entry of clipboard.entries) {
      const lane = this.pattern.lanes.find(
        (candidate) =>
          candidate.id === entry.laneId,
      );
      if (!lane || lane.lock.rhythm) return null;

      const stepIndex =
        startStep + entry.offsetSteps;
      const laneLength =
        this.getLaneLengthSteps(entry.laneId);
      if (
        stepIndex < 0 ||
        stepIndex >= laneLength
      ) {
        return null;
      }

      targets.push({
        laneId: entry.laneId,
        stepIndex,
        event: cloneStepEvent(entry.event),
      });
    }

    if (targets.length === 0) return null;

    this.commit((draft) => {
      for (const target of targets) {
        const lane = draft.lanes.find(
          (entry) => entry.id === target.laneId,
        );
        if (!lane) continue;

        const existing = eventAtStep(
          lane,
          target.stepIndex,
        );
        if (existing) {
          lane.events = lane.events.filter(
            (event) => event.id !== existing.id,
          );
        }

        const next = cloneStepEvent(target.event);
        next.id = eventId(
          target.laneId,
          target.stepIndex,
        );
        next.tick =
          target.stepIndex *
          FOUNDATION_STEP_TICKS;
        next.generatorTags = [
          ...(next.generatorTags ?? []).filter(
            (tag) => tag !== "selection-paste",
          ),
          "selection-paste",
        ];
        delete next.grooveBase;
        lane.events.push(next);
        lane.events.sort((a, b) => a.tick - b.tick);
      }
    });

    return targets.map((target) => ({
      laneId: target.laneId,
      stepIndex: target.stepIndex,
    }));
  }

  recordRealtimeStep(
    laneId: string,
    stepIndex: number,
    velocity: number,
    timingOffsetUs: number,
    mode: "overdub" | "erase",
    gestureId: string,
  ): boolean {
    if (!this.isValidStep(stepIndex)) return false;

    const sourceLane = this.pattern.lanes.find(
      (entry) => entry.id === laneId,
    );
    if (!sourceLane) return false;

    const existing = eventAtStep(sourceLane, stepIndex);

    if (mode === "erase") {
      if (sourceLane.lock.rhythm || !existing) return false;

      const beforeRevision = this.revision;
      this.commit(
        (draft) => {
          const lane = draft.lanes.find(
            (entry) => entry.id === laneId,
          );
          if (!lane) return;
          const target = eventAtStep(lane, stepIndex);
          if (!target) return;
          lane.events = lane.events.filter(
            (event) => event.id !== target.id,
          );
        },
        "gesture:" + gestureId,
      );
      return this.revision !== beforeRevision;
    }

    if (!existing && sourceLane.lock.rhythm) {
      return false;
    }
    if (
      existing &&
      sourceLane.lock.dynamics &&
      sourceLane.lock.timing
    ) {
      return false;
    }

    const safeVelocity = normalizeVelocity(velocity);
    const safeTiming = clampManualTimingOffsetUs(
      timingOffsetUs,
    );
    const beforeRevision = this.revision;

    this.commit(
      (draft) => {
        const lane = draft.lanes.find(
          (entry) => entry.id === laneId,
        );
        if (!lane) return;

        const target = eventAtStep(lane, stepIndex);
        if (target) {
          if (!lane.lock.dynamics) {
            target.velocity = Math.max(
              target.velocity,
              safeVelocity,
            );
            target.accent = accentFromVelocity(
              target.velocity,
            );
          }
          if (!lane.lock.timing) {
            target.timingOffsetUs = safeTiming;
            delete target.grooveBase;
          }
          target.generatorTags = [
            ...(target.generatorTags ?? []).filter(
              (tag) => tag !== "grid-record",
            ),
            "grid-record",
          ];
          return;
        }

        const next = createStepEvent(
          laneId,
          stepIndex,
          safeVelocity,
        );
        if (!lane.lock.timing) {
          next.timingOffsetUs = safeTiming;
        }
        next.generatorTags = ["grid-record"];
        next.grooveBase = undefined;
        lane.events.push(next);
        lane.events.sort((a, b) => a.tick - b.tick);
      },
      "gesture:" + gestureId,
    );

    return this.revision !== beforeRevision;
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

  clearLane(laneId: string): boolean {
    const source = this.pattern.lanes.find(
      (lane) => lane.id === laneId,
    );
    if (!source || source.lock.rhythm) return false;
    if (source.events.length === 0) return true;

    this.commit((draft) => {
      const lane = draft.lanes.find(
        (entry) => entry.id === laneId,
      );
      if (!lane) return;
      lane.events = [];
    });

    return true;
  }

  fillLane(
    laneId: string,
    intervalSteps: 1 | 2 | 4 | 8,
  ): boolean {
    return this.fillLaneRange(
      laneId,
      0,
      this.getLaneLengthSteps(laneId),
      intervalSteps,
    );
  }

  fillLaneRange(
    laneId: string,
    startStep: number,
    lengthSteps: number,
    intervalSteps: 1 | 2 | 4 | 8,
  ): boolean {
    const source = this.pattern.lanes.find(
      (lane) => lane.id === laneId,
    );
    if (!source || source.lock.rhythm) return false;

    const laneLength = this.getLaneLengthSteps(laneId);
    const safeStart = Math.max(
      0,
      Math.min(laneLength, Math.floor(startStep)),
    );
    const safeLength = Math.max(0, Math.floor(lengthSteps));
    const safeEnd = Math.min(
      laneLength,
      safeStart + safeLength,
    );
    if (safeStart >= safeEnd) return false;

    const startTick =
      safeStart * FOUNDATION_STEP_TICKS;
    const endTick =
      safeEnd * FOUNDATION_STEP_TICKS;

    this.commit((draft) => {
      const lane = draft.lanes.find(
        (entry) => entry.id === laneId,
      );
      if (!lane) return;

      const preserved = lane.events
        .filter(
          (event) =>
            event.tick < startTick ||
            event.tick >= endTick,
        )
        .map(cloneStepEvent);
      const filled: StepEvent[] = [];

      for (
        let step = safeStart;
        step < safeEnd;
        step += intervalSteps
      ) {
        const velocity =
          step % 4 === 0
            ? 0.88
            : step % 2 === 0
              ? 0.74
              : 0.64;
        filled.push(
          createStepEvent(laneId, step, velocity),
        );
      }

      lane.events = [...preserved, ...filled].sort(
        (a, b) => a.tick - b.tick,
      );
    });

    return true;
  }

  shiftLane(
    laneId: string,
    direction: -1 | 1,
  ): boolean {
    const source = this.pattern.lanes.find(
      (lane) => lane.id === laneId,
    );
    if (!source || source.lock.rhythm) return false;

    const laneLength = this.getLaneLengthSteps(laneId);
    const activeLimit = laneLength * FOUNDATION_STEP_TICKS;

    this.commit((draft) => {
      const lane = draft.lanes.find(
        (entry) => entry.id === laneId,
      );
      if (!lane) return;

      const active = lane.events
        .filter((event) => event.tick < activeLimit)
        .map((event) => {
          const step = Math.round(
            event.tick / FOUNDATION_STEP_TICKS,
          );
          const shifted =
            (step + direction + laneLength) % laneLength;
          return {
            ...cloneStepEvent(event),
            id: eventId(laneId, shifted),
            tick: shifted * FOUNDATION_STEP_TICKS,
          };
        });
      const dormant = lane.events
        .filter((event) => event.tick >= activeLimit)
        .map(cloneStepEvent);

      lane.events = [...active, ...dormant].sort(
        (a, b) => a.tick - b.tick,
      );
    });

    return true;
  }

  reverseLane(laneId: string): boolean {
    const source = this.pattern.lanes.find(
      (lane) => lane.id === laneId,
    );
    if (!source || source.lock.rhythm) return false;

    const laneLength = this.getLaneLengthSteps(laneId);
    const activeLimit = laneLength * FOUNDATION_STEP_TICKS;

    this.commit((draft) => {
      const lane = draft.lanes.find(
        (entry) => entry.id === laneId,
      );
      if (!lane) return;

      const active = lane.events
        .filter((event) => event.tick < activeLimit)
        .map((event) => {
          const step = Math.round(
            event.tick / FOUNDATION_STEP_TICKS,
          );
          const reversed = laneLength - 1 - step;
          return {
            ...cloneStepEvent(event),
            id: eventId(laneId, reversed),
            tick: reversed * FOUNDATION_STEP_TICKS,
            grooveBase: undefined,
          };
        });
      const dormant = lane.events
        .filter((event) => event.tick >= activeLimit)
        .map(cloneStepEvent);

      lane.events = [...active, ...dormant].sort(
        (a, b) => a.tick - b.tick,
      );
    });

    return true;
  }

  scaleLaneDensity(
    laneId: string,
    factor: 0.5 | 2,
  ): boolean {
    const source = this.pattern.lanes.find(
      (lane) => lane.id === laneId,
    );
    if (!source || source.lock.rhythm) return false;

    const laneLength = this.getLaneLengthSteps(laneId);
    const activeLimit = laneLength * FOUNDATION_STEP_TICKS;
    const active = source.events
      .filter((event) => event.tick < activeLimit)
      .map(cloneStepEvent)
      .sort((a, b) => a.tick - b.tick);

    if (active.length === 0) return true;

    this.commit((draft) => {
      const lane = draft.lanes.find(
        (entry) => entry.id === laneId,
      );
      if (!lane) return;

      const dormant = lane.events
        .filter((event) => event.tick >= activeLimit)
        .map(cloneStepEvent);

      let nextActive: StepEvent[];

      if (factor === 0.5) {
        if (active.length <= 1) {
          nextActive = active;
        } else {
          const targetCount = Math.max(
            1,
            Math.ceil(active.length / 2),
          );
          const ranked = active
            .map((event, index) => {
              const step = Math.round(
                event.tick / FOUNDATION_STEP_TICKS,
              );
              const downbeatWeight =
                step % 4 === 0
                  ? 0.24
                  : step % 2 === 0
                    ? 0.1
                    : 0;
              const accentWeight =
                event.accent === "accent"
                  ? 0.16
                  : event.accent === "ghost"
                    ? -0.08
                    : 0;
              return {
                event,
                score:
                  event.velocity +
                  downbeatWeight +
                  accentWeight -
                  index * 0.00001,
              };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, targetCount)
            .map(({ event }) => cloneStepEvent(event));

          nextActive = ranked.sort(
            (a, b) => a.tick - b.tick,
          );
        }
      } else {
        const byStep = new Map(
          active.map((event) => [
            Math.round(
              event.tick / FOUNDATION_STEP_TICKS,
            ),
            cloneStepEvent(event),
          ]),
        );
        const targetCount = Math.min(
          laneLength,
          Math.max(active.length, active.length * 2),
        );

        const sourceSteps = [...byStep.keys()].sort(
          (a, b) => a - b,
        );
        for (const step of sourceSteps) {
          if (byStep.size >= targetCount) break;

          const candidates = [
            (step + 1) % laneLength,
            (step - 1 + laneLength) % laneLength,
          ];

          for (const candidate of candidates) {
            if (
              byStep.size >= targetCount ||
              byStep.has(candidate)
            ) {
              continue;
            }

            const sourceEvent = byStep.get(step);
            if (!sourceEvent) continue;
            const velocity = normalizeVelocity(
              sourceEvent.velocity * 0.74,
            );
            byStep.set(candidate, {
              ...cloneStepEvent(sourceEvent),
              id: eventId(laneId, candidate),
              tick: candidate * FOUNDATION_STEP_TICKS,
              velocity,
              accent: accentFromVelocity(velocity),
              grooveBase: undefined,
              generatorTags: [
                ...(sourceEvent.generatorTags ?? []).filter(
                  (tag) => !tag.startsWith("groove-engine"),
                ),
                "density-double",
              ],
            });
          }
        }

        if (byStep.size < targetCount) {
          for (
            let step = 0;
            step < laneLength && byStep.size < targetCount;
            step += 1
          ) {
            if (byStep.has(step)) continue;
            byStep.set(
              step,
              createStepEvent(laneId, step, 0.52),
            );
          }
        }

        nextActive = [...byStep.values()].sort(
          (a, b) => a.tick - b.tick,
        );
      }

      lane.events = [...nextActive, ...dormant].sort(
        (a, b) => a.tick - b.tick,
      );
    });

    return true;
  }

  copyLane(laneId: string): LaneClipboardData | undefined {
    const source = this.pattern.lanes.find(
      (lane) => lane.id === laneId,
    );
    if (!source) return undefined;

    const laneLengthSteps =
      this.getLaneLengthSteps(laneId);
    const activeLimit =
      laneLengthSteps * FOUNDATION_STEP_TICKS;

    return {
      sourceLaneId: laneId,
      laneLengthSteps,
      events: source.events
        .filter((event) => event.tick < activeLimit)
        .map(cloneStepEvent),
    };
  }

  pasteLane(
    laneId: string,
    clipboard: LaneClipboardData,
  ): boolean {
    const source = this.pattern.lanes.find(
      (lane) => lane.id === laneId,
    );
    if (!source || source.lock.rhythm) return false;

    const patternLength =
      lengthStepsFromPattern(this.pattern);
    const laneLength = Math.max(
      1,
      Math.min(patternLength, clipboard.laneLengthSteps),
    );
    const replacementLimit =
      laneLength * FOUNDATION_STEP_TICKS;

    this.commit((draft) => {
      const lane = draft.lanes.find(
        (entry) => entry.id === laneId,
      );
      if (!lane) return;

      const dormant = lane.events
        .filter((event) => event.tick >= replacementLimit)
        .map(cloneStepEvent);
      const pasted: StepEvent[] = [];
      for (const event of clipboard.events) {
        const step = Math.round(
          event.tick / FOUNDATION_STEP_TICKS,
        );
        if (step < 0 || step >= laneLength) continue;

        const next = cloneStepEvent(event);
        next.id = eventId(laneId, step);
        next.tick = step * FOUNDATION_STEP_TICKS;
        delete next.grooveBase;
        next.generatorTags = [
          ...(event.generatorTags ?? []).filter(
            (tag) => !tag.startsWith("groove-engine"),
          ),
          "lane-paste",
        ];
        pasted.push(next);
      }

      lane.loopLengthTicks =
        laneLength === patternLength
          ? undefined
          : laneLength * FOUNDATION_STEP_TICKS;
      lane.events = [...pasted, ...dormant].sort(
        (a, b) => a.tick - b.tick,
      );
    });

    return true;
  }

  paintStepDynamic(
    laneId: string,
    stepIndex: number,
    dynamic: "accent" | "ghost",
    gestureId?: string,
  ): boolean {
    if (!this.isValidStep(stepIndex)) return false;

    const lane = this.pattern.lanes.find(
      (entry) => entry.id === laneId,
    );
    if (!lane || lane.lock.rhythm || lane.lock.dynamics) {
      return false;
    }

    const velocity = dynamic === "accent" ? 0.96 : 0.22;
    this.setStepVelocity(
      laneId,
      stepIndex,
      velocity,
      gestureId,
    );
    return true;
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
    if (nextPattern.ppq !== this.pattern.ppq) {
      throw new Error("Generated pattern PPQ does not match the sequencer.");
    }

    const nextLengthSteps = Math.round(
      nextPattern.lengthTicks / FOUNDATION_STEP_TICKS,
    );
    if (!isSupportedSequencerLengthSteps(nextLengthSteps)) {
      throw new Error(
        "Generated pattern length is not supported by Sequencer V2.",
      );
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
    this.clearTransientMonitoring();
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

  setLengthSteps(nextLength: SequencerLengthSteps): boolean {
    if (!isSupportedSequencerLengthSteps(nextLength)) {
      return false;
    }

    const currentLength = lengthStepsFromPattern(this.pattern);
    if (currentLength === nextLength) return false;

    this.commit((draft) => {
      const previousLengthTicks = draft.lengthTicks;
      draft.lengthTicks = nextLength * FOUNDATION_STEP_TICKS;

      for (const lane of draft.lanes) {
        lane.events = lane.events.filter(
          (event) => event.tick < draft.lengthTicks,
        );

        // A lane explicitly matching the old Pattern length is musically
        // equivalent to inheriting it. Let it grow with the Pattern so
        // extending a phrase does not keep looping at the old boundary.
        if (
          nextLength * FOUNDATION_STEP_TICKS > previousLengthTicks &&
          lane.loopLengthTicks === previousLengthTicks
        ) {
          lane.loopLengthTicks = undefined;
        } else if (
          lane.loopLengthTicks &&
          lane.loopLengthTicks > draft.lengthTicks
        ) {
          lane.loopLengthTicks = draft.lengthTicks;
        }
      }
    });

    return true;
  }

  addBar(): boolean {
    const length = lengthStepsFromPattern(this.pattern);
    const nextLength =
      length < SEQUENCER_BAR_STEPS
        ? SEQUENCER_BAR_STEPS
        : length + SEQUENCER_BAR_STEPS;

    if (nextLength > SEQUENCER_MAX_STEPS) return false;
    return this.setLengthSteps(nextLength);
  }

  clearBar(barIndex: number): boolean {
    const length = lengthStepsFromPattern(this.pattern);
    if (
      length < SEQUENCER_BAR_STEPS ||
      length % SEQUENCER_BAR_STEPS !== 0
    ) {
      return false;
    }

    const barCount = length / SEQUENCER_BAR_STEPS;
    if (
      !Number.isInteger(barIndex) ||
      barIndex < 0 ||
      barIndex >= barCount
    ) {
      return false;
    }

    const startTick =
      barIndex *
      SEQUENCER_BAR_STEPS *
      FOUNDATION_STEP_TICKS;
    const endTick =
      startTick +
      SEQUENCER_BAR_STEPS * FOUNDATION_STEP_TICKS;

    this.commit((draft) => {
      for (const lane of draft.lanes) {
        lane.events = lane.events.filter(
          (event) =>
            event.tick < startTick ||
            event.tick >= endTick,
        );
      }
    });

    return true;
  }

  duplicateBar(barIndex: number): boolean {
    const length = lengthStepsFromPattern(this.pattern);
    if (
      length < SEQUENCER_BAR_STEPS ||
      length % SEQUENCER_BAR_STEPS !== 0 ||
      length + SEQUENCER_BAR_STEPS > SEQUENCER_MAX_STEPS
    ) {
      return false;
    }

    const barCount = length / SEQUENCER_BAR_STEPS;
    if (
      !Number.isInteger(barIndex) ||
      barIndex < 0 ||
      barIndex >= barCount
    ) {
      return false;
    }

    const barTicks =
      SEQUENCER_BAR_STEPS * FOUNDATION_STEP_TICKS;
    const oldLengthTicks = length * FOUNDATION_STEP_TICKS;
    const newLength =
      length + SEQUENCER_BAR_STEPS;
    const newLengthTicks =
      newLength * FOUNDATION_STEP_TICKS;
    const sourceStartTick = barIndex * barTicks;
    const sourceEndTick = sourceStartTick + barTicks;
    const insertStartStep =
      (barIndex + 1) * SEQUENCER_BAR_STEPS;
    const insertStartTick =
      insertStartStep * FOUNDATION_STEP_TICKS;

    this.commit((draft) => {
      draft.lengthTicks = newLengthTicks;

      for (const lane of draft.lanes) {
        const inheritedFullLength =
          lane.loopLengthTicks === undefined ||
          lane.loopLengthTicks === oldLengthTicks;
        const sourceEvents = lane.events
          .filter(
            (event) =>
              event.tick >= sourceStartTick &&
              event.tick < sourceEndTick,
          )
          .map(cloneStepEvent);

        const shifted = lane.events.map((event) => {
          if (event.tick < insertStartTick) {
            return cloneStepEvent(event);
          }

          const shiftedStep =
            Math.round(
              event.tick / FOUNDATION_STEP_TICKS,
            ) + SEQUENCER_BAR_STEPS;

          return {
            ...cloneStepEvent(event),
            id: eventId(lane.id, shiftedStep),
            tick: shiftedStep * FOUNDATION_STEP_TICKS,
          };
        });

        const copied = sourceEvents.map((event) => {
          const sourceStep = Math.round(
            event.tick / FOUNDATION_STEP_TICKS,
          );
          const targetStep =
            insertStartStep +
            (sourceStep -
              barIndex * SEQUENCER_BAR_STEPS);

          return {
            ...cloneStepEvent(event),
            id: eventId(lane.id, targetStep),
            tick: targetStep * FOUNDATION_STEP_TICKS,
            generatorTags: [
              ...(event.generatorTags ?? []),
              "bar-duplicate",
            ],
          };
        });

        lane.events = [...shifted, ...copied].sort(
          (a, b) => a.tick - b.tick,
        );

        if (inheritedFullLength) {
          lane.loopLengthTicks = undefined;
        } else if (
          lane.loopLengthTicks &&
          lane.loopLengthTicks > insertStartTick
        ) {
          lane.loopLengthTicks = Math.min(
            newLengthTicks,
            lane.loopLengthTicks + barTicks,
          );
        }
      }
    });

    return true;
  }

  deleteBar(barIndex: number): boolean {
    const length = lengthStepsFromPattern(this.pattern);
    if (
      length <= SEQUENCER_BAR_STEPS ||
      length % SEQUENCER_BAR_STEPS !== 0
    ) {
      return false;
    }

    const barCount = length / SEQUENCER_BAR_STEPS;
    if (
      !Number.isInteger(barIndex) ||
      barIndex < 0 ||
      barIndex >= barCount
    ) {
      return false;
    }

    const barTicks =
      SEQUENCER_BAR_STEPS * FOUNDATION_STEP_TICKS;
    const startStep =
      barIndex * SEQUENCER_BAR_STEPS;
    const startTick = startStep * FOUNDATION_STEP_TICKS;
    const endTick = startTick + barTicks;
    const oldLengthTicks = length * FOUNDATION_STEP_TICKS;
    const newLength =
      length - SEQUENCER_BAR_STEPS;
    const newLengthTicks =
      newLength * FOUNDATION_STEP_TICKS;

    this.commit((draft) => {
      draft.lengthTicks = newLengthTicks;

      for (const lane of draft.lanes) {
        const inheritedFullLength =
          lane.loopLengthTicks === undefined ||
          lane.loopLengthTicks === oldLengthTicks;
        const nextEvents: StepEvent[] = [];

        for (const event of lane.events) {
          if (
            event.tick >= startTick &&
            event.tick < endTick
          ) {
            continue;
          }

          if (event.tick >= endTick) {
            const shiftedStep =
              Math.round(
                event.tick / FOUNDATION_STEP_TICKS,
              ) - SEQUENCER_BAR_STEPS;
            nextEvents.push({
              ...cloneStepEvent(event),
              id: eventId(lane.id, shiftedStep),
              tick: shiftedStep * FOUNDATION_STEP_TICKS,
            });
          } else {
            nextEvents.push(cloneStepEvent(event));
          }
        }

        lane.events = nextEvents.sort(
          (a, b) => a.tick - b.tick,
        );

        if (inheritedFullLength) {
          lane.loopLengthTicks = undefined;
        } else if (lane.loopLengthTicks) {
          const loopSteps = Math.round(
            lane.loopLengthTicks / FOUNDATION_STEP_TICKS,
          );

          if (loopSteps > startStep) {
            const shortened = Math.max(
              SEQUENCER_MIN_STEPS,
              loopSteps - SEQUENCER_BAR_STEPS,
            );
            lane.loopLengthTicks =
              shortened >= newLength
                ? undefined
                : shortened * FOUNDATION_STEP_TICKS;
          }
        }
      }
    });

    return true;
  }

  duplicate(): void {
    const length = lengthStepsFromPattern(this.pattern);
    if (length >= SEQUENCER_MAX_STEPS) return;

    const sourceLength = Math.min(
      length,
      SEQUENCER_MAX_STEPS - length,
    );
    const targetStart = length;
    const nextLength = length + sourceLength;

    this.commit((draft) => {
      const oldLengthTicks = draft.lengthTicks;
      draft.lengthTicks =
        nextLength * FOUNDATION_STEP_TICKS;

      for (const lane of draft.lanes) {
        const inheritedFullLength =
          lane.loopLengthTicks === undefined ||
          lane.loopLengthTicks === oldLengthTicks;
        const sourceEvents = lane.events.filter(
          (event) =>
            event.tick <
            sourceLength * FOUNDATION_STEP_TICKS,
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

        if (inheritedFullLength) {
          lane.loopLengthTicks = undefined;
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
    if (pattern.ppq !== this.pattern.ppq) {
      throw new Error(
        sourceLabel + " Pattern PPQ does not match the sequencer.",
      );
    }

    const patternLengthSteps = Math.round(
      pattern.lengthTicks / FOUNDATION_STEP_TICKS,
    );
    if (
      !isSupportedSequencerLengthSteps(patternLengthSteps)
    ) {
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
