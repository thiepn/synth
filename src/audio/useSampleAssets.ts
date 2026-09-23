import { useStoreSnapshot } from "../ui/store/useStoreSnapshot";
import {
  sampleAssetStore,
  type SampleAssetSnapshot,
} from "./SampleAssetStore";

export function useSampleAssetSnapshot(): SampleAssetSnapshot {
  return useStoreSnapshot(sampleAssetStore);
}
