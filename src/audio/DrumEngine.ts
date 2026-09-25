import {
  audioTransport,
  TRANSPORT_SCHEDULER_CONFIG,
  type ScheduledTransportPulse,
  type TransportSnapshot,
} from "./AudioTransport";
import {
  DRUM_SYNTH_ENGINE_VERSION,
  type DrumMaterialSpec,
  type Pattern,
  type SampleSoundSpec,
  type SoundSpec,
  type SynthSoundSpec,
} from "../domain/contracts";
import {
  DRUM_PADS,
  FOUNDATION_STEP_TICKS,
  SEQUENCER_LANES,
  laneDefinitionById,
  type DrumVoiceId,
} from "../music/foundationPattern";
import { sequencerStore } from "../sequencer/SequencerStore";
import { arrangementPlaybackStore } from "../arrange/ArrangementPlaybackStore";
import {
  getPatternHitsForAbsoluteStep,
  type PatternPlaybackHit,
} from "../sequencer/patternPlayback";
import { swingOffsetUsForStep } from "../groove/grooveEngine";
import {
  eventPassesProbability,
  normalizedFlamOffsetUs,
  normalizedRatchetCount,
} from "../sequencer/playbackRules";
import {
  DRUM_MATERIAL_PARAMS,
  drumSoundStore,
} from "./drumSoundModel";
import { sampleAssetStore } from "./SampleAssetStore";
import { performanceStore } from "../performance/PerformanceStore";
import {
  creativePatternResolver,
} from "../playback/CreativePatternResolver";
import { applyPerformanceToHits } from "../performance/performancePlayback";
import { modulationStore } from "../modulation/ModulationStore";
import {
  engineTargetId,
  voiceTargetId,
} from "../modulation/parameterRegistry";
import { evolutionStore } from "../evolve/EvolutionStore";
import { songArchitectStore } from "../song/SongArchitectStore";
import { mixerStore } from "../mix/MixerStore";
import { dbToMixerGain } from "../mix/mixerModel";
import { masteringStore } from "../master/MasteringStore";
import { freezeStore } from "../resample/FreezeStore";

export interface DrumMacros {
  punch: number;
  tone: number;
  decay: number;
  grit: number;
  space: number;
}

export interface DrumEngineSnapshot {
  status: "cold" | "ready" | "error";
  master: number;
  macros: DrumMacros;
  activeVoiceCount: number;
  lastVoice?: DrumVoiceId;
  triggerSerial: number;
  channelLevels: Record<DrumVoiceId, number>;
  masterLevel: number;
  lastError?: string;
}

interface TrackChannelGraph {
  input: GainNode;
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  saturation: WaveShaperNode;
  compressor: DynamicsCompressorNode;
  pan: StereoPannerNode;
  fader: GainNode;
  duck: GainNode;
  send: GainNode;
  meter: AnalyserNode;
  meterBuffer: Float32Array<ArrayBuffer>;
  lastSaturation: number;
}

interface MasterGraph {
  context: AudioContext;
  input: GainNode;
  channels: Map<DrumVoiceId, TrackChannelGraph>;
  drive: WaveShaperNode;
  compressor: DynamicsCompressorNode;
  convolver: ConvolverNode;
  wet: GainNode;
  performanceFilter: BiquadFilterNode;
  master: GainNode;
  masterInputTrim: GainNode;
  masterLow: BiquadFilterNode;
  masterHigh: BiquadFilterNode;
  masterGlue: DynamicsCompressorNode;
  widthSplitter: ChannelSplitterNode;
  widthLeftDirect: GainNode;
  widthRightToLeft: GainNode;
  widthRightDirect: GainNode;
  widthLeftToRight: GainNode;
  widthMerger: ChannelMergerNode;
  masterOutput: GainNode;
  limiter: DynamicsCompressorNode;
  masterMeter: AnalyserNode;
  masterMeterBuffer: Float32Array<ArrayBuffer>;
}

interface ActiveFreezeClip {
  source: AudioBufferSourceNode;
  endTime: number;
  epoch: number;
}

interface ActiveVoice {
  id: number;
  voice: DrumVoiceId;
  startTime: number;
  endTime: number;
  epoch: number | null;
  sources: AudioScheduledSourceNode[];
  killGain: GainNode;
}

type StoreListener = () => void;

const MAX_ACTIVE_VOICES = 64;
const DIRECT_TRIGGER_OFFSET_SECONDS = 0.006;
const MIN_GAIN = 0.0001;

const DEFAULT_MACROS: DrumMacros = {
  punch: 0.7,
  tone: 0.58,
  decay: 0.52,
  grit: 0.18,
  space: 0.13,
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function velocityGain(velocity: number): number {
  const safe = clamp01(velocity);
  return 0.22 + safe * 0.78;
}

function dbToGain(db: number): number {
  if (!Number.isFinite(db)) return 1;
  return Math.pow(10, db / 20);
}

function createDriveCurve(amount: number): Float32Array<ArrayBuffer> {
  const size = 1024;
  const curve = new Float32Array(size);
  const normalized = clamp01(amount);

  for (let index = 0; index < size; index += 1) {
    const x = (index * 2) / (size - 1) - 1;

    if (normalized <= 0.001) {
      curve[index] = x;
      continue;
    }

    const drive = 1 + normalized * 28;
    curve[index] = Math.tanh(x * drive) / Math.tanh(drive);
  }

  return curve;
}

function xorshift32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 4294967295) * 2 - 1;
  };
}

export class DrumEngine {
  private listeners = new Set<StoreListener>();
  private graph: MasterGraph | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private activeVoices: ActiveVoice[] = [];
  private activeFreezeClips: ActiveFreezeClip[] = [];
  private auditionVoiceIds = new Set<number>();
  private sequencerEditTimer: number | null = null;
  private soundEditTimer: number | null = null;
  private performanceEditTimer: number | null = null;
  private repeatSourceHits: PatternPlaybackHit[] = [];
  private modulationTick = 0;
  private nextVoiceId = 1;
  private currentTransportEpoch = -1;

  private status: DrumEngineSnapshot["status"] = "cold";
  private master = 0.78;
  private macros: DrumMacros = { ...DEFAULT_MACROS };
  private lastVoice: DrumVoiceId | undefined;
  private triggerSerial = 0;
  private lastError: string | undefined;

  private snapshot: DrumEngineSnapshot = this.buildSnapshot();

  constructor() {
    audioTransport.subscribeScheduledPulses((pulse) => {
      this.handleTransportPulse(pulse);
    });

    audioTransport.subscribe(() => {
      this.handleTransportState(audioTransport.getSnapshot());
    });

    sequencerStore.subscribe(() => {
      if (this.sequencerEditTimer !== null) return;

      this.sequencerEditTimer = globalThis.setTimeout(() => {
        this.sequencerEditTimer = null;
        audioTransport.invalidateScheduledEvents();
      }, 16);
    });

    drumSoundStore.subscribe(() => {
      if (this.soundEditTimer !== null) return;

      this.soundEditTimer = globalThis.setTimeout(() => {
        this.soundEditTimer = null;
        audioTransport.invalidateScheduledEvents();
      }, 32);
    });

    sampleAssetStore.subscribe(() => {
      if (this.soundEditTimer !== null) return;

      this.soundEditTimer = globalThis.setTimeout(() => {
        this.soundEditTimer = null;
        audioTransport.invalidateScheduledEvents();
      }, 32);
    });

    performanceStore.subscribe(() => {
      this.applyGraphMacros();
      if (this.performanceEditTimer !== null) return;

      this.performanceEditTimer = globalThis.setTimeout(() => {
        this.performanceEditTimer = null;
        audioTransport.invalidateScheduledEvents();
      }, 16);
    });

    modulationStore.subscribe(() => {
      this.applyGraphMacros();
      if (this.performanceEditTimer !== null) return;

      this.performanceEditTimer = globalThis.setTimeout(() => {
        this.performanceEditTimer = null;
        audioTransport.invalidateScheduledEvents();
      }, 16);
    });

    evolutionStore.subscribe(() => {
      if (this.sequencerEditTimer !== null) return;

      this.sequencerEditTimer = globalThis.setTimeout(() => {
        this.sequencerEditTimer = null;
        audioTransport.invalidateScheduledEvents();
      }, 16);
    });

    songArchitectStore.subscribe(() => {
      if (this.sequencerEditTimer !== null) return;

      this.sequencerEditTimer = globalThis.setTimeout(() => {
        this.sequencerEditTimer = null;
        audioTransport.invalidateScheduledEvents();
      }, 16);
    });

    mixerStore.subscribe(() => {
      this.applyGraphMacros();
      if (this.performanceEditTimer !== null) return;

      this.performanceEditTimer = globalThis.setTimeout(() => {
        this.performanceEditTimer = null;
        audioTransport.invalidateScheduledEvents();
      }, 16);
    });

    masteringStore.subscribe(() => {
      this.applyGraphMacros();
    });

    freezeStore.subscribe(() => {
      audioTransport.invalidateScheduledEvents();
    });
  }

  readonly subscribe = (listener: StoreListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): DrumEngineSnapshot => this.snapshot;

