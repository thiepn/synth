import type {
  ArrangementBlueprint,
  ArrangementShapeId,
  Pattern,
  SceneRole,
  SectionBlueprint,
} from "../domain/contracts";
import { clonePattern } from "../domain/patternClone";

export type PlaygroundSongBank = "A" | "B";

export const PLAYGROUND_SONG_BLUEPRINT_ID =
  "playground-song-blueprint";
export const PLAYGROUND_SONG_PATTERN_IDS: Readonly<
  Record<PlaygroundSongBank, string>
> = Object.freeze({
  A: "playground-song-pattern-a",
  B: "playground-song-pattern-b",
});
export const PLAYGROUND_SONG_SCENE_IDS: Readonly<
  Record<PlaygroundSongBank, string>
> = Object.freeze({
  A: "playground-song-scene-a",
  B: "playground-song-scene-b",
});

export interface PlaygroundSongSeed {
  bankA: Pattern;
  bankB: Pattern;
}

export type PlaygroundSongDraftId =
  | "short"
  | "standard"
  | "extended";

export interface PlaygroundSongDraft {
  id: PlaygroundSongDraftId;
  label: string;
  description: string;
  shape: ArrangementShapeId;
  sections: readonly {
    bank: PlaygroundSongBank;
    role: SceneRole;
    cycles: number;
    energyStart: number;
    energyEnd: number;
  }[];
}

export const PLAYGROUND_SONG_DRAFTS: readonly PlaygroundSongDraft[] = [
  {
    id: "short",
    label: "Short",
    description: "Intro · Verse · Chorus · Outro",
    shape: "compact",
    sections: [
      { bank: "A", role: "intro", cycles: 2, energyStart: 0.4, energyEnd: 0.5 },
      { bank: "A", role: "verse", cycles: 4, energyStart: 0.5, energyEnd: 0.62 },
      { bank: "B", role: "chorus", cycles: 4, energyStart: 0.7, energyEnd: 0.84 },
      { bank: "A", role: "outro", cycles: 2, energyStart: 0.48, energyEnd: 0.32 },
    ],
  },
  {
    id: "standard",
    label: "Standard",
    description: "Intro · Verse · Chorus · Verse · Chorus · Outro",
    shape: "standard",
    sections: [
      { bank: "A", role: "intro", cycles: 2, energyStart: 0.4, energyEnd: 0.5 },
      { bank: "A", role: "verse", cycles: 4, energyStart: 0.5, energyEnd: 0.62 },
      { bank: "B", role: "chorus", cycles: 4, energyStart: 0.7, energyEnd: 0.84 },
      { bank: "A", role: "verse", cycles: 4, energyStart: 0.54, energyEnd: 0.66 },
      { bank: "B", role: "chorus", cycles: 4, energyStart: 0.74, energyEnd: 0.88 },
      { bank: "A", role: "outro", cycles: 2, energyStart: 0.5, energyEnd: 0.3 },
    ],
  },
  {
    id: "extended",
    label: "Extended",
    description: "Intro · Verse · Build · Chorus · Verse · Breakdown · Final chorus · Outro",
    shape: "extended",
    sections: [
      { bank: "A", role: "intro", cycles: 2, energyStart: 0.36, energyEnd: 0.48 },
      { bank: "A", role: "verse", cycles: 4, energyStart: 0.5, energyEnd: 0.62 },
      { bank: "B", role: "build", cycles: 2, energyStart: 0.62, energyEnd: 0.76 },
      { bank: "B", role: "chorus", cycles: 4, energyStart: 0.74, energyEnd: 0.88 },
      { bank: "A", role: "verse", cycles: 4, energyStart: 0.54, energyEnd: 0.66 },
      { bank: "A", role: "breakdown", cycles: 2, energyStart: 0.42, energyEnd: 0.5 },
      { bank: "B", role: "chorus", cycles: 8, energyStart: 0.76, energyEnd: 0.94 },
      { bank: "A", role: "outro", cycles: 2, energyStart: 0.46, energyEnd: 0.26 },
    ],
  },
];

