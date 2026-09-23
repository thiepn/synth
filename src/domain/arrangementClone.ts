import type {
  ArrangementBlueprint,
  Scene,
  SectionBlueprint,
} from "./contracts";
import {
  cloneGenerationProvenance,
} from "./patternClone";

export function cloneScene(
  scene: Scene,
): Scene {
  return {
    ...scene,
    patternIds: [...scene.patternIds],
    provenance: cloneGenerationProvenance(
      scene.provenance,
    ),
  };
}

export function cloneSectionBlueprint(
  section: SectionBlueprint,
): SectionBlueprint {
  return {
    ...section,
    patternSequence: [...section.patternSequence],
  };
}

export function cloneArrangementBlueprint(
  blueprint: ArrangementBlueprint,
): ArrangementBlueprint {
  return {
    ...blueprint,
    scenes: blueprint.scenes.map(cloneScene),
    sections: blueprint.sections.map(
      cloneSectionBlueprint,
    ),
    provenance: cloneGenerationProvenance(
      blueprint.provenance,
    ),
  };
}
