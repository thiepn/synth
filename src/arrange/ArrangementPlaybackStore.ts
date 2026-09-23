import {
  audioTransport,
  type TransportStatus,
} from "../audio/AudioTransport";
import { ticksPerBeat } from "../audio/transportMath";
import { arrangementStore } from "./ArrangementStore";
import { registerProjectTransientReset } from "../project/transientResetRegistry";

export interface ArrangementPlaybackSnapshot {
  engaged: boolean;
  transportStatus: TransportStatus;
  startOffsetTick: number;
  playheadTick: number;
  totalTicks: number;
  scope: "arrangement" | "section";
  currentSectionId?: string;
  currentOccurrenceId?: string;
  currentPatternId?: string;
  currentEnergy: number;
  queuedSectionId?: string;
  revision: number;
}

type Listener = () => void;

export class ArrangementPlaybackStore {
  private listeners = new Set<Listener>();
  private engaged = false;
  private startOffsetTick = 0;
  private playheadTick = 0;
  private scope: "arrangement" | "section" = "arrangement";
  private sectionOnlyId: string | undefined;
  private stopAtTick: number | undefined;
  private currentSectionId: string | undefined;
  private currentOccurrenceId: string | undefined;
  private currentPatternId: string | undefined;
  private currentEnergy = 0;
  private queuedSectionId: string | undefined;
  private queuedTransportTick: number | undefined;
  private lastArrangementMusicalRevision =
    arrangementStore.getSnapshot().musicalRevision;
  private revision = 0;
  private snapshot: ArrangementPlaybackSnapshot = this.buildSnapshot();

