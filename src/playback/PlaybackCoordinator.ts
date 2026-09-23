import type {
  ModeId,
} from "../app/modeModel";
import {
  arrangementPlaybackStore,
  type ArrangementPlaybackSnapshot,
} from "../arrange/ArrangementPlaybackStore";
import {
  arrangementStore,
  type ArrangementSnapshot,
} from "../arrange/ArrangementStore";
import {
  audioTransport,
  type TransportSnapshot,
} from "../audio/AudioTransport";

export type PlaybackTarget =
  | "pattern"
  | "arrangement";

export interface PlaybackContext {
  modeId: ModeId;
  arrangement: Pick<
    ArrangementSnapshot,
    "blueprint"
  >;
  arrangementPlayback: Pick<
    ArrangementPlaybackSnapshot,
    "engaged"
  >;
}

export function playbackTargetForContext(
  context: PlaybackContext,
): PlaybackTarget {
  const {
    modeId,
    arrangement,
    arrangementPlayback,
  } = context;

  if (modeId === "arrange") {
    return "arrangement";
  }

  if (
    (modeId === "mix" || modeId === "archive") &&
    Boolean(arrangement.blueprint)
  ) {
    return "arrangement";
  }

  if (
    modeId === "live" &&
    arrangementPlayback.engaged
  ) {
    return "arrangement";
  }

  return "pattern";
}

export class PlaybackCoordinator {
  targetForMode(modeId: ModeId): PlaybackTarget {
    return playbackTargetForContext({
      modeId,
      arrangement: arrangementStore.getSnapshot(),
      arrangementPlayback:
        arrangementPlaybackStore.getSnapshot(),
    });
  }

  isPlayingForMode(
    modeId: ModeId,
    transport: Pick<
      TransportSnapshot,
      "desiredPlaying" | "status"
    > = audioTransport.getSnapshot(),
    arrangementPlayback: Pick<
      ArrangementPlaybackSnapshot,
      "engaged"
    > = arrangementPlaybackStore.getSnapshot(),
  ): boolean {
    return this.targetForMode(modeId) === "arrangement"
      ? arrangementPlayback.engaged &&
          transport.status === "running"
      : transport.desiredPlaying;
  }

  async toggleForMode(
    modeId: ModeId,
  ): Promise<void> {
    if (this.targetForMode(modeId) === "arrangement") {
      await arrangementPlaybackStore.toggle();
    } else {
      await audioTransport.toggle();
    }
  }

  async toggleCurrentPlayback(): Promise<void> {
    if (
      arrangementPlaybackStore.getSnapshot().engaged
    ) {
      await arrangementPlaybackStore.toggle();
    } else {
      await audioTransport.toggle();
    }
  }

  stopForMode(modeId: ModeId): void {
    if (this.targetForMode(modeId) === "arrangement") {
      arrangementPlaybackStore.stop();
    } else {
      audioTransport.stop();
    }
  }

  stopAll(): void {
    if (
      arrangementPlaybackStore.getSnapshot().engaged
    ) {
      arrangementPlaybackStore.stop();
    } else {
      audioTransport.stop();
    }
  }

  prepareModeChange(
    currentMode: ModeId,
    nextMode: ModeId,
  ): void {
    if (currentMode === nextMode) return;

    if (
      currentMode === "arrange" ||
      currentMode === "live" ||
      currentMode === "mix" ||
      currentMode === "archive"
    ) {
      this.stopAll();
      return;
    }

    if (
      nextMode === "arrange" ||
      nextMode === "mix" ||
      nextMode === "archive"
    ) {
      audioTransport.stop();
    }
  }
}

export const playbackCoordinator =
  new PlaybackCoordinator();
