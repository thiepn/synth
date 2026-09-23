import { useStoreSnapshot } from "../ui/store/useStoreSnapshot";
import {
  performanceStore,
  type PerformanceSnapshot,
} from "./PerformanceStore";

export function usePerformanceSnapshot(): PerformanceSnapshot {
  return useStoreSnapshot(performanceStore);
}
