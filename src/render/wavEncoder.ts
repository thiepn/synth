export type WavBitDepth = 16 | 24 | "32f";

export interface WavEncodeOptions {
  bitDepth: WavBitDepth;
  dither: boolean;
}

function clampSample(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

function xorshift32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function writeAscii(
  view: DataView,
  offset: number,
  value: string,
): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index) & 0xff);
  }
}

function tpdf(random: () => number): number {
  return random() - random();
}

function writeInt24(
  view: DataView,
  offset: number,
  value: number,
): void {
  let integer = value;
  if (integer < 0) integer += 0x1000000;
  view.setUint8(offset, integer & 0xff);
  view.setUint8(offset + 1, (integer >>> 8) & 0xff);
  view.setUint8(offset + 2, (integer >>> 16) & 0xff);
}

export function encodeWav(
  buffer: AudioBuffer,
  options: WavEncodeOptions,
): Blob {
  const channels = Math.max(1, buffer.numberOfChannels);
  const sampleRate = Math.max(1, Math.round(buffer.sampleRate));
  const frames = Math.max(1, buffer.length);
  const floatOutput = options.bitDepth === "32f";
  const bitsPerSample =
    options.bitDepth === "32f" ? 32 : options.bitDepth;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = channels * bytesPerSample;
  const dataBytes = frames * blockAlign;
  const output = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(output);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, floatOutput ? 3 : 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  const data = Array.from({ length: channels }, (_, channel) =>
    buffer.getChannelData(
      Math.min(channel, buffer.numberOfChannels - 1),
    ),
  );
  const random = xorshift32(
    (buffer.length ^
      sampleRate ^
      channels ^
      bitsPerSample ^
      0x53594e54) >>>
      0,
  );

  let offset = 44;

  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      let sample = clampSample(data[channel]?.[frame] ?? 0);

      if (floatOutput) {
        view.setFloat32(offset, sample, true);
        offset += 4;
        continue;
      }

      if (options.bitDepth === 16) {
        if (options.dither) {
          sample += tpdf(random) / 65536;
        }
        sample = clampSample(sample);
        const integer =
          sample < 0
            ? Math.round(sample * 32768)
            : Math.round(sample * 32767);
        view.setInt16(offset, integer, true);
        offset += 2;
        continue;
      }

      if (options.dither) {
        sample += tpdf(random) / 16777216;
      }
      sample = clampSample(sample);
      const integer =
        sample < 0
          ? Math.round(sample * 8388608)
          : Math.round(sample * 8388607);
      writeInt24(view, offset, integer);
      offset += 3;
    }
  }

  return new Blob([output], { type: "audio/wav" });
}

export function sanitizeExportName(name: string): string {
  const safe = name
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");

  return safe.slice(0, 96) || "Synth Export";
}

export function triggerBlobDownload(
  blob: Blob,
  filename: string,
): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  globalThis.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1_000);
}
