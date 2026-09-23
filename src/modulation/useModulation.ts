import { useStoreSnapshot } from "../ui/store/useStoreSnapshot";
import {
  modulationStore,
  type ModulationSnapshot,
} from "./ModulationStore";

export function useModulationSnapshot(): ModulationSnapshot {
  return useStoreSnapshot(modulationStore);
}
