import { useStoreSnapshot } from "../ui/store/useStoreSnapshot";
import {
  arrangementFoundationStore,
  type ArrangementFoundationSnapshot,
} from "./ArrangementFoundationStore";

export function useArrangementFoundationSnapshot():
  ArrangementFoundationSnapshot {
  return useStoreSnapshot(arrangementFoundationStore);
}