export function cloneForPlaygroundSong(
  pattern: Pattern,
  bank: PlaygroundSongBank,
): Pattern {
  const next = clonePattern(pattern);
  next.id = PLAYGROUND_SONG_PATTERN_IDS[bank];
  next.name = "Pattern " + bank + " / Song";
  return next;
}

function section(
  bank: PlaygroundSongBank,
  index: number,
  options?: {
    role?: SceneRole;
    cycles?: number;
    energyStart?: number;
    energyEnd?: number;
  },
): SectionBlueprint {
  const patternId =
    PLAYGROUND_SONG_PATTERN_IDS[bank];
  const sceneId =
    PLAYGROUND_SONG_SCENE_IDS[bank];
  const cycles = Math.max(
    1,
    Math.min(16, Math.round(options?.cycles ?? 4)),
  );

  return {
    id:
      "playground-song-section-" +
      String(index + 1).padStart(2, "0"),
    label:
      options?.role
        ? options.role
            .replace("preChorus", "PRE-CHORUS")
            .toUpperCase()
        : "SECTION " + String(index + 1),
    role:
      options?.role ??
      (bank === "A" ? "verse" : "chorus"),
    sceneId,
    patternSequence: Array.from(
      { length: cycles },
      () => patternId,
    ),
    cycleCount: cycles,
    startTick: 0,
    lengthTicks: 0,
    energyStart:
      options?.energyStart ??
      (bank === "A" ? 0.52 : 0.7),
    energyEnd:
      options?.energyEnd ??
      (bank === "A" ? 0.62 : 0.82),
    fillPlacement: "off",
    transitionPlacement: "off",
  };
}

export function createPlaygroundSongDraft(
  seed: PlaygroundSongSeed,
  draftId: PlaygroundSongDraftId,
): {
  blueprint: ArrangementBlueprint;
  patterns: Pattern[];
} {
  const draft =
    PLAYGROUND_SONG_DRAFTS.find(
      (entry) => entry.id === draftId,
    ) ?? PLAYGROUND_SONG_DRAFTS[1];

  const base = createPlaygroundSong(seed);
  base.blueprint = {
    ...base.blueprint,
    name: draft.label + " Song",
    shape: draft.shape,
    sections: draft.sections.map(
      (entry, index) =>
        section(entry.bank, index, {
          role: entry.role,
          cycles: entry.cycles,
          energyStart: entry.energyStart,
          energyEnd: entry.energyEnd,
        }),
    ),
  };
  return base;
}

export function createPlaygroundSong(
  seed: PlaygroundSongSeed,
): {
  blueprint: ArrangementBlueprint;
  patterns: Pattern[];
} {
  const patternA = cloneForPlaygroundSong(
    seed.bankA,
    "A",
  );
  const patternB = cloneForPlaygroundSong(
    seed.bankB,
    "B",
  );

  const blueprint: ArrangementBlueprint = {
    id: PLAYGROUND_SONG_BLUEPRINT_ID,
    name: "Playground Song",
    familyId: "playground-song-family",
    shape: "standard",
    scenes: [
      {
        id: PLAYGROUND_SONG_SCENE_IDS.A,
        name: "Pattern A",
        role: "verse",
        patternIds: [
          PLAYGROUND_SONG_PATTERN_IDS.A,
        ],
        energy: 0.58,
      },
      {
        id: PLAYGROUND_SONG_SCENE_IDS.B,
        name: "Pattern B",
        role: "chorus",
        patternIds: [
          PLAYGROUND_SONG_PATTERN_IDS.B,
        ],
        energy: 0.76,
      },
    ],
    sections: [
      section("A", 0),
      section("B", 1),
    ],
  };

  return {
    blueprint,
    patterns: [patternA, patternB],
  };
}

export function isPlaygroundSongBlueprint(
  blueprint: ArrangementBlueprint | undefined,
): boolean {
  return blueprint?.id ===
    PLAYGROUND_SONG_BLUEPRINT_ID;
}

export function playgroundSongBankForPatternId(
  patternId: string | undefined,
): PlaygroundSongBank | undefined {
  if (
    patternId ===
    PLAYGROUND_SONG_PATTERN_IDS.A
  ) {
    return "A";
  }
  if (
    patternId ===
    PLAYGROUND_SONG_PATTERN_IDS.B
  ) {
    return "B";
  }
  return undefined;
}
