import {
  audioTransport,
  TRANSPORT_SCHEDULER_CONFIG,
  type ScheduledTransportPulse,
} from "./AudioTransport";
import { drumEngine } from "./DrumEngine";
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
} from "../music/foundationPattern";
import {
  MELODIC_PRESETS,
  melodicFilterEnvelopeVelocityScale,
  melodicLayerCompensation,
  melodicPresetStereoWidth,
  melodicVelocityFilterMultiplier,
  melodicVelocityGain,
  type MelodicPreset,
} from "./melodicSoundModel";
import { sequencerStore } from "../sequencer/SequencerStore";
import { arrangementPlaybackStore } from "../arrange/ArrangementPlaybackStore";
import { songArchitectStore } from "../song/SongArchitectStore";
import { evolutionStore } from "../evolve/EvolutionStore";
import { creativePatternResolver } from "../playback/CreativePatternResolver";
import { freezeStore } from "../resample/FreezeStore";
import { performanceStore } from "../performance/PerformanceStore";
import { eventPassesProbability } from "../sequencer/playbackRules";
import { swingOffsetUsForStep } from "../groove/grooveEngine";
import {
  clampLaneMix,
  dbToLaneGain,
} from "../mix/laneMix";

interface ActiveMelodicVoice {
  epoch: number | null;
  startTime: number;
  endTime: number;
  oscillators: OscillatorNode[];
  gain: GainNode;
  liveKey?: string;
}

const MAX_ACTIVE_MELODIC_VOICES = 24;
const MAX_ACTIVE_MELODIC_OSCILLATORS = 144;

function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function clampVelocity(value: number): number {
  if (!Number.isFinite(value)) return 0.76;
  return Math.max(0.05, Math.min(1, value));
}

function clampMelodicFilterHz(
  context: BaseAudioContext,
  value: number,
): number {
  return Math.max(
    36,
    Math.min(context.sampleRate * 0.45, value),
  );
}

