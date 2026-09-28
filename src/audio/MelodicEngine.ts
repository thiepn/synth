import {
  audioTransport,
  TRANSPORT_SCHEDULER_CONFIG,
  type ScheduledTransportPulse,
} from "./AudioTransport";
import type {
  Pattern,
  PatternLane,
  StepEvent,
} from "../domain/contracts";
import {
  PPQ,
} from "../domain/contracts";
import {
  FOUNDATION_STEP_TICKS,
  MELODIC_LANES,
  melodicLaneDefinitionById,
  type MelodicTrackId,
} from "../music/foundationPattern";
import { sequencerStore } from "../sequencer/SequencerStore";
import { arrangementPlaybackStore } from "../arrange/ArrangementPlaybackStore";
import { songArchitectStore } from "../song/SongArchitectStore";
import { evolutionStore } from "../evolve/EvolutionStore";
import { creativePatternResolver } from "../playback/CreativePatternResolver";
import { eventPassesProbability } from "../sequencer/playbackRules";
import { swingOffsetUsForStep } from "../groove/grooveEngine";

export interface MelodicPreset {
  id: string;
  label: string;
  wave: OscillatorType;
  secondaryWave?: OscillatorType;
  detuneCents?: number;
  attackSeconds: number;
  releaseSeconds: number;
  filterHz: number;
  resonance: number;
  gain: number;
}

export const MELODIC_PRESETS: Readonly<
  Record<MelodicTrackId, readonly MelodicPreset[]>
> = Object.freeze({
  bass: [
    {
      id: "sub",
      label: "Sub",
      wave: "sine",
      secondaryWave: "triangle",
      detuneCents: 0,
      attackSeconds: 0.008,
      releaseSeconds: 0.08,
      filterHz: 520,
      resonance: 0.7,
      gain: 0.72,
    },
    {
      id: "pluck",
      label: "Pluck",
      wave: "sawtooth",
      secondaryWave: "square",
      detuneCents: -5,
      attackSeconds: 0.004,
      releaseSeconds: 0.045,
      filterHz: 980,
      resonance: 1.2,
      gain: 0.48,
    },
    {
      id: "round",
      label: "Round",
      wave: "triangle",
      secondaryWave: "sine",
      detuneCents: 4,
      attackSeconds: 0.012,
      releaseSeconds: 0.12,
      filterHz: 760,
      resonance: 0.6,
      gain: 0.6,
    },
  ],
  chords: [
    {
      id: "warm",
      label: "Warm",
      wave: "sawtooth",
      secondaryWave: "triangle",
      detuneCents: 7,
      attackSeconds: 0.028,
      releaseSeconds: 0.2,
      filterHz: 1900,
      resonance: 0.55,
      gain: 0.24,
    },
    {
      id: "glass",
      label: "Glass",
      wave: "sine",
      secondaryWave: "triangle",
      detuneCents: 12,
      attackSeconds: 0.012,
      releaseSeconds: 0.3,
      filterHz: 4200,
      resonance: 1.15,
      gain: 0.28,
    },
    {
      id: "organ",
      label: "Organ",
      wave: "square",
      secondaryWave: "sine",
      detuneCents: 0,
      attackSeconds: 0.01,
      releaseSeconds: 0.09,
      filterHz: 2600,
      resonance: 0.4,
      gain: 0.2,
    },
  ],
  lead: [
    {
      id: "soft",
      label: "Soft",
      wave: "triangle",
      secondaryWave: "sine",
      detuneCents: 5,
      attackSeconds: 0.018,
      releaseSeconds: 0.14,
      filterHz: 3600,
      resonance: 0.65,
      gain: 0.42,
    },
    {
      id: "bright",
      label: "Bright",
      wave: "sawtooth",
      secondaryWave: "triangle",
      detuneCents: 9,
      attackSeconds: 0.006,
      releaseSeconds: 0.11,
      filterHz: 6900,
      resonance: 0.9,
      gain: 0.3,
    },
    {
      id: "square",
      label: "Square",
      wave: "square",
      secondaryWave: "sine",
      detuneCents: -4,
      attackSeconds: 0.004,
      releaseSeconds: 0.08,
      filterHz: 4100,
      resonance: 0.7,
      gain: 0.28,
    },
  ],
});

