import { useStoreSnapshot } from "../ui/store/useStoreSnapshot";
import {
  evolutionStore,
  type EvolutionSnapshot,
} from "./EvolutionStore";

export function useEvolutionSnapshot(): EvolutionSnapshot {
  return useStoreSnapshot(evolutionStore);
}
