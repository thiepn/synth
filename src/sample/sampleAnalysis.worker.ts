/// <reference lib="webworker" />

import {
  analyzeSampleChannels,
  type SampleAnalysis,
} from "./sampleAnalysis";

interface AnalyzeRequest {
  id: number;
  sampleRate: number;
  waveformBins: number;
  channels: ArrayBuffer[];
}

interface AnalyzeSuccess {
  id: number;
  ok: true;
  analysis: SampleAnalysis;
}

interface AnalyzeFailure {
  id: number;
  ok: false;
  error: string;
}

self.onmessage = (
  event: MessageEvent<AnalyzeRequest>,
) => {
  const request = event.data;

  try {
    const channels = request.channels.map(
      (buffer) => new Float32Array(buffer),
    );
    const analysis = analyzeSampleChannels(
      channels,
      request.sampleRate,
      request.waveformBins,
    );

    self.postMessage({
      id: request.id,
      ok: true,
      analysis,
    } satisfies AnalyzeSuccess);
  } catch (error) {
    self.postMessage({
      id: request.id,
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    } satisfies AnalyzeFailure);
  }
};
