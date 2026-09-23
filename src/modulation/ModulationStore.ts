import {
  createDefaultSource,
  resolveModulatedTarget,
  type AutomationCurve,
  type AutomationLane,
  type AutomationPoint,
  type ModulationResolution,
  type ModulationRoute,
  type ModulationSource,
  type ModulationSourceKind,
} from "./modulationEngine";

type Listener = () => void;

export interface ModulationSnapshot {
  sources: ModulationSource[];
  routes: ModulationRoute[];
  automationLanes: AutomationLane[];
  selectedSourceId?: string;
  selectedTargetId: string;
  revision: number;
}

function cloneSource(source: ModulationSource): ModulationSource {
  return {
    ...source,
    stepValues: [...source.stepValues],
  };
}

function cloneRoute(route: ModulationRoute): ModulationRoute {
  return { ...route };
}

function clonePoint(point: AutomationPoint): AutomationPoint {
  return { ...point };
}

function cloneLane(lane: AutomationLane): AutomationLane {
  return {
    ...lane,
    points: lane.points.map(clonePoint),
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampDepth(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

export class ModulationStore {
  private listeners = new Set<Listener>();
  private sources: ModulationSource[] = [];
  private routes: ModulationRoute[] = [];
  private automationLanes: AutomationLane[] = [];
  private selectedSourceId: string | undefined;
  private selectedTargetId = "engine.filter";
  private sourceSerial = 1;
  private routeSerial = 1;
  private pointSerial = 1;
  private revision = 0;
  private snapshot = this.buildSnapshot();

  constructor() {
    const source = createDefaultSource(
      "lfo",
      "mod-source-" + String(this.sourceSerial++).padStart(3, "0"),
    );
    this.sources = [source];
    this.selectedSourceId = source.id;
    this.snapshot = this.buildSnapshot();
  }

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): ModulationSnapshot => this.snapshot;

  addSource(kind: ModulationSourceKind): string {
    const id =
      "mod-source-" +
      String(this.sourceSerial++).padStart(3, "0");
    const source = createDefaultSource(kind, id);
    this.sources = [...this.sources, source];
    this.selectedSourceId = id;
    this.publish();
    return id;
  }

  removeSource(sourceId: string): void {
    if (!this.sources.some((source) => source.id === sourceId)) return;
    this.sources = this.sources.filter((source) => source.id !== sourceId);
    this.routes = this.routes.filter((route) => route.sourceId !== sourceId);

    if (this.selectedSourceId === sourceId) {
      this.selectedSourceId = this.sources[0]?.id;
    }

    this.publish();
  }

  selectSource(sourceId: string): void {
    if (!this.sources.some((source) => source.id === sourceId)) return;
    if (this.selectedSourceId === sourceId) return;
    this.selectedSourceId = sourceId;
    this.publish();
  }

  selectTarget(targetId: string): void {
    if (!targetId || targetId === this.selectedTargetId) return;
    this.selectedTargetId = targetId;
    this.publish();
  }

  updateSource(
    sourceId: string,
    patch: Partial<Omit<ModulationSource, "id" | "kind">>,
  ): void {
    const index = this.sources.findIndex((source) => source.id === sourceId);
    if (index < 0) return;

    const source = this.sources[index];
    if (!source) return;

    const next: ModulationSource = {
      ...source,
      ...patch,
      rateBeats:
        patch.rateBeats === undefined
          ? source.rateBeats
          : Math.max(0.0625, Math.min(64, patch.rateBeats)),
      phase:
        patch.phase === undefined
          ? source.phase
          : Math.max(0, Math.min(1, patch.phase)),
      attack:
        patch.attack === undefined
          ? source.attack
          : Math.max(0.02, Math.min(0.98, patch.attack)),
      stepValues:
        patch.stepValues === undefined
          ? [...source.stepValues]
          : patch.stepValues.map(clamp01).slice(0, 32),
    };

    this.sources = [
      ...this.sources.slice(0, index),
      next,
      ...this.sources.slice(index + 1),
    ];
    this.publish();
  }

  addRoute(sourceId: string, targetId: string, depth = 0.5): string | undefined {
    if (!this.sources.some((source) => source.id === sourceId)) {
      return undefined;
    }

    const existing = this.routes.find(
      (route) =>
        route.sourceId === sourceId &&
        route.targetId === targetId,
    );
    if (existing) {
      this.selectTarget(targetId);
      return existing.id;
    }

    const id =
      "mod-route-" +
      String(this.routeSerial++).padStart(3, "0");
    this.routes = [
      ...this.routes,
      {
        id,
        sourceId,
        targetId,
        depth: clampDepth(depth),
        enabled: true,
      },
    ];
    this.selectedTargetId = targetId;
    this.publish();
    return id;
  }

  removeRoute(routeId: string): void {
    const next = this.routes.filter((route) => route.id !== routeId);
    if (next.length === this.routes.length) return;
    this.routes = next;
    this.publish();
  }

  updateRoute(
    routeId: string,
    patch: Partial<Pick<ModulationRoute, "depth" | "enabled" | "targetId">>,
  ): void {
    const index = this.routes.findIndex((route) => route.id === routeId);
    if (index < 0) return;

    const route = this.routes[index];
    if (!route) return;

    const next: ModulationRoute = {
      ...route,
      ...patch,
      depth:
        patch.depth === undefined
          ? route.depth
          : clampDepth(patch.depth),
    };

    this.routes = [
      ...this.routes.slice(0, index),
      next,
      ...this.routes.slice(index + 1),
    ];
    if (patch.targetId) this.selectedTargetId = patch.targetId;
    this.publish();
  }

  setAutomationLaneEnabled(targetId: string, enabled: boolean): void {
    const lane = this.ensureAutomationLane(targetId);
    if (lane.enabled === enabled) return;
    lane.enabled = enabled;
    this.publish();
  }

  setAutomationLoopLength(
    targetId: string,
    loopLengthTicks: number | undefined,
  ): void {
    const lane = this.ensureAutomationLane(targetId);
    lane.loopLengthTicks =
      loopLengthTicks === undefined
        ? undefined
        : Math.max(1, Math.round(loopLengthTicks));
    this.publish();
  }

  addAutomationPoint(
    targetId: string,
    tick: number,
    value: number,
    curve: AutomationCurve = "linear",
    coalesceTicks = 0,
  ): string {
    const lane = this.ensureAutomationLane(targetId);
    const safeTick = Math.max(0, Math.round(tick));
    const safeValue = clamp01(value);

    if (coalesceTicks > 0 && lane.points.length > 0) {
      let nearestIndex = -1;
      let nearestDistance = Number.POSITIVE_INFINITY;

      lane.points.forEach((point, index) => {
        const distance = Math.abs(point.tick - safeTick);
        if (distance < nearestDistance) {
          nearestIndex = index;
          nearestDistance = distance;
        }
      });

      if (nearestIndex >= 0 && nearestDistance <= coalesceTicks) {
        const current = lane.points[nearestIndex];
        if (current) {
          lane.points[nearestIndex] = {
            ...current,
            tick: safeTick,
            value: safeValue,
            curve,
          };
          lane.points.sort((a, b) => a.tick - b.tick);
          this.publish();
          return current.id;
        }
      }
    }

    const id =
      "automation-point-" +
      String(this.pointSerial++).padStart(4, "0");
    lane.points.push({
      id,
      tick: safeTick,
      value: safeValue,
      curve,
    });
    lane.points.sort((a, b) => a.tick - b.tick);
    this.publish();
    return id;
  }

  updateAutomationPoint(
    targetId: string,
    pointId: string,
    patch: Partial<Pick<AutomationPoint, "tick" | "value" | "curve">>,
  ): void {
    const lane = this.automationLanes.find(
      (entry) => entry.targetId === targetId,
    );
    if (!lane) return;
    const point = lane.points.find((entry) => entry.id === pointId);
    if (!point) return;

    if (patch.tick !== undefined) {
      point.tick = Math.max(0, Math.round(patch.tick));
    }
    if (patch.value !== undefined) {
      point.value = clamp01(patch.value);
    }
    if (patch.curve !== undefined) {
      point.curve = patch.curve;
    }
    lane.points.sort((a, b) => a.tick - b.tick);
    this.publish();
  }

  removeAutomationPoint(targetId: string, pointId: string): void {
    const lane = this.automationLanes.find(
      (entry) => entry.targetId === targetId,
    );
    if (!lane) return;
    const next = lane.points.filter((point) => point.id !== pointId);
    if (next.length === lane.points.length) return;
    lane.points = next;
    this.publish();
  }

  clearAutomation(targetId: string): void {
    const lane = this.automationLanes.find(
      (entry) => entry.targetId === targetId,
    );
    if (!lane || lane.points.length === 0) return;
    lane.points = [];
    this.publish();
  }

  replaceAutomationLane(nextLane: AutomationLane): void {
    const lane = cloneLane(nextLane);
    const index = this.automationLanes.findIndex(
      (entry) => entry.targetId === lane.targetId,
    );

    if (index < 0) {
      this.automationLanes = [...this.automationLanes, lane];
    } else {
      this.automationLanes = [
        ...this.automationLanes.slice(0, index),
        lane,
        ...this.automationLanes.slice(index + 1),
      ];
    }

    this.publish();
  }

  resolveTarget(
    targetId: string,
    baseValue: number,
    tick: number,
  ): ModulationResolution {
    return resolveModulatedTarget({
      targetId,
      baseValue,
      tick,
      sources: this.sources,
      routes: this.routes,
      automationLanes: this.automationLanes,
    });
  }

  private ensureAutomationLane(targetId: string): AutomationLane {
    let lane = this.automationLanes.find(
      (entry) => entry.targetId === targetId,
    );
    if (lane) return lane;

    lane = {
      id: "automation-" + targetId.replace(/[^a-zA-Z0-9_-]+/g, "-"),
      targetId,
      enabled: true,
      points: [],
    };
    this.automationLanes = [...this.automationLanes, lane];
    return lane;
  }

  private publish(): void {
    this.revision += 1;
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): ModulationSnapshot {
    return {
      sources: this.sources.map(cloneSource),
      routes: this.routes.map(cloneRoute),
      automationLanes: this.automationLanes.map(cloneLane),
      selectedSourceId: this.selectedSourceId,
      selectedTargetId: this.selectedTargetId,
      revision: this.revision,
    };
  }
}

export const modulationStore = new ModulationStore();
