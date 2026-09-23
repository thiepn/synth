import { useSyncExternalStore } from "react";
import {
  resampleStore,
  type ResampleSnapshot,
} from "./ResampleStore";

export function useResampleSnapshot(): ResampleSnapshot {
  return useSyncExternalStore(
    resampleStore.subscribe,
    resampleStore.getSnapshot,
    resampleStore.getSnapshot,
  );
}
