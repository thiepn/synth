import type {
  DrumMaterialSpec,
  SampleSoundSpec,
  SoundSpec,
  SynthSoundSpec,
} from "../domain/contracts";
import { PPQ } from "../domain/contracts";
import { swingOffsetUsForStep } from "../groove/grooveEngine";
import {
  clampMixerChannel,
  type MixerChannelState,
} from "../mix/mixerModel";
import {
  DRUM_MATERIAL_PARAMS,
} from "../audio/drumSoundModel";
import {
  DRUM_PADS,
  FOUNDATION_STEP_TICKS,
  type DrumVoiceId,
} from "../music/foundationPattern";
import {
  resolveModulatedTarget,
} from "../modulation/modulationEngine";
import {
  engineTargetId,
  mixerMasterTargetId,
  mixerTargetId,
  voiceTargetId,
} from "../modulation/parameterRegistry";
import {
  getPatternHitsForAbsoluteStep,
  type PatternPlaybackHit,
} from "../sequencer/patternPlayback";
import type {
  RenderAnalysis,
  RenderOccurrence,
  RenderOptions,
  RenderResult,
  RenderSnapshot,
  RenderSlotSound,
} from "./renderTypes";

const MIN_GAIN = 0.0001;

interface OfflineTrackGraph {
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
}

interface OfflineGraph {
  context: OfflineAudioContext;
  channels: Map<DrumVoiceId, OfflineTrackGraph>;
  input: GainNode;
  drive: WaveShaperNode;
  busCompressor: DynamicsCompressorNode;
  convolver: ConvolverNode;
  wet: GainNode;
  performanceFilter: BiquadFilterNode;
  engineMaster: GainNode;
  masterInputTrim: GainNode;
  masterLow: BiquadFilterNode;
  masterHigh: BiquadFilterNode;
  masterGlue: DynamicsCompressorNode;
  widthLeftDirect: GainNode;
  widthRightToLeft: GainNode;
  widthRightDirect: GainNode;
  widthLeftToRight: GainNode;
  masterOutput: GainNode;
  limiter: DynamicsCompressorNode;
  noiseBuffer: AudioBuffer;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
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
    } else {
      const drive = 1 + normalized * 28;
      curve[index] = Math.tanh(x * drive) / Math.tanh(drive);
    }
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

function createNoiseBuffer(
  context: OfflineAudioContext,
): AudioBuffer {
  const length = Math.max(1, Math.floor(context.sampleRate * 2));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  const random = xorshift32(0x53_59_4e_54);

  for (let index = 0; index < data.length; index += 1) {
    data[index] = random();
  }

  return buffer;
}

