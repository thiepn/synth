import { useSyncExternalStore } from "react";
import {
  beatMorphStore,
  type BeatMorphSnapshot,
} from "./BeatMorphStore";

export function useBeatMorphSnapshot(): BeatMorphSnapshot {
  return useSyncExternalStore(
    beatMorphStore.subscribe,
    beatMorphStore.getSnapshot,
    beatMorphStore.getSnapshot,
  );
}
