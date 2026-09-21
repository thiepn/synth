import type { InstrumentRole } from "../domain/contracts";

export type DrumVoiceId =
  | "kick"
  | "snare"
  | "clap"
  | "closedHat"
  | "openHat"
  | "tom"
  | "percussion"
  | "crash";

export interface FoundationLane {
  code: string;
  name: string;
  role: InstrumentRole;
  voice: DrumVoiceId;
  accent: "phosphor" | "heat" | "ice";
  detail: string;
  values: readonly number[];
}

export interface FoundationHit {
  voice: DrumVoiceId;
  velocity: number;
}

export const FOUNDATION_STEP_COUNT = 16;

export const FOUNDATION_LANES: readonly FoundationLane[] = [
  {
    code: "KD",
    name: "KICK",
    role: "kick",
    voice: "kick",
    accent: "heat",
    detail: "PUNCH 74",
    values: [1, 0, 0, 0.62, 0, 0, 0.82, 0, 1, 0, 0, 0, 0, 0.72, 0, 0],
  },
  {
    code: "SN",
    name: "SNARE",
    role: "snare",
    voice: "snare",
    accent: "phosphor",
    detail: "BODY 61",
    values: [0, 0, 0, 0, 1, 0, 0.18, 0, 0, 0, 0, 0.25, 1, 0, 0.16, 0],
  },
  {
    code: "HH",
    name: "HATS",
    role: "closedHat",
    voice: "closedHat",
    accent: "ice",
    detail: "AIR 82",
    values: [0.38, 0, 0.58, 0, 0.42, 0, 0.72, 0, 0.42, 0, 0.62, 0, 0.42, 0.28, 0.82, 0],
  },
  {
    code: "PC",
    name: "PERC",
    role: "percussion",
    voice: "percussion",
    accent: "phosphor",
    detail: "SPACE 43",
    values: [0, 0, 0.24, 0, 0, 0, 0, 0, 0, 0.3, 0, 0, 0, 0, 0.36, 0],
  },
];

export const DRUM_PADS: ReadonlyArray<{
  voice: DrumVoiceId;
  label: string;
  code: string;
  key: string;
  tone: "phosphor" | "heat" | "ice";
}> = [
  { voice: "kick", label: "KICK", code: "KD", key: "A", tone: "heat" },
  { voice: "snare", label: "SNARE", code: "SN", key: "S", tone: "phosphor" },
  { voice: "clap", label: "CLAP", code: "CP", key: "D", tone: "phosphor" },
  { voice: "closedHat", label: "CLOSED", code: "CH", key: "F", tone: "ice" },
  { voice: "openHat", label: "OPEN", code: "OH", key: "J", tone: "ice" },
  { voice: "tom", label: "TOM", code: "TM", key: "K", tone: "heat" },
  { voice: "percussion", label: "PERC", code: "PC", key: "L", tone: "phosphor" },
  { voice: "crash", label: "CRASH", code: "CR", key: ";", tone: "ice" },
];

export function foundationHitsForPulse(
  stepIndex: number,
  barIndex: number,
  loopBars: number,
): FoundationHit[] {
  const step =
    ((Math.floor(stepIndex) % FOUNDATION_STEP_COUNT) + FOUNDATION_STEP_COUNT) %
    FOUNDATION_STEP_COUNT;
  const hits: FoundationHit[] = [];

  for (const lane of FOUNDATION_LANES) {
    const velocity = lane.values[step] ?? 0;
    if (velocity > 0) {
      hits.push({ voice: lane.voice, velocity });
    }
  }

  if (step === 0 && barIndex === 0) {
    hits.push({ voice: "crash", velocity: 0.52 });
  }

  if (step === 12) {
    hits.push({ voice: "clap", velocity: 0.42 });
  }

  if (step === 7 || step === 15) {
    hits.push({ voice: "openHat", velocity: step === 15 ? 0.52 : 0.36 });
  }

  const lastBar = Math.max(0, loopBars - 1);
  if (barIndex === lastBar && step === 14) {
    hits.push({ voice: "tom", velocity: 0.5 });
  }
  if (barIndex === lastBar && step === 15) {
    hits.push({ voice: "tom", velocity: 0.68 });
  }

  return hits;
}
