import type {
  LaneMix,
} from "../domain/contracts";

export type LaneMixParameter =
  | "gainDb"
  | "pan"
  | "reverbSend";

export const DEFAULT_LANE_MIX: LaneMix = Object.freeze({
  gainDb: 0,
  pan: 0,
  reverbSend: 0,
});

export function clampLaneMix(
  value: Partial<LaneMix> | undefined,
): LaneMix {
  return {
    gainDb: Math.max(
      -24,
      Math.min(
        6,
        Number.isFinite(value?.gainDb)
          ? Number(value?.gainDb)
          : DEFAULT_LANE_MIX.gainDb,
      ),
    ),
    pan: Math.max(
      -1,
      Math.min(
        1,
        Number.isFinite(value?.pan)
          ? Number(value?.pan)
          : DEFAULT_LANE_MIX.pan,
      ),
    ),
    reverbSend: Math.max(
      0,
      Math.min(
        1,
        Number.isFinite(value?.reverbSend)
          ? Number(value?.reverbSend)
          : DEFAULT_LANE_MIX.reverbSend,
      ),
    ),
  };
}

export function laneMixValue(
  mix: LaneMix | undefined,
  parameter: LaneMixParameter,
): number {
  return clampLaneMix(mix)[parameter];
}

export function laneMixIsDefault(
  mix: LaneMix | undefined,
): boolean {
  const value = clampLaneMix(mix);
  return (
    Math.abs(value.gainDb) < 0.0001 &&
    Math.abs(value.pan) < 0.0001 &&
    Math.abs(value.reverbSend) < 0.0001
  );
}

export function dbToLaneGain(
  gainDb: number,
): number {
  if (!Number.isFinite(gainDb)) return 1;
  return Math.pow(10, gainDb / 20);
}