function createImpulseResponse(
  context: OfflineAudioContext,
): AudioBuffer {
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

function secondsPerTick(snapshot: RenderSnapshot): number {
  return 60 / Math.max(1, snapshot.bpm) / PPQ;
}

function resolveTarget(
  snapshot: RenderSnapshot,
  targetId: string,
  baseValue: number,
  tick: number,
): number {
  return resolveModulatedTarget({
    targetId,
    baseValue,
    tick,
    sources: snapshot.modulation.sources,
    routes: snapshot.modulation.routes,
    automationLanes: snapshot.modulation.automationLanes,
  }).value;
}

function resolveMaterial(
  snapshot: RenderSnapshot,
  voice: DrumVoiceId,
  tick: number,
): DrumMaterialSpec {
  const source = snapshot.drumSpecs[voice];
  const next: DrumMaterialSpec = { ...source };

  for (const param of DRUM_MATERIAL_PARAMS) {
    next[param] = resolveTarget(
      snapshot,
      voiceTargetId(voice, param),
      source[param],
      tick,
    );
  }

  return next;
}

function resolveMixerChannel(
  snapshot: RenderSnapshot,
  voice: DrumVoiceId,
  tick: number,
): MixerChannelState {
  const source = snapshot.mixerState.channels[voice];
  const resolve = (
    parameter:
      | "gainDb"
      | "pan"
      | "lowDb"
      | "midDb"
      | "highDb"
      | "compression"
      | "saturation"
      | "reverbSend"
      | "sidechain",
    value: number,
  ) =>
    resolveTarget(
      snapshot,
      mixerTargetId(voice, parameter),
      value,
      tick,
    );

  const resolved = clampMixerChannel({
    ...source,
    gainDb: resolve("gainDb", source.gainDb),
    pan: resolve("pan", source.pan),
    lowDb: resolve("lowDb", source.lowDb),
    midDb: resolve("midDb", source.midDb),
    highDb: resolve("highDb", source.highDb),
    compression: resolve("compression", source.compression),
    saturation: resolve("saturation", source.saturation),
    reverbSend: resolve("reverbSend", source.reverbSend),
    sidechain: resolve("sidechain", source.sidechain),
  });

  const soloActive = Object.values(snapshot.mixerState.channels).some(
    (channel) => channel.solo,
  );

  return {
    ...resolved,
    muted:
      source.muted ||
      (soloActive && !source.solo),
    solo: source.solo,
  };
}

function resolveMixerMaster(
  snapshot: RenderSnapshot,
  tick: number,
): number {
  return resolveTarget(
    snapshot,
    mixerMasterTargetId(),
    snapshot.mixerState.masterGainDb,
    tick,
  );
}

function materialTone(
  snapshot: RenderSnapshot,
  spec: DrumMaterialSpec,
  tick: number,
): number {
  const macro = resolveTarget(
    snapshot,
    engineTargetId("tone"),
    snapshot.engineMacros.tone,
    tick,
  );
  return clamp01(spec.tone * 0.72 + macro * 0.28);
}

function materialImpact(
  snapshot: RenderSnapshot,
  spec: DrumMaterialSpec,
  tick: number,
): number {
  const macro = resolveTarget(
    snapshot,
    engineTargetId("punch"),
    snapshot.engineMacros.punch,
    tick,
  );
  return clamp01(spec.impact * 0.68 + macro * 0.32);
}

function materialDecay(
  snapshot: RenderSnapshot,
  spec: DrumMaterialSpec,
  tick: number,
  min: number,
  range: number,
): number {
  const macro = resolveTarget(
    snapshot,
    engineTargetId("decay"),
    snapshot.engineMacros.decay,
    tick,
  );
  return min + range * clamp01(
    spec.decay * 0.72 + macro * 0.28,
  );
}

function velocityGain(velocity: number): number {
  return 0.22 + clamp01(velocity) * 0.78;
}

function graphFor(
  context: OfflineAudioContext,
  snapshot: RenderSnapshot,
  includeMastering: boolean,
): OfflineGraph {
  const input = context.createGain();
  const channels = new Map<DrumVoiceId, OfflineTrackGraph>();
  const noiseBuffer = createNoiseBuffer(context);
  const drive = context.createWaveShaper();
  const busCompressor = context.createDynamicsCompressor();
  const convolver = context.createConvolver();
  const wet = context.createGain();
  const performanceFilter = context.createBiquadFilter();
  const engineMaster = context.createGain();

  drive.oversample = "2x";
  busCompressor.threshold.value = -10;
  busCompressor.knee.value = 14;
  busCompressor.ratio.value = 8;
  busCompressor.attack.value = 0.003;
  busCompressor.release.value = 0.12;
  convolver.buffer = createImpulseResponse(context);
  performanceFilter.type = "lowpass";
  performanceFilter.frequency.value = 20_000;
  performanceFilter.Q.value = 0.5;

  input.connect(drive);
  drive.connect(busCompressor);

  for (const pad of DRUM_PADS) {
    const channelInput = context.createGain();
    const low = context.createBiquadFilter();
    const mid = context.createBiquadFilter();
    const high = context.createBiquadFilter();
    const saturation = context.createWaveShaper();
    const compressor = context.createDynamicsCompressor();
    const pan = context.createStereoPanner();
    const fader = context.createGain();
    const duck = context.createGain();
    const send = context.createGain();

    low.type = "lowshelf";
    low.frequency.value = 120;
    mid.type = "peaking";
    mid.frequency.value = 1_400;
    mid.Q.value = 0.7;
    high.type = "highshelf";
    high.frequency.value = 6_500;
    saturation.oversample = "2x";

    channelInput.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(saturation);
    saturation.connect(compressor);
    compressor.connect(pan);
    pan.connect(fader);
    fader.connect(duck);
    duck.connect(input);
    duck.connect(send);
    send.connect(convolver);

    channels.set(pad.voice, {
      input: channelInput,
      low,
      mid,
      high,
      saturation,
      compressor,
      pan,
      fader,
      duck,
      send,
    });
  }

  convolver.connect(wet);
  wet.connect(busCompressor);
  busCompressor.connect(performanceFilter);
  performanceFilter.connect(engineMaster);

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

  masterLow.type = "lowshelf";
  masterLow.frequency.value = 120;
  masterHigh.type = "highshelf";
  masterHigh.frequency.value = 8_000;

  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.06;

  engineMaster.connect(masterInputTrim);
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
  limiter.connect(context.destination);

  const masterState = snapshot.masteringState;
  const mastered = includeMastering && masterState.enabled;
  masterInputTrim.gain.value = mastered
    ? dbToGain(masterState.inputTrimDb)
    : 1;
  masterLow.gain.value = mastered ? masterState.lowDb : 0;
  masterHigh.gain.value = mastered ? masterState.highDb : 0;

  const glue = mastered ? clamp01(masterState.glue) : 0;
  masterGlue.threshold.value = glue > 0 ? -4 - glue * 18 : 0;
  masterGlue.knee.value = glue * 10;
  masterGlue.ratio.value = 1 + glue * 4.5;
  masterGlue.attack.value = 0.008 + (1 - glue) * 0.018;
  masterGlue.release.value = 0.12 + glue * 0.16;

  const width = mastered ? masterState.width : 1;
  const direct = (1 + width) * 0.5;
  const cross = (1 - width) * 0.5;
  widthLeftDirect.gain.value = direct;
  widthRightDirect.gain.value = direct;
  widthRightToLeft.gain.value = cross;
  widthLeftToRight.gain.value = cross;
  masterOutput.gain.value = mastered
    ? dbToGain(masterState.outputGainDb)
    : 1;

  limiter.threshold.value = mastered
    ? masterState.ceilingDb
    : -1.5;

  return {
    context,
    channels,
    input,
    drive,
    busCompressor,
    convolver,
    wet,
    performanceFilter,
    engineMaster,
    masterInputTrim,
    masterLow,
    masterHigh,
    masterGlue,
    widthLeftDirect,
    widthRightToLeft,
    widthRightDirect,
    widthLeftToRight,
    masterOutput,
    limiter,
    noiseBuffer,
  };
}

function configureAtTick(
  graph: OfflineGraph,
  snapshot: RenderSnapshot,
  tick: number,
  audioTime: number,
): void {
  const driveAmount = resolveTarget(
    snapshot,
    engineTargetId("grit"),
    snapshot.engineMacros.grit,
    tick,
  );
  if (audioTime <= 0.0001) {
    graph.drive.curve = createDriveCurve(driveAmount);
  }

  const space = resolveTarget(
    snapshot,
    engineTargetId("space"),
    snapshot.engineMacros.space,
    tick,
  );
  graph.wet.gain.setValueAtTime(space * 0.34, audioTime);

  const filterAmount = resolveTarget(
    snapshot,
    engineTargetId("filter"),
    1,
    tick,
  );
  const minFilterHz = 360;
  const maxFilterHz = 20_000;
  const filterHz =
    minFilterHz *
    Math.pow(maxFilterHz / minFilterHz, clamp01(filterAmount));
  graph.performanceFilter.frequency.setValueAtTime(
    filterHz,
    audioTime,
  );

  const engineMaster = resolveTarget(
    snapshot,
    engineTargetId("master"),
    snapshot.engineMaster,
    tick,
  );
  graph.engineMaster.gain.setValueAtTime(
    engineMaster *
      0.92 *
      dbToGain(resolveMixerMaster(snapshot, tick)),
    audioTime,
  );

  for (const pad of DRUM_PADS) {
    const channel = graph.channels.get(pad.voice);
    if (!channel) continue;
    const state = resolveMixerChannel(snapshot, pad.voice, tick);

    channel.low.gain.setValueAtTime(state.lowDb, audioTime);
    channel.mid.gain.setValueAtTime(state.midDb, audioTime);
    channel.high.gain.setValueAtTime(state.highDb, audioTime);
    channel.pan.pan.setValueAtTime(state.pan, audioTime);
    channel.fader.gain.setValueAtTime(
      state.muted ? 0 : dbToGain(state.gainDb),
      audioTime,
    );
    channel.send.gain.setValueAtTime(
      state.muted ? 0 : state.reverbSend,
      audioTime,
    );

    const compression = clamp01(state.compression);
    channel.compressor.threshold.setValueAtTime(
      -1 - compression * 31,
      audioTime,
    );
    channel.compressor.knee.setValueAtTime(
      compression * 12,
      audioTime,
    );
    channel.compressor.ratio.setValueAtTime(
      1 + compression * 8,
      audioTime,
    );
    channel.compressor.attack.setValueAtTime(
      0.002 + (1 - compression) * 0.01,
      audioTime,
    );
    channel.compressor.release.setValueAtTime(
      0.06 + compression * 0.16,
      audioTime,
    );

    if (audioTime <= 0.0001) {
      channel.saturation.curve = createDriveCurve(
        state.saturation * 0.72,
      );
    }
  }
}

function findSlot(
  snapshot: RenderSnapshot,
  kitSlotId: string,
  fallbackVoice: DrumVoiceId,
): RenderSlotSound {
  return (
    snapshot.slotSounds.find((slot) => slot.kitSlotId === kitSlotId) ??
    snapshot.slotSounds.find((slot) => slot.fallbackVoice === fallbackVoice) ??
    {
      kitSlotId,
      fallbackVoice,
      resolvedVoice: fallbackVoice,
      spec: {
        kind: "synth",
        voice:
          fallbackVoice === "closedHat" || fallbackVoice === "openHat"
            ? "hat"
            : fallbackVoice === "crash"
              ? "custom"
              : fallbackVoice,
        engineVersion: 2,
        params: { sourceVoice: fallbackVoice },
      } as SynthSoundSpec,
    }
  );
}

function synthVoiceFromSpec(
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

function channelInput(
  graph: OfflineGraph,
  voice: DrumVoiceId,
): AudioNode {
  return graph.channels.get(voice)?.input ?? graph.input;
}

function scheduleKick(
  graph: OfflineGraph,
  snapshot: RenderSnapshot,
  voice: DrumVoiceId,
  tick: number,
  at: number,
  velocity: number,
): void {
  const context = graph.context;
  const spec = resolveMaterial(snapshot, voice, tick);
  const tone = materialTone(snapshot, spec, tick);
  const impact = materialImpact(snapshot, spec, tick);
  const decay = materialDecay(snapshot, spec, tick, 0.16, 0.68);
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
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(MIN_GAIN, at);
  envelope.gain.linearRampToValueAtTime(
    amp * (0.42 + spec.body * 0.58),
    at + 0.0015,
  );
  envelope.gain.exponentialRampToValueAtTime(
    MIN_GAIN,
    at + decay,
  );

  const click = context.createBufferSource();
  click.buffer = graph.noiseBuffer;
  const clickFilter = context.createBiquadFilter();
  clickFilter.type = "bandpass";
  clickFilter.frequency.value = 1800 + tone * 5200;
  const clickGain = context.createGain();
  clickGain.gain.setValueAtTime(MIN_GAIN, at);
  clickGain.gain.linearRampToValueAtTime(
    amp * (0.025 + spec.noise * 0.26),
    at + 0.0006,
  );
  clickGain.gain.exponentialRampToValueAtTime(
    MIN_GAIN,
    at + 0.02,
  );

  body.connect(bodyFilter);
  bodyFilter.connect(envelope);
  envelope.connect(channelInput(graph, voice));
  click.connect(clickFilter);
  clickFilter.connect(clickGain);
  clickGain.connect(channelInput(graph, voice));
  body.start(at);
  click.start(at);
  body.stop(at + decay + 0.05);
  click.stop(at + 0.04);
}

function scheduleSnareLike(
  graph: OfflineGraph,
  snapshot: RenderSnapshot,
  voice: "snare" | "clap",
  tick: number,
  at: number,
  velocity: number,
): void {
  const context = graph.context;
  const spec = resolveMaterial(snapshot, voice, tick);
  const tone = materialTone(snapshot, spec, tick);
  const impact = materialImpact(snapshot, spec, tick);
  const decay = materialDecay(
    snapshot,
    spec,
    tick,
    voice === "snare" ? 0.09 : 0.08,
    voice === "snare" ? 0.42 : 0.34,
  );
  const amp = velocityGain(velocity);

  const noise = context.createBufferSource();
  noise.buffer = graph.noiseBuffer;
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value =
    voice === "snare"
      ? 1050 + tone * 3800
      : 1200 + tone * 2800;
  filter.Q.value = 0.4 + spec.body * 0.9;
  const noiseGain = context.createGain();
  noiseGain.gain.setValueAtTime(MIN_GAIN, at);
  noiseGain.gain.linearRampToValueAtTime(
    amp * (0.18 + spec.noise * 0.62),
    at + 0.0009,
  );
  noiseGain.gain.exponentialRampToValueAtTime(
    MIN_GAIN,
    at + decay,
  );

  const body = context.createOscillator();
  body.type = "triangle";
  body.frequency.value =
    voice === "snare"
      ? 135 + spec.pitch * 115
      : 170 + spec.pitch * 120;
  const bodyGain = context.createGain();
  bodyGain.gain.setValueAtTime(MIN_GAIN, at);
  bodyGain.gain.linearRampToValueAtTime(
    amp * spec.body * (voice === "snare" ? 0.38 : 0.11) *
      (0.7 + impact * 0.35),
    at + 0.001,
  );
  bodyGain.gain.exponentialRampToValueAtTime(
    MIN_GAIN,
    at + Math.min(decay, 0.24),
  );

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(channelInput(graph, voice));
  body.connect(bodyGain);
  bodyGain.connect(channelInput(graph, voice));
  noise.start(at);
  body.start(at);
  noise.stop(at + decay + 0.05);
  body.stop(at + decay + 0.05);
}

function scheduleHat(
  graph: OfflineGraph,
  snapshot: RenderSnapshot,
  voice: "closedHat" | "openHat" | "crash",
  tick: number,
  at: number,
  velocity: number,
): void {
  const context = graph.context;
  const spec = resolveMaterial(snapshot, voice, tick);
  const tone = materialTone(snapshot, spec, tick);
  const isOpen = voice === "openHat";
  const isCrash = voice === "crash";
  const decay = isCrash
    ? materialDecay(snapshot, spec, tick, 0.45, 1.8)
    : isOpen
      ? materialDecay(snapshot, spec, tick, 0.16, 0.78)
      : materialDecay(snapshot, spec, tick, 0.022, 0.095);
  const amp = velocityGain(velocity);

  const noise = context.createBufferSource();
  noise.buffer = graph.noiseBuffer;
  const highpass = context.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value =
    (isCrash ? 2600 : 4300) + tone * (isCrash ? 2600 : 3600);
  const band = context.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value =
    (isCrash ? 5200 : 7000) + spec.character * 2500;
  band.Q.value = isCrash ? 0.32 : 0.55;
  const gain = context.createGain();
  gain.gain.setValueAtTime(MIN_GAIN, at);
  gain.gain.linearRampToValueAtTime(
    amp *
      (isCrash ? 0.35 : 0.14) *
      (0.6 + spec.noise * 0.65 + spec.air * 0.3),
    at + 0.0008,
  );
  gain.gain.exponentialRampToValueAtTime(
    MIN_GAIN,
    at + decay,
  );

  noise.connect(highpass);
  highpass.connect(band);
  band.connect(gain);
  gain.connect(channelInput(graph, voice));
  noise.start(at);
  noise.stop(at + decay + 0.08);
}

function scheduleTom(
  graph: OfflineGraph,
  snapshot: RenderSnapshot,
  tick: number,
  at: number,
  velocity: number,
): void {
  const context = graph.context;
  const voice: DrumVoiceId = "tom";
  const spec = resolveMaterial(snapshot, voice, tick);
  const tone = materialTone(snapshot, spec, tick);
  const impact = materialImpact(snapshot, spec, tick);
  const decay = materialDecay(snapshot, spec, tick, 0.18, 0.65);
  const amp = velocityGain(velocity);
  const base = 72 + spec.pitch * 110;

  const osc = context.createOscillator();
  osc.type = spec.body > 0.65 ? "sine" : "triangle";
  osc.frequency.setValueAtTime(base * (1.5 + impact), at);
  osc.frequency.exponentialRampToValueAtTime(base, at + 0.08);
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 800 + tone * 2600;
  const gain = context.createGain();
  gain.gain.setValueAtTime(MIN_GAIN, at);
  gain.gain.linearRampToValueAtTime(
    amp * (0.35 + spec.body * 0.55),
    at + 0.0015,
  );
  gain.gain.exponentialRampToValueAtTime(MIN_GAIN, at + decay);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(channelInput(graph, voice));
  osc.start(at);
  osc.stop(at + decay + 0.05);
}

function schedulePercussion(
  graph: OfflineGraph,
  snapshot: RenderSnapshot,
  tick: number,
  at: number,
  velocity: number,
): void {
  const context = graph.context;
  const voice: DrumVoiceId = "percussion";
  const spec = resolveMaterial(snapshot, voice, tick);
  const tone = materialTone(snapshot, spec, tick);
  const decay = materialDecay(snapshot, spec, tick, 0.05, 0.32);
  const amp = velocityGain(velocity);
  const carrier = context.createOscillator();
  const modulator = context.createOscillator();
  const modGain = context.createGain();
  const carrierGain = context.createGain();

  const base = 180 + spec.pitch * 520;
  carrier.type = "sine";
  carrier.frequency.value = base;
  modulator.type = "sine";
  modulator.frequency.value = base * (1.4 + spec.character * 3.2);
  modGain.gain.value = 18 + spec.character * 120;
  modulator.connect(modGain);
  modGain.connect(carrier.frequency);

  carrierGain.gain.setValueAtTime(MIN_GAIN, at);
  carrierGain.gain.linearRampToValueAtTime(
    amp * (0.22 + spec.body * 0.5),
    at + 0.001,
  );
  carrierGain.gain.exponentialRampToValueAtTime(
    MIN_GAIN,
    at + decay,
  );

  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 900 + tone * 3600;
  filter.Q.value = 0.5 + spec.character * 2;

  carrier.connect(filter);
  filter.connect(carrierGain);
  carrierGain.connect(channelInput(graph, voice));
  carrier.start(at);
  modulator.start(at);
  carrier.stop(at + decay + 0.04);
  modulator.stop(at + decay + 0.04);
}

function scheduleSynthVoice(
  graph: OfflineGraph,
  snapshot: RenderSnapshot,
  voice: DrumVoiceId,
  tick: number,
  at: number,
  velocity: number,
): void {
  switch (voice) {
    case "kick":
      scheduleKick(graph, snapshot, voice, tick, at, velocity);
      break;
    case "snare":
    case "clap":
      scheduleSnareLike(graph, snapshot, voice, tick, at, velocity);
      break;
    case "closedHat":
    case "openHat":
    case "crash":
      scheduleHat(graph, snapshot, voice, tick, at, velocity);
      break;
    case "tom":
      scheduleTom(graph, snapshot, tick, at, velocity);
      break;
    case "percussion":
      schedulePercussion(graph, snapshot, tick, at, velocity);
      break;
  }
}

async function decodeSamples(
  context: OfflineAudioContext,
  snapshot: RenderSnapshot,
): Promise<Map<string, AudioBuffer>> {
  const buffers = new Map<string, AudioBuffer>();

  await Promise.all(
    snapshot.samples.map(async (sample) => {
      const buffer = await context.decodeAudioData(sample.bytes.slice(0));
      buffers.set(sample.assetId, buffer);
    }),
  );

  return buffers;
}

function reversedBuffer(
  context: OfflineAudioContext,
  source: AudioBuffer,
): AudioBuffer {
  const buffer = context.createBuffer(
    source.numberOfChannels,
    source.length,
    source.sampleRate,
  );

  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    const from = source.getChannelData(channel);
    const to = buffer.getChannelData(channel);
    for (let index = 0; index < from.length; index += 1) {
      to[index] = from[from.length - 1 - index] ?? 0;
    }
  }

  return buffer;
}

function scheduleSample(
  graph: OfflineGraph,
  buffers: Map<string, AudioBuffer>,
  voice: DrumVoiceId,
  spec: SampleSoundSpec,
  at: number,
  velocity: number,
): number {
  const sourceBuffer = buffers.get(spec.assetId);
  if (!sourceBuffer) return 0;

  const context = graph.context;
  const buffer = spec.reversed
    ? reversedBuffer(context, sourceBuffer)
    : sourceBuffer;
  const selectedStart = Math.max(
    0,
    Math.min(
      Math.max(0, buffer.duration - 0.001),
      spec.trimStartSeconds,
    ),
  );
  const requestedEnd = spec.trimEndSeconds ?? buffer.duration;
  const selectedEnd = Math.max(
    selectedStart + 0.001,
    Math.min(buffer.duration, requestedEnd),
  );
  const sourceDuration = Math.max(0.001, selectedEnd - selectedStart);
  const start = spec.reversed
    ? Math.max(0, buffer.duration - selectedEnd)
    : selectedStart;
  const playbackRate = Math.pow(
    2,
    Math.max(-24, Math.min(24, spec.pitchSemitones)) / 12,
  );
  const audibleDuration = sourceDuration / playbackRate;

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.setValueAtTime(playbackRate, at);
  const gain = context.createGain();
  const peak = Math.max(
    MIN_GAIN,
    clamp01(velocity) * dbToGain(spec.gainDb),
  );
  gain.gain.setValueAtTime(MIN_GAIN, at);
  gain.gain.linearRampToValueAtTime(
    peak,
    at + Math.min(0.0015, audibleDuration * 0.12),
  );
  if (audibleDuration > 0.012) {
    gain.gain.setValueAtTime(
      peak,
      Math.max(at + 0.002, at + audibleDuration - 0.006),
    );
    gain.gain.exponentialRampToValueAtTime(
      MIN_GAIN,
      at + audibleDuration,
    );
  } else {
    gain.gain.exponentialRampToValueAtTime(
      MIN_GAIN,
      at + Math.max(0.002, audibleDuration),
    );
  }

  source.connect(gain);
  gain.connect(channelInput(graph, voice));
  source.start(at, start, sourceDuration);
  source.stop(at + audibleDuration + 0.012);
  return audibleDuration;
}

function scheduleSound(
  graph: OfflineGraph,
  snapshot: RenderSnapshot,
  buffers: Map<string, AudioBuffer>,
  slot: RenderSlotSound,
  tick: number,
  at: number,
  velocity: number,
  stemVoice?: DrumVoiceId,
): number {
  let longest = 0;

  if (slot.spec.kind === "synth") {
    const voice = synthVoiceFromSpec(slot.spec, slot.resolvedVoice);
    if (!stemVoice || voice === stemVoice) {
      scheduleSynthVoice(graph, snapshot, voice, tick, at, velocity);
      longest = Math.max(longest, 2);
    }
    return longest;
  }

  if (slot.spec.kind === "sample") {
    if (!stemVoice || slot.resolvedVoice === stemVoice) {
      longest = Math.max(
        longest,
        scheduleSample(
          graph,
          buffers,
          slot.resolvedVoice,
          slot.spec,
          at,
          velocity,
        ),
      );
    }
    return longest;
  }

  const synthScale = dbToGain(slot.spec.synthGainDb);
  for (const layer of slot.spec.layers) {
    const voice = synthVoiceFromSpec(layer, slot.resolvedVoice);
    if (!stemVoice || voice === stemVoice) {
      scheduleSynthVoice(
        graph,
        snapshot,
        voice,
        tick,
        at,
        velocity * synthScale,
      );
      longest = Math.max(longest, 2);
    }
  }

  if (!stemVoice || slot.resolvedVoice === stemVoice) {
    longest = Math.max(
      longest,
      scheduleSample(
        graph,
        buffers,
        slot.resolvedVoice,
        slot.spec.sample,
        at,
        velocity,
      ),
    );
  }

  return longest;
}

function sectionEnergy(
  occurrence: RenderOccurrence,
  tick: number,
): number {
  if (
    occurrence.sectionStartTick === undefined ||
    occurrence.sectionLengthTicks === undefined ||
    occurrence.energyStart === undefined ||
    occurrence.energyEnd === undefined
  ) {
    return 1;
  }

  const progress = clamp01(
    (tick - occurrence.sectionStartTick) /
      Math.max(1, occurrence.sectionLengthTicks),
  );
  return (
    occurrence.energyStart +
    (occurrence.energyEnd - occurrence.energyStart) * progress
  );
}

function scheduleSidechain(
  graph: OfflineGraph,
  snapshot: RenderSnapshot,
  tick: number,
  at: number,
): void {
  for (const pad of DRUM_PADS) {
    if (pad.voice === "kick") continue;
    const channel = graph.channels.get(pad.voice);
    if (!channel) continue;

    const amount = resolveMixerChannel(
      snapshot,
      pad.voice,
      tick,
    ).sidechain;
    if (amount <= 0.001) continue;

    const minimum = Math.max(0.28, 1 - amount * 0.7);
    const release = 0.055 + amount * 0.16;
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

function occurrenceEvents(
  snapshot: RenderSnapshot,
  occurrence: RenderOccurrence,
  renderStartTick: number,
  renderEndTick: number,
): Array<{
  tick: number;
  hit: PatternPlaybackHit;
  occurrence: RenderOccurrence;
}> {
  const result: Array<{
    tick: number;
    hit: PatternPlaybackHit;
    occurrence: RenderOccurrence;
  }> = [];
  const steps = Math.max(
    1,
    Math.round(occurrence.pattern.lengthTicks / FOUNDATION_STEP_TICKS),
  );

  for (let step = 0; step < steps; step += 1) {
    const tick =
      occurrence.startTick + step * FOUNDATION_STEP_TICKS;
    if (tick < renderStartTick || tick >= renderEndTick) continue;

    const hits = getPatternHitsForAbsoluteStep(
      occurrence.pattern,
      step,
      occurrence.occurrenceIndex * 1024,
    );

    for (const hit of hits) {
      result.push({ tick, hit, occurrence });
    }
  }

  return result;
}

function estimateAutoTail(
  snapshot: RenderSnapshot,
  buffers: Map<string, AudioBuffer>,
): number {
  let longest = 0.75;

  for (const slot of snapshot.slotSounds) {
    const sample =
      slot.spec.kind === "sample"
        ? slot.spec
        : slot.spec.kind === "hybrid"
          ? slot.spec.sample
          : undefined;
    if (!sample) continue;

    const buffer = buffers.get(sample.assetId);
    if (!buffer) continue;
    const start = Math.max(0, sample.trimStartSeconds);
    const end = Math.min(
      buffer.duration,
      sample.trimEndSeconds ?? buffer.duration,
    );
    const rate = Math.pow(
      2,
      Math.max(-24, Math.min(24, sample.pitchSemitones)) / 12,
    );
    longest = Math.max(longest, Math.max(0, end - start) / rate);
  }

  return Math.max(0.35, Math.min(4, longest + 0.72));
}

function analyze(buffer: AudioBuffer): RenderAnalysis {
  let peak = 0;
  let sumSquares = 0;
  let samples = 0;
  let clippedSampleCount = 0;

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      const value = data[index] ?? 0;
      const abs = Math.abs(value);
      peak = Math.max(peak, abs);
      sumSquares += value * value;
      samples += 1;
      if (abs > 1) clippedSampleCount += 1;
    }
  }

  const rms = Math.sqrt(sumSquares / Math.max(1, samples));
  const estimatedLufs =
    rms > 0.000001 ? 20 * Math.log10(rms) - 0.691 : -120;

  return {
    durationSeconds: buffer.duration,
    peak,
    rms,
    estimatedLufs,
    clippedSampleCount,
  };
}

function trimPrefix(
  context: OfflineAudioContext,
  buffer: AudioBuffer,
  prefixSamples: number,
): AudioBuffer {
  if (prefixSamples <= 0) return buffer;
  const length = Math.max(1, buffer.length - prefixSamples);
  const trimmed = context.createBuffer(
    buffer.numberOfChannels,
    length,
    buffer.sampleRate,
  );

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const source = buffer.getChannelData(channel);
    const target = trimmed.getChannelData(channel);
    target.set(
      source.subarray(
        Math.min(prefixSamples, source.length),
        Math.min(prefixSamples + length, source.length),
      ),
    );
  }

  return trimmed;
}

