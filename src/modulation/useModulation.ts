import { useSyncExternalStore } from "react";
import {
  modulationStore,
  type ModulationSnapshot,
} from "./ModulationStore";

export function useModulationSnapshot(): ModulationSnapshot {
  return useSyncExternalStore(
    modulationStore.subscribe,
    modulationStore.getSnapshot,
    modulationStore.getSnapshot,
  );
}
