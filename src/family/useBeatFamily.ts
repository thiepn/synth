import { useSyncExternalStore } from "react";
import {
  beatFamilyStore,
  type BeatFamilySnapshot,
} from "./BeatFamilyStore";

export function useBeatFamilySnapshot(): BeatFamilySnapshot {
  return useSyncExternalStore(
    beatFamilyStore.subscribe,
    beatFamilyStore.getSnapshot,
    beatFamilyStore.getSnapshot,
  );
}
