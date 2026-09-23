import type {
  GenerationLock,
  InstrumentRole,
  Pattern,
  PatternLane,
  StepEvent,
} from "../domain/contracts";
import { FOUNDATION_STEP_TICKS } from "../music/foundationPattern";
import {
  SEQUENCER_ADVANCED_LIMITS,
  clampManualTimingOffsetUs,
} from "../sequencer/playbackRules";
import { hashSeed, shortSeed } from "./prng";

export const CHAOS_ENGINE_ID = "chaos-engine";
export const CHAOS_ENGINE_VERSION = 1;

export type ChaosDomainId =
  | "rhythm"
  | "dynamics"
  | "timing"
  | "probability"
  | "ornament"
  | "instrumentation";

export interface ChaosDomainConfig {
  enabled: boolean;
  amount: number;
}

export interface ChaosFreezeRegion {
  laneId?: string;
  startTick: number;
  endTick: number;
  domains?: ChaosDomainId[];
}

export interface ChaosFreezeMask {
  laneIds: string[];
  domains: ChaosDomainId[];
  regions: ChaosFreezeRegion[];
}

export interface ChaosConfig {
  seed: string;
  intensity: number;
  domains: Record<ChaosDomainId, ChaosDomainConfig>;
  freezeMask: ChaosFreezeMask;
}

export interface ChaosDiff {
  rhythm: { added: number; removed: number; moved: number };
  dynamics: { modified: number };
  timing: { modified: number };
  probability: { modified: number };
  ornament: { modified: number };
  instrumentation: { modified: number };
  totalChanges: number;
}

export interface ChaosResult {
  pattern: Pattern;
  config: ChaosConfig;
  diff: ChaosDiff;
  displaySeed: string;
}

export const CHAOS_DOMAINS: ReadonlyArray<{
  id: ChaosDomainId;
  label: string;
  code: string;
}> = Object.freeze([
  { id: "rhythm", label: "Rhythm", code: "RHY" },
  { id: "dynamics", label: "Dynamics", code: "DYN" },
  { id: "timing", label: "Timing", code: "TIM" },
  { id: "probability", label: "Probability", code: "PRB" },
  { id: "ornament", label: "Ornament", code: "ORN" },
  { id: "instrumentation", label: "Instrumentation", code: "INS" },
]);

const DEFAULT_DOMAIN: ChaosDomainConfig = Object.freeze({
  enabled: true,
  amount: 1,
});

