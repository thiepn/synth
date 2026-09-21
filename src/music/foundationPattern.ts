import {
  PPQ,
  type GenerationLock,
  type InstrumentRole,
  type Pattern,
  type PatternLane,
  type StepEvent,
} from "../domain/contracts";

export type DrumVoiceId =
  | "kick"
  | "snare"
  | "clap"
  | "closedHat"
  | "openHat"
  | "tom"
  | "percussion"
  | "crash";

export type LaneAccent = "phosphor" | "heat" | "ice";

export interface SequencerLaneDefinition {
  id: string;
  code: string;
  name: string;
  role: InstrumentRole;
  voice: DrumVoiceId;
  accent: LaneAccent;
  detail: string;
  kitSlotId: string;
  defaultValues: readonly number[];
}

export const FOUNDATION_STEP_COUNT = 16;
export const FOUNDATION_STEP_TICKS = PPQ / 4;

const unlocked: GenerationLock = {
  rhythm: false,
  sound: false,
  dynamics: false,
  timing: false,
};

export const SEQUENCER_LANES: readonly SequencerLaneDefinition[] = [
  {
    id: "lane-kick",
    code: "KD",
    name: "KICK",
    role: "kick",
    voice: "kick",
    accent: "heat",
    detail: "PUNCH 74",
    kitSlotId: "slot-kick",
    defaultValues: [1, 0, 0, 0.62, 0, 0, 0.82, 0, 1, 0, 0, 0, 0, 0.72, 0, 0],
  },
  {
    id: "lane-snare",
    code: "SN",
    name: "SNARE",
    role: "snare",
    voice: "snare",
    accent: "phosphor",
    detail: "BODY 61",
    kitSlotId: "slot-snare",
    defaultValues: [0, 0, 0, 0, 1, 0, 0.18, 0, 0, 0, 0, 0.25, 1, 0, 0.16, 0],
  },
  {
    id: "lane-clap",
    code: "CP",
    name: "CLAP",
    role: "clap",
    voice: "clap",
    accent: "phosphor",
    detail: "SNAP 42",
    kitSlotId: "slot-clap",
    defaultValues: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.42, 0, 0, 0],
  },
  {
    id: "lane-closed-hat",
    code: "CH",
    name: "CLOSED",
    role: "closedHat",
    voice: "closedHat",
    accent: "ice",
    detail: "AIR 82",
    kitSlotId: "slot-closed-hat",
    defaultValues: [0.38, 0, 0.58, 0, 0.42, 0, 0.72, 0, 0.42, 0, 0.62, 0, 0.42, 0.28, 0.82, 0],
  },
  {
    id: "lane-open-hat",
    code: "OH",
    name: "OPEN",
    role: "openHat",
    voice: "openHat",
    accent: "ice",
    detail: "TAIL 52",
    kitSlotId: "slot-open-hat",
    defaultValues: [0, 0, 0, 0, 0, 0, 0, 0.36, 0, 0, 0, 0, 0, 0, 0, 0.52],
  },
  {
    id: "lane-tom",
    code: "TM",
    name: "TOM",
    role: "tom",
    voice: "tom",
    accent: "heat",
    detail: "BODY 58",
    kitSlotId: "slot-tom",
    defaultValues: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.68],
  },
  {
    id: "lane-percussion",
    code: "PC",
    name: "PERC",
    role: "percussion",
    voice: "percussion",
    accent: "phosphor",
    detail: "SPACE 43",
    kitSlotId: "slot-percussion",
    defaultValues: [0, 0, 0.24, 0, 0, 0, 0, 0, 0, 0.3, 0, 0, 0, 0, 0.36, 0],
  },
  {
    id: "lane-crash",
    code: "CR",
    name: "CRASH",
    role: "cymbal",
    voice: "crash",
    accent: "ice",
    detail: "WASH 52",
    kitSlotId: "slot-crash",
    defaultValues: [0.52, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
];

export const FOUNDATION_LANES = SEQUENCER_LANES.filter((lane) =>
  ["lane-kick", "lane-snare", "lane-closed-hat", "lane-percussion"].includes(
    lane.id,
  ),
);

export const DRUM_PADS: ReadonlyArray<{
  voice: DrumVoiceId;
  label: string;
  code: string;
  key: string;
  tone: LaneAccent;
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

function eventForStep(
  laneId: string,
  stepIndex: number,
  velocity: number,
): StepEvent {
  return {
    id: "evt-" + laneId + "-" + stepIndex,
    tick: stepIndex * FOUNDATION_STEP_TICKS,
    velocity,
    probability: 1,
    timingOffsetUs: 0,
    accent: velocity >= 0.85 ? "accent" : velocity <= 0.3 ? "ghost" : "normal",
  };
}

function laneFromDefinition(definition: SequencerLaneDefinition): PatternLane {
  const events = definition.defaultValues.flatMap((velocity, stepIndex) =>
    velocity > 0
      ? [eventForStep(definition.id, stepIndex, velocity)]
      : [],
  );

  return {
    id: definition.id,
    role: definition.role,
    kitSlotId: definition.kitSlotId,
    events,
    muted: false,
    solo: false,
    lock: { ...unlocked },
  };
}

export function createFoundationPattern(): Pattern {
  return {
    id: "pattern-foundation",
    name: "FOUNDATION 01",
    meter: { numerator: 4, denominator: 4 },
    ppq: PPQ,
    lengthTicks: FOUNDATION_STEP_COUNT * FOUNDATION_STEP_TICKS,
    lanes: SEQUENCER_LANES.map(laneFromDefinition),
    groove: {
      swing: 0,
      humanization: 0,
      personality: "tight",
    },
  };
}

export function laneDefinitionById(
  laneId: string,
): SequencerLaneDefinition | undefined {
  return SEQUENCER_LANES.find((lane) => lane.id === laneId);
}

export function laneDefinitionByRole(
  role: InstrumentRole,
): SequencerLaneDefinition | undefined {
  return SEQUENCER_LANES.find((lane) => lane.role === role);
}
