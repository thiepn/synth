import { useStoreSnapshot } from "../ui/store/useStoreSnapshot";
import {
  arrangementStore,
  type ArrangementSnapshot,
} from "./ArrangementStore";
import {
  arrangementPlaybackStore,
  type ArrangementPlaybackSnapshot,
} from "./ArrangementPlaybackStore";

export function useArrangementSnapshot(): ArrangementSnapshot {
  return useStoreSnapshot(arrangementStore);
}

export function useArrangementPlaybackSnapshot():
  ArrangementPlaybackSnapshot {
  return useStoreSnapshot(arrangementPlaybackStore);
}
