import { audioTransport } from "../audio/AudioTransport";
import { sampleAssetStore } from "../audio/SampleAssetStore";
import type { SampleSoundSpec } from "../domain/contracts";
import { encodeWav } from "../render/wavEncoder";

const MIN_GAIN = 0.0001;

function dbToGain(db: number): number {
  if (!Number.isFinite(db)) return 1;
  return Math.pow(10, db / 20);
}

function clampRate(spec: SampleSoundSpec): number {
  const pitchRate = Math.pow(
    2,
    Math.max(-24, Math.min(24, spec.pitchSemitones)) / 12,
  );
  return Math.max(
    0.125,
    Math.min(8, pitchRate * (spec.playbackRate ?? 1)),
  );
}

function copyReversed(
  context: BaseAudioContext,
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

function region(
  buffer: AudioBuffer,
  spec: SampleSoundSpec,
): {
  start: number;
  sourceDuration: number;
  playbackRate: number;
  audibleDuration: number;
} {
  const selectedStart = Math.max(
    0,
    Math.min(
      Math.max(0, buffer.duration - 0.001),
      spec.trimStartSeconds,
    ),
  );
  const selectedEnd = Math.max(
    selectedStart + 0.001,
    Math.min(
      buffer.duration,
      spec.trimEndSeconds ?? buffer.duration,
    ),
  );
  const sourceDuration = selectedEnd - selectedStart;
  const playbackRate = clampRate(spec);
  const start = spec.reversed
    ? Math.max(0, buffer.duration - selectedEnd)
    : selectedStart;

  return {
    start,
    sourceDuration,
    playbackRate,
    audibleDuration: sourceDuration / playbackRate,
  };
}

function envelope(
  gain: AudioParam,
  at: number,
  audibleDuration: number,
  peak: number,
  spec: SampleSoundSpec,
): void {
  const stopAt = at + audibleDuration;
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

  gain.setValueAtTime(MIN_GAIN, at);
  gain.linearRampToValueAtTime(Math.max(MIN_GAIN, peak), at + fadeIn);

  if (audibleDuration > fadeIn + fadeOut + 0.001) {
    gain.setValueAtTime(Math.max(MIN_GAIN, peak), stopAt - fadeOut);
  }
  gain.exponentialRampToValueAtTime(MIN_GAIN, stopAt);
}

export class SampleLabPlayer {
  private source: AudioBufferSourceNode | undefined;
  private gain: GainNode | undefined;

  stop(): void {
    const context = audioTransport.getAudioContext();
    const now = context?.currentTime ?? 0;

    if (this.gain && context) {
      try {
        this.gain.gain.cancelScheduledValues(now);
        this.gain.gain.setValueAtTime(
          Math.max(MIN_GAIN, this.gain.gain.value),
          now,
        );
        this.gain.gain.exponentialRampToValueAtTime(
          MIN_GAIN,
          now + 0.012,
        );
      } catch {
        // The source may already have ended.
      }
    }

    try {
      this.source?.stop(now + 0.014);
    } catch {
      // The source may already have ended.
    }

    this.source = undefined;
    this.gain = undefined;
  }

  async play(
    spec: SampleSoundSpec,
    velocity = 1,
    loop = false,
  ): Promise<number> {
    const context = await audioTransport.unlockAudio();
    await sampleAssetStore.ensureDecoded(context, spec.assetId);
    const buffer = sampleAssetStore.getPlaybackBuffer(
      context,
      spec.assetId,
      spec.reversed,
    );
    if (!buffer) {
      throw new Error("Sample buffer is not ready.");
    }

    this.stop();

    const selection = region(buffer, spec);
    const at = context.currentTime + 0.008;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(selection.playbackRate, at);
    source.loop = loop;
    if (loop) {
      source.loopStart = selection.start;
      source.loopEnd = selection.start + selection.sourceDuration;
    }

    const gain = context.createGain();
    const peak =
      Math.max(0.01, Math.min(1, velocity)) *
      dbToGain(spec.gainDb);
    if (loop) {
      const fadeIn = Math.max(
        0.0005,
        Math.min(
          selection.audibleDuration * 0.45,
          spec.fadeInSeconds ?? 0.003,
        ),
      );
      gain.gain.setValueAtTime(MIN_GAIN, at);
      gain.gain.linearRampToValueAtTime(
        Math.max(MIN_GAIN, peak),
        at + fadeIn,
      );
    } else {
      envelope(
        gain.gain,
        at,
        selection.audibleDuration,
        peak,
        spec,
      );
    }

    source.connect(gain);
    gain.connect(context.destination);
    if (loop) {
      source.start(at, selection.start);
    } else {
      source.start(
        at,
        selection.start,
        selection.sourceDuration,
      );
      source.stop(at + selection.audibleDuration + 0.02);
    }

    source.onended = () => {
      if (this.source === source) {
        this.source = undefined;
        this.gain = undefined;
      }
    };

    this.source = source;
    this.gain = gain;
    return selection.audibleDuration;
  }
}

export async function renderSampleSpec(
  spec: SampleSoundSpec,
  sampleRate = 48_000,
): Promise<AudioBuffer> {
  const raw = sampleAssetStore.getRawBytes(spec.assetId);
  if (!raw) {
    throw new Error("The source sample bytes are not available.");
  }

  const decodeContext = new OfflineAudioContext(2, 1, sampleRate);
  const decoded = await decodeContext.decodeAudioData(raw.slice(0));
  const sourceBuffer = spec.reversed
    ? copyReversed(decodeContext, decoded)
    : decoded;
  const selection = region(sourceBuffer, spec);
  const frames = Math.max(
    1,
    Math.ceil(selection.audibleDuration * sampleRate),
  );
  const context = new OfflineAudioContext(
    Math.min(2, Math.max(1, sourceBuffer.numberOfChannels)),
    frames,
    sampleRate,
  );

  const buffer = spec.reversed
    ? copyReversed(context, decoded)
    : decoded;
  const resolved = region(buffer, spec);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = resolved.playbackRate;
  const gain = context.createGain();
  envelope(
    gain.gain,
    0,
    resolved.audibleDuration,
    dbToGain(spec.gainDb),
    spec,
  );
  source.connect(gain);
  gain.connect(context.destination);
  source.start(0, resolved.start, resolved.sourceDuration);
  source.stop(resolved.audibleDuration);

  return context.startRendering();
}

export async function renderSampleSpecToAsset(
  spec: SampleSoundSpec,
  name: string,
): Promise<string> {
  const rendered = await renderSampleSpec(spec, 48_000);
  const wav = encodeWav(rendered, {
    bitDepth: 24,
    dither: true,
  });
  const state = await sampleAssetStore.importBytes(
    await wav.arrayBuffer(),
    name.endsWith(".wav") ? name : name + ".wav",
    "audio/wav",
  );
  const context = await audioTransport.unlockAudio();
  await sampleAssetStore.ensureDecoded(context, state.reference.id);
  return state.reference.id;
}

export const sampleLabPlayer = new SampleLabPlayer();
