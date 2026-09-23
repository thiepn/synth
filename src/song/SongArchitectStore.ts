import type { ArrangementShapeId, Pattern } from "../domain/contracts";
import type { BeatFamilyGenerationResult } from "../generation/beatFamilyGenerator";
import type { EvolutionPlan } from "../generation/evolutionEngine";
import {
  generateSongCandidate,
  type SongArchitectCandidate,
  type SongArchitectSourceMode,
} from "../generation/songArchitect";
import { shortSeed } from "../generation/prng";
import { registerProjectTransientReset } from "../project/transientResetRegistry";

type Listener = () => void;

export interface SongArchitectConfig {
  shape: ArrangementShapeId;
  sourceMode: SongArchitectSourceMode;
  seed: string;
}

export interface SongArchitectSnapshot {
  config: SongArchitectConfig;
  candidate?: SongArchitectCandidate;
  previewActive: boolean;
  selectedSectionIndex: number;
  lockedSectionIndexes: number[];
  revision: number;
}

function cloneCandidate(
  candidate: SongArchitectCandidate | undefined,
): SongArchitectCandidate | undefined {
  if (!candidate) return undefined;

  return {
    ...candidate,
    family: {
      ...candidate.family,
      family: {
        ...candidate.family.family,
        members: candidate.family.family.members.map((member) => ({
          ...member,
        })),
        provenance: candidate.family.family.provenance
          ? {
              ...candidate.family.family.provenance,
              style: { ...candidate.family.family.provenance.style },
              intent: { ...candidate.family.family.provenance.intent },
            }
          : undefined,
      },
      patterns: candidate.family.patterns.map((entry) => ({
        ...entry,
        pattern: clonePattern(entry.pattern),
        validation: {
          ...entry.validation,
          reasons: [...entry.validation.reasons],
          metrics: { ...entry.validation.metrics },
        },
      })),
      reasons: [...candidate.family.reasons],
    },
    result: {
      ...candidate.result,
      blueprint: {
        ...candidate.result.blueprint,
        scenes: candidate.result.blueprint.scenes.map((scene) => ({
          ...scene,
          patternIds: [...scene.patternIds],
          provenance: scene.provenance
            ? {
                ...scene.provenance,
                style: { ...scene.provenance.style },
                intent: { ...scene.provenance.intent },
              }
            : undefined,
        })),
        sections: candidate.result.blueprint.sections.map((section) => ({
          ...section,
          patternSequence: [...section.patternSequence],
        })),
        provenance: candidate.result.blueprint.provenance
          ? {
              ...candidate.result.blueprint.provenance,
              style: { ...candidate.result.blueprint.provenance.style },
              intent: { ...candidate.result.blueprint.provenance.intent },
            }
          : undefined,
      },
      reasons: [...candidate.result.reasons],
    },
    occurrences: candidate.occurrences.map((occurrence) => ({
      ...occurrence,
    })),
    lockedSectionIndexes: [...candidate.lockedSectionIndexes],
  };
}

