export type MasterPresetId =
  | "clean"
  | "punchy"
  | "dynamic"
  | "loud";

export interface MasteringState {
  enabled: boolean;
  inputTrimDb: number;
  lowDb: number;
  highDb: number;
  glue: number;
  width: number;
  outputGainDb: number;
  ceilingDb: number;
}

export interface MasteringPlan {
  id: string;
  preset: MasterPresetId;
  intensity: number;
  state: MasteringState;
  previewLevelMatchDb: number;
  warnings: string[];
}

export const MASTERING_LIMITS = Object.freeze({
  inputTrimDb: [-12, 6] as const,
  eqDb: [-6, 6] as const,
  glue: [0, 1] as const,
  width: [0.5, 1.5] as const,
  outputGainDb: [-6, 8] as const,
  ceilingDb: [-3, -0.1] as const,
});

export function createDefaultMasteringState(): MasteringState {
  return {
    enabled: false,
    inputTrimDb: 0,
    lowDb: 0,
    highDb: 0,
    glue: 0.18,
    width: 1,
    outputGainDb: 0,
    ceilingDb: -1,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function clampMasteringState(
  state: MasteringState,
): MasteringState {
  return {
    ...state,
    enabled: Boolean(state.enabled),
    inputTrimDb: clamp(
      state.inputTrimDb,
      MASTERING_LIMITS.inputTrimDb[0],
      MASTERING_LIMITS.inputTrimDb[1],
    ),
    lowDb: clamp(
      state.lowDb,
      MASTERING_LIMITS.eqDb[0],
      MASTERING_LIMITS.eqDb[1],
    ),
    highDb: clamp(
      state.highDb,
      MASTERING_LIMITS.eqDb[0],
      MASTERING_LIMITS.eqDb[1],
    ),
    glue: clamp(
      state.glue,
      MASTERING_LIMITS.glue[0],
      MASTERING_LIMITS.glue[1],
    ),
    width: clamp(
      state.width,
      MASTERING_LIMITS.width[0],
      MASTERING_LIMITS.width[1],
    ),
    outputGainDb: clamp(
      state.outputGainDb,
      MASTERING_LIMITS.outputGainDb[0],
      MASTERING_LIMITS.outputGainDb[1],
    ),
    ceilingDb: clamp(
      state.ceilingDb,
      MASTERING_LIMITS.ceilingDb[0],
      MASTERING_LIMITS.ceilingDb[1],
    ),
  };
}

export function cloneMasteringState(
  state: MasteringState,
): MasteringState {
  return { ...state };
}
