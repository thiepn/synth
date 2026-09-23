import { useStoreSnapshot } from "../ui/store/useStoreSnapshot";
import {
  mixerStore,
  type MixerSnapshot,
} from "./MixerStore";

export function useMixerSnapshot(): MixerSnapshot {
  return useStoreSnapshot(mixerStore);
}