export class SongArchitectStore {
  private listeners = new Set<Listener>();
  private config: SongArchitectConfig = {
    shape: "standard",
    sourceMode: "auto",
    seed: "SONG-0001",
  };
  private candidate: SongArchitectCandidate | undefined;
  private previewActive = false;
  private selectedSectionIndex = 0;
  private lockedSectionIndexes = new Set<number>();
  private seedSerial = 1;
  private sectionRerollSerial = 1;
  private revision = 0;
  private snapshot = this.buildSnapshot();

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): SongArchitectSnapshot => this.snapshot;

  setShape(shape: ArrangementShapeId): void {
    if (this.config.shape === shape) return;
    this.config = { ...this.config, shape };
    this.candidate = undefined;
    this.previewActive = false;
    this.selectedSectionIndex = 0;
    this.lockedSectionIndexes.clear();
    this.publish();
  }

  setSourceMode(sourceMode: SongArchitectSourceMode): void {
    if (this.config.sourceMode === sourceMode) return;
    this.config = { ...this.config, sourceMode };
    this.candidate = undefined;
    this.previewActive = false;
    this.selectedSectionIndex = 0;
    this.lockedSectionIndexes.clear();
    this.publish();
  }

  setSeed(seed: string): void {
    const next = seed.trim();
    if (!next || next === this.config.seed) return;
    this.config = { ...this.config, seed: next };
    this.publish();
  }

  newSeed(): void {
    const raw =
      this.config.seed +
      ":" +
      Date.now().toString(36) +
      ":" +
      this.seedSerial++;
    this.config = {
      ...this.config,
      seed: "SONG-" + shortSeed(raw),
    };
    this.publish();
  }

  generate(input: {
    family?: BeatFamilyGenerationResult;
    evolution?: EvolutionPlan;
  }): SongArchitectCandidate {
    const next = generateSongCandidate({
      seed: this.config.seed,
      shape: this.config.shape,
      sourceMode: this.config.sourceMode,
      family: input.family,
      evolution: input.evolution,
      previous: this.candidate,
      lockedSectionIndexes: [...this.lockedSectionIndexes],
    });

    this.candidate = {
      ...next,
      lockedSectionIndexes: [...this.lockedSectionIndexes],
    };
    this.previewActive = false;
    this.selectedSectionIndex = Math.min(
      this.selectedSectionIndex,
      Math.max(0, next.result.blueprint.sections.length - 1),
    );
    this.publish();
    return cloneCandidate(this.candidate)!;
  }

  tryAnother(input: {
    family?: BeatFamilyGenerationResult;
    evolution?: EvolutionPlan;
  }): SongArchitectCandidate {
    this.newSeed();
    return this.generate(input);
  }

  regenerateSection(
    index: number,
    input: {
      family?: BeatFamilyGenerationResult;
      evolution?: EvolutionPlan;
    },
  ): SongArchitectCandidate | undefined {
    if (!this.candidate) return undefined;
    if (this.lockedSectionIndexes.has(index)) return undefined;

    const sectionCount =
      this.candidate.result.blueprint.sections.length;
    const temporaryLocks = Array.from(
      { length: sectionCount },
      (_, sectionIndex) => sectionIndex,
    ).filter((sectionIndex) => sectionIndex !== index);

    const seed =
      this.config.seed +
      ":section:" +
      index +
      ":" +
      this.sectionRerollSerial++;

    const next = generateSongCandidate({
      seed,
      shape: this.config.shape,
      sourceMode: this.config.sourceMode,
      family: input.family,
      evolution: input.evolution,
      previous: this.candidate,
      lockedSectionIndexes: temporaryLocks,
    });

    this.candidate = {
      ...next,
      lockedSectionIndexes: [...this.lockedSectionIndexes],
    };
    this.selectedSectionIndex = index;
    this.previewActive = false;
    this.publish();
    return cloneCandidate(this.candidate)!;
  }

  toggleSectionLock(index: number): void {
    if (!this.candidate?.result.blueprint.sections[index]) return;

    if (this.lockedSectionIndexes.has(index)) {
      this.lockedSectionIndexes.delete(index);
    } else {
      this.lockedSectionIndexes.add(index);
    }

    if (this.candidate) {
      this.candidate = {
        ...this.candidate,
        lockedSectionIndexes: [...this.lockedSectionIndexes].sort(
          (a, b) => a - b,
        ),
      };
    }
    this.publish();
  }

  selectSection(index: number): void {
    if (!this.candidate) return;
    const next = Math.max(
      0,
      Math.min(
        this.candidate.result.blueprint.sections.length - 1,
        Math.round(index),
      ),
    );
    if (this.selectedSectionIndex === next) return;
    this.selectedSectionIndex = next;
    this.publish();
  }

  setPreviewActive(active: boolean): void {
    const next = Boolean(active && this.candidate);
    if (this.previewActive === next) return;
    this.previewActive = next;
    this.publish();
  }

  resolveAtTick(tick: number): {
    pattern: Pattern;
    localTick: number;
    planTick: number;
    occurrenceIndex: number;
    sectionIndex: number;
    sectionId: string;
    energy: number;
  } | null {
    const candidate = this.candidate;
    if (
      !this.previewActive ||
      !candidate ||
      candidate.totalTicks <= 0
    ) {
      return null;
    }

    const planTick =
      ((Math.max(0, tick) % candidate.totalTicks) +
        candidate.totalTicks) %
      candidate.totalTicks;
    const occurrenceIndex = candidate.occurrences.findIndex(
      (occurrence) =>
        planTick >= occurrence.startTick &&
        planTick < occurrence.startTick + occurrence.lengthTicks,
    );
    if (occurrenceIndex < 0) return null;

    const occurrence = candidate.occurrences[occurrenceIndex];
    if (!occurrence) return null;

    const pattern = candidate.family.patterns.find(
      (entry) => entry.pattern.id === occurrence.patternId,
    )?.pattern;
    const section =
      candidate.result.blueprint.sections[occurrence.sectionIndex];

    if (!pattern || !section) return null;

    const progress =
      section.lengthTicks > 0
        ? Math.max(
            0,
            Math.min(
              1,
              (planTick - section.startTick) / section.lengthTicks,
            ),
          )
        : 0;
    const energy =
      section.energyStart +
      (section.energyEnd - section.energyStart) * progress;

    return {
      pattern,
      localTick: planTick - occurrence.startTick,
      planTick,
      occurrenceIndex,
      sectionIndex: occurrence.sectionIndex,
      sectionId: section.id,
      energy: Math.max(0, Math.min(1, energy)),
    };
  }

  clear(): void {
    this.candidate = undefined;
    this.previewActive = false;
    this.selectedSectionIndex = 0;
    this.lockedSectionIndexes.clear();
    this.publish();
  }

  markCommitted(): void {
    this.previewActive = false;
    this.publish();
  }

  private publish(): void {
    this.revision += 1;
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): SongArchitectSnapshot {
    return {
      config: { ...this.config },
      candidate: cloneCandidate(this.candidate),
      previewActive: this.previewActive,
      selectedSectionIndex: this.selectedSectionIndex,
      lockedSectionIndexes: [...this.lockedSectionIndexes].sort(
        (a, b) => a - b,
      ),
      revision: this.revision,
    };
  }
}

export const songArchitectStore = new SongArchitectStore();

registerProjectTransientReset(
  "songArchitectStore",
  () => songArchitectStore.clear(),
);
