import type {
  MelodicTrackId,
} from "../music/foundationPattern";

export interface MelodicPreset {
  id: string;
  label: string;
  wave: OscillatorType;
  secondaryWave?: OscillatorType;
  detuneCents?: number;
  secondaryGain?: number;
  subWave?: OscillatorType;
  subOctave?: 1 | 2;
  subGain?: number;
  unisonDetuneCents?: number;
  unisonGain?: number;
  attackSeconds: number;
  releaseSeconds: number;
  filterHz: number;
  filterEnvelopeOctaves?: number;
  filterDecaySeconds?: number;
  resonance: number;
  drive?: number;
  /** Perceptual velocity curve. 1 = linear; >1 creates more dynamic headroom. */
  velocityGainExponent?: number;
  /** How strongly velocity opens/closes the filter around the authored cutoff. */
  velocityToFilterOctaves?: number;
  /** Per-voice deterministic stereo spread. Bass presets intentionally stay narrow. */
  stereoWidth?: number;
  gain: number;
}

export const MELODIC_PRESETS: Readonly<
  Record<
    MelodicTrackId,
    readonly MelodicPreset[]
  >
> = Object.freeze({
  bass: [
    {
      id: "sub",
      label: "Sub",
      wave: "sine",
      secondaryWave: "triangle",
      detuneCents: 0,
      secondaryGain: 0.18,
      subWave: "sine",
      subOctave: 1,
      subGain: 0.12,
      velocityGainExponent: 0.9,
      velocityToFilterOctaves: 0.45,
      stereoWidth: 0.02,
      attackSeconds: 0.008,
      releaseSeconds: 0.1,
      filterHz: 520,
      filterEnvelopeOctaves: 0.35,
      filterDecaySeconds: 0.16,
      resonance: 0.7,
      drive: 0.04,
      gain: 0.64,
    },
    {
      id: "pluck",
      label: "Pluck",
      wave: "sawtooth",
      secondaryWave: "square",
      detuneCents: -5,
      secondaryGain: 0.14,
      unisonDetuneCents: 6,
      unisonGain: 0.11,
      velocityGainExponent: 1.05,
      velocityToFilterOctaves: 1.2,
      stereoWidth: 0.08,
      attackSeconds: 0.003,
      releaseSeconds: 0.055,
      filterHz: 820,
      filterEnvelopeOctaves: 2.4,
      filterDecaySeconds: 0.12,
      resonance: 1.5,
      drive: 0.1,
      gain: 0.42,
    },
    {
      id: "round",
      label: "Round",
      wave: "triangle",
      secondaryWave: "sine",
      detuneCents: 4,
      secondaryGain: 0.24,
      subWave: "sine",
      subOctave: 1,
      subGain: 0.08,
      velocityGainExponent: 0.94,
      velocityToFilterOctaves: 0.65,
      stereoWidth: 0.05,
      attackSeconds: 0.012,
      releaseSeconds: 0.14,
      filterHz: 760,
      filterEnvelopeOctaves: 0.65,
      filterDecaySeconds: 0.2,
      resonance: 0.65,
      drive: 0.05,
      gain: 0.54,
    },
    {
      id: "acid",
      label: "Acid",
      wave: "sawtooth",
      secondaryWave: "square",
      detuneCents: 7,
      secondaryGain: 0.12,
      unisonDetuneCents: 8,
      unisonGain: 0.08,
      velocityGainExponent: 1.02,
      velocityToFilterOctaves: 1.6,
      stereoWidth: 0.08,
      attackSeconds: 0.002,
      releaseSeconds: 0.075,
      filterHz: 760,
      filterEnvelopeOctaves: 3.1,
      filterDecaySeconds: 0.19,
      resonance: 5.4,
      drive: 0.34,
      gain: 0.34,
    },
    {
      id: "reese",
      label: "Reese",
      wave: "sawtooth",
      secondaryWave: "sawtooth",
      detuneCents: -12,
      secondaryGain: 0.23,
      unisonDetuneCents: 12,
      unisonGain: 0.2,
      velocityGainExponent: 0.92,
      velocityToFilterOctaves: 0.9,
      stereoWidth: 0.16,
      attackSeconds: 0.018,
      releaseSeconds: 0.18,
      filterHz: 1050,
      filterEnvelopeOctaves: 0.45,
      filterDecaySeconds: 0.28,
      resonance: 0.9,
      drive: 0.22,
      gain: 0.34,
    },
    {
      id: "picked",
      label: "Picked",
      wave: "square",
      secondaryWave: "triangle",
      detuneCents: 3,
      secondaryGain: 0.18,
      velocityGainExponent: 1.08,
      velocityToFilterOctaves: 1.3,
      stereoWidth: 0.07,
      attackSeconds: 0.002,
      releaseSeconds: 0.065,
      filterHz: 1250,
      filterEnvelopeOctaves: 2,
      filterDecaySeconds: 0.09,
      resonance: 1.05,
      drive: 0.08,
      gain: 0.38,
    },
  ],
  chords: [
    {
      id: "warm",
      label: "Warm",
      wave: "sawtooth",
      secondaryWave: "triangle",
      detuneCents: 7,
      secondaryGain: 0.22,
      unisonDetuneCents: 7,
      unisonGain: 0.12,
      velocityGainExponent: 0.88,
      velocityToFilterOctaves: 0.6,
      stereoWidth: 0.38,
      attackSeconds: 0.028,
      releaseSeconds: 0.24,
      filterHz: 1900,
      filterEnvelopeOctaves: 0.55,
      filterDecaySeconds: 0.34,
      resonance: 0.55,
      drive: 0.06,
      gain: 0.2,
    },
    {
      id: "glass",
      label: "Glass",
      wave: "sine",
      secondaryWave: "triangle",
      detuneCents: 12,
      secondaryGain: 0.28,
      unisonDetuneCents: 5,
      unisonGain: 0.08,
      velocityGainExponent: 0.94,
      velocityToFilterOctaves: 0.8,
      stereoWidth: 0.42,
      attackSeconds: 0.012,
      releaseSeconds: 0.34,
      filterHz: 5200,
      filterEnvelopeOctaves: 0.7,
      filterDecaySeconds: 0.28,
      resonance: 1.15,
      gain: 0.23,
    },
    {
      id: "organ",
      label: "Organ",
      wave: "square",
      secondaryWave: "sine",
      detuneCents: 0,
      secondaryGain: 0.24,
      subWave: "sine",
      subOctave: 1,
      subGain: 0.08,
      velocityGainExponent: 0.82,
      velocityToFilterOctaves: 0.3,
      stereoWidth: 0.18,
      attackSeconds: 0.01,
      releaseSeconds: 0.1,
      filterHz: 2800,
      resonance: 0.4,
      drive: 0.08,
      gain: 0.17,
    },
    {
      id: "keys",
      label: "Soft Keys",
      wave: "triangle",
      secondaryWave: "sine",
      detuneCents: 5,
      secondaryGain: 0.18,
      velocityGainExponent: 1,
      velocityToFilterOctaves: 1.1,
      stereoWidth: 0.28,
      attackSeconds: 0.008,
      releaseSeconds: 0.28,
      filterHz: 2300,
      filterEnvelopeOctaves: 1.6,
      filterDecaySeconds: 0.24,
      resonance: 0.72,
      drive: 0.05,
      gain: 0.22,
    },
    {
      id: "air-pad",
      label: "Air Pad",
      wave: "sawtooth",
      secondaryWave: "triangle",
      detuneCents: -9,
      secondaryGain: 0.2,
      unisonDetuneCents: 11,
      unisonGain: 0.16,
      velocityGainExponent: 0.78,
      velocityToFilterOctaves: 0.45,
      stereoWidth: 0.48,
      attackSeconds: 0.16,
      releaseSeconds: 0.72,
      filterHz: 2500,
      filterEnvelopeOctaves: 0.5,
      filterDecaySeconds: 0.8,
      resonance: 0.65,
      drive: 0.04,
      gain: 0.15,
    },
    {
      id: "stab",
      label: "Stab",
      wave: "sawtooth",
      secondaryWave: "square",
      detuneCents: 4,
      secondaryGain: 0.12,
      unisonDetuneCents: 6,
      unisonGain: 0.09,
      velocityGainExponent: 1.08,
      velocityToFilterOctaves: 1.3,
      stereoWidth: 0.32,
      attackSeconds: 0.002,
      releaseSeconds: 0.075,
      filterHz: 1450,
      filterEnvelopeOctaves: 2.4,
      filterDecaySeconds: 0.12,
      resonance: 1.1,
      drive: 0.16,
      gain: 0.19,
    },
  ],
  lead: [
    {
      id: "soft",
      label: "Soft",
      wave: "triangle",
      secondaryWave: "sine",
      detuneCents: 5,
      secondaryGain: 0.2,
      unisonDetuneCents: 4,
      unisonGain: 0.08,
      velocityGainExponent: 0.92,
      velocityToFilterOctaves: 0.75,
      stereoWidth: 0.2,
      attackSeconds: 0.018,
      releaseSeconds: 0.16,
      filterHz: 3600,
      filterEnvelopeOctaves: 0.6,
      filterDecaySeconds: 0.22,
      resonance: 0.65,
      drive: 0.04,
      gain: 0.36,
    },
    {
      id: "bright",
      label: "Bright",
      wave: "sawtooth",
      secondaryWave: "triangle",
      detuneCents: 9,
      secondaryGain: 0.18,
      unisonDetuneCents: 7,
      unisonGain: 0.1,
      velocityGainExponent: 1,
      velocityToFilterOctaves: 1,
      stereoWidth: 0.28,
      attackSeconds: 0.005,
      releaseSeconds: 0.12,
      filterHz: 7200,
      filterEnvelopeOctaves: 0.7,
      filterDecaySeconds: 0.12,
      resonance: 0.9,
      drive: 0.08,
      gain: 0.26,
    },
    {
      id: "square",
      label: "Square",
      wave: "square",
      secondaryWave: "sine",
      detuneCents: -4,
      secondaryGain: 0.16,
      velocityGainExponent: 1.03,
      velocityToFilterOctaves: 0.85,
      stereoWidth: 0.14,
      attackSeconds: 0.004,
      releaseSeconds: 0.09,
      filterHz: 4100,
      filterEnvelopeOctaves: 0.9,
      filterDecaySeconds: 0.14,
      resonance: 0.7,
      drive: 0.12,
      gain: 0.24,
    },
    {
      id: "pluck",
      label: "Pluck",
      wave: "triangle",
      secondaryWave: "square",
      detuneCents: 6,
      secondaryGain: 0.12,
      velocityGainExponent: 1.1,
      velocityToFilterOctaves: 1.4,
      stereoWidth: 0.18,
      attackSeconds: 0.002,
      releaseSeconds: 0.07,
      filterHz: 2100,
      filterEnvelopeOctaves: 2.8,
      filterDecaySeconds: 0.1,
      resonance: 1.35,
      drive: 0.08,
      gain: 0.3,
    },
    {
      id: "bell",
      label: "Bell",
      wave: "sine",
      secondaryWave: "triangle",
      detuneCents: 19,
      secondaryGain: 0.3,
      unisonDetuneCents: 4,
      unisonGain: 0.08,
      velocityGainExponent: 0.95,
      velocityToFilterOctaves: 0.8,
      stereoWidth: 0.34,
      attackSeconds: 0.003,
      releaseSeconds: 0.42,
      filterHz: 7600,
      filterEnvelopeOctaves: 0.5,
      filterDecaySeconds: 0.34,
      resonance: 1.6,
      gain: 0.25,
    },
    {
      id: "neon",
      label: "Neon",
      wave: "sawtooth",
      secondaryWave: "square",
      detuneCents: -7,
      secondaryGain: 0.15,
      unisonDetuneCents: 9,
      unisonGain: 0.13,
      velocityGainExponent: 1,
      velocityToFilterOctaves: 1.2,
      stereoWidth: 0.3,
      attackSeconds: 0.004,
      releaseSeconds: 0.14,
      filterHz: 5100,
      filterEnvelopeOctaves: 1.4,
      filterDecaySeconds: 0.16,
      resonance: 1.05,
      drive: 0.24,
      gain: 0.23,
    },
  ],
});