interface ActiveMelodicVoice {
  epoch: number | null;
  endTime: number;
  oscillators: OscillatorNode[];
  gain: GainNode;
}

function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function clampVelocity(value: number): number {
  if (!Number.isFinite(value)) return 0.76;
  return Math.max(0.05, Math.min(1, value));
}

function presetForLane(
  lane: PatternLane,
): MelodicPreset | undefined {
  const definition = melodicLaneDefinitionById(lane.id);
  if (!definition) return undefined;
  const presets = MELODIC_PRESETS[definition.track];
  return (
    presets.find(
      (preset) =>
        preset.id === lane.instrumentPresetId,
    ) ??
    presets.find(
      (preset) =>
        preset.id === definition.defaultPresetId,
    ) ??
    presets[0]
  );
}

function pitchesForEvent(
  event: StepEvent,
  fallback: number,
): number[] {
  const pitches =
    event.pitchesMidi && event.pitchesMidi.length > 0
      ? event.pitchesMidi
      : [event.pitchMidi ?? fallback];

  return [...new Set(
    pitches
      .filter(Number.isFinite)
      .map((pitch) =>
        Math.max(0, Math.min(127, Math.round(pitch))),
      ),
  )].slice(0, 6);
}

export class MelodicEngine {
  private activeVoices: ActiveMelodicVoice[] = [];
  private currentEpoch = -1;

  constructor() {
    audioTransport.subscribeScheduledPulses(
      (pulse) => this.handlePulse(pulse),
    );

    audioTransport.subscribe(() => {
      const transport = audioTransport.getSnapshot();
      if (
        transport.status === "idle" ||
        transport.status === "paused"
      ) {
        this.stopAll();
      }
    });
  }

  async triggerNow(
    laneId: string,
    pitches: readonly number[],
    durationSeconds = 0.35,
    velocity = 0.76,
  ): Promise<void> {
    const context = await audioTransport.unlockAudio();
    const lane = sequencerStore
      .getSnapshot()
      .pattern.lanes.find(
        (entry) => entry.id === laneId,
      );
    const definition =
      melodicLaneDefinitionById(laneId);
    if (!lane || !definition) return;

    const preset = presetForLane(lane);
    if (!preset) return;

    this.scheduleChord(
      context,
      lane,
      preset,
      pitches.length > 0
        ? [...pitches]
        : [definition.defaultPitchMidi],
      context.currentTime + 0.006,
      Math.max(0.04, durationSeconds),
      velocity,
      null,
    );
  }

