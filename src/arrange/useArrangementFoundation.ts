import { useSyncExternalStore } from "react";
import {
  arrangementFoundationStore,
  type ArrangementFoundationSnapshot,
} from "./ArrangementFoundationStore";

export function useArrangementFoundationSnapshot():
  ArrangementFoundationSnapshot {
  return useSyncExternalStore(
    arrangementFoundationStore.subscribe,
    arrangementFoundationStore.getSnapshot,
    arrangementFoundationStore.getSnapshot,
  );
}
