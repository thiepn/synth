import type {
  ArrangementBlueprint,
  Pattern,
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
): SectionBlueprint {
  const patternId =
    PLAYGROUND_SONG_PATTERN_IDS[bank];
  const sceneId =
    PLAYGROUND_SONG_SCENE_IDS[bank];
  const cycles = 4;

  return {
    id:
      "playground-song-section-" +
      String(index + 1).padStart(2, "0"),
    label: "SECTION " + String(index + 1),
    role: bank === "A" ? "verse" : "chorus",
    sceneId,
    patternSequence: Array.from(
      { length: cycles },
      () => patternId,
    ),
    cycleCount: cycles,
    startTick: 0,
    lengthTicks: 0,
    energyStart: bank === "A" ? 0.52 : 0.7,
    energyEnd: bank === "A" ? 0.62 : 0.82,
    fillPlacement: "off",
    transitionPlacement: "off",
  };
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
