import type {
  ArrangementBlueprint,
  DrumMaterialSpec,
  Pattern,
} from "../domain/contracts";
import {
  DRUM_PADS,
  FOUNDATION_STEP_TICKS,
  type DrumVoiceId,
} from "../music/foundationPattern";
import {
  cloneMixerState,
  type MixerChannelState,
  type MixerState,
} from "../mix/mixerModel";
import type {
  AutomationLane,
  AutomationPoint,
} from "../modulation/modulationEngine";
import {
  mixerTargetId,
  normalizeTargetValue,
} from "../modulation/parameterRegistry";
import { SeededRandom, deriveSeed, shortSeed } from "./prng";

export const MIX_ARCHITECT_ID = "mix-architect";
export const MIX_ARCHITECT_VERSION = 1;

export type MixDirectionId =
  | "balanced"
  | "punchy"
  | "wide"
  | "spacious"
  | "raw";

export interface MixArchitectRequest {
  seed: string;
  direction: MixDirectionId;
  intensity: number;
  pattern: Pattern;
  soundSpecs: Record<DrumVoiceId, DrumMaterialSpec>;
  current: MixerState;
  arrangement?: ArrangementBlueprint;
}

export interface MixArchitectMetrics {
  averageGainDb: number;
  stereoSpread: number;
  averageCompression: number;
  averageSaturation: number;
  averageReverbSend: number;
  estimatedHeadroomDb: number;
  automationLaneCount: number;
}

export interface MixArchitectPlan {
  id: string;
  seed: string;
  displaySeed: string;
  direction: MixDirectionId;
  intensity: number;
  state: MixerState;
  automationLanes: AutomationLane[];
  metrics: MixArchitectMetrics;
  warnings: string[];
}

interface ChannelTarget {
  gainDb: number;
  pan: number;
  lowDb: number;
  midDb: number;
  highDb: number;
  compression: number;
  saturation: number;
  reverbSend: number;
  sidechain: number;
}

