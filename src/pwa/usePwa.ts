import { useStoreSnapshot } from "../ui/store/useStoreSnapshot";
import {
  pwaStore,
  type PwaSnapshot,
} from "./PwaStore";

export function usePwaSnapshot(): PwaSnapshot {
  return useStoreSnapshot(pwaStore);
}
