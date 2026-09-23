import { useSyncExternalStore } from "react";

export interface ExternalSnapshotStore<TSnapshot> {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => TSnapshot;
}

export function useStoreSnapshot<TSnapshot>(
  store: ExternalSnapshotStore<TSnapshot>,
): TSnapshot {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
