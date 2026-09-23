import { useStoreSnapshot } from "../ui/store/useStoreSnapshot";
import {
  freezeStore,
  type FreezeSnapshot,
} from "./FreezeStore";

export function useFreezeSnapshot(): FreezeSnapshot {
  return useStoreSnapshot(freezeStore);
}
