import {
  DRUM_SYNTH_ENGINE_VERSION,
  type DrumMaterialSpec,
  type Kit,
  type KitDNA,
  type HybridSoundSpec,
  type SampleSoundSpec,
  type Sound,
  type SoundSpec,
  type SynthSoundSpec,
} from "../domain/contracts";
import {
  DRUM_PADS,
  SEQUENCER_LANES,
  type DrumVoiceId,
} from "../music/foundationPattern";

export type DrumMaterialParam =
  | "impact"
  | "body"
  | "noise"
  | "air"
  | "tone"
  | "decay"
  | "pitch"
  | "character";

export type DrumSourceMode = "synth" | "sample" | "hybrid";

export interface DrumVoiceSourceState {
  mode: DrumSourceMode;
  sample?: SampleSoundSpec;
  synthGainDb: number;
}

export interface ActiveGeneratedKit {
  kit: Kit;
  sounds: Sound[];
  direction: string;
  seed: string;
  dna: KitDNA;
  modified: boolean;
}

export interface SoundMorphEndpoint {
  label: string;
  specs: Record<DrumVoiceId, DrumMaterialSpec>;
  sourceStates: Record<DrumVoiceId, DrumVoiceSourceState>;
  activeKit?: ActiveGeneratedKit;
}

export interface DrumSoundSnapshot {
  specs: Record<DrumVoiceId, DrumMaterialSpec>;
  sourceStates: Record<DrumVoiceId, DrumVoiceSourceState>;
  activeKit?: ActiveGeneratedKit;
  morphA?: SoundMorphEndpoint;
  morphB?: SoundMorphEndpoint;
  revision: number;
}

type StoreListener = () => void;

export const DRUM_DEFAULT_SPECS: Record<DrumVoiceId, DrumMaterialSpec> = {
  kick: {
    voice: "kick",
    engineVersion: DRUM_SYNTH_ENGINE_VERSION,
    impact: 0.78,
    body: 0.82,
    noise: 0.12,
    air: 0.08,
    tone: 0.48,
    decay: 0.58,
    pitch: 0.42,
    character: 0.36,
  },
  snare: {
    voice: "snare",
    engineVersion: DRUM_SYNTH_ENGINE_VERSION,
    impact: 0.68,
    body: 0.62,
    noise: 0.72,
    air: 0.36,
    tone: 0.56,
    decay: 0.46,
    pitch: 0.5,
    character: 0.64,
  },
  clap: {
    voice: "clap",
    engineVersion: DRUM_SYNTH_ENGINE_VERSION,
    impact: 0.58,
    body: 0.18,
    noise: 0.84,
    air: 0.48,
    tone: 0.62,
    decay: 0.42,
    pitch: 0.5,
    character: 0.72,
  },
  closedHat: {
    voice: "closedHat",
    engineVersion: DRUM_SYNTH_ENGINE_VERSION,
    impact: 0.5,
    body: 0.18,
    noise: 0.54,
    air: 0.76,
    tone: 0.72,
    decay: 0.24,
    pitch: 0.62,
    character: 0.72,
  },
  openHat: {
    voice: "openHat",
    engineVersion: DRUM_SYNTH_ENGINE_VERSION,
    impact: 0.42,
    body: 0.2,
    noise: 0.62,
    air: 0.82,
    tone: 0.7,
    decay: 0.68,
    pitch: 0.6,
    character: 0.76,
  },
  tom: {
    voice: "tom",
    engineVersion: DRUM_SYNTH_ENGINE_VERSION,
    impact: 0.72,
    body: 0.9,
    noise: 0.025,
    air: 0.04,
    tone: 0.42,
    decay: 0.56,
    pitch: 0.45,
    character: 0.24,
  },
  percussion: {
    voice: "percussion",
    engineVersion: DRUM_SYNTH_ENGINE_VERSION,
    impact: 0.64,
    body: 0.66,
    noise: 0.03,
    air: 0.08,
    tone: 0.42,
    decay: 0.28,
    pitch: 0.52,
    character: 0.24,
  },
  crash: {
    voice: "crash",
    engineVersion: DRUM_SYNTH_ENGINE_VERSION,
    impact: 0.48,
    body: 0.18,
    noise: 0.68,
    air: 0.92,
    tone: 0.72,
    decay: 0.86,
    pitch: 0.62,
    character: 0.82,
  },
};

