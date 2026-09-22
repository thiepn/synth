import type {
  HistoryOperation,
  Pattern,
  PatternLane,
  StepEvent,
} from "../domain/contracts";
import { createFoundationPattern } from "../music/foundationPattern";
import { deriveRhythmGlyph } from "../visual/rhythmGlyph";

export interface EvolutionNode {
  id: string;
  parentId?: string;
  operation: HistoryOperation;
  operationLabel: string;
  title: string;
  favorite: boolean;
  ordinal: number;
  pattern: Pattern;
  glyphSignature: string;
}

export interface GenerationHistorySnapshot {
  rootNodeId: string;
  activeNodeId: string;
  selectedNodeId: string;
  nodes: EvolutionNode[];
  revision: number;
}

export interface PreparedHistoryCommit {
  parentNodeId: string;
  pattern: Pattern;
}

type StoreListener = () => void;

function cloneEvent(event: StepEvent): StepEvent {
  return {
    ...event,
    generatorTags: event.generatorTags
      ? [...event.generatorTags]
      : undefined,
    grooveBase: event.grooveBase
      ? { ...event.grooveBase }
      : undefined,
  };
}

function cloneLane(lane: PatternLane): PatternLane {
  return {
    ...lane,
    events: lane.events.map(cloneEvent),
    lock: { ...lane.lock },
    regionLocks: lane.regionLocks?.map((lock) => ({ ...lock })),
  };
}

function clonePattern(pattern: Pattern): Pattern {
  return {
    ...pattern,
    meter: { ...pattern.meter },
    lanes: pattern.lanes.map(cloneLane),
    groove: pattern.groove
      ? {
          ...pattern.groove,
          roleTimingOffsetUs: pattern.groove.roleTimingOffsetUs
            ? { ...pattern.groove.roleTimingOffsetUs }
            : undefined,
        }
      : undefined,
    provenance: pattern.provenance
      ? {
          ...pattern.provenance,
          style: { ...pattern.provenance.style },
          intent: { ...pattern.provenance.intent },
        }
      : undefined,
  };
}

function creativeSignature(pattern: Pattern): string {
  return JSON.stringify({
    ppq: pattern.ppq,
    meter: pattern.meter,
    lengthTicks: pattern.lengthTicks,
    groove: pattern.groove,
    lanes: pattern.lanes.map((lane) => ({
      id: lane.id,
      role: lane.role,
      kitSlotId: lane.kitSlotId,
      events: lane.events.map((event) => ({
        tick: event.tick,
        durationTicks: event.durationTicks,
        velocity: event.velocity,
        probability: event.probability,
        timingOffsetUs: event.timingOffsetUs,
        accent: event.accent,
        ratchetCount: event.ratchetCount,
        flamOffsetUs: event.flamOffsetUs,
        grooveBase: event.grooveBase,
      })),
    })),
  });
}

export class GenerationHistoryStore {
  private listeners = new Set<StoreListener>();
  private nodes = new Map<string, EvolutionNode>();
  private rootNodeId = "hist-0000";
  private activeNodeId = this.rootNodeId;
  private selectedNodeId = this.rootNodeId;
  private nextOrdinal = 1;
  private revision = 0;
  private snapshot: GenerationHistorySnapshot;

  constructor() {
    const rootPattern = createFoundationPattern();
    const root: EvolutionNode = {
      id: this.rootNodeId,
      operation: "root",
      operationLabel: "ROOT",
      title: "Foundation",
      favorite: true,
      ordinal: 0,
      pattern: clonePattern(rootPattern),
      glyphSignature: deriveRhythmGlyph(rootPattern).signature,
    };

    this.nodes.set(root.id, root);
    this.snapshot = this.buildSnapshot();
  }

  readonly subscribe = (listener: StoreListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): GenerationHistorySnapshot => this.snapshot;

  getNode(nodeId: string): EvolutionNode | undefined {
    const node = this.nodes.get(nodeId);
    return node ? this.cloneNode(node) : undefined;
  }

  prepareCreativePattern(
    sourcePattern: Pattern,
    nextPattern: Pattern,
  ): PreparedHistoryCommit {
    const parentNodeId = this.ensureSourceCheckpoint(sourcePattern);
    const pattern = clonePattern(nextPattern);

    if (pattern.provenance) {
      pattern.provenance.sourceHistoryNodeId = parentNodeId;
    }

    return {
      parentNodeId,
      pattern,
    };
  }

  commitPrepared(
    prepared: PreparedHistoryCommit,
    operation: HistoryOperation,
    operationLabel: string,
    title?: string,
  ): EvolutionNode {
    const node = this.createNode({
      parentId: prepared.parentNodeId,
      pattern: prepared.pattern,
      operation,
      operationLabel,
      title:
        title ??
        prepared.pattern.name ??
        operationLabel,
    });

    this.activeNodeId = node.id;
    this.selectedNodeId = node.id;
    this.publish();

    return this.cloneNode(node);
  }

