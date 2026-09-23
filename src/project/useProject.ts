import { useStoreSnapshot } from "../ui/store/useStoreSnapshot";
import {
  projectStore,
  type ProjectSnapshot,
} from "./ProjectStore";

export function useProjectSnapshot(): ProjectSnapshot {
  return useStoreSnapshot(projectStore);
}
