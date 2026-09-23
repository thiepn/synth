import { useStoreSnapshot } from "../ui/store/useStoreSnapshot";
import {
  songArchitectStore,
  type SongArchitectSnapshot,
} from "./SongArchitectStore";

export function useSongArchitectSnapshot(): SongArchitectSnapshot {
  return useStoreSnapshot(songArchitectStore);
}
