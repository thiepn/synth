import type {
  ArrangementBlueprint,
  ArrangementShapeId,
  BeatFamily,
  BeatFamilyRole,
  GenerationProvenance,
  Pattern,
  Scene,
  SceneRole,
  SectionBlueprint,
  StyleVector,
} from "../domain/contracts";
import type { BeatFamilyPattern } from "./beatFamilyGenerator";
import {
  SeededRandom,
  deriveSeed,
  shortSeed,
} from "./prng";

export const SCENE_SECTION_GENERATOR_ID = "scene-section-generator";
export const SCENE_SECTION_GENERATOR_VERSION = 1;

export interface SceneSectionGenerationRequest {
  family: BeatFamily;
  patterns: readonly BeatFamilyPattern[];
  shape: ArrangementShapeId;
  seed: string;
}

export interface SceneSectionGenerationResult {
  blueprint: ArrangementBlueprint;
  displaySeed: string;
  sectionCount: number;
  totalTicks: number;
  coherenceScore: number;
  valid: boolean;
  reasons: string[];
}

interface SectionTemplate {
  role: SceneRole;
  label: string;
  cycles: number;
  energyStart: number;
  energyEnd: number;
  fill?: "fill1" | "fill2";
  transition?: boolean;
}

const COMPACT: readonly SectionTemplate[] = [
  { role: "intro", label: "INTRO", cycles: 2, energyStart: 0.18, energyEnd: 0.34, transition: true },
  { role: "verse", label: "VERSE", cycles: 4, energyStart: 0.42, energyEnd: 0.54, fill: "fill1" },
  { role: "chorus", label: "CHORUS", cycles: 4, energyStart: 0.78, energyEnd: 0.88, fill: "fill2" },
  { role: "breakdown", label: "BREAKDOWN", cycles: 2, energyStart: 0.32, energyEnd: 0.24, transition: true },
  { role: "build", label: "BUILD", cycles: 2, energyStart: 0.56, energyEnd: 0.82, fill: "fill2", transition: true },
  { role: "drop", label: "DROP", cycles: 4, energyStart: 0.92, energyEnd: 0.96, fill: "fill2" },
  { role: "outro", label: "OUTRO", cycles: 2, energyStart: 0.4, energyEnd: 0.16, transition: true },
];

const STANDARD: readonly SectionTemplate[] = [
  { role: "intro", label: "INTRO", cycles: 2, energyStart: 0.16, energyEnd: 0.34, transition: true },
  { role: "verse", label: "VERSE 1", cycles: 4, energyStart: 0.42, energyEnd: 0.54, fill: "fill1" },
  { role: "preChorus", label: "PRE-CHORUS 1", cycles: 2, energyStart: 0.58, energyEnd: 0.74, fill: "fill1", transition: true },
  { role: "chorus", label: "CHORUS 1", cycles: 4, energyStart: 0.8, energyEnd: 0.9, fill: "fill2" },
  { role: "verse", label: "VERSE 2", cycles: 4, energyStart: 0.48, energyEnd: 0.6, fill: "fill1" },
  { role: "preChorus", label: "PRE-CHORUS 2", cycles: 2, energyStart: 0.62, energyEnd: 0.78, fill: "fill2", transition: true },
  { role: "chorus", label: "CHORUS 2", cycles: 4, energyStart: 0.84, energyEnd: 0.92, fill: "fill2" },
  { role: "breakdown", label: "BREAKDOWN", cycles: 2, energyStart: 0.34, energyEnd: 0.22, transition: true },
  { role: "build", label: "BUILD", cycles: 2, energyStart: 0.52, energyEnd: 0.86, fill: "fill2", transition: true },
  { role: "drop", label: "DROP", cycles: 4, energyStart: 0.94, energyEnd: 0.98, fill: "fill2" },
  { role: "outro", label: "OUTRO", cycles: 2, energyStart: 0.42, energyEnd: 0.14, transition: true },
];