  restoreProjectState(state: {
    master: number;
    macros: DrumMacros;
  }): void {
    this.master = clamp01(state.master);
    this.macros = {
      punch: clamp01(state.macros.punch),
      tone: clamp01(state.macros.tone),
      decay: clamp01(state.macros.decay),
      grit: clamp01(state.macros.grit),
      space: clamp01(state.macros.space),
    };
    this.lastError = undefined;
    this.applyGraphMacros();
    this.publish();
  }

  async triggerNow(
    voice: DrumVoiceId,
    velocity = 0.82,
  ): Promise<void> {
    try {
      const context = await audioTransport.unlockAudio();
      this.ensureGraph(context);
      const lane = SEQUENCER_LANES.find(
        (entry) => entry.voice === voice,
      );
      const kitSlotId = lane?.kitSlotId ?? "slot-" + voice;
      const playback = drumSoundStore.resolvePlaybackSound(
        kitSlotId,
        voice,
      );
      await this.prepareSoundSpec(context, playback.spec);
      this.scheduleConfiguredVoice(
        kitSlotId,
        voice,
        context.currentTime + DIRECT_TRIGGER_OFFSET_SECONDS,
        velocity,
        null,
      );
      this.lastVoice = voice;
      this.triggerSerial += 1;
      this.status = "ready";
      this.lastError = undefined;
      this.publish();
    } catch (error) {
      this.status = "error";
      this.lastError = this.errorMessage(error);
      this.publish();
    }
  }

  cancelAudition(): void {
    if (this.auditionVoiceIds.size === 0) return;

    const context = audioTransport.getAudioContext();
    if (!context) {
      this.auditionVoiceIds.clear();
      return;
    }

    this.cancelAuditionVoices(context.currentTime);
    this.publish();
  }

  async auditionPattern(pattern: Pattern, bpm: number): Promise<void> {
    try {
      const context = await audioTransport.unlockAudio();
      this.ensureGraph(context);
      this.cancelAuditionVoices(context.currentTime);

      const safeBpm = Math.min(300, Math.max(30, bpm));
      const stepSeconds = 60 / safeBpm / 4;
      const startTime = context.currentTime + 0.035;
      let lastVoice: DrumVoiceId | undefined;

      const patternSteps = Math.max(
        1,
        Math.round(pattern.lengthTicks / FOUNDATION_STEP_TICKS),
      );
      const soloActive = pattern.lanes.some((lane) => lane.solo);

      for (let absoluteStep = 0; absoluteStep < patternSteps; absoluteStep += 1) {
        for (const lane of pattern.lanes) {
          const definition = laneDefinitionById(lane.id);
          if (!definition || lane.muted) continue;
          if (soloActive && !lane.solo) continue;

          const laneSteps = Math.max(
            1,
            Math.min(
              patternSteps,
              Math.round(
                (lane.loopLengthTicks ?? pattern.lengthTicks) /
                  FOUNDATION_STEP_TICKS,
              ),
            ),
          );
          const localStep = absoluteStep % laneSteps;
          const laneCycle = Math.floor(absoluteStep / laneSteps);
          const event = lane.events.find(
            (entry) =>
              Math.round(entry.tick / FOUNDATION_STEP_TICKS) === localStep,
          );
          if (!event) continue;
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

          const swingOffsetUs = swingOffsetUsForStep(
            absoluteStep,
            safeBpm,
            pattern.groove?.swing ?? 0,
          );
          const at =
            startTime +
            absoluteStep * stepSeconds +
            (swingOffsetUs + event.timingOffsetUs) / 1_000_000;
          const auditionVoice = drumSoundStore.resolveVoiceForSlot(
            lane.kitSlotId,
            definition.voice,
          );
          const ratchets = normalizedRatchetCount(event);
          const flamOffsetUs = normalizedFlamOffsetUs(event);
          const ratchetSpacing =
            ratchets > 1 ? (stepSeconds * 0.82) / ratchets : 0;

          for (let index = 0; index < ratchets; index += 1) {
            const firstVoiceId = this.nextVoiceId;
            const ratchetVelocity =
              event.velocity * Math.max(0.58, 1 - index * 0.09);
            const ratchetTime = at + index * ratchetSpacing;

            this.scheduleConfiguredVoice(
              lane.kitSlotId,
              definition.voice,
              ratchetTime,
              ratchetVelocity,
              null,
            );

            if (index === 0 && flamOffsetUs > 0) {
              this.scheduleConfiguredVoice(
                lane.kitSlotId,
                definition.voice,
                ratchetTime + flamOffsetUs / 1_000_000,
                ratchetVelocity * 0.72,
                null,
              );
            }

            for (
              let id = firstVoiceId;
              id < this.nextVoiceId;
              id += 1
            ) {
              this.auditionVoiceIds.add(id);
            }
          }

          lastVoice = auditionVoice;
        }
      }

      if (lastVoice) {
        this.lastVoice = lastVoice;
        this.triggerSerial += 1;
      }

      this.status = "ready";
      this.lastError = undefined;
      this.publish();
    } catch (error) {
      this.status = "error";
      this.lastError = this.errorMessage(error);
      this.publish();
    }
  }

  setMaster(value: number): void {
    const next = clamp01(value);
    if (Math.abs(this.master - next) < 0.0001) return;
    this.master = next;
    freezeStore.invalidate("Engine master changed.");
    this.applyGraphMacros();
    this.publish();
  }

  setMacro(name: keyof DrumMacros, value: number): void {
    const next = clamp01(value);
    if (Math.abs(this.macros[name] - next) < 0.0001) return;
    this.macros = {
      ...this.macros,
      [name]: next,
    };
    freezeStore.invalidate("Engine macro changed.");
    this.applyGraphMacros();
    this.publish();
  }

  private handleTransportPulse(pulse: ScheduledTransportPulse): void {
    const context = audioTransport.getAudioContext();
    if (!context || context.state !== "running") return;

    try {
      this.ensureGraph(context);
      this.cancelObsoleteEpochVoices(pulse.epoch, context.currentTime);
      this.currentTransportEpoch = pulse.epoch;

      const transport = audioTransport.getSnapshot();
      this.modulationTick = Math.max(0, pulse.absoluteTick);
      this.applyGraphMacros();
      const arrangementPlayback =
        arrangementPlaybackStore.getSnapshot();
      const arrangementResolved =
        arrangementPlayback.engaged
          ? arrangementPlaybackStore.resolveTransportTick(
              pulse.absoluteTick,
            )
          : null;
      const songResolved =
        !arrangementPlayback.engaged
          ? songArchitectStore.resolveAtTick(pulse.absoluteTick)
          : null;
      const evolutionResolved =
        !arrangementPlayback.engaged && !songResolved
          ? evolutionStore.resolveAtTick(pulse.absoluteTick)
          : null;

      const freeze = freezeStore.getSnapshot().active;
      const performanceActive = performanceStore.getSnapshot().active;
      if (
        freeze &&
        !arrangementPlayback.engaged &&
        !songResolved &&
        !evolutionResolved &&
        !performanceActive
      ) {
        const pattern = sequencerStore.getSnapshot().pattern;
        const meterMatches =
          freeze.meter.numerator === transport.meter.numerator &&
          freeze.meter.denominator === transport.meter.denominator;
        const valid =
          freeze.patternId === pattern.id &&
          freeze.lengthTicks === pattern.lengthTicks &&
          Math.abs(freeze.bpm - transport.bpm) < 0.0001 &&
          meterMatches;

        if (!valid) {
          freezeStore.invalidate(
            "Pattern, tempo, or meter changed after Freeze.",
          );
        } else {
          if (
            freeze.lengthTicks > 0 &&
            pulse.absoluteTick % freeze.lengthTicks === 0
          ) {
            this.scheduleFrozenPattern(
              pulse.audioTime,
              pulse.epoch,
            );
          }
          return;
        }
      }

      let stepIndex: number;
      let hits: PatternPlaybackHit[];
      let swing: number;
      let activePattern: Pattern;
      let arrangementEnergy = 1;

      if (arrangementPlayback.engaged) {
        if (!arrangementResolved) return;

        stepIndex = Math.floor(
          arrangementResolved.localTick /
            TRANSPORT_SCHEDULER_CONFIG.pulseTicks,
        );
        const arrangementPattern =
          creativePatternResolver.resolveArrangementPattern(
            arrangementResolved.pattern,
          );
        activePattern = arrangementPattern;
        hits = getPatternHitsForAbsoluteStep(
          arrangementPattern,
          stepIndex,
          arrangementResolved.occurrenceIndex * 1024,
        );
        swing = arrangementPattern.groove?.swing ?? 0;
        arrangementEnergy = arrangementResolved.energy;
      } else if (songResolved) {
        activePattern = songResolved.pattern;
        stepIndex = Math.floor(
          songResolved.localTick /
            TRANSPORT_SCHEDULER_CONFIG.pulseTicks,
        );
        hits = getPatternHitsForAbsoluteStep(
          activePattern,
          stepIndex,
          songResolved.occurrenceIndex * 1024,
        );
        swing = activePattern.groove?.swing ?? 0;
        arrangementEnergy = songResolved.energy;
      } else if (evolutionResolved) {
        activePattern = evolutionResolved.pattern;
        stepIndex = Math.floor(
          evolutionResolved.localTick /
            TRANSPORT_SCHEDULER_CONFIG.pulseTicks,
        );
        hits = getPatternHitsForAbsoluteStep(
          activePattern,
          stepIndex,
          evolutionResolved.segment.index * 1024,
        );
        swing = activePattern.groove?.swing ?? 0;
      } else {
        stepIndex = Math.floor(
          pulse.absoluteTick / TRANSPORT_SCHEDULER_CONFIG.pulseTicks,
        );
        const sequencer = sequencerStore.getSnapshot();
        activePattern =
          creativePatternResolver.resolveSequencerPattern(
            sequencer.pattern,
          );
        hits = getPatternHitsForAbsoluteStep(
          activePattern,
          stepIndex,
        );
        swing = activePattern.groove?.swing ?? 0;
      }

      let performanceVelocityScale = 1;
      const performanceSnapshot = performanceStore.getSnapshot();
      if (performanceSnapshot.active) {
        const performanceState = performanceStore.resolveAtTick(
          pulse.absoluteTick,
        );

        if (
          performanceState.momentary.repeat ||
          performanceState.momentary.stutter
        ) {
          if (this.repeatSourceHits.length > 0) {
            hits = this.repeatSourceHits.map((hit) => ({ ...hit }));
          }
        } else if (hits.length > 0) {
          this.repeatSourceHits = hits.map((hit) => ({ ...hit }));
        }

        const performed = applyPerformanceToHits(
          hits,
          activePattern,
          stepIndex,
          pulse.absoluteTick,
          performanceState,
        );
        hits = performed.hits;
        performanceVelocityScale = performed.velocityScale;
      }

      const swingOffsetUs = swingOffsetUsForStep(
        stepIndex,
        transport.bpm,
        swing,
      );

      const stepSeconds = 60 / transport.bpm / 4;

      for (const hit of hits) {
        const resolvedVoice = drumSoundStore.resolveVoiceForSlot(
          hit.kitSlotId,
          hit.voice,
        );
        const baseTime =
          pulse.audioTime +
          (swingOffsetUs + hit.timingOffsetUs) / 1_000_000;
        const ratchets = Math.max(1, hit.ratchetCount);
        const ratchetSpacing =
          ratchets > 1 ? (stepSeconds * 0.82) / ratchets : 0;

        for (let index = 0; index < ratchets; index += 1) {
          const energyScale =
            arrangementPlayback.engaged || songResolved
              ? 0.68 + arrangementEnergy * 0.42
              : 1;
          const ratchetVelocity =
            Math.min(
              1,
              hit.velocity * energyScale * performanceVelocityScale,
            ) *
            Math.max(0.58, 1 - index * 0.09);
          const ratchetTime = baseTime + index * ratchetSpacing;

          if (hit.voice === "kick" && index === 0) {
            this.scheduleSidechainDuck(ratchetTime);
          }

          this.scheduleConfiguredVoice(
            hit.kitSlotId,
            hit.voice,
            ratchetTime,
            ratchetVelocity,
            pulse.epoch,
          );

          if (index === 0 && hit.flamOffsetUs > 0) {
            this.scheduleConfiguredVoice(
              hit.kitSlotId,
              hit.voice,
              ratchetTime + hit.flamOffsetUs / 1_000_000,
              ratchetVelocity * 0.72,
              pulse.epoch,
            );
          }
        }
      }

      if (hits.length > 0) {
        const lastHit = hits[hits.length - 1];
        this.lastVoice = drumSoundStore.resolveVoiceForSlot(
          lastHit.kitSlotId,
          lastHit.voice,
        );
        this.triggerSerial += 1;
      }

      this.status = "ready";
      this.lastError = undefined;
      this.publish();
    } catch (error) {
      this.status = "error";
      this.lastError = this.errorMessage(error);
      this.publish();
    }
  }

