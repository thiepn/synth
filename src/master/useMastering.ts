import { useSyncExternalStore } from "react";
import {
  masteringStore,
  type MasteringSnapshot,
} from "./MasteringStore";

export function useMasteringSnapshot(): MasteringSnapshot {
  return useSyncExternalStore(
    masteringStore.subscribe,
    masteringStore.getSnapshot,
    masteringStore.getSnapshot,
  );
}
