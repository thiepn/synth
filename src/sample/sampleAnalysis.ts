export interface SampleAnalysis {
  waveform: number[];
  transientsSeconds: number[];
  peak: number;
  rms: number;
  durationSeconds: number;
}

export interface SampleSliceRange {
  startSeconds: number;
  endSeconds: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function monoAt(buffer: AudioBuffer, index: number): number {
  let value = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    value += buffer.getChannelData(channel)[index] ?? 0;
  }
  return value / Math.max(1, buffer.numberOfChannels);
}

export function analyzeSampleBuffer(
  buffer: AudioBuffer,
  waveformBins = 512,
): SampleAnalysis {
  const bins = Math.max(64, Math.min(2048, Math.round(waveformBins)));
  const waveform = Array.from({ length: bins }, () => 0);
  const bucketSize = Math.max(1, Math.floor(buffer.length / bins));

  let peak = 0;
  let sumSquares = 0;
  let sampleCount = 0;

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      const value = data[index] ?? 0;
      const abs = Math.abs(value);
      peak = Math.max(peak, abs);
      sumSquares += value * value;
      sampleCount += 1;
    }

    for (let bin = 0; bin < bins; bin += 1) {
      const start = bin * bucketSize;
      const end =
        bin === bins - 1
          ? data.length
          : Math.min(data.length, start + bucketSize);
      let localPeak = 0;
      for (let index = start; index < end; index += 1) {
        localPeak = Math.max(localPeak, Math.abs(data[index] ?? 0));
      }
      waveform[bin] = Math.max(waveform[bin] ?? 0, localPeak);
    }
  }

  const maximum = Math.max(0.000001, ...waveform);
  const normalizedWaveform = waveform.map((value) =>
    Math.max(0, Math.min(1, value / maximum)),
  );

  const windowSize = Math.max(128, Math.round(buffer.sampleRate * 0.012));
  const hopSize = Math.max(64, Math.round(buffer.sampleRate * 0.006));
  const energies: number[] = [];
  const flux: number[] = [];

  for (let start = 0; start < buffer.length; start += hopSize) {
    const end = Math.min(buffer.length, start + windowSize);
    let energy = 0;
    for (let index = start; index < end; index += 1) {
      const value = monoAt(buffer, index);
      energy += value * value;
    }
    energies.push(Math.sqrt(energy / Math.max(1, end - start)));
  }

  for (let index = 0; index < energies.length; index += 1) {
    const previous = energies[index - 1] ?? 0;
    flux.push(Math.max(0, (energies[index] ?? 0) - previous));
  }

  const mean =
    flux.reduce((sum, value) => sum + value, 0) / Math.max(1, flux.length);
  const variance =
    flux.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) /
    Math.max(1, flux.length);
  const threshold = mean + Math.sqrt(variance) * 1.1;
  const minSpacingFrames = Math.max(
    1,
    Math.round((buffer.sampleRate * 0.055) / hopSize),
  );
  const candidates: Array<{ index: number; value: number }> = [];

  for (let index = 1; index < flux.length - 1; index += 1) {
    const value = flux[index] ?? 0;
    if (
      value >= threshold &&
      value >= (flux[index - 1] ?? 0) &&
      value >= (flux[index + 1] ?? 0)
    ) {
      candidates.push({ index, value });
    }
  }

  candidates.sort((a, b) => b.value - a.value);
  const accepted: number[] = [];

  for (const candidate of candidates) {
    if (
      accepted.every(
        (index) => Math.abs(index - candidate.index) >= minSpacingFrames,
      )
    ) {
      accepted.push(candidate.index);
    }
  }

  accepted.sort((a, b) => a - b);

  return {
    waveform: normalizedWaveform,
    transientsSeconds: accepted.map(
      (index) => (index * hopSize) / buffer.sampleRate,
    ),
    peak,
    rms: Math.sqrt(sumSquares / Math.max(1, sampleCount)),
    durationSeconds: buffer.duration,
  };
}

export function equalSliceRanges(
  startSeconds: number,
  endSeconds: number,
  count: number,
): SampleSliceRange[] {
  const start = Math.max(0, startSeconds);
  const end = Math.max(start + 0.001, endSeconds);
  const safeCount = Math.max(1, Math.min(32, Math.round(count)));
  const span = end - start;

  return Array.from({ length: safeCount }, (_, index) => ({
    startSeconds: start + (span * index) / safeCount,
    endSeconds: start + (span * (index + 1)) / safeCount,
  }));
}

export function beatSliceRanges(
  startSeconds: number,
  endSeconds: number,
  bpm: number,
  beatsPerSlice: number,
): SampleSliceRange[] {
  const start = Math.max(0, startSeconds);
  const end = Math.max(start + 0.001, endSeconds);
  const safeBpm = clamp(bpm, 30, 300);
  const safeBeats = clamp(beatsPerSlice, 0.25, 16);
  const length = (60 / safeBpm) * safeBeats;
  const ranges: SampleSliceRange[] = [];

  for (
    let cursor = start;
    cursor < end - 0.0005 && ranges.length < 32;
    cursor += length
  ) {
    ranges.push({
      startSeconds: cursor,
      endSeconds: Math.min(end, cursor + length),
    });
  }

  return ranges.length > 0
    ? ranges
    : [{ startSeconds: start, endSeconds: end }];
}

export function transientSliceRanges(
  startSeconds: number,
  endSeconds: number,
  transientSeconds: readonly number[],
  maximumSlices = 16,
): SampleSliceRange[] {
  const start = Math.max(0, startSeconds);
  const end = Math.max(start + 0.001, endSeconds);
  const max = Math.max(1, Math.min(32, Math.round(maximumSlices)));
  const cuts = [
    start,
    ...transientSeconds.filter(
      (value) => value > start + 0.015 && value < end - 0.015,
    ),
    end,
  ]
    .sort((a, b) => a - b)
    .filter((value, index, values) =>
      index === 0 || Math.abs(value - (values[index - 1] ?? 0)) > 0.012,
    );

  const ranges: SampleSliceRange[] = [];
  for (let index = 0; index < cuts.length - 1 && ranges.length < max; index += 1) {
    const from = cuts[index] ?? start;
    const to = cuts[index + 1] ?? end;
    if (to - from < 0.012) continue;
    ranges.push({ startSeconds: from, endSeconds: to });
  }

  if (ranges.length === 0) {
    return [{ startSeconds: start, endSeconds: end }];
  }

  const last = ranges.at(-1);
  if (last && last.endSeconds < end) {
    last.endSeconds = end;
  }

  return ranges;
}

export function normalizeGainDb(
  buffer: AudioBuffer,
  startSeconds: number,
  endSeconds: number,
  targetPeakDb = -1,
): number {
  const start = Math.max(
    0,
    Math.min(buffer.length - 1, Math.floor(startSeconds * buffer.sampleRate)),
  );
  const end = Math.max(
    start + 1,
    Math.min(buffer.length, Math.ceil(endSeconds * buffer.sampleRate)),
  );
  let peak = 0;

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = start; index < end; index += 1) {
      peak = Math.max(peak, Math.abs(data[index] ?? 0));
    }
  }

  if (peak <= 0.000001) return 0;
  const target = Math.pow(10, targetPeakDb / 20);
  return Math.max(-24, Math.min(24, 20 * Math.log10(target / peak)));
}
