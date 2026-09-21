import {
  audioTransport,
  TRANSPORT_SCHEDULER_CONFIG,
  type ScheduledTransportPulse,
  type TransportSnapshot,
} from "./AudioTransport";
import {
  DRUM_PADS,
  type DrumVoiceId,
} from "../music/foundationPattern";
import { sequencerStore } from "../sequencer/SequencerStore";

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

const MAX_ACTIVE_VOICES = 48;
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
      const hits = sequencerStore.getHitsForStep(stepIndex);

      for (const hit of hits) {
        this.scheduleVoice(
          hit.voice,
          pulse.audioTime,
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

    if (snapshot.status !== "running") {
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

  private scheduleKick(
    at: number,
    velocity: number,
    epoch: number | null,
  ): void {
    const graph = this.graph;
    if (!graph) return;
    const context = graph.context;
    const punch = 0.72 + this.macros.punch * 0.72;
    const tone = 0.75 + this.macros.tone * 0.5;
    const decay = 0.3 + this.macros.decay * 0.34;
    const amp = velocityGain(velocity) * 0.82;

    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const kill = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(155 * tone, at);
    oscillator.frequency.exponentialRampToValueAtTime(47 * tone, at + 0.075);
    oscillator.frequency.exponentialRampToValueAtTime(41 * tone, at + decay);

    envelope.gain.setValueAtTime(MIN_GAIN, at);
    envelope.gain.linearRampToValueAtTime(amp * punch, at + 0.002);
    envelope.gain.exponentialRampToValueAtTime(MIN_GAIN, at + decay);

    oscillator.connect(envelope);
    envelope.connect(kill);
    kill.connect(graph.input);

    oscillator.start(at);
    oscillator.stop(at + decay + 0.04);

    this.registerVoice(
      "kick",
      at,
      at + decay + 0.04,
      epoch,
      [oscillator],
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
    const decay = 0.13 + this.macros.decay * 0.22;
    const tone = 1450 + this.macros.tone * 1700;
    const amp = velocityGain(velocity);

    const noise = context.createBufferSource();
    noise.buffer = this.createNoiseBuffer(context);
    const noiseFilter = context.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = tone;
    noiseFilter.Q.value = 0.65;
    const noiseEnvelope = context.createGain();

    const body = context.createOscillator();
    body.type = "triangle";
    body.frequency.setValueAtTime(205, at);
    body.frequency.exponentialRampToValueAtTime(150, at + 0.11);
    const bodyEnvelope = context.createGain();

    const kill = context.createGain();

    noiseEnvelope.gain.setValueAtTime(MIN_GAIN, at);
    noiseEnvelope.gain.linearRampToValueAtTime(amp * 0.62, at + 0.0015);
    noiseEnvelope.gain.exponentialRampToValueAtTime(MIN_GAIN, at + decay);

    bodyEnvelope.gain.setValueAtTime(MIN_GAIN, at);
    bodyEnvelope.gain.linearRampToValueAtTime(amp * 0.36, at + 0.002);
    bodyEnvelope.gain.exponentialRampToValueAtTime(MIN_GAIN, at + Math.min(decay, 0.19));

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseEnvelope);
    noiseEnvelope.connect(kill);
    body.connect(bodyEnvelope);
    bodyEnvelope.connect(kill);
    kill.connect(graph.input);

    noise.start(at);
    noise.stop(at + decay + 0.03);
    body.start(at);
    body.stop(at + decay + 0.03);

    this.registerVoice(
      "snare",
      at,
      at + decay + 0.03,
      epoch,
      [noise, body],
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
    const decay = 0.16 + this.macros.decay * 0.18;
    const noise = context.createBufferSource();
    noise.buffer = this.createNoiseBuffer(context);

    const highpass = context.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 650 + this.macros.tone * 550;

    const bandpass = context.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 1200 + this.macros.tone * 1100;
    bandpass.Q.value = 0.55;

    const envelope = context.createGain();
    const kill = context.createGain();
    const amp = velocityGain(velocity) * 0.62;

    envelope.gain.setValueAtTime(MIN_GAIN, at);
    for (const offset of [0, 0.018, 0.036]) {
      envelope.gain.setValueAtTime(amp, at + offset);
      envelope.gain.exponentialRampToValueAtTime(
        Math.max(MIN_GAIN, amp * 0.18),
        at + offset + 0.01,
      );
    }
    envelope.gain.exponentialRampToValueAtTime(MIN_GAIN, at + decay);

    noise.connect(highpass);
    highpass.connect(bandpass);
    bandpass.connect(envelope);
    envelope.connect(kill);
    kill.connect(graph.input);

    noise.start(at);
    noise.stop(at + decay + 0.04);

    this.registerVoice(
      "clap",
      at,
      at + decay + 0.04,
      epoch,
      [noise],
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
    const isOpen = voice === "openHat";
    const decayBase = isOpen ? 0.26 : 0.045;
    const decay =
      decayBase *
      (0.72 + this.macros.decay * (isOpen ? 1.35 : 0.72));
    const noise = context.createBufferSource();
    noise.buffer = this.createNoiseBuffer(context);

    const highpass = context.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 5400 + this.macros.tone * 2400;

    const bandpass = context.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 8200 + this.macros.tone * 3400;
    bandpass.Q.value = isOpen ? 0.42 : 0.75;

    const envelope = context.createGain();
    const kill = context.createGain();
    const amp = velocityGain(velocity) * (isOpen ? 0.34 : 0.27);

    envelope.gain.setValueAtTime(MIN_GAIN, at);
    envelope.gain.linearRampToValueAtTime(amp, at + 0.001);
    envelope.gain.exponentialRampToValueAtTime(MIN_GAIN, at + decay);

    noise.connect(highpass);
    highpass.connect(bandpass);
    bandpass.connect(envelope);
    envelope.connect(kill);
    kill.connect(graph.input);

    noise.start(at);
    noise.stop(at + decay + 0.035);

    this.registerVoice(
      voice,
      at,
      at + decay + 0.035,
      epoch,
      [noise],
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
    const decay = 0.22 + this.macros.decay * 0.34;
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(185 + this.macros.tone * 55, at);
    oscillator.frequency.exponentialRampToValueAtTime(
      92 + this.macros.tone * 36,
      at + decay * 0.72,
    );

    const envelope = context.createGain();
    const kill = context.createGain();
    const amp = velocityGain(velocity) * 0.58;
    envelope.gain.setValueAtTime(MIN_GAIN, at);
    envelope.gain.linearRampToValueAtTime(amp, at + 0.003);
    envelope.gain.exponentialRampToValueAtTime(MIN_GAIN, at + decay);

    oscillator.connect(envelope);
    envelope.connect(kill);
    kill.connect(graph.input);
    oscillator.start(at);
    oscillator.stop(at + decay + 0.04);

    this.registerVoice(
      "tom",
      at,
      at + decay + 0.04,
      epoch,
      [oscillator],
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
    const decay = 0.08 + this.macros.decay * 0.16;
    const carrier = context.createOscillator();
    const modulator = context.createOscillator();
    const modGain = context.createGain();
    const envelope = context.createGain();
    const kill = context.createGain();

    carrier.type = "sine";
    carrier.frequency.value = 520 + this.macros.tone * 330;
    modulator.type = "triangle";
    modulator.frequency.value = 92 + this.macros.tone * 70;
    modGain.gain.value = 130 + this.macros.punch * 260;

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    const amp = velocityGain(velocity) * 0.31;
    envelope.gain.setValueAtTime(MIN_GAIN, at);
    envelope.gain.linearRampToValueAtTime(amp, at + 0.001);
    envelope.gain.exponentialRampToValueAtTime(MIN_GAIN, at + decay);

    carrier.connect(envelope);
    envelope.connect(kill);
    kill.connect(graph.input);

    carrier.start(at);
    modulator.start(at);
    carrier.stop(at + decay + 0.03);
    modulator.stop(at + decay + 0.03);

    this.registerVoice(
      "percussion",
      at,
      at + decay + 0.03,
      epoch,
      [carrier, modulator],
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
    const decay = 0.72 + this.macros.decay * 0.88;
    const noise = context.createBufferSource();
    noise.buffer = this.createNoiseBuffer(context);

    const highpass = context.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 2900 + this.macros.tone * 1200;

    const peaking = context.createBiquadFilter();
    peaking.type = "peaking";
    peaking.frequency.value = 7200;
    peaking.Q.value = 0.55;
    peaking.gain.value = 5;

    const envelope = context.createGain();
    const kill = context.createGain();
    const amp = velocityGain(velocity) * 0.31;
    envelope.gain.setValueAtTime(MIN_GAIN, at);
    envelope.gain.linearRampToValueAtTime(amp, at + 0.002);
    envelope.gain.exponentialRampToValueAtTime(MIN_GAIN, at + decay);

    noise.connect(highpass);
    highpass.connect(peaking);
    peaking.connect(envelope);
    envelope.connect(kill);
    kill.connect(graph.input);

    noise.start(at);
    noise.stop(at + decay + 0.06);

    this.registerVoice(
      "crash",
      at,
      at + decay + 0.06,
      epoch,
      [noise],
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

  private pruneVoices(now: number): void {
    this.activeVoices = this.activeVoices.filter(
      (voice) => voice.endTime > now - 0.02,
    );
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
  voices: DRUM_PADS.map((pad) => pad.voice),
  maxPolyphony: MAX_ACTIVE_VOICES,
  directTriggerOffsetSeconds: DIRECT_TRIGGER_OFFSET_SECONDS,
});