const DOMAIN_LOCK: Record<ChaosDomainId, keyof GenerationLock> = {
  rhythm: "rhythm",
  dynamics: "dynamics",
  timing: "timing",
  probability: "rhythm",
  ornament: "rhythm",
  instrumentation: "sound",
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function keyedUnit(seed: string, ...parts: Array<string | number>): number {
  return hashSeed([seed, ...parts].join("|")) / 4294967296;
}

function keyedSigned(seed: string, ...parts: Array<string | number>): number {
  return keyedUnit(seed, ...parts) * 2 - 1;
}

function cloneEvent(event: StepEvent): StepEvent {
  return {
    ...event,
    generatorTags: event.generatorTags ? [...event.generatorTags] : undefined,
    grooveBase: event.grooveBase ? { ...event.grooveBase } : undefined,
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

export function clonePatternForChaos(pattern: Pattern): Pattern {
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

export function createDefaultChaosConfig(seed = "CHAOS-0001"): ChaosConfig {
  return {
    seed,
    intensity: 0.34,
    domains: {
      rhythm: { ...DEFAULT_DOMAIN },
      dynamics: { ...DEFAULT_DOMAIN },
      timing: { ...DEFAULT_DOMAIN },
      probability: { ...DEFAULT_DOMAIN },
      ornament: { ...DEFAULT_DOMAIN },
      instrumentation: { ...DEFAULT_DOMAIN },
    },
    freezeMask: {
      laneIds: [],
      domains: [],
      regions: [],
    },
  };
}

export function cloneChaosConfig(config: ChaosConfig): ChaosConfig {
  return {
    seed: config.seed,
    intensity: clamp01(config.intensity),
    domains: {
      rhythm: { ...config.domains.rhythm },
      dynamics: { ...config.domains.dynamics },
      timing: { ...config.domains.timing },
      probability: { ...config.domains.probability },
      ornament: { ...config.domains.ornament },
      instrumentation: { ...config.domains.instrumentation },
    },
    freezeMask: {
      laneIds: [...config.freezeMask.laneIds],
      domains: [...config.freezeMask.domains],
      regions: config.freezeMask.regions.map((region) => ({
        ...region,
        domains: region.domains ? [...region.domains] : undefined,
      })),
    },
  };
}

function normalizeConfig(config: ChaosConfig): ChaosConfig {
  const next = cloneChaosConfig(config);
  next.intensity = clamp01(next.intensity);

  for (const domain of CHAOS_DOMAINS) {
    next.domains[domain.id].amount = clamp01(next.domains[domain.id].amount);
  }

  return next;
}

function emptyDiff(): ChaosDiff {
  return {
    rhythm: { added: 0, removed: 0, moved: 0 },
    dynamics: { modified: 0 },
    timing: { modified: 0 },
    probability: { modified: 0 },
    ornament: { modified: 0 },
    instrumentation: { modified: 0 },
    totalChanges: 0,
  };
}

function finishDiff(diff: ChaosDiff): ChaosDiff {
  return {
    ...diff,
    totalChanges:
      diff.rhythm.added +
      diff.rhythm.removed +
      diff.rhythm.moved +
      diff.dynamics.modified +
      diff.timing.modified +
      diff.probability.modified +
      diff.ornament.modified +
      diff.instrumentation.modified,
  };
}

function effectiveAmount(config: ChaosConfig, domain: ChaosDomainId): number {
  if (config.freezeMask.domains.includes(domain)) return 0;
  const settings = config.domains[domain];
  if (!settings.enabled) return 0;
  return clamp01(config.intensity * settings.amount);
}

function regionContains(startTick: number, endTick: number, tick: number): boolean {
  return tick >= startTick && tick < endTick;
}

function isFrozen(
  lane: PatternLane,
  tick: number,
  domain: ChaosDomainId,
  config: ChaosConfig,
): boolean {
  if (config.freezeMask.laneIds.includes(lane.id)) return true;
  if (lane.lock[DOMAIN_LOCK[domain]]) return true;

  if (
    lane.regionLocks?.some(
      (region) =>
        regionContains(region.startTick, region.endTick, tick) &&
        region[DOMAIN_LOCK[domain]],
    )
  ) {
    return true;
  }

  return config.freezeMask.regions.some((region) => {
    if (region.laneId && region.laneId !== lane.id) return false;
    if (!regionContains(region.startTick, region.endTick, tick)) return false;
    return !region.domains || region.domains.includes(domain);
  });
}

function accentForVelocity(velocity: number): StepEvent["accent"] {
  if (velocity >= 0.85) return "accent";
  if (velocity <= 0.3) return "ghost";
  return "normal";
}

function anchorStrength(role: InstrumentRole, event: StepEvent): number {
  if (event.accent === "ghost") return 0.08;
  if (role === "kick" && event.tick === 0) return 1;
  if (role === "snare" || role === "clap") {
    return event.accent === "accent" ? 0.95 : 0.78;
  }
  if (role === "kick") return 0.7;
  if (role === "closedHat" || role === "openHat") return 0.42;
  return 0.28;
}

function activationThreshold(
  seed: string,
  floor: number,
  span: number,
  ...parts: Array<string | number>
): number {
  return clamp01(floor + keyedUnit(seed, ...parts, "threshold") * span);
}

function progressiveMagnitude(amount: number, threshold: number): number {
  if (amount <= threshold) return 0;
  if (threshold >= 0.999) return amount >= 1 ? 1 : 0;
  return clamp01((amount - threshold) / (1 - threshold));
}

function canPlaceTick(
  lane: PatternLane,
  events: Map<number, StepEvent>,
  tick: number,
  pattern: Pattern,
  config: ChaosConfig,
): boolean {
  if (tick < 0 || tick >= pattern.lengthTicks) return false;
  if (events.has(tick)) return false;
  if (isFrozen(lane, tick, "rhythm", config)) return false;
  return true;
}

function rhythmPass(
  lane: PatternLane,
  pattern: Pattern,
  config: ChaosConfig,
  amount: number,
  diff: ChaosDiff,
): PatternLane {
  if (amount <= 0) return cloneLane(lane);

  const sourceEvents = lane.events.map(cloneEvent).sort((a, b) => a.tick - b.tick);
  const events = new Map<number, StepEvent>(
    sourceEvents.map((event) => [event.tick, cloneEvent(event)]),
  );

  for (const source of sourceEvents) {
    if (isFrozen(lane, source.tick, "rhythm", config)) continue;

    const anchor = anchorStrength(lane.role, source);
    const removeThreshold = activationThreshold(
      config.seed,
      0.48 + anchor * 0.38,
      Math.max(0.02, 0.14 - anchor * 0.08),
      "rhythm",
      lane.id,
      source.id,
      "remove",
    );

    if (amount >= removeThreshold && sourceEvents.length > 1) {
      events.delete(source.tick);
      diff.rhythm.removed += 1;
      continue;
    }

    const moveThreshold = activationThreshold(
      config.seed,
      0.28 + anchor * 0.42,
      0.24,
      "rhythm",
      lane.id,
      source.id,
      "move",
    );
    if (amount < moveThreshold) continue;

    const direction =
      keyedUnit(config.seed, "rhythm", lane.id, source.id, "direction") < 0.5
        ? -1
        : 1;
    const distance =
      amount > 0.8 &&
      keyedUnit(config.seed, "rhythm", lane.id, source.id, "distance") > 0.72
        ? 2
        : 1;
    const targetTick = source.tick + direction * distance * FOUNDATION_STEP_TICKS;

    if (!canPlaceTick(lane, events, targetTick, pattern, config)) continue;

    const current = events.get(source.tick);
    if (!current) continue;

    events.delete(source.tick);
    current.tick = targetTick;
    events.set(targetTick, current);
    diff.rhythm.moved += 1;
  }

  const totalSteps = Math.max(
    1,
    Math.round(pattern.lengthTicks / FOUNDATION_STEP_TICKS),
  );
  const additions: Array<{ step: number; threshold: number }> = [];

  for (let step = 0; step < totalSteps; step += 1) {
    const tick = step * FOUNDATION_STEP_TICKS;
    if (!canPlaceTick(lane, events, tick, pattern, config)) continue;

    additions.push({
      step,
      threshold: activationThreshold(
        config.seed,
        0.55,
        0.45,
        "rhythm",
        lane.id,
        step,
        "add",
      ),
    });
  }

  additions.sort((a, b) => a.threshold - b.threshold);
  const maxAdds = Math.min(
    Math.max(0, totalSteps - events.size),
    Math.floor(amount * 4),
  );
  let added = 0;

  for (const candidate of additions) {
    if (added >= maxAdds || amount < candidate.threshold) break;
    const tick = candidate.step * FOUNDATION_STEP_TICKS;
    if (!canPlaceTick(lane, events, tick, pattern, config)) continue;

    const magnitude = progressiveMagnitude(amount, candidate.threshold);
    const velocity = clamp01(
      0.2 +
        keyedUnit(
          config.seed,
          "rhythm",
          lane.id,
          candidate.step,
          "add-velocity",
        ) *
          (0.24 + magnitude * 0.22),
    );

    const event: StepEvent = {
      id:
        "evt-chaos-" +
        lane.id.replace("lane-", "") +
        "-" +
        candidate.step +
        "-" +
        shortSeed(config.seed),
      tick,
      velocity,
      probability: round6(0.62 + magnitude * 0.34),
      timingOffsetUs: 0,
      accent: velocity <= 0.3 ? "ghost" : "normal",
      generatorTags: [
        CHAOS_ENGINE_ID,
        "chaos:rhythm",
        "chaos:v" + CHAOS_ENGINE_VERSION,
      ],
    };

    events.set(tick, event);
    diff.rhythm.added += 1;
    added += 1;
  }

  if (sourceEvents.length > 0 && events.size === 0) {
    const fallback = sourceEvents.reduce((best, event) =>
      anchorStrength(lane.role, event) > anchorStrength(lane.role, best)
        ? event
        : best,
    );
    events.set(fallback.tick, cloneEvent(fallback));
    diff.rhythm.removed = Math.max(0, diff.rhythm.removed - 1);
  }

  return {
    ...cloneLane(lane),
    events: [...events.values()].sort((a, b) => a.tick - b.tick),
  };
}

function dynamicsPass(
  lane: PatternLane,
  config: ChaosConfig,
  amount: number,
  diff: ChaosDiff,
): void {
  if (amount <= 0) return;

  for (const event of lane.events) {
    if (isFrozen(lane, event.tick, "dynamics", config)) continue;

    const threshold = activationThreshold(
      config.seed,
      0.12,
      0.72,
      "dynamics",
      lane.id,
      event.id,
    );
    if (amount < threshold) continue;

    const magnitude = progressiveMagnitude(amount, threshold);
    const group = Math.floor(
      event.tick / Math.max(1, FOUNDATION_STEP_TICKS * 4),
    );
    const laneContour = keyedSigned(
      config.seed,
      "dynamics",
      lane.id,
      group,
      "contour",
    );
    const local = keyedSigned(
      config.seed,
      "dynamics",
      lane.id,
      event.id,
      "local",
    );
    const delta = (laneContour * 0.1 + local * 0.2) * (0.35 + magnitude);

    const before = event.velocity;
    event.velocity = round6(
      Math.max(0.05, Math.min(1, event.velocity + delta * amount)),
    );
    event.accent = accentForVelocity(event.velocity);
    delete event.grooveBase;

    if (Math.abs(before - event.velocity) > 0.0001) {
      diff.dynamics.modified += 1;
    }
  }
}

function timingPass(
  lane: PatternLane,
  config: ChaosConfig,
  amount: number,
  diff: ChaosDiff,
): void {
  if (amount <= 0) return;

  for (const event of lane.events) {
    if (isFrozen(lane, event.tick, "timing", config)) continue;

    const threshold = activationThreshold(
      config.seed,
      0.16,
      0.7,
      "timing",
      lane.id,
      event.id,
    );
    if (amount < threshold) continue;

    const group = Math.floor(
      event.tick / Math.max(1, FOUNDATION_STEP_TICKS * 4),
    );
    const groupBias = keyedSigned(
      config.seed,
      "timing",
      lane.id,
      group,
      "group",
    );
    const local = keyedSigned(
      config.seed,
      "timing",
      lane.id,
      event.id,
      "local",
    );
    const offset = (groupBias * 13_000 + local * 24_000) * amount;

    const before = event.timingOffsetUs;
    event.timingOffsetUs = clampManualTimingOffsetUs(
      event.timingOffsetUs + offset,
    );
    delete event.grooveBase;

    if (before !== event.timingOffsetUs) {
      diff.timing.modified += 1;
    }
  }
}

function probabilityPass(
  lane: PatternLane,
  config: ChaosConfig,
  amount: number,
  diff: ChaosDiff,
): void {
  if (amount <= 0) return;

  for (const event of lane.events) {
    if (isFrozen(lane, event.tick, "probability", config)) continue;

    const threshold = activationThreshold(
      config.seed,
      0.2,
      0.68,
      "probability",
      lane.id,
      event.id,
    );
    if (amount < threshold) continue;

    const magnitude = progressiveMagnitude(amount, threshold);
    const bias = keyedSigned(
      config.seed,
      "probability",
      lane.id,
      event.id,
      "bias",
    );
    const before = event.probability;
    event.probability = round6(
      Math.max(
        0.05,
        Math.min(
          1,
          event.probability +
            bias * (0.16 + 0.38 * magnitude) * amount,
        ),
      ),
    );

    if (Math.abs(before - event.probability) > 0.0001) {
      diff.probability.modified += 1;
    }
  }
}

function ornamentPass(
  lane: PatternLane,
  config: ChaosConfig,
  amount: number,
  diff: ChaosDiff,
): void {
  if (amount <= 0) return;

  for (const event of lane.events) {
    if (isFrozen(lane, event.tick, "ornament", config)) continue;

    const threshold = activationThreshold(
      config.seed,
      0.5,
      0.45,
      "ornament",
      lane.id,
      event.id,
    );
    if (amount < threshold) continue;

    const rollCapable =
      lane.role === "closedHat" ||
      lane.role === "openHat" ||
      lane.role === "percussion" ||
      lane.role === "tom" ||
      lane.role === "snare";
    const flamCapable =
      lane.role === "snare" ||
      lane.role === "clap" ||
      lane.role === "tom" ||
      lane.role === "percussion";

    let changed = false;

    if (
      rollCapable &&
      keyedUnit(config.seed, "ornament", lane.id, event.id, "kind") < 0.62
    ) {
      const maxRatchets = Math.max(
        2,
        Math.min(
          SEQUENCER_ADVANCED_LIMITS.maxRatchets,
          2 + Math.floor(amount * 3),
        ),
      );
      const count =
        2 +
        Math.floor(
          keyedUnit(
            config.seed,
            "ornament",
            lane.id,
            event.id,
            "ratchet",
          ) *
            (maxRatchets - 1),
        );
      const next = Math.max(
        2,
        Math.min(SEQUENCER_ADVANCED_LIMITS.maxRatchets, count),
      );
      if ((event.ratchetCount ?? 1) !== next) {
        event.ratchetCount = next;
        changed = true;
      }
    } else if (flamCapable) {
      const next = Math.round(
        7_000 +
          keyedUnit(
            config.seed,
            "ornament",
            lane.id,
            event.id,
            "flam",
          ) *
            Math.min(
              30_000,
              SEQUENCER_ADVANCED_LIMITS.maxFlamOffsetUs - 7_000,
            ),
      );
      if ((event.flamOffsetUs ?? 0) !== next) {
        event.flamOffsetUs = next;
        changed = true;
      }
    }

    if (changed) {
      event.generatorTags = [
        ...(event.generatorTags ?? []).filter(
          (tag) => !tag.startsWith("chaos:ornament"),
        ),
        "chaos:ornament",
      ];
      diff.ornament.modified += 1;
    }
  }
}

const INSTRUMENT_GROUPS: InstrumentRole[][] = [
  ["snare", "clap"],
  ["closedHat", "openHat"],
  ["tom", "percussion"],
];

function compatibleLaneIds(
  lane: PatternLane,
  lanes: PatternLane[],
): PatternLane[] {
  const group = INSTRUMENT_GROUPS.find((roles) => roles.includes(lane.role));
  if (!group) return [];

  return lanes.filter(
    (candidate) =>
      candidate.id !== lane.id &&
      group.includes(candidate.role),
  );
}

function instrumentationPass(
  lanes: PatternLane[],
  config: ChaosConfig,
  amount: number,
  diff: ChaosDiff,
): void {
  if (amount <= 0) return;

  const source = lanes.map(cloneLane);

  for (const lane of lanes) {
    if (isFrozen(lane, 0, "instrumentation", config)) continue;

    const threshold = activationThreshold(
      config.seed,
      0.66,
      0.32,
      "instrumentation",
      lane.id,
    );
    if (amount < threshold) continue;

    const compatible = compatibleLaneIds(lane, source).filter(
      (candidate) =>
        !isFrozen(candidate, 0, "instrumentation", config),
    );
    if (compatible.length === 0) continue;

    const index = Math.floor(
      keyedUnit(
        config.seed,
        "instrumentation",
        lane.id,
        "choice",
      ) * compatible.length,
    );
    const target = compatible[Math.min(index, compatible.length - 1)];
    if (!target || target.kitSlotId === lane.kitSlotId) continue;

    lane.kitSlotId = target.kitSlotId;
    diff.instrumentation.modified += 1;
  }
}

function validatePattern(pattern: Pattern): Pattern {
  const next = clonePatternForChaos(pattern);

  next.lanes = next.lanes.map((lane) => {
    const byTick = new Map<number, StepEvent>();

    for (const source of lane.events) {
      if (!Number.isFinite(source.tick)) continue;
      const tick = Math.round(source.tick);
      if (tick < 0 || tick >= next.lengthTicks) continue;
      if (byTick.has(tick)) continue;

      const event = cloneEvent(source);
      event.tick = tick;
      event.velocity = round6(
        Math.max(0.05, Math.min(1, event.velocity)),
      );
      event.probability = round6(
        Math.max(0, Math.min(1, event.probability)),
      );
      event.timingOffsetUs = clampManualTimingOffsetUs(
        event.timingOffsetUs,
      );

      if (event.ratchetCount !== undefined) {
        event.ratchetCount = Math.max(
          1,
          Math.min(
            SEQUENCER_ADVANCED_LIMITS.maxRatchets,
            Math.round(event.ratchetCount),
          ),
        );
      }

      if (event.flamOffsetUs !== undefined) {
        event.flamOffsetUs = Math.max(
          0,
          Math.min(
            SEQUENCER_ADVANCED_LIMITS.maxFlamOffsetUs,
            Math.round(event.flamOffsetUs),
          ),
        );
      }

      byTick.set(tick, event);
    }

    return {
      ...lane,
      events: [...byTick.values()].sort((a, b) => a.tick - b.tick),
    };
  });

  return next;
}

function configSignature(config: ChaosConfig): string {
  return CHAOS_DOMAINS.map((domain) => {
    const settings = config.domains[domain.id];
    return (
      domain.code +
      (settings.enabled ? "1" : "0") +
      Math.round(settings.amount * 100)
    );
  }).join("-");
}

export function generateChaos(
  sourcePattern: Pattern,
  rawConfig: ChaosConfig,
): ChaosResult {
  const config = normalizeConfig(rawConfig);
  const diff = emptyDiff();

  if (
    config.intensity <= 0 ||
    CHAOS_DOMAINS.every(
      (domain) => effectiveAmount(config, domain.id) <= 0,
    )
  ) {
    return {
      pattern: clonePatternForChaos(sourcePattern),
      config,
      diff: finishDiff(diff),
      displaySeed: shortSeed(config.seed),
    };
  }

  const pattern = clonePatternForChaos(sourcePattern);
  const rhythmAmount = effectiveAmount(config, "rhythm");

  pattern.lanes = pattern.lanes.map((lane) =>
    rhythmPass(lane, pattern, config, rhythmAmount, diff),
  );

  for (const lane of pattern.lanes) {
    dynamicsPass(
      lane,
      config,
      effectiveAmount(config, "dynamics"),
      diff,
    );
    timingPass(
      lane,
      config,
      effectiveAmount(config, "timing"),
      diff,
    );
    probabilityPass(
      lane,
      config,
      effectiveAmount(config, "probability"),
      diff,
    );
    ornamentPass(
      lane,
      config,
      effectiveAmount(config, "ornament"),
      diff,
    );
  }

  instrumentationPass(
    pattern.lanes,
    config,
    effectiveAmount(config, "instrumentation"),
    diff,
  );

  const finalDiff = finishDiff(diff);
  if (finalDiff.totalChanges === 0) {
    return {
      pattern: clonePatternForChaos(sourcePattern),
      config,
      diff: finalDiff,
      displaySeed: shortSeed(config.seed),
    };
  }

  const seedCode = shortSeed(
    [
      config.seed,
      sourcePattern.id,
      config.intensity.toFixed(4),
      configSignature(config),
    ].join("|"),
  );
  const previousIntent = sourcePattern.provenance?.intent;
  const baseIntent = previousIntent ?? {
    energy: 0.5,
    density: 0.5,
    complexity: 0.5,
    syncopation: 0.5,
    space: 0.5,
    swing: sourcePattern.groove?.swing ?? 0,
    humanization: sourcePattern.groove?.humanization ?? 0,
    mutationDistance: 0,
  };

  pattern.id = "pattern-chaos-" + seedCode;
  pattern.name =
    "CHAOS " +
    String(Math.round(config.intensity * 100)).padStart(3, "0") +
    " / " +
    shortSeed(config.seed);
  pattern.provenance = {
    seed: config.seed,
    generatorId: CHAOS_ENGINE_ID,
    generatorVersion: CHAOS_ENGINE_VERSION,
    sourceEntityId: sourcePattern.id,
    mutationId:
      "chaos:" +
      Math.round(config.intensity * 100) +
      ":" +
      configSignature(config),
    styleDnaId: sourcePattern.provenance?.styleDnaId,
    styleDnaVersion: sourcePattern.provenance?.styleDnaVersion,
    style: { ...(sourcePattern.provenance?.style ?? {}) },
    intent: {
      ...baseIntent,
      mutationDistance: config.intensity,
    },
  };

  return {
    pattern: validatePattern(pattern),
    config,
    diff: finalDiff,
    displaySeed: shortSeed(config.seed),
  };
}