  private handleTransportState(snapshot: TransportSnapshot): void {
    const context = audioTransport.getAudioContext();
    if (!context) return;

    if (snapshot.schedulerEpoch !== this.currentTransportEpoch) {
      this.cancelObsoleteEpochVoices(
        snapshot.schedulerEpoch,
        context.currentTime,
      );
      this.cancelFreezeClips(context.currentTime);
      this.currentTransportEpoch = snapshot.schedulerEpoch;
    }

    if (snapshot.status === "running") {
      this.cancelAuditionVoices(context.currentTime);
    } else {
      this.cancelTransportVoices(context.currentTime, true);
      this.cancelFreezeClips(context.currentTime);
      this.repeatSourceHits = [];
    }
  }

  private scheduleFrozenPattern(
    audioTime: number,
    epoch: number,
  ): void {
    const graph = this.graph;
    const buffer = freezeStore.getBuffer();
    if (!graph || !buffer) return;

    const now = graph.context.currentTime;
    this.pruneFreezeClips(now);

    const at = Math.max(audioTime, now + 0.001);
    const source = graph.context.createBufferSource();
    source.buffer = buffer;
    source.connect(graph.masterInputTrim);
    source.start(at);
    source.stop(at + buffer.duration + 0.02);

    const clip: ActiveFreezeClip = {
      source,
      endTime: at + buffer.duration + 0.02,
      epoch,
    };
    source.onended = () => {
      this.activeFreezeClips = this.activeFreezeClips.filter(
        (entry) => entry !== clip,
      );
    };
    this.activeFreezeClips.push(clip);
  }

  private pruneFreezeClips(now: number): void {
    this.activeFreezeClips = this.activeFreezeClips.filter(
      (clip) => clip.endTime > now - 0.02,
    );
  }

  private cancelFreezeClips(now: number): void {
    for (const clip of this.activeFreezeClips) {
      try {
        clip.source.stop(now + 0.006);
      } catch {
        // Source may already have ended.
      }
    }
    this.activeFreezeClips = [];
  }

  private ensureGraph(context: AudioContext): MasterGraph {
    if (this.graph?.context === context) {
      return this.graph;
    }

    this.activeVoices = [];
    this.noiseBuffer = null;

    const input = context.createGain();
    const channels = new Map<DrumVoiceId, TrackChannelGraph>();
    const drive = context.createWaveShaper();
    const compressor = context.createDynamicsCompressor();
    const convolver = context.createConvolver();
    const wet = context.createGain();
    const performanceFilter = context.createBiquadFilter();
    const master = context.createGain();
    const masterInputTrim = context.createGain();
    const masterLow = context.createBiquadFilter();
    const masterHigh = context.createBiquadFilter();
    const masterGlue = context.createDynamicsCompressor();
    const widthSplitter = context.createChannelSplitter(2);
    const widthLeftDirect = context.createGain();
    const widthRightToLeft = context.createGain();
    const widthRightDirect = context.createGain();
    const widthLeftToRight = context.createGain();
    const widthMerger = context.createChannelMerger(2);
    const masterOutput = context.createGain();
    const limiter = context.createDynamicsCompressor();
    const masterMeter = context.createAnalyser();
    masterMeter.fftSize = 128;
    const masterMeterBuffer = new Float32Array(masterMeter.fftSize);

    drive.oversample = "2x";
    compressor.threshold.value = -10;
    compressor.knee.value = 14;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.12;

    limiter.threshold.value = -1.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.06;

    convolver.buffer = this.createImpulseResponse(context);
    performanceFilter.type = "lowpass";
    performanceFilter.frequency.value = 20_000;
    performanceFilter.Q.value = 0.5;
    master.gain.value = this.master * 0.92;

    masterInputTrim.gain.value = 1;
    masterLow.type = "lowshelf";
    masterLow.frequency.value = 120;
    masterLow.gain.value = 0;
    masterHigh.type = "highshelf";
    masterHigh.frequency.value = 8_000;
    masterHigh.gain.value = 0;

    masterGlue.threshold.value = 0;
    masterGlue.knee.value = 0;
    masterGlue.ratio.value = 1;
    masterGlue.attack.value = 0.02;
    masterGlue.release.value = 0.18;

    widthLeftDirect.gain.value = 1;
    widthRightToLeft.gain.value = 0;
    widthRightDirect.gain.value = 1;
    widthLeftToRight.gain.value = 0;
    masterOutput.gain.value = 1;

    input.connect(drive);
    drive.connect(compressor);

    for (const pad of DRUM_PADS) {
      const channelInput = context.createGain();
      const low = context.createBiquadFilter();
      const mid = context.createBiquadFilter();
      const high = context.createBiquadFilter();
      const saturation = context.createWaveShaper();
      const channelCompressor = context.createDynamicsCompressor();
      const pan = context.createStereoPanner();
      const fader = context.createGain();
      const duck = context.createGain();
      const send = context.createGain();
      const meter = context.createAnalyser();
      meter.fftSize = 128;
      const meterBuffer = new Float32Array(meter.fftSize);

      low.type = "lowshelf";
      low.frequency.value = 120;
      low.gain.value = 0;

      mid.type = "peaking";
      mid.frequency.value = 1_400;
      mid.Q.value = 0.7;
      mid.gain.value = 0;

      high.type = "highshelf";
      high.frequency.value = 6_500;
      high.gain.value = 0;

      saturation.oversample = "2x";
      saturation.curve = createDriveCurve(0);

      channelCompressor.threshold.value = 0;
      channelCompressor.knee.value = 0;
      channelCompressor.ratio.value = 1;
      channelCompressor.attack.value = 0.006;
      channelCompressor.release.value = 0.1;

      pan.pan.value = 0;
      fader.gain.value = 1;
      duck.gain.value = 1;
      send.gain.value = 1;

      channelInput.connect(low);
      low.connect(mid);
      mid.connect(high);
      high.connect(saturation);
      saturation.connect(channelCompressor);
      channelCompressor.connect(pan);
      pan.connect(fader);
      fader.connect(duck);
      duck.connect(meter);
      meter.connect(input);
      meter.connect(send);
      send.connect(convolver);

      channels.set(pad.voice, {
        input: channelInput,
        low,
        mid,
        high,
        saturation,
        compressor: channelCompressor,
        pan,
        fader,
        duck,
        send,
        meter,
        meterBuffer,
        lastSaturation: 0,
      });
    }

    convolver.connect(wet);
    wet.connect(compressor);

    compressor.connect(performanceFilter);
    performanceFilter.connect(master);
    master.connect(masterInputTrim);
    masterInputTrim.connect(masterLow);
    masterLow.connect(masterHigh);
    masterHigh.connect(masterGlue);
    masterGlue.connect(widthSplitter);

    widthSplitter.connect(widthLeftDirect, 0);
    widthLeftDirect.connect(widthMerger, 0, 0);
    widthSplitter.connect(widthRightToLeft, 1);
    widthRightToLeft.connect(widthMerger, 0, 0);

    widthSplitter.connect(widthRightDirect, 1);
    widthRightDirect.connect(widthMerger, 0, 1);
    widthSplitter.connect(widthLeftToRight, 0);
    widthLeftToRight.connect(widthMerger, 0, 1);

    widthMerger.connect(masterOutput);
    masterOutput.connect(limiter);
    limiter.connect(masterMeter);
    masterMeter.connect(context.destination);

    this.graph = {
      context,
      input,
      channels,
      drive,
      compressor,
      convolver,
      wet,
      performanceFilter,
      master,
      masterInputTrim,
      masterLow,
      masterHigh,
      masterGlue,
      widthSplitter,
      widthLeftDirect,
      widthRightToLeft,
      widthRightDirect,
      widthLeftToRight,
      widthMerger,
      masterOutput,
      limiter,
      masterMeter,
      masterMeterBuffer,
    };

    this.applyGraphMacros();
    this.status = "ready";
    this.publish();

    return this.graph;
  }

