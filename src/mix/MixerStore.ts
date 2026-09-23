import type { DrumVoiceId } from "../music/foundationPattern";
import type {
  AutomationLane,
} from "../modulation/modulationEngine";
import { resolveModulatedTarget } from "../modulation/modulationEngine";
import { modulationStore } from "../modulation/ModulationStore";
import {
  mixerMasterTargetId,
  mixerTargetId,
  type MixerParameterId,
} from "../modulation/parameterRegistry";
import type { MixArchitectPlan } from "../generation/mixArchitect";
import {
  clampMixerChannel,
  cloneMixerLocks,
  cloneMixerState,
  createDefaultMixerLocks,
  createDefaultMixerState,
  type MixerChannelState,
  type MixerLocks,
  type MixerState,
} from "./mixerModel";

type Listener = () => void;

export type MixerNumericParameter =
  | "gainDb"
  | "pan"
  | "lowDb"
  | "midDb"
  | "highDb"
  | "compression"
  | "saturation"
  | "reverbSend"
  | "sidechain";

interface MixerHistoryEntry {
  state: MixerState;
  automationLanes: AutomationLane[];
}

export interface MixerSnapshot {
  state: MixerState;
  preview?: MixArchitectPlan;
  previewActive: boolean;
  locks: MixerLocks;
  canUndo: boolean;
  canRedo: boolean;
  revision: number;
}

const HISTORY_LIMIT = 60;

function cloneAutomationLane(lane: AutomationLane): AutomationLane {
  return {
    ...lane,
    points: lane.points.map((point) => ({ ...point })),
  };
}

function clonePlan(
  plan: MixArchitectPlan | undefined,
): MixArchitectPlan | undefined {
  if (!plan) return undefined;
  return {
    ...plan,
    state: cloneMixerState(plan.state),
    automationLanes: plan.automationLanes.map(cloneAutomationLane),
    metrics: { ...plan.metrics },
    warnings: [...plan.warnings],
  };
}

function mixerAutomationSnapshot(): AutomationLane[] {
  return modulationStore
    .getSnapshot()
    .automationLanes.filter((lane) =>
      lane.targetId.startsWith("mixer."),
    )
    .map(cloneAutomationLane);
}

