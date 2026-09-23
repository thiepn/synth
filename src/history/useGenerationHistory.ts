import { useStoreSnapshot } from "../ui/store/useStoreSnapshot";
import {
  generationHistoryStore,
  type GenerationHistorySnapshot,
} from "./GenerationHistoryStore";

export function useGenerationHistorySnapshot(): GenerationHistorySnapshot {
  return useStoreSnapshot(generationHistoryStore);
}
