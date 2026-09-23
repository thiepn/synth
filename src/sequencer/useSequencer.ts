import { useStoreSnapshot } from "../ui/store/useStoreSnapshot";
import {
  sequencerStore,
  type SequencerSnapshot,
} from "./SequencerStore";

export function useSequencerSnapshot(): SequencerSnapshot {
  return useStoreSnapshot(sequencerStore);
}