const EXTENDED: readonly SectionTemplate[] = [
  { role: "intro", label: "INTRO", cycles: 4, energyStart: 0.12, energyEnd: 0.34, transition: true },
  { role: "verse", label: "VERSE 1", cycles: 8, energyStart: 0.4, energyEnd: 0.56, fill: "fill1" },
  { role: "preChorus", label: "PRE-CHORUS 1", cycles: 4, energyStart: 0.58, energyEnd: 0.76, fill: "fill1", transition: true },
  { role: "chorus", label: "CHORUS 1", cycles: 8, energyStart: 0.8, energyEnd: 0.91, fill: "fill2" },
  { role: "verse", label: "VERSE 2", cycles: 8, energyStart: 0.45, energyEnd: 0.62, fill: "fill1" },
  { role: "preChorus", label: "PRE-CHORUS 2", cycles: 4, energyStart: 0.62, energyEnd: 0.8, fill: "fill2", transition: true },
  { role: "chorus", label: "CHORUS 2", cycles: 8, energyStart: 0.84, energyEnd: 0.93, fill: "fill2" },
  { role: "breakdown", label: "BREAKDOWN", cycles: 4, energyStart: 0.36, energyEnd: 0.2, transition: true },
  { role: "build", label: "BUILD", cycles: 4, energyStart: 0.48, energyEnd: 0.88, fill: "fill2", transition: true },
  { role: "drop", label: "DROP", cycles: 8, energyStart: 0.95, energyEnd: 0.99, fill: "fill2" },
  { role: "chorus", label: "FINAL CHORUS", cycles: 8, energyStart: 0.88, energyEnd: 0.96, fill: "fill2" },
  { role: "outro", label: "OUTRO", cycles: 4, energyStart: 0.44, energyEnd: 0.1, transition: true },
];

const SCENE_ROLES: readonly SceneRole[] = [
  "intro",
  "verse",
  "preChorus",
  "chorus",
  "breakdown",
  "build",
  "drop",
  "outro",
];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function templates(shape: ArrangementShapeId): readonly SectionTemplate[] {
  switch (shape) {
    case "compact":
      return COMPACT;
    case "extended":
      return EXTENDED;
    case "standard":
    default:
      return STANDARD;
  }
}

function patternEntry(
  patterns: readonly BeatFamilyPattern[],
  role: BeatFamilyRole,
): BeatFamilyPattern {
  return (
    patterns.find((entry) => entry.role === role) ??
    patterns.find((entry) => entry.role === "core") ??
    patterns[0]
  );
}

function roleCandidates(role: SceneRole): readonly BeatFamilyRole[] {
  switch (role) {
    case "intro":
      return ["breakdown", "core", "aVariation"];
    case "verse":
      return ["core", "aVariation", "bVariation"];
    case "preChorus":
      return ["aVariation", "build", "core"];
    case "chorus":
      return ["drop", "bVariation", "aVariation"];
    case "breakdown":
      return ["breakdown", "aVariation", "core"];
    case "build":
      return ["build", "aVariation", "fill1"];
    case "drop":
      return ["drop", "bVariation", "core"];
    case "outro":
      return ["breakdown", "core", "aVariation"];
  }
}

function sceneEnergy(role: SceneRole): number {
  switch (role) {
    case "intro": return 0.28;
    case "verse": return 0.5;
    case "preChorus": return 0.68;
    case "chorus": return 0.86;
    case "breakdown": return 0.26;
    case "build": return 0.74;
    case "drop": return 0.96;
    case "outro": return 0.22;
  }
}

function choosePatternRole(
  role: SceneRole,
  cycle: number,
  random: SeededRandom,
): BeatFamilyRole {
  const candidates = roleCandidates(role);

  if (role === "build" && cycle > 0) return "build";
  if (role === "drop" && cycle % 2 === 0) return "drop";
  if (role === "chorus" && cycle % 2 === 0) return "drop";
  if (role === "breakdown" && cycle === 0) return "breakdown";
  if (role === "intro" && cycle === 0) return "breakdown";
  if (role === "outro" && cycle > 0) return "breakdown";

  const index = random.int(0, candidates.length - 1);
  return candidates[index];
}

function sumPatternTicks(
  patternIds: readonly string[],
  patternById: Map<string, Pattern>,
): number {
  return patternIds.reduce(
    (sum, patternId) =>
      sum + (patternById.get(patternId)?.lengthTicks ?? 0),
    0,
  );
}

