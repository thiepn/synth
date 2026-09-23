import { useSyncExternalStore } from "react";
import {
  evolutionStore,
  type EvolutionSnapshot,
} from "./EvolutionStore";

export function useEvolutionSnapshot(): EvolutionSnapshot {
  return useSyncExternalStore(
    evolutionStore.subscribe,
    evolutionStore.getSnapshot,
    evolutionStore.getSnapshot,
  );
}
