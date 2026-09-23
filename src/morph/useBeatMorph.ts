import { useStoreSnapshot } from "../ui/store/useStoreSnapshot";
import {
  beatMorphStore,
  type BeatMorphSnapshot,
} from "./BeatMorphStore";

export function useBeatMorphSnapshot(): BeatMorphSnapshot {
  return useStoreSnapshot(beatMorphStore);
}
