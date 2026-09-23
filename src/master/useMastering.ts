import { useStoreSnapshot } from "../ui/store/useStoreSnapshot";
import {
  masteringStore,
  type MasteringSnapshot,
} from "./MasteringStore";

export function useMasteringSnapshot(): MasteringSnapshot {
  return useStoreSnapshot(masteringStore);
}
