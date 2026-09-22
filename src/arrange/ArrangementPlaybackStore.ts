import {
  audioTransport,
  type TransportStatus,
} from "../audio/AudioTransport";
import { arrangementStore } from "./ArrangementStore";

export interface ArrangementPlaybackSnapshot {
  engaged: boolean;
  transportStatus: TransportStatus;
  startOffsetTick: number;
  playheadTick: number;
  totalTicks: number;
  currentSectionId?: string;
  currentOccurrenceId?: string;
  currentPatternId?: string;
  revision: number;
}

type Listener = () => void;

export class ArrangementPlaybackStore {
  private listeners = new Set<Listener>();
  private engaged = false;
  private startOffsetTick = 0;
  private playheadTick = 0;
  private currentSectionId: string | undefined;
  private currentOccurrenceId: string | undefined;
  private currentPatternId: string | undefined;
  private revision = 0;
  private snapshot: ArrangementPlaybackSnapshot = this.buildSnapshot();

  constructor() {
    audioTransport.subscribe(() => {
      this.handleTransportUpdate();
    });

    arrangementStore.subscribe(() => {
      if (this.engaged) {
        audioTransport.invalidateScheduledEvents();
      }
      this.handleTransportUpdate();
    });
  }

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): ArrangementPlaybackSnapshot => this.snapshot;

  async start(sectionId?: string): Promise<void> {
    const arrangement = arrangementStore.getSnapshot();
    if (!arrangement.blueprint || arrangement.occurrences.length === 0) {
      throw new Error("Load an arrangement before playback.");
    }

    audioTransport.stop();

    const section = sectionId
      ? arrangement.blueprint.sections.find((entry) => entry.id === sectionId)
      : undefined;

    this.startOffsetTick = section?.startTick ?? 0;
    this.playheadTick = this.startOffsetTick;
    this.engaged = true;
    this.resolveCurrentState();
    this.publish();

    await audioTransport.start();
    this.handleTransportUpdate();
  }

  pause(): void {
    if (!this.engaged) return;
    audioTransport.pause();
  }

  async resume(): Promise<void> {
    if (!this.engaged) return;
    await audioTransport.start();
  }

  async toggle(sectionId?: string): Promise<void> {
    if (!this.engaged) {
      await this.start(sectionId);
      return;
    }

    const transport = audioTransport.getSnapshot();
    if (transport.status === "running") {
      this.pause();
    } else {
      await this.resume();
    }
  }

  stop(): void {
    if (!this.engaged && audioTransport.getSnapshot().status === "idle") {
      return;
    }

    this.engaged = false;
    this.startOffsetTick = 0;
    this.playheadTick = 0;
    this.currentSectionId = undefined;
    this.currentOccurrenceId = undefined;
    this.currentPatternId = undefined;
    audioTransport.stop();
    this.publish();
  }

  resolveTransportTick(transportAbsoluteTick: number) {
    if (!this.engaged) return null;
    const arrangementTick =
      this.startOffsetTick + Math.max(0, transportAbsoluteTick);
    return arrangementStore.resolveAtTick(arrangementTick);
  }

  private handleTransportUpdate(): void {
    const transport = audioTransport.getSnapshot();

    if (!this.engaged) {
      this.publish();
      return;
    }

    if (
      transport.status === "idle" &&
      !transport.desiredPlaying &&
      transport.position.absoluteTick <= 0
    ) {
      this.engaged = false;
      this.startOffsetTick = 0;
      this.playheadTick = 0;
      this.currentSectionId = undefined;
      this.currentOccurrenceId = undefined;
      this.currentPatternId = undefined;
      this.publish();
      return;
    }

    this.playheadTick =
      this.startOffsetTick +
      Math.max(0, transport.position.absoluteTick);

    const arrangement = arrangementStore.getSnapshot();
    if (
      arrangement.totalTicks > 0 &&
      this.playheadTick >= arrangement.totalTicks
    ) {
      this.engaged = false;
      audioTransport.stop();
      this.playheadTick = arrangement.totalTicks;
      this.currentSectionId = undefined;
      this.currentOccurrenceId = undefined;
      this.currentPatternId = undefined;
      this.publish();
      return;
    }

    this.resolveCurrentState();
    this.publish();
  }

  private resolveCurrentState(): void {
    const resolved = arrangementStore.resolveAtTick(this.playheadTick);
    this.currentSectionId = resolved?.occurrence.sectionId;
    this.currentOccurrenceId = resolved?.occurrence.id;
    this.currentPatternId = resolved?.occurrence.patternId;
  }

  private publish(): void {
    this.revision += 1;
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): ArrangementPlaybackSnapshot {
    return {
      engaged: this.engaged,
      transportStatus: audioTransport.getSnapshot().status,
      startOffsetTick: this.startOffsetTick,
      playheadTick: this.playheadTick,
      totalTicks: arrangementStore.getSnapshot().totalTicks,
      currentSectionId: this.currentSectionId,
      currentOccurrenceId: this.currentOccurrenceId,
      currentPatternId: this.currentPatternId,
      revision: this.revision,
    };
  }
}

export const arrangementPlaybackStore =
  new ArrangementPlaybackStore();
