import type { DrumMaterialParam } from "../audio/drumSoundModel";
import {
  DRUM_MATERIAL_LABELS,
  DRUM_MATERIAL_PARAMS,
} from "../audio/drumSoundModel";
import {
  DRUM_PADS,
  type DrumVoiceId,
} from "../music/foundationPattern";

export type ModulationTargetScope = "engine" | "voice";

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

export const MODULATION_TARGETS: readonly ModulationTargetDefinition[] =
  Object.freeze([...ENGINE_TARGETS, ...VOICE_TARGETS]);

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
