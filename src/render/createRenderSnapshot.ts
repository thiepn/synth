import { audioTransport } from "../audio/AudioTransport";
import { drumEngine } from "../audio/DrumEngine";
import { sampleAssetStore } from "../audio/SampleAssetStore";
import { drumSoundStore } from "../audio/drumSoundModel";
import { arrangementStore } from "../arrange/ArrangementStore";
import type {
  DrumMaterialSpec,
  Pattern,
  SampleSoundSpec,
  SoundSpec,
  SynthSoundSpec,
  HybridSoundSpec,
} from "../domain/contracts";
import { masteringStore } from "../master/MasteringStore";
import { mixerStore } from "../mix/MixerStore";
import {
  SEQUENCER_LANES,
  type DrumVoiceId,
} from "../music/foundationPattern";
import { modulationStore } from "../modulation/ModulationStore";
import { sequencerStore } from "../sequencer/SequencerStore";
import type {
  RenderOccurrence,
  RenderSampleBytes,
  RenderSlotSound,
  RenderSnapshot,
  RenderSnapshotRequest,
} from "./renderTypes";

function clonePattern(pattern: Pattern): Pattern {
  return {
    ...pattern,
    meter: { ...pattern.meter },
    lanes: pattern.lanes.map((lane) => ({
      ...lane,
      events: lane.events.map((event) => ({
        ...event,
        generatorTags: event.generatorTags
          ? [...event.generatorTags]
          : undefined,
        grooveBase: event.grooveBase
          ? { ...event.grooveBase }
          : undefined,
      })),
      lock: { ...lane.lock },
      regionLocks: lane.regionLocks?.map((region) => ({ ...region })),
    })),
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

function cloneSampleSpec(spec: SampleSoundSpec): SampleSoundSpec {
  return { ...spec };
}

function cloneSynthSpec(spec: SynthSoundSpec): SynthSoundSpec {
  return {
    ...spec,
    params: { ...spec.params },
  };
}

function cloneSoundSpec(spec: SoundSpec): SoundSpec {
  if (spec.kind === "sample") return cloneSampleSpec(spec);
  if (spec.kind === "synth") return cloneSynthSpec(spec);

  const hybrid: HybridSoundSpec = {
    kind: "hybrid",
    sample: cloneSampleSpec(spec.sample),
    layers: spec.layers.map(cloneSynthSpec),
    synthGainDb: spec.synthGainDb,
  };
  return hybrid;
}

function assetIdsFromSpec(spec: SoundSpec): string[] {
  if (spec.kind === "sample") return [spec.assetId];
  if (spec.kind === "hybrid") return [spec.sample.assetId];
  return [];
}

function patternOccurrence(pattern: Pattern): RenderOccurrence {
  return {
    id: "render-pattern-" + pattern.id,
    startTick: 0,
    lengthTicks: pattern.lengthTicks,
    occurrenceIndex: 0,
    pattern: clonePattern(pattern),
  };
}

function arrangementOccurrences(): RenderOccurrence[] {
  const snapshot = arrangementStore.getSnapshot();
  const blueprint = snapshot.blueprint;
  if (!blueprint) return [];

  return snapshot.occurrences.flatMap((occurrence, occurrenceIndex) => {
    const pattern = arrangementStore.getPattern(occurrence.patternId);
    if (!pattern) return [];

    const section = blueprint.sections.find(
      (entry) => entry.id === occurrence.sectionId,
    );

    return [{
      id: occurrence.id,
      sectionId: occurrence.sectionId,
      startTick: occurrence.startTick,
      lengthTicks: occurrence.lengthTicks,
      occurrenceIndex,
      pattern: clonePattern(pattern),
      sectionStartTick: section?.startTick,
      sectionLengthTicks: section?.lengthTicks,
      energyStart: section?.energyStart,
      energyEnd: section?.energyEnd,
    }];
  });
}

function rangeForRequest(
  request: RenderSnapshotRequest,
  occurrences: RenderOccurrence[],
  fallbackPattern: Pattern,
): {
  startTick: number;
  endTick: number;
  label: string;
  occurrences: RenderOccurrence[];
} {
  const arrangement = arrangementStore.getSnapshot();
  const blueprint = arrangement.blueprint;

  if (request.kind === "pattern") {
    return {
      startTick: 0,
      endTick: fallbackPattern.lengthTicks,
      label: fallbackPattern.name,
      occurrences: [patternOccurrence(fallbackPattern)],
    };
  }

  if (request.kind === "arrangement") {
    if (!blueprint || occurrences.length === 0) {
      throw new Error("No ARRANGE timeline is available to render.");
    }

    return {
      startTick: 0,
      endTick: arrangement.totalTicks,
      label: blueprint.name,
      occurrences,
    };
  }

  if (request.kind === "section") {
    if (!blueprint || occurrences.length === 0) {
      throw new Error("No ARRANGE section is available to render.");
    }

    const sectionId =
      request.sectionId ??
      arrangement.selectedSectionId ??
      blueprint.sections[0]?.id;
    const section = blueprint.sections.find(
      (entry) => entry.id === sectionId,
    );
    if (!section) {
      throw new Error("The requested ARRANGE section does not exist.");
    }

    return {
      startTick: section.startTick,
      endTick: section.startTick + section.lengthTicks,
      label: section.label,
      occurrences: occurrences.filter(
        (entry) => entry.sectionId === section.id,
      ),
    };
  }

  const hasArrangement = Boolean(
    blueprint &&
    occurrences.length > 0 &&
    arrangement.totalTicks > 0,
  );
  const maximum = hasArrangement
    ? arrangement.totalTicks
    : fallbackPattern.lengthTicks;
  const startTick = Math.max(
    0,
    Math.min(maximum - 1, Math.round(request.startTick ?? 0)),
  );
  const endTick = Math.max(
    startTick + 1,
    Math.min(
      maximum,
      Math.round(request.endTick ?? maximum),
    ),
  );
  const sourceOccurrences = hasArrangement
    ? occurrences
    : [patternOccurrence(fallbackPattern)];

  return {
    startTick,
    endTick,
    label: "CUSTOM " + startTick + "–" + endTick,
    occurrences: sourceOccurrences.filter(
      (entry) =>
        entry.startTick < endTick &&
        entry.startTick + entry.lengthTicks > startTick,
    ),
  };
}

function slotSounds(): RenderSlotSound[] {
  return SEQUENCER_LANES.map((lane) => {
    const resolved = drumSoundStore.resolvePlaybackSound(
      lane.kitSlotId,
      lane.voice,
    );

    return {
      kitSlotId: lane.kitSlotId,
      fallbackVoice: lane.voice,
      resolvedVoice: resolved.voice,
      spec: cloneSoundSpec(resolved.spec),
    };
  });
}

function sampleBytesForSlots(
  slots: readonly RenderSlotSound[],
): RenderSampleBytes[] {
  const ids = new Set<string>();

  for (const slot of slots) {
    for (const assetId of assetIdsFromSpec(slot.spec)) {
      ids.add(assetId);
    }
  }

  return [...ids].map((assetId) => {
    const bytes = sampleAssetStore.getRawBytes(assetId);
    if (!bytes) {
      throw new Error(
        "Sample asset " + assetId + " is missing from this session.",
      );
    }
    return { assetId, bytes };
  });
}

export function createRenderSnapshot(
  request: RenderSnapshotRequest,
): RenderSnapshot {
  const transport = audioTransport.getSnapshot();
  const sequencer = sequencerStore.getSnapshot();
  const arrangementOccurrencesSnapshot = arrangementOccurrences();
  const range = rangeForRequest(
    request,
    arrangementOccurrencesSnapshot,
    sequencer.pattern,
  );
  const sounds = drumSoundStore.getSnapshot();
  const engine = drumEngine.getSnapshot();
  const modulation = modulationStore.getSnapshot();
  const slots = slotSounds();

  const drumSpecs = Object.fromEntries(
    SEQUENCER_LANES.map((lane) => [
      lane.voice,
      { ...sounds.specs[lane.voice] },
    ]),
  ) as Record<DrumVoiceId, DrumMaterialSpec>;

  return {
    id:
      "render-" +
      request.kind +
      "-" +
      Date.now().toString(36),
    createdAt: new Date().toISOString(),
    label: range.label,
    sourceKind: request.kind,
    bpm: transport.bpm,
    meter: { ...transport.meter },
    startTick: range.startTick,
    endTick: range.endTick,
    occurrences: range.occurrences.map((entry) => ({
      ...entry,
      pattern: clonePattern(entry.pattern),
    })),
    drumSpecs,
    slotSounds: slots,
    samples: sampleBytesForSlots(slots),
    mixerState: mixerStore.currentState(),
    modulation: {
      sources: modulation.sources.map((source) => ({
        ...source,
        stepValues: [...source.stepValues],
      })),
      routes: modulation.routes.map((route) => ({ ...route })),
      automationLanes: modulation.automationLanes.map((lane) => ({
        ...lane,
        points: lane.points.map((point) => ({ ...point })),
      })),
    },
    engineMaster: engine.master,
    engineMacros: { ...engine.macros },
    masteringState: masteringStore.currentState(),
  };
}