function styleVector(family: BeatFamily): StyleVector {
  return family.provenance?.style
    ? { ...family.provenance.style }
    : { arrangement: 1 };
}

function provenance(
  family: BeatFamily,
  seed: string,
  shape: ArrangementShapeId,
): GenerationProvenance {
  const baseIntent = family.provenance?.intent;

  return {
    seed,
    generatorId: SCENE_SECTION_GENERATOR_ID,
    generatorVersion: SCENE_SECTION_GENERATOR_VERSION,
    sourceEntityId: family.id,
    mutationId: "arrange-foundation:" + shape,
    familyId: family.id,
    style: styleVector(family),
    intent: baseIntent
      ? { ...baseIntent }
      : {
          energy: 0.65,
          density: 0.5,
          complexity: 0.5,
          syncopation: 0.5,
          space: 0.5,
          swing: 0,
          humanization: 0,
          mutationDistance: 0,
        },
  };
}

function buildScenes(
  patterns: readonly BeatFamilyPattern[],
  seed: string,
  shape: ArrangementShapeId,
): Scene[] {
  const transition = patternEntry(patterns, "transition").pattern.id;
  const fill1 = patternEntry(patterns, "fill1").pattern.id;
  const fill2 = patternEntry(patterns, "fill2").pattern.id;

  return SCENE_ROLES.map((role) => {
    const candidates = roleCandidates(role).map(
      (candidate) => patternEntry(patterns, candidate).pattern.id,
    );
    const sceneSeed = deriveSeed(seed, "scene:" + role);

    return {
      id: "scene-" + role + "-" + shortSeed(sceneSeed),
      name:
        role === "preChorus"
          ? "PRE-CHORUS"
          : role.toUpperCase(),
      role,
      familyId: family.id,
      patternIds: [...new Set(candidates)],
      fillPatternId:
        role === "chorus" || role === "drop" || role === "build"
          ? fill2
          : role === "verse" || role === "preChorus"
            ? fill1
            : undefined,
      transitionPatternId:
        role === "intro" ||
        role === "preChorus" ||
        role === "breakdown" ||
        role === "build" ||
        role === "outro"
          ? transition
          : undefined,
      energy: sceneEnergy(role),
      provenance: provenance(
        family,
        sceneSeed,
        shape,
      ),
    };
  });
}

function buildSection(
  template: SectionTemplate,
  index: number,
  startTick: number,
  family: BeatFamily,
  patterns: readonly BeatFamilyPattern[],
  scenesByRole: Map<SceneRole, Scene>,
  patternById: Map<string, Pattern>,
  effectiveSeed: string,
): SectionBlueprint {
  const random = new SeededRandom(
    deriveSeed(
      effectiveSeed,
      "section:" + index + ":" + template.role,
    ),
  );
  const sequence: string[] = [];

  for (let cycle = 0; cycle < template.cycles; cycle += 1) {
    const role = choosePatternRole(
      template.role,
      cycle,
      random,
    );
    sequence.push(patternEntry(patterns, role).pattern.id);
  }

  const fillPatternId = template.fill
    ? patternEntry(patterns, template.fill).pattern.id
    : undefined;
  const transitionPatternId = template.transition
    ? patternEntry(patterns, "transition").pattern.id
    : undefined;

  if (fillPatternId && sequence.length > 1) {
    sequence[sequence.length - 1] = fillPatternId;
  }

  const scene = scenesByRole.get(template.role);
  if (!scene) {
    throw new Error("Missing generated Scene for " + template.role);
  }

  const lengthTicks = sumPatternTicks(sequence, patternById);

  return {
    id:
      "section-" +
      String(index).padStart(2, "0") +
      "-" +
      shortSeed(deriveSeed(effectiveSeed, template.label)),
    label: template.label,
    role: template.role,
    sceneId: scene.id,
    patternSequence: sequence,
    cycleCount: sequence.length,
    startTick,
    lengthTicks,
    energyStart: clamp01(template.energyStart),
    energyEnd: clamp01(template.energyEnd),
    fillPatternId,
    transitionPatternId,
  };
}