function melodicDriveCurve(amount: number): Float32Array<ArrayBuffer> {
  const safe = Math.max(0, Math.min(1, amount));
  const curve = new Float32Array(257);
  const strength = 1 + safe * 6;
  const normalizer = Math.tanh(strength);

  for (let index = 0; index < curve.length; index += 1) {
    const x = (index / (curve.length - 1)) * 2 - 1;
    curve[index] =
      safe <= 0.001
        ? x
        : Math.tanh(x * strength) / normalizer;
  }

  return curve;
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

  async noteOn(
    laneId: string,
    pitch: number,
    velocity = 0.76,
  ): Promise<void> {
    const context =
      await audioTransport.unlockAudio();
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

    const safePitch = Math.max(
      0,
      Math.min(127, Math.round(pitch)),
    );
    const liveKey =
      laneId + ":" + safePitch;
    this.noteOff(
      laneId,
      safePitch,
      true,
    );

    this.scheduleChord(
      context,
      lane,
      preset,
      [safePitch],
      context.currentTime + 0.004,
      60,
      velocity,
      null,
      liveKey,
    );
  }

  noteOff(
    laneId: string,
    pitch: number,
    immediate = false,
  ): void {
    const context =
      audioTransport.getAudioContext();
    if (!context) return;

    const liveKey =
      laneId +
      ":" +
      Math.max(
        0,
        Math.min(127, Math.round(pitch)),
      );
    const now = context.currentTime;

    for (const voice of this.activeVoices) {
      if (voice.liveKey !== liveKey) continue;

      try {
        voice.gain.gain.cancelScheduledValues(
          now,
        );
        voice.gain.gain.setTargetAtTime(
          0.0001,
          now,
          immediate ? 0.004 : 0.025,
        );
        for (const oscillator of voice.oscillators) {
          oscillator.stop(
            now + (immediate ? 0.02 : 0.09),
          );
        }
      } catch {
        // Voice may already have ended.
      }
      voice.endTime =
        now + (immediate ? 0.025 : 0.1);
    }
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

    const freeze =
      freezeStore.getSnapshot().active;
    const performanceActive =
      performanceStore.getSnapshot().active;
    if (
      freeze &&
      !arrangement.engaged &&
      !songResolved &&
      !evolutionResolved &&
      !performanceActive
    ) {
      return;
    }

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
    liveKey?: string,
  ): void {
    if (pitches.length === 0) return;

    this.prune(context.currentTime);
    const layersPerPitch =
      1 +
      (preset.secondaryWave ? 1 : 0) +
      (
        (preset.unisonGain ?? 0) > 0.001 &&
        (preset.unisonDetuneCents ?? 0) > 0.001
          ? 2
          : 0
      ) +
      (
        preset.subWave &&
        (preset.subGain ?? 0) > 0.001
          ? 1
          : 0
      );
    this.enforcePolyphony(
      context.currentTime,
      pitches.length * layersPerPitch,
    );

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
    const expressiveVelocity =
      melodicVelocityGain(
        preset,
        clampVelocity(velocity),
      );
    const laneMix = clampLaneMix(lane.mix);
    const peak =
      preset.gain *
      melodicLayerCompensation(preset) *
      expressiveVelocity *
      dbToLaneGain(laneMix.gainDb) /
      Math.max(1, Math.sqrt(pitches.length));

    const baseFilterHz = clampMelodicFilterHz(
      context,
      preset.filterHz *
        melodicVelocityFilterMultiplier(
          preset,
          velocity,
        ),
    );
    const filterEnvelopeOctaves =
      Math.max(
        0,
        Math.min(
          4,
          (preset.filterEnvelopeOctaves ?? 0) *
            melodicFilterEnvelopeVelocityScale(
              velocity,
            ),
        ),
      );
    const filterStartHz = clampMelodicFilterHz(
      context,
      baseFilterHz *
        Math.pow(2, filterEnvelopeOctaves),
    );

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(
      filterStartHz,
      start,
    );
    if (
      filterEnvelopeOctaves > 0.001 &&
      Math.abs(filterStartHz - baseFilterHz) > 1
    ) {
      filter.frequency.exponentialRampToValueAtTime(
        baseFilterHz,
        start +
          Math.min(
            Math.max(
              0.015,
              preset.filterDecaySeconds ?? 0.18,
            ),
            Math.max(0.02, duration * 0.8),
          ),
      );
    }
    filter.Q.setValueAtTime(
      Math.max(0.0001, preset.resonance),
      start,
    );
    pan.pan.setValueAtTime(
      laneMix.pan,
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

    const drive = Math.max(
      0,
      Math.min(1, preset.drive ?? 0),
    );
    if (drive > 0.001) {
      const shaper = context.createWaveShaper();
      const trim = context.createGain();
      shaper.curve = melodicDriveCurve(drive);
      shaper.oversample = "2x";
      trim.gain.value = 1 / (1 + drive * 0.7);
      filter.connect(shaper);
      shaper.connect(trim);
      trim.connect(pan);
    } else {
      filter.connect(pan);
    }
    pan.connect(voiceGain);
    drumEngine.connectExternalAudio(
      voiceGain,
      context,
      {
        reverbSend: laneMix.reverbSend,
      },
    );

    const oscillators: OscillatorNode[] = [];
    const unisonDetune = Math.max(
      0,
      preset.unisonDetuneCents ?? 0,
    );
    const unisonGain = Math.max(
      0,
      Math.min(0.5, preset.unisonGain ?? 0),
    );
    const secondaryGainValue = Math.max(
      0,
      Math.min(
        0.65,
        preset.secondaryGain ?? 0.32,
      ),
    );
    const subGainValue = Math.max(
      0,
      Math.min(0.5, preset.subGain ?? 0),
    );
    const subOctave =
      preset.subOctave === 2 ? 2 : 1;
    const stereoWidth =
      melodicPresetStereoWidth(preset);

    const startOscillator = (
      wave: OscillatorType,
      frequency: number,
      detune: number,
      gainValue = 1,
      panOffset = 0,
    ) => {
      const oscillator = context.createOscillator();
      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(
        Math.max(12, frequency),
        start,
      );
      oscillator.detune.setValueAtTime(
        detune,
        start,
      );

      let output: AudioNode = oscillator;
      if (gainValue < 0.999) {
        const layerGain = context.createGain();
        layerGain.gain.value = Math.max(
          0,
          Math.min(1, gainValue),
        );
        output.connect(layerGain);
        output = layerGain;
      }

      const safePan = Math.max(
        -0.82,
        Math.min(0.82, panOffset),
      );
      if (Math.abs(safePan) > 0.001) {
        const layerPan =
          context.createStereoPanner();
        layerPan.pan.setValueAtTime(
          safePan,
          start,
        );
        output.connect(layerPan);
        output = layerPan;
      }

      output.connect(filter);
      oscillator.start(start);
      oscillator.stop(
        start + duration + 0.02,
      );
      oscillators.push(oscillator);
    };

    pitches.forEach((pitch, pitchIndex) => {
      const baseFrequency = midiToFrequency(pitch);
      const chordDetune =
        (pitchIndex - (pitches.length - 1) / 2) *
        1.8;
      const chordSpread =
        pitches.length > 1
          ? (
              pitchIndex /
                Math.max(1, pitches.length - 1) *
                2 -
              1
            ) *
            stereoWidth *
            0.45
          : 0;

      startOscillator(
        preset.wave,
        baseFrequency,
        chordDetune,
        1,
        chordSpread,
      );

      if (
        unisonGain > 0.001 &&
        unisonDetune > 0.001
      ) {
        const sideGain =
          unisonGain * 0.64;
        startOscillator(
          preset.wave,
          baseFrequency,
          chordDetune - unisonDetune,
          sideGain,
          chordSpread - stereoWidth * 0.5,
        );
        startOscillator(
          preset.wave,
          baseFrequency,
          chordDetune + unisonDetune,
          sideGain,
          chordSpread + stereoWidth * 0.5,
        );
      }

      if (
        preset.secondaryWave &&
        secondaryGainValue > 0.001
      ) {
        const secondaryDetune =
          preset.detuneCents ?? 0;
        startOscillator(
          preset.secondaryWave,
          baseFrequency,
          chordDetune + secondaryDetune,
          secondaryGainValue,
          chordSpread +
            Math.sign(secondaryDetune || 1) *
              stereoWidth *
              0.3,
        );
      }

      if (
        preset.subWave &&
        subGainValue > 0.001
      ) {
        startOscillator(
          preset.subWave,
          baseFrequency / Math.pow(2, subOctave),
          chordDetune * 0.5,
          subGainValue,
          0,
        );
      }
    });

    this.activeVoices.push({
      epoch,
      startTime: start,
      endTime: start + duration + 0.03,
      oscillators,
      gain: voiceGain,
      liveKey,
    });
  }

  private enforcePolyphony(
    now: number,
    incomingOscillators: number,
  ): void {
    const activeOscillators = () =>
      this.activeVoices.reduce(
        (sum, voice) =>
          sum + voice.oscillators.length,
        0,
      );

    while (
      this.activeVoices.length >=
        MAX_ACTIVE_MELODIC_VOICES ||
      activeOscillators() +
        incomingOscillators >
        MAX_ACTIVE_MELODIC_OSCILLATORS
    ) {
      const oldestIndex =
        this.activeVoices.reduce(
          (best, voice, index, voices) =>
            best < 0 ||
            voice.startTime <
              (voices[best]?.startTime ??
                Number.POSITIVE_INFINITY)
              ? index
              : best,
          -1,
        );
      if (oldestIndex < 0) break;

      const [voice] =
        this.activeVoices.splice(
          oldestIndex,
          1,
        );
      if (!voice) break;

      try {
        voice.gain.gain.cancelScheduledValues(
          now,
        );
        voice.gain.gain.setTargetAtTime(
          0.0001,
          now,
          0.004,
        );
        for (const oscillator of voice.oscillators) {
          oscillator.stop(now + 0.025);
        }
      } catch {
        // Already-ended voices are safe to discard.
      }
    }
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
