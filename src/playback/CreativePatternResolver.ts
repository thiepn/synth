import type { Pattern } from "../domain/contracts";
import {
  chaosStore,
} from "../chaos/ChaosStore";
import {
  generateChaos,
} from "../generation/chaosEngine";
import {
  beatMorphStore,
} from "../morph/BeatMorphStore";
import {
  performanceStore,
} from "../performance/PerformanceStore";
import {
  sequencerStore,
} from "../sequencer/SequencerStore";
import {
  playbackCoordinator,
} from "./PlaybackCoordinator";

interface PatternCache {
  source?: Pattern;
  key: string;
  resolved?: Pattern;
}

export class CreativePatternResolver {
  private sequencerCache: PatternCache = {
    key: "",
  };
  private arrangementCache: PatternCache = {
    key: "",
  };

  constructor() {
    this.syncChaosBasePattern();

    sequencerStore.subscribe(() => {
      this.syncChaosBasePattern();
      this.sequencerCache = { key: "" };
    });

    chaosStore.subscribe(() => {
      this.sequencerCache = { key: "" };
      this.arrangementCache = { key: "" };
    });

    beatMorphStore.subscribe(() => {
      this.sequencerCache = { key: "" };
      this.arrangementCache = { key: "" };
    });

    performanceStore.subscribe(() => {
      this.sequencerCache = { key: "" };
      this.arrangementCache = { key: "" };
    });
  }

  resolveSequencerPattern(
    pattern: Pattern,
  ): Pattern {
    const mode = playbackCoordinator.currentMode();
    if (mode !== "create" && mode !== "live") {
      return pattern;
    }

    const chaos = chaosStore.getSnapshot();
    const morph = beatMorphStore.getSnapshot();
    const performance = performanceStore.getSnapshot();
    const key = [
      mode,
      chaos.revision,
      morph.revision,
      performance.revision,
    ].join("|");

    if (
      this.sequencerCache.source === pattern &&
      this.sequencerCache.key === key &&
      this.sequencerCache.resolved
    ) {
      return this.sequencerCache.resolved;
    }

    let resolved = pattern;

    if (
      mode === "live" &&
      performance.active &&
      performance.macros.morph > 0.001 &&
      morph.preview
    ) {
      resolved = morph.preview.pattern;
    }

    if (
      chaos.config.intensity > 0.001 &&
      !chaos.bypass
    ) {
      if (
        resolved === pattern &&
        chaos.basePattern?.id === pattern.id &&
        chaos.result
      ) {
        resolved = chaos.result.pattern;
      } else {
        resolved = generateChaos(
          resolved,
          chaos.config,
        ).pattern;
      }
    }

    this.sequencerCache = {
      source: pattern,
      key,
      resolved,
    };
    return resolved;
  }

  resolveArrangementPattern(
    pattern: Pattern,
  ): Pattern {
    const performance = performanceStore.getSnapshot();
    if (!performance.active) {
      return pattern;
    }

    const chaos = chaosStore.getSnapshot();
    const morph = beatMorphStore.getSnapshot();
    const key = [
      chaos.revision,
      morph.revision,
      performance.revision,
    ].join("|");

    if (
      this.arrangementCache.source === pattern &&
      this.arrangementCache.key === key &&
      this.arrangementCache.resolved
    ) {
      return this.arrangementCache.resolved;
    }

    let resolved = pattern;

    if (
      performance.macros.morph > 0.001 &&
      morph.preview &&
      morph.a?.id === pattern.id
    ) {
      resolved = morph.preview.pattern;
    }

    if (
      chaos.config.intensity > 0.001 &&
      !chaos.bypass
    ) {
      resolved = generateChaos(
        resolved,
        chaos.config,
      ).pattern;
    }

    this.arrangementCache = {
      source: pattern,
      key,
      resolved,
    };
    return resolved;
  }

  private syncChaosBasePattern(): void {
    chaosStore.setBasePattern(
      sequencerStore.getSnapshot().pattern,
    );
  }
}

export const creativePatternResolver =
  new CreativePatternResolver();
