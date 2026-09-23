import type { Pattern } from "../domain/contracts";
import {
  CHAOS_DOMAINS,
  cloneChaosConfig,
  clonePatternForChaos,
  createDefaultChaosConfig,
  generateChaos,
  type ChaosConfig,
  type ChaosDomainId,
  type ChaosFreezeRegion,
  type ChaosResult,
} from "../generation/chaosEngine";
import { shortSeed } from "../generation/prng";
import { registerProjectTransientReset } from "../project/transientResetRegistry";

type StoreListener = () => void;

export interface ChaosSnapshot {
  basePattern?: Pattern;
  config: ChaosConfig;
  result?: ChaosResult;
  bypass: boolean;
  active: boolean;
  revision: number;
}

function patternSignature(pattern: Pattern | undefined): string {
  return pattern ? JSON.stringify(pattern) : "";
}

function cloneResult(result: ChaosResult | undefined): ChaosResult | undefined {
  if (!result) return undefined;

  return {
    pattern: clonePatternForChaos(result.pattern),
    config: cloneChaosConfig(result.config),
    diff: {
      rhythm: { ...result.diff.rhythm },
      dynamics: { ...result.diff.dynamics },
      timing: { ...result.diff.timing },
      probability: { ...result.diff.probability },
      ornament: { ...result.diff.ornament },
      instrumentation: { ...result.diff.instrumentation },
      totalChanges: result.diff.totalChanges,
    },
    displaySeed: result.displaySeed,
  };
}

export class ChaosStore {
  private listeners = new Set<StoreListener>();
  private basePattern: Pattern | undefined;
  private baseSignature = "";
  private config = createDefaultChaosConfig();
  private result: ChaosResult | undefined;
  private bypass = false;
  private revision = 0;
  private seedSerial = 1;
  private snapshot: ChaosSnapshot = this.buildSnapshot();

  readonly subscribe = (listener: StoreListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): ChaosSnapshot => this.snapshot;

  setBasePattern(pattern: Pattern): void {
    const signature = patternSignature(pattern);
    if (signature === this.baseSignature) return;

    this.basePattern = clonePatternForChaos(pattern);
    this.baseSignature = signature;
    this.recompute();
  }

  setIntensity(value: number): void {
    const next = Math.max(0, Math.min(1, value));
    if (Math.abs(this.config.intensity - next) < 0.0001) return;
    this.config = { ...this.config, intensity: next };
    this.recompute();
  }

  setSeed(seed: string): void {
    const next = seed.trim();
    if (!next || next === this.config.seed) return;
    this.config = { ...this.config, seed: next };
    this.recompute();
  }

  newSeed(): void {
    const sourceId = this.basePattern?.id ?? "pattern";
    const raw =
      sourceId +
      ":" +
      Date.now().toString(36) +
      ":" +
      this.seedSerial;
    this.seedSerial += 1;
    this.setSeed("CHAOS-" + shortSeed(raw));
  }

  setDomainEnabled(domain: ChaosDomainId, enabled: boolean): void {
    if (this.config.domains[domain].enabled === enabled) return;
    this.config = {
      ...this.config,
      domains: {
        ...this.config.domains,
        [domain]: {
          ...this.config.domains[domain],
          enabled,
        },
      },
    };
    this.recompute();
  }

  setDomainAmount(domain: ChaosDomainId, amount: number): void {
    const next = Math.max(0, Math.min(1, amount));
    if (Math.abs(this.config.domains[domain].amount - next) < 0.0001) {
      return;
    }

    this.config = {
      ...this.config,
      domains: {
        ...this.config.domains,
        [domain]: {
          ...this.config.domains[domain],
          amount: next,
        },
      },
    };
    this.recompute();
  }

  toggleLaneFreeze(laneId: string): void {
    const current = this.config.freezeMask.laneIds;
    const laneIds = current.includes(laneId)
      ? current.filter((id) => id !== laneId)
      : [...current, laneId];

    this.config = {
      ...this.config,
      freezeMask: {
        ...this.config.freezeMask,
        laneIds,
      },
    };
    this.recompute();
  }

  toggleDomainFreeze(domain: ChaosDomainId): void {
    const current = this.config.freezeMask.domains;
    const domains = current.includes(domain)
      ? current.filter((id) => id !== domain)
      : [...current, domain];

    this.config = {
      ...this.config,
      freezeMask: {
        ...this.config.freezeMask,
        domains,
      },
    };
    this.recompute();
  }

  setFreezeRegions(regions: ChaosFreezeRegion[]): void {
    this.config = {
      ...this.config,
      freezeMask: {
        ...this.config.freezeMask,
        regions: regions.map((region) => ({
          ...region,
          domains: region.domains ? [...region.domains] : undefined,
        })),
      },
    };
    this.recompute();
  }

  clearFreezes(): void {
    if (
      this.config.freezeMask.laneIds.length === 0 &&
      this.config.freezeMask.domains.length === 0 &&
      this.config.freezeMask.regions.length === 0
    ) {
      return;
    }

    this.config = {
      ...this.config,
      freezeMask: {
        laneIds: [],
        domains: [],
        regions: [],
      },
    };
    this.recompute();
  }

  setBypass(bypass: boolean): void {
    if (this.bypass === bypass) return;
    this.bypass = bypass;
    this.publish();
  }

  reset(): void {
    const seed = this.config.seed;
    this.config = createDefaultChaosConfig(seed);
    this.config.intensity = 0;
    this.bypass = false;
    this.recompute();
  }

  finishCommit(pattern: Pattern): void {
    this.basePattern = clonePatternForChaos(pattern);
    this.baseSignature = patternSignature(pattern);
    this.config = {
      ...this.config,
      intensity: 0,
      freezeMask: {
        laneIds: [],
        domains: [],
        regions: [],
      },
    };
    this.bypass = false;
    this.recompute();
  }

  private recompute(): void {
    if (!this.basePattern) {
      this.result = undefined;
      this.publish();
      return;
    }

    this.result = generateChaos(this.basePattern, this.config);
    this.publish();
  }

  private publish(): void {
    this.revision += 1;
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): ChaosSnapshot {
    const result = cloneResult(this.result);
    return {
      basePattern: this.basePattern
        ? clonePatternForChaos(this.basePattern)
        : undefined,
      config: cloneChaosConfig(this.config),
      result,
      bypass: this.bypass,
      active: Boolean(
        result &&
          this.config.intensity > 0 &&
          result.diff.totalChanges > 0,
      ),
      revision: this.revision,
    };
  }
}

export const chaosStore = new ChaosStore();

export const CHAOS_STORE_META = Object.freeze({
  engine: "chaos",
  domains: CHAOS_DOMAINS.map((domain) => domain.id),
});

registerProjectTransientReset(
  "chaosStore",
  () => chaosStore.reset(),
);