  private handlePulse(
    pulse: ScheduledTransportPulse,
  ): void {
    const context = audioTransport.getAudioContext();
    if (!context || context.state !== "running") return;

    this.cancelObsoleteEpoch(
      pulse.epoch,
      context.currentTime,
    );
    this.currentEpoch = pulse.epoch;

    const transport = audioTransport.getSnapshot();
    const arrangement =
      arrangementPlaybackStore.getSnapshot();
    const arrangementResolved =
      arrangement.engaged
        ? arrangementPlaybackStore.resolveTransportTick(
            pulse.absoluteTick,
          )
        : null;
    const songResolved =
      !arrangement.engaged
        ? songArchitectStore.resolveAtTick(
            pulse.absoluteTick,
          )
        : null;
    const evolutionResolved =
      !arrangement.engaged && !songResolved
        ? evolutionStore.resolveAtTick(
            pulse.absoluteTick,
          )
        : null;

    let pattern: Pattern;
    let localTick: number;
    let probabilityCycleOffset = 0;
    let energy = 1;

    if (arrangement.engaged) {
      if (!arrangementResolved) return;
      pattern =
        creativePatternResolver.resolveArrangementPattern(
          arrangementResolved.pattern,
        );
      localTick = arrangementResolved.localTick;
      probabilityCycleOffset =
        arrangementResolved.occurrenceIndex * 1024;
      energy = arrangementResolved.energy;
    } else if (songResolved) {
      pattern = songResolved.pattern;
      localTick = songResolved.localTick;
      probabilityCycleOffset =
        songResolved.occurrenceIndex * 1024;
      energy = songResolved.energy;
    } else if (evolutionResolved) {
      pattern = evolutionResolved.pattern;
      localTick = evolutionResolved.localTick;
      probabilityCycleOffset =
        evolutionResolved.segment.index * 1024;
    } else {
      pattern =
        creativePatternResolver.resolveSequencerPattern(
          sequencerStore.getSnapshot().pattern,
        );
      localTick = pulse.absoluteTick;
    }

    const patternSteps = Math.max(
      1,
      Math.round(
        pattern.lengthTicks / FOUNDATION_STEP_TICKS,
      ),
    );
    const absoluteStep = Math.floor(
      localTick /
        TRANSPORT_SCHEDULER_CONFIG.pulseTicks,
    );
    const soloActive = pattern.lanes.some(
      (lane) => lane.solo,
    );
    const swing = pattern.groove?.swing ?? 0;
    const swingOffsetUs = swingOffsetUsForStep(
      absoluteStep,
      transport.bpm,
      swing,
    );

    for (const definition of MELODIC_LANES) {
      const lane = pattern.lanes.find(
        (entry) => entry.id === definition.id,
      );
      if (!lane || lane.muted) continue;
      if (soloActive && !lane.solo) continue;

      const laneSteps = Math.max(
        1,
        Math.min(
          patternSteps,
          Math.round(
            (lane.loopLengthTicks ??
              pattern.lengthTicks) /
              FOUNDATION_STEP_TICKS,
          ),
        ),
      );
      const localStep =
        ((absoluteStep % laneSteps) + laneSteps) %
        laneSteps;
      const event = lane.events.find(
        (entry) =>
          entry.tick ===
          localStep * FOUNDATION_STEP_TICKS,
      );
      if (!event) continue;

      const laneCycle =
        probabilityCycleOffset +
        Math.floor(
          Math.max(0, absoluteStep) / laneSteps,
        );
      if (
        !eventPassesProbability(
          pattern.id,
          lane.id,
          event,
          laneCycle,
        )
      ) {
        continue;
      }

      const preset = presetForLane(lane);
      if (!preset) continue;

      const durationTicks = Math.max(
        FOUNDATION_STEP_TICKS,
        event.durationTicks ??
          FOUNDATION_STEP_TICKS,
      );
      const durationSeconds =
        durationTicks *
        (60 / Math.max(30, transport.bpm) / PPQ);
      const at =
        pulse.audioTime +
        (
          swingOffsetUs +
          event.timingOffsetUs
        ) /
          1_000_000;
      const velocity =
        clampVelocity(event.velocity) *
        (arrangement.engaged || songResolved
          ? 0.68 + energy * 0.32
          : 1);

      this.scheduleChord(
        context,
        lane,
        preset,
        pitchesForEvent(
          event,
          definition.defaultPitchMidi,
        ),
        at,
        durationSeconds,
        velocity,
        pulse.epoch,
      );
    }

    this.prune(context.currentTime);
  }

