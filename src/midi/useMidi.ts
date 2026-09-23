import { useStoreSnapshot } from "../ui/store/useStoreSnapshot";
import {
  midiStore,
  type MidiSnapshot,
} from "./MidiStore";

export function useMidiSnapshot(): MidiSnapshot {
  return useStoreSnapshot(midiStore);
}
