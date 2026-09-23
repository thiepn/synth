import { useStoreSnapshot } from "../ui/store/useStoreSnapshot";
import {
  drumEngine,
  type DrumEngineSnapshot,
} from "./DrumEngine";

export function useDrumEngineSnapshot(): DrumEngineSnapshot {
  return useStoreSnapshot(drumEngine);
}
