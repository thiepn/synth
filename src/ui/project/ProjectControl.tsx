import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { projectStore } from "../../project/ProjectStore";
import { useProjectSnapshot } from "../../project/useProject";
import { triggerBlobDownload } from "../../render/wavEncoder";
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
    case "conflict":
      return "CONFLICT";
    case "error":
      return "SAVE ERROR";
    case "unsupported":
      return "SESSION ONLY";
    case "uninitialized":
    default:
      return "STARTING";
  }
}

function bytesLabel(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  if (value < 1024) return Math.round(value) + " B";
  if (value < 1024 * 1024) {
    return (value / 1024).toFixed(1) + " KB";
  }
  if (value < 1024 * 1024 * 1024) {
    return (value / (1024 * 1024)).toFixed(1) + " MB";
  }
  return (value / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

export function ProjectControl() {
  const project = useProjectSnapshot();
  const [open, setOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(project.name);
  const [copyName, setCopyName] = useState(project.name + " Copy");
  const [versionName, setVersionName] = useState("Snapshot");
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [deleteVersionId, setDeleteVersionId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNameDraft(project.name);
    setCopyName(project.name + " Copy");
    setDeleteProjectId(null);
    setDeleteVersionId(null);
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

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
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
  }, [open]);

  const commitName = () => {
    projectStore.rename(nameDraft);
    setNameDraft(projectStore.getSnapshot().name);
  };

  const saveCopy = async () => {
    setBusy("save-as");
    try {
      const id = await projectStore.saveAsNew(copyName);
      if (id) setOpen(false);
    } finally {
      setBusy(null);
    }
  };

  const createVersion = async () => {
    setBusy("version");
    try {
      const version = await projectStore.createVersion(versionName);
      if (version) {
        setVersionName(
          "Snapshot " + String(project.versions.length + 2),
        );
      }
    } finally {
      setBusy(null);
    }
  };

  const createNewProject = async () => {
    setBusy("new-project");
    try {
      const id = await projectStore.createNewProject(
        "New Beat",
      );
      if (id) setOpen(false);
    } finally {
      setBusy(null);
    }
  };

  const exportBackup = async (projectId?: string) => {
    setBusy("backup-export");
    try {
      const backup = await projectStore.exportBackup(projectId);
      if (backup) {
        triggerBlobDownload(backup.blob, backup.filename);
      }
    } finally {
      setBusy(null);
    }
  };

  const importBackup = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setBusy("backup-import");
    try {
      const id = await projectStore.importBackup(file);
      if (id) {
        const opened = await projectStore.openProject(id);
        if (opened) setOpen(false);
      }
    } finally {
      setBusy(null);
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
        ref={triggerRef}
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
          aria-label="Project library and persistence controls"
        >
          <input
            ref={importRef}
            className="project-file-input"
            type="file"
            accept=".zip,.synth.zip,application/zip"
            onChange={(event) => void importBackup(event)}
          />

          <div className="project-popover__status">
            <span>
              {project.supported
                ? statusLabel(project.saveStatus)
                : "LOCAL STORAGE UNAVAILABLE"}
            </span>
            <strong>
              {project.saveStatus === "conflict"
                ? "NEWER REVISION DETECTED"
                : project.dirty
                  ? "CHANGES PENDING"
                  : timeLabel(project.lastSavedAt)}
            </strong>
          </div>

          {project.conflict ? (
            <div className="project-conflict">
              <span>{project.conflict.message}</span>
              <strong>
                REMOTE REV {project.conflict.remoteRevision}
              </strong>
              <div>
                <MachineButton
                  compact
                  disabled={Boolean(busy)}
                  onClick={() => void projectStore.reloadActiveProject()}
                >
                  RELOAD NEWER
                </MachineButton>
                <span>
                  Use SAVE AS below first if you need to preserve this tab's
                  local state.
                </span>
              </div>
            </div>
          ) : null}

          <label className="project-name-editor">
            <span>PROJECT NAME</span>
            <input
              value={nameDraft}
              maxLength={80}
              disabled={!project.initialized || Boolean(busy)}
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
                Boolean(busy) ||
                project.saveStatus === "conflict"
              }
              onClick={() => void createNewProject()}
            >
              NEW BEAT
            </MachineButton>
            <MachineButton
              compact
              disabled={
                !project.projectId ||
                Boolean(busy)
              }
              onClick={() => {
                if (project.projectId) {
                  projectStore.toggleFavoriteProject(
                    project.projectId,
                  );
                }
              }}
            >
              {project.projectId &&
              project.favoriteProjectIds.includes(
                project.projectId,
              )
                ? "★ FAVORITE"
                : "☆ FAVORITE"}
            </MachineButton>
            <MachineButton
              compact
              disabled={
                !project.initialized ||
                !project.supported ||
                Boolean(busy) ||
                project.saveStatus === "saving" ||
                project.saveStatus === "conflict"
              }
              onClick={() => void projectStore.saveNow()}
            >
              SAVE NOW
            </MachineButton>
            <MachineButton
              compact
              disabled={
                !project.initialized ||
                !project.supported ||
                Boolean(busy)
              }
              onClick={() => void exportBackup()}
            >
              EXPORT BACKUP
            </MachineButton>
            <MachineButton
              compact
              disabled={
                !project.initialized ||
                !project.supported ||
                Boolean(busy)
              }
              onClick={() => importRef.current?.click()}
            >
              IMPORT BACKUP
            </MachineButton>
          </div>

          <div className="project-copy">
            <span>SAVE CURRENT STATE AS NEW PROJECT</span>
            <div>
              <input
                value={copyName}
                maxLength={80}
                disabled={!project.initialized || !project.supported || Boolean(busy)}
                onChange={(event) =>
                  setCopyName(event.currentTarget.value)
                }
              />
              <MachineButton
                compact
                disabled={
                  !project.initialized ||
                  !project.supported ||
                  Boolean(busy)
                }
                onClick={() => void saveCopy()}
              >
                SAVE AS
              </MachineButton>
            </div>
          </div>

          <div className="project-versions">
            <div className="project-popover__subhead">
              <span>NAMED VERSIONS</span>
              <strong>{project.versions.length}</strong>
            </div>

            <div className="project-version-create">
              <input
                value={versionName}
                maxLength={80}
                disabled={Boolean(busy) || project.saveStatus === "conflict"}
                onChange={(event) =>
                  setVersionName(event.currentTarget.value)
                }
              />
              <MachineButton
                compact
                disabled={
                  Boolean(busy) ||
                  !project.supported ||
                  project.saveStatus === "conflict"
                }
                onClick={() => void createVersion()}
              >
                SNAPSHOT
              </MachineButton>
            </div>

            {project.versions.length > 0 ? (
              <div className="project-version-list">
                {project.versions.map((version) => (
                  <div key={version.id}>
                    <div>
                      <strong>{version.name}</strong>
                      <small>
                        REV {version.sourceRevision}
                        {" · "}
                        {version.assetCount} ASSETS
                      </small>
                    </div>
                    <button
                      type="button"
                      disabled={
                        Boolean(busy) ||
                        project.saveStatus === "conflict"
                      }
                      title={
                        project.saveStatus === "conflict"
                          ? "Resolve the project revision conflict before restoring a version."
                          : undefined
                      }
                      onClick={() =>
                        void projectStore.restoreVersion(version.id)
                      }
                    >
                      RESTORE
                    </button>
                    <button
                      type="button"
                      className={
                        deleteVersionId === version.id
                          ? "is-confirming"
                          : undefined
                      }
                      disabled={Boolean(busy)}
                      onClick={() => {
                        if (deleteVersionId === version.id) {
                          setDeleteVersionId(null);
                          void projectStore.deleteVersion(version.id);
                        } else {
                          setDeleteVersionId(version.id);
                        }
                      }}
                    >
                      {deleteVersionId === version.id
                        ? "CONFIRM"
                        : "DELETE"}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p>NO NAMED VERSIONS</p>
            )}
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
                  const confirming =
                    deleteProjectId === summary.id;

                  return (
                    <div
                      key={summary.id}
                      className={
                        active
                          ? "project-library-row is-active"
                          : "project-library-row"
                      }
                    >
                      <button
                        type="button"
                        className="project-library-row__open"
                        disabled={
                          active ||
                          Boolean(busy) ||
                          project.saveStatus === "saving"
                        }
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

                      <div className="project-library-row__actions">
                        <button
                          type="button"
                          className={
                            project.favoriteProjectIds.includes(
                              summary.id,
                            )
                              ? "is-favorite"
                              : undefined
                          }
                          disabled={Boolean(busy)}
                          onClick={() =>
                            projectStore.toggleFavoriteProject(
                              summary.id,
                            )
                          }
                          aria-pressed={
                            project.favoriteProjectIds.includes(
                              summary.id,
                            )
                          }
                        >
                          {project.favoriteProjectIds.includes(
                            summary.id,
                          )
                            ? "★"
                            : "☆"}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() =>
                            void projectStore.duplicateProject(
                              summary.id,
                              summary.name + " Copy",
                            )
                          }
                        >
                          COPY
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() =>
                            void exportBackup(summary.id)
                          }
                        >
                          BACKUP
                        </button>
                        <button
                          type="button"
                          disabled={active || Boolean(busy)}
                          className={
                            confirming
                              ? "is-confirming"
                              : undefined
                          }
                          onClick={() => {
                            if (confirming) {
                              setDeleteProjectId(null);
                              void projectStore.deleteProject(summary.id);
                            } else {
                              setDeleteProjectId(summary.id);
                            }
                          }}
                        >
                          {confirming ? "CONFIRM DELETE" : "DELETE"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p>NO SAVED PROJECTS</p>
            )}
          </div>

          <div className="project-storage">
            <div className="project-popover__subhead">
              <span>LOCAL STORAGE</span>
              <strong>
                {bytesLabel(project.storage.usageBytes)}
                {" / "}
                {bytesLabel(project.storage.quotaBytes)}
              </strong>
            </div>
            <div>
              <span>
                {project.storage.persisted === true
                  ? "PERSISTENT STORAGE GRANTED"
                  : project.storage.persisted === false
                    ? "BEST-EFFORT STORAGE"
                    : "PERSISTENCE STATUS UNKNOWN"}
              </span>
              {project.storage.persisted === false ? (
                <MachineButton
                  compact
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void projectStore.requestPersistentStorage()
                  }
                >
                  REQUEST PERSISTENT
                </MachineButton>
              ) : null}
            </div>
          </div>

          {project.lastError ? (
            <p className="project-error" aria-live="polite">
              {project.lastError}
            </p>
          ) : null}

          <p className="project-storage-note">
            Projects, versions and audio dependencies are local to this
            browser. Backup packages are portable and integrity-checked before
            import.
          </p>
        </div>
      ) : null}
    </div>
  );
}
