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
} from "../domain/contracts";
import {
  DRUM_PADS,
  FOUNDATION_STEP_TICKS,
  laneDefinitionById,
  type DrumVoiceId,
} from "../music/foundationPattern";
import { sequencerStore } from "../sequencer/SequencerStore";
import { swingOffsetUsForStep } from "../groove/grooveEngine";
import { drumSoundStore } from "./drumSoundModel";

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
  lastError?: string;
}

interface MasterGraph {
  context: AudioContext;
  input: GainNode;
  drive: WaveShaperNode;
  compressor: DynamicsCompressorNode;
  convolver: ConvolverNode;
  wet: GainNode;
  master: GainNode;
  limiter: DynamicsCompressorNode;
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
  private auditionVoiceIds = new Set<number>();
  private soundEditTimer: number | null = null;
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
      audioTransport.invalidateScheduledEvents();
    });

    drumSoundStore.subscribe(() => {
      if (this.soundEditTimer !== null) return;

      this.soundEditTimer = globalThis.setTimeout(() => {
        this.soundEditTimer = null;
        audioTransport.invalidateScheduledEvents();
      }, 32);
    });
  }

  readonly subscribe = (listener: StoreListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): DrumEngineSnapshot => this.snapshot;

  async triggerNow(
    voice: DrumVoiceId,
    velocity = 0.82,
  ): Promise<void> {
    try {
      const context = await audioTransport.unlockAudio();
      this.ensureGraph(context);
      this.scheduleVoice(
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

  async auditionPattern(pattern: Pattern, bpm: number): Promise<void> {
    try {
      const context = await audioTransport.unlockAudio();
      this.ensureGraph(context);
      this.cancelAuditionVoices(context.currentTime);

      const safeBpm = Math.min(300, Math.max(30, bpm));
      const stepSeconds = 60 / safeBpm / 4;
      const startTime = context.currentTime + 0.035;
      let lastVoice: DrumVoiceId | undefined;

      for (const lane of pattern.lanes) {
        const definition = laneDefinitionById(lane.id);
        if (!definition) continue;

        for (const event of lane.events) {
          const step = Math.round(event.tick / FOUNDATION_STEP_TICKS);
          const swingOffsetUs = swingOffsetUsForStep(
            step,
            safeBpm,
            pattern.groove?.swing ?? 0,
          );
          const at =
            startTime +
            step * stepSeconds +
            (swingOffsetUs + event.timingOffsetUs) / 1_000_000;

          const firstVoiceId = this.nextVoiceId;
          const auditionVoice = drumSoundStore.resolveVoiceForSlot(
            lane.kitSlotId,
            definition.voice,
          );
          this.scheduleVoice(
            auditionVoice,
            at,
            event.velocity,
            null,
          );

          for (
            let id = firstVoiceId;
            id < this.nextVoiceId;
            id += 1
          ) {
            this.auditionVoiceIds.add(id);
          }

          lastVoice = drumSoundStore.resolveVoiceForSlot(
            lane.kitSlotId,
            definition.voice,
          );
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
    this.master = clamp01(value);
    if (this.graph) {
      this.graph.master.gain.setTargetAtTime(
        this.master * 0.92,
        this.graph.context.currentTime,
        0.012,
      );
    }
    this.publish();
  }

  setMacro(name: keyof DrumMacros, value: number): void {
    this.macros = {
      ...this.macros,
      [name]: clamp01(value),
    };
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

      const stepIndex = Math.floor(
        pulse.absoluteTick / TRANSPORT_SCHEDULER_CONFIG.pulseTicks,
      );
      const sequencer = sequencerStore.getSnapshot();
      const hits = sequencerStore.getHitsForStep(stepIndex);
      const transport = audioTransport.getSnapshot();
      const swingOffsetUs = swingOffsetUsForStep(
        stepIndex,
        transport.bpm,
        sequencer.pattern.groove?.swing ?? 0,
      );

      for (const hit of hits) {
        const resolvedVoice = drumSoundStore.resolveVoiceForSlot(
          hit.kitSlotId,
          hit.voice,
        );

        this.scheduleVoice(
          resolvedVoice,
          pulse.audioTime +
            (swingOffsetUs + hit.timingOffsetUs) / 1_000_000,
          hit.velocity,
          pulse.epoch,
        );
      }

      if (hits.length > 0) {
        this.lastVoice = hits[hits.length - 1].voice;
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
      this.currentTransportEpoch = snapshot.schedulerEpoch;
    }

    if (snapshot.status === "running") {
      this.cancelAuditionVoices(context.currentTime);
    } else {
      this.cancelTransportVoices(context.currentTime, true);
    }
  }

  private ensureGraph(context: AudioContext): MasterGraph {
    if (this.graph?.context === context) {
      return this.graph;
    }

    this.activeVoices = [];
    this.noiseBuffer = null;

    const input = context.createGain();
    const drive = context.createWaveShaper();
    const compressor = context.createDynamicsCompressor();
    const convolver = context.createConvolver();
    const wet = context.createGain();
    const master = context.createGain();
    const limiter = context.createDynamicsCompressor();

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
    master.gain.value = this.master * 0.92;

    input.connect(drive);
    drive.connect(compressor);

    input.connect(convolver);
    convolver.connect(wet);
    wet.connect(compressor);

    compressor.connect(master);
    master.connect(limiter);
    limiter.connect(context.destination);

    this.graph = {
      context,
      input,
      drive,
      compressor,
      convolver,
      wet,
      master,
      limiter,
    };

    this.applyGraphMacros();
    this.status = "ready";
    this.publish();

    return this.graph;
  }

  private applyGraphMacros(): void {
    if (!this.graph) return;

    const now = this.graph.context.currentTime;
    this.graph.drive.curve = createDriveCurve(this.macros.grit);
    this.graph.wet.gain.setTargetAtTime(
      this.macros.space * 0.34,
      now,
      0.018,
    );
    this.graph.master.gain.setTargetAtTime(
      this.master * 0.92,
      now,
      0.012,
    );
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

  private scheduleVoice(
    voice: DrumVoiceId,
    audioTime: number,
    velocity: number,
    epoch: number | null,
  ): void {
    const graph = this.graph;
    if (!graph) return;

    const now = graph.context.currentTime;
    const safeAudioTime = Math.max(audioTime, now + 0.001);

    this.pruneVoices(now);
    this.enforcePolyphony(now);

    switch (voice) {
      case "kick":
        this.scheduleKick(safeAudioTime, velocity, epoch);
        break;
      case "snare":
        this.scheduleSnare(safeAudioTime, velocity, epoch);
        break;
      case "clap":
        this.scheduleClap(safeAudioTime, velocity, epoch);
        break;
      case "closedHat":
        this.chokeOpenHats(safeAudioTime);
        this.scheduleHat("closedHat", safeAudioTime, velocity, epoch);
        break;
      case "openHat":
        this.scheduleHat("openHat", safeAudioTime, velocity, epoch);
        break;
      case "tom":
        this.scheduleTom(safeAudioTime, velocity, epoch);
        break;
      case "percussion":
        this.schedulePercussion(safeAudioTime, velocity, epoch);
        break;
      case "crash":
        this.scheduleCrash(safeAudioTime, velocity, epoch);
        break;
    }
  }

  private material(voice: DrumVoiceId): DrumMaterialSpec {
    return drumSoundStore.getSpec(voice);
  }

  private materialDecay(
    spec: DrumMaterialSpec,
    min: number,
    range: number,
  ): number {
    return min + range * clamp01(
      spec.decay * 0.72 + this.macros.decay * 0.28,
    );
  }

  private materialTone(spec: DrumMaterialSpec): number {
    return clamp01(spec.tone * 0.72 + this.macros.tone * 0.28);
  }

  private materialImpact(spec: DrumMaterialSpec): number {
    return clamp01(spec.impact * 0.68 + this.macros.punch * 0.32);
  }

  private scheduleKick(
    at: number,
    velocity: number,
    epoch: number | null,
  ): void {
    const graph = this.graph;
    if (!graph) return;

    const context = graph.context;
    const spec = this.material("kick");
    const tone = this.materialTone(spec);
    const impact = this.materialImpact(spec);
    const decay = this.materialDecay(spec, 0.16, 0.68);
    const amp = velocityGain(velocity);
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
    kill.connect(graph.input);

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
  ): void {
    const graph = this.graph;
    if (!graph) return;

    const context = graph.context;
    const spec = this.material("snare");
    const tone = this.materialTone(spec);
    const impact = this.materialImpact(spec);
    const decay = this.materialDecay(spec, 0.09, 0.42);
    const amp = velocityGain(velocity);
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
    kill.connect(graph.input);

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
  ): void {
    const graph = this.graph;
    if (!graph) return;

    const context = graph.context;
    const spec = this.material("clap");
    const tone = this.materialTone(spec);
    const impact = this.materialImpact(spec);
    const decay = this.materialDecay(spec, 0.09, 0.36);
    const amp = velocityGain(velocity);
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
    kill.connect(graph.input);

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
    const amp = velocityGain(velocity);

    const kill = context.createGain();
    kill.connect(graph.input);

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
  ): void {
    const graph = this.graph;
    if (!graph) return;

    const context = graph.context;
    const spec = this.material("tom");
    const impact = this.materialImpact(spec);
    const tone = this.materialTone(spec);
    const decay = this.materialDecay(spec, 0.16, 0.66);
    const amp = velocityGain(velocity);
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
    kill.connect(graph.input);

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
  ): void {
    const graph = this.graph;
    if (!graph) return;

    const context = graph.context;
    const spec = this.material("percussion");
    const tone = this.materialTone(spec);
    const impact = this.materialImpact(spec);
    const decay = this.materialDecay(spec, 0.055, 0.36);
    const amp = velocityGain(velocity);

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
    kill.connect(graph.input);

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
  ): void {
    const graph = this.graph;
    if (!graph) return;

    const context = graph.context;
    const spec = this.material("crash");
    const tone = this.materialTone(spec);
    const impact = this.materialImpact(spec);
    const decay = this.materialDecay(spec, 0.45, 1.9);
    const amp = velocityGain(velocity);
    const kill = context.createGain();
    kill.connect(graph.input);

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

  private buildSnapshot(): DrumEngineSnapshot {
    return {
      status: this.status,
      master: this.master,
      macros: { ...this.macros },
      activeVoiceCount: this.activeVoices.length,
      lastVoice: this.lastVoice,
      triggerSerial: this.triggerSerial,
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
