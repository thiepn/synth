import { clonePattern } from "../domain/patternClone";
import type {
  ArrangementBlueprint,
  FillPlacement,
  GenerationProvenance,
  Pattern,
  Scene,
  SectionBlueprint,
  TransitionPlacement,
} from "../domain/contracts";
import type { BeatFamilyPattern } from "../generation/beatFamilyGenerator";

export interface ArrangementOccurrence {
  id: string;
  sectionId: string;
  patternId: string;
  startTick: number;
  lengthTicks: number;
  cycleIndex: number;
  kind: "pattern" | "fill" | "transition";
}

export interface ArrangementProjectState {
  blueprint?: ArrangementBlueprint;
  sourceFoundationId?: string;
  selectedSectionId?: string;
  patterns: Pattern[];
  edited: boolean;
}

export interface ArrangementSnapshot {
  blueprint?: ArrangementBlueprint;
  sourceFoundationId?: string;
  selectedSectionId?: string;
  occurrences: ArrangementOccurrence[];
  totalTicks: number;
  edited: boolean;
  canUndo: boolean;
  canRedo: boolean;
  musicalRevision: number;
  revision: number;
}

type Listener = () => void;

const ARRANGEMENT_HISTORY_LIMIT = 60;

function cloneProvenance(
  provenance: GenerationProvenance | undefined,
): GenerationProvenance | undefined {
  if (!provenance) return undefined;
  return {
    ...provenance,
    style: { ...provenance.style },
    intent: { ...provenance.intent },
  };
}

function cloneScene(scene: Scene): Scene {
  return {
    ...scene,
    patternIds: [...scene.patternIds],
    provenance: cloneProvenance(scene.provenance),
  };
}

function cloneSection(section: SectionBlueprint): SectionBlueprint {
  return {
    ...section,
    patternSequence: [...section.patternSequence],
  };
}

function cloneBlueprint(
  blueprint: ArrangementBlueprint,
): ArrangementBlueprint {
  return {
    ...blueprint,
    scenes: blueprint.scenes.map(cloneScene),
    sections: blueprint.sections.map(cloneSection),
    provenance: cloneProvenance(blueprint.provenance),
  };
}

function defaultFillPlacement(
  section: SectionBlueprint,
): FillPlacement | undefined {
  if (!section.fillPatternId) return undefined;
  return section.patternSequence.at(-1) === section.fillPatternId
    ? "last"
    : "off";
}

function defaultTransitionPlacement(
  section: SectionBlueprint,
): TransitionPlacement | undefined {
  return section.transitionPatternId ? "append" : undefined;
}