  select(nodeId: string): void {
    if (!this.nodes.has(nodeId) || this.selectedNodeId === nodeId) return;
    this.selectedNodeId = nodeId;
    this.publish();
  }

  restore(nodeId: string): Pattern {
    const node = this.requireNode(nodeId);
    this.activeNodeId = node.id;
    this.selectedNodeId = node.id;
    this.publish();
    return clonePattern(node.pattern);
  }

  branchFrom(nodeId: string): EvolutionNode {
    const parent = this.requireNode(nodeId);
    const pattern = clonePattern(parent.pattern);
    const node = this.createNode({
      parentId: parent.id,
      pattern,
      operation: "branch",
      operationLabel: "BRANCH",
      title: "Branch from " + parent.title,
    });

    this.activeNodeId = node.id;
    this.selectedNodeId = node.id;
    this.publish();

    return this.cloneNode(node);
  }

  rename(nodeId: string, title: string): void {
    const node = this.requireNode(nodeId);
    const next = title.trim().slice(0, 48);
    if (!next || next === node.title) return;
    node.title = next;
    this.publish();
  }

  toggleFavorite(nodeId: string): void {
    const node = this.requireNode(nodeId);
    node.favorite = !node.favorite;
    this.publish();
  }

  deleteBranch(nodeId: string): Pattern | null {
    if (nodeId === this.rootNodeId) {
      throw new Error("The root history node cannot be deleted.");
    }

    const node = this.requireNode(nodeId);
    const deletedIds = this.collectDescendants(node.id);
    deletedIds.add(node.id);

    const activeDeleted = deletedIds.has(this.activeNodeId);
    const selectedDeleted = deletedIds.has(this.selectedNodeId);
    let fallbackPattern: Pattern | null = null;

    for (const id of deletedIds) {
      this.nodes.delete(id);
    }

    if (activeDeleted) {
      const fallbackId =
        node.parentId && this.nodes.has(node.parentId)
          ? node.parentId
          : this.rootNodeId;
      this.activeNodeId = fallbackId;
      fallbackPattern = clonePattern(this.requireNode(fallbackId).pattern);
    }

    if (selectedDeleted) {
      this.selectedNodeId = this.activeNodeId;
    }

    this.publish();
    return fallbackPattern;
  }

  private ensureSourceCheckpoint(sourcePattern: Pattern): string {
    const active = this.requireNode(this.activeNodeId);

    if (
      creativeSignature(active.pattern) ===
      creativeSignature(sourcePattern)
    ) {
      return active.id;
    }

    const checkpoint = this.createNode({
      parentId: active.id,
      pattern: sourcePattern,
      operation: "manualEdit",
      operationLabel: "EDIT",
      title: "Edited source",
    });

    this.activeNodeId = checkpoint.id;
    this.selectedNodeId = checkpoint.id;
    return checkpoint.id;
  }

  private createNode(input: {
    parentId?: string;
    pattern: Pattern;
    operation: HistoryOperation;
    operationLabel: string;
    title: string;
  }): EvolutionNode {
    const ordinal = this.nextOrdinal;
    this.nextOrdinal += 1;

    const id = "hist-" + String(ordinal).padStart(4, "0");
    const pattern = clonePattern(input.pattern);
    const node: EvolutionNode = {
      id,
      parentId: input.parentId,
      operation: input.operation,
      operationLabel: input.operationLabel,
      title: input.title.slice(0, 48),
      favorite: false,
      ordinal,
      glyphSignature: deriveRhythmGlyph(pattern).signature,
      pattern,
    };

    this.nodes.set(id, node);
    return node;
  }

  private collectDescendants(nodeId: string): Set<string> {
    const descendants = new Set<string>();
    const queue = [nodeId];

    while (queue.length > 0) {
      const parentId = queue.shift();
      if (!parentId) continue;

      for (const node of this.nodes.values()) {
        if (node.parentId !== parentId || descendants.has(node.id)) continue;
        descendants.add(node.id);
        queue.push(node.id);
      }
    }

    descendants.delete(nodeId);
    return descendants;
  }

  private requireNode(nodeId: string): EvolutionNode {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error("Unknown history node: " + nodeId);
    }
    return node;
  }

  private cloneNode(node: EvolutionNode): EvolutionNode {
    return {
      ...node,
      pattern: clonePattern(node.pattern),
    };
  }

  private publish(): void {
    this.revision += 1;
    this.snapshot = this.buildSnapshot();

    for (const listener of this.listeners) {
      listener();
    }
  }

  private buildSnapshot(): GenerationHistorySnapshot {
    return {
      rootNodeId: this.rootNodeId,
      activeNodeId: this.activeNodeId,
      selectedNodeId: this.selectedNodeId,
      revision: this.revision,
      nodes: [...this.nodes.values()]
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((node) => this.cloneNode(node)),
    };
  }
}

export const generationHistoryStore = new GenerationHistoryStore();
