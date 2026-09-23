import { PPQ, type Meter } from "../domain/contracts";
import {
  DEFAULT_LOOP_BARS,
  clampBpm,
  formatMusicalPosition,
  musicalPositionFromTick,
  normalizeLoopBars,
  normalizeMeter,
  ticksPerBeat,
  ticksPerLoop,
  ticksPerSecond,
  type MusicalPosition,
} from "./transportMath";

export type TransportStatus =
  | "idle"
  | "running"
  | "paused"
  | "suspended"
  | "error";

export type AudioContextStatus =
  | "uninitialized"
  | "running"
  | "suspended"
  | "closed"
  | "interrupted"
  | "unknown";

export interface TransportSnapshot {
  status: TransportStatus;
  contextState: AudioContextStatus;
  desiredPlaying: boolean;
  bpm: number;
  meter: Meter;
  loopBars: number;
  loopTicks: number;
  position: MusicalPosition;
  positionLabel: string;
  audioTimeSeconds: number;
  baseLatencyMs: number;
  outputLatencyMs: number;
  schedulerEpoch: number;
  scheduledPulseCount: number;
  lastError?: string;
}

export interface ScheduledTransportPulse {
  audioTime: number;
  absoluteTick: number;
  loopTick: number;
  barIndex: number;
  beatIndex: number;
  pulseIndex: number;
  epoch: number;
}

type StoreListener = () => void;
type PulseListener = (pulse: ScheduledTransportPulse) => void;

const DEFAULT_BPM = 128;
const DEFAULT_METER: Meter = { numerator: 4, denominator: 4 };
const SCHEDULER_INTERVAL_MS = 25;
const SCHEDULE_AHEAD_SECONDS = 0.1;
const UI_FRAME_INTERVAL_MS = 1000 / 30;
const SIXTEENTH_TICKS = PPQ / 4;

function contextStateOf(context: AudioContext | null): AudioContextStatus {
  if (!context) return "uninitialized";

  const state = String(context.state);
  if (
    state === "running" ||
    state === "suspended" ||
    state === "closed" ||
    state === "interrupted"
  ) {
    return state;
  }

  return "unknown";
}

export class AudioTransport {
  private context: AudioContext | null = null;
  private listeners = new Set<StoreListener>();
  private pulseListeners = new Set<PulseListener>();

  private desiredPlaying = false;
  private activationInFlight = false;
  private status: TransportStatus = "idle";
  private bpm = DEFAULT_BPM;
  private meter: Meter = DEFAULT_METER;
  private loopBars = DEFAULT_LOOP_BARS;

  private anchorAudioTime = 0;
  private anchorAbsoluteTick = 0;
  private pausedAbsoluteTick = 0;

  private schedulerTimer: number | null = null;
  private schedulerWorker: Worker | undefined;
  private frameHandle: number | null = null;
  private lastFramePublishMs = 0;
  private nextScheduledTick = 0;
  private schedulerEpoch = 0;
  private scheduledPulseCount = 0;
  private lastError: string | undefined;

  private snapshot: TransportSnapshot = this.buildSnapshot();

  readonly subscribe = (listener: StoreListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): TransportSnapshot => this.snapshot;

  readonly subscribeScheduledPulses = (
    listener: PulseListener,
  ): (() => void) => {
    this.pulseListeners.add(listener);
    return () => this.pulseListeners.delete(listener);
  };

  /**
   * Audio-subsystem escape hatch used by voices and renderers.
   * UI code should not use the AudioContext directly.
   */
  getAudioContext(): AudioContext | null {
    return this.context && this.context.state !== "closed" ? this.context : null;
  }

  /**
   * Precise musical position for external-performance capture.
   * Uses the same Web Audio clock as the scheduler rather than the UI frame snapshot.
   */
  getCurrentAbsoluteTick(): number {
    return this.currentAbsoluteTick();
  }

  /**
   * Unlock/resume Web Audio from an explicit user gesture without starting
   * transport playback. Used by direct instrument audition.
   */
  async unlockAudio(): Promise<AudioContext> {
    this.lastError = undefined;

    try {
      const context = this.ensureContext();

      if (context.state !== "running") {
        await context.resume();
      }

      if (context.state !== "running") {
        throw new Error("Audio context could not be resumed.");
      }

      this.primeAudioGraph(context);
      this.publish();
      return context;
    } catch (error) {
      this.lastError = this.errorMessage(error);
      this.status = "error";
      this.publish();
      throw error;
    }
  }

