import { useSyncExternalStore } from "react";
import {
  drumEngine,
  type DrumEngineSnapshot,
} from "./DrumEngine";

export function useDrumEngineSnapshot(): DrumEngineSnapshot {
  return useSyncExternalStore(
    drumEngine.subscribe,
    drumEngine.getSnapshot,
    drumEngine.getSnapshot,
  );
}