  private scheduleChord(
    context: AudioContext,
    lane: PatternLane,
    preset: MelodicPreset,
    pitches: readonly number[],
    at: number,
    durationSeconds: number,
    velocity: number,
    epoch: number | null,
  ): void {
    if (pitches.length === 0) return;

    const voiceGain = context.createGain();
    const filter = context.createBiquadFilter();
    const pan = context.createStereoPanner();
    const start = Math.max(
      context.currentTime,
      at,
    );
    const duration = Math.max(
      0.035,
      durationSeconds,
    );
    const attack = Math.min(
      duration * 0.35,
      Math.max(0.002, preset.attackSeconds),
    );
    const release = Math.min(
      Math.max(0.025, preset.releaseSeconds),
      Math.max(0.025, duration * 0.45),
    );
    const releaseStart = Math.max(
      start + attack,
      start + duration - release,
    );
    const peak =
      preset.gain *
      clampVelocity(velocity) /
      Math.max(1, Math.sqrt(pitches.length));

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(
      preset.filterHz,
      start,
    );
    filter.Q.setValueAtTime(
      preset.resonance,
      start,
    );
    pan.pan.setValueAtTime(
      lane.role === "chords"
        ? -0.08
        : lane.role === "lead"
          ? 0.08
          : 0,
      start,
    );

    voiceGain.gain.setValueAtTime(
      0.0001,
      start,
    );
    voiceGain.gain.linearRampToValueAtTime(
      peak,
      start + attack,
    );
    voiceGain.gain.setValueAtTime(
      peak,
      releaseStart,
    );
    voiceGain.gain.exponentialRampToValueAtTime(
      0.0001,
      start + duration,
    );

    filter.connect(pan);
    pan.connect(voiceGain);
    voiceGain.connect(context.destination);

    const oscillators: OscillatorNode[] = [];
    pitches.forEach((pitch, pitchIndex) => {
      const baseFrequency = midiToFrequency(pitch);
      const primary = context.createOscillator();
      primary.type = preset.wave;
      primary.frequency.setValueAtTime(
        baseFrequency,
        start,
      );
      primary.detune.setValueAtTime(
        (pitchIndex - (pitches.length - 1) / 2) *
          1.8,
        start,
      );
      primary.connect(filter);
      primary.start(start);
      primary.stop(
        start + duration + 0.02,
      );
      oscillators.push(primary);

      if (preset.secondaryWave) {
        const secondary =
          context.createOscillator();
        secondary.type = preset.secondaryWave;
        secondary.frequency.setValueAtTime(
          baseFrequency,
          start,
        );
        secondary.detune.setValueAtTime(
          preset.detuneCents ?? 0,
          start,
        );
        const secondaryGain =
          context.createGain();
        secondaryGain.gain.value = 0.32;
        secondary.connect(secondaryGain);
        secondaryGain.connect(filter);
        secondary.start(start);
        secondary.stop(
          start + duration + 0.02,
        );
        oscillators.push(secondary);
      }
    });

    this.activeVoices.push({
      epoch,
      endTime: start + duration + 0.03,
      oscillators,
      gain: voiceGain,
    });
  }

  private cancelObsoleteEpoch(
    epoch: number,
    now: number,
  ): void {
    if (
      this.currentEpoch < 0 ||
      this.currentEpoch === epoch
    ) {
      return;
    }

    for (const voice of this.activeVoices) {
      if (
        voice.epoch !== null &&
        voice.epoch !== epoch
      ) {
        try {
          voice.gain.gain.cancelScheduledValues(now);
          voice.gain.gain.setTargetAtTime(
            0.0001,
            now,
            0.008,
          );
        } catch {
          // Best-effort scheduler invalidation.
        }
      }
    }
  }

  private prune(now: number): void {
    this.activeVoices = this.activeVoices.filter(
      (voice) => voice.endTime > now - 0.05,
    );
  }

  private stopAll(): void {
    const context = audioTransport.getAudioContext();
    const now = context?.currentTime ?? 0;

    for (const voice of this.activeVoices) {
      try {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setTargetAtTime(
          0.0001,
          now,
          0.006,
        );
        for (const oscillator of voice.oscillators) {
          oscillator.stop(now + 0.025);
        }
      } catch {
        // Already-ended oscillators are harmless.
      }
    }

    this.activeVoices = [];
  }
}

export const melodicEngine = new MelodicEngine();
