import { useStoreSnapshot } from "../ui/store/useStoreSnapshot";
import {
  drumSoundStore,
  type DrumSoundSnapshot,
} from "./drumSoundModel";

export function useDrumSoundSnapshot(): DrumSoundSnapshot {
  return useStoreSnapshot(drumSoundStore);
}
