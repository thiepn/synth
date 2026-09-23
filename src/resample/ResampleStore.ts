import { audioTransport } from "../audio/AudioTransport";
import {
  drumSoundStore,
  type DrumVoiceSourceState,
} from "../audio/drumSoundModel";
import { sampleAssetStore } from "../audio/SampleAssetStore";
import type {
  Pattern,
  SampleSoundSpec,
  StepEvent,
} from "../domain/contracts";
import { mixerStore } from "../mix/MixerStore";
import {
  SEQUENCER_LANES,
  type DrumVoiceId,
} from "../music/foundationPattern";
import { modulationStore } from "../modulation/ModulationStore";
import { createRenderSnapshot } from "../render/createRenderSnapshot";
import { renderSnapshot } from "../render/offlineRenderer";
import type {
  RenderAnalysis,
  RenderSnapshotRequest,
  RenderTailMode,
} from "../render/renderTypes";
import { encodeWav } from "../render/wavEncoder";
import { sampleLabStore } from "../sample/SampleLabStore";
import { sequencerStore } from "../sequencer/SequencerStore";
import { freezeStore } from "./FreezeStore";
import { registerProjectTransientReset } from "../project/transientResetRegistry";

type Listener = () => void;

export type ResampleArtifactKind =
  | "pattern"
  | "arrangement"
  | "section"
  | "selection"
  | "track"
  | "master"
  | "fx"
  | "flatten"
  | "replace";

export interface ResampleArtifact {
  id: string;
  assetId: string;
  kind: ResampleArtifactKind;
  label: string;
  createdAt: string;
  durationSeconds: number;
  analysis: RenderAnalysis;
  voice?: DrumVoiceId;
  includeMastering: boolean;
}

export interface FlattenRecoverySummary {
  mode: "flatten" | "replace";
  assetId: string;
  sourcePatternId: string;
  createdAt: string;
}

interface FlattenRecovery extends FlattenRecoverySummary {
  pattern: Pattern;
  percussionSource: DrumVoiceSourceState;
}

export interface ResampleSnapshot {
  status:
    | "idle"
    | "rendering"
    | "freezing"
    | "flattening"
    | "completed"
    | "error";
  phaseLabel: string;
  artifacts: ResampleArtifact[];
  recovery?: FlattenRecoverySummary;
  lastError?: string;
  revision: number;
}

export interface RenderCopyRequest {
  range: RenderSnapshotRequest;
  kind: ResampleArtifactKind;
  label: string;
  voice?: DrumVoiceId;
  includeMastering?: boolean;
  tailMode?: RenderTailMode;
  fixedTailSeconds?: number;
  openInSampleLab?: boolean;
}

type SourceMutationReason =
  | "Pattern changed."
  | "Sound source changed."
  | "Mixer changed."
  | "Modulation or automation changed.";

const ARTIFACT_LIMIT = 24;

function clonePattern(pattern: Pattern): Pattern {
  return {
    ...pattern,
    meter: { ...pattern.meter },
    lanes: pattern.lanes.map((lane) => ({
      ...lane,
      events: lane.events.map((event) => ({
        ...event,
        generatorTags: event.generatorTags
          ? [...event.generatorTags]
          : undefined,
        grooveBase: event.grooveBase
          ? { ...event.grooveBase }
          : undefined,
      })),
      lock: { ...lane.lock },
      regionLocks: lane.regionLocks?.map((lock) => ({ ...lock })),
    })),
    groove: pattern.groove
      ? {
          ...pattern.groove,
          roleTimingOffsetUs: pattern.groove.roleTimingOffsetUs
            ? { ...pattern.groove.roleTimingOffsetUs }
            : undefined,
        }
      : undefined,
    provenance: pattern.provenance
      ? {
          ...pattern.provenance,
          style: { ...pattern.provenance.style },
          intent: { ...pattern.provenance.intent },
        }
      : undefined,
  };
}

function cloneAnalysis(value: RenderAnalysis): RenderAnalysis {
  return { ...value };
}

function cloneArtifact(value: ResampleArtifact): ResampleArtifact {
  return {
    ...value,
    analysis: cloneAnalysis(value.analysis),
  };
}

