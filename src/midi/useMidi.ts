import { useSyncExternalStore } from "react";
import {
  midiStore,
  type MidiSnapshot,
} from "./MidiStore";

export function useMidiSnapshot(): MidiSnapshot {
  return useSyncExternalStore(
    midiStore.subscribe,
    midiStore.getSnapshot,
    midiStore.getSnapshot,
  );
}
