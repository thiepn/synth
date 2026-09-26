import { arrangementFoundationStore } from "../arrange/ArrangementFoundationStore";
import { errorMessage } from "../runtime/errors";
import { arrangementStore } from "../arrange/ArrangementStore";
import { audioTransport } from "../audio/AudioTransport";
import { drumEngine } from "../audio/DrumEngine";
import {
  sampleAssetStore,
  type SampleAssetState,
} from "../audio/SampleAssetStore";
import {
  drumSoundStore,
  type DrumSoundSnapshot,
} from "../audio/drumSoundModel";
import type { SoundSpec } from "../domain/contracts";
import { beatFamilyStore } from "../family/BeatFamilyStore";
import { generationHistoryStore } from "../history/GenerationHistoryStore";
import { masteringStore } from "../master/MasteringStore";
import { midiStore } from "../midi/MidiStore";
import { mixerStore } from "../mix/MixerStore";
import { modulationStore } from "../modulation/ModulationStore";
import {
  localProjectDatabase,
  ProjectRevisionConflictError,
} from "../persistence/LocalProjectDatabase";
import { sequencerStore } from "../sequencer/SequencerStore";
import {
  createProjectBackup,
  readProjectBackup,
} from "./projectBackup";
import {
  resetLoadedProjectTransientState,
} from "./transientResetRegistry";
import {
  SYNTH_PROJECT_DOCUMENT_VERSION,
  assertProjectDocument,
  type LoadedProjectBundle,
  type PersistedAudioAsset,
  type ProjectSummary,
  type ProjectVersionRecord,
  type ProjectVersionSummary,
  type SynthProjectDocument,
} from "./projectTypes";

type Listener = () => void;

export type ProjectSaveStatus =
  | "uninitialized"
  | "loading"
  | "clean"
  | "dirty"
  | "saving"
  | "conflict"
  | "error"
  | "unsupported";

export interface ProjectConflictState {
  remoteRevision: number;
  message: string;
}

export interface ProjectStorageEstimate {
  usageBytes?: number;
  quotaBytes?: number;
  persisted?: boolean;
}

export interface ProjectSnapshot {
  supported: boolean;
  initialized: boolean;
  projectId?: string;
  name: string;
  saveStatus: ProjectSaveStatus;
  dirty: boolean;
  lastSavedAt?: string;
  lastError?: string;
  summaries: ProjectSummary[];
  versions: ProjectVersionSummary[];
  favoriteProjectIds: string[];
  conflict?: ProjectConflictState;
  storage: ProjectStorageEstimate;
  revision: number;
}

const AUTOSAVE_DELAY_MS = 750;
const FAVORITE_PROJECTS_KEY =
  "synth.project.favorite-project-ids";

function readFavoriteProjectIds(): Set<string> {
  try {
    const raw = globalThis.localStorage?.getItem(
      FAVORITE_PROJECTS_KEY,
    );
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      ),
    );
  } catch {
    return new Set();
  }
}

function persistFavoriteProjectIds(
  ids: ReadonlySet<string>,
): void {
  try {
    globalThis.localStorage?.setItem(
      FAVORITE_PROJECTS_KEY,
      JSON.stringify([...ids]),
    );
  } catch {
    // Favorites remain session-only when localStorage is blocked.
  }
}

function newProjectId(): string {
  if (globalThis.crypto?.randomUUID) {
    return "project-" + globalThis.crypto.randomUUID();
  }
  return (
    "project-" +
    Date.now().toString(36) +
    "-" +
    Math.floor(performance.now()).toString(36)
  );
}

function cleanProjectName(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 80) || "Untitled Synth";
}

function withoutRevision<T extends { revision: number }>(
  value: T,
): Omit<T, "revision"> {
  const { revision: _revision, ...rest } = value;
  return rest;
}

function collectSoundSpecAssetIds(
  spec: SoundSpec,
  output: Set<string>,
): void {
  if (spec.kind === "sample") {
    output.add(spec.assetId);
    return;
  }

  if (spec.kind === "hybrid") {
    output.add(spec.sample.assetId);
  }
}

function sampleAssetPersistenceSignature(
  state: SampleAssetState,
): string {
  return JSON.stringify({
    reference: state.reference,
    waveform: state.waveform,
  });
}

function referencedDrumAssetIds(
  snapshot: DrumSoundSnapshot,
): Set<string> {
  const output = new Set<string>();

  const collectSources = (
    states: DrumSoundSnapshot["sourceStates"],
  ) => {
    for (const state of Object.values(states)) {
      if (state.sample) {
        output.add(state.sample.assetId);
      }
    }
  };

  const collectKit = (
    activeKit: DrumSoundSnapshot["activeKit"],
  ) => {
    if (!activeKit) return;
    for (const sound of activeKit.sounds) {
      collectSoundSpecAssetIds(sound.spec, output);
    }
  };

  collectSources(snapshot.sourceStates);
  collectKit(snapshot.activeKit);

  for (const endpoint of [
    snapshot.morphA,
    snapshot.morphB,
  ]) {
    if (!endpoint) continue;
    collectSources(endpoint.sourceStates);
    collectKit(endpoint.activeKit);
  }

  return output;
}

