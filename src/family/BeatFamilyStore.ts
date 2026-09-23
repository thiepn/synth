import type {
  BeatFamily,
  BeatFamilyRole,
  Pattern,
} from "../domain/contracts";
import {
  cloneGenerationProvenance,
  clonePattern,
} from "../domain/patternClone";
import type {
  BeatFamilyGenerationResult,
  BeatFamilyPattern,
} from "../generation/beatFamilyGenerator";

export interface BeatFamilySnapshot {
  family?: BeatFamily;
  patterns: BeatFamilyPattern[];
  selectedRole?: BeatFamilyRole;
  coherenceScore?: number;
  displaySeed?: string;
  revision: number;
}

type Listener = () => void;

function cloneEntry(entry: BeatFamilyPattern): BeatFamilyPattern {
  return {
    ...entry,
    pattern: clonePattern(entry.pattern),
    validation: {
      ...entry.validation,
      reasons: [...entry.validation.reasons],
      metrics: { ...entry.validation.metrics },
    },
  };
}

export class BeatFamilyStore {
  private listeners = new Set<Listener>();
  private family: BeatFamily | undefined;
  private patterns: BeatFamilyPattern[] = [];
  private selectedRole: BeatFamilyRole | undefined;
  private coherenceScore: number | undefined;
  private displaySeed: string | undefined;
  private revision = 0;
  private snapshot: BeatFamilySnapshot = this.buildSnapshot();

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): BeatFamilySnapshot => this.snapshot;

  restoreProjectState(
    state: Omit<BeatFamilySnapshot, "revision">,
  ): void {
    this.family = state.family
      ? {
          ...state.family,
          members: state.family.members.map((member) => ({ ...member })),
          provenance: cloneGenerationProvenance(
            state.family.provenance,
          ),
        }
      : undefined;
    this.patterns = state.patterns.map(cloneEntry);
    this.selectedRole =
      state.selectedRole &&
      this.patterns.some((entry) => entry.role === state.selectedRole)
        ? state.selectedRole
        : this.patterns[0]?.role;
    this.coherenceScore = state.coherenceScore;
    this.displaySeed = state.displaySeed;
    this.publish();
  }

  apply(result: BeatFamilyGenerationResult): void {
    this.family = {
      ...result.family,
      members: result.family.members.map((member) => ({ ...member })),
      provenance: cloneGenerationProvenance(
        result.family.provenance,
      ),
    };
    this.patterns = result.patterns.map(cloneEntry);
    this.selectedRole = "core";
    this.coherenceScore = result.coherenceScore;
    this.displaySeed = result.displaySeed;
    this.publish();
  }

  select(role: BeatFamilyRole): void {
    if (!this.patterns.some((entry) => entry.role === role)) return;
    if (this.selectedRole === role) return;
    this.selectedRole = role;
    this.publish();
  }

  getPattern(role: BeatFamilyRole): BeatFamilyPattern | undefined {
    const entry = this.patterns.find((item) => item.role === role);
    return entry ? cloneEntry(entry) : undefined;
  }

  clear(): void {
    this.family = undefined;
    this.patterns = [];
    this.selectedRole = undefined;
    this.coherenceScore = undefined;
    this.displaySeed = undefined;
    this.publish();
  }

  private publish(): void {
    this.revision += 1;
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): BeatFamilySnapshot {
    return {
      family: this.family
        ? {
            ...this.family,
            members: this.family.members.map((member) => ({ ...member })),
            provenance: cloneGenerationProvenance(
              this.family.provenance,
            ),
          }
        : undefined,
      patterns: this.patterns.map(cloneEntry),
      selectedRole: this.selectedRole,
      coherenceScore: this.coherenceScore,
      displaySeed: this.displaySeed,
      revision: this.revision,
    };
  }
}

export const beatFamilyStore = new BeatFamilyStore();
