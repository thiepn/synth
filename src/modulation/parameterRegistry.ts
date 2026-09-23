import type { DrumMaterialParam } from "../audio/drumSoundModel";
import {
  DRUM_MATERIAL_LABELS,
  DRUM_MATERIAL_PARAMS,
} from "../audio/drumSoundModel";
import {
  DRUM_PADS,
  type DrumVoiceId,
} from "../music/foundationPattern";
import {
  MIXER_EQ_MAX_DB,
  MIXER_EQ_MIN_DB,
  MIXER_GAIN_MAX_DB,
  MIXER_GAIN_MIN_DB,
} from "../mix/mixerModel";

export type ModulationTargetScope = "engine" | "voice" | "mixer";

export type MixerParameterId =
  | "gainDb"
  | "pan"
  | "lowDb"
  | "midDb"
  | "highDb"
  | "compression"
  | "saturation"
  | "reverbSend"
  | "sidechain";

export interface ModulationTargetDefinition {
  id: string;
  label: string;
  shortLabel: string;
  scope: ModulationTargetScope;
  min: number;
  max: number;
  defaultValue: number;
  voice?: DrumVoiceId;
  param?: DrumMaterialParam;
  mixerParam?: MixerParameterId | "masterGainDb";
}

const ENGINE_TARGETS: ModulationTargetDefinition[] = [
  {
    id: "engine.master",
    label: "Master Level",
    shortLabel: "MASTER",
    scope: "engine",
    min: 0,
    max: 1,
    defaultValue: 0.78,
  },
  {
    id: "engine.punch",
    label: "Punch",
    shortLabel: "PUNCH",
    scope: "engine",
    min: 0,
    max: 1,
    defaultValue: 0.7,
  },
  {
    id: "engine.tone",
    label: "Tone",
    shortLabel: "TONE",
    scope: "engine",
    min: 0,
    max: 1,
    defaultValue: 0.58,
  },
  {
    id: "engine.decay",
    label: "Decay",
    shortLabel: "DECAY",
    scope: "engine",
    min: 0,
    max: 1,
    defaultValue: 0.52,
  },
  {
    id: "engine.grit",
    label: "Grit",
    shortLabel: "GRIT",
    scope: "engine",
    min: 0,
    max: 1,
    defaultValue: 0.18,
  },
  {
    id: "engine.space",
    label: "Space",
    shortLabel: "SPACE",
    scope: "engine",
    min: 0,
    max: 1,
    defaultValue: 0.13,
  },
  {
    id: "engine.filter",
    label: "Performance Filter",
    shortLabel: "FILTER",
    scope: "engine",
    min: 0,
    max: 1,
    defaultValue: 1,
  },
];

const VOICE_TARGETS: ModulationTargetDefinition[] = DRUM_PADS.flatMap(
  (pad) =>
    DRUM_MATERIAL_PARAMS.map((param) => ({
      id: "voice." + pad.voice + "." + param,
      label:
        pad.label +
        " / " +
        (DRUM_MATERIAL_LABELS[pad.voice][param] ?? param.toUpperCase()),
      shortLabel:
        pad.code +
        " " +
        (DRUM_MATERIAL_LABELS[pad.voice][param] ?? param.toUpperCase()),
      scope: "voice" as const,
      min: 0,
      max: 1,
      defaultValue: 0.5,
      voice: pad.voice,
      param,
    })),
);

const MIXER_PARAMETERS: ReadonlyArray<{
  id: MixerParameterId;
  label: string;
  short: string;
  min: number;
  max: number;
  defaultValue: number;
}> = [
  {
    id: "gainDb",
    label: "Gain",
    short: "GAIN",
    min: MIXER_GAIN_MIN_DB,
    max: MIXER_GAIN_MAX_DB,
    defaultValue: 0,
  },
  {
    id: "pan",
    label: "Pan",
    short: "PAN",
    min: -1,
    max: 1,
    defaultValue: 0,
  },
  {
    id: "lowDb",
    label: "Low EQ",
    short: "LOW",
    min: MIXER_EQ_MIN_DB,
    max: MIXER_EQ_MAX_DB,
    defaultValue: 0,
  },
  {
    id: "midDb",
    label: "Mid EQ",
    short: "MID",
    min: MIXER_EQ_MIN_DB,
    max: MIXER_EQ_MAX_DB,
    defaultValue: 0,
  },
  {
    id: "highDb",
    label: "High EQ",
    short: "HIGH",
    min: MIXER_EQ_MIN_DB,
    max: MIXER_EQ_MAX_DB,
    defaultValue: 0,
  },
  {
    id: "compression",
    label: "Compression",
    short: "COMP",
    min: 0,
    max: 1,
    defaultValue: 0,
  },
  {
    id: "saturation",
    label: "Saturation",
    short: "SAT",
    min: 0,
    max: 1,
    defaultValue: 0,
  },
  {
    id: "reverbSend",
    label: "Reverb Send",
    short: "VERB",
    min: 0,
    max: 1,
    defaultValue: 1,
  },
  {
    id: "sidechain",
    label: "Sidechain",
    short: "SIDE",
    min: 0,
    max: 1,
    defaultValue: 0,
  },
];

const MIXER_TARGETS: ModulationTargetDefinition[] = [
  {
    id: "mixer.master.gainDb",
    label: "Mixer / Master Gain",
    shortLabel: "MASTER GAIN",
    scope: "mixer",
    min: MIXER_GAIN_MIN_DB,
    max: MIXER_GAIN_MAX_DB,
    defaultValue: 0,
    mixerParam: "masterGainDb",
  },
  ...DRUM_PADS.flatMap((pad) =>
    MIXER_PARAMETERS.map((param) => ({
      id: "mixer." + pad.voice + "." + param.id,
      label: pad.label + " / " + param.label,
      shortLabel: pad.code + " " + param.short,
      scope: "mixer" as const,
      min: param.min,
      max: param.max,
      defaultValue: param.defaultValue,
      voice: pad.voice,
      mixerParam: param.id,
    })),
  ),
];

export const MODULATION_TARGETS: readonly ModulationTargetDefinition[] =
  Object.freeze([
    ...ENGINE_TARGETS,
    ...VOICE_TARGETS,
    ...MIXER_TARGETS,
  ]);

const TARGETS_BY_ID = new Map(
  MODULATION_TARGETS.map((target) => [target.id, target]),
);

export function modulationTarget(
  targetId: string,
): ModulationTargetDefinition | undefined {
  return TARGETS_BY_ID.get(targetId);
}

export function voiceTargetId(
  voice: DrumVoiceId,
  param: DrumMaterialParam,
): string {
  return "voice." + voice + "." + param;
}

export function engineTargetId(
  macro:
    | "master"
    | "punch"
    | "tone"
    | "decay"
    | "grit"
    | "space"
    | "filter",
): string {
  return "engine." + macro;
}


export function mixerTargetId(
  voice: DrumVoiceId,
  param: MixerParameterId,
): string {
  return "mixer." + voice + "." + param;
}

export function mixerMasterTargetId(): string {
  return "mixer.master.gainDb";
}

export function normalizeTargetValue(
  targetId: string,
  value: number,
): number {
  const target = modulationTarget(targetId);
  if (!target || target.max <= target.min) return 0;
  return Math.max(
    0,
    Math.min(1, (value - target.min) / (target.max - target.min)),
  );
}

export function denormalizeTargetValue(
  targetId: string,
  value: number,
): number {
  const target = modulationTarget(targetId);
  if (!target) return value;
  const normalized = Math.max(0, Math.min(1, value));
  return target.min + normalized * (target.max - target.min);
}