export const DRUM_MATERIAL_PARAMS: readonly DrumMaterialParam[] = [
  "impact",
  "body",
  "noise",
  "air",
  "tone",
  "decay",
  "pitch",
  "character",
];

export const DRUM_MATERIAL_LABELS: Record<
  DrumVoiceId,
  Partial<Record<DrumMaterialParam, string>>
> = {
  kick: { character: "SUB", noise: "CLICK", air: "EDGE", pitch: "TUNE" },
  snare: { character: "SNAP", air: "WIRE", pitch: "TUNE" },
  clap: { character: "SPREAD", body: "THICK", pitch: "COLOR" },
  closedHat: { character: "METAL", body: "RING", pitch: "TUNE" },
  openHat: { character: "METAL", body: "RING", pitch: "TUNE" },
  tom: { character: "SHELL", noise: "STICK", pitch: "TUNE" },
  percussion: { character: "MATERIAL", noise: "ATTACK", pitch: "TUNE" },
  crash: { character: "METAL", body: "WASH", pitch: "TUNE" },
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function cloneSpec(spec: DrumMaterialSpec): DrumMaterialSpec {
  return { ...spec };
}

function cloneSampleSpec(spec: SampleSoundSpec): SampleSoundSpec {
  return { ...spec };
}

function cloneSoundSpec(spec: SoundSpec): SoundSpec {
  if (spec.kind === "synth") {
    return {
      ...spec,
      params: { ...spec.params },
    };
  }

  if (spec.kind === "sample") {
    return cloneSampleSpec(spec);
  }

  return {
    ...spec,
    sample: cloneSampleSpec(spec.sample),
    layers: spec.layers.map((layer) => ({
      ...layer,
      params: { ...layer.params },
    })),
  };
}

function defaultSourceStates(): Record<DrumVoiceId, DrumVoiceSourceState> {
  return Object.fromEntries(
    DRUM_PADS.map((pad) => [
      pad.voice,
      {
        mode: "synth" as const,
        synthGainDb: -3,
      },
    ]),
  ) as Record<DrumVoiceId, DrumVoiceSourceState>;
}

function cloneSourceState(
  state: DrumVoiceSourceState,
): DrumVoiceSourceState {
  return {
    mode: state.mode,
    sample: state.sample ? cloneSampleSpec(state.sample) : undefined,
    synthGainDb: state.synthGainDb,
  };
}

function cloneSourceStates(
  states: Record<DrumVoiceId, DrumVoiceSourceState>,
): Record<DrumVoiceId, DrumVoiceSourceState> {
  return Object.fromEntries(
    DRUM_PADS.map((pad) => [
      pad.voice,
      cloneSourceState(states[pad.voice]),
    ]),
  ) as Record<DrumVoiceId, DrumVoiceSourceState>;
}

function cloneSpecs(
  specs: Record<DrumVoiceId, DrumMaterialSpec>,
): Record<DrumVoiceId, DrumMaterialSpec> {
  return Object.fromEntries(
    Object.entries(specs).map(([voice, spec]) => [
      voice,
      cloneSpec(spec),
    ]),
  ) as Record<DrumVoiceId, DrumMaterialSpec>;
}

function cloneActiveKit(
  activeKit: ActiveGeneratedKit | undefined,
): ActiveGeneratedKit | undefined {
  if (!activeKit) return undefined;

  return {
    kit: {
      ...activeKit.kit,
      slots: activeKit.kit.slots.map((slot) => ({ ...slot })),
      provenance: activeKit.kit.provenance
        ? {
            ...activeKit.kit.provenance,
            style: { ...activeKit.kit.provenance.style },
            intent: { ...activeKit.kit.provenance.intent },
          }
        : undefined,
    },
    sounds: activeKit.sounds.map((sound) => ({
      ...sound,
      spec: cloneSoundSpec(sound.spec),
      provenance: sound.provenance
        ? {
            ...sound.provenance,
            style: { ...sound.provenance.style },
            intent: { ...sound.provenance.intent },
          }
        : undefined,
    })),
    direction: activeKit.direction,
    seed: activeKit.seed,
    dna: { ...activeKit.dna },
    modified: activeKit.modified,
  };
}

function cloneMorphEndpoint(
  endpoint: SoundMorphEndpoint | undefined,
): SoundMorphEndpoint | undefined {
  if (!endpoint) return undefined;
  return {
    label: endpoint.label,
    specs: cloneSpecs(endpoint.specs),
    sourceStates: cloneSourceStates(endpoint.sourceStates),
    activeKit: cloneActiveKit(endpoint.activeKit),
  };
}

export class DrumSoundStore {
  private listeners = new Set<StoreListener>();
  private specs = cloneSpecs(DRUM_DEFAULT_SPECS);
  private sourceStates = defaultSourceStates();
  private activeKit: ActiveGeneratedKit | undefined;
  private morphA: SoundMorphEndpoint | undefined;
  private morphB: SoundMorphEndpoint | undefined;
  private revision = 0;
  private snapshot: DrumSoundSnapshot = this.buildSnapshot();

  readonly subscribe = (listener: StoreListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): DrumSoundSnapshot => this.snapshot;

  restoreProjectState(
    state: Omit<DrumSoundSnapshot, "revision">,
  ): void {
    this.specs = cloneSpecs(state.specs);
    this.sourceStates = cloneSourceStates(state.sourceStates);
    this.activeKit = cloneActiveKit(state.activeKit);
    this.morphA = cloneMorphEndpoint(state.morphA);
    this.morphB = cloneMorphEndpoint(state.morphB);
    this.publish();
  }

  getSpec(voice: DrumVoiceId): DrumMaterialSpec {
    return cloneSpec(this.specs[voice]);
  }

  getSourceState(voice: DrumVoiceId): DrumVoiceSourceState {
    return cloneSourceState(this.sourceStates[voice]);
  }

  restoreSourceState(
    voice: DrumVoiceId,
    state: DrumVoiceSourceState,
  ): void {
    this.sourceStates = {
      ...this.sourceStates,
      [voice]: cloneSourceState(state),
    };
    this.syncActiveKitSoundSpec(voice, true);
    this.publish();
  }

  assignSampleSpec(
    voice: DrumVoiceId,
    sample: SampleSoundSpec,
    mode: DrumSourceMode = "sample",
  ): void {
    this.sourceStates = {
      ...this.sourceStates,
      [voice]: {
        ...this.sourceStates[voice],
        mode,
        sample: cloneSampleSpec(sample),
      },
    };
    this.syncActiveKitSoundSpec(voice, true);
    this.publish();
  }

  assignSample(
    voice: DrumVoiceId,
    assetId: string,
    durationSeconds?: number,
  ): void {
    const end =
      durationSeconds && durationSeconds > 0
        ? durationSeconds
        : undefined;
    this.sourceStates = {
      ...this.sourceStates,
      [voice]: {
        ...this.sourceStates[voice],
        mode: "sample",
        sample: {
          kind: "sample",
          assetId,
          trimStartSeconds: 0,
          trimEndSeconds: end,
          gainDb: 0,
          pitchSemitones: 0,
          reversed: false,
        },
      },
    };
    this.syncActiveKitSoundSpec(voice, true);
    this.publish();
  }

  setSourceMode(
    voice: DrumVoiceId,
    mode: DrumSourceMode,
  ): boolean {
    const current = this.sourceStates[voice];
    if (mode !== "synth" && !current.sample) return false;
    if (current.mode === mode) return true;

    this.sourceStates = {
      ...this.sourceStates,
      [voice]: {
        ...current,
        mode,
      },
    };
    this.syncActiveKitSoundSpec(voice, true);
    this.publish();
    return true;
  }

  setSampleTrim(
    voice: DrumVoiceId,
    startSeconds: number,
    endSeconds?: number,
  ): void {
    const current = this.sourceStates[voice];
    if (!current.sample) return;

    const start = Math.max(0, Number.isFinite(startSeconds) ? startSeconds : 0);
    const rawEnd =
      endSeconds === undefined || !Number.isFinite(endSeconds)
        ? undefined
        : Math.max(start + 0.001, endSeconds);

    this.sourceStates = {
      ...this.sourceStates,
      [voice]: {
        ...current,
        sample: {
          ...current.sample,
          trimStartSeconds: start,
          trimEndSeconds: rawEnd,
        },
      },
    };
    this.syncActiveKitSoundSpec(voice, true);
    this.publish();
  }

  setSampleGainDb(voice: DrumVoiceId, gainDb: number): void {
    const current = this.sourceStates[voice];
    if (!current.sample) return;
    const safe = Math.max(-36, Math.min(12, gainDb));

    this.sourceStates = {
      ...this.sourceStates,
      [voice]: {
        ...current,
        sample: { ...current.sample, gainDb: safe },
      },
    };
    this.syncActiveKitSoundSpec(voice, true);
    this.publish();
  }

  setSamplePitchSemitones(
    voice: DrumVoiceId,
    pitchSemitones: number,
  ): void {
    const current = this.sourceStates[voice];
    if (!current.sample) return;
    const safe = Math.max(-24, Math.min(24, pitchSemitones));

    this.sourceStates = {
      ...this.sourceStates,
      [voice]: {
        ...current,
        sample: {
          ...current.sample,
          pitchSemitones: safe,
        },
      },
    };
    this.syncActiveKitSoundSpec(voice, true);
    this.publish();
  }

  setSampleReversed(voice: DrumVoiceId, reversed: boolean): void {
    const current = this.sourceStates[voice];
    if (!current.sample) return;

    this.sourceStates = {
      ...this.sourceStates,
      [voice]: {
        ...current,
        sample: {
          ...current.sample,
          reversed,
        },
      },
    };
    this.syncActiveKitSoundSpec(voice, true);
    this.publish();
  }

  setHybridSynthGainDb(
    voice: DrumVoiceId,
    gainDb: number,
  ): void {
    const current = this.sourceStates[voice];
    const safe = Math.max(-24, Math.min(6, gainDb));
    if (Math.abs(current.synthGainDb - safe) < 0.0001) return;

    this.sourceStates = {
      ...this.sourceStates,
      [voice]: {
        ...current,
        synthGainDb: safe,
      },
    };
    this.syncActiveKitSoundSpec(voice, true);
    this.publish();
  }

  clearVoiceSample(voice: DrumVoiceId): void {
    const current = this.sourceStates[voice];
    if (!current.sample && current.mode === "synth") return;

    this.sourceStates = {
      ...this.sourceStates,
      [voice]: {
        mode: "synth",
        synthGainDb: current.synthGainDb,
      },
    };
    this.syncActiveKitSoundSpec(voice, true);
    this.publish();
  }

  detachSampleAsset(assetId: string): void {
    let changed = false;
    const next = cloneSourceStates(this.sourceStates);

    for (const pad of DRUM_PADS) {
      const state = next[pad.voice];
      if (state.sample?.assetId !== assetId) continue;
      next[pad.voice] = {
        mode: "synth",
        synthGainDb: state.synthGainDb,
      };
      changed = true;
    }

    if (!changed) return;
    this.sourceStates = next;
    for (const pad of DRUM_PADS) {
      this.syncActiveKitSoundSpec(pad.voice, true);
    }
    this.publish();
  }

  resolvePlaybackSound(
    kitSlotId: string,
    fallbackVoice: DrumVoiceId,
  ): { voice: DrumVoiceId; spec: SoundSpec } {
    const voice = this.resolveVoiceForSlot(
      kitSlotId,
      fallbackVoice,
    );
    return {
      voice,
      spec: this.buildEffectiveSoundSpec(voice),
    };
  }

  resolveVoiceForSlot(
    kitSlotId: string,
    fallbackVoice: DrumVoiceId,
  ): DrumVoiceId {
    const activeKit = this.activeKit;
    if (!activeKit) return fallbackVoice;

    const slot = activeKit.kit.slots.find(
      (entry) => entry.id === kitSlotId,
    );
    if (!slot) return fallbackVoice;

    const sound = activeKit.sounds.find(
      (entry) => entry.id === slot.soundId,
    );
    if (!sound) {
      return fallbackVoice;
    }

    const synthSpec =
      sound.spec.kind === "synth"
        ? sound.spec
        : sound.spec.kind === "hybrid"
          ? sound.spec.layers[0]
          : undefined;
    if (!synthSpec) return fallbackVoice;

    const sourceVoice = synthSpec.params.sourceVoice;
    if (
      typeof sourceVoice !== "string" ||
      !DRUM_PADS.some((pad) => pad.voice === sourceVoice)
    ) {
      return fallbackVoice;
    }

    return sourceVoice as DrumVoiceId;
  }

  captureMorphEndpoint(slot: "A" | "B"): void {
    const endpoint: SoundMorphEndpoint = {
      label:
        this.activeKit?.kit.name ??
        ("CUSTOM / REV " + String(this.revision).padStart(3, "0")),
      specs: cloneSpecs(this.specs),
      sourceStates: cloneSourceStates(this.sourceStates),
      activeKit: cloneActiveKit(this.activeKit),
    };

    if (slot === "A") {
      this.morphA = endpoint;
    } else {
      this.morphB = endpoint;
    }

    this.publish();
  }

  clearMorphEndpoints(): void {
    if (!this.morphA && !this.morphB) return;
    this.morphA = undefined;
    this.morphB = undefined;
    this.publish();
  }

  applySpecSet(
    specs: Record<DrumVoiceId, DrumMaterialSpec>,
    markModified = true,
  ): void {
    const next = {} as Record<DrumVoiceId, DrumMaterialSpec>;

    for (const pad of DRUM_PADS) {
      const spec = specs[pad.voice];
      next[pad.voice] = {
        ...spec,
        voice: pad.voice,
        engineVersion: DRUM_SYNTH_ENGINE_VERSION,
        impact: clamp01(spec.impact),
        body: clamp01(spec.body),
        noise: clamp01(spec.noise),
        air: clamp01(spec.air),
        tone: clamp01(spec.tone),
        decay: clamp01(spec.decay),
        pitch: clamp01(spec.pitch),
        character: clamp01(spec.character),
      };
    }

    this.specs = next;
    if (this.activeKit) {
      for (const pad of DRUM_PADS) {
        this.syncActiveKitSoundSpec(pad.voice, markModified);
      }
    }
    this.publish();
  }

  setParam(
    voice: DrumVoiceId,
    param: DrumMaterialParam,
    value: number,
  ): void {
    const next = clamp01(value);
    if (this.specs[voice][param] === next) return;

    this.specs = {
      ...this.specs,
      [voice]: {
        ...this.specs[voice],
        [param]: next,
      },
    };
    this.syncActiveKitSoundSpec(voice, true);
    this.publish();
  }

  setSpec(voice: DrumVoiceId, spec: DrumMaterialSpec): void {
    this.specs = {
      ...this.specs,
      [voice]: {
        ...spec,
        voice,
        engineVersion: DRUM_SYNTH_ENGINE_VERSION,
        impact: clamp01(spec.impact),
        body: clamp01(spec.body),
        noise: clamp01(spec.noise),
        air: clamp01(spec.air),
        tone: clamp01(spec.tone),
        decay: clamp01(spec.decay),
        pitch: clamp01(spec.pitch),
        character: clamp01(spec.character),
      },
    };
    this.syncActiveKitSoundSpec(voice, true);
    this.publish();
  }

  applyGeneratedKit(input: {
    specs: Record<DrumVoiceId, DrumMaterialSpec>;
    kit: Kit;
    sounds: Sound[];
    direction: string;
    seed: string;
    dna: KitDNA;
  }): void {
    const next = {} as Record<DrumVoiceId, DrumMaterialSpec>;

    for (const pad of DRUM_PADS) {
      const spec = input.specs[pad.voice];
      next[pad.voice] = {
        ...spec,
        voice: pad.voice,
        engineVersion: DRUM_SYNTH_ENGINE_VERSION,
        impact: clamp01(spec.impact),
        body: clamp01(spec.body),
        noise: clamp01(spec.noise),
        air: clamp01(spec.air),
        tone: clamp01(spec.tone),
        decay: clamp01(spec.decay),
        pitch: clamp01(spec.pitch),
        character: clamp01(spec.character),
      };
    }

    this.specs = next;
    this.activeKit = {
      kit: {
        ...input.kit,
        slots: input.kit.slots.map((slot) => ({ ...slot })),
        provenance: input.kit.provenance
          ? {
              ...input.kit.provenance,
              style: { ...input.kit.provenance.style },
              intent: { ...input.kit.provenance.intent },
            }
          : undefined,
      },
      sounds: input.sounds.map((sound) => ({
        ...sound,
        spec: cloneSoundSpec(sound.spec),
        provenance: sound.provenance
          ? {
              ...sound.provenance,
              style: { ...sound.provenance.style },
              intent: { ...sound.provenance.intent },
            }
          : undefined,
      })),
      direction: input.direction,
      seed: input.seed,
      dna: { ...input.dna },
      modified: false,
    };

    for (const pad of DRUM_PADS) {
      this.syncActiveKitSoundSpec(pad.voice, false);
    }
    this.publish();
  }

  resetVoice(voice: DrumVoiceId): void {
    this.specs = {
      ...this.specs,
      [voice]: cloneSpec(DRUM_DEFAULT_SPECS[voice]),
    };
    this.syncActiveKitSoundSpec(voice, true);
    this.publish();
  }

  resetAll(): void {
    this.specs = cloneSpecs(DRUM_DEFAULT_SPECS);
    this.sourceStates = defaultSourceStates();
    this.activeKit = undefined;
    this.morphA = undefined;
    this.morphB = undefined;
    this.publish();
  }

  toSynthSoundSpec(voice: DrumVoiceId): SynthSoundSpec {
    const spec = this.specs[voice];
    return {
      kind: "synth",
      voice:
        voice === "closedHat" || voice === "openHat"
          ? "hat"
          : voice === "crash"
            ? "custom"
            : voice,
      engineVersion: DRUM_SYNTH_ENGINE_VERSION,
      params: {
        sourceVoice: voice,
        impact: spec.impact,
        body: spec.body,
        noise: spec.noise,
        air: spec.air,
        tone: spec.tone,
        decay: spec.decay,
        pitch: spec.pitch,
        character: spec.character,
      },
    };
  }

  private buildEffectiveSoundSpec(
    voice: DrumVoiceId,
  ): SoundSpec {
    const state = this.sourceStates[voice];
    const synth = this.toSynthSoundSpec(voice);

    if (!state.sample || state.mode === "synth") {
      return synth;
    }

    if (state.mode === "sample") {
      return cloneSampleSpec(state.sample);
    }

    const hybrid: HybridSoundSpec = {
      kind: "hybrid",
      sample: cloneSampleSpec(state.sample),
      layers: [synth],
      synthGainDb: state.synthGainDb,
    };
    return hybrid;
  }

  private syncActiveKitSoundSpec(
    voice: DrumVoiceId,
    markModified: boolean,
  ): void {
    if (!this.activeKit) return;

    const lane = SEQUENCER_LANES.find(
      (entry) => entry.voice === voice,
    );
    if (!lane) return;

    const slot = this.activeKit.kit.slots.find(
      (entry) => entry.id === lane.kitSlotId,
    );
    if (!slot) return;

    this.activeKit = {
      ...this.activeKit,
      sounds: this.activeKit.sounds.map((sound) =>
        sound.id === slot.soundId
          ? {
              ...sound,
              spec: cloneSoundSpec(
                this.buildEffectiveSoundSpec(voice),
              ),
            }
          : sound,
      ),
      modified: markModified
        ? true
        : this.activeKit.modified,
    };
  }

  private publish(): void {
    this.revision += 1;
    this.snapshot = this.buildSnapshot();

    for (const listener of this.listeners) {
      listener();
    }
  }

  private buildSnapshot(): DrumSoundSnapshot {
    return {
      specs: cloneSpecs(this.specs),
      sourceStates: cloneSourceStates(this.sourceStates),
      activeKit: cloneActiveKit(this.activeKit),
      morphA: cloneMorphEndpoint(this.morphA),
      morphB: cloneMorphEndpoint(this.morphB),
      revision: this.revision,
    };
  }
}

export const drumSoundStore = new DrumSoundStore();

export const DRUM_SYNTH_V2_META = Object.freeze({
  engineVersion: DRUM_SYNTH_ENGINE_VERSION,
  voices: DRUM_PADS.map((pad) => pad.voice),
  parameters: [...DRUM_MATERIAL_PARAMS],
});
