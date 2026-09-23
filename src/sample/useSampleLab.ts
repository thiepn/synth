import { useStoreSnapshot } from "../ui/store/useStoreSnapshot";
import {
  sampleLabStore,
  type SampleLabSnapshot,
} from "./SampleLabStore";

export function useSampleLabSnapshot(): SampleLabSnapshot {
  return useStoreSnapshot(sampleLabStore);
}
