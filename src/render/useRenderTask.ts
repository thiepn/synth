import { useStoreSnapshot } from "../ui/store/useStoreSnapshot";
import {
  renderStore,
  type RenderTaskSnapshot,
} from "./RenderStore";

export function useRenderTaskSnapshot(): RenderTaskSnapshot {
  return useStoreSnapshot(renderStore);
}
