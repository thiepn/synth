import { useSyncExternalStore } from "react";
import {
  drumSoundStore,
  type DrumSoundSnapshot,
} from "./drumSoundModel";

export function useDrumSoundSnapshot(): DrumSoundSnapshot {
  return useSyncExternalStore(
    drumSoundStore.subscribe,
    drumSoundStore.getSnapshot,
    drumSoundStore.getSnapshot,
  );
}