  private applyGraphMacros(): void {
    if (!this.graph) return;

    const now = this.graph.context.currentTime;
    const performance = performanceStore.getSnapshot();
    const live = performance.active ? performance.macros : null;
    const modulatedDrive = modulationStore.resolveTarget(
      engineTargetId("grit"),
      this.macros.grit,
      this.modulationTick,
    ).value;
    const modulatedSpace = modulationStore.resolveTarget(
      engineTargetId("space"),
      this.macros.space,
      this.modulationTick,
    ).value;
    const modulatedFilter = modulationStore.resolveTarget(
      engineTargetId("filter"),
      1,
      this.modulationTick,
    ).value;
    const modulatedMaster = modulationStore.resolveTarget(
      engineTargetId("master"),
      this.master,
      this.modulationTick,
    ).value;
    const mixerMasterGain = mixerStore.resolveMasterGainDb(
      this.modulationTick,
    );
    const drive = clamp01(
      modulatedDrive + (live?.drive ?? 0) * 0.68,
    );
    const space = clamp01(
      modulatedSpace + (live?.space ?? 0) * 0.58,
    );
    const filterAmount = clamp01(
      modulatedFilter * (live?.filter ?? 1),
    );
    const minFilterHz = 360;
    const maxFilterHz = 20_000;
    const filterHz =
      minFilterHz *
      Math.pow(maxFilterHz / minFilterHz, clamp01(filterAmount));

    this.graph.drive.curve = createDriveCurve(drive);
    this.graph.wet.gain.setTargetAtTime(
      space * 0.34,
      now,
      0.018,
    );
    this.graph.performanceFilter.frequency.setTargetAtTime(
      filterHz,
      now,
      0.018,
    );
    this.applyMixerGraph(now);
    this.graph.master.gain.setTargetAtTime(
      modulatedMaster *
        0.92 *
        dbToMixerGain(mixerMasterGain),
      now,
      0.012,
    );

    const mastering = masteringStore.resolveForPlayback();
    const masterState = mastering.state;
    const enabled = masterState.enabled;

    this.graph.masterInputTrim.gain.setTargetAtTime(
      enabled ? dbToGain(masterState.inputTrimDb) : 1,
      now,
      0.02,
    );
    this.graph.masterLow.gain.setTargetAtTime(
      enabled ? masterState.lowDb : 0,
      now,
      0.025,
    );
    this.graph.masterHigh.gain.setTargetAtTime(
      enabled ? masterState.highDb : 0,
      now,
      0.025,
    );

    const glue = enabled ? clamp01(masterState.glue) : 0;
    this.graph.masterGlue.threshold.setTargetAtTime(
      glue > 0 ? -4 - glue * 18 : 0,
      now,
      0.025,
    );
    this.graph.masterGlue.knee.setTargetAtTime(
      glue * 10,
      now,
      0.025,
    );
    this.graph.masterGlue.ratio.setTargetAtTime(
      1 + glue * 4.5,
      now,
      0.025,
    );
    this.graph.masterGlue.attack.setTargetAtTime(
      0.008 + (1 - glue) * 0.018,
      now,
      0.025,
    );
    this.graph.masterGlue.release.setTargetAtTime(
      0.12 + glue * 0.16,
      now,
      0.025,
    );

    const width = enabled ? masterState.width : 1;
    const direct = (1 + width) * 0.5;
    const cross = (1 - width) * 0.5;
    this.graph.widthLeftDirect.gain.setTargetAtTime(direct, now, 0.025);
    this.graph.widthRightDirect.gain.setTargetAtTime(direct, now, 0.025);
    this.graph.widthRightToLeft.gain.setTargetAtTime(cross, now, 0.025);
    this.graph.widthLeftToRight.gain.setTargetAtTime(cross, now, 0.025);

    this.graph.masterOutput.gain.setTargetAtTime(
      enabled
        ? dbToGain(
            masterState.outputGainDb +
              mastering.previewLevelMatchDb,
          )
        : 1,
      now,
      0.02,
    );
    this.graph.limiter.threshold.setTargetAtTime(
      enabled ? masterState.ceilingDb : -1.5,
      now,
      0.02,
    );
  }

  private channelInput(voice: DrumVoiceId): AudioNode {
    const graph = this.graph;
    if (!graph) {
      throw new Error("Drum graph is not initialized.");
    }

    return graph.channels.get(voice)?.input ?? graph.input;
  }

  private applyMixerGraph(now: number): void {
    const graph = this.graph;
    if (!graph) return;

    for (const pad of DRUM_PADS) {
      const channel = graph.channels.get(pad.voice);
      if (!channel) continue;

      const state = mixerStore.resolveChannel(
        pad.voice,
        this.modulationTick,
      );

      channel.low.gain.setTargetAtTime(
        state.lowDb,
        now,
        0.02,
      );
      channel.mid.gain.setTargetAtTime(
        state.midDb,
        now,
        0.02,
      );
      channel.high.gain.setTargetAtTime(
        state.highDb,
        now,
        0.02,
      );
      channel.pan.pan.setTargetAtTime(
        state.pan,
        now,
        0.018,
      );
      channel.fader.gain.setTargetAtTime(
        state.muted ? 0 : dbToMixerGain(state.gainDb),
        now,
        0.015,
      );
      channel.send.gain.setTargetAtTime(
        state.muted ? 0 : state.reverbSend,
        now,
        0.025,
      );

      const compression = clamp01(state.compression);
      channel.compressor.threshold.setTargetAtTime(
        -1 - compression * 31,
        now,
        0.025,
      );
      channel.compressor.knee.setTargetAtTime(
        compression * 12,
        now,
        0.025,
      );
      channel.compressor.ratio.setTargetAtTime(
        1 + compression * 8,
        now,
        0.025,
      );
      channel.compressor.attack.setTargetAtTime(
        0.002 + (1 - compression) * 0.01,
        now,
        0.025,
      );
      channel.compressor.release.setTargetAtTime(
        0.06 + compression * 0.16,
        now,
        0.025,
      );

      if (
        Math.abs(channel.lastSaturation - state.saturation) >
        0.002
      ) {
        channel.saturation.curve = createDriveCurve(
          state.saturation * 0.72,
        );
        channel.lastSaturation = state.saturation;
      }
    }
  }

  private scheduleSidechainDuck(at: number): void {
    const graph = this.graph;
    if (!graph) return;

    for (const pad of DRUM_PADS) {
      if (pad.voice === "kick") continue;
      const channel = graph.channels.get(pad.voice);
      if (!channel) continue;

      const amount = mixerStore.resolveChannel(
        pad.voice,
        this.modulationTick,
      ).sidechain;
      if (amount <= 0.001) continue;

      const minimum = Math.max(
        0.28,
        1 - amount * 0.7,
      );
      const release = 0.055 + amount * 0.16;

      channel.duck.gain.cancelScheduledValues(at);
      channel.duck.gain.setValueAtTime(1, at);
      channel.duck.gain.linearRampToValueAtTime(
        minimum,
        at + 0.004,
      );
      channel.duck.gain.exponentialRampToValueAtTime(
        1,
        at + release,
      );
    }
  }