export async function renderSnapshot(
  snapshot: RenderSnapshot,
  options: RenderOptions,
): Promise<RenderResult> {
  const secondsPerTickValue = secondsPerTick(snapshot);
  const preRollTicks = Math.min(PPQ, snapshot.startTick);
  const renderStartTick = snapshot.startTick - preRollTicks;
  const prefixSeconds = preRollTicks * secondsPerTickValue;
  const rangeSeconds =
    (snapshot.endTick - snapshot.startTick) * secondsPerTickValue;

  const provisionalTail =
    options.tailMode === "fixed"
      ? Math.max(0, Math.min(10, options.fixedTailSeconds ?? 0))
      : options.tailMode === "none"
        ? 0
        : 4;

  const provisionalLength = Math.max(
    1,
    Math.ceil(
      (prefixSeconds + rangeSeconds + provisionalTail) *
        options.sampleRate,
    ),
  );

  const context = new OfflineAudioContext(
    2,
    provisionalLength,
    options.sampleRate,
  );
  const buffers = await decodeSamples(context, snapshot);
  const tailSeconds =
    options.tailMode === "auto"
      ? estimateAutoTail(snapshot, buffers)
      : provisionalTail;

  const graph = graphFor(
    context,
    snapshot,
    options.includeMastering,
  );

  const controlStartTick = renderStartTick;
  const controlEndTick = snapshot.endTick;
  for (
    let tick = controlStartTick;
    tick <= controlEndTick;
    tick += FOUNDATION_STEP_TICKS
  ) {
    const at =
      (tick - renderStartTick) * secondsPerTickValue;
    configureAtTick(graph, snapshot, tick, Math.max(0, at));
  }

  let longestScheduledTail = 0;

  for (const occurrence of snapshot.occurrences) {
    const events = occurrenceEvents(
      snapshot,
      occurrence,
      renderStartTick,
      snapshot.endTick,
    );

    for (const event of events) {
      const swingUs = swingOffsetUsForStep(
        event.hit.laneStepIndex,
        snapshot.bpm,
        occurrence.pattern.groove?.swing ?? 0,
      );
      const eventTime =
        (event.tick - renderStartTick) * secondsPerTickValue +
        (swingUs + event.hit.timingOffsetUs) / 1_000_000;
      if (eventTime < 0) continue;

      const energy = sectionEnergy(event.occurrence, event.tick);
      const velocity = Math.min(
        1,
        event.hit.velocity *
          (event.occurrence.sectionId
            ? 0.68 + energy * 0.42
            : 1),
      );
      const ratchets = Math.max(1, event.hit.ratchetCount);
      const stepSeconds = 60 / snapshot.bpm / 4;
      const ratchetSpacing =
        ratchets > 1 ? (stepSeconds * 0.82) / ratchets : 0;
      const slot = findSlot(
        snapshot,
        event.hit.kitSlotId,
        event.hit.voice,
      );

      for (let index = 0; index < ratchets; index += 1) {
        const at = eventTime + index * ratchetSpacing;
        const ratchetVelocity =
          velocity * Math.max(0.58, 1 - index * 0.09);

        if (event.hit.voice === "kick" && index === 0) {
          scheduleSidechain(graph, snapshot, event.tick, at);
        }

        longestScheduledTail = Math.max(
          longestScheduledTail,
          scheduleSound(
            graph,
            snapshot,
            buffers,
            slot,
            event.tick,
            at,
            ratchetVelocity,
            options.stemVoice,
          ),
        );

        if (index === 0 && event.hit.flamOffsetUs > 0) {
          longestScheduledTail = Math.max(
            longestScheduledTail,
            scheduleSound(
              graph,
              snapshot,
              buffers,
              slot,
              event.tick,
              at + event.hit.flamOffsetUs / 1_000_000,
              ratchetVelocity * 0.72,
              options.stemVoice,
            ),
          );
        }
      }
    }
  }

  const rendered = await context.startRendering();
  const wantedSeconds =
    prefixSeconds +
    rangeSeconds +
    Math.max(
      tailSeconds,
      options.tailMode === "none" ? 0 : Math.min(4, longestScheduledTail),
    );
  const wantedSamples = Math.min(
    rendered.length,
    Math.max(1, Math.ceil(wantedSeconds * rendered.sampleRate)),
  );
  const prefixSamples = Math.min(
    wantedSamples - 1,
    Math.round(prefixSeconds * rendered.sampleRate),
  );

  let bounded = rendered;
  if (wantedSamples < rendered.length) {
    bounded = context.createBuffer(
      rendered.numberOfChannels,
      wantedSamples,
      rendered.sampleRate,
    );
    for (let channel = 0; channel < rendered.numberOfChannels; channel += 1) {
      bounded
        .getChannelData(channel)
        .set(rendered.getChannelData(channel).subarray(0, wantedSamples));
    }
  }

  const audioBuffer = trimPrefix(context, bounded, prefixSamples);

  return {
    snapshotId: snapshot.id,
    sampleRate: audioBuffer.sampleRate,
    channels: audioBuffer.numberOfChannels,
    audioBuffer,
    analysis: analyze(audioBuffer),
    renderedStartTick: snapshot.startTick,
    renderedEndTick: snapshot.endTick,
    tailSeconds,
    stemVoice: options.stemVoice,
  };
}
