import { useSyncExternalStore } from "react";
import {
  performanceStore,
  type PerformanceSnapshot,
} from "./PerformanceStore";

export function usePerformanceSnapshot(): PerformanceSnapshot {
  return useSyncExternalStore(
    performanceStore.subscribe,
    performanceStore.getSnapshot,
    performanceStore.getSnapshot,
  );
}
