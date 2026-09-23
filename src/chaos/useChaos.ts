import { useStoreSnapshot } from "../ui/store/useStoreSnapshot";
import {
  chaosStore
} from "./ChaosStore";

export function useChaosSnapshot() {
  return useStoreSnapshot(chaosStore);
}