function validateBlueprint(
  blueprint: ArrangementBlueprint,
  patternIds: ReadonlySet<string>,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 100;
  let expectedStart = 0;

  for (const section of blueprint.sections) {
    if (section.startTick !== expectedStart) {
      reasons.push("section timeline contains a gap or overlap");
      score -= 20;
    }
    if (section.lengthTicks <= 0) {
      reasons.push("section has zero duration");
      score -= 25;
    }
    if (
      section.patternSequence.some(
        (patternId) => !patternIds.has(patternId),
      )
    ) {
      reasons.push("section references a Pattern outside the Beat Family");
      score -= 25;
    }
    expectedStart += section.lengthTicks;
  }

  const energies = new Map(
    blueprint.scenes.map((scene) => [scene.role, scene.energy]),
  );
  if (
    (energies.get("chorus") ?? 0) <=
    (energies.get("verse") ?? 1)
  ) {
    reasons.push("chorus scene is not more energetic than verse");
    score -= 10;
  }
  if (
    (energies.get("drop") ?? 0) <=
    (energies.get("build") ?? 1)
  ) {
    reasons.push("drop scene is not more energetic than build");
    score -= 10;
  }
  if (
    (energies.get("breakdown") ?? 1) >=
    (energies.get("build") ?? 0)
  ) {
    reasons.push("breakdown scene is not lower energy than build");
    score -= 10;
  }

  const roles = new Set(
    blueprint.sections.map((section) => section.role),
  );
  for (const required of ["verse", "chorus", "build", "drop"] as const) {
    if (!roles.has(required)) {
      reasons.push("missing required section role: " + required);
      score -= 12;
    }
  }

  return {
    score: Math.max(0, Math.round(score)),
    reasons: [...new Set(reasons)],
  };
}

export function generateSceneSectionBlueprint(
  request: SceneSectionGenerationRequest,
): SceneSectionGenerationResult {
  if (request.patterns.length === 0) {
    throw new Error("Generate a Beat Family before creating section scenes.");
  }

  const effectiveSeed = deriveSeed(
    request.seed,
    request.family.id +
      ":" +
      request.shape +
      ":v" +
      SCENE_SECTION_GENERATOR_VERSION,
  );
  const patterns = request.patterns.map((entry) => ({
    ...entry,
    pattern: entry.pattern,
  }));
  const patternById = new Map(
    patterns.map((entry) => [
      entry.pattern.id,
      entry.pattern,
    ]),
  );
  const scenes = buildScenes(
    request.family,
    patterns,
    effectiveSeed,
    request.shape,
  );
  const scenesByRole = new Map(
    scenes.map((scene) => [scene.role!, scene]),
  );

  let cursor = 0;
  const sections: SectionBlueprint[] = templates(request.shape).map(
    (template, index) => {
      const section = buildSection(
        template,
        index,
        cursor,
        patterns,
        scenesByRole,
        patternById,
        effectiveSeed,
      );
      cursor += section.lengthTicks;
      return section;
    },
  );

  const blueprint: ArrangementBlueprint = {
    id:
      "arrange-blueprint-" +
      request.shape +
      "-" +
      shortSeed(effectiveSeed),
    name:
      request.shape.toUpperCase() +
      " / " +
      shortSeed(effectiveSeed),
    familyId: request.family.id,
    shape: request.shape,
    scenes,
    sections,
    provenance: provenance(
      request.family,
      effectiveSeed,
      request.shape,
    ),
  };

  const validation = validateBlueprint(
    blueprint,
    new Set(patterns.map((entry) => entry.pattern.id)),
  );

  return {
    blueprint,
    displaySeed: shortSeed(effectiveSeed),
    sectionCount: sections.length,
    totalTicks: cursor,
    coherenceScore: validation.score,
    valid: validation.score >= 72,
    reasons: validation.reasons,
  };
}

export const SCENE_SECTION_GENERATOR_META = Object.freeze({
  generatorId: SCENE_SECTION_GENERATOR_ID,
  generatorVersion: SCENE_SECTION_GENERATOR_VERSION,
  shapes: ["compact", "standard", "extended"] as const,
});
