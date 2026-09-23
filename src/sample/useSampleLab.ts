import { useSyncExternalStore } from "react";
import {
  sampleLabStore,
  type SampleLabSnapshot,
} from "./SampleLabStore";

export function useSampleLabSnapshot(): SampleLabSnapshot {
  return useSyncExternalStore(
    sampleLabStore.subscribe,
    sampleLabStore.getSnapshot,
    sampleLabStore.getSnapshot,
  );
}
