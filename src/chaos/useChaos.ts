import { useSyncExternalStore } from "react";
import { chaosStore } from "./ChaosStore";

export function useChaosSnapshot() {
  return useSyncExternalStore(
    chaosStore.subscribe,
    chaosStore.getSnapshot,
    chaosStore.getSnapshot,
  );
}
