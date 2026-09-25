import type { AssetReference } from "../domain/contracts";
import { errorMessage } from "../runtime/errors";

export type SampleDecodeStatus =
  | "raw"
  | "decoding"
  | "ready"
  | "error";

export interface SampleAssetState {
  reference: AssetReference;
  decodeStatus: SampleDecodeStatus;
  waveform: number[];
  lastError?: string;
}

export interface SampleAssetSnapshot {
  assets: SampleAssetState[];
  revision: number;
}

type Listener = () => void;

const MAX_SAMPLE_BYTES = 64 * 1024 * 1024;
const WAVEFORM_BINS = 96;

function cloneAsset(asset: SampleAssetState): SampleAssetState {
  return {
    reference: { ...asset.reference },
    decodeStatus: asset.decodeStatus,
    waveform: [...asset.waveform],
    lastError: asset.lastError,
  };
}

function isSupportedAudioFile(file: File): boolean {
  if (file.type.startsWith("audio/")) return true;
  const name = file.name.toLowerCase();
  return [
    ".wav",
    ".mp3",
    ".ogg",
    ".oga",
    ".m4a",
    ".aac",
    ".flac",
    ".webm",
  ].some((extension) => name.endsWith(extension));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

function waveformFromBuffer(buffer: AudioBuffer): number[] {
  const bins = Math.min(WAVEFORM_BINS, Math.max(12, buffer.length));
  const peaks = Array.from({ length: bins }, () => 0);
  const bucketSize = Math.max(1, Math.floor(buffer.length / bins));

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);

    for (let bin = 0; bin < bins; bin += 1) {
      const start = bin * bucketSize;
      const end =
        bin === bins - 1
          ? data.length
          : Math.min(data.length, start + bucketSize);
      let peak = 0;

      for (let index = start; index < end; index += 1) {
        peak = Math.max(peak, Math.abs(data[index] ?? 0));
      }

      peaks[bin] = Math.max(peaks[bin], peak);
    }
  }

  const maxPeak = Math.max(0.000001, ...peaks);
  return peaks.map((peak) => Math.min(1, peak / maxPeak));
}