export class ProjectStore {
  private listeners = new Set<Listener>();
  private initialized = false;
  private initializing: Promise<void> | undefined;
  private projectId: string | undefined;
  private name = "Foundation";
  private createdAt = new Date().toISOString();
  private documentRevision = 0;
  private saveStatus: ProjectSaveStatus = "uninitialized";
  private dirty = false;
  private lastSavedAt: string | undefined;
  private lastError: string | undefined;
  private summaries: ProjectSummary[] = [];
  private versions: ProjectVersionSummary[] = [];
  private favoriteProjectIds =
    readFavoriteProjectIds();
  private blankTemplate: LoadedProjectBundle | undefined;
  private conflict: ProjectConflictState | undefined;
  private storage: ProjectStorageEstimate = {};
  private broadcast: BroadcastChannel | undefined;
  private instanceId =
    globalThis.crypto?.randomUUID?.() ??
    "instance-" + Date.now().toString(36);
  private applying = false;
  private changeSerial = 0;
  private persistedAssetIds = new Set<string>();
  private persistedAssetSignatures = new Map<
    string,
    string
  >();
  private autosaveTimer: number | undefined;
  private autosaveIdleHandle: number | undefined;
  private savePromise: Promise<void> | undefined;
  private unsubscribers: Array<() => void> = [];
  private lifecycleInstalled = false;
  private revision = 0;
  private snapshot = this.buildSnapshot();

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): ProjectSnapshot => this.snapshot;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;

    this.initializing = this.initializeInternal();
    try {
      await this.initializing;
    } finally {
      this.initializing = undefined;
    }
  }

  rename(name: string): void {
    const next = cleanProjectName(name);
    if (next === this.name) return;
    this.name = next;
    this.markDirty();
  }

  toggleFavoriteProject(projectId: string): void {
    if (!projectId) return;

    if (this.favoriteProjectIds.has(projectId)) {
      this.favoriteProjectIds.delete(projectId);
    } else {
      this.favoriteProjectIds.add(projectId);
    }

    persistFavoriteProjectIds(
      this.favoriteProjectIds,
    );
    this.publish();
  }

  async createNewProject(
    name = "New Beat",
  ): Promise<string | undefined> {
    if (
      !this.initialized ||
      this.applying ||
      !localProjectDatabase.supported
    ) {
      return undefined;
    }

    if (this.dirty) {
      if (this.saveStatus === "conflict") {
        this.lastError =
          "Resolve the current project conflict before creating a new project.";
        this.publish();
        return undefined;
      }

      try {
        await this.saveNow();
      } catch {
        return undefined;
      }
    }

    const template = this.blankTemplate
      ? structuredClone(this.blankTemplate)
      : undefined;
    if (!template) {
      this.lastError =
        "A fresh project template is unavailable.";
      this.publish();
      return undefined;
    }

    const rollback = this.captureCurrentBundle();
    const now = new Date().toISOString();
    const nextId = newProjectId();
    template.document = {
      ...template.document,
      id: nextId,
      name: cleanProjectName(name),
      createdAt: now,
      updatedAt: now,
      revision: 0,
    };

    this.saveStatus = "loading";
    this.lastError = undefined;
    this.publish();

    try {
      await this.applyBundle(template);
      this.dirty = true;
      this.saveStatus = "dirty";
      this.changeSerial += 1;
      await this.saveNow();
      await localProjectDatabase.setActiveProjectId(
        nextId,
      );
      await this.refreshSummaries();
      await this.refreshVersions();
      this.publish();
      return nextId;
    } catch (error) {
      try {
        await this.applyBundle(rollback);
      } catch {
        // Preserve the creation failure as the user-visible error.
      }
      this.saveStatus = "error";
      this.lastError = errorMessage(error);
      this.publish();
      return undefined;
    }
  }

  async saveNow(): Promise<void> {
    if (!this.initialized || !this.projectId || this.applying) return;
    if (!localProjectDatabase.supported) return;
    if (this.savePromise) return this.savePromise;

    this.clearAutosaveTimer();
    this.savePromise = this.performSave();

    try {
      await this.savePromise;
    } finally {
      this.savePromise = undefined;
      if (
        this.dirty &&
        !this.applying &&
        this.saveStatus !== "conflict"
      ) {
        this.scheduleAutosave();
      }
    }
  }

  async openProject(projectId: string): Promise<boolean> {
    if (!this.initialized || this.applying) return false;
    if (projectId === this.projectId) return true;

    if (this.dirty) {
      if (this.saveStatus === "conflict") {
        this.lastError =
          "Save As or reload the conflicted project before switching projects.";
        this.publish();
        return false;
      }
      try {
        await this.saveNow();
      } catch {
        return false;
      }
    }

    const rollback = this.captureCurrentBundle();
    this.saveStatus = "loading";
    this.lastError = undefined;
    this.publish();

    try {
      const bundle = await localProjectDatabase.loadProject(projectId);
      if (!bundle) {
        throw new Error("The selected project no longer exists.");
      }
      await this.applyBundle(bundle);
      await localProjectDatabase.setActiveProjectId(projectId);
      await this.refreshSummaries();
      await this.refreshVersions();
      await this.refreshStorageEstimate();
      return true;
    } catch (error) {
      try {
        await this.applyBundle(rollback);
      } catch {
        // If rollback itself fails, retain the original error for diagnostics.
      }
      this.saveStatus = "error";
      this.lastError =
        errorMessage(error);
      this.publish();
      return false;
    }
  }

  async saveAsNew(name: string): Promise<string | undefined> {
    if (!this.initialized || this.applying) return undefined;

    const previousId = this.projectId;
    const previousName = this.name;
    const previousCreatedAt = this.createdAt;
    const previousRevision = this.documentRevision;
    const previousDirty = this.dirty;
    const previousStatus = this.saveStatus;
    const previousConflict = this.conflict;

    this.projectId = newProjectId();
    this.name = cleanProjectName(name);
    this.createdAt = new Date().toISOString();
    this.documentRevision = 0;
    this.conflict = undefined;
    this.dirty = true;
    this.saveStatus = "dirty";
    this.changeSerial += 1;

    try {
      await this.saveNow();
      if (this.projectId) {
        await localProjectDatabase.setActiveProjectId(
          this.projectId,
        );
      }
      return this.projectId;
    } catch (error) {
      this.projectId = previousId;
      this.name = previousName;
      this.createdAt = previousCreatedAt;
      this.documentRevision = previousRevision;
      this.dirty = previousDirty;
      this.saveStatus = previousStatus;
      this.conflict = previousConflict;
      this.lastError =
        errorMessage(error);
      this.publish();
      return undefined;
    }
  }

  async createVersion(
    name: string,
  ): Promise<ProjectVersionSummary | undefined> {
    if (!this.initialized || !this.projectId || this.applying) {
      return undefined;
    }

    try {
      if (this.dirty) {
        await this.saveNow();
      }
      if (this.saveStatus === "conflict") {
        return undefined;
      }

      const now = new Date().toISOString();
      const document = this.captureDocument(
        this.documentRevision,
        this.lastSavedAt ?? now,
      );
      const version: ProjectVersionRecord = {
        id:
          "version-" +
          this.projectId +
          "-" +
          (globalThis.crypto?.randomUUID?.() ??
            Date.now().toString(36)),
        projectId: this.projectId,
        name: cleanProjectName(name || "Snapshot"),
        createdAt: now,
        sourceRevision: this.documentRevision,
        document,
      };

      await localProjectDatabase.saveVersion(version);
      await this.refreshVersions();
      this.publish();
      return this.versions.find(
        (entry) => entry.id === version.id,
      );
    } catch (error) {
      this.lastError =
        errorMessage(error);
      this.saveStatus =
        error instanceof ProjectRevisionConflictError
          ? "conflict"
          : "error";
      this.publish();
      return undefined;
    }
  }

  async restoreVersion(versionId: string): Promise<boolean> {
    if (!this.initialized || !this.projectId || this.applying) {
      return false;
    }

    if (this.saveStatus === "conflict") {
      this.lastError =
        "Reload the newer project revision or use Save As before restoring a named version.";
      this.publish();
      return false;
    }

    if (this.dirty) {
      try {
        await this.saveNow();
      } catch {
        return false;
      }
    }

    const rollback = this.captureCurrentBundle();
    const activeId = this.projectId;
    const activeName = this.name;
    const activeCreatedAt = this.createdAt;
    const activeRevision = this.documentRevision;
    const activeUpdatedAt =
      this.lastSavedAt ?? new Date().toISOString();

    this.saveStatus = "loading";
    this.lastError = undefined;
    this.publish();

    try {
      const bundle =
        await localProjectDatabase.loadVersionBundle(versionId);
      if (!bundle) {
        throw new Error("The selected project version no longer exists.");
      }

      bundle.document = {
        ...bundle.document,
        id: activeId,
        name: activeName,
        createdAt: activeCreatedAt,
        updatedAt: activeUpdatedAt,
        revision: activeRevision,
      };

      await this.applyBundle(bundle);
      this.changeSerial += 1;
      this.dirty = true;
      this.saveStatus = "dirty";
      this.conflict = undefined;
      this.lastError = undefined;
      this.scheduleAutosave();
      this.publish();
      return true;
    } catch (error) {
      try {
        await this.applyBundle(rollback);
      } catch {
        // Preserve the original restore error.
      }
      this.saveStatus = "error";
      this.lastError =
        errorMessage(error);
      this.publish();
      return false;
    }
  }

  async deleteVersion(versionId: string): Promise<void> {
    if (!this.initialized || this.applying) return;
    await localProjectDatabase.deleteVersion(versionId);
    await this.refreshVersions();
    await this.refreshStorageEstimate();
    this.publish();
  }

  async duplicateProject(
    projectId: string,
    name: string,
  ): Promise<string | undefined> {
    if (!this.initialized || this.applying) return undefined;

    try {
      const bundle =
        await localProjectDatabase.loadProject(projectId);
      if (!bundle) {
        throw new Error("The source project no longer exists.");
      }

      const now = new Date().toISOString();
      const newId = newProjectId();
      const document: SynthProjectDocument = {
        ...structuredClone(bundle.document),
        id: newId,
        name: cleanProjectName(name),
        createdAt: now,
        updatedAt: now,
        revision: 1,
      };

      await localProjectDatabase.saveProject(
        document,
        bundle.assets,
        0,
        false,
      );
      await this.refreshSummaries();
      await this.refreshStorageEstimate();
      this.publish();
      return newId;
    } catch (error) {
      this.lastError =
        errorMessage(error);
      this.publish();
      return undefined;
    }
  }

  async deleteProject(projectId: string): Promise<boolean> {
    if (
      !this.initialized ||
      this.applying ||
      projectId === this.projectId
    ) {
      return false;
    }

    try {
      await localProjectDatabase.deleteProject(projectId);
      if (this.favoriteProjectIds.delete(projectId)) {
        persistFavoriteProjectIds(
          this.favoriteProjectIds,
        );
      }
      await this.refreshSummaries();
      await this.refreshStorageEstimate();
      this.publish();
      return true;
    } catch (error) {
      this.lastError =
        errorMessage(error);
      this.publish();
      return false;
    }
  }

  async reloadActiveProject(): Promise<boolean> {
    if (!this.projectId || this.applying) return false;

    try {
      const bundle =
        await localProjectDatabase.loadProject(this.projectId);
      if (!bundle) {
        throw new Error("The active project no longer exists.");
      }
      await this.applyBundle(bundle);
      await this.refreshSummaries();
      await this.refreshVersions();
      return true;
    } catch (error) {
      this.saveStatus = "error";
      this.lastError =
        errorMessage(error);
      this.publish();
      return false;
    }
  }

  async exportBackup(
    projectId = this.projectId,
  ): Promise<{ blob: Blob; filename: string } | undefined> {
    if (!projectId || !this.initialized) return undefined;

    try {
      if (
        projectId === this.projectId &&
        this.saveStatus === "conflict" &&
        this.dirty
      ) {
        throw new Error(
          "Save As or reload the conflicted project before exporting a backup.",
        );
      }
      if (
        projectId === this.projectId &&
        this.dirty
      ) {
        await this.saveNow();
      }

      const bundle =
        await localProjectDatabase.loadProject(projectId);
      if (!bundle) {
        throw new Error("The project no longer exists.");
      }

      const blob = await createProjectBackup(bundle);
      const safeName = bundle.document.name
        .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[. ]+$/g, "")
        .slice(0, 80) || "Synth Project";

      return {
        blob,
        filename: safeName + ".synth.zip",
      };
    } catch (error) {
      this.lastError =
        errorMessage(error);
      this.publish();
      return undefined;
    }
  }

  async importBackup(
    blob: Blob,
  ): Promise<string | undefined> {
    if (!this.initialized || this.applying) return undefined;

    try {
      const bundle = await readProjectBackup(blob);
      const now = new Date().toISOString();
      const newId = newProjectId();
      const document: SynthProjectDocument = {
        ...bundle.document,
        id: newId,
        name: cleanProjectName(
          bundle.document.name + " Imported",
        ),
        createdAt: now,
        updatedAt: now,
        revision: 1,
      };

      await localProjectDatabase.saveProject(
        document,
        bundle.assets,
        0,
        false,
      );
      await this.refreshSummaries();
      await this.refreshStorageEstimate();
      this.lastError = undefined;
      this.publish();
      return newId;
    } catch (error) {
      this.lastError =
        errorMessage(error);
      this.publish();
      return undefined;
    }
  }

  async requestPersistentStorage(): Promise<boolean> {
    try {
      const storage = navigator.storage;
      if (!storage?.persist) return false;
      const persisted = await storage.persist();
      await this.refreshStorageEstimate();
      this.publish();
      return persisted;
    } catch (error) {
      this.lastError =
        errorMessage(error);
      this.publish();
      return false;
    }
  }

  private async initializeInternal(): Promise<void> {
    if (!localProjectDatabase.supported) {
      this.saveStatus = "unsupported";
      this.initialized = true;
      this.installLifecycle();
      this.publish();
      return;
    }

    this.saveStatus = "loading";
    this.lastError = undefined;
    this.publish();

    const initialBundle = this.captureCurrentBundle();
    this.blankTemplate = structuredClone(
      initialBundle,
    );

    try {
      const activeId =
        await localProjectDatabase.getActiveProjectId();

      if (activeId) {
        const bundle =
          await localProjectDatabase.loadProject(activeId);
        if (bundle) {
          await this.applyBundle(bundle);
        } else {
          await this.createInitialProject();
        }
      } else {
        await this.createInitialProject();
      }

      await this.refreshSummaries();
      await this.refreshVersions();
      await this.refreshStorageEstimate();
      this.initialized = true;
      this.installSubscriptions();
      this.installLifecycle();
      this.saveStatus = "clean";
      this.dirty = false;
      this.publish();
    } catch (error) {
      try {
        await this.applyBundle(initialBundle);
      } catch {
        // Keep the original initialization error.
      }
      this.initialized = true;
      this.installSubscriptions();
      this.installLifecycle();
      this.saveStatus = "error";
      this.lastError =
        errorMessage(error);
      this.publish();
    }
  }

  private async createInitialProject(): Promise<void> {
    this.projectId = newProjectId();
    this.name = "Foundation";
    this.createdAt = new Date().toISOString();
    this.documentRevision = 0;
    this.dirty = true;
    this.changeSerial += 1;
    await this.performSave();
    if (this.projectId) {
      await localProjectDatabase.setActiveProjectId(
        this.projectId,
      );
    }
  }

  private async performSave(): Promise<void> {
    if (!this.projectId) return;

    const serialAtStart = this.changeSerial;
    this.saveStatus = "saving";
    this.lastError = undefined;
    this.publish();

    try {
      const now = new Date().toISOString();
      const nextRevision = this.documentRevision + 1;
      const document = this.captureDocument(
        nextRevision,
        now,
      );
      const assets = this.captureAssets(
        now,
        true,
      );

      await localProjectDatabase.saveProject(
        document,
        assets,
        this.documentRevision,
        false,
      );

      this.documentRevision = nextRevision;
      this.lastSavedAt = now;
      this.conflict = undefined;

      const nextPersistedAssetIds = new Set(
        document.assetIds,
      );
      const droppedAsset = [...this.persistedAssetIds].some(
        (assetId) => !nextPersistedAssetIds.has(assetId),
      );
      this.persistedAssetIds = nextPersistedAssetIds;
      this.persistedAssetSignatures = new Map(
        sampleAssetStore
          .getSnapshot()
          .assets
          .filter((asset) =>
            nextPersistedAssetIds.has(
              asset.reference.id,
            ),
          )
          .map((asset) => [
            asset.reference.id,
            sampleAssetPersistenceSignature(asset),
          ]),
      );

      if (serialAtStart === this.changeSerial) {
        this.dirty = false;
        this.saveStatus = "clean";
      } else {
        this.dirty = true;
        this.saveStatus = "dirty";
      }

      if (droppedAsset) {
        try {
          await localProjectDatabase.garbageCollectBundledAssets();
        } catch {
          // The project save already committed successfully.
          // Orphan cleanup is best effort and must never turn
          // a successful save into a false save failure.
        }
      }

      await this.refreshSummaries();
      await this.refreshVersions();
      await this.refreshStorageEstimate();
      this.broadcastSave(document);
      this.publish();
    } catch (error) {
      this.dirty = true;
      if (error instanceof ProjectRevisionConflictError) {
        this.saveStatus = "conflict";
        this.conflict = {
          remoteRevision: error.actualRevision,
          message: error.message,
        };
      } else {
        this.saveStatus = "error";
      }
      this.lastError =
        errorMessage(error);
      this.publish();
      throw error;
    }
  }

  private captureCurrentBundle(): LoadedProjectBundle {
    const now = new Date().toISOString();
    const document = this.captureDocument(
      this.documentRevision,
      this.lastSavedAt ?? now,
    );
    return {
      document,
      assets: this.captureAssets(now, false),
    };
  }

  private captureDocument(
    revision: number,
    updatedAt: string,
  ): SynthProjectDocument {
    const projectId =
      this.projectId ?? "project-recovery-session";
    const transport = audioTransport.getSnapshot();
    const drumSound = drumSoundStore.getSnapshot();
    const engine = drumEngine.getSnapshot();
    const mixer = mixerStore.getSnapshot();
    const modulation = modulationStore.getSnapshot();
    const family = beatFamilyStore.getSnapshot();
    const foundation =
      arrangementFoundationStore.getSnapshot();
    const history = generationHistoryStore.getSnapshot();
    const assetIds = [
      ...this.persistableAssetIds(),
    ].sort();

    return {
      schemaVersion: SYNTH_PROJECT_DOCUMENT_VERSION,
      id: projectId,
      name: cleanProjectName(this.name),
      createdAt: this.createdAt,
      updatedAt,
      revision,
      transport: {
        bpm: transport.bpm,
        meter: { ...transport.meter },
        loopBars: transport.loopBars,
      },
      pattern: structuredClone(
        sequencerStore.getSnapshot().pattern,
      ),
      engine: {
        master: engine.master,
        macros: { ...engine.macros },
      },
      drumSound: withoutRevision(drumSound),
      mixer: {
        state: mixerStore.currentState(),
        locks: mixerStore.currentLocks(),
      },
      modulation: {
        sources: modulation.sources.map((source) => ({
          ...source,
          stepValues: [...source.stepValues],
          externalValue:
            source.kind === "external"
              ? 0
              : source.externalValue,
        })),
        routes: modulation.routes.map((route) => ({ ...route })),
        automationLanes: modulation.automationLanes.map(
          (lane) => ({
            ...lane,
            points: lane.points.map((point) => ({ ...point })),
          }),
        ),
        selectedSourceId: modulation.selectedSourceId,
        selectedTargetId: modulation.selectedTargetId,
      },
      mastering: masteringStore.currentState(),
      beatFamily: withoutRevision(family),
      arrangementFoundation: withoutRevision(foundation),
      arrangement: arrangementStore.exportProjectState(),
      history: withoutRevision(history),
      midi: midiStore.exportProjectState(),
      assetIds,
    };
  }

  private persistableAssetStates(): SampleAssetState[] {
    const referencedBundled = referencedDrumAssetIds(
      drumSoundStore.getSnapshot(),
    );

    return sampleAssetStore
      .getSnapshot()
      .assets
      .filter((asset) => {
        const replaceableBundled =
          asset.reference.origin === "bundled" &&
          typeof asset.reference.bundledSampleId ===
            "string" &&
          asset.reference.bundledSampleId.length > 0;

        return (
          !replaceableBundled ||
          referencedBundled.has(asset.reference.id)
        );
      });
  }

  private persistableAssetIds(): Set<string> {
    return new Set(
      this.persistableAssetStates().map(
        (asset) => asset.reference.id,
      ),
    );
  }

  private captureAssets(
    updatedAt: string,
    onlyUnpersisted = false,
  ): PersistedAudioAsset[] {
    return this.persistableAssetStates()
      .filter((state) => {
        if (!onlyUnpersisted) return true;

        const assetId = state.reference.id;
        if (!this.persistedAssetIds.has(assetId)) {
          return true;
        }

        return (
          this.persistedAssetSignatures.get(assetId) !==
          sampleAssetPersistenceSignature(state)
        );
      })
      .map((state) => {
        const bytes = sampleAssetStore.getRawBytes(
          state.reference.id,
        );
        if (!bytes) {
          throw new Error(
            "Sample " +
              state.reference.name +
              " has metadata but no source bytes.",
          );
        }

        return {
          id: state.reference.id,
          state: structuredClone(state),
          bytes,
          updatedAt,
        };
      });
  }

  private async applyBundle(
    bundle: LoadedProjectBundle,
  ): Promise<void> {
    assertProjectDocument(bundle.document);
    this.applying = true;
    this.clearAutosaveTimer();

    try {
      audioTransport.stop();
      resetLoadedProjectTransientState();

      sampleAssetStore.clearProjectAssets();
      for (const asset of bundle.assets) {
        sampleAssetStore.restorePersistedAsset(
          asset.state,
          asset.bytes,
        );
      }

      const document = bundle.document;
      this.persistedAssetIds = new Set(
        document.assetIds,
      );
      this.persistedAssetSignatures = new Map(
        bundle.assets.map((asset) => [
          asset.id,
          sampleAssetPersistenceSignature(
            asset.state,
          ),
        ]),
      );

      audioTransport.setBpm(document.transport.bpm);
      audioTransport.setMeter(document.transport.meter);
      audioTransport.setLoopBars(
        document.transport.loopBars,
      );

      drumSoundStore.restoreProjectState(
        document.drumSound,
      );
      drumEngine.restoreProjectState(
        document.engine,
      );
      modulationStore.restoreProjectState(
        document.modulation,
      );
      mixerStore.restoreProjectState(
        document.mixer.state,
        document.mixer.locks,
      );
      masteringStore.restoreProjectState(
        document.mastering,
      );
      beatFamilyStore.restoreProjectState(
        document.beatFamily,
      );
      arrangementFoundationStore.restoreProjectState(
        document.arrangementFoundation,
      );
      arrangementStore.restoreProjectState(
        document.arrangement,
      );
      sequencerStore.restoreProjectPattern(
        document.pattern,
      );
      generationHistoryStore.restoreProjectState(
        document.history,
      );
      midiStore.restoreProjectState(
        document.midi,
      );

      this.projectId = document.id;
      this.name = cleanProjectName(document.name);
      this.createdAt = document.createdAt;
      this.documentRevision = document.revision;
      this.lastSavedAt = document.updatedAt;
      this.changeSerial += 1;
      this.dirty = false;
      this.saveStatus = "clean";
      this.conflict = undefined;
      this.lastError = undefined;
    } finally {
      this.applying = false;
      this.publish();
    }
  }

  private markDirty(): void {
    if (this.applying || !this.initialized) return;
    this.changeSerial += 1;
    this.dirty = true;

    if (this.conflict) {
      this.saveStatus = "conflict";
      this.publish();
      return;
    }

    this.saveStatus = "dirty";
    this.publish();
    this.scheduleAutosave();
  }

  private scheduleAutosave(): void {
    if (
      !this.initialized ||
      !this.dirty ||
      this.applying ||
      this.saveStatus === "conflict" ||
      !localProjectDatabase.supported
    ) {
      return;
    }

    this.clearAutosaveTimer();
    this.autosaveTimer = globalThis.setTimeout(() => {
      this.autosaveTimer = undefined;

      const idleHost = globalThis as typeof globalThis & {
        requestIdleCallback?: (
          callback: () => void,
          options?: { timeout?: number },
        ) => number;
      };

      if (idleHost.requestIdleCallback) {
        this.autosaveIdleHandle =
          idleHost.requestIdleCallback(
            () => {
              this.autosaveIdleHandle = undefined;
              void this.saveNow();
            },
            { timeout: 1_000 },
          );
      } else {
        void this.saveNow();
      }
    }, AUTOSAVE_DELAY_MS);
  }

  private clearAutosaveTimer(): void {
    if (this.autosaveTimer !== undefined) {
      globalThis.clearTimeout(this.autosaveTimer);
      this.autosaveTimer = undefined;
    }

    if (this.autosaveIdleHandle !== undefined) {
      const idleHost = globalThis as typeof globalThis & {
        cancelIdleCallback?: (handle: number) => void;
      };
      idleHost.cancelIdleCallback?.(
        this.autosaveIdleHandle,
      );
      this.autosaveIdleHandle = undefined;
    }
  }

  private installSubscriptions(): void {
    if (this.unsubscribers.length > 0) return;

    const subscribe = (
      fn: (listener: Listener) => () => void,
    ) => {
      this.unsubscribers.push(
        fn(() => this.markDirty()),
      );
    };

    let transportSignature =
      this.transportPersistenceSignature();
    this.unsubscribers.push(
      audioTransport.subscribe(() => {
        const next = this.transportPersistenceSignature();
        if (next === transportSignature) return;
        transportSignature = next;
        this.markDirty();
      }),
    );

    let engineSignature =
      this.enginePersistenceSignature();
    this.unsubscribers.push(
      drumEngine.subscribe(() => {
        const next = this.enginePersistenceSignature();
        if (next === engineSignature) return;
        engineSignature = next;
        this.markDirty();
      }),
    );

    let modulationSignature =
      this.modulationPersistenceSignature();
    this.unsubscribers.push(
      modulationStore.subscribe(() => {
        const next = this.modulationPersistenceSignature();
        if (next === modulationSignature) return;
        modulationSignature = next;
        this.markDirty();
      }),
    );

    let midiSignature = JSON.stringify(
      midiStore.exportProjectState(),
    );
    this.unsubscribers.push(
      midiStore.subscribe(() => {
        const next = JSON.stringify(
          midiStore.exportProjectState(),
        );
        if (next === midiSignature) return;
        midiSignature = next;
        this.markDirty();
      }),
    );

    let sequencerSignature =
      this.sequencerPersistenceSignature();
    this.unsubscribers.push(
      sequencerStore.subscribe(() => {
        const next = this.sequencerPersistenceSignature();
        if (next === sequencerSignature) return;
        sequencerSignature = next;
        this.markDirty();
      }),
    );

    subscribe(drumSoundStore.subscribe);
    subscribe(sampleAssetStore.subscribe);

    let mixerSignature =
      this.mixerPersistenceSignature();
    this.unsubscribers.push(
      mixerStore.subscribe(() => {
        const next = this.mixerPersistenceSignature();
        if (next === mixerSignature) return;
        mixerSignature = next;
        this.markDirty();
      }),
    );

    let masteringSignature =
      this.masteringPersistenceSignature();
    this.unsubscribers.push(
      masteringStore.subscribe(() => {
        const next = this.masteringPersistenceSignature();
        if (next === masteringSignature) return;
        masteringSignature = next;
        this.markDirty();
      }),
    );

    subscribe(beatFamilyStore.subscribe);
    subscribe(arrangementFoundationStore.subscribe);
    subscribe(arrangementStore.subscribe);
    subscribe(generationHistoryStore.subscribe);
  }

  private transportPersistenceSignature(): string {
    const transport = audioTransport.getSnapshot();
    return JSON.stringify({
      bpm: transport.bpm,
      meter: transport.meter,
      loopBars: transport.loopBars,
    });
  }

  private sequencerPersistenceSignature(): string {
    return JSON.stringify(
      sequencerStore.getSnapshot().pattern,
    );
  }

  private mixerPersistenceSignature(): string {
    return JSON.stringify({
      state: mixerStore.currentState(),
      locks: mixerStore.currentLocks(),
    });
  }

  private masteringPersistenceSignature(): string {
    return JSON.stringify(
      masteringStore.currentState(),
    );
  }

  private enginePersistenceSignature(): string {
    const engine = drumEngine.getSnapshot();
    return JSON.stringify({
      master: engine.master,
      macros: engine.macros,
    });
  }

  private modulationPersistenceSignature(): string {
    const modulation = modulationStore.getSnapshot();
    return JSON.stringify({
      sources: modulation.sources.map((source) => ({
        ...source,
        externalValue:
          source.kind === "external"
            ? 0
            : source.externalValue,
      })),
      routes: modulation.routes,
      automationLanes: modulation.automationLanes,
      selectedSourceId: modulation.selectedSourceId,
      selectedTargetId: modulation.selectedTargetId,
    });
  }

  private async refreshStorageEstimate(): Promise<void> {
    const storage = navigator.storage;
    if (!storage?.estimate) {
      this.storage = {};
      return;
    }

    try {
      const estimate = await storage.estimate();
      const persisted =
        storage.persisted
          ? await storage.persisted()
          : undefined;
      this.storage = {
        usageBytes: estimate.usage,
        quotaBytes: estimate.quota,
        persisted,
      };
    } catch {
      this.storage = {};
    }
  }

  private broadcastSave(
    document: SynthProjectDocument,
  ): void {
    this.broadcast?.postMessage({
      type: "saved",
      instanceId: this.instanceId,
      projectId: document.id,
      revision: document.revision,
      updatedAt: document.updatedAt,
    });
  }

  private installBroadcastChannel(): void {
    if (
      this.broadcast ||
      typeof BroadcastChannel === "undefined"
    ) {
      return;
    }

    this.broadcast =
      new BroadcastChannel("synth-project-sync-v1");
    this.broadcast.onmessage = (event) => {
      const message = event.data as {
        type?: string;
        instanceId?: string;
        projectId?: string;
        revision?: number;
      };

      if (
        message.type !== "saved" ||
        message.instanceId === this.instanceId ||
        message.projectId !== this.projectId ||
        !Number.isFinite(message.revision)
      ) {
        return;
      }

      const remoteRevision = Math.max(
        0,
        Math.round(message.revision ?? 0),
      );
      if (remoteRevision <= this.documentRevision) {
        return;
      }

      this.conflict = {
        remoteRevision,
        message:
          "A newer revision was saved in another tab.",
      };
      this.saveStatus = "conflict";
      this.clearAutosaveTimer();
      this.publish();
    };
  }

  private installLifecycle(): void {
    if (this.lifecycleInstalled) return;
    this.lifecycleInstalled = true;
    this.installBroadcastChannel();

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && this.dirty) {
        void this.saveNow();
      }
    });

    globalThis.addEventListener("pagehide", () => {
      if (this.dirty) {
        void this.saveNow();
      }
    });
  }

  private async refreshVersions(): Promise<void> {
    if (
      !localProjectDatabase.supported ||
      !this.projectId
    ) {
      this.versions = [];
      return;
    }
    this.versions =
      await localProjectDatabase.listVersions(this.projectId);
  }

  private async refreshSummaries(): Promise<void> {
    if (!localProjectDatabase.supported) {
      this.summaries = [];
      return;
    }
    this.summaries =
      await localProjectDatabase.listProjects();
  }

  private publish(): void {
    this.revision += 1;
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): ProjectSnapshot {
    return {
      supported: localProjectDatabase.supported,
      initialized: this.initialized,
      projectId: this.projectId,
      name: this.name,
      saveStatus: this.saveStatus,
      dirty: this.dirty,
      lastSavedAt: this.lastSavedAt,
      lastError: this.lastError,
      summaries: this.summaries.map((summary) => ({ ...summary })),
      versions: this.versions.map((version) => ({ ...version })),
      favoriteProjectIds: [
        ...this.favoriteProjectIds,
      ],
      conflict: this.conflict
        ? { ...this.conflict }
        : undefined,
      storage: { ...this.storage },
      revision: this.revision,
    };
  }
}

export const projectStore = new ProjectStore();
