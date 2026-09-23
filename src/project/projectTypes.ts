import type {
  Meter,
  Pattern,
} from "../domain/contracts";
import type {
  ArrangementFoundationSnapshot,
} from "../arrange/ArrangementFoundationStore";
import type {
  ArrangementProjectState,
} from "../arrange/ArrangementStore";
import type {
  DrumSoundSnapshot,
} from "../audio/drumSoundModel";
import type {
  SampleAssetState,
} from "../audio/SampleAssetStore";
import type {
  BeatFamilySnapshot,
} from "../family/BeatFamilyStore";
import type {
  GenerationHistorySnapshot,
} from "../history/GenerationHistoryStore";
import type {
  MasteringState,
} from "../master/masteringModel";
import type {
  MidiPersistentState,
} from "../midi/MidiStore";
import type {
  MixerLocks,
  MixerState,
} from "../mix/mixerModel";
import type {
  AutomationLane,
  ModulationRoute,
  ModulationSource,
} from "../modulation/modulationEngine";

export const SYNTH_PROJECT_DOCUMENT_VERSION = 1 as const;

export interface ProjectTransportState {
  bpm: number;
  meter: Meter;
  loopBars: number;
}

export interface ProjectModulationState {
  sources: ModulationSource[];
  routes: ModulationRoute[];
  automationLanes: AutomationLane[];
  selectedSourceId?: string;
  selectedTargetId: string;
}

export interface ProjectMixerState {
  state: MixerState;
  locks: MixerLocks;
}

export interface SynthProjectDocumentV1 {
  schemaVersion: typeof SYNTH_PROJECT_DOCUMENT_VERSION;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  transport: ProjectTransportState;
  pattern: Pattern;
  drumSound: Omit<DrumSoundSnapshot, "revision">;
  mixer: ProjectMixerState;
  modulation: ProjectModulationState;
  mastering: MasteringState;
  beatFamily: Omit<BeatFamilySnapshot, "revision">;
  arrangementFoundation: Omit<
    ArrangementFoundationSnapshot,
    "revision"
  >;
  arrangement: ArrangementProjectState;
  history: Omit<GenerationHistorySnapshot, "revision">;
  midi: MidiPersistentState;
  assetIds: string[];
}

export type SynthProjectDocument = SynthProjectDocumentV1;

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  assetCount: number;
}

export interface PersistedAudioAsset {
  id: string;
  state: SampleAssetState;
  bytes: ArrayBuffer;
  updatedAt: string;
}

export interface LoadedProjectBundle {
  document: SynthProjectDocument;
  assets: PersistedAudioAsset[];
}

export function projectSummary(
  document: SynthProjectDocument,
): ProjectSummary {
  return {
    id: document.id,
    name: document.name,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    revision: document.revision,
    assetCount: document.assetIds.length,
  };
}

export function assertProjectDocument(
  input: unknown,
): asserts input is SynthProjectDocument {
  if (!input || typeof input !== "object") {
    throw new Error("Project document is not an object.");
  }

  const value = input as Partial<SynthProjectDocument>;
  if (value.schemaVersion !== SYNTH_PROJECT_DOCUMENT_VERSION) {
    throw new Error(
      "Unsupported project schema version: " +
        String(value.schemaVersion ?? "missing"),
    );
  }
  if (typeof value.id !== "string" || value.id.length === 0) {
    throw new Error("Project ID is missing.");
  }
  if (typeof value.name !== "string" || value.name.length === 0) {
    throw new Error("Project name is missing.");
  }
  if (!value.pattern || typeof value.pattern !== "object") {
    throw new Error("Project Pattern is missing.");
  }
  if (
    !value.transport ||
    typeof value.transport.bpm !== "number" ||
    !value.transport.meter
  ) {
    throw new Error("Project transport state is invalid.");
  }
  if (!Array.isArray(value.assetIds)) {
    throw new Error("Project asset manifest is invalid.");
  }
  if (!value.drumSound || !value.mixer || !value.modulation) {
    throw new Error("Project production state is incomplete.");
  }
  if (!value.history || !Array.isArray(value.history.nodes)) {
    throw new Error("Project creative history is invalid.");
  }
}
