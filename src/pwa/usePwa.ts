import { useSyncExternalStore } from "react";
import {
  pwaStore,
  type PwaSnapshot,
} from "./PwaStore";

export function usePwaSnapshot(): PwaSnapshot {
  return useSyncExternalStore(
    pwaStore.subscribe,
    pwaStore.getSnapshot,
    pwaStore.getSnapshot,
  );
}
