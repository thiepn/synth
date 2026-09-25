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
export const DRUM_SYNTH_ENGINE_VERSION = 2 as const;
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
  grooveBase?: {
    velocity: Normalized;
    timingOffsetUs: Microseconds;
    accent?: "ghost" | "normal" | "accent";
  };
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
  /** Optional independent lane loop length for polymetric playback. */
  loopLengthTicks?: Tick;
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
  ghostNoteAmount?: Normalized;
  seed?: Seed;
  engineVersion?: number;
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

export type BeatFamilyRole =
  | "core"
  | "aVariation"
  | "bVariation"
  | "build"
  | "breakdown"
  | "drop"
  | "fill1"
  | "fill2"
  | "transition";

export interface GenerationProvenance {
  seed: Seed;
  generatorId: string;
  generatorVersion: number;
  sourceEntityId?: EntityId;
  sourceHistoryNodeId?: EntityId;
  mutationId?: string;
  familyId?: EntityId;
  familyRole?: BeatFamilyRole;
  styleDnaId?: string;
  styleDnaVersion?: number;
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

export interface BeatFamilyMember {
  id: EntityId;
  role: BeatFamilyRole;
  label: string;
  patternId: EntityId;
  energy: Normalized;
  kind: "core" | "variation" | "section" | "fill" | "transition";
}

export interface BeatFamily {
  id: EntityId;
  name: string;
  corePatternId: EntityId;
  members: BeatFamilyMember[];
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

export type DrumVoiceKind =
  | "kick"
  | "snare"
  | "clap"
  | "closedHat"
  | "openHat"
  | "tom"
  | "percussion"
  | "crash";

export interface DrumMaterialSpec {
  voice: DrumVoiceKind;
  engineVersion: number;
  impact: Normalized;
  body: Normalized;
  noise: Normalized;
  air: Normalized;
  tone: Normalized;
  decay: Normalized;
  pitch: Normalized;
  character: Normalized;
}

export interface KitDNA {
  brightness: Normalized;
  weight: Normalized;
  tightness: Normalized;
  roughness: Normalized;
  synthetic: Normalized;
  depth: Normalized;
  air: Normalized;
  variance: Normalized;
}

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
  /** Additional time-stretch-style playback multiplier independent of pitch control. */
  playbackRate?: number;
  /** Non-destructive fade durations in audible/output seconds. */
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  /**
   * Pre-mixed internal clip. Playback bypasses per-voice mixer/engine stages
   * and enters at the pre-master boundary.
   */
  renderedClip?: boolean;
  reversed: boolean;
}

export interface HybridSoundSpec {
  kind: "hybrid";
  sample: SampleSoundSpec;
  layers: SynthSoundSpec[];
  /** Gain applied to the synthesized layer group before the shared drum bus. */
  synthGainDb: number;
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

export type SceneRole =
  | "intro"
  | "verse"
  | "preChorus"
  | "chorus"
  | "breakdown"
  | "build"
  | "drop"
  | "outro";

export type ArrangementShapeId =
  | "compact"
  | "standard"
  | "extended";

export interface Scene {
  id: EntityId;
  name: string;
  role?: SceneRole;
  familyId?: EntityId;
  /** Ordered Pattern cycle rather than an unordered bag. */
  patternIds: EntityId[];
  fillPatternId?: EntityId;
  transitionPatternId?: EntityId;
  kitId?: EntityId;
  energy: Normalized;
  provenance?: GenerationProvenance;
}

export type FillPlacement = "off" | "last";
export type TransitionPlacement = "off" | "replaceLast" | "append";

export interface SectionBlueprint {
  id: EntityId;
  label: string;
  role: SceneRole;
  sceneId: EntityId;
  patternSequence: EntityId[];
  cycleCount: number;
  startTick: Tick;
  lengthTicks: Tick;
  energyStart: Normalized;
  energyEnd: Normalized;
  fillPatternId?: EntityId;
  fillPlacement?: FillPlacement;
  transitionPatternId?: EntityId;
  transitionPlacement?: TransitionPlacement;
}

export interface ArrangementBlueprint {
  id: EntityId;
  name: string;
  familyId: EntityId;
  shape: ArrangementShapeId;
  scenes: Scene[];
  sections: SectionBlueprint[];
  provenance?: GenerationProvenance;
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
  /** SHA-256 of the original local bytes when known. */
  contentHash?: string;
  /**
   * Asset origin is optional for backward compatibility.
   * Missing origin is treated as user/local content.
   */
  origin?: "user" | "bundled";
  /** Stable built-in sound identity when origin is bundled. */
  bundledSampleId?: string;
  durationSeconds?: number;
  sampleRate?: number;
  channels?: number;
}

export type HistoryOperation =
  | "root"
  | "branch"
  | "generateBeat"
  | "reroll"
  | "mutation"
  | "variation"
  | "beatMorph"
  | "remix"
  | "chaos"
  | "evolve"
  | "sampleLab"
  | "midiRecord"
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
  beatFamilies?: BeatFamily[];
  arrangementBlueprints?: ArrangementBlueprint[];
  scenes: Scene[];
  arrangement: ArrangementSection[];
  assets: AssetReference[];
  history: HistoryNode[];
  activeHistoryNodeId?: EntityId;
}

export interface RhythmExchangeLane {
  role: InstrumentRole;
  loopLengthTicks?: Tick;
  events: Array<
    Pick<
      StepEvent,
      "tick" | "durationTicks" | "velocity" | "probability" | "timingOffsetUs" | "accent" | "ratchetCount" | "flamOffsetUs"
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
