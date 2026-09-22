import { useSyncExternalStore } from "react";
import {
  arrangementStore,
  type ArrangementSnapshot,
} from "./ArrangementStore";
import {
  arrangementPlaybackStore,
  type ArrangementPlaybackSnapshot,
} from "./ArrangementPlaybackStore";

export function useArrangementSnapshot(): ArrangementSnapshot {
  return useSyncExternalStore(
    arrangementStore.subscribe,
    arrangementStore.getSnapshot,
    arrangementStore.getSnapshot,
  );
}

export function useArrangementPlaybackSnapshot():
  ArrangementPlaybackSnapshot {
  return useSyncExternalStore(
    arrangementPlaybackStore.subscribe,
    arrangementPlaybackStore.getSnapshot,
    arrangementPlaybackStore.getSnapshot,
  );
}
