import {
  clampMasteringState,
  cloneMasteringState,
  createDefaultMasteringState,
  type MasteringPlan,
  type MasteringState,
} from "./masteringModel";

type Listener = () => void;

export interface MasteringSnapshot {
  state: MasteringState;
  preview?: MasteringPlan;
  previewActive: boolean;
  canUndo: boolean;
  canRedo: boolean;
  revision: number;
}

const HISTORY_LIMIT = 40;

function clonePlan(plan: MasteringPlan | undefined): MasteringPlan | undefined {
  if (!plan) return undefined;
  return {
    ...plan,
    state: cloneMasteringState(plan.state),
    warnings: [...plan.warnings],
  };
}

export class MasteringStore {
  private listeners = new Set<Listener>();
  private state = createDefaultMasteringState();
  private preview: MasteringPlan | undefined;
  private previewActive = false;
  private undoStack: MasteringState[] = [];
  private redoStack: MasteringState[] = [];
  private lastHistoryKey: string | null = null;
  private lastHistoryAt = 0;
  private revision = 0;
  private snapshot = this.buildSnapshot();

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): MasteringSnapshot => this.snapshot;

  restoreProjectState(state: MasteringState): void {
    this.state = clampMasteringState(state);
    this.preview = undefined;
    this.previewActive = false;
    this.undoStack = [];
    this.redoStack = [];
    this.lastHistoryKey = null;
    this.lastHistoryAt = 0;
    this.publish();
  }

  setPreview(plan: MasteringPlan | undefined): void {
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

  commitPreview(): MasteringPlan | undefined {
    if (!this.preview) return undefined;
    const plan = clonePlan(this.preview)!;

    this.captureHistory();
    this.state = clampMasteringState(plan.state);
    this.preview = undefined;
    this.previewActive = false;
    this.redoStack = [];
    this.lastHistoryKey = null;
    this.lastHistoryAt = 0;
    this.publish();
    return plan;
  }

  setEnabled(enabled: boolean): void {
    if (this.state.enabled === enabled) return;
    this.captureHistory();
    this.state = {
      ...cloneMasteringState(this.state),
      enabled,
    };
    this.preview = undefined;
    this.previewActive = false;
    this.redoStack = [];
    this.publish();
  }

  setValue(
    key: Exclude<keyof MasteringState, "enabled">,
    value: number,
  ): void {
    const next = clampMasteringState({
      ...this.state,
      [key]: value,
    });
    if (Math.abs(this.state[key] - next[key]) < 0.0001) return;

    this.captureHistory("master:" + key);
    this.state = next;
    this.preview = undefined;
    this.previewActive = false;
    this.redoStack = [];
    this.publish();
  }

  reset(): void {
    this.captureHistory();
    this.state = createDefaultMasteringState();
    this.preview = undefined;
    this.previewActive = false;
    this.redoStack = [];
    this.lastHistoryKey = null;
    this.lastHistoryAt = 0;
    this.publish();
  }

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;

    this.redoStack.push(cloneMasteringState(this.state));
    this.state = cloneMasteringState(previous);
    this.preview = undefined;
    this.previewActive = false;
    this.lastHistoryKey = null;
    this.lastHistoryAt = 0;
    this.publish();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;

    this.undoStack.push(cloneMasteringState(this.state));
    this.state = cloneMasteringState(next);
    this.preview = undefined;
    this.previewActive = false;
    this.lastHistoryKey = null;
    this.lastHistoryAt = 0;
    this.publish();
  }

  currentState(): MasteringState {
    return cloneMasteringState(this.state);
  }

  resolveForPlayback(): {
    state: MasteringState;
    previewLevelMatchDb: number;
  } {
    if (this.previewActive && this.preview) {
      return {
        state: cloneMasteringState(this.preview.state),
        previewLevelMatchDb: this.preview.previewLevelMatchDb,
      };
    }

    return {
      state: cloneMasteringState(this.state),
      previewLevelMatchDb: 0,
    };
  }

  private captureHistory(coalesceKey: string | null = null): void {
    const now = Date.now();
    const shouldCoalesce =
      coalesceKey !== null &&
      this.lastHistoryKey === coalesceKey &&
      now - this.lastHistoryAt < 900;

    if (!shouldCoalesce) {
      this.undoStack.push(cloneMasteringState(this.state));
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

  private buildSnapshot(): MasteringSnapshot {
    return {
      state: cloneMasteringState(this.state),
      preview: clonePlan(this.preview),
      previewActive: this.previewActive,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      revision: this.revision,
    };
  }
}

export const masteringStore = new MasteringStore();
