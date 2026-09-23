import {
  clampMasteringState,
  cloneMasteringState,
  type MasteringPlan,
  type MasteringState,
  type MasterPresetId,
} from "../master/masteringModel";

interface MasterTarget {
  inputTrimDb: number;
  lowDb: number;
  highDb: number;
  glue: number;
  width: number;
  outputGainDb: number;
  ceilingDb: number;
}

const TARGETS: Record<MasterPresetId, MasterTarget> = {
  clean: {
    inputTrimDb: -0.5,
    lowDb: 0.2,
    highDb: 0.35,
    glue: 0.22,
    width: 1.04,
    outputGainDb: 1.2,
    ceilingDb: -0.9,
  },
  punchy: {
    inputTrimDb: -0.8,
    lowDb: 0.55,
    highDb: 0.2,
    glue: 0.48,
    width: 1.02,
    outputGainDb: 2.1,
    ceilingDb: -0.8,
  },
  dynamic: {
    inputTrimDb: -0.4,
    lowDb: 0.1,
    highDb: 0.25,
    glue: 0.12,
    width: 1.06,
    outputGainDb: 0.8,
    ceilingDb: -1.1,
  },
  loud: {
    inputTrimDb: -1.2,
    lowDb: 0.35,
    highDb: 0.45,
    glue: 0.68,
    width: 1.05,
    outputGainDb: 4.1,
    ceilingDb: -0.6,
  },
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function lerp(a: number, b: number, amount: number): number {
  return a + (b - a) * clamp01(amount);
}

export function generateMasterPlan(input: {
  current: MasteringState;
  preset: MasterPresetId;
  intensity: number;
}): MasteringPlan {
  const amount = clamp01(input.intensity);
  const target = TARGETS[input.preset];
  const current = cloneMasteringState(input.current);

  const state = clampMasteringState({
    enabled: true,
    inputTrimDb: lerp(current.inputTrimDb, target.inputTrimDb, amount),
    lowDb: lerp(current.lowDb, target.lowDb, amount),
    highDb: lerp(current.highDb, target.highDb, amount),
    glue: lerp(current.glue, target.glue, amount),
    width: lerp(current.width, target.width, amount),
    outputGainDb: lerp(current.outputGainDb, target.outputGainDb, amount),
    ceilingDb: lerp(current.ceilingDb, target.ceilingDb, amount),
  });

  const previewLevelMatchDb = Math.max(
    -6,
    Math.min(
      6,
      current.outputGainDb -
        state.outputGainDb -
        (state.glue - current.glue) * 1.25,
    ),
  );

  const warnings: string[] = [];
  if (state.outputGainDb >= 5.5 && state.glue >= 0.65) {
    warnings.push(
      "High loudness drive: compare transients carefully before commit.",
    );
  }
  if (state.width > 1.35) {
    warnings.push(
      "Wide master setting: verify mono compatibility.",
    );
  }

  return {
    id:
      "master-plan-" +
      input.preset +
      "-" +
      Math.round(amount * 100),
    preset: input.preset,
    intensity: amount,
    state,
    previewLevelMatchDb,
    warnings,
  };
}
