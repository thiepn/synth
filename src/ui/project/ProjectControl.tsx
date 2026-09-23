import {
  useEffect,
  useRef,
  useState,
} from "react";
import { projectStore } from "../../project/ProjectStore";
import { useProjectSnapshot } from "../../project/useProject";
import { MachineButton } from "../pulse/Primitives";

function timeLabel(value: string | undefined): string {
  if (!value) return "NOT SAVED";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "SAVED";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function statusLabel(
  status: ReturnType<typeof useProjectSnapshot>["saveStatus"],
): string {
  switch (status) {
    case "loading":
      return "LOADING";
    case "saving":
      return "SAVING";
    case "dirty":
      return "UNSAVED";
    case "clean":
      return "SAVED";
    case "error":
      return "SAVE ERROR";
    case "unsupported":
      return "SESSION ONLY";
    case "uninitialized":
    default:
      return "STARTING";
  }
}

export function ProjectControl() {
  const project = useProjectSnapshot();
  const [open, setOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(project.name);
  const [copyName, setCopyName] = useState(project.name + " Copy");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNameDraft(project.name);
    setCopyName(project.name + " Copy");
  }, [project.projectId, project.name]);

  useEffect(() => {
    if (!open) return;

    const close = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !rootRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const commitName = () => {
    projectStore.rename(nameDraft);
    setNameDraft(projectStore.getSnapshot().name);
  };

  const saveCopy = async () => {
    const id = await projectStore.saveAsNew(copyName);
    if (id) {
      setOpen(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className={
        open
          ? "project-control is-open"
          : "project-control"
      }
    >
      <button
        type="button"
        className="project-readout project-readout--interactive"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span>
          PROJECT / {statusLabel(project.saveStatus)}
        </span>
        <strong>{project.name}</strong>
      </button>

      {open ? (
        <div
          className="project-popover"
          role="dialog"
          aria-label="Project controls"
        >
          <div className="project-popover__status">
            <span>
              {project.supported
                ? statusLabel(project.saveStatus)
                : "LOCAL STORAGE UNAVAILABLE"}
            </span>
            <strong>
              {project.dirty
                ? "CHANGES PENDING"
                : timeLabel(project.lastSavedAt)}
            </strong>
          </div>

          <label className="project-name-editor">
            <span>PROJECT NAME</span>
            <input
              value={nameDraft}
              maxLength={80}
              disabled={!project.initialized}
              onChange={(event) =>
                setNameDraft(event.currentTarget.value)
              }
              onBlur={commitName}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitName();
                  event.currentTarget.blur();
                }
              }}
            />
          </label>

          <div className="project-primary-actions">
            <MachineButton
              compact
              disabled={
                !project.initialized ||
                !project.supported ||
                project.saveStatus === "saving"
              }
              onClick={() => void projectStore.saveNow()}
            >
              SAVE NOW
            </MachineButton>
          </div>

          <div className="project-copy">
            <span>SAVE CURRENT STATE AS NEW PROJECT</span>
            <div>
              <input
                value={copyName}
                maxLength={80}
                disabled={!project.initialized || !project.supported}
                onChange={(event) =>
                  setCopyName(event.currentTarget.value)
                }
              />
              <MachineButton
                compact
                disabled={
                  !project.initialized ||
                  !project.supported ||
                  project.saveStatus === "saving"
                }
                onClick={() => void saveCopy()}
              >
                SAVE AS
              </MachineButton>
            </div>
          </div>

          <div className="project-existing">
            <div className="project-popover__subhead">
              <span>LOCAL PROJECTS</span>
              <strong>{project.summaries.length}</strong>
            </div>

            {project.summaries.length > 0 ? (
              <div className="project-list">
                {project.summaries.map((summary) => {
                  const active = summary.id === project.projectId;
                  return (
                    <button
                      type="button"
                      key={summary.id}
                      className={active ? "is-active" : undefined}
                      disabled={active || project.saveStatus === "saving"}
                      onClick={() =>
                        void projectStore
                          .openProject(summary.id)
                          .then((ok) => {
                            if (ok) setOpen(false);
                          })
                      }
                    >
                      <span>{summary.name}</span>
                      <small>
                        REV {summary.revision}
                        {" · "}
                        {summary.assetCount} ASSETS
                      </small>
                      <b>{active ? "ACTIVE" : "OPEN"}</b>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p>NO SAVED PROJECTS</p>
            )}
          </div>

          {project.lastError ? (
            <p className="project-error" aria-live="polite">
              {project.lastError}
            </p>
          ) : null}

          <p className="project-storage-note">
            Projects and referenced audio are stored locally in this browser.
            External backup/version-history tooling is intentionally separate.
          </p>
        </div>
      ) : null}
    </div>
  );
}
