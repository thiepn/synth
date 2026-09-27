import { useStoreSnapshot } from "../ui/store/useStoreSnapshot";
import {
  gridRecorder,
  type GridRecorderSnapshot,
} from "./GridRecorder";

export function useGridRecorderSnapshot(): GridRecorderSnapshot {
  return useStoreSnapshot(gridRecorder);
}
