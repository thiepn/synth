import {
  analyzeSampleBuffer,
  type SampleAnalysis,
} from "./sampleAnalysis";

interface WorkerResponse {
  id: number;
  ok: boolean;
  analysis?: SampleAnalysis;
  error?: string;
}

interface PendingRequest {
  resolve: (analysis: SampleAnalysis) => void;
  reject: (error: Error) => void;
}

const WORKER_THRESHOLD_SECONDS = 4;

class SampleAnalysisWorkerClient {
  private worker: Worker | undefined;
  private serial = 1;
  private pending = new Map<number, PendingRequest>();
  private disabled = false;

  async analyze(
    buffer: AudioBuffer,
    waveformBins = 512,
  ): Promise<SampleAnalysis> {
    if (
      this.disabled ||
      typeof Worker === "undefined" ||
      buffer.duration < WORKER_THRESHOLD_SECONDS
    ) {
      return analyzeSampleBuffer(
        buffer,
        waveformBins,
      );
    }

    try {
      const worker = this.ensureWorker();
      const id = this.serial++;
      const channels: ArrayBuffer[] = [];

      for (
        let channel = 0;
        channel < buffer.numberOfChannels;
        channel += 1
      ) {
        const source = buffer.getChannelData(channel);
        const copy = new Float32Array(source.length);
        copy.set(source);
        channels.push(copy.buffer);
      }

      return await new Promise<SampleAnalysis>(
        (resolve, reject) => {
          this.pending.set(id, {
            resolve,
            reject,
          });

          worker.postMessage(
            {
              id,
              sampleRate: buffer.sampleRate,
              waveformBins,
              channels,
            },
            channels,
          );
        },
      );
    } catch {
      return analyzeSampleBuffer(
        buffer,
        waveformBins,
      );
    }
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = undefined;
    for (const pending of this.pending.values()) {
      pending.reject(
        new Error("Sample analysis worker was disposed."),
      );
    }
    this.pending.clear();
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;

    const worker = new Worker(
      new URL(
        "./sampleAnalysis.worker.ts",
        import.meta.url,
      ),
      { type: "module" },
    );

    worker.onmessage = (
      event: MessageEvent<WorkerResponse>,
    ) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);

      if (response.ok && response.analysis) {
        pending.resolve(response.analysis);
      } else {
        pending.reject(
          new Error(
            response.error ??
              "Sample analysis worker failed.",
          ),
        );
      }
    };

    worker.onerror = () => {
      this.disabled = true;
      for (const pending of this.pending.values()) {
        pending.reject(
          new Error("Sample analysis worker crashed."),
        );
      }
      this.pending.clear();
      worker.terminate();
      if (this.worker === worker) {
        this.worker = undefined;
      }
    };

    this.worker = worker;
    return worker;
  }
}

export const sampleAnalysisWorkerClient =
  new SampleAnalysisWorkerClient();
