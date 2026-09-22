import { useSyncExternalStore } from "react";
import {
  sampleAssetStore,
  type SampleAssetSnapshot,
} from "./SampleAssetStore";

export function useSampleAssetSnapshot(): SampleAssetSnapshot {
  return useSyncExternalStore(
    sampleAssetStore.subscribe,
    sampleAssetStore.getSnapshot,
    sampleAssetStore.getSnapshot,
  );
}