function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function melodicLayerCompensation(
  preset: MelodicPreset,
): number {
  const secondary = Math.max(
    0,
    Math.min(0.65, preset.secondaryGain ?? (preset.secondaryWave ? 0.32 : 0)),
  );
  const unison = Math.max(
    0,
    Math.min(0.5, preset.unisonGain ?? 0),
  ) * 0.64;
  const sub = Math.max(
    0,
    Math.min(0.5, preset.subGain ?? 0),
  );
  const energy =
    1 +
    secondary * secondary +
    unison * unison * 2 +
    sub * sub;

  return Math.max(
    0.72,
    Math.min(1, 1 / Math.sqrt(energy)),
  );
}

export function melodicVelocityGain(
  preset: MelodicPreset,
  velocity: number,
): number {
  const safe = Math.max(0.02, clamp01(velocity));
  const exponent = Math.max(
    0.55,
    Math.min(1.45, preset.velocityGainExponent ?? 1),
  );
  return Math.pow(safe, exponent);
}

export function melodicVelocityFilterMultiplier(
  preset: MelodicPreset,
  velocity: number,
): number {
  const safe = clamp01(velocity);
  const octaves = Math.max(
    0,
    Math.min(2, preset.velocityToFilterOctaves ?? 0.7),
  );
  return Math.pow(2, (safe - 0.76) * octaves);
}

export function melodicFilterEnvelopeVelocityScale(
  velocity: number,
): number {
  const safe = clamp01(velocity);
  return 0.52 + safe * 0.48;
}

export function melodicPresetStereoWidth(
  preset: MelodicPreset,
): number {
  return Math.max(
    0,
    Math.min(0.75, preset.stereoWidth ?? 0.12),
  );
}
