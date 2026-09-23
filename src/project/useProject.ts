import { useSyncExternalStore } from "react";
import {
  projectStore,
  type ProjectSnapshot,
} from "./ProjectStore";

export function useProjectSnapshot(): ProjectSnapshot {
  return useSyncExternalStore(
    projectStore.subscribe,
    projectStore.getSnapshot,
    projectStore.getSnapshot,
  );
}