  async start(): Promise<void> {
    if (
      this.activationInFlight ||
      (this.desiredPlaying && this.status === "running")
    ) {
      return;
    }

    this.lastError = undefined;
    this.activationInFlight = true;

    try {
      const context = this.ensureContext();
      this.desiredPlaying = true;

      // Anchor before resume so an eager statechange event can never observe
      // an uninitialized transport origin.
      this.anchorAudioTime = context.currentTime;
      this.anchorAbsoluteTick = this.pausedAbsoluteTick;

      if (context.state !== "running") {
        await context.resume();
      }

      if (context.state !== "running") {
        this.status = "suspended";
        this.publish();
        return;
      }

      this.primeAudioGraph(context);
      this.anchorAudioTime = context.currentTime;
      this.anchorAbsoluteTick = this.pausedAbsoluteTick;
      this.status = "running";
      this.bumpSchedulerEpoch();
      this.resetSchedulerCursor();
      this.startScheduler();
      this.startFramePump();
      this.publish();
    } catch (error) {
      this.desiredPlaying = false;
      this.status = "error";
      this.lastError = this.errorMessage(error);
      this.stopScheduler();
      this.stopFramePump();
      this.publish();
    } finally {
      this.activationInFlight = false;
    }
  }

  pause(): void {
    if (!this.desiredPlaying && this.status !== "running") return;

    this.pausedAbsoluteTick = this.currentAbsoluteTick();
    this.desiredPlaying = false;
    this.status = "paused";
    this.bumpSchedulerEpoch();
    this.stopScheduler();
    this.stopFramePump();
    this.publish();
  }

  stop(): void {
    this.desiredPlaying = false;
    this.pausedAbsoluteTick = 0;
    this.anchorAbsoluteTick = 0;
    this.anchorAudioTime = this.context?.currentTime ?? 0;
    this.status = "idle";
    this.bumpSchedulerEpoch();
    this.stopScheduler();
    this.stopFramePump();
    this.publish();
  }

  async toggle(): Promise<void> {
    if (this.desiredPlaying) {
      this.pause();
    } else {
      await this.start();
    }
  }

  setBpm(nextBpm: number): void {
    const next = clampBpm(nextBpm);
    if (next === this.bpm) return;

    const currentTick = this.currentAbsoluteTick();
    this.bpm = next;
    this.reanchorAt(currentTick);
    this.bumpSchedulerEpoch();
    this.resetSchedulerCursor();
    this.publish();
  }

  setMeter(nextMeter: Meter): void {
    const next = normalizeMeter(nextMeter);
    if (
      next.numerator === this.meter.numerator &&
      next.denominator === this.meter.denominator
    ) {
      return;
    }

    this.meter = next;
    this.bumpSchedulerEpoch();
    this.resetSchedulerCursor();
    this.publish();
  }

  setLoopBars(nextLoopBars: number): void {
    const next = normalizeLoopBars(nextLoopBars);
    if (next === this.loopBars) return;

    this.loopBars = next;
    this.bumpSchedulerEpoch();
    this.resetSchedulerCursor();
    this.publish();
  }

  /**
   * Invalidates already-published future scheduler events after pattern edits.
   * Audio subscribers can cancel the previous epoch and the scheduler refills
   * the current look-ahead window from the edited musical state.
   */
  invalidateScheduledEvents(): void {
    this.bumpSchedulerEpoch();
    this.resetSchedulerCursor();

    if (
      this.desiredPlaying &&
      this.status === "running" &&
      this.context?.state === "running"
    ) {
      this.scheduleWindow();
    }

    this.publish();
  }

  async recoverIfNeeded(): Promise<void> {
    if (!this.desiredPlaying || !this.context) return;

    if (this.context.state === "suspended") {
      try {
        await this.context.resume();
      } catch (error) {
        this.lastError = this.errorMessage(error);
        this.status = "suspended";
        this.publish();
      }
    }
  }

