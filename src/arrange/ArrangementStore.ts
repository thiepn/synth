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

export interface ArrangementSnapshot {
  blueprint?: ArrangementBlueprint;
  sourceFoundationId?: string;
  selectedSectionId?: string;
  occurrences: ArrangementOccurrence[];
  totalTicks: number;
  edited: boolean;
  revision: number;
}

type Listener = () => void;

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

function clonePattern(pattern: Pattern): Pattern {
  return {
    ...pattern,
    meter: { ...pattern.meter },
    lanes: pattern.lanes.map((lane) => ({
      ...lane,
      events: lane.events.map((event) => ({
        ...event,
        generatorTags: event.generatorTags
          ? [...event.generatorTags]
          : undefined,
        grooveBase: event.grooveBase
          ? { ...event.grooveBase }
          : undefined,
      })),
      lock: { ...lane.lock },
      regionLocks: lane.regionLocks?.map((lock) => ({ ...lock })),
    })),
    groove: pattern.groove
      ? {
          ...pattern.groove,
          roleTimingOffsetUs: pattern.groove.roleTimingOffsetUs
            ? { ...pattern.groove.roleTimingOffsetUs }
            : undefined,
        }
      : undefined,
    provenance: cloneProvenance(pattern.provenance),
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
  private revision = 0;
  private duplicateCounter = 0;
  private snapshot: ArrangementSnapshot = this.buildSnapshot();

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): ArrangementSnapshot => this.snapshot;

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

    const next = [...this.blueprint.sections];
    const [section] = next.splice(index, 1);
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
    const scene = this.blueprint.scenes.find(
      (entry) => entry.id === section.sceneId,
    );
    if (!scene || scene.patternIds.length === 0) return;

    const next = Array.from({ length: count }, (_, index) => {
      return scene.patternIds[index % scene.patternIds.length];
    });

    if (
      section.fillPatternId &&
      section.fillPlacement !== "off" &&
      next.length > 1
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
    section.energyStart = clamp01(value);
    this.markEditedAndPublish(false);
  }

  setSectionEnergyEnd(sectionId: string, value: number): void {
    const section = this.findSection(sectionId);
    if (!section) return;
    section.energyEnd = clamp01(value);
    this.markEditedAndPublish(false);
  }

  toggleFillPlacement(sectionId: string): void {
    const section = this.findSection(sectionId);
    if (!section?.fillPatternId || !this.blueprint) return;

    section.fillPlacement =
      section.fillPlacement === "off" ? "last" : "off";
    this.rebuildMainSequence(section);
    this.markEditedAndPublish();
  }

  cycleTransitionPlacement(sectionId: string): void {
    const section = this.findSection(sectionId);
    if (!section?.transitionPatternId) return;

    const current = section.transitionPlacement ?? "off";
    section.transitionPlacement =
      current === "off"
        ? "replaceLast"
        : current === "replaceLast"
          ? "append"
          : "off";
    this.markEditedAndPublish();
  }

  resolveAtTick(arrangementTickInput: number): {
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
    const pattern = this.patternCatalog.get(occurrence.patternId);
    if (!pattern) return null;

    return {
      occurrence: { ...occurrence },
      pattern: clonePattern(pattern),
      localTick: arrangementTick - occurrence.startTick,
      occurrenceIndex: index,
    };
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
      next.length > 1
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
    const main = section.patternSequence.map((patternId, cycleIndex) => ({
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
      revision: this.revision,
    };
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export const arrangementStore = new ArrangementStore();
