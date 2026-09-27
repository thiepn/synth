import { audioTransport } from "../audio/AudioTransport";
import {
  FOUNDATION_STEP_TICKS,
  SEQUENCER_LANES,
  type DrumVoiceId,
} from "../music/foundationPattern";
import { clampManualTimingOffsetUs } from "./playbackRules";
import { sequencerStore } from "./SequencerStore";

type Listener = () => void;

export type GridRecordStatus =
  | "idle"
  | "armed"
  | "recording";

export type GridRecordMode = "overdub" | "erase";
export type GridRecordQuantize =
  | "off"
  | "1/16"
  | "1/8"
  | "1/4";

export interface GridRecorderSnapshot {
  status: GridRecordStatus;
  mode: GridRecordMode;
  quantize: GridRecordQuantize;
  hitCount: number;
  takeSerial: number;
  lastVoice?: DrumVoiceId;
  lastStepIndex?: number;
  revision: number;
}

function normalizeVelocity(value: number): number {
  if (!Number.isFinite(value)) return 0.8;
  return Math.max(0.05, Math.min(1, value));
}

function modulo(value: number, length: number): number {
  if (length <= 0) return 0;
  return ((value % length) + length) % length;
}

export class GridRecorder {
  private listeners = new Set<Listener>();
  private status: GridRecordStatus = "idle";
  private mode: GridRecordMode = "overdub";
  private quantize: GridRecordQuantize = "1/16";
  private hitCount = 0;
  private takeSerial = 0;
  private takeId: string | undefined;
  private lastVoice: DrumVoiceId | undefined;
  private lastStepIndex: number | undefined;
  private revision = 0;
  private snapshot = this.buildSnapshot();

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): GridRecorderSnapshot =>
    this.snapshot;

  setMode(mode: GridRecordMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.publish();
  }

  setQuantize(quantize: GridRecordQuantize): void {
    if (this.quantize === quantize) return;
    this.quantize = quantize;
    this.publish();
  }

  arm(): void {
    if (this.status === "recording") return;
    this.status = "armed";
    this.hitCount = 0;
    this.lastVoice = undefined;
    this.lastStepIndex = undefined;
    this.publish();
  }

  start(): void {
    if (this.status === "recording") return;

    this.takeSerial += 1;
    this.takeId =
      "grid-record-" +
      String(this.takeSerial).padStart(6, "0");
    this.hitCount = 0;
    this.lastVoice = undefined;
    this.lastStepIndex = undefined;
    this.status = "recording";
    sequencerStore.beginPaintGesture(this.takeId);
    this.publish();
  }

  stop(): number {
    const count = this.hitCount;

    if (this.takeId) {
      sequencerStore.endPaintGesture(this.takeId);
    }

    this.takeId = undefined;
    this.status = "idle";
    this.publish();
    return count;
  }

  cancel(): void {
    if (this.takeId) {
      sequencerStore.endPaintGesture(this.takeId);
    }

    this.takeId = undefined;
    this.status = "idle";
    this.hitCount = 0;
    this.lastVoice = undefined;
    this.lastStepIndex = undefined;
    this.publish();
  }

  recordHit(
    voice: DrumVoiceId,
    velocity = 0.8,
    absoluteTick = audioTransport.getCurrentAbsoluteTick(),
  ): boolean {
    if (
      this.status !== "recording" ||
      audioTransport.getSnapshot().status !== "running" ||
      !this.takeId
    ) {
      return false;
    }

    const definition = SEQUENCER_LANES.find(
      (entry) => entry.voice === voice,
    );
    if (!definition) return false;

    const pattern = sequencerStore.getSnapshot().pattern;
    const patternLength = Math.max(
      FOUNDATION_STEP_TICKS,
      pattern.lengthTicks,
    );
    const rawTick = modulo(
      Math.max(0, absoluteTick),
      patternLength,
    );

    const gridTicks =
      this.quantize === "1/4"
        ? FOUNDATION_STEP_TICKS * 4
        : this.quantize === "1/8"
          ? FOUNDATION_STEP_TICKS * 2
          : FOUNDATION_STEP_TICKS;

    const eventTick = modulo(
      Math.round(rawTick / gridTicks) * gridTicks,
      patternLength,
    );
    const stepIndex = Math.round(
      eventTick / FOUNDATION_STEP_TICKS,
    );

    let timingOffsetUs = 0;
    if (this.quantize === "off") {
      let deltaTicks = rawTick - eventTick;

      if (deltaTicks > patternLength / 2) {
        deltaTicks -= patternLength;
      } else if (deltaTicks < -patternLength / 2) {
        deltaTicks += patternLength;
      }

      const bpm = Math.max(
        30,
        audioTransport.getSnapshot().bpm,
      );
      const seconds =
        (deltaTicks * 60) / bpm / 960;
      timingOffsetUs = clampManualTimingOffsetUs(
        seconds * 1_000_000,
      );
    }

    const changed = sequencerStore.recordRealtimeStep(
      definition.id,
      stepIndex,
      normalizeVelocity(velocity),
      timingOffsetUs,
      this.mode,
      this.takeId,
    );

    if (!changed) return false;

    this.hitCount += 1;
    this.lastVoice = voice;
    this.lastStepIndex = stepIndex;
    audioTransport.invalidateScheduledEvents();
    this.publish();
    return true;
  }

  private publish(): void {
    this.revision += 1;
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) {
      listener();
    }
  }

  private buildSnapshot(): GridRecorderSnapshot {
    return {
      status: this.status,
      mode: this.mode,
      quantize: this.quantize,
      hitCount: this.hitCount,
      takeSerial: this.takeSerial,
      lastVoice: this.lastVoice,
      lastStepIndex: this.lastStepIndex,
      revision: this.revision,
    };
  }
}

export const gridRecorder = new GridRecorder();