  private ensureContext(): AudioContext {
    if (this.context && this.context.state !== "closed") {
      return this.context;
    }

    if (typeof AudioContext === "undefined") {
      throw new Error("Web Audio is not supported by this browser.");
    }

    const context = new AudioContext({ latencyHint: "interactive" });
    context.onstatechange = () => this.handleContextStateChange();
    this.context = context;
    this.anchorAudioTime = context.currentTime;
    this.publish();

    return context;
  }

  private handleContextStateChange(): void {
    if (!this.context) return;

    if (this.context.state === "closed") {
      this.desiredPlaying = false;
      this.status = "idle";
      this.stopScheduler();
      this.stopFramePump();
      this.publish();
      return;
    }

    if (this.activationInFlight) {
      this.publish();
      return;
    }

    if (!this.desiredPlaying) {
      this.publish();
      return;
    }

    if (this.context.state === "running") {
      this.status = "running";
      this.resetSchedulerCursor();
      this.startScheduler();
      this.startFramePump();
    } else {
      this.status = "suspended";
      this.stopScheduler();
      this.stopFramePump();
    }

    this.publish();
  }

  private primeAudioGraph(context: AudioContext): void {
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    gain.gain.value = 0;
    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };

    const now = context.currentTime;
    oscillator.start(now);
    oscillator.stop(now + 0.005);
  }

  private currentAbsoluteTick(atAudioTime?: number): number {
    if (!this.context || !this.desiredPlaying) {
      return Math.max(0, this.pausedAbsoluteTick);
    }

    const audioTime = atAudioTime ?? this.context.currentTime;
    const elapsed = Math.max(0, audioTime - this.anchorAudioTime);
    return Math.max(
      0,
      this.anchorAbsoluteTick + elapsed * ticksPerSecond(this.bpm),
    );
  }

  private reanchorAt(absoluteTick: number): void {
    this.pausedAbsoluteTick = absoluteTick;

    if (this.context) {
      this.anchorAudioTime = this.context.currentTime;
      this.anchorAbsoluteTick = absoluteTick;
    }
  }

  private audioTimeForAbsoluteTick(absoluteTick: number): number {
    if (!this.context) return 0;

    const deltaTicks = absoluteTick - this.anchorAbsoluteTick;
    return this.anchorAudioTime + deltaTicks / ticksPerSecond(this.bpm);
  }

  private bumpSchedulerEpoch(): void {
    this.schedulerEpoch += 1;
  }

  private resetSchedulerCursor(): void {
    const currentTick = this.currentAbsoluteTick();
    this.nextScheduledTick =
      Math.floor(currentTick / SIXTEENTH_TICKS) * SIXTEENTH_TICKS;

    if (
      this.audioTimeForAbsoluteTick(this.nextScheduledTick) <
      (this.context?.currentTime ?? 0) - 0.002
    ) {
      this.nextScheduledTick += SIXTEENTH_TICKS;
    }
  }

  private startScheduler(): void {
    if (
      this.schedulerTimer !== null ||
      this.schedulerWorker
    ) {
      return;
    }

    this.scheduleWindow();

    if (typeof Worker !== "undefined") {
      try {
        const worker = new Worker(
          new URL(
            "./transportScheduler.worker.ts",
            import.meta.url,
          ),
          { type: "module" },
        );
        worker.onmessage = () => {
          this.scheduleWindow();
        };
        worker.onerror = () => {
          if (this.schedulerWorker !== worker) return;
          worker.terminate();
          this.schedulerWorker = undefined;
          this.startFallbackScheduler();
        };
        worker.postMessage({
          type: "start",
          intervalMs: SCHEDULER_INTERVAL_MS,
        });
        this.schedulerWorker = worker;
        return;
      } catch {
        // Fall through to the main-thread timer.
      }
    }

    this.startFallbackScheduler();
  }

  private startFallbackScheduler(): void {
    if (this.schedulerTimer !== null) return;
    this.schedulerTimer = globalThis.setInterval(
      () => this.scheduleWindow(),
      SCHEDULER_INTERVAL_MS,
    );
  }

  private stopScheduler(): void {
    if (this.schedulerWorker) {
      this.schedulerWorker.postMessage({
        type: "stop",
      });
      this.schedulerWorker.terminate();
      this.schedulerWorker = undefined;
    }

    if (this.schedulerTimer !== null) {
      globalThis.clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  private scheduleWindow(): void {
    const context = this.context;
    if (
      !context ||
      !this.desiredPlaying ||
      context.state !== "running" ||
      this.status !== "running"
    ) {
      return;
    }

    const now = context.currentTime;
    const horizon = now + SCHEDULE_AHEAD_SECONDS;
    const currentTick = this.currentAbsoluteTick(now);

    if (this.nextScheduledTick < currentTick - SIXTEENTH_TICKS) {
      this.nextScheduledTick =
        Math.ceil(currentTick / SIXTEENTH_TICKS) * SIXTEENTH_TICKS;
    }

    while (this.audioTimeForAbsoluteTick(this.nextScheduledTick) <= horizon) {
      const audioTime = this.audioTimeForAbsoluteTick(this.nextScheduledTick);

      if (audioTime >= now - 0.002) {
        const position = musicalPositionFromTick(
          this.nextScheduledTick,
          this.meter,
          this.loopBars,
        );
        const pulse: ScheduledTransportPulse = {
          audioTime,
          absoluteTick: this.nextScheduledTick,
          loopTick: position.loopTick,
          barIndex: position.barIndex,
          beatIndex: position.beatIndex,
          pulseIndex: Math.round(position.loopTick / SIXTEENTH_TICKS),
          epoch: this.schedulerEpoch,
        };

        this.scheduledPulseCount += 1;

        for (const listener of this.pulseListeners) {
          try {
            listener(pulse);
          } catch (error) {
            console.error("Synth transport pulse listener failed.", error);
          }
        }
      }

      this.nextScheduledTick += SIXTEENTH_TICKS;
    }
  }

  private startFramePump(): void {
    if (
      this.frameHandle !== null ||
      typeof requestAnimationFrame === "undefined"
    ) {
      return;
    }

    this.lastFramePublishMs = 0;

    const frame = (timestamp: number) => {
      if (this.status !== "running" || !this.desiredPlaying) {
        this.frameHandle = null;
        return;
      }

      if (
        this.lastFramePublishMs === 0 ||
        timestamp - this.lastFramePublishMs >= UI_FRAME_INTERVAL_MS
      ) {
        this.lastFramePublishMs = timestamp;
        this.publish();
      }

      this.frameHandle = requestAnimationFrame(frame);
    };

    this.frameHandle = requestAnimationFrame(frame);
  }

  private stopFramePump(): void {
    if (
      this.frameHandle === null ||
      typeof cancelAnimationFrame === "undefined"
    ) {
      return;
    }

    cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
    this.lastFramePublishMs = 0;
  }

  private publish(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) {
      listener();
    }
  }

  private buildSnapshot(): TransportSnapshot {
    const absoluteTick = this.currentAbsoluteTick();
    const position = musicalPositionFromTick(
      absoluteTick,
      this.meter,
      this.loopBars,
    );
    const context = this.context;
    const outputLatency =
      context && "outputLatency" in context
        ? Number(
            (context as AudioContext & { outputLatency?: number })
              .outputLatency ?? 0,
          )
        : 0;

    return {
      status: this.status,
      contextState: contextStateOf(context),
      desiredPlaying: this.desiredPlaying,
      bpm: this.bpm,
      meter: { ...this.meter },
      loopBars: this.loopBars,
      loopTicks: ticksPerLoop(this.meter, this.loopBars),
      position,
      positionLabel: formatMusicalPosition(position),
      audioTimeSeconds: context?.currentTime ?? 0,
      baseLatencyMs: (context?.baseLatency ?? 0) * 1000,
      outputLatencyMs: outputLatency * 1000,
      schedulerEpoch: this.schedulerEpoch,
      scheduledPulseCount: this.scheduledPulseCount,
      lastError: this.lastError,
    };
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}

export const audioTransport = new AudioTransport();

export const TRANSPORT_SCHEDULER_CONFIG = Object.freeze({
  intervalMs: SCHEDULER_INTERVAL_MS,
  aheadSeconds: SCHEDULE_AHEAD_SECONDS,
  pulseTicks: SIXTEENTH_TICKS,
  ppq: PPQ,
  uiFrameIntervalMs: UI_FRAME_INTERVAL_MS,
});

export function transportBeatTicks(snapshot: TransportSnapshot): number {
  return ticksPerBeat(snapshot.meter);
}
