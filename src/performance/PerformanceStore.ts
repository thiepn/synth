import { audioTransport } from "../audio/AudioTransport";
import { ticksPerBeat } from "../audio/transportMath";

export type PerformanceMacroId =
  | "energy"
  | "density"
  | "filter"
  | "space"
  | "drive"
  | "morph";

export type PerformanceMomentaryId =
  | "drop"
  | "break"
  | "build"
  | "repeat"
  | "stutter";

export interface PerformanceMacros {
  energy: number;
  density: number;
  filter: number;
  space: number;
  drive: number;
  morph: number;
}

export interface PerformanceMomentaryWindow {
  id: PerformanceMomentaryId;
  startTick: number;
  endTick?: number;
}

export type PerformanceTakeEvent =
  | {
      type: "macro";
      tick: number;
      macro: PerformanceMacroId;
      value: number;
    }
  | {
      type: "momentary";
      tick: number;
      action: PerformanceMomentaryId;
      active: boolean;
    }
  | {
      type: "fill";
      tick: number;
      endTick: number;
    }
  | {
      type: "trackMute";
      tick: number;
      laneId: string;
      muted: boolean;
    }
  | {
      type: "scene";
      tick: number;
      sectionId: string;
    };

export interface PerformanceTake {
  id: string;
  createdAt: string;
  startedAtTick: number;
  durationTicks: number;
  events: PerformanceTakeEvent[];
}

export interface PerformanceResolvedState {
  macros: PerformanceMacros;
  momentary: Record<PerformanceMomentaryId, boolean>;
  fillActive: boolean;
  trackMutes: Set<string>;
}

export interface PerformanceSnapshot {
  active: boolean;
  macros: PerformanceMacros;
  windows: PerformanceMomentaryWindow[];
  fillWindow?: { startTick: number; endTick: number };
  trackMutes: string[];
  recording: boolean;
  currentEventCount: number;
  takes: PerformanceTake[];
  revision: number;
}

type Listener = () => void;

const DEFAULT_MACROS: PerformanceMacros = {
  energy: 0.5,
  density: 1,
  filter: 1,
  space: 0,
  drive: 0,
  morph: 0,
};

const TAKE_LIMIT = 8;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function cloneMacros(macros: PerformanceMacros): PerformanceMacros {
  return { ...macros };
}

function cloneTake(take: PerformanceTake): PerformanceTake {
  return {
    ...take,
    events: take.events.map((event) => ({ ...event })),
  };
}

function nextBoundaryTick(kind: "beat" | "bar"): number {
  const transport = audioTransport.getSnapshot();
  const current = Math.max(0, transport.position.absoluteTick);
  const beatTicks = ticksPerBeat(transport.meter);
  const unit =
    kind === "bar"
      ? beatTicks * Math.max(1, transport.meter.numerator)
      : beatTicks;
  return Math.ceil((current + 1) / unit) * unit;
}

