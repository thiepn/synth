import type {
  MelodicTrackId,
} from "../music/foundationPattern";

export interface MelodicPreset {
  id: string;
  label: string;
  wave: OscillatorType;
  secondaryWave?: OscillatorType;
  detuneCents?: number;
  attackSeconds: number;
  releaseSeconds: number;
  filterHz: number;
  resonance: number;
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
      attackSeconds: 0.008,
      releaseSeconds: 0.08,
      filterHz: 520,
      resonance: 0.7,
      gain: 0.72,
    },
    {
      id: "pluck",
      label: "Pluck",
      wave: "sawtooth",
      secondaryWave: "square",
      detuneCents: -5,
      attackSeconds: 0.004,
      releaseSeconds: 0.045,
      filterHz: 980,
      resonance: 1.2,
      gain: 0.48,
    },
    {
      id: "round",
      label: "Round",
      wave: "triangle",
      secondaryWave: "sine",
      detuneCents: 4,
      attackSeconds: 0.012,
      releaseSeconds: 0.12,
      filterHz: 760,
      resonance: 0.6,
      gain: 0.6,
    },
  ],
  chords: [
    {
      id: "warm",
      label: "Warm",
      wave: "sawtooth",
      secondaryWave: "triangle",
      detuneCents: 7,
      attackSeconds: 0.028,
      releaseSeconds: 0.2,
      filterHz: 1900,
      resonance: 0.55,
      gain: 0.24,
    },
    {
      id: "glass",
      label: "Glass",
      wave: "sine",
      secondaryWave: "triangle",
      detuneCents: 12,
      attackSeconds: 0.012,
      releaseSeconds: 0.3,
      filterHz: 4200,
      resonance: 1.15,
      gain: 0.28,
    },
    {
      id: "organ",
      label: "Organ",
      wave: "square",
      secondaryWave: "sine",
      detuneCents: 0,
      attackSeconds: 0.01,
      releaseSeconds: 0.09,
      filterHz: 2600,
      resonance: 0.4,
      gain: 0.2,
    },
  ],
  lead: [
    {
      id: "soft",
      label: "Soft",
      wave: "triangle",
      secondaryWave: "sine",
      detuneCents: 5,
      attackSeconds: 0.018,
      releaseSeconds: 0.14,
      filterHz: 3600,
      resonance: 0.65,
      gain: 0.42,
    },
    {
      id: "bright",
      label: "Bright",
      wave: "sawtooth",
      secondaryWave: "triangle",
      detuneCents: 9,
      attackSeconds: 0.006,
      releaseSeconds: 0.11,
      filterHz: 6900,
      resonance: 0.9,
      gain: 0.3,
    },
    {
      id: "square",
      label: "Square",
      wave: "square",
      secondaryWave: "sine",
      detuneCents: -4,
      attackSeconds: 0.004,
      releaseSeconds: 0.08,
      filterHz: 4100,
      resonance: 0.7,
      gain: 0.28,
    },
  ],
});
