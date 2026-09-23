import type {
  ArrangementShapeId,
  BeatFamily,
  BeatFamilyMember,
  BeatFamilyRole,
  Pattern,
} from "../domain/contracts";
import { clonePattern } from "../domain/patternClone";
import { cloneBeatFamily } from "../domain/familyClone";
import {
  cloneArrangementBlueprint,
} from "../domain/arrangementClone";
import type {
  BeatFamilyGenerationResult,
  BeatFamilyPattern,
} from "./beatFamilyGenerator";
import type {
  EvolutionPlan,
  EvolutionSegment,
} from "./evolutionEngine";
import {
  generateSceneSectionBlueprint,
  type SceneSectionGenerationResult,
} from "./sceneSectionGenerator";
import { deriveSeed, shortSeed } from "./prng";

export const SONG_ARCHITECT_ID = "song-architect";
export const SONG_ARCHITECT_VERSION = 1;

export type SongArchitectSourceMode =
  | "auto"
  | "family"
  | "evolve";

export interface SongArchitectRequest {
  seed: string;
  shape: ArrangementShapeId;
  sourceMode: SongArchitectSourceMode;
  family?: BeatFamilyGenerationResult;
  evolution?: EvolutionPlan;
  previous?: SongArchitectCandidate;
  lockedSectionIndexes?: readonly number[];
}

export interface SongArchitectOccurrence {
  id: string;
  sectionIndex: number;
  sectionId: string;
  patternId: string;
  startTick: number;
  lengthTicks: number;
  kind: "pattern" | "fill" | "transition";
  energyStart: number;
  energyEnd: number;
}

export interface SongArchitectCandidate {
  id: string;
  seed: string;
  displaySeed: string;
  shape: ArrangementShapeId;
  sourceMode: Exclude<SongArchitectSourceMode, "auto">;
  sourceRefId: string;
  family: BeatFamilyGenerationResult;
  result: SceneSectionGenerationResult;
  occurrences: SongArchitectOccurrence[];
  totalTicks: number;
  lockedSectionIndexes: number[];
}

const FAMILY_ROLES: readonly BeatFamilyRole[] = [
  "core",
  "aVariation",
  "bVariation",
  "build",
  "breakdown",
  "drop",
  "fill1",
  "fill2",
  "transition",
];