export class SampleAssetStore {
  private listeners = new Set<Listener>();
  private states = new Map<string, SampleAssetState>();
  private bytes = new Map<string, ArrayBuffer>();
  private decoded = new WeakMap<
    AudioContext,
    Map<string, AudioBuffer>
  >();
  private reversed = new WeakMap<
    AudioContext,
    Map<string, AudioBuffer>
  >();
  private decodePromises = new WeakMap<
    AudioContext,
    Map<string, Promise<AudioBuffer>>
  >();
  private knownContexts = new Set<AudioContext>();
  private revision = 0;
  private snapshot: SampleAssetSnapshot = this.buildSnapshot();

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): SampleAssetSnapshot => this.snapshot;

  clearProjectAssets(): void {
    if (this.states.size === 0 && this.bytes.size === 0) return;
    this.states.clear();
    this.bytes.clear();
    this.decoded = new WeakMap();
    this.reversed = new WeakMap();
    this.decodePromises = new WeakMap();
    this.knownContexts.clear();
    this.publish();
  }

  async importFile(file: File): Promise<SampleAssetState> {
    if (!isSupportedAudioFile(file)) {
      throw new Error("Choose a browser-decodable audio file.");
    }

    return this.importBytes(
      await file.arrayBuffer(),
      file.name,
      file.type || "audio/unknown",
    );
  }

  async importBytes(
    dataInput: ArrayBuffer,
    name: string,
    mimeType = "audio/wav",
    metadata?: {
      origin?: AssetReference["origin"];
      bundledSampleId?: string;
    },
  ): Promise<SampleAssetState> {
    const data = dataInput.slice(0);

    if (data.byteLength <= 0) {
      throw new Error("The audio asset is empty.");
    }

    if (data.byteLength > MAX_SAMPLE_BYTES) {
      throw new Error("Sample files are limited to 64 MB.");
    }

    if (!globalThis.crypto?.subtle) {
      throw new Error("Web Crypto is required for deterministic sample IDs.");
    }

    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      data,
    );
    const contentHash = bytesToHex(new Uint8Array(digest));
    const id = "audio-" + contentHash.slice(0, 24);
    const existing = this.states.get(id);

    if (existing) {
      return cloneAsset(existing);
    }

    const state: SampleAssetState = {
      reference: {
        id,
        kind: "audio",
        mimeType,
        name: name.trim() || "Rendered Sample.wav",
        byteLength: data.byteLength,
        contentHash,
        origin: metadata?.origin ?? "user",
        bundledSampleId: metadata?.bundledSampleId,
      },
      decodeStatus: "raw",
      waveform: [],
    };

    this.bytes.set(id, data);
    this.states.set(id, state);
    this.publish();
    return cloneAsset(state);
  }

  restorePersistedAsset(
    stateInput: SampleAssetState,
    bytesInput: ArrayBuffer,
  ): void {
    const state = cloneAsset(stateInput);
    const bytes = bytesInput.slice(0);
    if (bytes.byteLength <= 0 || bytes.byteLength > MAX_SAMPLE_BYTES) {
      throw new Error("Persisted sample bytes are invalid.");
    }
    if (state.reference.id.length === 0) {
      throw new Error("Persisted sample ID is invalid.");
    }

    state.reference = {
      ...state.reference,
      byteLength: bytes.byteLength,
    };
    state.decodeStatus = "raw";
    state.lastError = undefined;
    this.bytes.set(state.reference.id, bytes);
    this.states.set(state.reference.id, state);
    this.publish();
  }

  getAsset(assetId: string): SampleAssetState | undefined {
    const asset = this.states.get(assetId);
    return asset ? cloneAsset(asset) : undefined;
  }

  getRawBytes(assetId: string): ArrayBuffer | undefined {
    const data = this.bytes.get(assetId);
    return data ? data.slice(0) : undefined;
  }

  async ensureDecoded(
    context: AudioContext,
    assetId: string,
  ): Promise<AudioBuffer> {
    this.knownContexts.add(context);

    const cached = this.decoded.get(context)?.get(assetId);
    if (cached) return cached;

    let promises = this.decodePromises.get(context);
    if (!promises) {
      promises = new Map();
      this.decodePromises.set(context, promises);
    }

    const inFlight = promises.get(assetId);
    if (inFlight) return inFlight;

    const raw = this.bytes.get(assetId);
    const state = this.states.get(assetId);

    if (!raw || !state) {
      throw new Error("Sample asset is not available in this session.");
    }

    state.decodeStatus = "decoding";
    state.lastError = undefined;
    this.publish();

    const promise = context
      .decodeAudioData(raw.slice(0))
      .then((buffer) => {
        let decodedForContext = this.decoded.get(context);
        if (!decodedForContext) {
          decodedForContext = new Map();
          this.decoded.set(context, decodedForContext);
        }
        decodedForContext.set(assetId, buffer);

        state.decodeStatus = "ready";
        state.reference = {
          ...state.reference,
          durationSeconds: buffer.duration,
          sampleRate: buffer.sampleRate,
          channels: buffer.numberOfChannels,
        };
        state.waveform = waveformFromBuffer(buffer);
        state.lastError = undefined;
        this.publish();
        return buffer;
      })
      .catch((error: unknown) => {
        state.decodeStatus = "error";
        state.lastError =
          errorMessage(error);
        this.publish();
        throw error;
      })
      .finally(() => {
        promises?.delete(assetId);
      });

    promises.set(assetId, promise);
    return promise;
  }

  getPlaybackBuffer(
    context: AudioContext,
    assetId: string,
    reverse: boolean,
  ): AudioBuffer | undefined {
    this.knownContexts.add(context);

    const decoded = this.decoded.get(context)?.get(assetId);
    if (!decoded) return undefined;
    if (!reverse) return decoded;

    let reversedForContext = this.reversed.get(context);
    if (!reversedForContext) {
      reversedForContext = new Map();
      this.reversed.set(context, reversedForContext);
    }

    const cached = reversedForContext.get(assetId);
    if (cached) return cached;

    const reversed = context.createBuffer(
      decoded.numberOfChannels,
      decoded.length,
      decoded.sampleRate,
    );

    for (
      let channel = 0;
      channel < decoded.numberOfChannels;
      channel += 1
    ) {
      const source = decoded.getChannelData(channel);
      const target = reversed.getChannelData(channel);

      for (let index = 0; index < source.length; index += 1) {
        target[index] = source[source.length - 1 - index] ?? 0;
      }
    }

    reversedForContext.set(assetId, reversed);
    return reversed;
  }

  remove(assetId: string): void {
    if (!this.states.has(assetId)) return;

    this.states.delete(assetId);
    this.bytes.delete(assetId);

    for (const context of this.knownContexts) {
      this.decoded.get(context)?.delete(assetId);
      this.reversed.get(context)?.delete(assetId);
      this.decodePromises.get(context)?.delete(assetId);
    }

    this.publish();
  }

  private publish(): void {
    this.revision += 1;
    this.snapshot = this.buildSnapshot();

    for (const listener of this.listeners) {
      listener();
    }
  }

  private buildSnapshot(): SampleAssetSnapshot {
    return {
      assets: [...this.states.values()]
        .map(cloneAsset)
        .sort((a, b) =>
          a.reference.name.localeCompare(b.reference.name),
        ),
      revision: this.revision,
    };
  }
}

export const sampleAssetStore = new SampleAssetStore();
