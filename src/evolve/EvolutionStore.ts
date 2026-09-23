import type { Pattern } from "../domain/contracts";
import { clonePattern } from "../domain/patternClone";
import type {
  BeatGenerationIntent,
  BeatStyleId,
} from "../generation/beatGenerator";
import {
  generateEvolutionPlan,
  type EvolutionArcId,
  type EvolutionBars,
  type EvolutionPlan,
  type EvolutionSegment,
} from "../generation/evolutionEngine";
import { shortSeed } from "../generation/prng";
import { registerProjectTransientReset } from "../project/transientResetRegistry";

type Listener = () => void;

export interface EvolutionConfig {
  bars: EvolutionBars;
  intensity: number;
  arc: EvolutionArcId;
  seed: string;
}

export interface EvolutionSnapshot {
  source?: Pattern;
  config: EvolutionConfig;
  plan?: EvolutionPlan;
  previewActive: boolean;
  selectedIndex: number;
  revision: number;
}

function cloneSegment(segment: EvolutionSegment): EvolutionSegment {
  return {
    ...segment,
    pattern: clonePattern(segment.pattern),
    validation: {
      ...segment.validation,
      reasons: [...segment.validation.reasons],
      metrics: { ...segment.validation.metrics },
    },
  };
}

function clonePlan(plan: EvolutionPlan | undefined): EvolutionPlan | undefined {
  if (!plan) return undefined;

  return {
    ...plan,
    family: {
      ...plan.family,
      family: {
        ...plan.family.family,
        members: plan.family.family.members.map((member) => ({ ...member })),
        provenance: plan.family.family.provenance
          ? {
              ...plan.family.family.provenance,
              style: { ...plan.family.family.provenance.style },
              intent: { ...plan.family.family.provenance.intent },
            }
          : undefined,
      },
      patterns: plan.family.patterns.map((entry) => ({
        ...entry,
        pattern: clonePattern(entry.pattern),
        validation: {
          ...entry.validation,
          reasons: [...entry.validation.reasons],
          metrics: { ...entry.validation.metrics },
        },
      })),
      reasons: [...plan.family.reasons],
    },
    segments: plan.segments.map(cloneSegment),
  };
}

export class EvolutionStore {
  private listeners = new Set<Listener>();
  private source: Pattern | undefined;
  private sourceSignature = "";
  private config: EvolutionConfig = {
    bars: 16,
    intensity: 0.48,
    arc: "wave",
    seed: "EVOLVE-0001",
  };
  private plan: EvolutionPlan | undefined;
  private previewActive = false;
  private selectedIndex = 0;
  private seedSerial = 1;
  private revision = 0;
  private snapshot = this.buildSnapshot();

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): EvolutionSnapshot => this.snapshot;

  setSource(pattern: Pattern): void {
    const signature = JSON.stringify(pattern);
    if (signature === this.sourceSignature) return;
    this.source = clonePattern(pattern);
    this.sourceSignature = signature;
    this.plan = undefined;
    this.previewActive = false;
    this.selectedIndex = 0;
    this.publish();
  }

  setBars(bars: EvolutionBars): void {
    if (this.config.bars === bars) return;
    this.config = { ...this.config, bars };
    this.plan = undefined;
    this.previewActive = false;
    this.selectedIndex = 0;
    this.publish();
  }

  setIntensity(intensity: number): void {
    const next = Math.max(0, Math.min(1, intensity));
    if (Math.abs(this.config.intensity - next) < 0.0001) return;
    this.config = { ...this.config, intensity: next };
    this.plan = undefined;
    this.previewActive = false;
    this.publish();
  }

  setArc(arc: EvolutionArcId): void {
    if (this.config.arc === arc) return;
    this.config = { ...this.config, arc };
    this.plan = undefined;
    this.previewActive = false;
    this.selectedIndex = 0;
    this.publish();
  }

  setSeed(seed: string): void {
    const next = seed.trim();
    if (!next || next === this.config.seed) return;
    this.config = { ...this.config, seed: next };
    this.plan = undefined;
    this.previewActive = false;
    this.selectedIndex = 0;
    this.publish();
  }

  newSeed(): void {
    const sourceId = this.source?.id ?? "pattern";
    this.setSeed(
      "EVOLVE-" +
        shortSeed(
          sourceId +
            ":" +
            Date.now().toString(36) +
            ":" +
            this.seedSerial++,
        ),
    );
  }

  generate(
    style: BeatStyleId,
    intent: BeatGenerationIntent,
    bpm: number,
  ): EvolutionPlan {
    if (!this.source) {
      throw new Error("EVOLVE requires a source Pattern.");
    }

    this.plan = generateEvolutionPlan({
      source: this.source,
      seed: this.config.seed,
      bars: this.config.bars,
      intensity: this.config.intensity,
      arc: this.config.arc,
      style,
      intent,
      bpm,
    });
    this.previewActive = false;
    this.selectedIndex = 0;
    this.publish();
    return clonePlan(this.plan)!;
  }

  setPreviewActive(active: boolean): void {
    const next = Boolean(active && this.plan);
    if (this.previewActive === next) return;
    this.previewActive = next;
    this.publish();
  }

  select(index: number): void {
    if (!this.plan) return;
    const next = Math.max(
      0,
      Math.min(this.plan.segments.length - 1, Math.round(index)),
    );
    if (this.selectedIndex === next) return;
    this.selectedIndex = next;
    this.publish();
  }

  getSelectedSegment(): EvolutionSegment | undefined {
    const segment = this.plan?.segments[this.selectedIndex];
    return segment ? cloneSegment(segment) : undefined;
  }

  resolveAtTick(tick: number): {
    segment: EvolutionSegment;
    pattern: Pattern;
    localTick: number;
    planTick: number;
  } | null {
    if (!this.previewActive || !this.plan || this.plan.totalTicks <= 0) {
      return null;
    }

    const planTick =
      ((Math.max(0, tick) % this.plan.totalTicks) + this.plan.totalTicks) %
      this.plan.totalTicks;
    const segment = this.plan.segments.find(
      (entry) =>
        planTick >= entry.startTick &&
        planTick < entry.startTick + entry.lengthTicks,
    );
    if (!segment) return null;

    return {
      segment,
      pattern: segment.pattern,
      localTick: planTick - segment.startTick,
      planTick,
    };
  }

  clear(): void {
    this.plan = undefined;
    this.previewActive = false;
    this.selectedIndex = 0;
    this.publish();
  }

  private publish(): void {
    this.revision += 1;
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): EvolutionSnapshot {
    return {
      source: this.source ? clonePattern(this.source) : undefined,
      config: { ...this.config },
      plan: clonePlan(this.plan),
      previewActive: this.previewActive,
      selectedIndex: this.selectedIndex,
      revision: this.revision,
    };
  }
}

export const evolutionStore = new EvolutionStore();

registerProjectTransientReset(
  "evolutionStore",
  () => evolutionStore.clear(),
);
