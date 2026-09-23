import type { Meter } from "../domain/contracts";

type Listener = () => void;

export interface FreezeDescriptor {
  id: string;
  patternId: string;
  lengthTicks: number;
  bpm: number;
  meter: Meter;
  createdAt: string;
  durationSeconds: number;
}

export interface FreezeSnapshot {
  active?: FreezeDescriptor;
  lastInvalidation?: string;
  revision: number;
}

function cloneDescriptor(
  value: FreezeDescriptor | undefined,
): FreezeDescriptor | undefined {
  return value
    ? {
        ...value,
        meter: { ...value.meter },
      }
    : undefined;
}

export class FreezeStore {
  private listeners = new Set<Listener>();
  private buffer: AudioBuffer | undefined;
  private active: FreezeDescriptor | undefined;
  private lastInvalidation: string | undefined;
  private revision = 0;
  private snapshot = this.buildSnapshot();

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): FreezeSnapshot => this.snapshot;

  activate(
    buffer: AudioBuffer,
    descriptor: Omit<FreezeDescriptor, "durationSeconds">,
  ): void {
    this.buffer = buffer;
    this.active = {
      ...descriptor,
      meter: { ...descriptor.meter },
      durationSeconds: buffer.duration,
    };
    this.lastInvalidation = undefined;
    this.publish();
  }

  getBuffer(): AudioBuffer | undefined {
    return this.buffer;
  }

  clear(): void {
    if (!this.active && !this.buffer) return;
    this.active = undefined;
    this.buffer = undefined;
    this.lastInvalidation = undefined;
    this.publish();
  }

  invalidate(reason: string): void {
    if (!this.active && !this.buffer) return;
    this.active = undefined;
    this.buffer = undefined;
    this.lastInvalidation = reason;
    this.publish();
  }

  private publish(): void {
    this.revision += 1;
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): FreezeSnapshot {
    return {
      active: cloneDescriptor(this.active),
      lastInvalidation: this.lastInvalidation,
      revision: this.revision,
    };
  }
}

export const freezeStore = new FreezeStore();
