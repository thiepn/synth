/**
 * Synth domain contracts — Phase 0.
 *
 * These types are deliberately framework- and Web-Audio-independent.
 * They define serialized musical truth, not runtime engine objects.
 */

export type EntityId = string;
export type Seed = string;
export type Tick = number;
export type Microseconds = number;
export type Normalized = number;

export const PROJECT_SCHEMA_VERSION = 1 as const;
export const RHYTHM_EXCHANGE_SCHEMA_VERSION = 1 as const;
export const PPQ = 960 as const;

export type InstrumentRole =
  | "kick"
  | "snare"
  | "clap"
  | "closedHat"
  | "openHat"
  | "tom"
  | "cymbal"
  | "percussion"
  | "fx"
  | "custom";

export interface Meter {
  numerator: number;
  denominator: number;
}

export interface TransportDefaults {
  bpm: number;
  meter: Meter;
}

export interface StepEvent {
  id: EntityId;
  tick: Tick;
  durationTicks?: Tick;
  velocity: Normalized;
  probability: Normalized;
  timingOffsetUs: Microseconds;
  accent?: "ghost" | "normal" | "accent";
  ratchetCount?: number;
  flamOffsetUs?: Microseconds;
  generatorTags?: string[];
}

export interface GenerationLock {
  rhythm: boolean;
  sound: boolean;
  dynamics: boolean;
  timing: boolean;
}

export interface PatternRegionLock extends GenerationLock {
  startTick: Tick;
  endTick: Tick;
}

export interface PatternLane {
  id: EntityId;
  role: InstrumentRole;
  /** Rhythms target a semantic kit slot, not a concrete sound. */
  kitSlotId: EntityId;
  events: StepEvent[];
  muted?: boolean;
  solo?: boolean;
  lock: GenerationLock;
  regionLocks?: PatternRegionLock[];
}

export interface GrooveProfile {
  swing: Normalized;
  humanization: Normalized;
  personality:
    | "tight"
    | "deep"
    | "laidBack"
    | "pushing"
    | "loose"
    | "mechanical"
    | "human";
  roleTimingOffsetUs?: Partial<Record<InstrumentRole, Microseconds>>;
}

export interface StyleVector {
  [styleId: string]: number;
}

export interface IntentVector {
  energy: Normalized;
  density: Normalized;
  complexity: Normalized;
  syncopation: Normalized;
  space: Normalized;
  swing: Normalized;
  humanization: Normalized;
  mutationDistance: Normalized;
}

export interface GenerationProvenance {
  seed: Seed;
  generatorId: string;
  generatorVersion: number;
  sourceEntityId?: EntityId;
  sourceHistoryNodeId?: EntityId;
  mutationId?: string;
  style: StyleVector;
  intent: IntentVector;
}

export interface Pattern {
  id: EntityId;
  name: string;
  meter: Meter;
  ppq: typeof PPQ;
  lengthTicks: Tick;
  lanes: PatternLane[];
  groove?: GrooveProfile;
  provenance?: GenerationProvenance;
}

export type SynthVoiceKind =
  | "kick"
  | "snare"
  | "clap"
  | "hat"
  | "tom"
  | "percussion"
  | "custom";

export interface SynthSoundSpec {
  kind: "synth";
  voice: SynthVoiceKind;
  engineVersion: number;
  params: Record<string, number | string | boolean>;
}

export interface SampleSoundSpec {
  kind: "sample";
  assetId: EntityId;
  trimStartSeconds: number;
  trimEndSeconds?: number;
  gainDb: number;
  pitchSemitones: number;
  reversed: boolean;
}

export interface HybridSoundSpec {
  kind: "hybrid";
  sample: SampleSoundSpec;
  layers: SynthSoundSpec[];
}

export type SoundSpec = SynthSoundSpec | SampleSoundSpec | HybridSoundSpec;

export interface Sound {
  id: EntityId;
  name: string;
  spec: SoundSpec;
  provenance?: GenerationProvenance;
}

export interface KitSlot {
  id: EntityId;
  role: InstrumentRole;
  label?: string;
  soundId: EntityId;
}

export interface Kit {
  id: EntityId;
  name: string;
  slots: KitSlot[];
  provenance?: GenerationProvenance;
}

export interface Scene {
  id: EntityId;
  name: string;
  patternIds: EntityId[];
  kitId?: EntityId;
  energy: Normalized;
}

export interface ArrangementSection {
  id: EntityId;
  sceneId: EntityId;
  startTick: Tick;
  lengthTicks: Tick;
  energyStart: Normalized;
  energyEnd: Normalized;
}

export interface AssetReference {
  id: EntityId;
  kind: "audio";
  mimeType: string;
  name: string;
  byteLength?: number;
}

export type HistoryOperation =
  | "generateBeat"
  | "reroll"
  | "mutation"
  | "variation"
  | "manualEdit"
  | "generateKit"
  | "generateTransition"
  | "arrange";

export type HistoryArtifactKind =
  | "pattern"
  | "kit"
  | "sound"
  | "scene"
  | "arrangement";

export interface HistoryArtifactRef {
  kind: HistoryArtifactKind;
  id: EntityId;
}

export interface HistoryNode {
  id: EntityId;
  parentId?: EntityId;
  operation: HistoryOperation;
  operationParams: Record<string, unknown>;
  seed?: Seed;
  artifacts: HistoryArtifactRef[];
  createdAt: string;
  name?: string;
  favorite?: boolean;
}

export interface SynthProject {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  id: EntityId;
  name: string;
  createdAt: string;
  updatedAt: string;
  transport: TransportDefaults;
  kits: Kit[];
  activeKitId: EntityId;
  sounds: Sound[];
  patterns: Pattern[];
  scenes: Scene[];
  arrangement: ArrangementSection[];
  assets: AssetReference[];
  history: HistoryNode[];
  activeHistoryNodeId?: EntityId;
}

export interface RhythmExchangeLane {
  role: InstrumentRole;
  events: Array<
    Pick<
      StepEvent,
      "tick" | "durationTicks" | "velocity" | "timingOffsetUs" | "accent"
    >
  >;
}

export interface RhythmExchange {
  schemaVersion: typeof RHYTHM_EXCHANGE_SCHEMA_VERSION;
  title: string;
  bpm: number;
  meter: Meter;
  ppq: typeof PPQ;
  lengthTicks: Tick;
  lanes: RhythmExchangeLane[];
  groove?: GrooveProfile;
  metadata?: Record<string, string | number | boolean>;
}
