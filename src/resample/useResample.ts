import { useStoreSnapshot } from "../ui/store/useStoreSnapshot";
import {
  resampleStore,
  type ResampleSnapshot,
} from "./ResampleStore";

export function useResampleSnapshot(): ResampleSnapshot {
  return useStoreSnapshot(resampleStore);
}
