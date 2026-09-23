import type {
  ArrangementBlueprint,
} from "../domain/contracts";
import {
  cloneArrangementBlueprint,
} from "../domain/arrangementClone";
import type {
  SceneSectionGenerationResult,
} from "../generation/sceneSectionGenerator";

export interface ArrangementFoundationSnapshot {
  blueprint?: ArrangementBlueprint;
  selectedSectionId?: string;
  coherenceScore?: number;
  displaySeed?: string;
  totalTicks?: number;
  revision: number;
}

type Listener = () => void;

export class ArrangementFoundationStore {
  private listeners = new Set<Listener>();
  private blueprint: ArrangementBlueprint | undefined;
  private selectedSectionId: string | undefined;
  private coherenceScore: number | undefined;
  private displaySeed: string | undefined;
  private totalTicks: number | undefined;
  private revision = 0;
  private snapshot: ArrangementFoundationSnapshot = this.buildSnapshot();

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): ArrangementFoundationSnapshot => this.snapshot;

  restoreProjectState(
    state: Omit<ArrangementFoundationSnapshot, "revision">,
  ): void {
    this.blueprint = state.blueprint
      ? cloneArrangementBlueprint(state.blueprint)
      : undefined;
    this.selectedSectionId =
      state.selectedSectionId &&
      this.blueprint?.sections.some(
        (section) => section.id === state.selectedSectionId,
      )
        ? state.selectedSectionId
        : this.blueprint?.sections[0]?.id;
    this.coherenceScore = state.coherenceScore;
    this.displaySeed = state.displaySeed;
    this.totalTicks = state.totalTicks;
    this.publish();
  }

  apply(result: SceneSectionGenerationResult): void {
    this.blueprint = cloneArrangementBlueprint(result.blueprint);
    this.selectedSectionId = result.blueprint.sections[0]?.id;
    this.coherenceScore = result.coherenceScore;
    this.displaySeed = result.displaySeed;
    this.totalTicks = result.totalTicks;
    this.publish();
  }

  selectSection(sectionId: string): void {
    if (!this.blueprint?.sections.some((section) => section.id === sectionId)) {
      return;
    }
    if (this.selectedSectionId === sectionId) return;
    this.selectedSectionId = sectionId;
    this.publish();
  }

  clear(): void {
    if (!this.blueprint) return;
    this.blueprint = undefined;
    this.selectedSectionId = undefined;
    this.coherenceScore = undefined;
    this.displaySeed = undefined;
    this.totalTicks = undefined;
    this.publish();
  }

  private publish(): void {
    this.revision += 1;
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): ArrangementFoundationSnapshot {
    return {
      blueprint: this.blueprint
        ? cloneArrangementBlueprint(this.blueprint)
        : undefined,
      selectedSectionId: this.selectedSectionId,
      coherenceScore: this.coherenceScore,
      displaySeed: this.displaySeed,
      totalTicks: this.totalTicks,
      revision: this.revision,
    };
  }
}

export const arrangementFoundationStore =
  new ArrangementFoundationStore();
