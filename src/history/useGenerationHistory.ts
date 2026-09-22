import { useSyncExternalStore } from "react";
import {
  generationHistoryStore,
  type GenerationHistorySnapshot,
} from "./GenerationHistoryStore";

export function useGenerationHistorySnapshot(): GenerationHistorySnapshot {
  return useSyncExternalStore(
    generationHistoryStore.subscribe,
    generationHistoryStore.getSnapshot,
    generationHistoryStore.getSnapshot,
  );
}
