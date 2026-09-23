import { useSyncExternalStore } from "react";
import {
  freezeStore,
  type FreezeSnapshot,
} from "./FreezeStore";

export function useFreezeSnapshot(): FreezeSnapshot {
  return useSyncExternalStore(
    freezeStore.subscribe,
    freezeStore.getSnapshot,
    freezeStore.getSnapshot,
  );
}
