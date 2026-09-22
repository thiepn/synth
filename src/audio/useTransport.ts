import { useEffect, useSyncExternalStore } from "react";
import {
  audioTransport,
  type TransportSnapshot,
} from "./AudioTransport";

export function useTransportSnapshot(): TransportSnapshot {
  return useSyncExternalStore(
    audioTransport.subscribe,
    audioTransport.getSnapshot,
    audioTransport.getSnapshot,
  );
}

export function useTransportLifecycle(
  toggleOverride?: () => void,
): void {
  useEffect(() => {
    const recover = () => {
      if (!document.hidden) {
        void audioTransport.recoverIfNeeded();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.matches("input, textarea, select, button, [role='slider']"))
      ) {
        return;
      }

      event.preventDefault();
      if (toggleOverride) {
        toggleOverride();
      } else {
        void audioTransport.toggle();
      }
    };

    document.addEventListener("visibilitychange", recover);
    window.addEventListener("pageshow", recover);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("visibilitychange", recover);
      window.removeEventListener("pageshow", recover);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [toggleOverride]);
}