export class PerformanceStore {
  private listeners = new Set<Listener>();
  private active = false;
  private macros: PerformanceMacros = { ...DEFAULT_MACROS };
  private windows = new Map<
    PerformanceMomentaryId,
    PerformanceMomentaryWindow
  >();
  private fillWindow: { startTick: number; endTick: number } | undefined;
  private trackMutes = new Set<string>();
  private recording = false;
  private recordingStartTick = 0;
  private recordingEvents: PerformanceTakeEvent[] = [];
  private takes: PerformanceTake[] = [];
  private takeSerial = 1;
  private revision = 0;
  private snapshot = this.buildSnapshot();

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): PerformanceSnapshot => this.snapshot;

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    if (!active) {
      this.clearTransient(false);
    }
    this.publish();
  }

  setMacro(id: PerformanceMacroId, value: number): void {
    const next = clamp01(value);
    if (Math.abs(this.macros[id] - next) < 0.001) return;

    this.macros = {
      ...this.macros,
      [id]: next,
    };
    this.record({
      type: "macro",
      tick: this.currentTick(),
      macro: id,
      value: next,
    });
    this.publish();
  }

  pressMomentary(id: PerformanceMomentaryId): void {
    const startTick = nextBoundaryTick("beat");
    const previous = this.windows.get(id);
    if (
      previous &&
      previous.endTick === undefined &&
      previous.startTick === startTick
    ) {
      return;
    }

    this.windows.set(id, {
      id,
      startTick,
    });
    this.record({
      type: "momentary",
      tick: startTick,
      action: id,
      active: true,
    });
    this.publish();
  }

  releaseMomentary(id: PerformanceMomentaryId): void {
    const current = this.windows.get(id);
    if (!current) return;

    const transport = audioTransport.getSnapshot();
    const now = transport.position.absoluteTick;

    if (now < current.startTick) {
      this.windows.delete(id);
      this.publish();
      return;
    }

    const endTick = nextBoundaryTick("beat");
    if (endTick <= current.startTick) {
      this.windows.delete(id);
      this.publish();
      return;
    }

    this.windows.set(id, {
      ...current,
      endTick,
    });
    this.record({
      type: "momentary",
      tick: endTick,
      action: id,
      active: false,
    });
    this.publish();
  }

  triggerFill(): void {
    const transport = audioTransport.getSnapshot();
    const beatTicks = ticksPerBeat(transport.meter);
    const barTicks = beatTicks * Math.max(1, transport.meter.numerator);
    const current = Math.max(0, transport.position.absoluteTick);
    const nextBar = Math.ceil((current + 1) / barTicks) * barTicks;
    let startTick = nextBar - beatTicks;
    let endTick = nextBar;

    if (current >= startTick) {
      startTick += barTicks;
      endTick += barTicks;
    }

    this.fillWindow = { startTick, endTick };
    this.record({
      type: "fill",
      tick: startTick,
      endTick,
    });
    this.publish();
  }

  toggleTrackMute(laneId: string): void {
    const muted = !this.trackMutes.has(laneId);
    if (muted) this.trackMutes.add(laneId);
    else this.trackMutes.delete(laneId);

    this.record({
      type: "trackMute",
      tick: this.currentTick(),
      laneId,
      muted,
    });
    this.publish();
  }

  recordSceneLaunch(sectionId: string, tick: number): void {
    this.record({
      type: "scene",
      tick,
      sectionId,
    });
  }

  startRecording(): void {
    if (this.recording) return;
    this.recording = true;
    this.recordingStartTick = this.currentTick();
    this.recordingEvents = [];
    this.publish();
  }

  stopRecording(): PerformanceTake | undefined {
    if (!this.recording) return undefined;

    const endTick = this.currentTick();
    this.recording = false;

    const take =
      this.recordingEvents.length > 0
        ? {
            id:
              "performance-take-" +
              String(this.takeSerial++).padStart(3, "0"),
            createdAt: new Date().toISOString(),
            startedAtTick: this.recordingStartTick,
            durationTicks: Math.max(0, endTick - this.recordingStartTick),
            events: this.recordingEvents.map((event) => ({ ...event })),
          }
        : undefined;

    if (take) {
      this.takes = [...this.takes, take].slice(-TAKE_LIMIT);
    }

    this.recordingEvents = [];
    this.publish();
    return take;
  }

  deleteTake(takeId: string): void {
    const next = this.takes.filter((take) => take.id !== takeId);
    if (next.length === this.takes.length) return;
    this.takes = next;
    this.publish();
  }

  resetMacros(): void {
    this.macros = { ...DEFAULT_MACROS };
    this.publish();
  }

  clearTransient(publish = true): void {
    this.windows.clear();
    this.fillWindow = undefined;
    this.trackMutes.clear();
    if (publish) this.publish();
  }

  resolveAtTick(tick: number): PerformanceResolvedState {
    const momentary: Record<PerformanceMomentaryId, boolean> = {
      drop: false,
      break: false,
      build: false,
      repeat: false,
      stutter: false,
    };

    for (const window of this.windows.values()) {
      const active =
        tick >= window.startTick &&
        (window.endTick === undefined || tick < window.endTick);
      if (active) momentary[window.id] = true;
    }

    const fillActive = Boolean(
      this.fillWindow &&
        tick >= this.fillWindow.startTick &&
        tick < this.fillWindow.endTick,
    );

    return {
      macros: cloneMacros(this.macros),
      momentary,
      fillActive,
      trackMutes: new Set(this.trackMutes),
    };
  }

  private currentTick(): number {
    return Math.max(0, audioTransport.getSnapshot().position.absoluteTick);
  }

  private record(event: PerformanceTakeEvent): void {
    if (!this.recording) return;

    const previous = this.recordingEvents.at(-1);
    if (
      event.type === "macro" &&
      previous?.type === "macro" &&
      previous.macro === event.macro &&
      Math.abs(previous.tick - event.tick) < 60 &&
      Math.abs(previous.value - event.value) < 0.012
    ) {
      this.recordingEvents[this.recordingEvents.length - 1] = event;
      return;
    }

    this.recordingEvents.push(event);
  }

  private publish(): void {
    this.revision += 1;
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): PerformanceSnapshot {
    return {
      active: this.active,
      macros: cloneMacros(this.macros),
      windows: [...this.windows.values()].map((window) => ({
        ...window,
      })),
      fillWindow: this.fillWindow ? { ...this.fillWindow } : undefined,
      trackMutes: [...this.trackMutes],
      recording: this.recording,
      currentEventCount: this.recordingEvents.length,
      takes: this.takes.map(cloneTake),
      revision: this.revision,
    };
  }
}

export const performanceStore = new PerformanceStore();
