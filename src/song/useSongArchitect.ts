import { useSyncExternalStore } from "react";
import {
  songArchitectStore,
  type SongArchitectSnapshot,
} from "./SongArchitectStore";

export function useSongArchitectSnapshot(): SongArchitectSnapshot {
  return useSyncExternalStore(
    songArchitectStore.subscribe,
    songArchitectStore.getSnapshot,
    songArchitectStore.getSnapshot,
  );
}
