import type {
  DrumMaterialSpec,
  Meter,
  Pattern,
  SoundSpec,
} from "../domain/contracts";
import type { DrumMacros } from "../audio/DrumEngine";
import type { DrumVoiceId } from "../music/foundationPattern";
import type { MixerState } from "../mix/mixerModel";
import type { MasteringState } from "../master/masteringModel";
import type {
  AutomationLane,
  ModulationRoute,
  ModulationSource,
} from "../modulation/modulationEngine";

export type RenderRangeKind =
  | "pattern"
  | "arrangement"
  | "section"
  | "custom";

export interface RenderSnapshotRequest {
  kind: RenderRangeKind;
  sectionId?: string;
  startTick?: number;
  endTick?: number;
}

export interface RenderOccurrence {
  id: string;
  sectionId?: string;
  startTick: number;
  lengthTicks: number;
  occurrenceIndex: number;
  pattern: Pattern;
  sectionStartTick?: number;
  sectionLengthTicks?: number;
  energyStart?: number;
  energyEnd?: number;
}

export interface RenderSlotSound {
  kitSlotId: string;
  fallbackVoice: DrumVoiceId;
  resolvedVoice: DrumVoiceId;
  spec: SoundSpec;
}

export interface RenderSampleBytes {
  assetId: string;
  bytes: ArrayBuffer;
}

export interface RenderModulationSnapshot {
  sources: ModulationSource[];
  routes: ModulationRoute[];
  automationLanes: AutomationLane[];
}

export interface RenderSnapshot {
  id: string;
  createdAt: string;
  label: string;
  sourceKind: RenderRangeKind;
  bpm: number;
  meter: Meter;
  startTick: number;
  endTick: number;
  occurrences: RenderOccurrence[];
  drumSpecs: Record<DrumVoiceId, DrumMaterialSpec>;
  slotSounds: RenderSlotSound[];
  samples: RenderSampleBytes[];
  mixerState: MixerState;
  modulation: RenderModulationSnapshot;
  engineMaster: number;
  engineMacros: DrumMacros;
  masteringState: MasteringState;
}

export type RenderTailMode = "none" | "auto" | "fixed";

export interface RenderOptions {
  sampleRate: 44_100 | 48_000;
  includeMastering: boolean;
  tailMode: RenderTailMode;
  fixedTailSeconds?: number;
  stemVoice?: DrumVoiceId;
}

export interface RenderAnalysis {
  durationSeconds: number;
  peak: number;
  rms: number;
  estimatedLufs: number;
  clippedSampleCount: number;
}

export interface RenderResult {
  snapshotId: string;
  sampleRate: number;
  channels: number;
  audioBuffer: AudioBuffer;
  analysis: RenderAnalysis;
  renderedStartTick: number;
  renderedEndTick: number;
  tailSeconds: number;
  stemVoice?: DrumVoiceId;
}
