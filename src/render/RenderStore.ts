import {
  DRUM_PADS,
  type DrumVoiceId,
} from "../music/foundationPattern";
import { createRenderSnapshot } from "./createRenderSnapshot";
import { renderSnapshot } from "./offlineRenderer";
import type {
  RenderAnalysis,
  RenderOptions,
  RenderSnapshotRequest,
} from "./renderTypes";
import {
  encodeWav,
  sanitizeExportName,
  type WavEncodeOptions,
} from "./wavEncoder";
import {
  blobZipEntry,
  createStoreZip,
} from "./zipStore";
import { registerProjectTransientReset } from "../project/transientResetRegistry";

type Listener = () => void;

export type RenderTaskStatus =
  | "idle"
  | "preparing"
  | "rendering"
  | "encoding"
  | "packaging"
  | "completed"
  | "cancelled"
  | "error";

export interface RenderArtifact {
  kind: "wav" | "stems";
  blob: Blob;
  filename: string;
  analysis?: RenderAnalysis;
  stemAnalyses?: Partial<Record<DrumVoiceId, RenderAnalysis>>;
}

export interface RenderTaskSnapshot {
  status: RenderTaskStatus;
  phaseLabel: string;
  activeStem?: DrumVoiceId;
  completedStems: number;
  totalStems: number;
  lastAnalysis?: RenderAnalysis;
  lastError?: string;
  revision: number;
}

export interface WavRenderRequest {
  range: RenderSnapshotRequest;
  render: RenderOptions;
  wav: WavEncodeOptions;
  filename: string;
}

export interface StemRenderRequest {
  range: RenderSnapshotRequest;
  render: Omit<RenderOptions, "stemVoice" | "includeMastering">;
  wav: WavEncodeOptions;
  filename: string;
}

function cloneAnalysis(
  analysis: RenderAnalysis | undefined,
): RenderAnalysis | undefined {
  return analysis ? { ...analysis } : undefined;
}

