import { useEffect, useMemo } from "react";
import { chaosStore } from "../chaos/ChaosStore";
import { useChaosSnapshot } from "../chaos/useChaos";
import { generateChaos } from "../generation/chaosEngine";
import { useBeatMorphSnapshot } from "../morph/useBeatMorph";
import { sequencerStore } from "../sequencer/SequencerStore";
import { useSequencerSnapshot } from "../sequencer/useSequencer";
import type { ModeId } from "../ui/pulse/Primitives";
import { usePerformanceSnapshot } from "./usePerformance";

export function CreativePlaybackBridge({
  mode,
}: {
  mode: ModeId;
}): null {
  const sequencer = useSequencerSnapshot();
  const chaos = useChaosSnapshot();
  const morph = useBeatMorphSnapshot();
  const performance = usePerformanceSnapshot();

  useEffect(() => {
    chaosStore.setBasePattern(sequencer.pattern);
  }, [sequencer.pattern]);

  const runtimePattern = useMemo(() => {
    if (mode !== "create" && mode !== "live") return undefined;

    let pattern = sequencer.pattern;
    let changed = false;

    if (
      mode === "live" &&
      performance.active &&
      performance.macros.morph > 0.001 &&
      morph.preview
    ) {
      pattern = morph.preview.pattern;
      changed = true;
    }

    if (
      chaos.config.intensity > 0.001 &&
      !chaos.bypass
    ) {
      const result = generateChaos(pattern, chaos.config);
      if (result.diff.totalChanges > 0) {
        pattern = result.pattern;
        changed = true;
      }
    }

    return changed ? pattern : undefined;
  }, [
    mode,
    sequencer.pattern,
    chaos.config,
    chaos.bypass,
    performance.active,
    performance.macros.morph,
    morph.preview,
  ]);

  useEffect(() => {
    sequencerStore.setRuntimePreview(runtimePattern);
  }, [runtimePattern]);

  useEffect(
    () => () => {
      sequencerStore.setRuntimePreview(undefined);
    },
    [],
  );

  return null;
}