  private createNoiseBuffer(context: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;

    const length = Math.max(1, Math.floor(context.sampleRate * 2));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    const random = xorshift32(0x53_59_4e_54);

    for (let index = 0; index < data.length; index += 1) {
      data[index] = random();
    }

    this.noiseBuffer = buffer;
    return buffer;
  }

  private createImpulseResponse(context: AudioContext): AudioBuffer {
    const seconds = 0.62;
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(2, length, context.sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const randomLeft = xorshift32(0x51_41_11_17);
    const randomRight = xorshift32(0x48_55_4d_4e);

    for (let index = 0; index < length; index += 1) {
      const progress = index / length;
      const envelope = Math.pow(1 - progress, 3.1);
      left[index] = randomLeft() * envelope;
      right[index] = randomRight() * envelope;
    }

    return buffer;
  }

  async prepareSampleAsset(assetId: string): Promise<void> {
    const context = await audioTransport.unlockAudio();
    this.ensureGraph(context);
    await sampleAssetStore.ensureDecoded(context, assetId);
  }

  async prepareVoiceSource(voice: DrumVoiceId): Promise<void> {
    const context = await audioTransport.unlockAudio();
    this.ensureGraph(context);
    const lane = SEQUENCER_LANES.find(
      (entry) => entry.voice === voice,
    );
    const playback = drumSoundStore.resolvePlaybackSound(
      lane?.kitSlotId ?? "slot-" + voice,
      voice,
    );
    await this.prepareSoundSpec(context, playback.spec);
  }

  private async prepareSoundSpec(
    context: AudioContext,
    spec: SoundSpec,
  ): Promise<void> {
    if (spec.kind === "sample") {
      await sampleAssetStore.ensureDecoded(
        context,
        spec.assetId,
      );
      return;
    }

    if (spec.kind === "hybrid") {
      await sampleAssetStore.ensureDecoded(
        context,
        spec.sample.assetId,
      );
    }
  }

  private synthVoiceFromSpec(
    spec: SynthSoundSpec,
    fallback: DrumVoiceId,
  ): DrumVoiceId {
    const sourceVoice = spec.params.sourceVoice;
    if (
      typeof sourceVoice === "string" &&
      DRUM_PADS.some((pad) => pad.voice === sourceVoice)
    ) {
      return sourceVoice as DrumVoiceId;
    }
    return fallback;
  }

  private scheduleConfiguredVoice(
    kitSlotId: string,
    fallbackVoice: DrumVoiceId,
    audioTime: number,
    velocity: number,
    epoch: number | null,
  ): void {
    const graph = this.graph;
    if (!graph) return;

    const playback = drumSoundStore.resolvePlaybackSound(
      kitSlotId,
      fallbackVoice,
    );

    if (playback.spec.kind === "synth") {
      this.scheduleVoice(
        this.synthVoiceFromSpec(
          playback.spec,
          playback.voice,
        ),
        audioTime,
        velocity,
        epoch,
      );
      return;
    }

    if (playback.spec.kind === "sample") {
      this.scheduleSampleVoice(
        playback.voice,
        playback.spec,
        audioTime,
        velocity,
        epoch,
      );
      return;
    }

    const synthScale = dbToGain(
      playback.spec.synthGainDb,
    );
    for (const layer of playback.spec.layers) {
      this.scheduleVoice(
        this.synthVoiceFromSpec(layer, playback.voice),
        audioTime,
        velocity,
        epoch,
        synthScale,
      );
    }

    this.scheduleSampleVoice(
      playback.voice,
      playback.spec.sample,
      audioTime,
      velocity,
      epoch,
    );
  }

  private scheduleSampleVoice(
    voice: DrumVoiceId,
    spec: SampleSoundSpec,
    audioTime: number,
    velocity: number,
    epoch: number | null,
  ): void {
    const graph = this.graph;
    if (!graph) return;

    const context = graph.context;
    const now = context.currentTime;
    const at = Math.max(audioTime, now + 0.001);
    const buffer = sampleAssetStore.getPlaybackBuffer(
      context,
      spec.assetId,
      spec.reversed,
    );

    if (!buffer) {
      void sampleAssetStore
        .ensureDecoded(context, spec.assetId)
        .catch(() => undefined);
      return;
    }

    this.pruneVoices(now);
    this.enforcePolyphony(now);

    if (voice === "closedHat") {
      this.chokeOpenHats(at);
    }

    const selectedStart = Math.max(
      0,
      Math.min(
        Math.max(0, buffer.duration - 0.001),
        spec.trimStartSeconds,
      ),
    );
    const requestedEnd =
      spec.trimEndSeconds ?? buffer.duration;
    const selectedEnd = Math.max(
      selectedStart + 0.001,
      Math.min(buffer.duration, requestedEnd),
    );
    const sourceDuration = Math.max(
      0.001,
      selectedEnd - selectedStart,
    );
    const start = spec.reversed
      ? Math.max(0, buffer.duration - selectedEnd)
      : selectedStart;
    const pitchRate = Math.pow(
      2,
      Math.max(-24, Math.min(24, spec.pitchSemitones)) / 12,
    );
    const playbackRate = Math.max(
      0.125,
      Math.min(8, pitchRate * (spec.playbackRate ?? 1)),
    );
    const audibleDuration = sourceDuration / playbackRate;
    const stopAt = at + audibleDuration;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(playbackRate, at);

    const sampleGain = context.createGain();
    const kill = context.createGain();
    const peak = Math.max(
      MIN_GAIN,
      clamp01(velocity) * dbToGain(spec.gainDb),
    );

    const fadeIn = Math.max(
      0.0005,
      Math.min(
        audibleDuration * 0.45,
        spec.fadeInSeconds ?? Math.min(0.0015, audibleDuration * 0.12),
      ),
    );
    const fadeOut = Math.max(
      0.0005,
      Math.min(
        audibleDuration * 0.45,
        spec.fadeOutSeconds ?? Math.min(0.006, audibleDuration * 0.12),
      ),
    );

    sampleGain.gain.setValueAtTime(MIN_GAIN, at);
    sampleGain.gain.linearRampToValueAtTime(
      peak,
      at + fadeIn,
    );

    if (audibleDuration > fadeIn + fadeOut + 0.001) {
      sampleGain.gain.setValueAtTime(
        peak,
        stopAt - fadeOut,
      );
      sampleGain.gain.exponentialRampToValueAtTime(
        MIN_GAIN,
        stopAt,
      );
    } else {
      sampleGain.gain.exponentialRampToValueAtTime(
        MIN_GAIN,
        stopAt,
      );
    }

    source.connect(sampleGain);
    sampleGain.connect(kill);
    kill.connect(
      spec.renderedClip
        ? graph.masterInputTrim
        : this.channelInput(voice),
    );

    source.start(at, start, sourceDuration);
    source.stop(stopAt + 0.012);

    this.registerVoice(
      voice,
      at,
      stopAt + 0.012,
      epoch,
      [source],
      kill,
    );
  }

  private scheduleVoice(
    voice: DrumVoiceId,
    audioTime: number,
    velocity: number,
    epoch: number | null,
    levelGain = 1,
  ): void {
    const graph = this.graph;
    if (!graph) return;

    const now = graph.context.currentTime;
    const safeAudioTime = Math.max(audioTime, now + 0.001);

    this.pruneVoices(now);
    this.enforcePolyphony(now);

    switch (voice) {
      case "kick":
        this.scheduleKick(safeAudioTime, velocity, epoch, levelGain);
        break;
      case "snare":
        this.scheduleSnare(safeAudioTime, velocity, epoch, levelGain);
        break;
      case "clap":
        this.scheduleClap(safeAudioTime, velocity, epoch, levelGain);
        break;
      case "closedHat":
        this.chokeOpenHats(safeAudioTime);
        this.scheduleHat("closedHat", safeAudioTime, velocity, epoch, levelGain);
        break;
      case "openHat":
        this.scheduleHat("openHat", safeAudioTime, velocity, epoch, levelGain);
        break;
      case "tom":
        this.scheduleTom(safeAudioTime, velocity, epoch, levelGain);
        break;
      case "percussion":
        this.schedulePercussion(safeAudioTime, velocity, epoch, levelGain);
        break;
      case "crash":
        this.scheduleCrash(safeAudioTime, velocity, epoch, levelGain);
        break;
    }
  }

  private material(voice: DrumVoiceId): DrumMaterialSpec {
    const base = drumSoundStore.getSpec(voice);
    const next: DrumMaterialSpec = { ...base };

    for (const param of DRUM_MATERIAL_PARAMS) {
      next[param] = modulationStore.resolveTarget(
        voiceTargetId(voice, param),
        base[param],
        this.modulationTick,
      ).value;
    }

    return next;
  }

  private materialDecay(
    spec: DrumMaterialSpec,
    min: number,
    range: number,
  ): number {
    const macro = modulationStore.resolveTarget(
      engineTargetId("decay"),
      this.macros.decay,
      this.modulationTick,
    ).value;
    return min + range * clamp01(
      spec.decay * 0.72 + macro * 0.28,
    );
  }

  private materialTone(spec: DrumMaterialSpec): number {
    const macro = modulationStore.resolveTarget(
      engineTargetId("tone"),
      this.macros.tone,
      this.modulationTick,
    ).value;
    return clamp01(spec.tone * 0.72 + macro * 0.28);
  }

  private materialImpact(spec: DrumMaterialSpec): number {
    const macro = modulationStore.resolveTarget(
      engineTargetId("punch"),
      this.macros.punch,
      this.modulationTick,
    ).value;
    return clamp01(spec.impact * 0.68 + macro * 0.32);
  }

  private scheduleKick(
    at: number,
    velocity: number,
    epoch: number | null,
    levelGain = 1,
  ): void {
    const graph = this.graph;
    if (!graph) return;

    const context = graph.context;
    const spec = this.material("kick");
    const tone = this.materialTone(spec);
    const impact = this.materialImpact(spec);
    const decay = this.materialDecay(spec, 0.16, 0.68);
    const amp = velocityGain(velocity) * Math.max(0, levelGain);
    const baseHz = 37 + spec.pitch * 28;
    const pitchStart = baseHz * (2.1 + impact * 2.8);

    const body = context.createOscillator();
    body.type = spec.body > 0.72 ? "triangle" : "sine";
    body.frequency.setValueAtTime(pitchStart, at);
    body.frequency.exponentialRampToValueAtTime(
      baseHz * (1.04 + tone * 0.08),
      at + 0.045 + (1 - impact) * 0.04,
    );
    body.frequency.exponentialRampToValueAtTime(
      baseHz,
      at + Math.min(decay, 0.28),
    );

    const bodyFilter = context.createBiquadFilter();
    bodyFilter.type = "lowpass";
    bodyFilter.frequency.value = 900 + tone * 2200;
    bodyFilter.Q.value = 0.3 + spec.body * 0.8;

    const bodyEnvelope = context.createGain();
    bodyEnvelope.gain.setValueAtTime(MIN_GAIN, at);
    bodyEnvelope.gain.linearRampToValueAtTime(
      amp * (0.42 + spec.body * 0.58),
      at + 0.0015,
    );
    bodyEnvelope.gain.exponentialRampToValueAtTime(
      MIN_GAIN,
      at + decay,
    );

    const sub = context.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(baseHz * 0.5, at);
    const subEnvelope = context.createGain();
    subEnvelope.gain.setValueAtTime(MIN_GAIN, at);
    subEnvelope.gain.linearRampToValueAtTime(
      Math.max(MIN_GAIN, amp * spec.character * 0.42),
      at + 0.004,
    );
    subEnvelope.gain.exponentialRampToValueAtTime(
      MIN_GAIN,
      at + decay * 1.08,
    );

    const click = context.createBufferSource();
    click.buffer = this.createNoiseBuffer(context);
    const clickFilter = context.createBiquadFilter();
    clickFilter.type = "bandpass";
    clickFilter.frequency.value = 1800 + tone * 5200;
    clickFilter.Q.value = 0.7 + spec.air * 2.2;
    const clickEnvelope = context.createGain();
    const clickAmp =
      amp * (0.025 + spec.noise * 0.26 + spec.air * 0.08) *
      (0.55 + impact * 0.65);
    clickEnvelope.gain.setValueAtTime(MIN_GAIN, at);
    clickEnvelope.gain.linearRampToValueAtTime(clickAmp, at + 0.0006);
    clickEnvelope.gain.exponentialRampToValueAtTime(
      MIN_GAIN,
      at + 0.009 + spec.air * 0.012,
    );

    const kill = context.createGain();
    body.connect(bodyFilter);
    bodyFilter.connect(bodyEnvelope);
    bodyEnvelope.connect(kill);
    sub.connect(subEnvelope);
    subEnvelope.connect(kill);
    click.connect(clickFilter);
    clickFilter.connect(clickEnvelope);
    clickEnvelope.connect(kill);
    kill.connect(this.channelInput("kick"));

    body.start(at);
    sub.start(at);
    click.start(at);
    body.stop(at + decay + 0.05);
    sub.stop(at + decay * 1.08 + 0.05);
    click.stop(at + 0.035);

    this.registerVoice(
      "kick",
      at,
      at + decay * 1.08 + 0.05,
      epoch,
      [body, sub, click],
      kill,
    );
  }

  private scheduleSnare(
    at: number,
    velocity: number,
    epoch: number | null,
    levelGain = 1,
  ): void {
    const graph = this.graph;
    if (!graph) return;

    const context = graph.context;
    const spec = this.material("snare");
    const tone = this.materialTone(spec);
    const impact = this.materialImpact(spec);
    const decay = this.materialDecay(spec, 0.09, 0.42);
    const amp = velocityGain(velocity) * Math.max(0, levelGain);
    const bodyHz = 135 + spec.pitch * 115;

    const body = context.createOscillator();
    body.type = spec.character > 0.68 ? "triangle" : "sine";
    body.frequency.setValueAtTime(bodyHz * 1.18, at);
    body.frequency.exponentialRampToValueAtTime(
      bodyHz,
      at + 0.075,
    );

    const ring = context.createOscillator();
    ring.type = "sine";
    ring.frequency.value =
      bodyHz * (1.52 + spec.character * 0.55);

    const bodyEnvelope = context.createGain();
    bodyEnvelope.gain.setValueAtTime(MIN_GAIN, at);
    bodyEnvelope.gain.linearRampToValueAtTime(
      amp * (0.16 + spec.body * 0.42) * (0.75 + impact * 0.35),
      at + 0.0012,
    );
    bodyEnvelope.gain.exponentialRampToValueAtTime(
      MIN_GAIN,
      at + Math.min(decay, 0.24),
    );

    const ringEnvelope = context.createGain();
    ringEnvelope.gain.setValueAtTime(MIN_GAIN, at);
    ringEnvelope.gain.linearRampToValueAtTime(
      Math.max(MIN_GAIN, amp * spec.character * 0.1),
      at + 0.0015,
    );
    ringEnvelope.gain.exponentialRampToValueAtTime(
      MIN_GAIN,
      at + decay * 0.7,
    );

    const noise = context.createBufferSource();
    noise.buffer = this.createNoiseBuffer(context);
    const noiseFilter = context.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 1050 + tone * 3800;
    noiseFilter.Q.value = 0.42 + (1 - spec.air) * 0.9;
    const noiseEnvelope = context.createGain();
    noiseEnvelope.gain.setValueAtTime(MIN_GAIN, at);
    noiseEnvelope.gain.linearRampToValueAtTime(
      amp * (0.18 + spec.noise * 0.62),
      at + 0.0009,
    );
    noiseEnvelope.gain.exponentialRampToValueAtTime(
      MIN_GAIN,
      at + decay,
    );

    const snapNoise = context.createBufferSource();
    snapNoise.buffer = this.createNoiseBuffer(context);
    const snapFilter = context.createBiquadFilter();
    snapFilter.type = "highpass";
    snapFilter.frequency.value = 4200 + spec.air * 4200;
    const snapEnvelope = context.createGain();
    snapEnvelope.gain.setValueAtTime(MIN_GAIN, at);
    snapEnvelope.gain.linearRampToValueAtTime(
      amp * (0.04 + spec.character * 0.24) * (0.6 + impact * 0.6),
      at + 0.0005,
    );
    snapEnvelope.gain.exponentialRampToValueAtTime(
      MIN_GAIN,
      at + 0.016 + spec.air * 0.025,
    );

    const kill = context.createGain();
    body.connect(bodyEnvelope);
    bodyEnvelope.connect(kill);
    ring.connect(ringEnvelope);
    ringEnvelope.connect(kill);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseEnvelope);
    noiseEnvelope.connect(kill);
    snapNoise.connect(snapFilter);
    snapFilter.connect(snapEnvelope);
    snapEnvelope.connect(kill);
    kill.connect(this.channelInput("snare"));

    body.start(at);
    ring.start(at);
    noise.start(at);
    snapNoise.start(at);
    body.stop(at + decay + 0.04);
    ring.stop(at + decay + 0.04);
    noise.stop(at + decay + 0.04);
    snapNoise.stop(at + 0.06);

    this.registerVoice(
      "snare",
      at,
      at + decay + 0.04,
      epoch,
      [body, ring, noise, snapNoise],
      kill,
    );
  }