export class RenderStore {
  private listeners = new Set<Listener>();
  private status: RenderTaskStatus = "idle";
  private phaseLabel = "READY";
  private activeStem: DrumVoiceId | undefined;
  private completedStems = 0;
  private totalStems = 0;
  private lastAnalysis: RenderAnalysis | undefined;
  private lastError: string | undefined;
  private taskSerial = 0;
  private activeTask = 0;
  private revision = 0;
  private snapshot = this.buildSnapshot();

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): RenderTaskSnapshot => this.snapshot;

  cancel(): void {
    if (
      this.status !== "preparing" &&
      this.status !== "rendering" &&
      this.status !== "encoding" &&
      this.status !== "packaging"
    ) {
      return;
    }

    this.activeTask = ++this.taskSerial;
    this.status = "cancelled";
    this.phaseLabel = "CANCELLED";
    this.activeStem = undefined;
    this.publish();
  }

  resetStatus(): void {
    if (
      this.status === "preparing" ||
      this.status === "rendering" ||
      this.status === "encoding" ||
      this.status === "packaging"
    ) {
      return;
    }

    this.status = "idle";
    this.phaseLabel = "READY";
    this.activeStem = undefined;
    this.completedStems = 0;
    this.totalStems = 0;
    this.lastError = undefined;
    this.publish();
  }

  async renderWav(
    request: WavRenderRequest,
  ): Promise<RenderArtifact | undefined> {
    const task = this.begin("PREPARING RENDER");
    this.totalStems = 0;
    this.completedStems = 0;

    try {
      const snapshot = createRenderSnapshot(request.range);
      if (!this.isActive(task)) return undefined;

      this.status = "rendering";
      this.phaseLabel =
        request.render.includeMastering
          ? "RENDERING FINAL MASTER"
          : "RENDERING PRE-MASTER";
      this.publish();

      const result = await renderSnapshot(snapshot, request.render);
      if (!this.isActive(task)) return undefined;

      this.status = "encoding";
      this.phaseLabel = "ENCODING WAV";
      this.publish();

      const blob = encodeWav(result.audioBuffer, request.wav);
      if (!this.isActive(task)) return undefined;

      const filename =
        sanitizeExportName(request.filename) + ".wav";
      this.lastAnalysis = { ...result.analysis };
      this.status = "completed";
      this.phaseLabel = "WAV READY";
      this.lastError = undefined;
      this.publish();

      return {
        kind: "wav",
        blob,
        filename,
        analysis: { ...result.analysis },
      };
    } catch (error) {
      this.fail(task, error);
      return undefined;
    }
  }

  async renderStems(
    request: StemRenderRequest,
  ): Promise<RenderArtifact | undefined> {
    const task = this.begin("PREPARING STEM SNAPSHOT");
    this.totalStems = DRUM_PADS.length;
    this.completedStems = 0;

    try {
      const snapshot = createRenderSnapshot(request.range);
      if (!this.isActive(task)) return undefined;

      const entries: Array<{
        name: string;
        bytes: Uint8Array;
      }> = [];
      const analyses: Partial<Record<DrumVoiceId, RenderAnalysis>> = {};

      for (const pad of DRUM_PADS) {
        if (!this.isActive(task)) return undefined;

        this.status = "rendering";
        this.activeStem = pad.voice;
        this.phaseLabel =
          "RENDERING STEM " +
          String(this.completedStems + 1) +
          "/" +
          String(this.totalStems) +
          " · " +
          pad.label.toUpperCase();
        this.publish();

        const result = await renderSnapshot(snapshot, {
          ...request.render,
          includeMastering: false,
          stemVoice: pad.voice,
        });
        if (!this.isActive(task)) return undefined;

        this.status = "encoding";
        this.phaseLabel =
          "ENCODING " + pad.label.toUpperCase() + " WAV";
        this.publish();

        const wav = encodeWav(result.audioBuffer, request.wav);
        entries.push(
          await blobZipEntry(
            String(this.completedStems + 1).padStart(2, "0") +
              " " +
              pad.label +
              ".wav",
            wav,
          ),
        );
        analyses[pad.voice] = { ...result.analysis };
        this.completedStems += 1;
      }

      if (!this.isActive(task)) return undefined;

      this.status = "packaging";
      this.activeStem = undefined;
      this.phaseLabel = "PACKAGING STEMS";
      this.publish();

      const blob = createStoreZip(entries);
      if (!this.isActive(task)) return undefined;

      this.status = "completed";
      this.phaseLabel = "STEMS READY";
      this.lastError = undefined;
      this.publish();

      return {
        kind: "stems",
        blob,
        filename:
          sanitizeExportName(request.filename) +
          " - Stems.zip",
        stemAnalyses: analyses,
      };
    } catch (error) {
      this.fail(task, error);
      return undefined;
    }
  }

  private begin(label: string): number {
    const task = ++this.taskSerial;
    this.activeTask = task;
    this.status = "preparing";
    this.phaseLabel = label;
    this.activeStem = undefined;
    this.completedStems = 0;
    this.totalStems = 0;
    this.lastError = undefined;
    this.publish();
    return task;
  }

  private isActive(task: number): boolean {
    return task === this.activeTask;
  }

  private fail(task: number, error: unknown): void {
    if (!this.isActive(task)) return;
    this.status = "error";
    this.phaseLabel = "RENDER FAILED";
    this.activeStem = undefined;
    this.lastError =
      error instanceof Error ? error.message : String(error);
    this.publish();
  }

  private publish(): void {
    this.revision += 1;
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): RenderTaskSnapshot {
    return {
      status: this.status,
      phaseLabel: this.phaseLabel,
      activeStem: this.activeStem,
      completedStems: this.completedStems,
      totalStems: this.totalStems,
      lastAnalysis: cloneAnalysis(this.lastAnalysis),
      lastError: this.lastError,
      revision: this.revision,
    };
  }
}

export const renderStore = new RenderStore();

registerProjectTransientReset(
  "renderStore",
  () => { renderStore.cancel(); renderStore.resetStatus(); },
);
