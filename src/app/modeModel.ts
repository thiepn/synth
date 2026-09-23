export type ModeId =
  | "create"
  | "sequence"
  | "sound"
  | "arrange"
  | "live"
  | "mix"
  | "archive";

export interface ModeDefinition {
  id: ModeId;
  number: string;
  label: string;
  phase: string;
}

export const MODES: readonly ModeDefinition[] = [
  {
    id: "create",
    number: "01",
    label: "CREATE",
    phase: "FOUNDATION",
  },
  {
    id: "sequence",
    number: "02",
    label: "SEQUENCE",
    phase: "PHASE 4",
  },
  {
    id: "sound",
    number: "03",
    label: "SOUND",
    phase: "PHASE 11",
  },
  {
    id: "arrange",
    number: "04",
    label: "ARRANGE",
    phase: "PHASE 18",
  },
  {
    id: "live",
    number: "05",
    label: "LIVE",
    phase: "PHASE 23",
  },
  {
    id: "mix",
    number: "06",
    label: "MIX",
    phase: "PHASE 27",
  },
  {
    id: "archive",
    number: "07",
    label: "EXPORT",
    phase: "PHASE 28",
  },
] as const;
