import type { BeatFamily } from "./contracts";
import {
  cloneGenerationProvenance,
} from "./patternClone";

export function cloneBeatFamily(
  family: BeatFamily,
): BeatFamily {
  return {
    ...family,
    members: family.members.map(
      (member) => ({ ...member }),
    ),
    provenance: cloneGenerationProvenance(
      family.provenance,
    ),
  };
}