export class MixerStore {
  private listeners = new Set<Listener>();
  private state = createDefaultMixerState();
  private locks = createDefaultMixerLocks();
  private preview: MixArchitectPlan | undefined;
  private previewActive = false;
  private undoStack: MixerHistoryEntry[] = [];
  private redoStack: MixerHistoryEntry[] = [];
  private lastHistoryKey: string | null = null;
  private lastHistoryAt = 0;
  private revision = 0;
  private snapshot = this.buildSnapshot();

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): MixerSnapshot => this.snapshot;

  setPreview(plan: MixArchitectPlan | undefined): void {
    this.preview = clonePlan(plan);
    this.previewActive = Boolean(plan);
    this.publish();
  }

  setPreviewActive(active: boolean): void {
    const next = Boolean(active && this.preview);
    if (this.previewActive === next) return;
    this.previewActive = next;
    this.publish();
  }

  clearPreview(): void {
    if (!this.preview && !this.previewActive) return;
    this.preview = undefined;
    this.previewActive = false;
    this.publish();
  }

  commitPreview(): MixArchitectPlan | undefined {
    if (!this.preview) return undefined;

    const plan = clonePlan(this.preview)!;
    this.captureHistory();
    this.state = cloneMixerState(plan.state);
    modulationStore.replaceAutomationLanesForPrefix(
      "mixer.",
      plan.automationLanes,
    );
    this.preview = undefined;
    this.previewActive = false;
    this.redoStack = [];
    this.lastHistoryKey = null;
    this.lastHistoryAt = 0;
    this.publish();
    return plan;
  }

  setChannelValue(
    voice: DrumVoiceId,
    parameter: MixerNumericParameter,
    value: number,
  ): void {
    const current = this.state.channels[voice];
    const next = clampMixerChannel({
      ...current,
      [parameter]: value,
    });

    if (Math.abs(current[parameter] - next[parameter]) < 0.0001) {
      return;
    }

    this.captureHistory("channel:" + voice + ":" + parameter);
    this.state = cloneMixerState(this.state);
    this.state.channels[voice] = next;
    this.preview = undefined;
    this.previewActive = false;
    this.redoStack = [];
    this.publish();
  }

  setChannelMute(voice: DrumVoiceId, muted: boolean): void {
    const current = this.state.channels[voice];
    if (current.muted === muted) return;
    this.captureHistory();
    this.state = cloneMixerState(this.state);
    this.state.channels[voice] = {
      ...current,
      muted,
    };
    this.preview = undefined;
    this.previewActive = false;
    this.redoStack = [];
    this.publish();
  }

  setChannelSolo(voice: DrumVoiceId, solo: boolean): void {
    const current = this.state.channels[voice];
    if (current.solo === solo) return;
    this.captureHistory();
    this.state = cloneMixerState(this.state);
    this.state.channels[voice] = {
      ...current,
      solo,
    };
    this.preview = undefined;
    this.previewActive = false;
    this.redoStack = [];
    this.publish();
  }

  setMasterGainDb(value: number): void {
    const next = Math.max(-24, Math.min(6, value));
    if (Math.abs(this.state.masterGainDb - next) < 0.0001) {
      return;
    }

    this.captureHistory("master-gain");
    this.state = {
      ...cloneMixerState(this.state),
      masterGainDb: next,
    };
    this.preview = undefined;
    this.previewActive = false;
    this.redoStack = [];
    this.publish();
  }

  setChannelLock(voice: DrumVoiceId, locked: boolean): void {
    if (this.locks.channels[voice] === locked) return;
    this.locks = cloneMixerLocks(this.locks);
    this.locks.channels[voice] = locked;
    this.publish();
  }

  toggleChannelLock(voice: DrumVoiceId): void {
    this.setChannelLock(voice, !this.locks.channels[voice]);
  }

  setMasterLock(locked: boolean): void {
    if (this.locks.master === locked) return;
    this.locks = {
      ...cloneMixerLocks(this.locks),
      master: locked,
    };
    this.publish();
  }

  toggleMasterLock(): void {
    this.setMasterLock(!this.locks.master);
  }

  currentLocks(): MixerLocks {
    return cloneMixerLocks(this.locks);
  }

  reset(): void {
    this.captureHistory();
    this.state = createDefaultMixerState();
    modulationStore.replaceAutomationLanesForPrefix("mixer.", []);
    this.preview = undefined;
    this.previewActive = false;
    this.redoStack = [];
    this.publish();
  }

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;

    this.redoStack.push(this.captureEntry());
    this.restoreEntry(previous);
    this.preview = undefined;
    this.previewActive = false;
    this.lastHistoryKey = null;
    this.lastHistoryAt = 0;
    this.publish();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;

    this.undoStack.push(this.captureEntry());
    this.restoreEntry(next);
    this.preview = undefined;
    this.previewActive = false;
    this.lastHistoryKey = null;
    this.lastHistoryAt = 0;
    this.publish();
  }

  currentState(): MixerState {
    return cloneMixerState(this.state);
  }

  resolveChannel(
    voice: DrumVoiceId,
    tick: number,
  ): MixerChannelState {
    const source =
      this.previewActive && this.preview
        ? this.preview.state
        : this.state;
    const base = source.channels[voice];
    const modulation = modulationStore.getSnapshot();
    const automation = this.automationForTarget(
      voice,
      this.previewActive ? this.preview : undefined,
      modulation.automationLanes,
    );

    const resolve = (
      parameter: MixerParameterId,
      value: number,
    ) =>
      resolveModulatedTarget({
        targetId: mixerTargetId(voice, parameter),
        baseValue: value,
        tick,
        sources: modulation.sources,
        routes: modulation.routes,
        automationLanes: automation(parameter),
      }).value;

    const resolved = clampMixerChannel({
      ...base,
      gainDb: resolve("gainDb", base.gainDb),
      pan: resolve("pan", base.pan),
      lowDb: resolve("lowDb", base.lowDb),
      midDb: resolve("midDb", base.midDb),
      highDb: resolve("highDb", base.highDb),
      compression: resolve("compression", base.compression),
      saturation: resolve("saturation", base.saturation),
      reverbSend: resolve("reverbSend", base.reverbSend),
      sidechain: resolve("sidechain", base.sidechain),
    });

    const soloActive = Object.values(source.channels).some(
      (channel) => channel.solo,
    );

    return {
      ...resolved,
      muted:
        base.muted ||
        (soloActive && !base.solo),
      solo: base.solo,
    };
  }

  resolveMasterGainDb(tick: number): number {
    const source =
      this.previewActive && this.preview
        ? this.preview.state
        : this.state;
    const modulation = modulationStore.getSnapshot();
    const targetId = mixerMasterTargetId();
    const previewLane =
      this.previewActive && this.preview
        ? this.preview.automationLanes.find(
            (lane) => lane.targetId === targetId,
          )
        : undefined;
    const canonicalLane = modulation.automationLanes.find(
      (lane) => lane.targetId === targetId,
    );

    const resolved = resolveModulatedTarget({
      targetId,
      baseValue: source.masterGainDb,
      tick,
      sources: modulation.sources,
      routes: modulation.routes,
      automationLanes: previewLane
        ? [previewLane]
        : canonicalLane
          ? [canonicalLane]
          : [],
    }).value;

    const levelMatch =
      this.previewActive && this.preview
        ? this.preview.previewLevelMatchDb
        : 0;

    return Math.max(-24, Math.min(6, resolved + levelMatch));
  }

  private automationForTarget(
    voice: DrumVoiceId,
    preview: MixArchitectPlan | undefined,
    canonical: readonly AutomationLane[],
  ): (parameter: MixerParameterId) => AutomationLane[] {
    return (parameter) => {
      const targetId = mixerTargetId(voice, parameter);
      const previewLane = preview?.automationLanes.find(
        (lane) => lane.targetId === targetId,
      );
      if (previewLane) return [previewLane];

      const lane = canonical.find(
        (entry) => entry.targetId === targetId,
      );
      return lane ? [lane] : [];
    };
  }

  private captureEntry(): MixerHistoryEntry {
    return {
      state: cloneMixerState(this.state),
      automationLanes: mixerAutomationSnapshot(),
    };
  }

  private restoreEntry(entry: MixerHistoryEntry): void {
    this.state = cloneMixerState(entry.state);
    modulationStore.replaceAutomationLanesForPrefix(
      "mixer.",
      entry.automationLanes,
    );
  }

  private captureHistory(coalesceKey: string | null = null): void {
    const now = Date.now();
    const shouldCoalesce =
      coalesceKey !== null &&
      this.lastHistoryKey === coalesceKey &&
      now - this.lastHistoryAt < 900;

    if (!shouldCoalesce) {
      this.undoStack.push(this.captureEntry());
      if (this.undoStack.length > HISTORY_LIMIT) {
        this.undoStack.shift();
      }
    }

    this.lastHistoryKey = coalesceKey;
    this.lastHistoryAt = coalesceKey ? now : 0;
  }

  private publish(): void {
    this.revision += 1;
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): MixerSnapshot {
    return {
      state: cloneMixerState(this.state),
      preview: clonePlan(this.preview),
      previewActive: this.previewActive,
      locks: cloneMixerLocks(this.locks),
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      revision: this.revision,
    };
  }
}

export const mixerStore = new MixerStore();
