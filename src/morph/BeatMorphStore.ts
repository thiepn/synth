import type {
  Pattern,
  PatternLane,
  StepEvent,
} from "../domain/contracts";
import {
  assertMorphCompatible,
  morphPatterns,
  type BeatMorphDimensions,
  type BeatMorphResult,
} from "../generation/beatMorphEngine";
import { registerProjectTransientReset } from "../project/transientResetRegistry";

export type MorphEndpointOrigin =
  | "capture"
  | "remix";

export interface BeatMorphSnapshot {
  a?: Pattern;
  b?: Pattern;
  aOrigin?: MorphEndpointOrigin;
  bOrigin?: MorphEndpointOrigin;
  dimensions: BeatMorphDimensions;
  preview?: BeatMorphResult;
  revision: number;
}

type Listener = () => void;

const DEFAULT_DIMENSIONS: BeatMorphDimensions = {
  rhythm: 0.5,
  dynamics: 0.5,
  timing: 0.5,
  groove: 0.5,
  styleDNA: 0.5,
};

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

function cloneResult(
  result: BeatMorphResult | undefined,
): BeatMorphResult | undefined {
  if (!result) return undefined;
  return {
    ...result,
    pattern: clonePattern(result.pattern),
    dimensions: { ...result.dimensions },
    distanceFromA: { ...result.distanceFromA },
    distanceFromB: { ...result.distanceFromB },
  };
}

export class BeatMorphStore {
  private listeners = new Set<Listener>();
  private a: Pattern | undefined;
  private b: Pattern | undefined;
  private aOrigin: MorphEndpointOrigin | undefined;
  private bOrigin: MorphEndpointOrigin | undefined;
  private dimensions: BeatMorphDimensions = {
    ...DEFAULT_DIMENSIONS,
  };
  private preview: BeatMorphResult | undefined;
  private revision = 0;
  private snapshot: BeatMorphSnapshot = this.buildSnapshot();

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): BeatMorphSnapshot => this.snapshot;

  captureA(
    pattern: Pattern,
    origin: MorphEndpointOrigin = "capture",
  ): void {
    const next = clonePattern(pattern);
    this.a = next;
    this.aOrigin = origin;

    if (this.b) {
      try {
        assertMorphCompatible(next, this.b);
      } catch {
        this.b = undefined;
        this.bOrigin = undefined;
      }
    }

    this.recompute();
  }

  captureB(
    pattern: Pattern,
    origin: MorphEndpointOrigin = "capture",
  ): void {
    const next = clonePattern(pattern);
    if (this.a) assertMorphCompatible(this.a, next);
    this.b = next;
    this.bOrigin = origin;
    this.recompute();
  }

  setAll(value: number): void {
    const safe = Math.max(0, Math.min(1, value));
    this.dimensions = {
      rhythm: safe,
      dynamics: safe,
      timing: safe,
      groove: safe,
      styleDNA: safe,
    };
    this.recompute();
  }

  setDimension(
    dimension: keyof BeatMorphDimensions,
    value: number,
  ): void {
    const safe = Math.max(0, Math.min(1, value));
    if (Math.abs(this.dimensions[dimension] - safe) < 0.0001) {
      return;
    }

    this.dimensions = {
      ...this.dimensions,
      [dimension]: safe,
    };
    this.recompute();
  }

  swap(): void {
    if (!this.a || !this.b) return;

    [this.a, this.b] = [this.b, this.a];
    [this.aOrigin, this.bOrigin] = [
      this.bOrigin,
      this.aOrigin,
    ];
    this.dimensions = {
      rhythm: 1 - this.dimensions.rhythm,
      dynamics: 1 - this.dimensions.dynamics,
      timing: 1 - this.dimensions.timing,
      groove: 1 - this.dimensions.groove,
      styleDNA: 1 - this.dimensions.styleDNA,
    };
    this.recompute();
  }

  clearB(): void {
    if (!this.b) return;
    this.b = undefined;
    this.bOrigin = undefined;
    this.preview = undefined;
    this.publish();
  }

  clear(): void {
    this.a = undefined;
    this.b = undefined;
    this.aOrigin = undefined;
    this.bOrigin = undefined;
    this.dimensions = { ...DEFAULT_DIMENSIONS };
    this.preview = undefined;
    this.publish();
  }

  private recompute(): void {
    if (!this.a || !this.b) {
      this.preview = undefined;
      this.publish();
      return;
    }

    this.preview = morphPatterns({
      a: this.a,
      b: this.b,
      seed:
        "morph:" +
        this.a.id +
        ":" +
        this.b.id,
      dimensions: this.dimensions,
    });
    this.publish();
  }

  private publish(): void {
    this.revision += 1;
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): BeatMorphSnapshot {
    return {
      a: this.a ? clonePattern(this.a) : undefined,
      b: this.b ? clonePattern(this.b) : undefined,
      aOrigin: this.aOrigin,
      bOrigin: this.bOrigin,
      dimensions: { ...this.dimensions },
      preview: cloneResult(this.preview),
      revision: this.revision,
    };
  }
}

export const beatMorphStore = new BeatMorphStore();

registerProjectTransientReset(
  "beatMorphStore",
  () => beatMorphStore.clear(),
);
