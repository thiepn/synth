import {
  useEffect,
  useRef,
  useState,
} from "react";
import { projectStore } from "../../project/ProjectStore";
import { useProjectSnapshot } from "../../project/useProject";
import { pwaStore } from "../../pwa/PwaStore";
import { usePwaSnapshot } from "../../pwa/usePwa";

export function PwaControl() {
  const pwa = usePwaSnapshot();
  const project = useProjectSnapshot();
  const [helpOpen, setHelpOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!helpOpen) return;

    const close = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !rootRef.current?.contains(target)
      ) {
        setHelpOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setHelpOpen(false);
      window.requestAnimationFrame(() => {
        triggerRef.current?.focus();
      });
    };

    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [helpOpen]);

  const applyUpdate = async () => {
    if (project.saveStatus === "conflict") return;

    if (project.dirty) {
      try {
        await projectStore.saveNow();
      } catch {
        return;
      }
    }

    pwaStore.applyUpdate();
  };

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
    const blocked =
      project.saveStatus === "conflict" ||
      pwa.applyingUpdate;

    return (
      <button
        type="button"
        className="pwa-control is-update"
        disabled={blocked}
        title={
          project.saveStatus === "conflict"
            ? "Resolve the project save conflict before updating."
            : "Save the current project and apply the new Synth version."
        }
        onClick={() => void applyUpdate()}
      >
        {project.saveStatus === "conflict"
          ? "SAVE FIRST"
          : pwa.applyingUpdate
            ? "UPDATING…"
            : "UPDATE"}
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
    <div
      ref={rootRef}
      className="pwa-control-shell"
    >
      <button
        ref={triggerRef}
        type="button"
        className="pwa-control"
        onClick={() => setHelpOpen((value) => !value)}
        title={"Build " + pwa.buildId}
        aria-expanded={helpOpen}
      >
        WEB
      </button>

      {helpOpen ? (
        <div
          className="pwa-install-help"
          role="dialog"
          aria-label="Install Synth"
        >
          <strong>INSTALL SYNTH</strong>
          <span>
            If your browser does not show an install button, use its menu.
          </span>
          <span>
            iPhone / iPad: Share → Add to Home Screen.
          </span>
          <span>
            Android / desktop: browser menu → Install app or Add to Home
            screen.
          </span>
          <button
            type="button"
            onClick={() => void pwaStore.checkForUpdate()}
          >
            CHECK FOR UPDATE
          </button>
        </div>
      ) : null}
    </div>
  );
}