export class ArrangementStore {
  private listeners = new Set<Listener>();
  private blueprint: ArrangementBlueprint | undefined;
  private sourceFoundationId: string | undefined;
  private selectedSectionId: string | undefined;
  private patternCatalog = new Map<string, Pattern>();
  private occurrences: ArrangementOccurrence[] = [];
  private totalTicks = 0;
  private edited = false;
  private musicalRevision = 0;
  private revision = 0;
  private duplicateCounter = 0;
  private undoStack: ArrangementBlueprint[] = [];
  private redoStack: ArrangementBlueprint[] = [];
  private lastUndoKey: string | null = null;
  private lastUndoAt = 0;
  private snapshot: ArrangementSnapshot = this.buildSnapshot();

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): ArrangementSnapshot => this.snapshot;

  exportProjectState(): ArrangementProjectState {
    return {
      blueprint: this.blueprint
        ? cloneBlueprint(this.blueprint)
        : undefined,
      sourceFoundationId: this.sourceFoundationId,
      selectedSectionId: this.selectedSectionId,
      patterns: [...this.patternCatalog.values()].map(clonePattern),
      edited: this.edited,
    };
  }

  restoreProjectState(state: ArrangementProjectState): void {
    this.blueprint = state.blueprint
      ? cloneBlueprint(state.blueprint)
      : undefined;
    this.sourceFoundationId = state.sourceFoundationId;
    this.selectedSectionId =
      state.selectedSectionId &&
      this.blueprint?.sections.some(
        (section) => section.id === state.selectedSectionId,
      )
        ? state.selectedSectionId
        : this.blueprint?.sections[0]?.id;
    this.patternCatalog = new Map(
      state.patterns.map((pattern) => [
        pattern.id,
        clonePattern(pattern),
      ]),
    );
    this.edited = Boolean(state.edited);
    this.undoStack = [];
    this.redoStack = [];
    this.lastUndoKey = null;
    this.lastUndoAt = 0;

    const copyOrdinals =
      this.blueprint?.sections
        .map((section) => /-copy-(\d+)$/.exec(section.id)?.[1])
        .filter((value): value is string => Boolean(value))
        .map(Number) ?? [];
    this.duplicateCounter = Math.max(0, ...copyOrdinals);
    this.musicalRevision += 1;
    this.recalculate();
    this.publish();
  }

  loadFromFoundation(
    blueprint: ArrangementBlueprint,
    patterns: readonly BeatFamilyPattern[],
  ): void {
    const next = cloneBlueprint(blueprint);
    next.sections = next.sections.map((section) => ({
      ...section,
      fillPlacement:
        section.fillPlacement ?? defaultFillPlacement(section),
      transitionPlacement:
        section.transitionPlacement ??
        defaultTransitionPlacement(section),
    }));

    this.blueprint = next;
    this.sourceFoundationId = blueprint.id;
    this.selectedSectionId = next.sections[0]?.id;
    this.patternCatalog = new Map(
      patterns.map((entry) => [
        entry.pattern.id,
        clonePattern(entry.pattern),
      ]),
    );
    this.edited = false;
    this.duplicateCounter = 0;
    this.undoStack = [];
    this.redoStack = [];
    this.lastUndoKey = null;
    this.lastUndoAt = 0;
    this.musicalRevision += 1;
    this.recalculate();
    this.publish();
  }

  clear(): void {
    this.blueprint = undefined;
    this.sourceFoundationId = undefined;
    this.selectedSectionId = undefined;
    this.patternCatalog.clear();
    this.occurrences = [];
    this.totalTicks = 0;
    this.edited = false;
    this.undoStack = [];
    this.redoStack = [];
    this.lastUndoKey = null;
    this.lastUndoAt = 0;
    this.musicalRevision += 1;
    this.publish();
  }

  getPattern(patternId: string): Pattern | undefined {
    const pattern = this.patternCatalog.get(patternId);
    return pattern ? clonePattern(pattern) : undefined;
  }

  selectSection(sectionId: string): void {
    if (!this.blueprint?.sections.some((section) => section.id === sectionId)) {
      return;
    }
    if (this.selectedSectionId === sectionId) return;
    this.selectedSectionId = sectionId;
    this.publish();
  }

  moveSection(sectionId: string, delta: -1 | 1): void {
    if (!this.blueprint) return;
    const index = this.blueprint.sections.findIndex(
      (section) => section.id === sectionId,
    );
    if (index < 0) return;
    const target = index + delta;
    if (target < 0 || target >= this.blueprint.sections.length) return;

    this.captureUndo();

    const next = [...this.blueprint.sections];
    const [section] = next.splice(index, 1);
    if (!section) return;
    next.splice(target, 0, section);
    this.blueprint.sections = next;
    this.markEditedAndPublish();
  }

  moveSectionTo(
    sectionId: string,
    targetSectionId: string,
  ): void {
    if (!this.blueprint || sectionId === targetSectionId) return;

    const from = this.blueprint.sections.findIndex(
      (section) => section.id === sectionId,
    );
    const target = this.blueprint.sections.findIndex(
      (section) => section.id === targetSectionId,
    );
    if (from < 0 || target < 0) return;

    this.captureUndo();

    const next = [...this.blueprint.sections];
    const [section] = next.splice(from, 1);
    if (!section) return;

    next.splice(target, 0, section);
    this.blueprint.sections = next;
    this.markEditedAndPublish();
  }

  duplicateSection(sectionId: string): void {
    if (!this.blueprint) return;
    const index = this.blueprint.sections.findIndex(
      (section) => section.id === sectionId,
    );
    if (index < 0) return;

    const source = this.blueprint.sections[index];
    if (!source) return;
    this.captureUndo();
    this.duplicateCounter += 1;
    const clone: SectionBlueprint = {
      ...cloneSection(source),
      id:
        source.id +
        "-copy-" +
        String(this.duplicateCounter).padStart(2, "0"),
      label: source.label + " COPY",
    };

    this.blueprint.sections.splice(index + 1, 0, clone);
    this.selectedSectionId = clone.id;
    this.markEditedAndPublish();
  }

  removeSection(sectionId: string): void {
    if (!this.blueprint || this.blueprint.sections.length <= 1) return;
    const index = this.blueprint.sections.findIndex(
      (section) => section.id === sectionId,
    );
    if (index < 0) return;

    this.captureUndo();
    this.blueprint.sections.splice(index, 1);
    if (this.selectedSectionId === sectionId) {
      this.selectedSectionId =
        this.blueprint.sections[Math.min(index, this.blueprint.sections.length - 1)]
          ?.id;
    }
    this.markEditedAndPublish();
  }

  setSectionCycles(sectionId: string, cycles: number): void {
    const section = this.findSection(sectionId);
    if (!section || !this.blueprint) return;

    const count = Math.max(1, Math.min(16, Math.round(cycles)));
    if (count === section.cycleCount) return;
    const scene = this.blueprint.scenes.find(
      (entry) => entry.id === section.sceneId,
    );
    if (!scene || scene.patternIds.length === 0) return;

    this.captureUndo();

    const next = Array.from({ length: count }, (_, index) => {
      return scene.patternIds[index % scene.patternIds.length];
    });

    if (
      section.fillPatternId &&
      section.fillPlacement !== "off" &&
      next.length > 0
    ) {
      next[next.length - 1] = section.fillPatternId;
    }

    section.patternSequence = next;
    section.cycleCount = next.length;
    this.markEditedAndPublish();
  }

  setSectionEnergyStart(sectionId: string, value: number): void {
    const section = this.findSection(sectionId);
    if (!section) return;
    const next = clamp01(value);
    if (Math.abs(next - section.energyStart) < 0.0001) return;
    this.captureUndo("energy-start:" + sectionId);
    section.energyStart = next;
    this.markEditedAndPublish(false);
  }

  setSectionEnergyEnd(sectionId: string, value: number): void {
    const section = this.findSection(sectionId);
    if (!section) return;
    const next = clamp01(value);
    if (Math.abs(next - section.energyEnd) < 0.0001) return;
    this.captureUndo("energy-end:" + sectionId);
    section.energyEnd = next;
    this.markEditedAndPublish(false);
  }

  toggleFillPlacement(sectionId: string): void {
    const section = this.findSection(sectionId);
    if (!section?.fillPatternId || !this.blueprint) return;

    this.captureUndo();
    section.fillPlacement =
      section.fillPlacement === "off" ? "last" : "off";
    this.rebuildMainSequence(section);
    this.markEditedAndPublish();
  }

  cycleTransitionPlacement(sectionId: string): void {
    const section = this.findSection(sectionId);
    if (!section?.transitionPatternId) return;

    this.captureUndo();
    const current = section.transitionPlacement ?? "off";
    section.transitionPlacement =
      current === "off"
        ? "replaceLast"
        : current === "replaceLast"
          ? "append"
          : "off";
    this.markEditedAndPublish();
  }

  undo(): void {
    if (!this.blueprint || this.undoStack.length === 0) return;

    this.redoStack.push(cloneBlueprint(this.blueprint));
    const previous = this.undoStack.pop();
    if (!previous) return;

    this.blueprint = cloneBlueprint(previous);
    if (
      this.selectedSectionId &&
      !this.blueprint.sections.some(
        (section) => section.id === this.selectedSectionId,
      )
    ) {
      this.selectedSectionId = this.blueprint.sections[0]?.id;
    }
    this.edited = true;
    this.musicalRevision += 1;
    this.lastUndoKey = null;
    this.lastUndoAt = 0;
    this.recalculate();
    this.publish();
  }

  redo(): void {
    if (!this.blueprint || this.redoStack.length === 0) return;

    this.undoStack.push(cloneBlueprint(this.blueprint));
    const next = this.redoStack.pop();
    if (!next) return;

    this.blueprint = cloneBlueprint(next);
    if (
      this.selectedSectionId &&
      !this.blueprint.sections.some(
        (section) => section.id === this.selectedSectionId,
      )
    ) {
      this.selectedSectionId = this.blueprint.sections[0]?.id;
    }
    this.edited = true;
    this.musicalRevision += 1;
    this.lastUndoKey = null;
    this.lastUndoAt = 0;
    this.recalculate();
    this.publish();
  }

  resolveAtTick(arrangementTickInput: number): {
    occurrence: ArrangementOccurrence;
    pattern: Pattern;
    localTick: number;
    occurrenceIndex: number;
  } | null {
    const resolved = this.resolvePlaybackAtTick(arrangementTickInput);
    if (!resolved) return null;

    return {
      ...resolved,
      occurrence: { ...resolved.occurrence },
      pattern: clonePattern(resolved.pattern),
    };
  }

  resolvePlaybackAtTick(arrangementTickInput: number): {
    occurrence: ArrangementOccurrence;
    pattern: Pattern;
    localTick: number;
    occurrenceIndex: number;
  } | null {
    const arrangementTick = Math.max(0, arrangementTickInput);
    const index = this.occurrences.findIndex(
      (occurrence) =>
        arrangementTick >= occurrence.startTick &&
        arrangementTick < occurrence.startTick + occurrence.lengthTicks,
    );
    if (index < 0) return null;

    const occurrence = this.occurrences[index];
    if (!occurrence) return null;
    const pattern = this.patternCatalog.get(occurrence.patternId);
    if (!pattern) return null;

    return {
      occurrence,
      pattern,
      localTick: arrangementTick - occurrence.startTick,
      occurrenceIndex: index,
    };
  }

  private captureUndo(coalesceKey?: string): void {
    if (!this.blueprint) return;

    const now = Date.now();
    const shouldCoalesce =
      coalesceKey !== undefined &&
      this.lastUndoKey === coalesceKey &&
      now - this.lastUndoAt < 900;

    if (!shouldCoalesce) {
      this.undoStack.push(cloneBlueprint(this.blueprint));
      if (this.undoStack.length > ARRANGEMENT_HISTORY_LIMIT) {
        this.undoStack.shift();
      }
      this.redoStack = [];
    }

    this.lastUndoKey = coalesceKey ?? null;
    this.lastUndoAt = now;
  }

  private findSection(sectionId: string): SectionBlueprint | undefined {
    return this.blueprint?.sections.find((section) => section.id === sectionId);
  }

  private rebuildMainSequence(section: SectionBlueprint): void {
    if (!this.blueprint) return;
    const scene = this.blueprint.scenes.find(
      (entry) => entry.id === section.sceneId,
    );
    if (!scene || scene.patternIds.length === 0) return;

    const count = Math.max(1, section.cycleCount);
    const next = Array.from({ length: count }, (_, index) => {
      return scene.patternIds[index % scene.patternIds.length];
    });

    if (
      section.fillPatternId &&
      section.fillPlacement !== "off" &&
      next.length > 0
    ) {
      next[next.length - 1] = section.fillPatternId;
    }

    section.patternSequence = next;
    section.cycleCount = next.length;
  }

  private effectivePatternIds(section: SectionBlueprint): Array<{
    patternId: string;
    kind: ArrangementOccurrence["kind"];
    cycleIndex: number;
  }> {
    const main: Array<{
      patternId: string;
      kind: ArrangementOccurrence["kind"];
      cycleIndex: number;
    }> = section.patternSequence.map((patternId, cycleIndex) => ({
      patternId,
      kind:
        section.fillPatternId === patternId &&
        section.fillPlacement !== "off"
          ? ("fill" as const)
          : ("pattern" as const),
      cycleIndex,
    }));

    if (!section.transitionPatternId) return main;

    if (section.transitionPlacement === "replaceLast" && main.length > 0) {
      main[main.length - 1] = {
        patternId: section.transitionPatternId,
        kind: "transition",
        cycleIndex: main.length - 1,
      };
    } else if (section.transitionPlacement === "append") {
      main.push({
        patternId: section.transitionPatternId,
        kind: "transition",
        cycleIndex: main.length,
      });
    }

    return main;
  }

  private recalculate(): void {
    if (!this.blueprint) {
      this.occurrences = [];
      this.totalTicks = 0;
      return;
    }

    const occurrences: ArrangementOccurrence[] = [];
    let cursor = 0;
    let occurrenceCounter = 0;

    for (const section of this.blueprint.sections) {
      section.startTick = cursor;
      let sectionLength = 0;

      for (const item of this.effectivePatternIds(section)) {
        const pattern = this.patternCatalog.get(item.patternId);
        if (!pattern) continue;

        occurrences.push({
          id:
            "occ-" +
            String(occurrenceCounter).padStart(4, "0") +
            "-" +
            section.id,
          sectionId: section.id,
          patternId: item.patternId,
          startTick: cursor + sectionLength,
          lengthTicks: pattern.lengthTicks,
          cycleIndex: item.cycleIndex,
          kind: item.kind,
        });
        occurrenceCounter += 1;
        sectionLength += pattern.lengthTicks;
      }

      section.lengthTicks = sectionLength;
      cursor += sectionLength;
    }

    this.occurrences = occurrences;
    this.totalTicks = cursor;
  }

  private markEditedAndPublish(recalculate = true): void {
    this.edited = true;
    this.musicalRevision += 1;
    if (recalculate) this.recalculate();
    this.publish();
  }

  private publish(): void {
    this.revision += 1;
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): ArrangementSnapshot {
    return {
      blueprint: this.blueprint
        ? cloneBlueprint(this.blueprint)
        : undefined,
      sourceFoundationId: this.sourceFoundationId,
      selectedSectionId: this.selectedSectionId,
      occurrences: this.occurrences.map((occurrence) => ({ ...occurrence })),
      totalTicks: this.totalTicks,
      edited: this.edited,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      musicalRevision: this.musicalRevision,
      revision: this.revision,
    };
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export const arrangementStore = new ArrangementStore();