function cloneRecoverySummary(
  value: FlattenRecovery | undefined,
): FlattenRecoverySummary | undefined {
  if (!value) return undefined;
  return {
    mode: value.mode,
    assetId: value.assetId,
    sourcePatternId: value.sourcePatternId,
    createdAt: value.createdAt,
  };
}

function renderedClipSpec(
  assetId: string,
  durationSeconds: number,
): SampleSoundSpec {
  return {
    kind: "sample",
    assetId,
    trimStartSeconds: 0,
    trimEndSeconds: durationSeconds,
    gainDb: 0,
    pitchSemitones: 0,
    playbackRate: 1,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
    renderedClip: true,
    reversed: false,
  };
}

export class ResampleStore {
  private listeners = new Set<Listener>();
  private status: ResampleSnapshot["status"] = "idle";
  private phaseLabel = "READY";
  private artifacts: ResampleArtifact[] = [];
  private recovery: FlattenRecovery | undefined;
  private lastError: string | undefined;
  private artifactSerial = 1;
  private mutationDepth = 0;
  private revision = 0;
  private snapshot = this.buildSnapshot();

  constructor() {
    sequencerStore.subscribe(() => {
      this.handleSourceMutation("Pattern changed.");
    });
    drumSoundStore.subscribe(() => {
      this.handleSourceMutation("Sound source changed.");
    });
    mixerStore.subscribe(() => {
      this.handleSourceMutation("Mixer changed.");
    });
    modulationStore.subscribe(() => {
      this.handleSourceMutation("Modulation or automation changed.");
    });
  }

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): ResampleSnapshot => this.snapshot;

  resetProjectTransientState(): void {
    freezeStore.clear();
    this.status = "idle";
    this.phaseLabel = "READY";
    this.artifacts = [];
    this.recovery = undefined;
    this.lastError = undefined;
    this.publish();
  }

  async renderCopy(
    request: RenderCopyRequest,
  ): Promise<ResampleArtifact | undefined> {
    this.status = "rendering";
    this.phaseLabel = "RENDER COPY / " + request.label.toUpperCase();
    this.lastError = undefined;
    this.publish();

    try {
      const snapshot = createRenderSnapshot(request.range);
      const result = await renderSnapshot(snapshot, {
        sampleRate: 48_000,
        includeMastering: Boolean(request.includeMastering),
        tailMode: request.tailMode ?? "auto",
        fixedTailSeconds: request.fixedTailSeconds,
        stemVoice: request.voice,
      });
      const assetId = await this.importRender(
        result.audioBuffer,
        request.label,
      );
      const artifact = this.addArtifact({
        kind: request.kind,
        assetId,
        label: request.label,
        durationSeconds: result.audioBuffer.duration,
        analysis: result.analysis,
        voice: request.voice,
        includeMastering: Boolean(request.includeMastering),
      });

      if (request.openInSampleLab) {
        await sampleLabStore.loadAsset(assetId);
      }

      this.status = "completed";
      this.phaseLabel = "RENDER COPY READY";
      this.publish();
      return cloneArtifact(artifact);
    } catch (error) {
      this.fail(error);
      return undefined;
    }
  }

  async freezePattern(): Promise<boolean> {
    if (this.recovery) {
      this.fail(
        new Error("Revert the active Flatten/Replace before freezing."),
      );
      return false;
    }

    this.status = "freezing";
    this.phaseLabel = "FREEZING CURRENT PATTERN";
    this.lastError = undefined;
    this.publish();

    try {
      const snapshot = createRenderSnapshot({ kind: "pattern" });
      const result = await renderSnapshot(snapshot, {
        sampleRate: 48_000,
        includeMastering: false,
        includeSafetyLimiter: false,
        tailMode: "none",
      });
      const pattern = sequencerStore.getSnapshot().pattern;
      const transport = audioTransport.getSnapshot();

      freezeStore.activate(result.audioBuffer, {
        id:
          "freeze-" +
          pattern.id +
          "-" +
          Date.now().toString(36),
        patternId: pattern.id,
        lengthTicks: pattern.lengthTicks,
        bpm: transport.bpm,
        meter: { ...transport.meter },
        createdAt: new Date().toISOString(),
      });

      this.status = "completed";
      this.phaseLabel = "PATTERN FROZEN";
      this.publish();
      return true;
    } catch (error) {
      this.fail(error);
      return false;
    }
  }

  unfreeze(): void {
    freezeStore.clear();
    this.status = "idle";
    this.phaseLabel = "UNFROZEN / EDITABLE SOURCE ACTIVE";
    this.lastError = undefined;
    this.publish();
  }

  async flattenPattern(
    mode: "flatten" | "replace",
  ): Promise<ResampleArtifact | undefined> {
    if (this.recovery) {
      this.fail(
        new Error("A Flatten/Replace recovery point is already active."),
      );
      return undefined;
    }

    this.status = "flattening";
    this.phaseLabel =
      mode === "flatten"
        ? "FLATTENING PATTERN"
        : "REPLACING PATTERN WITH AUDIO";
    this.lastError = undefined;
    this.publish();

    try {
      const snapshot = createRenderSnapshot({ kind: "pattern" });
      const result = await renderSnapshot(snapshot, {
        sampleRate: 48_000,
        includeMastering: false,
        includeSafetyLimiter: false,
        tailMode: "none",
      });
      const label =
        (mode === "flatten" ? "Flattened " : "Replaced ") +
        snapshot.label;
      const assetId = await this.importRender(
        result.audioBuffer,
        label,
      );
      const current = sequencerStore.getSnapshot().pattern;
      const percussionSource = drumSoundStore.getSourceState("percussion");
      const flattened = this.flattenedPattern(
        current,
        assetId,
        result.audioBuffer.duration,
        mode,
      );

      this.mutationDepth += 1;
      try {
        freezeStore.clear();
        drumSoundStore.assignSampleSpec(
          "percussion",
          renderedClipSpec(
            assetId,
            result.audioBuffer.duration,
          ),
          "sample",
        );
        sequencerStore.restorePatternSnapshot(flattened);
      } finally {
        this.mutationDepth = Math.max(0, this.mutationDepth - 1);
      }

      this.recovery = {
        mode,
        assetId,
        sourcePatternId: current.id,
        createdAt: new Date().toISOString(),
        pattern: clonePattern(current),
        percussionSource,
      };

      const artifact = this.addArtifact({
        kind: mode,
        assetId,
        label,
        durationSeconds: result.audioBuffer.duration,
        analysis: result.analysis,
        includeMastering: false,
      });

      this.status = "completed";
      this.phaseLabel =
        mode === "flatten"
          ? "PATTERN FLATTENED / RECOVERY AVAILABLE"
          : "PATTERN REPLACED / RECOVERY AVAILABLE";
      this.publish();
      return cloneArtifact(artifact);
    } catch (error) {
      this.fail(error);
      return undefined;
    }
  }

  revertFlatten(): boolean {
    const recovery = this.recovery;
    if (!recovery) return false;

    this.mutationDepth += 1;
    try {
      drumSoundStore.restoreSourceState(
        "percussion",
        recovery.percussionSource,
      );
      sequencerStore.restorePatternSnapshot(
        clonePattern(recovery.pattern),
      );
    } finally {
      this.mutationDepth = Math.max(0, this.mutationDepth - 1);
    }

    this.recovery = undefined;
    this.status = "completed";
    this.phaseLabel = "EDITABLE SOURCE RESTORED";
    this.lastError = undefined;
    this.publish();
    return true;
  }

  async openArtifactInSampleLab(
    artifactId: string,
  ): Promise<boolean> {
    const artifact = this.artifacts.find(
      (entry) => entry.id === artifactId,
    );
    if (!artifact) return false;

    await sampleLabStore.loadAsset(artifact.assetId);
    this.phaseLabel = "OPENED IN SAMPLE LAB / " + artifact.label.toUpperCase();
    this.publish();
    return true;
  }

  removeArtifact(artifactId: string): void {
    const next = this.artifacts.filter(
      (entry) => entry.id !== artifactId,
    );
    if (next.length === this.artifacts.length) return;
    this.artifacts = next;
    this.publish();
  }

  private handleSourceMutation(reason: SourceMutationReason): void {
    if (this.mutationDepth > 0) return;
    if (freezeStore.getSnapshot().active) {
      freezeStore.invalidate(reason);
      this.phaseLabel = "FREEZE INVALIDATED / " + reason.toUpperCase();
      this.publish();
    }
  }

  private async importRender(
    buffer: AudioBuffer,
    label: string,
  ): Promise<string> {
    const wav = encodeWav(buffer, {
      bitDepth: 24,
      dither: true,
    });
    const asset = await sampleAssetStore.importBytes(
      await wav.arrayBuffer(),
      label + ".wav",
      "audio/wav",
    );
    const context = await audioTransport.unlockAudio();
    await sampleAssetStore.ensureDecoded(
      context,
      asset.reference.id,
    );
    return asset.reference.id;
  }

  private flattenedPattern(
    source: Pattern,
    assetId: string,
    durationSeconds: number,
    mode: "flatten" | "replace",
  ): Pattern {
    const pattern = clonePattern(source);

    for (const lane of pattern.lanes) {
      lane.events = [];
    }

    const percussionDefinition = SEQUENCER_LANES.find(
      (entry) => entry.voice === "percussion",
    );
    const lane = percussionDefinition
      ? pattern.lanes.find(
          (entry) => entry.id === percussionDefinition.id,
        )
      : undefined;

    if (!lane) {
      throw new Error(
        "The canonical percussion lane is unavailable for audio replacement.",
      );
    }

    lane.loopLengthTicks = pattern.lengthTicks;
    const event: StepEvent = {
      id:
        "evt-rendered-clip-" +
        Date.now().toString(36),
      tick: 0,
      velocity: 1,
      probability: 1,
      timingOffsetUs: 0,
      accent: "accent",
      generatorTags: [
        "resample",
        mode,
        assetId,
      ],
    };
    lane.events = [event];

    const sourceId = source.id;
    pattern.id =
      "pattern-" +
      mode +
      "-" +
      Date.now().toString(36);
    pattern.name =
      (mode === "flatten" ? "FLATTENED / " : "REPLACED / ") +
      source.name;

    if (pattern.provenance) {
      pattern.provenance = {
        ...pattern.provenance,
        generatorId: "resample-" + mode,
        generatorVersion: 1,
        sourceEntityId: sourceId,
        mutationId: mode + ":" + assetId,
        style: { ...pattern.provenance.style },
        intent: { ...pattern.provenance.intent },
      };
    }

    void durationSeconds;
    return pattern;
  }

  private addArtifact(input: {
    kind: ResampleArtifactKind;
    assetId: string;
    label: string;
    durationSeconds: number;
    analysis: RenderAnalysis;
    voice?: DrumVoiceId;
    includeMastering: boolean;
  }): ResampleArtifact {
    const artifact: ResampleArtifact = {
      id:
        "resample-artifact-" +
        String(this.artifactSerial++).padStart(3, "0"),
      assetId: input.assetId,
      kind: input.kind,
      label: input.label,
      createdAt: new Date().toISOString(),
      durationSeconds: input.durationSeconds,
      analysis: cloneAnalysis(input.analysis),
      voice: input.voice,
      includeMastering: input.includeMastering,
    };

    this.artifacts = [...this.artifacts, artifact].slice(
      -ARTIFACT_LIMIT,
    );
    return artifact;
  }

  private fail(error: unknown): void {
    this.status = "error";
    this.phaseLabel = "RESAMPLE ERROR";
    this.lastError =
      error instanceof Error ? error.message : String(error);
    this.publish();
  }

  private publish(): void {
    this.revision += 1;
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): ResampleSnapshot {
    return {
      status: this.status,
      phaseLabel: this.phaseLabel,
      artifacts: this.artifacts.map(cloneArtifact),
      recovery: cloneRecoverySummary(this.recovery),
      lastError: this.lastError,
      revision: this.revision,
    };
  }
}

export const resampleStore = new ResampleStore();

registerProjectTransientReset(
  "resampleStore",
  () => resampleStore.resetProjectTransientState(),
);