  constructor() {
    audioTransport.subscribe(() => {
      this.handleTransportUpdate();
    });

    arrangementStore.subscribe(() => {
      const arrangement = arrangementStore.getSnapshot();
      const musicalChanged =
        arrangement.musicalRevision !==
        this.lastArrangementMusicalRevision;
      this.lastArrangementMusicalRevision =
        arrangement.musicalRevision;

      if (this.engaged && musicalChanged) {
        if (!arrangement.blueprint || arrangement.occurrences.length === 0) {
          this.stop();
          return;
        }

        if (this.sectionOnlyId) {
          const section = arrangement.blueprint?.sections.find(
            (entry) => entry.id === this.sectionOnlyId,
          );
          if (section) {
            const elapsed =
              this.playheadTick - this.startOffsetTick;
            this.startOffsetTick = section.startTick;
            this.playheadTick =
              this.startOffsetTick + Math.max(0, elapsed);
            this.stopAtTick =
              section.startTick + section.lengthTicks;
          } else {
            this.stop();
            return;
          }
        } else {
          this.stopAtTick = arrangement.totalTicks;
        }

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

  async start(
    sectionId?: string,
    sectionOnly = false,
  ): Promise<void> {
    const arrangement = arrangementStore.getSnapshot();
    if (!arrangement.blueprint || arrangement.occurrences.length === 0) {
      return;
    }

    audioTransport.stop();

    const section = sectionId
      ? arrangement.blueprint.sections.find((entry) => entry.id === sectionId)
      : undefined;

    this.startOffsetTick = section?.startTick ?? 0;
    this.playheadTick = this.startOffsetTick;
    this.scope = sectionOnly && section ? "section" : "arrangement";
    this.sectionOnlyId =
      sectionOnly && section ? section.id : undefined;
    this.stopAtTick =
      sectionOnly && section
        ? section.startTick + section.lengthTicks
        : arrangement.totalTicks;
    this.engaged = true;
    this.queuedSectionId = undefined;
    this.queuedTransportTick = undefined;
    this.resolveCurrentState();
    this.publish();

    await audioTransport.start();
    this.handleTransportUpdate();
  }

  queueSection(sectionId: string): number | undefined {
    const arrangement = arrangementStore.getSnapshot();
    const section = arrangement.blueprint?.sections.find(
      (entry) => entry.id === sectionId,
    );
    if (!section) return undefined;

    if (!this.engaged) {
      void this.start(sectionId, false);
      return 0;
    }

    const transport = audioTransport.getSnapshot();
    const beatTicks = ticksPerBeat(transport.meter);
    const barTicks = beatTicks * Math.max(1, transport.meter.numerator);
    const targetTick =
      Math.ceil((transport.position.absoluteTick + 1) / barTicks) * barTicks;

    this.queuedSectionId = sectionId;
    this.queuedTransportTick = targetTick;
    audioTransport.invalidateScheduledEvents();
    this.publish();
    return targetTick;
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
      await this.start(sectionId, false);
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
    this.scope = "arrangement";
    this.sectionOnlyId = undefined;
    this.stopAtTick = undefined;
    this.currentSectionId = undefined;
    this.currentOccurrenceId = undefined;
    this.currentPatternId = undefined;
    this.currentEnergy = 0;
    this.queuedSectionId = undefined;
    this.queuedTransportTick = undefined;
    audioTransport.stop();
    this.publish();
  }

  resolveTransportTick(transportAbsoluteTick: number) {
    if (!this.engaged) return null;

    if (
      this.queuedSectionId &&
      this.queuedTransportTick !== undefined &&
      transportAbsoluteTick >= this.queuedTransportTick
    ) {
      const section = arrangementStore
        .getSnapshot()
        .blueprint?.sections.find(
          (entry) => entry.id === this.queuedSectionId,
        );

      if (section) {
        this.startOffsetTick =
          section.startTick - Math.max(0, transportAbsoluteTick);
        this.playheadTick = section.startTick;
      }

      this.queuedSectionId = undefined;
      this.queuedTransportTick = undefined;
    }

    const arrangementTick =
      this.startOffsetTick + Math.max(0, transportAbsoluteTick);
    if (
      this.stopAtTick !== undefined &&
      arrangementTick >= this.stopAtTick
    ) {
      return null;
    }
    const resolved =
      arrangementStore.resolvePlaybackAtTick(arrangementTick);
    if (!resolved) return null;

    const section = arrangementStore
      .getSnapshot()
      .blueprint?.sections.find(
        (entry) => entry.id === resolved.occurrence.sectionId,
      );
    const progress = section && section.lengthTicks > 0
      ? Math.max(
          0,
          Math.min(
            1,
            (arrangementTick - section.startTick) /
              section.lengthTicks,
          ),
        )
      : 0;
    const energy = section
      ? section.energyStart +
        (section.energyEnd - section.energyStart) * progress
      : 1;

    return {
      ...resolved,
      energy: Math.max(0, Math.min(1, energy)),
    };
  }

  private handleTransportUpdate(): void {
    const transport = audioTransport.getSnapshot();

    if (!this.engaged) {
      if (this.snapshot.transportStatus !== transport.status) {
        this.publish();
      }
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
      this.scope = "arrangement";
      this.sectionOnlyId = undefined;
      this.stopAtTick = undefined;
      this.currentSectionId = undefined;
      this.currentOccurrenceId = undefined;
      this.currentPatternId = undefined;
      this.currentEnergy = 0;
      this.publish();
      return;
    }

    this.playheadTick =
      this.startOffsetTick +
      Math.max(0, transport.position.absoluteTick);

    const arrangement = arrangementStore.getSnapshot();
    const playbackEnd =
      this.stopAtTick ?? arrangement.totalTicks;
    if (
      playbackEnd > 0 &&
      this.playheadTick >= playbackEnd
    ) {
      this.engaged = false;
      audioTransport.stop();
      this.playheadTick = playbackEnd;
      this.scope = "arrangement";
      this.sectionOnlyId = undefined;
      this.stopAtTick = undefined;
      this.currentSectionId = undefined;
      this.currentOccurrenceId = undefined;
      this.currentPatternId = undefined;
      this.currentEnergy = 0;
      this.publish();
      return;
    }

    this.resolveCurrentState();
    this.publish();
  }

  private resolveCurrentState(): void {
    const resolved = arrangementStore.resolvePlaybackAtTick(
      this.playheadTick,
    );
    this.currentSectionId = resolved?.occurrence.sectionId;
    this.currentOccurrenceId = resolved?.occurrence.id;
    this.currentPatternId = resolved?.occurrence.patternId;

    const section = arrangementStore
      .getSnapshot()
      .blueprint?.sections.find(
        (entry) => entry.id === resolved?.occurrence.sectionId,
      );

    if (section && section.lengthTicks > 0) {
      const progress = Math.max(
        0,
        Math.min(
          1,
          (this.playheadTick - section.startTick) /
            section.lengthTicks,
        ),
      );
      this.currentEnergy =
        section.energyStart +
        (section.energyEnd - section.energyStart) * progress;
    } else {
      this.currentEnergy = 0;
    }
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
      scope: this.scope,
      currentSectionId: this.currentSectionId,
      currentOccurrenceId: this.currentOccurrenceId,
      currentPatternId: this.currentPatternId,
      currentEnergy: this.currentEnergy,
      queuedSectionId: this.queuedSectionId,
      revision: this.revision,
    };
  }
}

export const arrangementPlaybackStore =
  new ArrangementPlaybackStore();

registerProjectTransientReset(
  "arrangementPlaybackStore",
  () => arrangementPlaybackStore.stop(),
);