function cloneFamilyPattern(
  entry: BeatFamilyPattern,
): BeatFamilyPattern {
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

function cloneFamilyResult(
  result: BeatFamilyGenerationResult,
): BeatFamilyGenerationResult {
  return {
    ...result,
    family: cloneBeatFamily(result.family),
    patterns: result.patterns.map(cloneFamilyPattern),
    reasons: [...result.reasons],
  };
}

function cloneScene(scene: Scene): Scene {
  return {
    ...scene,
    patternIds: [...scene.patternIds],
    provenance: scene.provenance
      ? {
          ...scene.provenance,
          style: { ...scene.provenance.style },
          intent: { ...scene.provenance.intent },
        }
      : undefined,
  };
}

function cloneSection(section: SectionBlueprint): SectionBlueprint {
  return {
    ...section,
    patternSequence: [...section.patternSequence],
  };
}

function cloneArrangementBlueprint(
  blueprint: ArrangementBlueprint,
): ArrangementBlueprint {
  return {
    ...blueprint,
    scenes: blueprint.scenes.map(cloneScene),
    sections: blueprint.sections.map(cloneSection),
    provenance: blueprint.provenance
      ? {
          ...blueprint.provenance,
          style: { ...blueprint.provenance.style },
          intent: { ...blueprint.provenance.intent },
        }
      : undefined,
  };
}

function cloneResult(
  result: SceneSectionGenerationResult,
): SceneSectionGenerationResult {
  return {
    ...result,
    blueprint: cloneArrangementBlueprint(result.blueprint),
    reasons: [...result.reasons],
  };
}

function segmentForRole(
  plan: EvolutionPlan,
  role: BeatFamilyRole,
  ordinal: number,
): EvolutionSegment | undefined {
  const exact = plan.segments.filter(
    (segment) => segment.familyRole === role,
  );
  if (exact.length === 0) return undefined;

  if (role === "core") {
    return (
      exact.find((segment) => segment.role === "anchor") ??
      exact.find((segment) => segment.role === "return") ??
      exact[0]
    );
  }

  if (role === "aVariation") {
    return exact[0];
  }

  if (role === "bVariation") {
    return [...exact].sort(
      (a, b) => b.novelty - a.novelty,
    )[0];
  }

  if (role === "fill1" || role === "fill2") {
    return exact[Math.min(ordinal, exact.length - 1)];
  }

  return [...exact].sort(
    (a, b) =>
      Math.abs(b.energy - 0.5) -
      Math.abs(a.energy - 0.5),
  )[0];
}

function familyFromEvolution(
  plan: EvolutionPlan,
): BeatFamilyGenerationResult {
  const source = cloneFamilyResult(plan.family);
  const patterns: BeatFamilyPattern[] = [];
  let fillOrdinal = 0;

  for (const role of FAMILY_ROLES) {
    const base =
      source.patterns.find((entry) => entry.role === role) ??
      source.patterns.find((entry) => entry.role === "core") ??
      source.patterns[0];

    if (!base) continue;

    const segment = segmentForRole(
      plan,
      role,
      role === "fill2" ? ++fillOrdinal : fillOrdinal,
    );

    patterns.push(
      segment
        ? {
            ...base,
            energy: segment.energy,
            pattern: clonePattern(segment.pattern),
            validation: {
              ...segment.validation,
              reasons: [...segment.validation.reasons],
              metrics: { ...segment.validation.metrics },
            },
          }
        : cloneFamilyPattern(base),
    );
  }

  const patternByRole = new Map(
    patterns.map((entry) => [entry.role, entry]),
  );

  const family: BeatFamily = {
    ...source.family,
    members: source.family.members.map((member) => {
      const replacement = patternByRole.get(member.role);
      return replacement
        ? {
            ...member,
            patternId: replacement.pattern.id,
            energy: replacement.energy,
          }
        : { ...member };
    }),
    provenance: source.family.provenance
      ? {
          ...source.family.provenance,
          sourceEntityId: plan.sourcePatternId,
          mutationId:
            "song-source:evolve:" +
            plan.id,
          style: { ...source.family.provenance.style },
          intent: { ...source.family.provenance.intent },
        }
      : undefined,
  };

  const averageQuality =
    patterns.reduce(
      (sum, entry) => sum + entry.validation.score,
      0,
    ) / Math.max(1, patterns.length);

  return {
    ...source,
    family,
    patterns,
    displaySeed: plan.displaySeed,
    coherenceScore: Math.round(
      Math.max(
        0,
        Math.min(
          100,
          plan.coherenceScore * 0.65 +
            averageQuality * 0.35,
        ),
      ),
    ),
    valid: patterns.length > 0,
    reasons: [],
  };
}

function resolveFamily(
  request: SongArchitectRequest,
): {
  mode: Exclude<SongArchitectSourceMode, "auto">;
  sourceRefId: string;
  family: BeatFamilyGenerationResult;
} {
  if (
    request.sourceMode === "evolve" ||
    (request.sourceMode === "auto" && request.evolution)
  ) {
    if (!request.evolution) {
      throw new Error(
        "Song Architect is set to EVOLVE, but no Evolution plan exists.",
      );
    }

    return {
      mode: "evolve",
      sourceRefId: request.evolution.id,
      family: familyFromEvolution(request.evolution),
    };
  }

  if (!request.family) {
    throw new Error(
      "Generate a Beat Family or EVOLVE plan before building a song.",
    );
  }

  return {
    mode: "family",
    sourceRefId: request.family.family.id,
    family: cloneFamilyResult(request.family),
  };
}

function patternMap(
  family: BeatFamilyGenerationResult,
): Map<string, Pattern> {
  return new Map(
    family.patterns.map((entry) => [
      entry.pattern.id,
      entry.pattern,
    ]),
  );
}

function replaceLockedSections(
  next: SceneSectionGenerationResult,
  previous: SongArchitectCandidate | undefined,
  lockedIndexes: ReadonlySet<number>,
): SceneSectionGenerationResult {
  if (
    !previous ||
    previous.shape !== next.blueprint.shape ||
    lockedIndexes.size === 0
  ) {
    return cloneResult(next);
  }

  const result = cloneResult(next);
  const previousBlueprint = previous.result.blueprint;

  for (const index of lockedIndexes) {
    const oldSection = previousBlueprint.sections[index];
    if (!oldSection || !result.blueprint.sections[index]) continue;

    const oldScene = previousBlueprint.scenes.find(
      (scene) => scene.id === oldSection.sceneId,
    );
    const oldRole = oldSection.role;

    result.blueprint.sections[index] = cloneSection(oldSection);

    if (oldScene) {
      result.blueprint.scenes = result.blueprint.scenes.filter(
        (scene) => scene.role !== oldRole,
      );
      result.blueprint.scenes.push(cloneScene(oldScene));
    }
  }

  return result;
}

function buildOccurrences(
  result: SceneSectionGenerationResult,
  family: BeatFamilyGenerationResult,
): {
  result: SceneSectionGenerationResult;
  occurrences: SongArchitectOccurrence[];
  totalTicks: number;
} {
  const normalized = cloneResult(result);
  const patterns = patternMap(family);
  const occurrences: SongArchitectOccurrence[] = [];
  let cursor = 0;
  let occurrenceIndex = 0;

  normalized.blueprint.sections.forEach((section, sectionIndex) => {
    section.startTick = cursor;
    let sectionLength = 0;

    const sequence: Array<{
      patternId: string;
      kind: SongArchitectOccurrence["kind"];
    }> = section.patternSequence.map((patternId) => ({
      patternId,
      kind:
        patternId === section.fillPatternId
          ? ("fill" as const)
          : ("pattern" as const),
    }));

    if (section.transitionPatternId) {
      sequence.push({
        patternId: section.transitionPatternId,
        kind: "transition",
      });
    }

    for (const item of sequence) {
      const pattern = patterns.get(item.patternId);
      if (!pattern) continue;

      occurrences.push({
        id:
          "song-occ-" +
          String(occurrenceIndex).padStart(4, "0"),
        sectionIndex,
        sectionId: section.id,
        patternId: item.patternId,
        startTick: cursor + sectionLength,
        lengthTicks: pattern.lengthTicks,
        kind: item.kind,
        energyStart: section.energyStart,
        energyEnd: section.energyEnd,
      });
      occurrenceIndex += 1;
      sectionLength += pattern.lengthTicks;
    }

    section.lengthTicks = sectionLength;
    cursor += sectionLength;
  });

  normalized.totalTicks = cursor;

  return {
    result: normalized,
    occurrences,
    totalTicks: cursor,
  };
}

export function generateSongCandidate(
  request: SongArchitectRequest,
): SongArchitectCandidate {
  const source = resolveFamily(request);
  if (!source.family.valid || source.family.patterns.length === 0) {
    throw new Error(
      "Song source family is not valid enough for arrangement generation.",
    );
  }

  const effectiveSeed = deriveSeed(
    request.seed,
    [
      SONG_ARCHITECT_ID,
      "v" + SONG_ARCHITECT_VERSION,
      source.mode,
      request.shape,
      source.family.family.id,
    ].join(":"),
  );

  const generated = generateSceneSectionBlueprint({
    family: source.family.family,
    patterns: source.family.patterns,
    shape: request.shape,
    seed: effectiveSeed,
  });

  if (!generated.valid) {
    throw new Error(
      "Song Architect rejected the candidate: " +
        (generated.reasons[0] ?? "coherence gate failed"),
    );
  }

  const lockedIndexes = new Set(
    request.lockedSectionIndexes ?? [],
  );
  const previousForLocks =
    request.previous?.sourceRefId === source.sourceRefId
      ? request.previous
      : undefined;
  const merged = replaceLockedSections(
    generated,
    previousForLocks,
    lockedIndexes,
  );
  const built = buildOccurrences(
    merged,
    source.family,
  );

  const displaySeed = shortSeed(effectiveSeed);

  built.result.blueprint.id =
    "song-blueprint-" +
    request.shape +
    "-" +
    displaySeed;
  built.result.blueprint.name =
    "SONG " +
    request.shape.toUpperCase() +
    " / " +
    displaySeed;
  if (built.result.blueprint.provenance) {
    built.result.blueprint.provenance = {
      ...built.result.blueprint.provenance,
      seed: effectiveSeed,
      generatorId: SONG_ARCHITECT_ID,
      generatorVersion: SONG_ARCHITECT_VERSION,
      mutationId:
        "song:" +
        source.mode +
        ":" +
        request.shape,
      style: {
        ...built.result.blueprint.provenance.style,
      },
      intent: {
        ...built.result.blueprint.provenance.intent,
      },
    };
  }

  return {
    id:
      "song-candidate-" +
      shortSeed(
        [
          effectiveSeed,
          source.mode,
          request.shape,
          built.totalTicks,
        ].join("|"),
      ),
    seed: effectiveSeed,
    displaySeed,
    shape: request.shape,
    sourceMode: source.mode,
    sourceRefId: source.sourceRefId,
    family: source.family,
    result: built.result,
    occurrences: built.occurrences,
    totalTicks: built.totalTicks,
    lockedSectionIndexes: [...lockedIndexes].sort((a, b) => a - b),
  };
}
