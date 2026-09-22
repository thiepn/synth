import {
  DRUM_SYNTH_ENGINE_VERSION,
  type DrumMaterialSpec,
  type Kit,
  type Sound,
  type SynthSoundSpec,
} from "../domain/contracts";
import {
  DRUM_PADS,
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

export interface ActiveGeneratedKit {
  kit: Kit;
  sounds: Sound[];
  direction: string;
  seed: string;
  dna: Record<string, number>;
  modified: boolean;
}

export interface DrumSoundSnapshot {
  specs: Record<DrumVoiceId, DrumMaterialSpec>;
  activeKit?: ActiveGeneratedKit;
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
    impact: 0.62,
    body: 0.82,
    noise: 0.12,
    air: 0.08,
    tone: 0.48,
    decay: 0.58,
    pitch: 0.48,
    character: 0.42,
  },
  percussion: {
    voice: "percussion",
    engineVersion: DRUM_SYNTH_ENGINE_VERSION,
    impact: 0.54,
    body: 0.52,
    noise: 0.18,
    air: 0.22,
    tone: 0.58,
    decay: 0.36,
    pitch: 0.58,
    character: 0.66,
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
  tom: { character: "DROP", noise: "ATTACK", pitch: "TUNE" },
  percussion: { character: "FM", noise: "TEXTURE", pitch: "TUNE" },
  crash: { character: "METAL", body: "WASH", pitch: "TUNE" },
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function cloneSpec(spec: DrumMaterialSpec): DrumMaterialSpec {
  return { ...spec };
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

export class DrumSoundStore {
  private listeners = new Set<StoreListener>();
  private specs = cloneSpecs(DRUM_DEFAULT_SPECS);
  private activeKit: ActiveGeneratedKit | undefined;
  private revision = 0;
  private snapshot: DrumSoundSnapshot = this.buildSnapshot();

  readonly subscribe = (listener: StoreListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): DrumSoundSnapshot => this.snapshot;

  getSpec(voice: DrumVoiceId): DrumMaterialSpec {
    return cloneSpec(this.specs[voice]);
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
    if (this.activeKit) {
      this.activeKit = {
        ...this.activeKit,
        modified: true,
      };
    }
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
    if (this.activeKit) {
      this.activeKit = {
        ...this.activeKit,
        modified: true,
      };
    }
    this.publish();
  }

  applyGeneratedKit(input: {
    specs: Record<DrumVoiceId, DrumMaterialSpec>;
    kit: Kit;
    sounds: Sound[];
    direction: string;
    seed: string;
    dna: Record<string, number>;
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
        spec:
          sound.spec.kind === "synth"
            ? {
                ...sound.spec,
                params: { ...sound.spec.params },
              }
            : sound.spec,
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
    this.publish();
  }

  resetVoice(voice: DrumVoiceId): void {
    this.specs = {
      ...this.specs,
      [voice]: cloneSpec(DRUM_DEFAULT_SPECS[voice]),
    };
    if (this.activeKit) {
      this.activeKit = {
        ...this.activeKit,
        modified: true,
      };
    }
    this.publish();
  }

  resetAll(): void {
    this.specs = cloneSpecs(DRUM_DEFAULT_SPECS);
    this.activeKit = undefined;
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
      activeKit: this.activeKit
        ? {
            kit: {
              ...this.activeKit.kit,
              slots: this.activeKit.kit.slots.map((slot) => ({ ...slot })),
            },
            sounds: this.activeKit.sounds.map((sound) => ({ ...sound })),
            direction: this.activeKit.direction,
            seed: this.activeKit.seed,
            dna: { ...this.activeKit.dna },
            modified: this.activeKit.modified,
          }
        : undefined,
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
