import { pwaStore } from "../../pwa/PwaStore";
import { usePwaSnapshot } from "../../pwa/usePwa";

export function PwaControl() {
  const pwa = usePwaSnapshot();

  if (!pwa.initialized) {
    return (
      <span className="pwa-control pwa-control--status">
        PWA…
      </span>
    );
  }

  if (!pwa.supported) {
    return null;
  }

  if (pwa.updateAvailable) {
    return (
      <button
        type="button"
        className="pwa-control is-update"
        disabled={pwa.applyingUpdate}
        onClick={() => pwaStore.applyUpdate()}
      >
        {pwa.applyingUpdate ? "UPDATING…" : "UPDATE"}
      </button>
    );
  }

  if (!pwa.online) {
    return (
      <span className="pwa-control pwa-control--status is-offline">
        OFFLINE
      </span>
    );
  }

  if (pwa.installAvailable) {
    return (
      <button
        type="button"
        className="pwa-control is-install"
        onClick={() => void pwaStore.install()}
      >
        INSTALL
      </button>
    );
  }

  if (pwa.installed) {
    return (
      <span className="pwa-control pwa-control--status is-installed">
        APP
      </span>
    );
  }

  return (
    <button
      type="button"
      className="pwa-control"
      onClick={() => void pwaStore.checkForUpdate()}
      title={"Build " + pwa.buildId}
    >
      WEB
    </button>
  );
}