  private scheduleClap(
    at: number,
    velocity: number,
    epoch: number | null,
    levelGain = 1,
  ): void {
    const graph = this.graph;
    if (!graph) return;

    const context = graph.context;
    const spec = this.material("clap");
    const tone = this.materialTone(spec);
    const impact = this.materialImpact(spec);
    const decay = this.materialDecay(spec, 0.09, 0.36);
    const amp = velocityGain(velocity) * Math.max(0, levelGain);
    const spread = 0.009 + spec.character * 0.015;

    const noise = context.createBufferSource();
    noise.buffer = this.createNoiseBuffer(context);
    const highpass = context.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 550 + tone * 1200;
    const bandpass = context.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 1100 + tone * 2600;
    bandpass.Q.value = 0.35 + spec.body * 1.1;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(MIN_GAIN, at);

    const peak = amp * (0.22 + spec.noise * 0.54) *
      (0.65 + impact * 0.45);
    for (const multiplier of [0, 1, 2]) {
      const burstAt = at + multiplier * spread;
      envelope.gain.setValueAtTime(peak, burstAt);
      envelope.gain.exponentialRampToValueAtTime(
        Math.max(MIN_GAIN, peak * 0.16),
        burstAt + 0.008 + spec.air * 0.006,
      );
    }
    envelope.gain.exponentialRampToValueAtTime(
      MIN_GAIN,
      at + decay,
    );

    const body = context.createOscillator();
    body.type = "triangle";
    body.frequency.value = 170 + spec.pitch * 120;
    const bodyEnvelope = context.createGain();
    bodyEnvelope.gain.setValueAtTime(MIN_GAIN, at);
    bodyEnvelope.gain.linearRampToValueAtTime(
      Math.max(MIN_GAIN, amp * spec.body * 0.09),
      at + 0.001,
    );
    bodyEnvelope.gain.exponentialRampToValueAtTime(
      MIN_GAIN,
      at + 0.045 + spec.body * 0.055,
    );

    const kill = context.createGain();
    noise.connect(highpass);
    highpass.connect(bandpass);
    bandpass.connect(envelope);
    envelope.connect(kill);
    body.connect(bodyEnvelope);
    bodyEnvelope.connect(kill);
    kill.connect(this.channelInput("clap"));

    noise.start(at);
    body.start(at);
    noise.stop(at + decay + 0.04);
    body.stop(at + 0.13);

    this.registerVoice(
      "clap",
      at,
      at + decay + 0.04,
      epoch,
      [noise, body],
      kill,
    );
  }

