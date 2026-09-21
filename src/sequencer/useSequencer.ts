import { useSyncExternalStore } from "react";
import {
  sequencerStore,
  type SequencerSnapshot,
} from "./SequencerStore";

export function useSequencerSnapshot(): SequencerSnapshot {
  return useSyncExternalStore(
    sequencerStore.subscribe,
    sequencerStore.getSnapshot,
    sequencerStore.getSnapshot,
  );
}
