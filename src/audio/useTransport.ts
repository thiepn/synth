import { useEffect } from "react";
import { useStoreSnapshot } from "../ui/store/useStoreSnapshot";
import { eventTargetConsumesKeyboard } from "../input/domInputGuards";
import {
  audioTransport,
  type TransportSnapshot,
} from "./AudioTransport";

export function useTransportSnapshot(): TransportSnapshot {
  return useStoreSnapshot(audioTransport);
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

      if (eventTargetConsumesKeyboard(event.target)) {
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
