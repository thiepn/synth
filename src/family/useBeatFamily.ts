import { useStoreSnapshot } from "../ui/store/useStoreSnapshot";
import {
  beatFamilyStore,
  type BeatFamilySnapshot,
} from "./BeatFamilyStore";

export function useBeatFamilySnapshot(): BeatFamilySnapshot {
  return useStoreSnapshot(beatFamilyStore);
}
