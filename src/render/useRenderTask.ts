import { useSyncExternalStore } from "react";
import {
  renderStore,
  type RenderTaskSnapshot,
} from "./RenderStore";

export function useRenderTaskSnapshot(): RenderTaskSnapshot {
  return useSyncExternalStore(
    renderStore.subscribe,
    renderStore.getSnapshot,
    renderStore.getSnapshot,
  );
}
