import { useSyncExternalStore } from "react";
import {
  mixerStore,
  type MixerSnapshot,
} from "./MixerStore";

export function useMixerSnapshot(): MixerSnapshot {
  return useSyncExternalStore(
    mixerStore.subscribe,
    mixerStore.getSnapshot,
    mixerStore.getSnapshot,
  );
}