  private scheduleHat(
    voice: "closedHat" | "openHat",
    at: number,
    velocity: number,
    epoch: number | null,
    levelGain = 1,
  ): void {
    const graph = this.graph;
    if (!graph) return;

    const context = graph.context;
    const spec = this.material(voice);
    const tone = this.materialTone(spec);
    const impact = this.materialImpact(spec);
    const isOpen = voice === "openHat";
    const decay = isOpen
      ? this.materialDecay(spec, 0.16, 0.78)
      : this.materialDecay(spec, 0.022, 0.095);
    const amp = velocityGain(velocity) * Math.max(0, levelGain);

    const kill = context.createGain();
    kill.connect(this.channelInput(voice));

    const metallicBus = context.createGain();
    metallicBus.gain.value =
      amp * (0.035 + spec.character * 0.12 + spec.body * 0.05);
    const metallicFilter = context.createBiquadFilter();
    metallicFilter.type = "highpass";
    metallicFilter.frequency.value = 4300 + tone * 3600;
    metallicFilter.Q.value = 0.35;
    const metallicEnvelope = context.createGain();
    metallicEnvelope.gain.setValueAtTime(MIN_GAIN, at);
    metallicEnvelope.gain.linearRampToValueAtTime(
      0.7 + impact * 0.3,
      at + 0.0005,
    );
    metallicEnvelope.gain.exponentialRampToValueAtTime(
      MIN_GAIN,
      at + decay,
    );
    metallicBus.connect(metallicFilter);
    metallicFilter.connect(metallicEnvelope);
    metallicEnvelope.connect(kill);

    const base = 285 + spec.pitch * 260;
    const ratios = [1, 1.34, 1.58, 2.08, 2.62, 3.17];
    const oscillators = ratios.map((ratio, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = index % 2 === 0 ? "square" : "sawtooth";
      oscillator.frequency.value =
        base * ratio * (0.96 + spec.character * 0.09);
      oscillator.connect(metallicBus);
      oscillator.start(at);
      oscillator.stop(at + decay + 0.035);
      return oscillator;
    });

    const noise = context.createBufferSource();
    noise.buffer = this.createNoiseBuffer(context);
    const noiseHighpass = context.createBiquadFilter();
    noiseHighpass.type = "highpass";
    noiseHighpass.frequency.value = 5200 + tone * 3600;
    const noiseEnvelope = context.createGain();
    noiseEnvelope.gain.setValueAtTime(MIN_GAIN, at);
    noiseEnvelope.gain.linearRampToValueAtTime(
      amp * (0.035 + spec.noise * 0.22 + spec.air * 0.08),
      at + 0.0004,
    );
    noiseEnvelope.gain.exponentialRampToValueAtTime(
      MIN_GAIN,
      at + decay * (0.65 + spec.air * 0.6),
    );
    noise.connect(noiseHighpass);
    noiseHighpass.connect(noiseEnvelope);
    noiseEnvelope.connect(kill);
    noise.start(at);
    noise.stop(at + decay * 1.25 + 0.04);

    const end = at + Math.max(decay + 0.04, decay * 1.25 + 0.04);
    this.registerVoice(
      voice,
      at,
      end,
      epoch,
      [...oscillators, noise],
      kill,
    );
  }

  private scheduleTom(
    at: number,
    velocity: number,
    epoch: number | null,
    levelGain = 1,
  ): void {
    const graph = this.graph;
    if (!graph) return;

    const context = graph.context;
    const spec = this.material("tom");
    const impact = this.materialImpact(spec);
    const tone = this.materialTone(spec);
    const decay = this.materialDecay(spec, 0.16, 0.66);
    const amp = velocityGain(velocity) * Math.max(0, levelGain);
    const baseHz = 72 + spec.pitch * 155;
    const pitchStart =
      baseHz * (1.25 + spec.character * 1.45);

    const body = context.createOscillator();
    body.type = spec.body > 0.72 ? "triangle" : "sine";
    body.frequency.setValueAtTime(pitchStart, at);
    body.frequency.exponentialRampToValueAtTime(
      baseHz,
      at + 0.055 + (1 - impact) * 0.07,
    );

    const bodyFilter = context.createBiquadFilter();
    bodyFilter.type = "lowpass";
    bodyFilter.frequency.value = 850 + tone * 2600;
    bodyFilter.Q.value = 0.45 + spec.body * 1.4;
    const bodyEnvelope = context.createGain();
    bodyEnvelope.gain.setValueAtTime(MIN_GAIN, at);
    bodyEnvelope.gain.linearRampToValueAtTime(
      amp * (0.22 + spec.body * 0.48),
      at + 0.002,
    );
    bodyEnvelope.gain.exponentialRampToValueAtTime(
      MIN_GAIN,
      at + decay,
    );

    const attack = context.createBufferSource();
    attack.buffer = this.createNoiseBuffer(context);
    const attackFilter = context.createBiquadFilter();
    attackFilter.type = "bandpass";
    attackFilter.frequency.value = 900 + tone * 2600;
    attackFilter.Q.value = 0.8;
    const attackEnvelope = context.createGain();
    attackEnvelope.gain.setValueAtTime(MIN_GAIN, at);
    attackEnvelope.gain.linearRampToValueAtTime(
      Math.max(
        MIN_GAIN,
        amp * spec.noise * (0.05 + impact * 0.18),
      ),
      at + 0.0007,
    );
    attackEnvelope.gain.exponentialRampToValueAtTime(
      MIN_GAIN,
      at + 0.02 + spec.air * 0.018,
    );

    const kill = context.createGain();
    body.connect(bodyFilter);
    bodyFilter.connect(bodyEnvelope);
    bodyEnvelope.connect(kill);
    attack.connect(attackFilter);
    attackFilter.connect(attackEnvelope);
    attackEnvelope.connect(kill);
    kill.connect(this.channelInput("tom"));

    body.start(at);
    attack.start(at);
    body.stop(at + decay + 0.05);
    attack.stop(at + 0.06);

    this.registerVoice(
      "tom",
      at,
      at + decay + 0.05,
      epoch,
      [body, attack],
      kill,
    );
  }

  private schedulePercussion(
    at: number,
    velocity: number,
    epoch: number | null,
    levelGain = 1,
  ): void {
    const graph = this.graph;
    if (!graph) return;

    const context = graph.context;
    const spec = this.material("percussion");
    const tone = this.materialTone(spec);
    const impact = this.materialImpact(spec);
    const decay = this.materialDecay(spec, 0.055, 0.36);
    const amp = velocityGain(velocity) * Math.max(0, levelGain);

    const carrier = context.createOscillator();
    const modulator = context.createOscillator();
    const modGain = context.createGain();
    const carrierHz = 180 + spec.pitch * 980;
    carrier.type = spec.body > 0.65 ? "triangle" : "sine";
    carrier.frequency.value = carrierHz;
    modulator.type = spec.character > 0.6 ? "square" : "triangle";
    modulator.frequency.value =
      38 + tone * 190 + spec.pitch * 120;
    modGain.gain.value =
      55 + spec.character * 760 + impact * 120;
    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    const resonator = context.createBiquadFilter();
    resonator.type = "bandpass";
    resonator.frequency.value = carrierHz * (1.1 + tone * 0.6);
    resonator.Q.value = 0.7 + spec.body * 5.2;

    const envelope = context.createGain();
    envelope.gain.setValueAtTime(MIN_GAIN, at);
    envelope.gain.linearRampToValueAtTime(
      amp * (0.12 + spec.body * 0.28 + impact * 0.08),
      at + 0.0008,
    );
    envelope.gain.exponentialRampToValueAtTime(
      MIN_GAIN,
      at + decay,
    );

    const texture = context.createBufferSource();
    texture.buffer = this.createNoiseBuffer(context);
    const textureFilter = context.createBiquadFilter();
    textureFilter.type = "bandpass";
    textureFilter.frequency.value = 1200 + tone * 4200;
    textureFilter.Q.value = 0.5 + spec.air * 1.5;
    const textureEnvelope = context.createGain();
    textureEnvelope.gain.setValueAtTime(MIN_GAIN, at);
    textureEnvelope.gain.linearRampToValueAtTime(
      Math.max(MIN_GAIN, amp * spec.noise * 0.16),
      at + 0.0006,
    );
    textureEnvelope.gain.exponentialRampToValueAtTime(
      MIN_GAIN,
      at + decay * 0.55,
    );

    const kill = context.createGain();
    carrier.connect(resonator);
    resonator.connect(envelope);
    envelope.connect(kill);
    texture.connect(textureFilter);
    textureFilter.connect(textureEnvelope);
    textureEnvelope.connect(kill);
    kill.connect(this.channelInput("percussion"));

    carrier.start(at);
    modulator.start(at);
    texture.start(at);
    carrier.stop(at + decay + 0.04);
    modulator.stop(at + decay + 0.04);
    texture.stop(at + decay * 0.6 + 0.04);

    this.registerVoice(
      "percussion",
      at,
      at + decay + 0.04,
      epoch,
      [carrier, modulator, texture],
      kill,
    );
  }

