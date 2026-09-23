import { arrangementFoundationStore } from "../arrange/ArrangementFoundationStore";
import { arrangementPlaybackStore } from "../arrange/ArrangementPlaybackStore";
import { arrangementStore } from "../arrange/ArrangementStore";
import { audioTransport } from "../audio/AudioTransport";
import { sampleAssetStore } from "../audio/SampleAssetStore";
import { drumSoundStore } from "../audio/drumSoundModel";
import { chaosStore } from "../chaos/ChaosStore";
import { evolutionStore } from "../evolve/EvolutionStore";
import { beatFamilyStore } from "../family/BeatFamilyStore";
import { generationHistoryStore } from "../history/GenerationHistoryStore";
import { masteringStore } from "../master/MasteringStore";
import { midiStore } from "../midi/MidiStore";
import { mixerStore } from "../mix/MixerStore";
import { modulationStore } from "../modulation/ModulationStore";
import { beatMorphStore } from "../morph/BeatMorphStore";
import { performanceStore } from "../performance/PerformanceStore";
import { localProjectDatabase } from "../persistence/LocalProjectDatabase";
import { renderStore } from "../render/RenderStore";
import { resampleStore } from "../resample/ResampleStore";
import { sampleLabStore } from "../sample/SampleLabStore";
import { sequencerStore } from "../sequencer/SequencerStore";
import { songArchitectStore } from "../song/SongArchitectStore";
import {
  SYNTH_PROJECT_DOCUMENT_VERSION,
  assertProjectDocument,
  type LoadedProjectBundle,
  type PersistedAudioAsset,
  type ProjectSummary,
  type SynthProjectDocument,
} from "./projectTypes";

type Listener = () => void;

export type ProjectSaveStatus =
  | "uninitialized"
  | "loading"
  | "clean"
  | "dirty"
  | "saving"
  | "error"
  | "unsupported";

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
  revision: number;
}

const AUTOSAVE_DELAY_MS = 750;

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
  private applying = false;
  private changeSerial = 0;
  private autosaveTimer: number | undefined;
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
      if (this.dirty && !this.applying) {
        this.scheduleAutosave();
      }
    }
  }

  async openProject(projectId: string): Promise<boolean> {
    if (!this.initialized || this.applying) return false;
    if (projectId === this.projectId) return true;

    if (this.dirty) {
      await this.saveNow();
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
      return true;
    } catch (error) {
      try {
        await this.applyBundle(rollback);
      } catch {
        // If rollback itself fails, retain the original error for diagnostics.
      }
      this.saveStatus = "error";
      this.lastError =
        error instanceof Error ? error.message : String(error);
      this.publish();
      return false;
    }
  }

  async saveAsNew(name: string): Promise<string | undefined> {
    if (!this.initialized || this.applying) return undefined;
    if (this.dirty) {
      await this.saveNow();
    }

    const previousId = this.projectId;
    const previousName = this.name;
    const previousCreatedAt = this.createdAt;
    const previousRevision = this.documentRevision;

    this.projectId = newProjectId();
    this.name = cleanProjectName(name);
    this.createdAt = new Date().toISOString();
    this.documentRevision = 0;
    this.dirty = true;
    this.changeSerial += 1;

    try {
      await this.saveNow();
      return this.projectId;
    } catch (error) {
      this.projectId = previousId;
      this.name = previousName;
      this.createdAt = previousCreatedAt;
      this.documentRevision = previousRevision;
      this.dirty = false;
      this.saveStatus = "error";
      this.lastError =
        error instanceof Error ? error.message : String(error);
      this.publish();
      return undefined;
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
        error instanceof Error ? error.message : String(error);
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
      const assets = this.captureAssets(now);

      await localProjectDatabase.saveProject(
        document,
        assets,
      );

      this.documentRevision = nextRevision;
      this.lastSavedAt = now;

      if (serialAtStart === this.changeSerial) {
        this.dirty = false;
        this.saveStatus = "clean";
      } else {
        this.dirty = true;
        this.saveStatus = "dirty";
      }

      await this.refreshSummaries();
      this.publish();
    } catch (error) {
      this.dirty = true;
      this.saveStatus = "error";
      this.lastError =
        error instanceof Error ? error.message : String(error);
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
      assets: this.captureAssets(now),
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
    const mixer = mixerStore.getSnapshot();
    const modulation = modulationStore.getSnapshot();
    const family = beatFamilyStore.getSnapshot();
    const foundation =
      arrangementFoundationStore.getSnapshot();
    const history = generationHistoryStore.getSnapshot();
    const assetIds = sampleAssetStore
      .getSnapshot()
      .assets.map((asset) => asset.reference.id)
      .sort();

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

  private captureAssets(
    updatedAt: string,
  ): PersistedAudioAsset[] {
    return sampleAssetStore
      .getSnapshot()
      .assets.map((state) => {
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
      arrangementPlaybackStore.stop();
      audioTransport.stop();

      beatMorphStore.clear();
      chaosStore.reset();
      evolutionStore.clear();
      songArchitectStore.clear();
      performanceStore.resetProjectTransientState();
      sampleLabStore.resetProjectTransientState();
      renderStore.cancel();
      renderStore.resetStatus();
      resampleStore.resetProjectTransientState();

      sampleAssetStore.clearProjectAssets();
      for (const asset of bundle.assets) {
        sampleAssetStore.restorePersistedAsset(
          asset.state,
          asset.bytes,
        );
      }

      const document = bundle.document;

      audioTransport.setBpm(document.transport.bpm);
      audioTransport.setMeter(document.transport.meter);
      audioTransport.setLoopBars(
        document.transport.loopBars,
      );

      drumSoundStore.restoreProjectState(
        document.drumSound,
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
    this.saveStatus = "dirty";
    this.publish();
    this.scheduleAutosave();
  }

  private scheduleAutosave(): void {
    if (
      !this.initialized ||
      !this.dirty ||
      this.applying ||
      !localProjectDatabase.supported
    ) {
      return;
    }

    this.clearAutosaveTimer();
    this.autosaveTimer = globalThis.setTimeout(() => {
      this.autosaveTimer = undefined;
      void this.saveNow();
    }, AUTOSAVE_DELAY_MS);
  }

  private clearAutosaveTimer(): void {
    if (this.autosaveTimer === undefined) return;
    globalThis.clearTimeout(this.autosaveTimer);
    this.autosaveTimer = undefined;
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

    subscribe(sequencerStore.subscribe);
    subscribe(drumSoundStore.subscribe);
    subscribe(sampleAssetStore.subscribe);
    subscribe(mixerStore.subscribe);
    subscribe(masteringStore.subscribe);
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

  private installLifecycle(): void {
    if (this.lifecycleInstalled) return;
    this.lifecycleInstalled = true;

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
      revision: this.revision,
    };
  }
}

export const projectStore = new ProjectStore();