const BASE_TARGETS: Record<DrumVoiceId, ChannelTarget> = {
  kick: {
    gainDb: -1.2,
    pan: 0,
    lowDb: 2.4,
    midDb: -1.2,
    highDb: 0.2,
    compression: 0.58,
    saturation: 0.12,
    reverbSend: 0.04,
    sidechain: 0,
  },
  snare: {
    gainDb: -2.8,
    pan: 0,
    lowDb: -1.6,
    midDb: 2.1,
    highDb: 1.1,
    compression: 0.5,
    saturation: 0.14,
    reverbSend: 0.18,
    sidechain: 0.05,
  },
  clap: {
    gainDb: -5.2,
    pan: 0.08,
    lowDb: -3.2,
    midDb: 1,
    highDb: 1.8,
    compression: 0.32,
    saturation: 0.11,
    reverbSend: 0.24,
    sidechain: 0.08,
  },
  closedHat: {
    gainDb: -7.2,
    pan: -0.16,
    lowDb: -7.5,
    midDb: -0.8,
    highDb: 2.1,
    compression: 0.18,
    saturation: 0.05,
    reverbSend: 0.1,
    sidechain: 0.1,
  },
  openHat: {
    gainDb: -7.8,
    pan: 0.2,
    lowDb: -7.2,
    midDb: -1,
    highDb: 2.5,
    compression: 0.15,
    saturation: 0.04,
    reverbSend: 0.16,
    sidechain: 0.12,
  },
  tom: {
    gainDb: -4.8,
    pan: -0.1,
    lowDb: 1.4,
    midDb: 0.8,
    highDb: -0.2,
    compression: 0.35,
    saturation: 0.1,
    reverbSend: 0.2,
    sidechain: 0.08,
  },
  percussion: {
    gainDb: -6.2,
    pan: 0.22,
    lowDb: -2.5,
    midDb: 0.7,
    highDb: 1.2,
    compression: 0.24,
    saturation: 0.09,
    reverbSend: 0.19,
    sidechain: 0.12,
  },
  crash: {
    gainDb: -9,
    pan: 0.12,
    lowDb: -8,
    midDb: -1.5,
    highDb: 2.2,
    compression: 0.12,
    saturation: 0.03,
    reverbSend: 0.28,
    sidechain: 0.18,
  },
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function lerp(a: number, b: number, amount: number): number {
  return a + (b - a) * clamp01(amount);
}

function laneDensity(pattern: Pattern, voice: DrumVoiceId): number {
  const lane = pattern.lanes.find((entry) => entry.role === voice);
  if (!lane) return 0;
  const steps = Math.max(
    1,
    Math.round(pattern.lengthTicks / FOUNDATION_STEP_TICKS),
  );
  return clamp01(lane.events.length / Math.max(1, steps * 0.72));
}

function materialMetrics(spec: DrumMaterialSpec): {
  brightness: number;
  weight: number;
  roughness: number;
} {
  return {
    brightness: clamp01(
      spec.tone * 0.48 +
        spec.air * 0.34 +
        spec.noise * 0.18,
    ),
    weight: clamp01(
      spec.body * 0.58 +
        spec.impact * 0.3 +
        (1 - spec.pitch) * 0.12,
    ),
    roughness: clamp01(
      spec.noise * 0.45 +
        spec.character * 0.4 +
        spec.impact * 0.15,
    ),
  };
}

function applyDirection(
  target: ChannelTarget,
  voice: DrumVoiceId,
  direction: MixDirectionId,
): ChannelTarget {
  const next = { ...target };

  switch (direction) {
    case "punchy":
      if (voice === "kick" || voice === "snare" || voice === "clap") {
        next.gainDb += 1;
        next.compression += 0.12;
        next.saturation += 0.08;
      }
      next.reverbSend *= 0.78;
      break;
    case "wide":
      if (
        voice === "closedHat" ||
        voice === "openHat" ||
        voice === "percussion" ||
        voice === "crash"
      ) {
        next.pan *= 1.8;
      }
      next.reverbSend += 0.05;
      break;
    case "spacious":
      next.reverbSend +=
        voice === "kick" ? 0.01 : 0.16;
      next.highDb +=
        voice === "kick" || voice === "tom" ? 0.2 : 0.8;
      next.gainDb -= voice === "crash" ? 1 : 0.25;
      break;
    case "raw":
      next.compression = Math.max(0, next.compression - 0.18);
      next.saturation += 0.18;
      next.lowDb *= 0.75;
      next.midDb *= 0.75;
      next.highDb *= 0.75;
      next.reverbSend *= 0.72;
      break;
    case "balanced":
    default:
      break;
  }

  return next;
}

function targetForVoice(
  request: MixArchitectRequest,
  voice: DrumVoiceId,
  random: SeededRandom,
): ChannelTarget {
  const base = BASE_TARGETS[voice];
  const metrics = materialMetrics(request.soundSpecs[voice]);
  const density = laneDensity(request.pattern, voice);
  const target = applyDirection(
    { ...base },
    voice,
    request.direction,
  );

  target.gainDb -= density * 1.15;
  target.compression += density * 0.08;
  target.saturation += metrics.roughness * 0.05;

  if (voice === "kick" || voice === "tom") {
    target.lowDb += (metrics.weight - 0.5) * 2.2;
  } else {
    target.lowDb -= Math.max(0, metrics.brightness - 0.55) * 1.4;
  }

  target.highDb += (metrics.brightness - 0.5) * 1.8;

  if (
    voice === "closedHat" ||
    voice === "openHat" ||
    voice === "percussion" ||
    voice === "crash"
  ) {
    const sign = random.chance(0.5) ? -1 : 1;
    target.pan =
      sign *
      Math.max(
        Math.abs(target.pan),
        0.08 + random.range(0, 0.16),
      );
  }

  return {
    gainDb: clamp(target.gainDb, -18, 4),
    pan: clamp(target.pan, -0.85, 0.85),
    lowDb: clamp(target.lowDb, -10, 8),
    midDb: clamp(target.midDb, -10, 8),
    highDb: clamp(target.highDb, -10, 8),
    compression: clamp01(target.compression),
    saturation: clamp01(target.saturation),
    reverbSend: clamp01(target.reverbSend),
    sidechain: clamp01(target.sidechain),
  };
}

function blendChannel(
  current: MixerChannelState,
  target: ChannelTarget,
  amount: number,
): MixerChannelState {
  return {
    ...current,
    gainDb: lerp(current.gainDb, target.gainDb, amount),
    pan: lerp(current.pan, target.pan, amount),
    lowDb: lerp(current.lowDb, target.lowDb, amount),
    midDb: lerp(current.midDb, target.midDb, amount),
    highDb: lerp(current.highDb, target.highDb, amount),
    compression: lerp(
      current.compression,
      target.compression,
      amount,
    ),
    saturation: lerp(
      current.saturation,
      target.saturation,
      amount,
    ),
    reverbSend: lerp(
      current.reverbSend,
      target.reverbSend,
      amount,
    ),
    sidechain: lerp(
      current.sidechain,
      target.sidechain,
      amount,
    ),
  };
}

function automationPoint(
  id: string,
  tick: number,
  value: number,
): AutomationPoint {
  return {
    id,
    tick: Math.max(0, Math.round(tick)),
    value: clamp01(value),
    curve: "smooth",
  };
}

function pushDistinct(
  points: AutomationPoint[],
  point: AutomationPoint,
): void {
  const previous = points.at(-1);
  if (
    previous &&
    previous.tick === point.tick
  ) {
    points[points.length - 1] = point;
    return;
  }
  if (
    previous &&
    Math.abs(previous.value - point.value) < 0.003
  ) {
    return;
  }
  points.push(point);
}

function buildSectionAutomation(
  request: MixArchitectRequest,
  state: MixerState,
): AutomationLane[] {
  const blueprint = request.arrangement;
  if (!blueprint || blueprint.sections.length === 0) {
    return [];
  }

  const automation: AutomationLane[] = [];
  const gainVoices: DrumVoiceId[] = [
    "closedHat",
    "openHat",
    "percussion",
    "crash",
  ];
  const spaceVoices: DrumVoiceId[] = [
    "snare",
    "clap",
    "percussion",
    "crash",
  ];

  for (const voice of gainVoices) {
    const targetId = mixerTargetId(voice, "gainDb");
    const base = state.channels[voice].gainDb;
    const points: AutomationPoint[] = [];

    blueprint.sections.forEach((section, index) => {
      const energy =
        (section.energyStart + section.energyEnd) / 2;
      const offset =
        (energy - 0.55) *
        (voice === "crash" ? 2.4 : 1.6);
      const value = normalizeTargetValue(
        targetId,
        base + offset,
      );
      pushDistinct(
        points,
        automationPoint(
          "mix-auto-gain-" + voice + "-" + index,
          section.startTick,
          value,
        ),
      );
      pushDistinct(
        points,
        automationPoint(
          "mix-auto-gain-" + voice + "-" + index + "-end",
          Math.max(
            section.startTick,
            section.startTick + section.lengthTicks - 1,
          ),
          normalizeTargetValue(
            targetId,
            base +
              (section.energyEnd - 0.55) *
                (voice === "crash" ? 2.4 : 1.6),
          ),
        ),
      );
    });

    if (points.length > 0) {
      automation.push({
        id: "mix-automation-" + voice + "-gain",
        targetId,
        enabled: true,
        points,
      });
    }
  }

  for (const voice of spaceVoices) {
    const targetId = mixerTargetId(voice, "reverbSend");
    const base = state.channels[voice].reverbSend;
    const points: AutomationPoint[] = [];

    blueprint.sections.forEach((section, index) => {
      const energy =
        (section.energyStart + section.energyEnd) / 2;
      const spaceBoost =
        (0.55 - energy) *
        (voice === "crash" ? 0.32 : 0.2);
      pushDistinct(
        points,
        automationPoint(
          "mix-auto-space-" + voice + "-" + index,
          section.startTick,
          normalizeTargetValue(
            targetId,
            clamp01(base + spaceBoost),
          ),
        ),
      );
    });

    if (points.length > 0) {
      automation.push({
        id: "mix-automation-" + voice + "-space",
        targetId,
        enabled: true,
        points,
      });
    }
  }

  return automation;
}

function metrics(
  state: MixerState,
  automationLaneCount: number,
): MixArchitectMetrics {
  const channels = DRUM_PADS.map(
    (pad) => state.channels[pad.voice],
  );
  const average = (
    selector: (channel: MixerChannelState) => number,
  ) =>
    channels.reduce(
      (sum, channel) => sum + selector(channel),
      0,
    ) / Math.max(1, channels.length);

  const maximumBoost = Math.max(
    0,
    ...channels.map(
      (channel) =>
        channel.gainDb +
        Math.max(0, channel.lowDb) * 0.2 +
        Math.max(0, channel.midDb) * 0.22 +
        Math.max(0, channel.highDb) * 0.18,
    ),
  );

  return {
    averageGainDb: average((channel) => channel.gainDb),
    stereoSpread: average((channel) => Math.abs(channel.pan)),
    averageCompression: average((channel) => channel.compression),
    averageSaturation: average((channel) => channel.saturation),
    averageReverbSend: average((channel) => channel.reverbSend),
    estimatedHeadroomDb: Math.max(
      0.5,
      6 - maximumBoost * 0.55 - Math.max(0, state.masterGainDb),
    ),
    automationLaneCount,
  };
}

export function generateMixPlan(
  request: MixArchitectRequest,
): MixArchitectPlan {
  const intensity = clamp01(request.intensity);
  const effectiveSeed = deriveSeed(
    request.seed,
    [
      MIX_ARCHITECT_ID,
      "v" + MIX_ARCHITECT_VERSION,
      request.direction,
      request.pattern.id,
    ].join(":"),
  );
  const state = cloneMixerState(request.current);

  for (const pad of DRUM_PADS) {
    const random = new SeededRandom(
      deriveSeed(effectiveSeed, "channel:" + pad.voice),
    );
    const target = targetForVoice(
      request,
      pad.voice,
      random,
    );
    state.channels[pad.voice] = blendChannel(
      request.current.channels[pad.voice],
      target,
      intensity,
    );
  }

  state.masterGainDb = lerp(
    request.current.masterGainDb,
    request.direction === "punchy" ? -1.5 : -2,
    intensity,
  );

  const automationLanes = buildSectionAutomation(
    request,
    state,
  );
  const mixMetrics = metrics(
    state,
    automationLanes.length,
  );
  const warnings: string[] = [];

  if (mixMetrics.estimatedHeadroomDb < 1.25) {
    warnings.push(
      "Estimated headroom is low; reduce master or boosted channels before mastering.",
    );
  }
  if (mixMetrics.stereoSpread > 0.52) {
    warnings.push(
      "Stereo spread is high; verify mono compatibility before export.",
    );
  }

  const displaySeed = shortSeed(effectiveSeed);

  return {
    id:
      "mix-plan-" +
      request.direction +
      "-" +
      displaySeed,
    seed: effectiveSeed,
    displaySeed,
    direction: request.direction,
    intensity,
    state,
    automationLanes,
    metrics: mixMetrics,
    warnings,
  };
}