  private scheduleCrash(
    at: number,
    velocity: number,
    epoch: number | null,
    levelGain = 1,
  ): void {
    const graph = this.graph;
    if (!graph) return;

    const context = graph.context;
    const spec = this.material("crash");
    const tone = this.materialTone(spec);
    const impact = this.materialImpact(spec);
    const decay = this.materialDecay(spec, 0.45, 1.9);
    const amp = velocityGain(velocity) * Math.max(0, levelGain);
    const kill = context.createGain();
    kill.connect(this.channelInput("crash"));

    const metalBus = context.createGain();
    metalBus.gain.value =
      amp * (0.018 + spec.character * 0.07 + spec.body * 0.025);
    const metalFilter = context.createBiquadFilter();
    metalFilter.type = "highpass";
    metalFilter.frequency.value = 2600 + tone * 2700;
    const metalEnvelope = context.createGain();
    metalEnvelope.gain.setValueAtTime(MIN_GAIN, at);
    metalEnvelope.gain.linearRampToValueAtTime(
      0.7 + impact * 0.3,
      at + 0.001,
    );
    metalEnvelope.gain.exponentialRampToValueAtTime(
      MIN_GAIN,
      at + decay,
    );
    metalBus.connect(metalFilter);
    metalFilter.connect(metalEnvelope);
    metalEnvelope.connect(kill);

    const base = 190 + spec.pitch * 190;
    const ratios = [1, 1.31, 1.73, 2.17, 2.64, 3.43];
    const oscillators = ratios.map((ratio, index) => {
      const osc = context.createOscillator();
      osc.type = index % 3 === 0 ? "square" : "sawtooth";
      osc.frequency.value =
        base * ratio * (0.97 + spec.character * 0.08);
      osc.connect(metalBus);
      osc.start(at);
      osc.stop(at + decay + 0.08);
      return osc;
    });

    const noise = context.createBufferSource();
    noise.buffer = this.createNoiseBuffer(context);
    const noiseFilter = context.createBiquadFilter();
    noiseFilter.type = "highpass";
    noiseFilter.frequency.value = 1800 + tone * 2600;
    const noisePeak = context.createBiquadFilter();
    noisePeak.type = "peaking";
    noisePeak.frequency.value = 6500 + spec.air * 2800;
    noisePeak.Q.value = 0.45;
    noisePeak.gain.value = 2 + spec.air * 6;
    const noiseEnvelope = context.createGain();
    noiseEnvelope.gain.setValueAtTime(MIN_GAIN, at);
    noiseEnvelope.gain.linearRampToValueAtTime(
      amp * (0.08 + spec.noise * 0.28 + spec.air * 0.08),
      at + 0.001,
    );
    noiseEnvelope.gain.exponentialRampToValueAtTime(
      MIN_GAIN,
      at + decay * (0.82 + spec.air * 0.28),
    );
    noise.connect(noiseFilter);
    noiseFilter.connect(noisePeak);
    noisePeak.connect(noiseEnvelope);
    noiseEnvelope.connect(kill);
    noise.start(at);
    noise.stop(at + decay * 1.12 + 0.1);

    const end = at + Math.max(decay + 0.08, decay * 1.12 + 0.1);
    this.registerVoice(
      "crash",
      at,
      end,
      epoch,
      [...oscillators, noise],
      kill,
    );
  }

  private registerVoice(
    voice: DrumVoiceId,
    startTime: number,
    endTime: number,
    epoch: number | null,
    sources: AudioScheduledSourceNode[],
    killGain: GainNode,
  ): void {
    killGain.gain.value = 1;

    this.activeVoices.push({
      id: this.nextVoiceId,
      voice,
      startTime,
      endTime,
      epoch,
      sources,
      killGain,
    });
    this.nextVoiceId += 1;
  }

  private chokeOpenHats(at: number): void {
    for (const active of this.activeVoices) {
      if (active.voice !== "openHat" || active.endTime <= at) continue;

      try {
        active.killGain.gain.cancelScheduledValues(at);
        active.killGain.gain.setValueAtTime(1, at);
        active.killGain.gain.exponentialRampToValueAtTime(
          MIN_GAIN,
          at + 0.014,
        );
        for (const source of active.sources) {
          source.stop(at + 0.02);
        }
        active.endTime = Math.min(active.endTime, at + 0.02);
      } catch {
        // Source may already have ended.
      }
    }
  }

  private cancelObsoleteEpochVoices(epoch: number, now: number): void {
    for (const active of this.activeVoices) {
      if (
        active.epoch === null ||
        active.epoch === epoch ||
        active.endTime <= now
      ) {
        continue;
      }

      if (active.startTime >= now - 0.002) {
        this.killVoice(active, now);
      }
    }
    this.pruneVoices(now);
  }

  private cancelTransportVoices(now: number, includeActive: boolean): void {
    for (const active of this.activeVoices) {
      if (active.epoch === null || active.endTime <= now) continue;
      if (includeActive || active.startTime >= now - 0.002) {
        this.killVoice(active, now);
      }
    }
    this.pruneVoices(now);
  }

  private killVoice(active: ActiveVoice, now: number): void {
    try {
      active.killGain.gain.cancelScheduledValues(now);
      active.killGain.gain.setValueAtTime(
        Math.max(MIN_GAIN, active.killGain.gain.value),
        now,
      );
      active.killGain.gain.exponentialRampToValueAtTime(
        MIN_GAIN,
        now + 0.012,
      );
    } catch {
      // Gain may belong to a context that is already closed.
    }

    for (const source of active.sources) {
      try {
        source.stop(now + 0.014);
      } catch {
        // Already stopped.
      }
    }

    active.endTime = Math.min(active.endTime, now + 0.014);
  }

  private cancelAuditionVoices(now: number): void {
    for (const voice of this.activeVoices) {
      if (!this.auditionVoiceIds.has(voice.id)) continue;
      this.killVoice(voice, now);
    }

    this.auditionVoiceIds.clear();
    this.pruneVoices(now);
  }

  private pruneVoices(now: number): void {
    this.activeVoices = this.activeVoices.filter((voice) => {
      const alive = voice.endTime > now - 0.02;
      if (!alive) this.auditionVoiceIds.delete(voice.id);
      return alive;
    });
  }

  private enforcePolyphony(now: number): void {
    this.pruneVoices(now);

    while (this.activeVoices.length >= MAX_ACTIVE_VOICES) {
      const oldest = this.activeVoices.shift();
      if (!oldest) break;
      this.killVoice(oldest, now);
    }
  }

  private publish(): void {
    this.pruneVoices(this.graph?.context.currentTime ?? 0);
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) {
      listener();
    }
  }

  private readMeter(
    analyser: AnalyserNode,
    buffer: Float32Array<ArrayBuffer>,
  ): number {
    analyser.getFloatTimeDomainData(buffer);
    let energy = 0;

    for (let index = 0; index < buffer.length; index += 1) {
      const sample = buffer[index] ?? 0;
      energy += sample * sample;
    }

    const rms = Math.sqrt(energy / Math.max(1, buffer.length));
    return clamp01(rms * 2.8);
  }

  private buildSnapshot(): DrumEngineSnapshot {
    const channelEntries = DRUM_PADS.map((pad) => {
      const channel = this.graph?.channels.get(pad.voice);
      return [
        pad.voice,
        channel
          ? this.readMeter(channel.meter, channel.meterBuffer)
          : 0,
      ] as const;
    });

    const channelLevels = Object.fromEntries(
      channelEntries,
    ) as Record<DrumVoiceId, number>;
    const masterLevel = this.graph
      ? this.readMeter(
          this.graph.masterMeter,
          this.graph.masterMeterBuffer,
        )
      : 0;

    return {
      status: this.status,
      master: this.master,
      macros: { ...this.macros },
      activeVoiceCount: this.activeVoices.length,
      lastVoice: this.lastVoice,
      triggerSerial: this.triggerSerial,
      channelLevels,
      masterLevel,
      lastError: this.lastError,
    };
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}

export const drumEngine = new DrumEngine();

export const DRUM_ENGINE_META = Object.freeze({
  engineVersion: DRUM_SYNTH_ENGINE_VERSION,
  voices: DRUM_PADS.map((pad) => pad.voice),
  maxPolyphony: MAX_ACTIVE_VOICES,
  directTriggerOffsetSeconds: DIRECT_TRIGGER_OFFSET_SECONDS,
});
