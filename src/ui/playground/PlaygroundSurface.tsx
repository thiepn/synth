import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  audioTransport,
  TRANSPORT_SCHEDULER_CONFIG,
} from "../../audio/AudioTransport";
import { drumEngine } from "../../audio/DrumEngine";
import { melodicEngine } from "../../audio/MelodicEngine";
import { MELODIC_PRESETS } from "../../audio/melodicSoundModel";
import {
  DRUM_DEFAULT_SPECS,
  drumSoundStore,
} from "../../audio/drumSoundModel";
import { useTransportSnapshot } from "../../audio/useTransport";
import {
  arrangementStore,
} from "../../arrange/ArrangementStore";
import {
  arrangementPlaybackStore,
} from "../../arrange/ArrangementPlaybackStore";
import {
  useArrangementPlaybackSnapshot,
  useArrangementSnapshot,
} from "../../arrange/useArrangement";
import {
  PLAYGROUND_SONG_PATTERN_IDS,
  cloneForPlaygroundSong,
  createPlaygroundSong,
  isPlaygroundSongBlueprint,
  playgroundSongBankForPatternId,
  type PlaygroundSongBank,
} from "../../arrange/playgroundArrangement";
import { useDrumSoundSnapshot } from "../../audio/useDrumSounds";
import { useSampleAssetSnapshot } from "../../audio/useSampleAssets";
import {
  applyBundledSample,
  bundledSampleById,
  type BundledSampleId,
} from "../../audio/bundledSampleLibrary";
import {
  PPQ,
  type DrumMaterialSpec,
  type ScaleId,
  type SceneRole,
} from "../../domain/contracts";
import {
  BEAT_STYLES,
  generateBeat,
  type BeatGenerationIntent,
  type BeatStyleId,
} from "../../generation/beatGenerator";
import { rerollBeat } from "../../generation/beatVariation";
import {
  applyGroove,
  resetGroove,
  type GroovePersonalityId,
} from "../../groove/grooveEngine";
import {
  generationHistoryStore,
  type PatternBankId,
} from "../../history/GenerationHistoryStore";
import { useGenerationHistorySnapshot } from "../../history/useGenerationHistory";
import { eventTargetConsumesKeyboard } from "../../input/domInputGuards";
import { inputActionRouter } from "../../input/InputActionRouter";
import {
  DRUM_PADS,
  FOUNDATION_STEP_TICKS,
  MELODIC_LANES,
  SEQUENCER_LANES,
  type DrumVoiceId,
  type MelodicLaneDefinition,
  type MelodicTrackId,
  type SequencerLaneDefinition,
} from "../../music/foundationPattern";
import { midiStore } from "../../midi/MidiStore";
import { useMidiSnapshot } from "../../midi/useMidi";
import { mixerStore } from "../../mix/MixerStore";
import { useMixerSnapshot } from "../../mix/useMixer";
import {
  clampLaneMix,
  type LaneMixParameter,
} from "../../mix/laneMix";
import { playbackCoordinator } from "../../playback/PlaybackCoordinator";
import {
  performanceStore,
  type PerformanceMomentaryId,
} from "../../performance/PerformanceStore";
import { usePerformanceSnapshot } from "../../performance/usePerformance";
import { projectStore } from "../../project/ProjectStore";
import { useProjectSnapshot } from "../../project/useProject";
import { masteringStore } from "../../master/MasteringStore";
import { useMasteringSnapshot } from "../../master/useMastering";
import { renderStore, type RenderArtifact } from "../../render/RenderStore";
import { useRenderTaskSnapshot } from "../../render/useRenderTask";
import { triggerBlobDownload } from "../../render/wavEncoder";
import {
  SEQUENCER_MAX_STEPS,
  sequencerStore,
  type LaneClipboardData,
  type SequencerStepDynamic,
  type SequencerStepSelection,
  type StepSelectionClipboardData,
} from "../../sequencer/SequencerStore";
import { useSequencerSnapshot } from "../../sequencer/useSequencer";
import {
  gridRecorder,
  type GridRecordMode,
  type GridRecordQuantize,
} from "../../sequencer/GridRecorder";
import { useGridRecorderSnapshot } from "../../sequencer/useGridRecorder";
import { getStyleDNA } from "../../style/styleDNA";

interface PlaygroundSurfaceProps {
  onOpenStudio: () => void;
}

type PlaygroundFinishRange = "pattern" | "song";

function peakDb(value: number | undefined): string {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return "−∞ dBFS";
  }
  return (
    (20 * Math.log10(value)).toFixed(1) +
    " dBFS"
  );
}

async function shareAudioArtifact(
  artifact: RenderArtifact,
  title: string,
): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File(
    [artifact.blob],
    artifact.filename,
    {
      type:
        artifact.blob.type || "audio/wav",
    },
  );
  const shareData: ShareData = {
    title,
    files: [file],
  };

  let supported =
    typeof navigator.share === "function";
  if (
    supported &&
    typeof navigator.canShare === "function"
  ) {
    try {
      supported =
        navigator.canShare(shareData);
    } catch {
      supported = false;
    }
  }

  if (supported) {
    try {
      await navigator.share(shareData);
      return "shared";
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        return "cancelled";
      }
    }
  }

  triggerBlobDownload(
    artifact.blob,
    artifact.filename,
  );
  return "downloaded";
}

function PlaygroundFinishPanel({
  projectName,
  songAvailable,
  songName,
  onClose,
  onNotice,
  onProjectBackup,
  onOpenStudio,
  projectBackupAvailable,
}: {
  projectName: string;
  songAvailable: boolean;
  songName?: string;
  onClose: () => void;
  onNotice: (message: string) => void;
  onProjectBackup: () => Promise<void>;
  onOpenStudio: () => void;
  projectBackupAvailable: boolean;
}) {
  const renderTask = useRenderTaskSnapshot();
  const mastering = useMasteringSnapshot();
  const sequencer = useSequencerSnapshot();
  const mixer = useMixerSnapshot();
  const arrangement = useArrangementSnapshot();
  const drumSounds = useDrumSoundSnapshot();
  const transport = useTransportSnapshot();
  const [range, setRange] =
    useState<PlaygroundFinishRange>(
      songAvailable ? "song" : "pattern",
    );
  const [exactLoop, setExactLoop] =
    useState(false);
  const [action, setAction] =
    useState<
      | "download"
      | "prepareShare"
      | "share"
      | "backup"
      | null
    >(null);
  const [readyArtifact, setReadyArtifact] =
    useState<RenderArtifact | null>(null);
  const [readySignature, setReadySignature] =
    useState("");

  const busy =
    action !== null ||
    renderTask.status === "preparing" ||
    renderTask.status === "rendering" ||
    renderTask.status === "encoding" ||
    renderTask.status === "packaging";
  const previewLocked = Boolean(mastering.preview);
  const actualRange =
    range === "song" && songAvailable
      ? "song"
      : "pattern";
  const sourceSignature = [
    actualRange,
    exactLoop ? "loop" : "tail",
    projectName,
    sequencer.revision,
    mixer.revision,
    mastering.revision,
    arrangement.revision,
    drumSounds.revision,
    transport.bpm,
    transport.meter.numerator,
    transport.meter.denominator,
  ].join(":");
  const shareReady =
    Boolean(readyArtifact) &&
    readySignature === sourceSignature;

  useEffect(() => {
    if (
      readySignature &&
      readySignature !== sourceSignature
    ) {
      setReadyArtifact(null);
      setReadySignature("");
    }
  }, [readySignature, sourceSignature]);

  const renderAudio = async (
    intent: "download" | "prepareShare",
  ) => {
    if (busy || previewLocked) return;
    setAction(intent);

    try {
      const isPattern =
        actualRange === "pattern";
      const loop =
        isPattern && exactLoop;
      const artifact =
        await renderStore.renderWav({
          range:
            actualRange === "song"
              ? { kind: "arrangement" }
              : { kind: "pattern" },
          render: {
            sampleRate: 48_000,
            includeMastering: true,
            includeSafetyLimiter: true,
            tailMode: loop ? "none" : "auto",
          },
          wav: {
            bitDepth: 24,
            dither: true,
          },
          filename:
            projectName +
            (actualRange === "song"
              ? " - Song"
              : loop
                ? " - Loop"
                : " - Pattern"),
        });

      if (!artifact) {
        onNotice(
          renderStore.getSnapshot().lastError ??
            "Audio export failed",
        );
        return;
      }

      setReadyArtifact(artifact);
      setReadySignature(sourceSignature);

      if (intent === "download") {
        triggerBlobDownload(
          artifact.blob,
          artifact.filename,
        );
        onNotice("WAV downloaded");
      } else {
        onNotice(
          "WAV ready · tap Share audio",
        );
      }
    } finally {
      setAction(null);
    }
  };

  const shareReadyAudio = async () => {
    if (
      busy ||
      !readyArtifact ||
      readySignature !== sourceSignature
    ) {
      return;
    }

    setAction("share");
    try {
      const result =
        await shareAudioArtifact(
          readyArtifact,
          projectName,
        );
      onNotice(
        result === "shared"
          ? "Audio shared"
          : result === "cancelled"
            ? "Share cancelled"
            : "WAV downloaded",
      );
    } finally {
      setAction(null);
    }
  };

  const exportBackup = async () => {
    if (busy) return;
    setAction("backup");
    try {
      await onProjectBackup();
    } finally {
      setAction(null);
    }
  };

  const analysis =
    renderTask.lastAnalysis;

  return (
    <section
      className="playground-finish-panel"
      role="dialog"
      aria-label="Finish and export"
    >
      <header className="playground-finish-panel__header">
        <div>
          <span>FINISH</span>
          <strong>Take your beat with you.</strong>
          <small>
            48 kHz · 24-bit WAV · current mix
          </small>
        </div>
        <button
          type="button"
          onClick={() => {
            renderStore.cancel();
            setAction(null);
            onClose();
          }}
          aria-label="Close finish panel"
        >
          ×
        </button>
      </header>

      <div
        className="playground-finish-range"
        aria-label="Audio export range"
      >
        <button
          type="button"
          aria-label="Export current Pattern"
          className={
            actualRange === "pattern"
              ? "is-active"
              : ""
          }
          disabled={busy}
          onClick={() => {
            setRange("pattern");
            setExactLoop(false);
          }}
          aria-pressed={
            actualRange === "pattern"
          }
        >
          <strong>Pattern</strong>
          <span>Current beat</span>
        </button>
        {songAvailable ? (
          <button
            type="button"
            aria-label="Export full Song"
            className={
              actualRange === "song"
                ? "is-active"
                : ""
            }
            disabled={busy}
            onClick={() => {
              setRange("song");
              setExactLoop(false);
            }}
            aria-pressed={
              actualRange === "song"
            }
          >
            <strong>Song</strong>
            <span>
              {songName || "Full timeline"}
            </span>
          </button>
        ) : null}
      </div>

      {actualRange === "pattern" ? (
        <label className="playground-finish-loop">
          <input
            type="checkbox"
            checked={exactLoop}
            disabled={busy}
            onChange={(event) =>
              setExactLoop(
                event.currentTarget.checked,
              )
            }
          />
          <span>
            <strong>Exact loop</strong>
            <small>
              No reverb/sample tail after the pattern
            </small>
          </span>
        </label>
      ) : null}

      {previewLocked ? (
        <div
          className="playground-finish-warning"
          role="status"
        >
          <strong>Master preview open</strong>
          <span>
            Commit or cancel the preview before exporting so the WAV matches a saved production state.
          </span>
          <div>
            <button
              type="button"
              onClick={() => {
                masteringStore.commitPreview();
                onNotice("Master committed");
              }}
            >
              Use master
            </button>
            <button
              type="button"
              onClick={() => {
                masteringStore.clearPreview();
                onNotice("Master preview cancelled");
              }}
            >
              Keep original
            </button>
          </div>
        </div>
      ) : null}

      <div className="playground-finish-actions">
        <button
          type="button"
          className="playground-finish-primary"
          disabled={busy || previewLocked}
          onClick={() =>
            void renderAudio("download")
          }
        >
          <span aria-hidden="true">↓</span>
          <span>
            <strong>
              {action === "download"
                ? renderTask.phaseLabel
                : "Download WAV"}
            </strong>
            <small>
              {actualRange === "song"
                ? "Full song"
                : exactLoop
                  ? "Exact pattern loop"
                  : "Current pattern"}
            </small>
          </span>
        </button>

        <button
          type="button"
          disabled={busy || previewLocked}
          onClick={() =>
            shareReady
              ? void shareReadyAudio()
              : void renderAudio("prepareShare")
          }
        >
          <span aria-hidden="true">↗</span>
          <span>
            <strong>
              {action === "prepareShare"
                ? renderTask.phaseLabel
                : action === "share"
                  ? "SHARING…"
                  : shareReady
                    ? "Share ready WAV"
                    : "Prepare to share"}
            </strong>
            <small>
              {shareReady
                ? "Native share when supported"
                : "Render current audio first"}
            </small>
          </span>
        </button>

        <button
          type="button"
          disabled={
            busy || !projectBackupAvailable
          }
          onClick={() =>
            void exportBackup()
          }
        >
          <span aria-hidden="true">◇</span>
          <span>
            <strong>
              {action === "backup"
                ? "Preparing project…"
                : "Project file"}
            </strong>
            <small>
              {projectBackupAvailable
                ? "Editable Synth backup"
                : "Requires local project storage"}
            </small>
          </span>
        </button>
      </div>

      {busy &&
      action !== "backup" &&
      action !== "share" ? (
        <div
          className="playground-finish-progress"
          role="status"
          aria-live="polite"
        >
          <span>{renderTask.phaseLabel}</span>
          <button
            type="button"
            onClick={() => {
              renderStore.cancel();
              setAction(null);
              onNotice("Export cancelled");
            }}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {renderTask.lastError ? (
        <p
          className="playground-finish-error"
          role="alert"
        >
          {renderTask.lastError}
        </p>
      ) : null}

      {analysis &&
      renderTask.status === "completed" ? (
        <footer className="playground-finish-result">
          <span>
            {analysis.durationSeconds.toFixed(1)} s
          </span>
          <span>
            Peak {peakDb(analysis.peak)}
          </span>
          <span>
            {analysis.clippedSampleCount > 0
              ? analysis.clippedSampleCount +
                " clipped samples"
              : "No clipped samples"}
          </span>
        </footer>
      ) : null}

      <p className="playground-finish-advanced">
        Need stems, custom bars, alternate bit depths or detailed mastering?{" "}
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenStudio();
          }}
        >
          Use Studio
        </button>
      </p>
    </section>
  );
}


interface SoundPreset {
  label: string;
  source?: "synth" | "sample" | "hybrid";
  spec?: Partial<DrumMaterialSpec>;
  bundledSampleId?: BundledSampleId;
  synthGainDb?: number;
}

const PLAY_STYLES: readonly BeatStyleId[] = [
  "hipHop",
  "funk",
  "house",
  "trap",
  "lofi",
  "rock",
  "techno",
  "gospel",
];

const LANE_COLORS: Record<DrumVoiceId, string> = {
  kick: "#ff5577",
  snare: "#7867ff",
  clap: "#ff8a4d",
  closedHat: "#ffd84a",
  openHat: "#63def4",
  tom: "#c26cff",
  percussion: "#35d5a3",
  crash: "#70a8ff",
};

const LANE_NAMES: Partial<Record<DrumVoiceId, string>> = {
  closedHat: "HATS",
  openHat: "OPEN HAT",
  percussion: "PERC",
};

const MELODIC_COLORS: Record<MelodicTrackId, string> = {
  bass: "#ff6f8d",
  chords: "#a58bff",
  lead: "#63def4",
};

const SONG_ROLE_OPTIONS: ReadonlyArray<{
  id: SceneRole;
  label: string;
}> = [
  { id: "intro", label: "Intro" },
  { id: "verse", label: "Verse" },
  { id: "preChorus", label: "Pre-Chorus" },
  { id: "chorus", label: "Chorus" },
  { id: "breakdown", label: "Breakdown" },
  { id: "build", label: "Build" },
  { id: "drop", label: "Drop" },
  { id: "outro", label: "Outro" },
];

function songRoleLabel(role: SceneRole): string {
  return (
    SONG_ROLE_OPTIONS.find(
      (entry) => entry.id === role,
    )?.label ?? role
  );
}

const SONG_PANEL_STYLE: CSSProperties = {
  width:
    "min(1440px, calc(100% - clamp(20px, 7vw, 108px)))",
  margin: "10px auto 18px",
  padding: 10,
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 16,
  background: "rgba(8,10,18,.62)",
};

const SONG_HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8,
  marginBottom: 9,
};

const SONG_BUTTON_STYLE: CSSProperties = {
  minHeight: 44,
  padding: "0 10px",
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 9,
  background: "rgba(255,255,255,.04)",
  color: "var(--pg-text)",
  fontSize: ".58rem",
  fontWeight: 850,
  cursor: "pointer",
};

const SONG_TIMELINE_STYLE: CSSProperties = {
  position: "relative",
  minHeight: 76,
  display: "flex",
  alignItems: "stretch",
  gap: 6,
  overflowX: "auto",
  padding: "5px 2px 7px",
};

const SONG_EDITOR_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 6,
  marginTop: 8,
  paddingTop: 8,
  borderTop: "1px solid rgba(255,255,255,.06)",
};

const NOTE_NAMES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
] as const;

const KEY_OPTIONS = NOTE_NAMES.map((label, value) => ({
  label,
  value,
}));

const SCALE_OPTIONS: ReadonlyArray<{
  id: ScaleId;
  label: string;
  intervals: readonly number[];
}> = [
  {
    id: "chromatic",
    label: "Chromatic",
    intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  },
  {
    id: "major",
    label: "Major",
    intervals: [0, 2, 4, 5, 7, 9, 11],
  },
  {
    id: "minor",
    label: "Minor",
    intervals: [0, 2, 3, 5, 7, 8, 10],
  },
  {
    id: "majorPentatonic",
    label: "Maj Pent",
    intervals: [0, 2, 4, 7, 9],
  },
  {
    id: "minorPentatonic",
    label: "Min Pent",
    intervals: [0, 3, 5, 7, 10],
  },
];

type ChordShapeId =
  | "major"
  | "minor"
  | "seventh"
  | "minor7"
  | "sus2"
  | "sus4";

const CHORD_SHAPES: ReadonlyArray<{
  id: ChordShapeId;
  label: string;
  intervals: readonly number[];
}> = [
  { id: "major", label: "Maj", intervals: [0, 4, 7] },
  { id: "minor", label: "Min", intervals: [0, 3, 7] },
  { id: "seventh", label: "7", intervals: [0, 4, 7, 10] },
  { id: "minor7", label: "m7", intervals: [0, 3, 7, 10] },
  { id: "sus2", label: "sus2", intervals: [0, 2, 7] },
  { id: "sus4", label: "sus4", intervals: [0, 5, 7] },
];

function midiNoteLabel(midi: number): string {
  const safe = Math.max(0, Math.min(127, Math.round(midi)));
  const name = NOTE_NAMES[safe % 12] ?? "C";
  const octave = Math.floor(safe / 12) - 1;
  return name + octave;
}

function pitchIsInScale(
  midi: number,
  rootPitchClass: number,
  scaleId: ScaleId,
): boolean {
  const scale =
    SCALE_OPTIONS.find((entry) => entry.id === scaleId) ??
    SCALE_OPTIONS[0]!;
  const relative =
    (((Math.round(midi) % 12) - rootPitchClass) % 12 + 12) %
    12;
  return scale.intervals.includes(relative);
}

const SOUND_PRESETS: Record<DrumVoiceId, readonly SoundPreset[]> = {
  kick: [
    { label: "Core", spec: {} },
    { label: "Deep", spec: { body: 0.95, pitch: 0.27, decay: 0.72, impact: 0.7 } },
    { label: "Punchy", spec: { impact: 0.98, body: 0.68, decay: 0.36, character: 0.48 } },
    { label: "Soft", spec: { impact: 0.52, body: 0.7, noise: 0.05, character: 0.22 } },
    { label: "Dirty", spec: { impact: 0.82, noise: 0.24, character: 0.9, tone: 0.38 } },
    { label: "Sub", spec: { body: 1, pitch: 0.2, decay: 0.9, impact: 0.6, noise: 0.03 } },
    { label: "Tight", spec: { impact: 0.9, body: 0.66, decay: 0.24, pitch: 0.5 } },
    { label: "Huge", spec: { impact: 0.86, body: 1, decay: 0.86, pitch: 0.32, character: 0.62 } },
    { label: "808 Short", bundledSampleId: "tr808-kick-short" },
    { label: "808 Classic", bundledSampleId: "tr808-kick" },
    { label: "808 Long", bundledSampleId: "tr808-kick-long" },
    { label: "808 Punch+", source: "hybrid", bundledSampleId: "tr808-kick-short", synthGainDb: -8, spec: { impact: 0.94, body: 0.9, noise: 0.035, air: 0.05, tone: 0.5, decay: 0.42, pitch: 0.38, character: 0.28 } },
  ],
  snare: [
    { label: "Core", spec: {} },
    { label: "Snap", spec: { impact: 0.84, noise: 0.8, character: 0.9, decay: 0.34 } },
    { label: "Fat", spec: { body: 0.88, tone: 0.45, decay: 0.58, impact: 0.72 } },
    { label: "Dry", spec: { decay: 0.22, air: 0.18, noise: 0.6, body: 0.54 } },
    { label: "Bright", spec: { air: 0.72, tone: 0.82, noise: 0.78, pitch: 0.6 } },
    { label: "Lo-Fi", spec: { air: 0.16, tone: 0.32, noise: 0.8, character: 0.78 } },
    { label: "Ringy", spec: { body: 0.76, tone: 0.72, decay: 0.7, character: 0.82 } },
    { label: "Big", spec: { impact: 0.82, body: 0.92, decay: 0.72, air: 0.5 } },
    { label: "808 Dry", bundledSampleId: "tr808-snare-dry" },
    { label: "808 Snare", bundledSampleId: "tr808-snare" },
    { label: "808 Snap", bundledSampleId: "tr808-snare-snap" },
    { label: "808 Body+", source: "hybrid", bundledSampleId: "tr808-snare-snap", synthGainDb: -10, spec: { impact: 0.8, body: 0.78, noise: 0.5, air: 0.3, tone: 0.5, decay: 0.38, pitch: 0.48, character: 0.4 } },
  ],
  clap: [
    { label: "Core", spec: {} },
    { label: "Wide", spec: { character: 0.96, air: 0.7, decay: 0.54 } },
    { label: "Tight", spec: { impact: 0.78, decay: 0.2, body: 0.24 } },
    { label: "Dusty", spec: { noise: 0.94, tone: 0.38, character: 0.68 } },
    { label: "Bright", spec: { air: 0.9, tone: 0.84, noise: 0.86 } },
    { label: "Soft", spec: { impact: 0.38, body: 0.16, noise: 0.68, air: 0.34 } },
    { label: "Crunch", spec: { impact: 0.72, noise: 0.92, character: 0.94, tone: 0.46 } },
    { label: "Airy", spec: { air: 0.96, noise: 0.8, decay: 0.5, body: 0.12 } },
    { label: "808 Clap", bundledSampleId: "tr808-clap" },
    { label: "808 Wide+", source: "hybrid", bundledSampleId: "tr808-clap", synthGainDb: -12, spec: { impact: 0.52, body: 0.16, noise: 0.72, air: 0.56, tone: 0.6, decay: 0.4, pitch: 0.5, character: 0.84 } },
  ],
  closedHat: [
    { label: "Core", spec: {} },
    { label: "Crisp", spec: { impact: 0.66, air: 0.9, tone: 0.82, decay: 0.16 } },
    { label: "Soft", spec: { impact: 0.32, air: 0.56, tone: 0.56, decay: 0.22 } },
    { label: "Dark", spec: { tone: 0.3, air: 0.46, character: 0.58 } },
    { label: "Metallic", spec: { character: 0.96, body: 0.3, pitch: 0.74 } },
    { label: "Dusty", spec: { air: 0.36, noise: 0.72, tone: 0.36, character: 0.62 } },
    { label: "Tiny", spec: { impact: 0.74, decay: 0.1, body: 0.08, pitch: 0.82 } },
    { label: "Bright", spec: { air: 0.98, tone: 0.94, pitch: 0.7, decay: 0.2 } },
    { label: "808 Hat", bundledSampleId: "tr808-closed-hat" },
    { label: "808 Metal+", source: "hybrid", bundledSampleId: "tr808-closed-hat", synthGainDb: -14, spec: { impact: 0.46, body: 0.12, noise: 0.34, air: 0.66, tone: 0.78, decay: 0.18, pitch: 0.64, character: 0.72 } },
  ],
  openHat: [
    { label: "Core", spec: {} },
    { label: "Airy", spec: { air: 0.98, decay: 0.78, tone: 0.78 } },
    { label: "Short", spec: { decay: 0.34, impact: 0.58, air: 0.7 } },
    { label: "Dark", spec: { tone: 0.34, air: 0.58, decay: 0.7 } },
    { label: "Metallic", spec: { character: 0.98, body: 0.32, pitch: 0.72 } },
    { label: "Loose", spec: { decay: 0.88, air: 0.82, impact: 0.34, character: 0.72 } },
    { label: "Bright", spec: { air: 0.94, tone: 0.92, pitch: 0.72, decay: 0.6 } },
    { label: "Washy", spec: { air: 1, decay: 0.98, noise: 0.7, body: 0.24 } },
    { label: "808 Open Short", bundledSampleId: "tr808-open-hat-short" },
    { label: "808 Open", bundledSampleId: "tr808-open-hat" },
    { label: "808 Open Long", bundledSampleId: "tr808-open-hat-long" },
    { label: "808 Air+", source: "hybrid", bundledSampleId: "tr808-open-hat", synthGainDb: -14, spec: { impact: 0.4, body: 0.16, noise: 0.46, air: 0.82, tone: 0.74, decay: 0.58, pitch: 0.6, character: 0.72 } },
  ],
  tom: [
    { label: "Core", spec: {} },
    { label: "Round", spec: { body: 0.98, impact: 0.58, tone: 0.36, decay: 0.62, noise: 0.015, character: 0.18 } },
    { label: "Deep", spec: { pitch: 0.22, body: 0.95, decay: 0.72, noise: 0.012, character: 0.16 } },
    { label: "Tight", spec: { impact: 0.88, decay: 0.22, body: 0.76, noise: 0.03, character: 0.2 } },
    { label: "Big", spec: { body: 1, decay: 0.82, character: 0.28, noise: 0.018 } },
    { label: "High", spec: { pitch: 0.78, body: 0.74, impact: 0.76, decay: 0.38, noise: 0.025, character: 0.2 } },
    { label: "Soft", spec: { impact: 0.4, body: 0.78, noise: 0.01, air: 0.02, decay: 0.5, character: 0.12 } },
    { label: "Tribal", spec: { impact: 0.7, body: 0.92, pitch: 0.52, character: 0.36, noise: 0.03, tone: 0.4 } },
    { label: "808 Tom Low", bundledSampleId: "tr808-tom-low" },
    { label: "808 Tom", bundledSampleId: "tr808-tom" },
    { label: "808 Tom High", bundledSampleId: "tr808-tom-high" },
    { label: "808 Body+", source: "hybrid", bundledSampleId: "tr808-tom", synthGainDb: -9, spec: { impact: 0.72, body: 0.92, noise: 0.012, air: 0.025, tone: 0.38, decay: 0.52, pitch: 0.46, character: 0.16 } },
  ],
  percussion: [
    { label: "Core", spec: {} },
    { label: "Wood", spec: { body: 0.78, noise: 0.015, air: 0.03, tone: 0.32, character: 0.1, decay: 0.18, pitch: 0.45 } },
    { label: "Click", spec: { impact: 0.96, body: 0.26, noise: 0.02, air: 0.06, decay: 0.1, pitch: 0.68, character: 0.08 } },
    { label: "Warm", spec: { body: 0.82, tone: 0.3, character: 0.18, noise: 0.012, air: 0.04, decay: 0.24, pitch: 0.48 } },
    { label: "Odd", spec: { character: 0.58, pitch: 0.7, noise: 0.025, air: 0.08, body: 0.44, decay: 0.2 } },
    { label: "Metal", spec: { character: 0.75, air: 0.22, pitch: 0.62, noise: 0.025, body: 0.3, decay: 0.28, tone: 0.58 } },
    { label: "Hollow", spec: { body: 0.88, tone: 0.26, decay: 0.36, pitch: 0.4, character: 0.22, noise: 0.012, air: 0.03 } },
    { label: "Sharp", spec: { impact: 0.96, decay: 0.1, pitch: 0.78, air: 0.14, noise: 0.02, character: 0.15, body: 0.38 } },
    { label: "808 Rim", bundledSampleId: "tr808-percussion" },
    { label: "808 Claves", bundledSampleId: "tr808-percussion-claves" },
    { label: "808 Cowbell", bundledSampleId: "tr808-percussion-cowbell" },
    { label: "808 Maracas", bundledSampleId: "tr808-percussion-maracas" },
    { label: "808 Wood+", source: "hybrid", bundledSampleId: "tr808-percussion-claves", synthGainDb: -13, spec: { impact: 0.78, body: 0.62, noise: 0.012, air: 0.025, tone: 0.32, decay: 0.16, pitch: 0.5, character: 0.12 } },
  ],
  crash: [
    { label: "Core", spec: {} },
    { label: "Bright", spec: { air: 1, tone: 0.9, decay: 0.82 } },
    { label: "Dark", spec: { tone: 0.34, air: 0.58, body: 0.26 } },
    { label: "Short", spec: { decay: 0.42, impact: 0.62, air: 0.76 } },
    { label: "Washy", spec: { decay: 0.98, air: 0.96, character: 0.82 } },
    { label: "Thin", spec: { body: 0.08, air: 0.82, tone: 0.78, decay: 0.58 } },
    { label: "Heavy", spec: { body: 0.42, impact: 0.72, decay: 0.9, tone: 0.46 } },
    { label: "Airy", spec: { air: 1, noise: 0.76, tone: 0.86, decay: 0.78 } },
    { label: "808 Cymbal Short", bundledSampleId: "tr808-crash-short" },
    { label: "808 Cymbal", bundledSampleId: "tr808-crash" },
    { label: "808 Cymbal Long", bundledSampleId: "tr808-crash-long" },
    { label: "808 Air+", source: "hybrid", bundledSampleId: "tr808-crash", synthGainDb: -15, spec: { impact: 0.5, body: 0.14, noise: 0.58, air: 0.88, tone: 0.82, decay: 0.84, pitch: 0.62, character: 0.68 } },
  ],
};

const MATERIAL_PARAMS = [
  "impact",
  "body",
  "noise",
  "air",
  "tone",
  "decay",
  "pitch",
  "character",
] as const;

function soundPresetSource(
  preset: SoundPreset,
): "synth" | "sample" | "hybrid" {
  return (
    preset.source ??
    (preset.bundledSampleId ? "sample" : "synth")
  );
}

function soundPresetSourceLabel(
  preset: SoundPreset,
): string {
  const source = soundPresetSource(preset);
  return source === "hybrid"
    ? "HYBRID"
    : source === "sample"
      ? "808 SAMPLE"
      : "SYNTH";
}

function synthPresetSpecMatches(
  voice: DrumVoiceId,
  preset: SoundPreset,
  actual: DrumMaterialSpec,
): boolean {
  return MATERIAL_PARAMS.every((key) => {
    const expected =
      preset.spec?.[key] ??
      DRUM_DEFAULT_SPECS[voice][key];

    return Math.abs(expected - actual[key]) < 0.0001;
  });
}

function synthPresetMatches(
  voice: DrumVoiceId,
  preset: SoundPreset,
  actual: DrumMaterialSpec,
): boolean {
  return (
    soundPresetSource(preset) === "synth" &&
    synthPresetSpecMatches(
      voice,
      preset,
      actual,
    )
  );
}

const INITIAL_SOUND_INDEX: Record<DrumVoiceId, number> = {
  kick: 0,
  snare: 0,
  clap: 0,
  closedHat: 0,
  openHat: 0,
  tom: 0,
  percussion: 0,
  crash: 0,
};

function styleLabel(style: BeatStyleId): string {
  return BEAT_STYLES.find((entry) => entry.id === style)?.label ?? style;
}

function intentForStyle(style: BeatStyleId): BeatGenerationIntent {
  const dna = getStyleDNA(style);
  return {
    energy: 0.66,
    density: 0.54,
    complexity: 0.44,
    syncopation: Math.max(0.32, Math.min(0.72, dna.rhythm.kickSyncopation)),
    swing: dna.baseSwing,
  };
}

function displayLaneName(lane: SequencerLaneDefinition): string {
  return LANE_NAMES[lane.voice] ?? lane.name;
}

type TouchEditMode =
  | "draw"
  | "select"
  | "accent"
  | "ghost";
type PadRepeatDivision = 0 | 1 | 2 | 4;
type MomentaryMonitorMode = "mute" | "solo";

interface StepContextState {
  laneId: string;
  stepIndex: number;
  x: number;
  y: number;
}

type SelectionDragMode =
  | "replace"
  | "add"
  | "remove";

interface SelectionDragState {
  pointerId: number;
  startLaneId: string;
  startStepIndex: number;
  mode: SelectionDragMode;
  base: SequencerStepSelection[];
}

function selectionKey(
  entry: SequencerStepSelection,
): string {
  return entry.laneId + ":" + entry.stepIndex;
}

type SoundIndexCollection = Record<DrumVoiceId, number[]>;

const HAPTICS_STORAGE_KEY = "synth.playground.haptics";
const FAVORITE_SOUNDS_STORAGE_KEY =
  "synth.playground.favorite-sounds";
const RECENT_SOUNDS_STORAGE_KEY =
  "synth.playground.recent-sounds";
const DISCOVERY_STORAGE_KEY =
  "synth.playground.discovery-seen";
const PLAYGROUND_SESSION_PREFIX =
  "synth.playground.session.";

interface PlaygroundSessionState {
  selectedVoice?: DrumVoiceId;
  stepPage?: number;
  followPlayhead?: boolean;
  touchEditMode?: TouchEditMode;
}

function emptySoundIndexCollection(): SoundIndexCollection {
  return {
    kick: [],
    snare: [],
    clap: [],
    closedHat: [],
    openHat: [],
    tom: [],
    percussion: [],
    crash: [],
  };
}

function readSoundIndexCollection(
  key: string,
): SoundIndexCollection {
  const fallback = emptySoundIndexCollection();

  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<
      Record<DrumVoiceId, unknown>
    >;

    for (const pad of DRUM_PADS) {
      const values = parsed?.[pad.voice];
      if (!Array.isArray(values)) continue;
      fallback[pad.voice] = values
        .filter(
          (value): value is number =>
            Number.isInteger(value) &&
            value >= 0 &&
            value < SOUND_PRESETS[pad.voice].length,
        )
        .slice(0, 8);
    }

    return fallback;
  } catch {
    return fallback;
  }
}

function persistSoundIndexCollection(
  key: string,
  value: SoundIndexCollection,
): void {
  try {
    globalThis.localStorage?.setItem(
      key,
      JSON.stringify(value),
    );
  } catch {
    // Sound discovery metadata remains session-only if storage is blocked.
  }
}

function readDiscoverySeen(): boolean {
  try {
    return (
      globalThis.localStorage?.getItem(
        DISCOVERY_STORAGE_KEY,
      ) === "1"
    );
  } catch {
    return false;
  }
}

function persistDiscoverySeen(): void {
  try {
    globalThis.localStorage?.setItem(
      DISCOVERY_STORAGE_KEY,
      "1",
    );
  } catch {
    // First-use guidance may reappear if storage is unavailable.
  }
}

function readPlaygroundSession(
  projectId: string,
): PlaygroundSessionState {
  try {
    const raw = globalThis.localStorage?.getItem(
      PLAYGROUND_SESSION_PREFIX + projectId,
    );
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PlaygroundSessionState;
    return parsed && typeof parsed === "object"
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function persistPlaygroundSession(
  projectId: string,
  state: PlaygroundSessionState,
): void {
  try {
    globalThis.localStorage?.setItem(
      PLAYGROUND_SESSION_PREFIX + projectId,
      JSON.stringify(state),
    );
  } catch {
    // Session UI state remains in-memory if storage is blocked.
  }
}

function projectSaveLabel(
  status: ReturnType<typeof useProjectSnapshot>["saveStatus"],
  dirty: boolean,
): string {
  switch (status) {
    case "saving":
      return "Saving…";
    case "dirty":
      return "Autosaving…";
    case "clean":
      return "Saved";
    case "conflict":
      return "Conflict";
    case "error":
      return "Save issue";
    case "unsupported":
      return "Session only";
    case "loading":
      return "Loading…";
    default:
      return dirty ? "Unsaved" : "Starting…";
  }
}

function shortProjectTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function readHapticsPreference(): boolean {
  try {
    return globalThis.localStorage?.getItem(
      HAPTICS_STORAGE_KEY,
    ) === "1";
  } catch {
    return false;
  }
}

function persistHapticsPreference(enabled: boolean): void {
  try {
    globalThis.localStorage?.setItem(
      HAPTICS_STORAGE_KEY,
      enabled ? "1" : "0",
    );
  } catch {
    // Haptics preference remains session-only when storage is blocked.
  }
}

function ProjectHealthAlert({
  onOpenStudio,
}: {
  onOpenStudio: () => void;
}) {
  const project = useProjectSnapshot();
  const projectAlert =
    project.saveStatus === "conflict"
      ? {
          label: "Conflict",
          aria:
            "Project conflict. Open Studio to resolve the newer saved revision.",
          detail:
            project.conflict?.message ??
            project.lastError ??
            "A newer saved project revision exists.",
        }
      : project.saveStatus === "error"
        ? {
            label: "Save issue",
            aria:
              "Project save error. Open Studio for project recovery controls.",
            detail:
              project.lastError ??
              "The project could not be saved.",
          }
        : project.saveStatus === "unsupported"
          ? {
              label: "Session only",
              aria:
                "Local project storage is unavailable. Open Studio for project controls.",
              detail:
                "Changes are available only in this browser session unless exported.",
            }
          : null;

  if (!projectAlert) return null;

  return (
    <button
      type="button"
      className={
        "playground-project-alert playground-project-alert--" +
        project.saveStatus
      }
      onClick={onOpenStudio}
      aria-label={projectAlert.aria}
      title={projectAlert.detail}
    >
      <span aria-hidden="true">!</span>
      <b>{projectAlert.label}</b>
    </button>
  );
}

function PlaygroundJamPad({
  action,
  label,
  disabled,
}: {
  action: PerformanceMomentaryId;
  label: string;
  disabled: boolean;
}) {
  const performance = usePerformanceSnapshot();
  const interaction = useRef<
    "pointer" | "keyboard" | null
  >(null);
  const armed = performance.windows.some(
    (window) =>
      window.id === action &&
      window.endTick === undefined,
  );

  const release = () => {
    performanceStore.releaseMomentary(action);
  };

  const releasePointer = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    release();
    try {
      event.currentTarget.releasePointerCapture(
        event.pointerId,
      );
    } catch {
      // Pointer capture may already be released.
    }
    window.setTimeout(() => {
      interaction.current = null;
    }, 0);
  };

  return (
    <button
      type="button"
      className={
        armed
          ? "playground-jam-pad is-active"
          : "playground-jam-pad"
      }
      disabled={disabled}
      aria-pressed={armed}
      aria-label={
        label +
        ". Hold for beat-quantized live effect."
      }
      onPointerDown={(event) => {
        if (disabled) return;
        interaction.current = "pointer";
        event.preventDefault();
        event.currentTarget.setPointerCapture(
          event.pointerId,
        );
        performanceStore.pressMomentary(action);
      }}
      onPointerUp={releasePointer}
      onPointerCancel={releasePointer}
      onKeyDown={(event) => {
        if (
          disabled ||
          event.repeat ||
          (event.key !== " " &&
            event.key !== "Enter")
        ) {
          return;
        }
        interaction.current = "keyboard";
        event.preventDefault();
        performanceStore.pressMomentary(action);
      }}
      onKeyUp={(event) => {
        if (
          event.key !== " " &&
          event.key !== "Enter"
        ) {
          return;
        }
        event.preventDefault();
        release();
      }}
      onBlur={() => {
        release();
        interaction.current = null;
      }}
      onClick={() => {
        if (disabled) return;
        if (interaction.current) {
          interaction.current = null;
          return;
        }

        performanceStore.pressMomentary(action);
        window.setTimeout(() => {
          performanceStore.releaseMomentary(action);
        }, 180);
      }}
    >
      <strong>{label}</strong>
      <small>HOLD</small>
    </button>
  );
}

function PlaygroundJamStrip({
  playing,
  disabled,
  onNotice,
}: {
  playing: boolean;
  disabled: boolean;
  onNotice: (message: string) => void;
}) {
  const performance = usePerformanceSnapshot();
  const actionDisabled =
    disabled || !playing;

  return (
    <section
      className="playground-jam-strip"
      aria-label="Live jam controls"
    >
      <div className="playground-jam-strip__identity">
        <span>JAM</span>
        <strong>
          {playing ? "Live" : "Press Play"}
        </strong>
        <small>
          Temporary performance · not pattern edits
        </small>
      </div>

      <label className="playground-jam-macro">
        <span>Energy</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={Math.round(
            performance.macros.energy * 100,
          )}
          disabled={disabled}
          onChange={(event) =>
            performanceStore.setMacro(
              "energy",
              Number(
                event.currentTarget.value,
              ) / 100,
            )
          }
          aria-label="Live energy"
        />
        <output>
          {Math.round(
            performance.macros.energy * 100,
          )}
          %
        </output>
      </label>

      <label className="playground-jam-macro">
        <span>Filter</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={Math.round(
            performance.macros.filter * 100,
          )}
          disabled={disabled}
          onChange={(event) =>
            performanceStore.setMacro(
              "filter",
              Number(
                event.currentTarget.value,
              ) / 100,
            )
          }
          aria-label="Live filter"
        />
        <output>
          {Math.round(
            performance.macros.filter * 100,
          )}
          %
        </output>
      </label>

      <label className="playground-jam-macro">
        <span>Space</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={Math.round(
            performance.macros.space * 100,
          )}
          disabled={disabled}
          onChange={(event) =>
            performanceStore.setMacro(
              "space",
              Number(
                event.currentTarget.value,
              ) / 100,
            )
          }
          aria-label="Live space"
        />
        <output>
          {Math.round(
            performance.macros.space * 100,
          )}
          %
        </output>
      </label>

      <div
        className="playground-jam-actions"
        aria-label="Live jam actions"
      >
        <button
          type="button"
          className="playground-jam-pad playground-jam-pad--fill"
          disabled={actionDisabled}
          onClick={() => {
            performanceStore.triggerFill();
            onNotice(
              "Fill queued · final beat before next bar",
            );
          }}
          aria-label="Queue live fill"
        >
          <strong>Fill</strong>
          <small>NEXT BAR</small>
        </button>
        <PlaygroundJamPad
          action="drop"
          label="Drop"
          disabled={actionDisabled}
        />
        <PlaygroundJamPad
          action="build"
          label="Build"
          disabled={actionDisabled}
        />
        <PlaygroundJamPad
          action="stutter"
          label="Stutter"
          disabled={actionDisabled}
        />
      </div>

      <button
        type="button"
        className="playground-jam-reset"
        disabled={disabled}
        onClick={() => {
          performanceStore.resetMacros();
          performanceStore.clearTransient();
          onNotice("Live performance reset");
        }}
        aria-label="Reset live jam controls"
      >
        Reset
      </button>
    </section>
  );
}

type PlaygroundFeelId =
  | "straight"
  | "tight"
  | "laidBack"
  | "human";

interface PlaygroundFeelPreset {
  id: PlaygroundFeelId;
  label: string;
  personality: GroovePersonalityId;
  humanization: number;
  ghostNoteAmount: number;
  description: string;
}

const PLAYGROUND_FEELS: readonly PlaygroundFeelPreset[] = [
  {
    id: "straight",
    label: "Straight",
    personality: "mechanical",
    humanization: 0,
    ghostNoteAmount: 0,
    description: "Exact grid",
  },
  {
    id: "tight",
    label: "Tight",
    personality: "tight",
    humanization: 0.34,
    ghostNoteAmount: 0.08,
    description: "Controlled pocket",
  },
  {
    id: "laidBack",
    label: "Laid-back",
    personality: "laidBack",
    humanization: 0.5,
    ghostNoteAmount: 0.16,
    description: "Behind the beat",
  },
  {
    id: "human",
    label: "Human",
    personality: "human",
    humanization: 0.58,
    ghostNoteAmount: 0.22,
    description: "Natural movement",
  },
];

function playgroundFeelFromPattern(
  personality: GroovePersonalityId | undefined,
  humanization: number,
): PlaygroundFeelId {
  if (humanization <= 0.015) {
    return "straight";
  }
  if (personality === "tight") {
    return "tight";
  }
  if (personality === "laidBack") {
    return "laidBack";
  }
  return "human";
}

function PlaygroundFeelStrip({
  disabled,
  onNotice,
}: {
  disabled: boolean;
  onNotice: (message: string) => void;
}) {
  const sequencer = useSequencerSnapshot();
  const groove = sequencer.pattern.groove;
  const appliedHumanization =
    groove?.humanization ?? 0;
  const appliedSwing =
    groove?.swing ?? 0;
  const appliedFeel =
    playgroundFeelFromPattern(
      groove?.personality,
      appliedHumanization,
    );

  const [feel, setFeel] =
    useState<PlaygroundFeelId>(
      appliedFeel,
    );
  const [swing, setSwing] =
    useState(
      Math.round(
        Math.max(
          0,
          Math.min(0.5, appliedSwing),
        ) * 100,
      ),
    );

  const grooveKey = [
    groove?.personality ?? "mechanical",
    appliedHumanization,
    groove?.ghostNoteAmount ?? 0,
    appliedSwing,
    groove?.seed ?? "",
  ].join(":");

  useEffect(() => {
    setFeel(appliedFeel);
    setSwing(
      Math.round(
        Math.max(
          0,
          Math.min(0.5, appliedSwing),
        ) * 100,
      ),
    );
  }, [
    grooveKey,
    appliedFeel,
    appliedSwing,
  ]);

  const preset =
    PLAYGROUND_FEELS.find(
      (entry) => entry.id === feel,
    ) ?? PLAYGROUND_FEELS[0];

  const straightBase =
    appliedHumanization <= 0.005 &&
    Math.abs(
      groove?.ghostNoteAmount ?? 0,
    ) <= 0.005;
  const appliedMatchesDraft =
    (
      preset.id === "straight"
        ? straightBase
        : groove?.personality ===
            preset.personality &&
          Math.abs(
            appliedHumanization -
              preset.humanization,
          ) < 0.005 &&
          Math.abs(
            (groove?.ghostNoteAmount ?? 0) -
              preset.ghostNoteAmount,
          ) < 0.005
    ) &&
    Math.abs(
      appliedSwing - swing / 100,
    ) < 0.005;

  const hasAppliedFeel =
    !straightBase ||
    appliedSwing > 0.005;

  const applyFeel = () => {
    if (disabled) return;
    const source =
      sequencerStore.getSnapshot().pattern;
    const seed =
      source.groove?.seed ??
      [
        "playground-feel",
        source.id,
        source.provenance?.seed ??
          "manual",
      ].join(":");

    const result = applyGroove({
      source,
      seed,
      personality: preset.personality,
      humanization:
        preset.humanization,
      ghostNoteAmount:
        preset.ghostNoteAmount,
      swing: swing / 100,
    });
    sequencerStore.applyPatternTransform(
      result.pattern,
    );
    onNotice(
      preset.label +
        " feel applied" +
        (swing > 0
          ? " · Swing " + swing + "%"
          : ""),
    );
  };

  const resetFeel = () => {
    if (disabled) return;
    const source =
      sequencerStore.getSnapshot().pattern;
    sequencerStore.applyPatternTransform(
      resetGroove(source),
    );
    onNotice("Feel reset to straight");
  };

  const currentLabel =
    straightBase
      ? "Straight"
      : groove?.personality
        ? groove.personality
            .replace(
              "laidBack",
              "Laid-back",
            )
            .replace(/^./, (value) =>
              value.toUpperCase(),
            )
        : "Straight";

  return (
    <section
      className="playground-feel-strip"
      aria-label="Feel and groove"
    >
      <div className="playground-feel-strip__identity">
        <span>FEEL</span>
        <strong>{currentLabel}</strong>
        <small>
          {Math.round(
            appliedHumanization * 100,
          )}
          % human ·{" "}
          {Math.round(appliedSwing * 100)}
          % swing
        </small>
      </div>

      <div
        className="playground-feel-presets"
        aria-label="Feel preset"
      >
        {PLAYGROUND_FEELS.map((entry) => (
          <button
            type="button"
            key={entry.id}
            className={
              feel === entry.id
                ? "is-active"
                : ""
            }
            disabled={disabled}
            onClick={() =>
              setFeel(entry.id)
            }
            aria-pressed={
              feel === entry.id
            }
            aria-label={
              entry.label + " feel"
            }
            title={entry.description}
          >
            <strong>{entry.label}</strong>
            <small>
              {entry.description}
            </small>
          </button>
        ))}
      </div>

      <label className="playground-feel-swing">
        <span>Swing</span>
        <input
          type="range"
          min="0"
          max="50"
          step="1"
          value={swing}
          disabled={disabled}
          onChange={(event) =>
            setSwing(
              Number(
                event.currentTarget.value,
              ),
            )
          }
          aria-label="Feel swing"
        />
        <output>{swing}%</output>
      </label>

      <div className="playground-feel-actions">
        <button
          type="button"
          className="playground-feel-apply"
          disabled={
            disabled ||
            appliedMatchesDraft
          }
          onClick={applyFeel}
          aria-label="Apply selected feel"
        >
          Apply
        </button>
        <button
          type="button"
          disabled={
            disabled ||
            !hasAppliedFeel
          }
          onClick={resetFeel}
          aria-label="Reset feel to straight"
        >
          Reset
        </button>
      </div>
    </section>
  );
}

function PlaygroundMixStrip({
  laneId,
  onNotice,
}: {
  laneId: string;
  onNotice: (message: string) => void;
}) {
  const sequencer = useSequencerSnapshot();
  const mixer = useMixerSnapshot();
  const lane =
    sequencer.pattern.lanes.find(
      (entry) => entry.id === laneId,
    ) ?? sequencer.pattern.lanes[0];
  if (!lane) return null;

  const drumDefinition =
    SEQUENCER_LANES.find(
      (entry) => entry.id === lane.id,
    );
  const melodicDefinition =
    MELODIC_LANES.find(
      (entry) => entry.id === lane.id,
    );
  if (!drumDefinition && !melodicDefinition) {
    return null;
  }

  const drumVoice = drumDefinition?.voice;
  const values = drumVoice
    ? mixer.state.channels[drumVoice]
    : clampLaneMix(lane.mix);
  const label = drumDefinition
    ? displayLaneName(drumDefinition)
    : melodicDefinition?.name ?? "TRACK";
  const color = drumVoice
    ? LANE_COLORS[drumVoice]
    : melodicDefinition
      ? MELODIC_COLORS[melodicDefinition.track]
      : "#7867ff";

  const setValue = (
    parameter: LaneMixParameter,
    value: number,
  ) => {
    if (drumVoice) {
      mixerStore.setChannelValue(
        drumVoice,
        parameter,
        value,
      );
    } else {
      sequencerStore.setMelodicMixValue(
        lane.id,
        parameter,
        value,
      );
    }
  };

  const resetTrackMix = () => {
    if (drumVoice) {
      mixerStore.resetPlaygroundChannel(drumVoice);
    } else {
      sequencerStore.resetMelodicMix(lane.id);
    }
    onNotice(label + " mix reset");
  };

  return (
    <section
      className="playground-mix-strip"
      aria-label={"Mix controls for " + label}
      style={
        {
          "--lane-color": color,
        } as CSSProperties
      }
    >
      <div className="playground-mix-strip__identity">
        <span>MIX</span>
        <strong>{label}</strong>
        <small>
          {drumVoice ? "DRUM" : "MELODIC"}
        </small>
      </div>

      <label className="playground-mix-control">
        <span>Level</span>
        <input
          type="range"
          min="-18"
          max="6"
          step="0.5"
          value={values.gainDb}
          onChange={(event) =>
            setValue(
              "gainDb",
              Number(event.currentTarget.value),
            )
          }
          aria-label={label + " level"}
        />
        <output>
          {values.gainDb > 0 ? "+" : ""}
          {Math.round(values.gainDb * 10) / 10} dB
        </output>
      </label>

      <label className="playground-mix-control">
        <span>Pan</span>
        <input
          type="range"
          min="-1"
          max="1"
          step="0.05"
          value={values.pan}
          onChange={(event) =>
            setValue(
              "pan",
              Number(event.currentTarget.value),
            )
          }
          aria-label={label + " pan"}
        />
        <output>
          {Math.abs(values.pan) < 0.025
            ? "C"
            : values.pan < 0
              ? "L" +
                Math.round(
                  Math.abs(values.pan) * 100,
                )
              : "R" +
                Math.round(values.pan * 100)}
        </output>
      </label>

      <label className="playground-mix-control">
        <span>Space</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={values.reverbSend}
          onChange={(event) =>
            setValue(
              "reverbSend",
              Number(event.currentTarget.value),
            )
          }
          aria-label={label + " space"}
        />
        <output>
          {Math.round(values.reverbSend * 100)}%
        </output>
      </label>

      <div
        className="playground-mix-monitor"
        aria-label={label + " monitoring"}
      >
        <button
          type="button"
          className={
            (
              drumVoice
                ? mixer.state.channels[drumVoice].muted
                : Boolean(lane.muted)
            )
              ? "is-active"
              : ""
          }
          onClick={() => {
            const muted = drumVoice
              ? mixer.state.channels[drumVoice].muted
              : Boolean(lane.muted);
            if (drumVoice) {
              mixerStore.setChannelMute(
                drumVoice,
                !muted,
              );
            } else {
              sequencerStore.toggleMute(lane.id);
            }
            onNotice(
              label +
                (muted
                  ? " unmuted"
                  : " muted"),
            );
          }}
          aria-pressed={
            drumVoice
              ? mixer.state.channels[drumVoice].muted
              : Boolean(lane.muted)
          }
          aria-label={"Mute " + label}
        >
          M
        </button>
        <button
          type="button"
          className={
            (
              drumVoice
                ? mixer.state.channels[drumVoice].solo
                : Boolean(lane.solo)
            )
              ? "is-active"
              : ""
          }
          onClick={() => {
            const solo = drumVoice
              ? mixer.state.channels[drumVoice].solo
              : Boolean(lane.solo);
            if (drumVoice) {
              mixerStore.setChannelSolo(
                drumVoice,
                !solo,
              );
            } else {
              sequencerStore.toggleSolo(lane.id);
            }
            onNotice(
              label +
                (solo
                  ? " solo off"
                  : " solo"),
            );
          }}
          aria-pressed={
            drumVoice
              ? mixer.state.channels[drumVoice].solo
              : Boolean(lane.solo)
          }
          aria-label={"Solo " + label}
        >
          S
        </button>
        <button
          type="button"
          onClick={resetTrackMix}
          aria-label={"Reset " + label + " mix"}
        >
          Reset
        </button>
      </div>

      <label className="playground-mix-control playground-mix-control--master">
        <span>Master</span>
        <input
          type="range"
          min="-12"
          max="6"
          step="0.5"
          value={mixer.state.masterGainDb}
          onChange={(event) =>
            mixerStore.setMasterGainDb(
              Number(event.currentTarget.value),
            )
          }
          aria-label="Playground master level"
        />
        <output>
          {mixer.state.masterGainDb > 0 ? "+" : ""}
          {Math.round(
            mixer.state.masterGainDb * 10,
          ) / 10} dB
        </output>
      </label>
    </section>
  );
}

export function PlaygroundSurface({
  onOpenStudio,
}: PlaygroundSurfaceProps) {
  const sequencer = useSequencerSnapshot();
  const transport = useTransportSnapshot();
  const gridRecord = useGridRecorderSnapshot();
  const midi = useMidiSnapshot();
  const drumSounds = useDrumSoundSnapshot();
  const sampleAssets = useSampleAssetSnapshot();
  const history = useGenerationHistorySnapshot();
  const arrangement = useArrangementSnapshot();
  const arrangementPlayback =
    useArrangementPlaybackSnapshot();
  const project = useProjectSnapshot();
  const [style, setStyle] = useState<BeatStyleId>("funk");
  const [remixCounter, setRemixCounter] = useState(0);
  const [remixPulse, setRemixPulse] = useState(0);
  const [auditionStep, setAuditionStep] =
    useState<number | undefined>(undefined);
  const [soundIndex, setSoundIndex] =
    useState<Record<DrumVoiceId, number>>(INITIAL_SOUND_INDEX);
  const [notice, setNoticeState] = useState("Tap a pad. Draw a beat.");
  const [padPulse, setPadPulse] = useState({
    voice: null as DrumVoiceId | null,
    serial: 0,
  });
  const [selectedVoice, setSelectedVoice] =
    useState<DrumVoiceId>("kick");
  const [mixLaneId, setMixLaneId] =
    useState("lane-kick");
  const [selectedMelodicLaneId, setSelectedMelodicLaneId] =
    useState<string | null>(null);
  const [selectedMelodicNote, setSelectedMelodicNote] =
    useState<{ laneId: string; stepIndex: number } | null>(null);
  const [melodicMidiRecording, setMelodicMidiRecording] =
    useState(false);
  const melodicMidiTakeCounterRef = useRef(0);
  const melodicMidiTakeRef = useRef<{
    gestureId: string;
    laneId: string;
  } | null>(null);
  const melodicMidiActiveNotesRef = useRef(
    new Map<
      number,
      {
        laneId: string;
        startTick: number;
        stepIndex: number;
        velocity: number;
      }
    >(),
  );
  const [melodicDurationSteps, setMelodicDurationSteps] =
    useState(4);
  const [melodicPitchCursor, setMelodicPitchCursor] =
    useState<Record<MelodicTrackId, number>>({
      bass: 36,
      chords: 60,
      lead: 72,
    });
  const [melodicOctaveShift, setMelodicOctaveShift] =
    useState<Record<MelodicTrackId, number>>({
      bass: 0,
      chords: 0,
      lead: 0,
    });
  const [chordShape, setChordShape] =
    useState<ChordShapeId>("minor");
  const [songDraggingSectionId, setSongDraggingSectionId] =
    useState<string | null>(null);
  const melodicResizeCounterRef = useRef(0);
  const melodicResizeRef = useRef<{
    pointerId: number;
    laneId: string;
    stepIndex: number;
    startX: number;
    cellWidth: number;
    startDurationSteps: number;
    currentDurationSteps: number;
    gestureId: string;
  } | null>(null);
  const patternRecordingActive = () =>
    gridRecorder.getSnapshot().status !== "idle" ||
    melodicMidiTakeRef.current !== null;

  const selectDrumTrack = (
    voice: DrumVoiceId,
  ) => {
    setSelectedVoice(voice);
    const definition = SEQUENCER_LANES.find(
      (entry) => entry.voice === voice,
    );
    if (definition) {
      setMixLaneId(definition.id);
    }
  };

  const [stepPage, setStepPage] = useState(0);
  const [soundPickerVoice, setSoundPickerVoice] =
    useState<DrumVoiceId | null>(null);
  const [soundLoading, setSoundLoading] =
    useState<BundledSampleId | null>(null);
  const [lastRemixSourceNodeId, setLastRemixSourceNodeId] =
    useState<string | null>(null);
  const activePatternBank = history.activePatternBank;
  const patternBanks = history.patternBanks;
  const paintCounterRef = useRef(0);
  const auditionStartRef = useRef<number | null>(null);
  const auditionIntervalRef = useRef<number | null>(null);
  const paintRef = useRef<{
    pointerId: number;
    desiredOn: boolean;
    lastKey: string;
    gestureId: string;
    mode:
      | "paint"
      | "pending"
      | "shiftSelect"
      | "velocity"
      | "pageSwipe";
    dynamic?: "accent" | "ghost";
    pointerType: string;
    swipeDirection?: -1 | 1;
    startLaneId: string;
    startStepIndex: number;
    startX: number;
    startY: number;
    startVelocity?: number;
  } | null>(null);
  const laneClipboardRef = useRef<LaneClipboardData | null>(null);
  const [selectedSteps, setSelectedSteps] = useState<
    SequencerStepSelection[]
  >([]);
  const [selectionClipboard, setSelectionClipboard] =
    useState<StepSelectionClipboardData | null>(null);
  const selectionDragRef =
    useRef<SelectionDragState | null>(null);
  const [laneClipboardLabel, setLaneClipboardLabel] =
    useState<string | null>(null);
  const [touchEditMode, setTouchEditMode] =
    useState<TouchEditMode>("draw");
  const [hapticsEnabled, setHapticsEnabled] =
    useState(readHapticsPreference);
  const [countInEnabled, setCountInEnabled] =
    useState(false);
  const [countInBeat, setCountInBeat] =
    useState<number | null>(null);
  const [followPlayhead, setFollowPlayhead] =
    useState(true);
  const [padRepeatDivision, setPadRepeatDivision] =
    useState<PadRepeatDivision>(0);
  const [momentaryMonitor, setMomentaryMonitor] =
    useState<MomentaryMonitorMode | null>(null);
  const [projectNameDraft, setProjectNameDraft] =
    useState(project.name);
  const [projectMenuOpen, setProjectMenuOpen] =
    useState(false);
  const [finishOpen, setFinishOpen] =
    useState(false);
  const [projectBusy, setProjectBusy] =
    useState<string | null>(null);
  const [sessionHydratedProjectId, setSessionHydratedProjectId] =
    useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [firstUseHintVisible, setFirstUseHintVisible] =
    useState(() => !readDiscoverySeen());
  const [favoriteSounds, setFavoriteSounds] =
    useState<SoundIndexCollection>(() =>
      readSoundIndexCollection(
        FAVORITE_SOUNDS_STORAGE_KEY,
      ),
    );
  const [recentSounds, setRecentSounds] =
    useState<SoundIndexCollection>(() =>
      readSoundIndexCollection(
        RECENT_SOUNDS_STORAGE_KEY,
      ),
    );
  const [stepContext, setStepContext] =
    useState<StepContextState | null>(null);
  const tapTimesRef = useRef<number[]>([]);
  const firstUseActionsRef = useRef(new Set<string>());
  const noticeHistoryRef = useRef({
    message: "",
    at: 0,
  });
  const stepContextTimerRef = useRef<number | null>(null);
  const stepContextPendingRef = useRef<{
    pointerId: number;
    laneId: string;
    stepIndex: number;
    x: number;
    y: number;
  } | null>(null);
  const focusRef = useRef<HTMLElement | null>(null);
  const helpButtonRef = useRef<HTMLButtonElement | null>(null);
  const helpDialogRef = useRef<HTMLElement | null>(null);
  const previousHelpFocusRef = useRef<HTMLElement | null>(null);
  const padLongPressTimerRef = useRef<number | null>(null);
  const padLongPressRef = useRef<{
    voice: DrumVoiceId;
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  const suppressPadClickRef = useRef<DrumVoiceId | null>(null);
  const countInTimerRef = useRef<number | null>(null);
  const countInTokenRef = useRef(0);
  const padRepeatTimerRef = useRef<number | null>(null);
  const padRepeatRef = useRef<{
    voice: DrumVoiceId;
    pointerId: number;
  } | null>(null);
  const momentaryMonitorRef = useRef<{
    laneId: string;
    pointerId: number;
    mode: MomentaryMonitorMode;
  } | null>(null);

  const setNotice = (message: string) => {
    if (!message) {
      noticeHistoryRef.current = {
        message: "",
        at: performance.now(),
      };
      setNoticeState("");
      return;
    }

    const now = performance.now();
    if (
      noticeHistoryRef.current.message === message &&
      now - noticeHistoryRef.current.at < 900
    ) {
      return;
    }

    noticeHistoryRef.current = {
      message,
      at: now,
    };
    setNoticeState(message);
  };

  const completeFirstUseAction = (action: string) => {
    if (!firstUseHintVisible) return;
    firstUseActionsRef.current.add(action);

    if (firstUseActionsRef.current.size < 2) return;
    persistDiscoverySeen();
    window.setTimeout(() => {
      setFirstUseHintVisible(false);
    }, 550);
  };

  const dismissFirstUseHint = () => {
    persistDiscoverySeen();
    setFirstUseHintVisible(false);
  };

  const clearStepContextLongPress = () => {
    if (stepContextTimerRef.current !== null) {
      window.clearTimeout(stepContextTimerRef.current);
      stepContextTimerRef.current = null;
    }
    stepContextPendingRef.current = null;
  };

  const openStepContext = (
    laneId: string,
    stepIndex: number,
    x: number,
    y: number,
  ) => {
    if (patternRecordingActive()) {
      return;
    }
    const definition = SEQUENCER_LANES.find(
      (lane) => lane.id === laneId,
    );
    if (definition) {
      setSelectedVoice(definition.voice);
    }

    const width = 220;
    const hasHit =
      sequencerStore.getStepVelocity(
        laneId,
        stepIndex,
      ) !== undefined;
    const height = hasHit ? 382 : 220;
    setStepContext({
      laneId,
      stepIndex,
      x: Math.max(
        8,
        Math.min(
          x,
          Math.max(8, globalThis.innerWidth - width - 8),
        ),
      ),
      y: Math.max(
        8,
        Math.min(
          y,
          Math.max(8, globalThis.innerHeight - height - 8),
        ),
      ),
    });
    setSoundPickerVoice(null);
  };

  const beginStepContextLongPress = (
    event: ReactPointerEvent<HTMLButtonElement>,
    laneId: string,
    stepIndex: number,
  ) => {
    if (
      event.pointerType === "mouse" ||
      touchEditMode !== "draw"
    ) {
      return;
    }

    clearStepContextLongPress();
    stepContextPendingRef.current = {
      pointerId: event.pointerId,
      laneId,
      stepIndex,
      x: event.clientX,
      y: event.clientY,
    };
    stepContextTimerRef.current = window.setTimeout(() => {
      const pending = stepContextPendingRef.current;
      if (
        !pending ||
        pending.pointerId !== event.pointerId
      ) {
        return;
      }

      const gesture = paintRef.current;
      if (
        gesture &&
        gesture.pointerId === event.pointerId
      ) {
        sequencerStore.endPaintGesture(
          gesture.gestureId,
        );
        paintRef.current = null;
      }

      clearStepContextLongPress();
      openStepContext(
        laneId,
        stepIndex,
        pending.x,
        pending.y,
      );
      pulseHaptic([8, 18, 8]);
    }, 480);
  };

  const moveStepContextLongPress = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const pending = stepContextPendingRef.current;
    if (
      !pending ||
      pending.pointerId !== event.pointerId
    ) {
      return;
    }

    if (
      Math.hypot(
        event.clientX - pending.x,
        event.clientY - pending.y,
      ) > 11
    ) {
      clearStepContextLongPress();
    }
  };

  const recordSoundUse = (
    voice: DrumVoiceId,
    index: number,
  ) => {
    setRecentSounds((current) => {
      const next = {
        ...current,
        [voice]: [
          index,
          ...current[voice].filter(
            (entry) => entry !== index,
          ),
        ].slice(0, 5),
      };
      persistSoundIndexCollection(
        RECENT_SOUNDS_STORAGE_KEY,
        next,
      );
      return next;
    });
  };

  const toggleFavoriteSound = (
    voice: DrumVoiceId,
    index: number,
  ) => {
    setFavoriteSounds((current) => {
      const active = current[voice].includes(index);
      const next = {
        ...current,
        [voice]: active
          ? current[voice].filter(
              (entry) => entry !== index,
            )
          : [index, ...current[voice]].slice(0, 8),
      };
      persistSoundIndexCollection(
        FAVORITE_SOUNDS_STORAGE_KEY,
        next,
      );
      return next;
    });
  };

  const applyStepContextAction = (
    action: "normal" | "accent" | "ghost" | "toggle",
  ) => {
    if (patternRecordingActive()) {
      setStepContext(null);
      setNotice("Stop recording to edit grid steps");
      return;
    }
    const context = stepContext;
    if (!context) return;

    const { laneId, stepIndex } = context;
    if (action === "toggle") {
      const on =
        sequencerStore.getStepVelocity(
          laneId,
          stepIndex,
        ) !== undefined;
      setStep(
        laneId,
        stepIndex,
        !on,
        !on,
      );
    } else if (action === "normal") {
      const lane = sequencerStore
        .getSnapshot()
        .pattern.lanes.find(
          (entry) => entry.id === laneId,
        );
      if (
        lane?.lock.rhythm ||
        lane?.lock.dynamics
      ) {
        setNotice(
          "Unlock rhythm/dynamics to edit this step",
        );
      } else {
        sequencerStore.setStepVelocity(
          laneId,
          stepIndex,
          0.76,
        );
        setNotice("Normal hit");
      }
    } else {
      const changed =
        sequencerStore.paintStepDynamic(
          laneId,
          stepIndex,
          action,
        );
      setNotice(
        changed
          ? action === "accent"
            ? "Accent hit"
            : "Ghost hit"
          : "Unlock rhythm/dynamics to edit this step",
      );
    }

    setStepContext(null);
    completeFirstUseAction("context");
  };

  const pulseHaptic = (
    duration: number | number[] = 8,
  ) => {
    if (!hapticsEnabled) return;
    if (
      typeof globalThis.navigator?.vibrate !==
      "function"
    ) {
      return;
    }
    try {
      globalThis.navigator.vibrate(duration);
    } catch {
      // Vibration is best-effort and unsupported on many browsers.
    }
  };

  const cycleTouchEditMode = () => {
    setTouchEditMode((current) => {
      const next: TouchEditMode =
        current === "draw"
          ? "select"
          : current === "select"
            ? "accent"
            : current === "accent"
              ? "ghost"
              : "draw";
      pulseHaptic(7);
      setNotice(
        next === "draw"
          ? "Touch mode · Draw"
          : next === "select"
            ? "Touch mode · Select"
            : next === "accent"
              ? "Touch mode · Accent"
              : "Touch mode · Ghost",
      );
      return next;
    });
  };

  const toggleHaptics = () => {
    setHapticsEnabled((current) => {
      const next = !current;
      persistHapticsPreference(next);
      if (next) {
        if (
          typeof globalThis.navigator?.vibrate ===
          "function"
        ) {
          try {
            globalThis.navigator.vibrate(12);
          } catch {
            // Ignore unsupported vibration calls.
          }
        }
      }
      setNotice(next ? "Haptics on" : "Haptics off");
      return next;
    });
  };

  const clearPadLongPress = () => {
    if (padLongPressTimerRef.current !== null) {
      window.clearTimeout(padLongPressTimerRef.current);
      padLongPressTimerRef.current = null;
    }
    padLongPressRef.current = null;
  };

  const clearPadRepeat = () => {
    if (padRepeatTimerRef.current !== null) {
      window.clearInterval(padRepeatTimerRef.current);
      padRepeatTimerRef.current = null;
    }
    padRepeatRef.current = null;
  };

  const cancelCountIn = () => {
    countInTokenRef.current += 1;
    if (countInTimerRef.current !== null) {
      window.clearTimeout(countInTimerRef.current);
      countInTimerRef.current = null;
    }
    setCountInBeat(null);
  };

  const cyclePadRepeatDivision = () => {
    setPadRepeatDivision((current) => {
      const next: PadRepeatDivision =
        current === 0
          ? 1
          : current === 1
            ? 2
            : current === 2
              ? 4
              : 0;
      pulseHaptic(6);
      setNotice(
        next === 0
          ? "Pad repeat off"
          : next === 1
            ? "Pad repeat · 1/4"
            : next === 2
              ? "Pad repeat · 1/8"
              : "Pad repeat · 1/16",
      );
      return next;
    });
  };

  const startCountIn = async (
    onComplete?: () => void,
  ) => {
    cancelPatternPreview();
    cancelCountIn();

    const token = ++countInTokenRef.current;
    setCountInBeat(0);

    try {
      await audioTransport.unlockAudio();
    } catch {
      if (countInTokenRef.current === token) {
        setCountInBeat(null);
      }
      setNotice("Audio could not start");
      return;
    }

    if (countInTokenRef.current !== token) return;

    const beats = Math.max(1, transport.meter.numerator);
    const beatMs =
      (60_000 / Math.max(30, transport.bpm)) *
      (4 / Math.max(1, transport.meter.denominator));

    const countBeat = (index: number) => {
      if (countInTokenRef.current !== token) return;

      if (index >= beats) {
        countInTimerRef.current = null;
        setCountInBeat(null);
        void audioTransport.start().then(() => {
          if (
            audioTransport.getSnapshot().status === "running"
          ) {
            onComplete?.();
          } else {
            if (
              gridRecorder.getSnapshot().status === "armed"
            ) {
              gridRecorder.cancel();
            }
            setNotice("Audio could not start");
          }
        });
        return;
      }

      const beat = index + 1;
      setCountInBeat(beat);
      pulseHaptic(beat === 1 ? 10 : 5);
      void drumEngine.triggerNow(
        "closedHat",
        beat === 1 ? 0.82 : 0.56,
      );

      countInTimerRef.current = window.setTimeout(
        () => countBeat(index + 1),
        beatMs,
      );
    };

    countBeat(0);
  };

  const stopGridRecording = () => {
    const count = gridRecorder.stop();
    pulseHaptic(8);
    setNotice(
      count > 0
        ? "Recorded " +
            count +
            (count === 1 ? " hit" : " hits") +
            " · Undo restores the take"
        : "Empty recording",
    );
  };

  const toggleGridRecording = async () => {
    if (melodicMidiRecording) {
      stopMelodicMidiRecording();
    }
    if (gridRecord.status === "recording") {
      stopGridRecording();
      return;
    }

    if (gridRecord.status === "armed") {
      cancelCountIn();
      gridRecorder.cancel();
      setNotice("Recording cancelled");
      return;
    }

    cancelPatternPreview();
    setSoundPickerVoice(null);
    setStepContext(null);
    clearStepContextLongPress();

    if (midiStore.getSnapshot().recording) {
      midiStore.stopRecording();
    }

    if (playing) {
      gridRecorder.start();
      pulseHaptic([8, 22, 8]);
      setNotice("Recording · play the pads");
      return;
    }

    audioTransport.seekToAbsoluteTick(
      pageStart *
        TRANSPORT_SCHEDULER_CONFIG.pulseTicks,
    );
    gridRecorder.arm();

    if (countInEnabled) {
      setNotice("Record armed · one bar count-in");
      await startCountIn(() => {
        gridRecorder.start();
        setNotice("Recording · play the pads");
      });
      return;
    }

    await audioTransport.start();
    if (
      audioTransport.getSnapshot().status === "running"
    ) {
      gridRecorder.start();
      pulseHaptic([8, 22, 8]);
      setNotice("Recording · play the pads");
    } else {
      gridRecorder.cancel();
      setNotice("Audio could not start");
    }
  };

  const enablePlaygroundMidi = async () => {
    if (!midi.supported) {
      setNotice("Web MIDI is unavailable in this browser");
      return;
    }

    await midiStore.enable();
    const next = midiStore.getSnapshot();
    setNotice(
      next.status === "ready"
        ? next.selectedInputName
          ? "MIDI ready · " + next.selectedInputName
          : "MIDI ready"
        : next.lastError ?? "MIDI could not be enabled",
    );
  };

  const setGridRecordMode = (mode: GridRecordMode) => {
    gridRecorder.setMode(mode);
    setNotice(
      mode === "erase"
        ? "Record mode · erase hits"
        : "Record mode · overdub",
    );
  };

  const setGridRecordQuantize = (
    quantize: GridRecordQuantize,
  ) => {
    gridRecorder.setQuantize(quantize);
    setNotice(
      quantize === "off"
        ? "Quantize off · timing preserved"
        : "Quantize " + quantize,
    );
  };

  const togglePlaybackFlow = () => {
    if (countInBeat !== null) {
      cancelCountIn();
      if (gridRecord.status === "armed") {
        gridRecorder.cancel();
      }
      setNotice("Count-in cancelled");
      return;
    }

    if (playing) {
      if (gridRecord.status === "recording") {
        stopGridRecording();
      }
      if (melodicMidiRecording) {
        stopMelodicMidiRecording();
      }
      audioTransport.pause();
      return;
    }

    if (countInEnabled) {
      void startCountIn();
    } else {
      void audioTransport.start();
    }
  };

  const restartPlayback = () => {
    if (melodicMidiRecording) {
      stopMelodicMidiRecording();
    }
    cancelCountIn();
    cancelPatternPreview();
    audioTransport.restartFromBeginning();
    if (followPlayhead) {
      setStepPage(0);
    }
    pulseHaptic(8);
    setNotice("Back to step 1");
  };

  const stopVisualAudition = () => {
    if (auditionStartRef.current !== null) {
      window.clearTimeout(auditionStartRef.current);
      auditionStartRef.current = null;
    }
    if (auditionIntervalRef.current !== null) {
      window.clearInterval(auditionIntervalRef.current);
      auditionIntervalRef.current = null;
    }
    setAuditionStep(undefined);
  };

  const cancelPatternPreview = () => {
    stopVisualAudition();
    drumEngine.cancelAudition();
  };

  const openStudio = () => {
    if (melodicMidiRecording) {
      stopMelodicMidiRecording();
    }
    if (finishOpen) {
      renderStore.cancel();
      setFinishOpen(false);
    }
    cancelPatternPreview();
    onOpenStudio();
  };

  const undoPattern = () => {
    if (melodicMidiRecording) {
      setNotice("Stop melodic recording before Undo");
      return;
    }
    if (gridRecorder.getSnapshot().status !== "idle") {
      setNotice("Stop recording before Undo");
      return;
    }
    if (!sequencerStore.getSnapshot().canUndo) return;
    cancelPatternPreview();
    sequencerStore.undo();
    setNotice("Undone");
  };

  const redoPattern = () => {
    if (melodicMidiRecording) {
      setNotice("Stop melodic recording before Redo");
      return;
    }
    if (gridRecorder.getSnapshot().status !== "idle") {
      setNotice("Stop recording before Redo");
      return;
    }
    if (!sequencerStore.getSnapshot().canRedo) return;
    cancelPatternPreview();
    sequencerStore.redo();
    setNotice("Redone");
  };

  const startVisualAudition = (
    stepCount: number,
    bpm: number,
  ) => {
    stopVisualAudition();

    const safeSteps = Math.max(1, stepCount);
    const stepMs =
      (60_000 / Math.max(30, Math.min(300, bpm))) / 4;

    auditionStartRef.current = window.setTimeout(() => {
      auditionStartRef.current = null;
      let step = 0;
      setAuditionStep(step);

      auditionIntervalRef.current =
        window.setInterval(() => {
          step += 1;
          if (step >= safeSteps) {
            stopVisualAudition();
            return;
          }
          setAuditionStep(step);
        }, stepMs);
    }, 35);
  };

  useEffect(() => {
    const releaseTransientPointer = (
      event: PointerEvent,
      cancelled: boolean,
    ) => {
      finishPaint(event.pointerId, cancelled);

      const repeat = padRepeatRef.current;
      if (repeat?.pointerId === event.pointerId) {
        clearPadRepeat();
        if (cancelled) {
          suppressPadClickRef.current = null;
        }
      }

      const longPress = padLongPressRef.current;
      if (longPress?.pointerId === event.pointerId) {
        clearPadLongPress();
      }

      const monitoring = momentaryMonitorRef.current;
      if (
        monitoring?.pointerId === event.pointerId
      ) {
        if (monitoring.mode === "mute") {
          sequencerStore.setTransientMute(
            monitoring.laneId,
            false,
          );
        } else {
          sequencerStore.setTransientSolo(
            monitoring.laneId,
            false,
          );
        }
        momentaryMonitorRef.current = null;
        setMomentaryMonitor(null);
        audioTransport.invalidateScheduledEvents();
      }
    };

    const finishPointer = (event: PointerEvent) => {
      releaseTransientPointer(event, false);
    };
    const cancelPointer = (event: PointerEvent) => {
      releaseTransientPointer(event, true);
    };

    window.addEventListener("pointerup", finishPointer);
    window.addEventListener("pointercancel", cancelPointer);
    return () => {
      window.removeEventListener("pointerup", finishPointer);
      window.removeEventListener("pointercancel", cancelPointer);
      const gesture = paintRef.current;
      if (gesture) {
        sequencerStore.endPaintGesture(gesture.gestureId);
        paintRef.current = null;
      }
      if (auditionStartRef.current !== null) {
        window.clearTimeout(auditionStartRef.current);
      }
      if (auditionIntervalRef.current !== null) {
        window.clearInterval(auditionIntervalRef.current);
      }
      clearPadLongPress();
      clearPadRepeat();
      clearStepContextLongPress();
      countInTokenRef.current += 1;
      if (countInTimerRef.current !== null) {
        window.clearTimeout(countInTimerRef.current);
      }
      sequencerStore.clearTransientMonitoring();
      drumEngine.cancelAudition();
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 1800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const handleDiscoveryKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSoundPickerVoice(null);
        setProjectMenuOpen(false);
        setStepContext(null);
        setHelpOpen(false);
        return;
      }

      if (
        event.key === "?" ||
        (event.code === "Slash" && event.shiftKey)
      ) {
        const target = event.target;
        const typingTarget =
          target instanceof HTMLElement &&
          (
            target.isContentEditable ||
            target.matches(
              "input, textarea, select, [role='textbox'], [role='spinbutton']",
            )
          );

        if (typingTarget) return;

        event.preventDefault();
        setProjectMenuOpen(false);
        setStepContext(null);
        setSoundPickerVoice(null);
        setHelpOpen((current) => !current);
      }
    };

    window.addEventListener(
      "keydown",
      handleDiscoveryKeys,
    );
    return () =>
      window.removeEventListener(
        "keydown",
        handleDiscoveryKeys,
      );
  }, []);

  useEffect(() => {
    if (!helpOpen) return;

    previousHelpFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const previousOverflow =
      document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    window.requestAnimationFrame(() => {
      const dialog = helpDialogRef.current;
      if (!dialog) return;
      const first = dialog.querySelector<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      );
      first?.focus();
    });

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = helpDialogRef.current;
      if (!dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])",
        ),
      ).filter(
        (element) =>
          element.offsetParent !== null ||
          element === document.activeElement,
      );

      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", trapFocus, true);
    return () => {
      document.removeEventListener(
        "keydown",
        trapFocus,
        true,
      );
      document.documentElement.style.overflow =
        previousOverflow;
      const previous = previousHelpFocusRef.current;
      previousHelpFocusRef.current = null;
      window.requestAnimationFrame(() => {
        if (previous?.isConnected) {
          previous.focus();
        } else {
          helpButtonRef.current?.focus();
        }
      });
    };
  }, [helpOpen]);

  useEffect(() => {
    setSoundIndex((current) => {
      const next = { ...current };
      let changed = false;

      for (const pad of DRUM_PADS) {
        const voice = pad.voice;
        const source = drumSounds.sourceStates[voice];
        const presets = SOUND_PRESETS[voice];
        let resolved = -1;

        if (
          (source.mode === "sample" ||
            source.mode === "hybrid") &&
          source.sample
        ) {
          const asset = sampleAssets.assets.find(
            (entry) =>
              entry.reference.id === source.sample?.assetId,
          );
          const bundledSampleId =
            asset?.reference.bundledSampleId;

          if (bundledSampleId) {
            resolved = presets.findIndex(
              (preset) => {
                if (
                  preset.bundledSampleId !==
                    bundledSampleId ||
                  soundPresetSource(preset) !==
                    source.mode
                ) {
                  return false;
                }

                if (source.mode !== "hybrid") {
                  return true;
                }

                return (
                  synthPresetSpecMatches(
                    voice,
                    preset,
                    drumSounds.specs[voice],
                  ) &&
                  Math.abs(
                    (preset.synthGainDb ?? -9) -
                      source.synthGainDb,
                  ) < 0.0001
                );
              },
            );
          } else if (source.mode === "sample") {
            const assetLabel =
              asset?.reference.name.replace(
                /\.wav$/i,
                "",
              );

            if (assetLabel) {
              resolved = presets.findIndex(
                (preset) =>
                  soundPresetSource(preset) ===
                    "sample" &&
                  Boolean(preset.bundledSampleId) &&
                  preset.label === assetLabel,
              );
            }
          }
        } else if (source.mode === "synth") {
          resolved = presets.findIndex((preset) =>
            synthPresetMatches(
              voice,
              preset,
              drumSounds.specs[voice],
            ),
          );
        }

        if (next[voice] !== resolved) {
          next[voice] = resolved;
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [
    drumSounds.revision,
    sampleAssets.revision,
  ]);

  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) return;

      const target = event.target;
      const textEditingTarget =
        target instanceof HTMLElement &&
        (
          target.isContentEditable ||
          target.matches(
            "input, textarea, [role='textbox'], [role='spinbutton']",
          )
        );
      if (textEditingTarget) return;

      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) {
          redoPattern();
        } else {
          undoPattern();
        }
      } else if (key === "y") {
        event.preventDefault();
        event.stopPropagation();
        redoPattern();
      }
    };

    window.addEventListener(
      "keydown",
      handleHistoryShortcut,
      true,
    );
    return () =>
      window.removeEventListener(
        "keydown",
        handleHistoryShortcut,
        true,
      );
  }, []);

  useEffect(() => {
    const definition = SEQUENCER_LANES.find(
      (entry) => entry.voice === selectedVoice,
    );
    if (definition) {
      setMixLaneId(definition.id);
    }
  }, [selectedVoice]);

  useEffect(() => {
    const keyToVoice = new Map(
      DRUM_PADS.map((pad) => [
        pad.key.toLowerCase(),
        pad.voice,
      ]),
    );

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const typingTarget =
        target instanceof HTMLElement &&
        (
          target.isContentEditable ||
          target.matches(
            "input, textarea, select, [role='textbox'], [role='spinbutton'], [role='slider']",
          )
        );
      const recording =
        gridRecorder.getSnapshot().status === "recording";

      if (
        event.repeat ||
        typingTarget ||
        (
          eventTargetConsumesKeyboard(event.target) &&
          !recording
        )
      ) {
        return;
      }

      const voice = keyToVoice.get(event.key.toLowerCase());
      if (!voice) return;

      event.preventDefault();
      selectDrumTrack(voice);
      setSoundPickerVoice(null);
      setPadPulse((current) => ({
        voice,
        serial: current.serial + 1,
      }));
      const velocity = event.shiftKey ? 1 : 0.88;
      pulseHaptic(velocity >= 0.9 ? 11 : 7);
      void inputActionRouter.trigger(
        { kind: "pad", voice },
        velocity,
      );
    };

    window.addEventListener("keydown", handleKeyDown);
    return () =>
      window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const styleVector = sequencer.pattern.provenance?.style;
    if (!styleVector) {
      setStyle("funk");
      return;
    }

    const strongest = Object.entries(styleVector).sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0] as BeatStyleId | undefined;

    if (strongest) {
      setStyle(strongest);
    }
  }, [sequencer.pattern.provenance]);

  const recentRemixes = useMemo(
    () =>
      history.nodes
        .filter((node) => node.operation === "reroll")
        .slice(-6)
        .reverse(),
    [history.nodes],
  );

  const activeStep =
    transport.status === "running"
      ? Math.floor(
          transport.position.absoluteTick /
            TRANSPORT_SCHEDULER_CONFIG.pulseTicks,
        ) % sequencer.lengthSteps
      : undefined;
  const visualStep = activeStep ?? auditionStep;

  const playing = playbackCoordinator.isPlayingForMode(
    "create",
    transport,
  );

  useEffect(() => {
    return () => {
      if (
        gridRecorder.getSnapshot().status !== "idle"
      ) {
        gridRecorder.stop();
      }
    };
  }, []);

  useEffect(() => {
    if (
      gridRecord.status === "recording" &&
      transport.status !== "running" &&
      countInBeat === null
    ) {
      gridRecorder.stop();
    }
  }, [
    countInBeat,
    gridRecord.status,
    transport.status,
  ]);

  useEffect(() => {
    if (playing) {
      stopVisualAudition();
      if (countInBeat !== null) {
        cancelCountIn();
      }
    }
  }, [playing, countInBeat]);

  useEffect(() => {
    const handleFlowShortcut = (event: KeyboardEvent) => {
      if (event.repeat) return;

      if (event.code === "Space") {
        if (eventTargetConsumesKeyboard(event.target)) {
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.shiftKey) {
          restartPlayback();
        } else {
          togglePlaybackFlow();
        }
        return;
      }

      if (
        event.key.toLowerCase() !== "r" ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      const typingTarget =
        target instanceof HTMLElement &&
        (
          target.isContentEditable ||
          target.matches(
            "input, textarea, select, [role='textbox'], [role='spinbutton']",
          )
        );

      if (typingTarget) return;

      event.preventDefault();
      if (event.shiftKey) {
        void toggleGridRecording();
      } else {
        restartPlayback();
      }
    };

    window.addEventListener(
      "keydown",
      handleFlowShortcut,
      true,
    );
    return () =>
      window.removeEventListener(
        "keydown",
        handleFlowShortcut,
        true,
      );
  }, [
    countInBeat,
    countInEnabled,
    followPlayhead,
    gridRecord.status,
    playing,
    stepPage,
    transport.bpm,
    transport.meter.denominator,
    transport.meter.numerator,
  ]);

  const lanes = useMemo(
    () =>
      SEQUENCER_LANES.map((definition) => ({
        definition,
        lane: sequencer.pattern.lanes.find(
          (entry) => entry.id === definition.id,
        ),
      })).filter((entry) => Boolean(entry.lane)),
    [sequencer.pattern],
  );

  const melodicLanes = useMemo(
    () =>
      MELODIC_LANES.map((definition) => ({
        definition,
        lane: sequencer.pattern.lanes.find(
          (entry) => entry.id === definition.id,
        ),
      })).filter((entry) => Boolean(entry.lane)),
    [sequencer.pattern],
  );

  const pageSize = 16;
  const pageCount = Math.max(
    1,
    Math.ceil(sequencer.lengthSteps / pageSize),
  );
  const pageStart = stepPage * pageSize;
  const wholeBarPattern =
    sequencer.lengthSteps >= pageSize &&
    sequencer.lengthSteps % pageSize === 0;
  const atBarLimit =
    sequencer.lengthSteps + pageSize >
    SEQUENCER_MAX_STEPS;
  const editRecordingLocked =
    gridRecord.status !== "idle" ||
    melodicMidiRecording;
  const playgroundSong =
    isPlaygroundSongBlueprint(
      arrangement.blueprint,
    );
  const selectedSongSection =
    arrangement.blueprint?.sections.find(
      (section) =>
        section.id ===
        arrangement.selectedSectionId,
    ) ??
    arrangement.blueprint?.sections[0];
  const selectedSongBank =
    playgroundSong
      ? playgroundSongBankForPatternId(
          selectedSongSection
            ?.patternSequence[0],
        )
      : undefined;
  const songBarTicks =
    PPQ *
    Math.max(1, transport.meter.numerator) *
    (4 /
      Math.max(
        1,
        transport.meter.denominator,
      ));
  const songTotalBars =
    arrangement.totalTicks > 0
      ? arrangement.totalTicks /
        Math.max(1, songBarTicks)
      : 0;
  const songProgress =
    arrangement.totalTicks > 0
      ? Math.max(
          0,
          Math.min(
            1,
            arrangementPlayback.playheadTick /
              arrangement.totalTicks,
          ),
        )
      : 0;
  const selectedDefinition =
    SEQUENCER_LANES.find(
      (definition) => definition.voice === selectedVoice,
    ) ?? SEQUENCER_LANES[0];
  const selectedLane = sequencer.pattern.lanes.find(
    (lane) => lane.id === selectedDefinition.id,
  );
  const selectedSound =
    SOUND_PRESETS[selectedVoice][soundIndex[selectedVoice]]
      ?.label ?? "Custom";
  const selectedMelodicDefinition =
    MELODIC_LANES.find(
      (definition) =>
        definition.id === selectedMelodicLaneId,
    );
  const selectedMelodicLane =
    selectedMelodicDefinition
      ? sequencer.pattern.lanes.find(
          (lane) =>
            lane.id === selectedMelodicDefinition.id,
        )
      : undefined;
  const selectedMelodicEvent =
    selectedMelodicNote &&
    selectedMelodicNote.laneId ===
      selectedMelodicLaneId
      ? selectedMelodicLane?.events.find(
          (event) =>
            Math.round(
              event.tick /
                FOUNDATION_STEP_TICKS,
            ) === selectedMelodicNote.stepIndex,
        )
      : undefined;
  const harmonicContext =
    sequencer.pattern.harmonicContext ?? {
      rootPitchClass: 0,
      scaleId: "minor" as ScaleId,
      lockToScale: true,
    };
  const selectedMelodicPreset =
    selectedMelodicDefinition
      ? (
          MELODIC_PRESETS[
            selectedMelodicDefinition.track
          ].find(
            (preset) =>
              preset.id ===
              selectedMelodicLane?.instrumentPresetId,
          ) ??
          MELODIC_PRESETS[
            selectedMelodicDefinition.track
          ][0]
        )
      : undefined;
  const melodicPitchRows =
    selectedMelodicDefinition
      ? (() => {
          const chordTrack =
            selectedMelodicDefinition.track ===
            "chords";
          const rowCount =
            chordTrack ? 17 : 13;
          const lowerOffset =
            chordTrack ? 4 : 6;
          const center =
            melodicPitchCursor[
              selectedMelodicDefinition.track
            ] +
            melodicOctaveShift[
              selectedMelodicDefinition.track
            ] *
              12;
          const bottom = Math.max(
            selectedMelodicDefinition.minPitchMidi,
            Math.min(
              selectedMelodicDefinition.maxPitchMidi -
                (rowCount - 1),
              center - lowerOffset,
            ),
          );
          return Array.from(
            { length: rowCount },
            (_, index) =>
              Math.min(
                selectedMelodicDefinition.maxPitchMidi,
                bottom +
                  (rowCount - 1) -
                  index,
              ),
          );
        })().filter(
          (pitch, index, values) =>
            index === 0 ||
            pitch !== values[index - 1],
        )
      : [];

  const favoriteSoundIndices =
    favoriteSounds[selectedVoice];
  const recentSoundIndices =
    recentSounds[selectedVoice].filter(
      (index) => !favoriteSoundIndices.includes(index),
    );
  const favoriteProjectIds = project.favoriteProjectIds;
  const currentProjectFavorite =
    Boolean(project.projectId) &&
    favoriteProjectIds.includes(project.projectId ?? "");
  const recentProjects = useMemo(
    () => project.summaries.slice(0, 6),
    [project.summaries],
  );
  const repeatLabel =
    padRepeatDivision === 0
      ? "Off"
      : padRepeatDivision === 1
        ? "1/4"
        : padRepeatDivision === 2
          ? "1/8"
          : "1/16";
  const hapticsSupported =
    typeof globalThis.navigator?.vibrate === "function";
  const selectedStepKeys = useMemo(
    () => new Set(selectedSteps.map(selectionKey)),
    [selectedSteps],
  );

  const selectedVariation = useMemo(() => {
    const events = selectedSteps.flatMap((entry) => {
      const lane = sequencer.pattern.lanes.find(
        (candidate) => candidate.id === entry.laneId,
      );
      const event = lane?.events.find(
        (candidate) =>
          Math.round(
            candidate.tick / FOUNDATION_STEP_TICKS,
          ) === entry.stepIndex,
      );
      return event ? [event] : [];
    });

    const shared = (
      values: readonly number[],
      fallback: number,
    ): number | null => {
      if (values.length === 0) return fallback;
      const first = values[0] ?? fallback;
      return values.every(
        (value) =>
          Math.abs(value - first) < 0.0001,
      )
        ? first
        : null;
    };

    return {
      probability: shared(
        events.map(
          (event) => event.probability ?? 1,
        ),
        1,
      ),
      ratchetCount: shared(
        events.map(
          (event) =>
            Math.max(
              1,
              event.ratchetCount ?? 1,
            ),
        ),
        1,
      ),
      flamOffsetUs: shared(
        events.map(
          (event) =>
            Math.max(
              0,
              event.flamOffsetUs ?? 0,
            ),
        ),
        0,
      ),
    };
  }, [selectedSteps, sequencer.pattern]);

  const stepEventFor = (
    laneId: string,
    stepIndex: number,
  ) =>
    sequencer.pattern.lanes
      .find((lane) => lane.id === laneId)
      ?.events.find(
        (event) =>
          Math.round(
            event.tick / FOUNDATION_STEP_TICKS,
          ) === stepIndex,
      );

  const contextStepEvent = stepContext
    ? stepEventFor(
        stepContext.laneId,
        stepContext.stepIndex,
      )
    : undefined;

  const selectionInRectangle = (
    startLaneId: string,
    endLaneId: string,
    startStep: number,
    endStep: number,
  ): SequencerStepSelection[] => {
    const startLane = SEQUENCER_LANES.findIndex(
      (entry) => entry.id === startLaneId,
    );
    const endLane = SEQUENCER_LANES.findIndex(
      (entry) => entry.id === endLaneId,
    );
    if (startLane < 0 || endLane < 0) return [];

    const laneMin = Math.min(startLane, endLane);
    const laneMax = Math.max(startLane, endLane);
    const stepMin = Math.min(startStep, endStep);
    const stepMax = Math.max(startStep, endStep);
    const result: SequencerStepSelection[] = [];

    for (
      let laneIndex = laneMin;
      laneIndex <= laneMax;
      laneIndex += 1
    ) {
      const definition = SEQUENCER_LANES[laneIndex];
      if (!definition) continue;
      const lane = sequencer.pattern.lanes.find(
        (entry) => entry.id === definition.id,
      );
      if (!lane) continue;

      for (const event of lane.events) {
        const stepIndex = Math.round(
          event.tick / FOUNDATION_STEP_TICKS,
        );
        if (
          stepIndex >= stepMin &&
          stepIndex <= stepMax
        ) {
          result.push({
            laneId: lane.id,
            stepIndex,
          });
        }
      }
    }

    return result;
  };

  const applySelectionRectangle = (
    drag: SelectionDragState,
    laneId: string,
    stepIndex: number,
  ) => {
    const rectangle = selectionInRectangle(
      drag.startLaneId,
      laneId,
      drag.startStepIndex,
      stepIndex,
    );
    const next = new Map(
      drag.base.map((entry) => [
        selectionKey(entry),
        entry,
      ]),
    );

    if (drag.mode === "replace") {
      next.clear();
    }

    for (const entry of rectangle) {
      const key = selectionKey(entry);
      if (drag.mode === "remove") {
        next.delete(key);
      } else {
        next.set(key, entry);
      }
    }

    setSelectedSteps([...next.values()]);
  };

  const beginSelection = (
    event: ReactPointerEvent<HTMLButtonElement>,
    laneId: string,
    stepIndex: number,
  ) => {
    if (patternRecordingActive()) {
      setNotice("Stop recording before selecting notes");
      return;
    }
    if (
      event.pointerType === "mouse" &&
      event.button !== 0
    ) {
      return;
    }

    clearStepContextLongPress();
    setStepContext(null);
    const key = laneId + ":" + stepIndex;
    const additive =
      touchEditMode === "select" ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey;
    const mode: SelectionDragMode =
      additive && selectedStepKeys.has(key)
        ? "remove"
        : additive
          ? "add"
          : "replace";
    const drag: SelectionDragState = {
      pointerId: event.pointerId,
      startLaneId: laneId,
      startStepIndex: stepIndex,
      mode,
      base:
        mode === "replace"
          ? []
          : selectedSteps,
    };

    selectionDragRef.current = drag;
    event.currentTarget.setPointerCapture?.(
      event.pointerId,
    );
    applySelectionRectangle(
      drag,
      laneId,
      stepIndex,
    );
    event.preventDefault();
  };

  const selectCurrentBar = () => {
    if (patternRecordingActive()) {
      setNotice("Stop recording before selecting notes");
      return;
    }
    const next = selectionInRectangle(
      SEQUENCER_LANES[0]?.id ?? "",
      SEQUENCER_LANES[
        SEQUENCER_LANES.length - 1
      ]?.id ?? "",
      pageStart,
      Math.min(
        sequencer.lengthSteps - 1,
        pageStart + pageSize - 1,
      ),
    );
    setSelectedSteps(next);
    setNotice(
      next.length +
        (next.length === 1 ? " note selected" : " notes selected") +
        " · bar " +
        (stepPage + 1),
    );
  };

  const selectCurrentTrack = () => {
    if (patternRecordingActive()) {
      setNotice("Stop recording before selecting notes");
      return;
    }
    const lane = sequencer.pattern.lanes.find(
      (entry) => entry.id === selectedDefinition.id,
    );
    const next =
      lane?.events.map((event) => ({
        laneId: lane.id,
        stepIndex: Math.round(
          event.tick / FOUNDATION_STEP_TICKS,
        ),
      })) ?? [];
    setSelectedSteps(next);
    setNotice(
      next.length +
        (next.length === 1 ? " note selected" : " notes selected") +
        " · " +
        displayLaneName(selectedDefinition),
    );
  };

  const selectAllNotes = () => {
    if (patternRecordingActive()) {
      setNotice("Stop recording before selecting notes");
      return;
    }
    const next = selectionInRectangle(
      SEQUENCER_LANES[0]?.id ?? "",
      SEQUENCER_LANES[
        SEQUENCER_LANES.length - 1
      ]?.id ?? "",
      0,
      Math.max(0, sequencer.lengthSteps - 1),
    );
    setSelectedSteps(next);
    setNotice(
      next.length +
        (next.length === 1
          ? " note selected"
          : " notes selected") +
        " · whole pattern",
    );
  };

  const clearSelection = () => {
    selectionDragRef.current = null;
    setSelectedSteps([]);
  };

  const batchEditingAllowed = () => {
    if (!patternRecordingActive()) {
      return true;
    }
    setNotice("Stop recording before batch editing");
    return false;
  };

  const batchDeleteSelection = () => {
    if (!batchEditingAllowed()) return;
    if (selectedSteps.length === 0) return;
    if (
      sequencerStore.deleteSelectedSteps(
        selectedSteps,
      )
    ) {
      const count = selectedSteps.length;
      clearSelection();
      pulseHaptic(6);
      setNotice(
        "Deleted " +
          count +
          (count === 1 ? " note" : " notes"),
      );
    } else {
      setNotice("Selected notes are locked");
    }
  };

  const batchAdjustVelocity = (delta: number) => {
    if (!batchEditingAllowed()) return;
    if (selectedSteps.length === 0) return;
    if (
      sequencerStore.adjustSelectedVelocity(
        selectedSteps,
        delta,
      )
    ) {
      setNotice(
        delta > 0
          ? "Selection louder"
          : "Selection softer",
      );
    } else {
      setNotice("Selected dynamics are locked");
    }
  };

  const batchSetDynamic = (
    dynamic: SequencerStepDynamic,
  ) => {
    if (!batchEditingAllowed()) return;
    if (selectedSteps.length === 0) return;
    if (
      sequencerStore.setSelectedDynamic(
        selectedSteps,
        dynamic,
      )
    ) {
      setNotice(
        dynamic === "accent"
          ? "Selection accented"
          : dynamic === "ghost"
            ? "Selection ghosted"
            : "Selection normalized",
      );
    } else {
      setNotice("Selected dynamics are locked");
    }
  };

  const batchMoveSelection = (deltaSteps: number) => {
    if (!batchEditingAllowed()) return;
    if (selectedSteps.length === 0) return;
    const moved = sequencerStore.moveSelectedSteps(
      selectedSteps,
      deltaSteps,
    );
    if (!moved) {
      setNotice(
        "Move blocked by an edge, lock, or occupied step",
      );
      return;
    }

    setSelectedSteps(moved);
    setNotice(
      deltaSteps < 0
        ? "Selection moved left"
        : "Selection moved right",
    );
  };

  const batchCopySelection = () => {
    if (!batchEditingAllowed()) return;
    if (selectedSteps.length === 0) return;
    const clipboard =
      sequencerStore.copySelectedSteps(
        selectedSteps,
      );
    if (!clipboard) {
      setNotice("Nothing selected to copy");
      return;
    }

    setSelectionClipboard(clipboard);
    setNotice(
      "Copied " +
        clipboard.entries.length +
        (clipboard.entries.length === 1
          ? " note"
          : " notes"),
    );
  };

  const batchPasteSelection = () => {
    if (!batchEditingAllowed()) return;
    if (!selectionClipboard) return;
    const pasted =
      sequencerStore.pasteSelectedSteps(
        selectionClipboard,
        pageStart,
      );

    if (!pasted) {
      setNotice(
        "Paste blocked by a track lock or pattern edge",
      );
      return;
    }

    setSelectedSteps(pasted);
    setNotice(
      "Pasted " +
        pasted.length +
        (pasted.length === 1
          ? " note"
          : " notes") +
        " · bar " +
        (stepPage + 1),
    );
  };

  const batchDuplicateSelection = () => {
    if (!batchEditingAllowed()) return;
    if (selectedSteps.length === 0) return;
    const steps = selectedSteps.map(
      (entry) => entry.stepIndex,
    );
    const width =
      Math.max(...steps) - Math.min(...steps) + 1;
    const duplicated =
      sequencerStore.duplicateSelectedSteps(
        selectedSteps,
        Math.max(1, width),
      );

    if (!duplicated) {
      setNotice(
        "Duplicate blocked by an edge, lock, or occupied step",
      );
      return;
    }

    setSelectedSteps(duplicated);
    setNotice(
      "Duplicated " +
        duplicated.length +
        (duplicated.length === 1
          ? " note"
          : " notes"),
    );
  };

  const batchNudgeTiming = (deltaUs: number) => {
    if (!batchEditingAllowed()) return;
    if (selectedSteps.length === 0) return;
    if (
      sequencerStore.nudgeSelectedTiming(
        selectedSteps,
        deltaUs,
      )
    ) {
      setNotice(
        deltaUs < 0
          ? "Selection moved earlier"
          : "Selection moved later",
      );
    } else {
      setNotice("Selected timing is locked");
    }
  };

  const cycleSelectedChance = () => {
    if (!batchEditingAllowed()) return;
    const current =
      selectedVariation.probability;
    const next =
      current === null
        ? 0.75
        : current >= 0.99
          ? 0.75
          : current >= 0.74
            ? 0.5
            : current >= 0.49
              ? 0.25
              : 1;
    if (
      sequencerStore.applySelectedVariation(
        selectedSteps,
        { probability: next },
      )
    ) {
      setNotice(
        "Selection chance · " +
          Math.round(next * 100) +
          "%",
      );
    } else {
      setNotice(
        "Chance is blocked by a rhythm lock",
      );
    }
  };

  const cycleSelectedRepeat = () => {
    if (!batchEditingAllowed()) return;
    const current =
      selectedVariation.ratchetCount;
    const next =
      current === null
        ? 2
        : current >= 4
          ? 1
          : Math.max(
              1,
              Math.round(current) + 1,
            );
    if (
      sequencerStore.applySelectedVariation(
        selectedSteps,
        { ratchetCount: next },
      )
    ) {
      setNotice(
        "Selection repeat · ×" + next,
      );
    } else {
      setNotice(
        "Repeat is blocked by a rhythm lock",
      );
    }
  };

  const cycleSelectedFlam = () => {
    if (!batchEditingAllowed()) return;
    const current =
      selectedVariation.flamOffsetUs;
    const next =
      current === null
        ? 15_000
        : current <= 0
          ? 15_000
          : current <= 15_000
            ? 30_000
            : 0;
    if (
      sequencerStore.applySelectedVariation(
        selectedSteps,
        { flamOffsetUs: next },
      )
    ) {
      setNotice(
        next > 0
          ? "Selection flam · " +
              Math.round(next / 1000) +
              " ms"
          : "Selection flam off",
      );
    } else {
      setNotice(
        "Flam is blocked by a timing lock",
      );
    }
  };

  const applyStepContextVariation = (
    kind: "chance" | "repeat" | "flam",
  ) => {
    if (patternRecordingActive()) {
      setStepContext(null);
      setNotice(
        "Stop recording to edit step variation",
      );
      return;
    }
    const context = stepContext;
    if (!context) return;
    const event = stepEventFor(
      context.laneId,
      context.stepIndex,
    );
    if (!event) {
      setNotice("Add a hit before adding variation");
      setStepContext(null);
      return;
    }

    const selection = [{
      laneId: context.laneId,
      stepIndex: context.stepIndex,
    }];
    let changed = false;
    let noticeText = "";

    if (kind === "chance") {
      const current = event.probability ?? 1;
      const next =
        current >= 0.99
          ? 0.75
          : current >= 0.74
            ? 0.5
            : current >= 0.49
              ? 0.25
              : 1;
      changed =
        sequencerStore.applySelectedVariation(
          selection,
          { probability: next },
        );
      noticeText =
        "Chance · " +
        Math.round(next * 100) +
        "%";
    } else if (kind === "repeat") {
      const current = Math.max(
        1,
        event.ratchetCount ?? 1,
      );
      const next =
        current >= 4 ? 1 : current + 1;
      changed =
        sequencerStore.applySelectedVariation(
          selection,
          { ratchetCount: next },
        );
      noticeText = "Repeat · ×" + next;
    } else {
      const current = Math.max(
        0,
        event.flamOffsetUs ?? 0,
      );
      const next =
        current <= 0
          ? 15_000
          : current <= 15_000
            ? 30_000
            : 0;
      changed =
        sequencerStore.applySelectedVariation(
          selection,
          { flamOffsetUs: next },
        );
      noticeText =
        next > 0
          ? "Flam · " +
              Math.round(next / 1000) +
              " ms"
          : "Flam off";
    }

    setNotice(
      changed
        ? noticeText
        : kind === "flam"
          ? "Flam is blocked by a timing lock"
          : "Variation is blocked by a rhythm lock",
    );
    setStepContext(null);
  };

  const melodicDurationLabel = (
    steps: number,
  ): string =>
    steps === 1
      ? "1/16"
      : steps === 2
        ? "1/8"
        : steps === 4
          ? "1/4"
          : steps === 8
            ? "1/2"
            : steps === 16
              ? "1 BAR"
              : steps + " steps";

  const chordPitchesForRoot = (
    rootPitch: number,
  ): number[] => {
    const shape =
      CHORD_SHAPES.find(
        (entry) => entry.id === chordShape,
      ) ?? CHORD_SHAPES[1]!;
    return shape.intervals.map(
      (interval) => rootPitch + interval,
    );
  };

  const melodicEventPitches = (
    definition: MelodicLaneDefinition,
    event: typeof selectedMelodicEvent,
  ): number[] => {
    if (!event) return [];
    return event.pitchesMidi &&
      event.pitchesMidi.length > 0
      ? [...event.pitchesMidi]
      : [
          event.pitchMidi ??
            definition.defaultPitchMidi,
        ];
  };

  const auditionMelodic = (
    definition: MelodicLaneDefinition,
    pitches: readonly number[],
    durationSteps = melodicDurationSteps,
    velocity = 0.76,
  ) => {
    const durationSeconds =
      Math.max(1, durationSteps) *
      (60 / Math.max(30, transport.bpm) / 4);
    void melodicEngine.triggerNow(
      definition.id,
      pitches,
      durationSeconds,
      velocity,
    );
  };

  const commitMelodicMidiNote = (
    note: number,
    active: {
      laneId: string;
      startTick: number;
      stepIndex: number;
      velocity: number;
    },
    endTick: number,
    gestureId: string,
  ) => {
    const definition = MELODIC_LANES.find(
      (entry) => entry.id === active.laneId,
    );
    if (!definition) return false;

    const durationSteps = Math.max(
      1,
      Math.round(
        Math.max(
          FOUNDATION_STEP_TICKS,
          endTick - active.startTick,
        ) / FOUNDATION_STEP_TICKS,
      ),
    );
    const existing =
      sequencerStore.getMelodicEvent(
        active.laneId,
        active.stepIndex,
      );
    const chordPitches =
      definition.track === "chords"
        ? [
            ...new Set([
              ...(existing?.pitchesMidi ??
                (existing?.pitchMidi !== undefined
                  ? [existing.pitchMidi]
                  : [])),
              note,
            ]),
          ]
        : undefined;
    const rootPitch =
      definition.track === "chords"
        ? existing?.pitchMidi ?? note
        : note;
    const existingDuration =
      existing?.durationTicks
        ? Math.max(
            1,
            Math.round(
              existing.durationTicks /
                FOUNDATION_STEP_TICKS,
            ),
          )
        : 1;

    return sequencerStore.setMelodicNote(
      active.laneId,
      active.stepIndex,
      rootPitch,
      definition.track === "chords"
        ? Math.max(
            existingDuration,
            durationSteps,
          )
        : durationSteps,
      chordPitches,
      gestureId,
      active.velocity,
    );
  };

  const stopMelodicMidiRecording = () => {
    const take = melodicMidiTakeRef.current;
    if (!take) {
      midiStore.setMelodicNoteCaptureActive(false);
      setMelodicMidiRecording(false);
      return;
    }

    const endTick =
      audioTransport.getCurrentAbsoluteTick();
    let committed = 0;
    for (const [note, active] of
      melodicMidiActiveNotesRef.current) {
      melodicEngine.noteOff(
        active.laneId,
        note,
      );
      if (
        commitMelodicMidiNote(
          note,
          active,
          endTick,
          take.gestureId,
        )
      ) {
        committed += 1;
      }
    }

    melodicMidiActiveNotesRef.current.clear();
    sequencerStore.endPaintGesture(
      take.gestureId,
    );
    melodicMidiTakeRef.current = null;
    midiStore.setMelodicNoteCaptureActive(false);
    setMelodicMidiRecording(false);
    pulseHaptic(8);
    setNotice(
      committed > 0
        ? "Melodic take saved · Undo restores the take"
        : "Melodic recording stopped",
    );
  };

  const toggleMelodicMidiRecording =
    async () => {
      if (melodicMidiRecording) {
        stopMelodicMidiRecording();
        return;
      }

      if (!selectedMelodicDefinition) {
        setNotice("Open a melodic track first");
        return;
      }

      if (!midi.supported) {
        setNotice(
          "Web MIDI is unavailable in this browser",
        );
        return;
      }

      if (gridRecord.status !== "idle") {
        setNotice(
          "Stop drum recording before melodic recording",
        );
        return;
      }

      if (midi.status !== "ready") {
        await midiStore.enable();
      }
      if (
        midiStore.getSnapshot().status !== "ready"
      ) {
        setNotice(
          midiStore.getSnapshot().lastError ??
            "MIDI could not be enabled",
        );
        return;
      }

      if (midiStore.getSnapshot().recording) {
        midiStore.stopRecording();
      }

      const gestureId =
        "melodic-midi-" +
        String(
          ++melodicMidiTakeCounterRef.current,
        ).padStart(6, "0");
      sequencerStore.beginPaintGesture(
        gestureId,
      );
      melodicMidiTakeRef.current = {
        gestureId,
        laneId: selectedMelodicDefinition.id,
      };
      melodicMidiActiveNotesRef.current.clear();
      midiStore.setMelodicNoteCaptureActive(true);

      if (!playing) {
        audioTransport.seekToAbsoluteTick(
          pageStart *
            TRANSPORT_SCHEDULER_CONFIG.pulseTicks,
        );
        await audioTransport.start();
      }

      if (
        audioTransport.getSnapshot().status !==
        "running"
      ) {
        sequencerStore.endPaintGesture(
          gestureId,
        );
        melodicMidiTakeRef.current = null;
        midiStore.setMelodicNoteCaptureActive(false);
        setNotice("Audio could not start");
        return;
      }

      setMelodicMidiRecording(true);
      pulseHaptic([8, 22, 8]);
      setNotice(
        "Melodic REC · play your MIDI keyboard",
      );
    };

  useEffect(() => {
    return midiStore.subscribeNoteEvents(
      (event) => {
        const take =
          melodicMidiTakeRef.current;
        if (
          !melodicMidiRecording ||
          !take
        ) {
          return;
        }

        const definition = MELODIC_LANES.find(
          (entry) => entry.id === take.laneId,
        );
        if (!definition) return;

        if (event.type === "noteOn") {
          if (
            melodicMidiActiveNotesRef.current.has(
              event.note,
            )
          ) {
            return;
          }

          const absoluteTick =
            audioTransport.getCurrentAbsoluteTick();
          const pattern =
            sequencerStore.getSnapshot().pattern;
          const patternLengthTicks =
            Math.max(
              FOUNDATION_STEP_TICKS,
              pattern.lengthTicks,
            );
          const localTick =
            ((absoluteTick %
              patternLengthTicks) +
              patternLengthTicks) %
            patternLengthTicks;
          const stepIndex = Math.max(
            0,
            Math.min(
              sequencerStore.getSnapshot()
                .lengthSteps - 1,
              Math.round(
                localTick /
                  FOUNDATION_STEP_TICKS,
              ),
            ),
          );

          melodicMidiActiveNotesRef.current.set(
            event.note,
            {
              laneId: take.laneId,
              startTick: absoluteTick,
              stepIndex,
              velocity: Math.max(
                0.05,
                event.velocity,
              ),
            },
          );
          setMelodicPitchCursor(
            (current) => ({
              ...current,
              [definition.track]:
                event.note,
            }),
          );
          void melodicEngine.noteOn(
            take.laneId,
            event.note,
            Math.max(
              0.05,
              event.velocity,
            ),
          );
          return;
        }

        const active =
          melodicMidiActiveNotesRef.current.get(
            event.note,
          );
        if (!active) return;
        const endTick =
          audioTransport.getCurrentAbsoluteTick();

        melodicEngine.noteOff(
          active.laneId,
          event.note,
        );

        if (
          commitMelodicMidiNote(
            event.note,
            active,
            endTick,
            take.gestureId,
          )
        ) {
          setSelectedMelodicNote({
            laneId: active.laneId,
            stepIndex: active.stepIndex,
          });
        }
        melodicMidiActiveNotesRef.current.delete(
          event.note,
        );
      },
    );
  }, [
    melodicMidiRecording,
    sequencer.lengthSteps,
  ]);

  useEffect(
    () => () => {
      midiStore.setMelodicNoteCaptureActive(
        false,
      );
      const take =
        melodicMidiTakeRef.current;
      for (const [note, active] of
        melodicMidiActiveNotesRef.current) {
        melodicEngine.noteOff(
          active.laneId,
          note,
          true,
        );
      }
      melodicMidiActiveNotesRef.current.clear();
      if (take) {
        sequencerStore.endPaintGesture(
          take.gestureId,
        );
      }
    },
    [],
  );

  const selectMelodicTrack = (
    laneId: string,
  ) => {
    if (melodicMidiRecording) {
      stopMelodicMidiRecording();
    }
    const definition = MELODIC_LANES.find(
      (entry) => entry.id === laneId,
    );
    if (!definition) return;
    setSelectedMelodicLaneId(laneId);
    setMixLaneId(laneId);
    setSelectedMelodicNote(null);
    setSoundPickerVoice(null);
    clearSelection();
    setNotice(
      definition.name + " piano roll",
    );
  };

  const createMelodicNoteAt = (
    laneId: string,
    stepIndex: number,
    pitchMidi: number,
  ) => {
    if (
      gridRecorder.getSnapshot().status !== "idle" ||
      melodicMidiRecording
    ) {
      setNotice("Stop recording before editing melodic notes");
      return;
    }

    const definition = MELODIC_LANES.find(
      (entry) => entry.id === laneId,
    );
    if (!definition) return;

    const pitches =
      definition.track === "chords"
        ? chordPitchesForRoot(pitchMidi)
        : undefined;
    const changed = sequencerStore.setMelodicNote(
      laneId,
      stepIndex,
      pitchMidi,
      melodicDurationSteps,
      pitches,
    );
    if (!changed) {
      setNotice("Melodic note is locked or unchanged");
      return;
    }

    const event = sequencerStore.getMelodicEvent(
      laneId,
      stepIndex,
    );
    setSelectedMelodicLaneId(laneId);
    setMixLaneId(laneId);
    setSelectedMelodicNote({
      laneId,
      stepIndex,
    });
    setMelodicPitchCursor((current) => ({
      ...current,
      [definition.track]:
        event?.pitchMidi ?? pitchMidi,
    }));
    const auditionPitches = event
      ? melodicEventPitches(definition, event)
      : pitches ?? [pitchMidi];
    auditionMelodic(
      definition,
      auditionPitches,
      melodicDurationSteps,
      event?.velocity ?? 0.76,
    );
    pulseHaptic(6);
    setNotice(
      definition.name +
        " · " +
        auditionPitches
          .map(midiNoteLabel)
          .join(" / ") +
        " · " +
        melodicDurationLabel(melodicDurationSteps),
    );
  };

  const removeSelectedMelodicNote = () => {
    if (melodicMidiRecording) {
      setNotice("Stop recording before editing melodic notes");
      return;
    }
    if (!selectedMelodicNote) return;
    if (
      sequencerStore.removeMelodicNote(
        selectedMelodicNote.laneId,
        selectedMelodicNote.stepIndex,
      )
    ) {
      setSelectedMelodicNote(null);
      pulseHaptic(5);
      setNotice("Melodic note removed");
    } else {
      setNotice("Melodic note is locked");
    }
  };

  const changeSelectedMelodicPitch = (
    delta: number,
  ) => {
    if (melodicMidiRecording) {
      setNotice("Stop recording before editing melodic notes");
      return;
    }
    if (
      !selectedMelodicDefinition ||
      !selectedMelodicNote ||
      !selectedMelodicEvent
    ) {
      return;
    }

    const currentPitch =
      selectedMelodicEvent.pitchMidi ??
      selectedMelodicDefinition.defaultPitchMidi;
    const nextPitch =
      currentPitch + delta;
    if (
      !sequencerStore.setMelodicPitch(
        selectedMelodicNote.laneId,
        selectedMelodicNote.stepIndex,
        nextPitch,
      )
    ) {
      return;
    }

    const event = sequencerStore.getMelodicEvent(
      selectedMelodicNote.laneId,
      selectedMelodicNote.stepIndex,
    );
    if (!event) return;
    setMelodicPitchCursor((current) => ({
      ...current,
      [selectedMelodicDefinition.track]:
        event.pitchMidi ?? nextPitch,
    }));
    auditionMelodic(
      selectedMelodicDefinition,
      melodicEventPitches(
        selectedMelodicDefinition,
        event,
      ),
      Math.max(
        1,
        Math.round(
          (event.durationTicks ??
            FOUNDATION_STEP_TICKS) /
            FOUNDATION_STEP_TICKS,
        ),
      ),
      event.velocity,
    );
  };

  const applyChordShape = (
    nextShape: ChordShapeId,
  ) => {
    if (melodicMidiRecording) {
      setNotice("Stop recording before editing melodic notes");
      return;
    }
    setChordShape(nextShape);
    if (
      !selectedMelodicDefinition ||
      selectedMelodicDefinition.track !== "chords" ||
      !selectedMelodicNote ||
      !selectedMelodicEvent
    ) {
      return;
    }

    const shape =
      CHORD_SHAPES.find(
        (entry) => entry.id === nextShape,
      ) ?? CHORD_SHAPES[1]!;
    const root =
      selectedMelodicEvent.pitchMidi ??
      selectedMelodicDefinition.defaultPitchMidi;
    const pitches = shape.intervals.map(
      (interval) => root + interval,
    );
    if (
      sequencerStore.setMelodicChordPitches(
        selectedMelodicNote.laneId,
        selectedMelodicNote.stepIndex,
        pitches,
      )
    ) {
      const event = sequencerStore.getMelodicEvent(
        selectedMelodicNote.laneId,
        selectedMelodicNote.stepIndex,
      );
      if (event) {
        auditionMelodic(
          selectedMelodicDefinition,
          melodicEventPitches(
            selectedMelodicDefinition,
            event,
          ),
          Math.max(
            1,
            Math.round(
              (event.durationTicks ??
                FOUNDATION_STEP_TICKS) /
                FOUNDATION_STEP_TICKS,
            ),
          ),
          event.velocity,
        );
      }
    }
  };

  const chooseMelodicPreset = (
    definition: MelodicLaneDefinition,
    presetId: string,
  ) => {
    if (melodicMidiRecording) {
      setNotice("Stop recording before changing the instrument");
      return;
    }

    const next =
      MELODIC_PRESETS[definition.track].find(
        (preset) => preset.id === presetId,
      );
    if (!next) return;

    if (
      sequencerStore.setMelodicInstrumentPreset(
        definition.id,
        next.id,
      )
    ) {
      const pitches =
        selectedMelodicNote?.laneId ===
          definition.id &&
        selectedMelodicEvent
          ? melodicEventPitches(
              definition,
              selectedMelodicEvent,
            )
          : [
              melodicPitchCursor[
                definition.track
              ],
            ];
      auditionMelodic(
        definition,
        pitches,
        Math.min(4, melodicDurationSteps),
      );
      setNotice(
        definition.name + " sound · " + next.label,
      );
    }
  };

  const cycleMelodicPreset = (
    definition: MelodicLaneDefinition,
    direction: -1 | 1,
  ) => {
    const lane = sequencer.pattern.lanes.find(
      (entry) => entry.id === definition.id,
    );
    if (!lane) return;

    const presets =
      MELODIC_PRESETS[definition.track];
    const currentIndex = Math.max(
      0,
      presets.findIndex(
        (preset) =>
          preset.id === lane.instrumentPresetId,
      ),
    );
    const next =
      presets[
        (currentIndex + direction + presets.length) %
          presets.length
      ];
    if (!next) return;

    chooseMelodicPreset(
      definition,
      next.id,
    );
  };

  const setMelodicHarmony = (
    update: {
      rootPitchClass?: number;
      scaleId?: ScaleId;
      lockToScale?: boolean;
    },
  ) => {
    if (melodicMidiRecording) {
      setNotice("Stop recording before changing key or scale");
      return;
    }
    if (
      sequencerStore.setHarmonicContext(update)
    ) {
      setSelectedMelodicNote(null);
      setNotice("Key / scale updated");
    }
  };

  const beginMelodicResize = (
    event: ReactPointerEvent<HTMLElement>,
    laneId: string,
    stepIndex: number,
  ) => {
    if (
      gridRecorder.getSnapshot().status !== "idle" ||
      melodicMidiRecording
    ) {
      return;
    }
    const note = sequencerStore.getMelodicEvent(
      laneId,
      stepIndex,
    );
    const grid = event.currentTarget.closest(
      ".playground-piano-grid",
    ) as HTMLElement | null;
    if (!note || !grid) return;

    const visibleSteps = Math.max(
      1,
      Math.min(
        pageSize,
        sequencer.lengthSteps - pageStart,
      ),
    );
    const rect = grid.getBoundingClientRect();
    const startDurationSteps = Math.max(
      1,
      Math.round(
        (note.durationTicks ??
          FOUNDATION_STEP_TICKS) /
          FOUNDATION_STEP_TICKS,
      ),
    );
    const gestureId =
      "melodic-resize-" +
      String(
        ++melodicResizeCounterRef.current,
      ).padStart(6, "0");

    sequencerStore.beginPaintGesture(
      gestureId,
    );
    melodicResizeRef.current = {
      pointerId: event.pointerId,
      laneId,
      stepIndex,
      startX: event.clientX,
      cellWidth:
        rect.width / visibleSteps,
      startDurationSteps,
      currentDurationSteps:
        startDurationSteps,
      gestureId,
    };
    event.currentTarget.setPointerCapture?.(
      event.pointerId,
    );
    event.preventDefault();
    event.stopPropagation();
  };

  const moveMelodicResize = (
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    const resize = melodicResizeRef.current;
    if (
      !resize ||
      resize.pointerId !== event.pointerId
    ) {
      return;
    }

    const delta = Math.round(
      (event.clientX - resize.startX) /
        Math.max(1, resize.cellWidth),
    );
    const next = Math.max(
      1,
      Math.min(
        sequencer.lengthSteps -
          resize.stepIndex,
        resize.startDurationSteps + delta,
      ),
    );
    if (next === resize.currentDurationSteps) {
      return;
    }
    resize.currentDurationSteps = next;
    sequencerStore.setMelodicDurationSteps(
      resize.laneId,
      resize.stepIndex,
      next,
      resize.gestureId,
    );
  };

  const finishMelodicResize = (
    pointerId: number,
  ) => {
    const resize = melodicResizeRef.current;
    if (
      !resize ||
      resize.pointerId !== pointerId
    ) {
      return;
    }
    sequencerStore.endPaintGesture(
      resize.gestureId,
    );
    melodicResizeRef.current = null;
    setNotice(
      "Note length · " +
        melodicDurationLabel(
          resize.currentDurationSteps,
        ),
    );
  };

  useEffect(() => {
    setSelectedSteps((current) =>
      current.filter(
        (entry) =>
          sequencerStore.getStepVelocity(
            entry.laneId,
            entry.stepIndex,
          ) !== undefined,
      ),
    );
  }, [sequencer.revision]);

  useEffect(() => {
    const handleSelectionKeys = (
      event: KeyboardEvent,
    ) => {
      const target = event.target;
      const typingTarget =
        target instanceof HTMLElement &&
        (
          target.isContentEditable ||
          target.matches(
            "input, textarea, select, [role='textbox'], [role='spinbutton'], [role='slider']",
          )
        );
      if (typingTarget) return;
      if (patternRecordingActive()) {
        return;
      }

      const modifier =
        event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (
        modifier &&
        key === "a" &&
        !event.altKey
      ) {
        event.preventDefault();
        selectCurrentBar();
        return;
      }

      if (
        !modifier &&
        !event.altKey &&
        key === "v"
      ) {
        event.preventDefault();
        setTouchEditMode((current) =>
          current === "select"
            ? "draw"
            : "select",
        );
        setNotice(
          touchEditMode === "select"
            ? "Edit mode · Draw"
            : "Edit mode · Select",
        );
        return;
      }

      if (modifier && key === "v") {
        if (!selectionClipboard) return;
        event.preventDefault();
        batchPasteSelection();
        return;
      }

      if (selectedSteps.length === 0) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        clearSelection();
        setNotice("Selection cleared");
        return;
      }

      if (
        event.key === "Delete" ||
        event.key === "Backspace"
      ) {
        event.preventDefault();
        batchDeleteSelection();
        return;
      }

      if (modifier && key === "c") {
        event.preventDefault();
        batchCopySelection();
        return;
      }

      if (modifier && key === "d") {
        event.preventDefault();
        batchDuplicateSelection();
        return;
      }

      if (
        !modifier &&
        !event.altKey &&
        event.key === "ArrowLeft"
      ) {
        event.preventDefault();
        batchMoveSelection(-1);
        return;
      }

      if (
        !modifier &&
        !event.altKey &&
        event.key === "ArrowRight"
      ) {
        event.preventDefault();
        batchMoveSelection(1);
        return;
      }

      if (!modifier && key === "[") {
        event.preventDefault();
        batchAdjustVelocity(-0.08);
        return;
      }

      if (!modifier && key === "]") {
        event.preventDefault();
        batchAdjustVelocity(0.08);
        return;
      }

      if (!modifier && key === ",") {
        event.preventDefault();
        batchNudgeTiming(-5_000);
        return;
      }

      if (!modifier && key === ".") {
        event.preventDefault();
        batchNudgeTiming(5_000);
        return;
      }

      if (!modifier && key === "1") {
        event.preventDefault();
        batchSetDynamic("ghost");
      } else if (!modifier && key === "2") {
        event.preventDefault();
        batchSetDynamic("normal");
      } else if (!modifier && key === "3") {
        event.preventDefault();
        batchSetDynamic("accent");
      }
    };

    window.addEventListener(
      "keydown",
      handleSelectionKeys,
      true,
    );
    return () =>
      window.removeEventListener(
        "keydown",
        handleSelectionKeys,
        true,
      );
  }, [
    selectedSteps,
    selectionClipboard,
    stepPage,
    touchEditMode,
    sequencer.lengthSteps,
    sequencer.revision,
    selectedVoice,
  ]);

  useEffect(() => {
    setStepPage((current) =>
      Math.min(current, pageCount - 1),
    );
  }, [pageCount]);

  useEffect(() => {
    setProjectNameDraft(project.name);
    setProjectMenuOpen(false);

    const projectId = project.projectId;
    if (
      projectId !== sessionHydratedProjectId
    ) {
      selectionDragRef.current = null;
      setSelectedSteps([]);
    }

    if (!projectId) {
      setSessionHydratedProjectId(null);
      return;
    }

    const saved = readPlaygroundSession(projectId);
    if (
      saved.selectedVoice &&
      DRUM_PADS.some(
        (pad) => pad.voice === saved.selectedVoice,
      )
    ) {
      setSelectedVoice(saved.selectedVoice);
    } else {
      setSelectedVoice("kick");
    }

    if (
      typeof saved.stepPage === "number" &&
      Number.isFinite(saved.stepPage)
    ) {
      setStepPage(
        Math.max(0, Math.floor(saved.stepPage)),
      );
    } else {
      setStepPage(0);
    }

    if (typeof saved.followPlayhead === "boolean") {
      setFollowPlayhead(saved.followPlayhead);
    } else {
      setFollowPlayhead(true);
    }

    if (
      saved.touchEditMode === "draw" ||
      saved.touchEditMode === "select" ||
      saved.touchEditMode === "accent" ||
      saved.touchEditMode === "ghost"
    ) {
      setTouchEditMode(saved.touchEditMode);
    } else {
      setTouchEditMode("draw");
    }

    setSessionHydratedProjectId(projectId);
  }, [project.projectId, project.name]);

  useEffect(() => {
    const projectId = project.projectId;
    if (
      !projectId ||
      sessionHydratedProjectId !== projectId
    ) {
      return;
    }

    persistPlaygroundSession(projectId, {
      selectedVoice,
      stepPage,
      followPlayhead,
      touchEditMode,
    });
  }, [
    followPlayhead,
    project.projectId,
    selectedVoice,
    sessionHydratedProjectId,
    stepPage,
    touchEditMode,
  ]);

  useEffect(() => {
    if (
      !followPlayhead ||
      !playing ||
      activeStep === undefined ||
      pageCount <= 1
    ) {
      return;
    }

    const playheadPage = Math.floor(
      activeStep / pageSize,
    );
    setStepPage((current) =>
      current === playheadPage
        ? current
        : playheadPage,
    );
  }, [
    activeStep,
    followPlayhead,
    pageCount,
    playing,
  ]);

  const triggerVoice = (
    voice: DrumVoiceId,
    velocity = 0.88,
    capture = true,
  ) => {
    completeFirstUseAction("pad");
    setPadPulse((current) => ({
      voice,
      serial: current.serial + 1,
    }));
    pulseHaptic(
      velocity >= 0.9
        ? 11
        : velocity <= 0.3
          ? 4
          : 7,
    );
    if (capture) {
      void inputActionRouter.trigger(
        { kind: "pad", voice },
        velocity,
      );
    } else {
      void drumEngine.triggerNow(voice, velocity);
    }
  };

  const beginPadLongPress = (
    event: ReactPointerEvent<HTMLButtonElement>,
    voice: DrumVoiceId,
  ) => {
    if (
      event.pointerType === "mouse" &&
      event.button !== 0
    ) {
      return;
    }

    event.currentTarget.setPointerCapture?.(
      event.pointerId,
    );
    clearPadLongPress();
    clearPadRepeat();

    if (padRepeatDivision > 0) {
      suppressPadClickRef.current = voice;
      selectDrumTrack(voice);
      setSoundPickerVoice(null);
      padRepeatRef.current = {
        voice,
        pointerId: event.pointerId,
      };
      triggerVoice(voice, 0.88);

      const intervalMs =
        (60_000 / Math.max(30, transport.bpm)) /
        padRepeatDivision;

      padRepeatTimerRef.current = window.setInterval(
        () => {
          const active = padRepeatRef.current;
          if (!active || active.voice !== voice) return;
          triggerVoice(voice, 0.82);
        },
        Math.max(55, intervalMs),
      );

      return;
    }

    if (event.pointerType === "mouse") return;

    padLongPressRef.current = {
      voice,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    padLongPressTimerRef.current = window.setTimeout(() => {
      const pending = padLongPressRef.current;
      if (!pending || pending.voice !== voice) return;

      padLongPressTimerRef.current = null;
      padLongPressRef.current = null;
      suppressPadClickRef.current = voice;
      selectDrumTrack(voice);
      setSoundPickerVoice(voice);
      pulseHaptic([12, 22, 12]);
      setNotice(
        "Choose a " +
          displayLaneName(
            SEQUENCER_LANES.find(
              (lane) => lane.voice === voice,
            ) ?? SEQUENCER_LANES[0],
          ) +
          " sound",
      );

      window.setTimeout(() => {
        if (suppressPadClickRef.current === voice) {
          suppressPadClickRef.current = null;
        }
      }, 700);

      window.requestAnimationFrame(() => {
        focusRef.current?.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      });
    }, 430);
  };

  const movePadLongPress = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const repeating = padRepeatRef.current;
    if (
      repeating &&
      repeating.pointerId === event.pointerId
    ) {
      return;
    }

    const pending = padLongPressRef.current;
    if (
      !pending ||
      pending.pointerId !== event.pointerId
    ) {
      return;
    }

    if (
      Math.hypot(
        event.clientX - pending.x,
        event.clientY - pending.y,
      ) > 12
    ) {
      clearPadLongPress();
    }
  };

  const endPadLongPress = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const repeating = padRepeatRef.current;
    if (
      repeating &&
      repeating.pointerId === event.pointerId
    ) {
      clearPadRepeat();
      const voice = repeating.voice;
      window.setTimeout(() => {
        if (suppressPadClickRef.current === voice) {
          suppressPadClickRef.current = null;
        }
      }, 450);
      return;
    }

    const pending = padLongPressRef.current;
    if (
      pending &&
      pending.pointerId === event.pointerId
    ) {
      clearPadLongPress();
    }
  };

  const beginMomentaryMonitor = (
    event: ReactPointerEvent<HTMLButtonElement>,
    mode: MomentaryMonitorMode,
  ) => {
    if (
      event.pointerType === "mouse" &&
      event.button !== 0
    ) {
      return;
    }

    const laneId = selectedDefinition.id;
    event.currentTarget.setPointerCapture?.(
      event.pointerId,
    );

    if (mode === "mute") {
      sequencerStore.setTransientMute(laneId, true);
    } else {
      sequencerStore.setTransientSolo(laneId, true);
    }

    momentaryMonitorRef.current = {
      laneId,
      pointerId: event.pointerId,
      mode,
    };
    setMomentaryMonitor(mode);
    audioTransport.invalidateScheduledEvents();
    pulseHaptic(6);
    event.preventDefault();
  };

  const endMomentaryMonitor = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const active = momentaryMonitorRef.current;
    if (
      !active ||
      active.pointerId !== event.pointerId
    ) {
      return;
    }

    if (active.mode === "mute") {
      sequencerStore.setTransientMute(
        active.laneId,
        false,
      );
    } else {
      sequencerStore.setTransientSolo(
        active.laneId,
        false,
      );
    }

    momentaryMonitorRef.current = null;
    setMomentaryMonitor(null);
    audioTransport.invalidateScheduledEvents();
  };

  const setStep = (
    laneId: string,
    stepIndex: number,
    desiredOn: boolean,
    audition = false,
    gestureId?: string,
  ) => {
    const isOn =
      sequencerStore.getStepVelocity(laneId, stepIndex) !== undefined;
    if (isOn === desiredOn) return;

    cancelPatternPreview();
    sequencerStore.setStepEnabled(
      laneId,
      stepIndex,
      desiredOn,
      gestureId,
    );

    if (!desiredOn) {
      pulseHaptic(4);
    }

    if (desiredOn && audition) {
      const voice = SEQUENCER_LANES.find(
        (lane) => lane.id === laneId,
      )?.voice;
      if (voice) triggerVoice(voice, 0.8, false);
    }
  };

  const beginPaint = (
    event: ReactPointerEvent<HTMLButtonElement>,
    laneId: string,
    stepIndex: number,
  ) => {
    if (patternRecordingActive()) {
      setNotice("Stop recording to draw on the grid");
      return;
    }
    if (event.pointerType === "mouse" && event.button !== 0) return;

    completeFirstUseAction("step");
    beginStepContextLongPress(
      event,
      laneId,
      stepIndex,
    );

    const shiftClickSelection =
      event.pointerType === "mouse" &&
      event.shiftKey &&
      !event.altKey;
    const touchDynamic =
      event.pointerType !== "mouse" &&
      touchEditMode !== "draw" &&
      touchEditMode !== "select"
        ? touchEditMode
        : undefined;
    const dynamic =
      event.altKey
        ? "ghost"
        : shiftClickSelection
          ? undefined
          : event.shiftKey
            ? "accent"
            : touchDynamic;
    const existingVelocity =
      sequencerStore.getStepVelocity(laneId, stepIndex);
    const desiredOn =
      dynamic ? true : existingVelocity === undefined;
    const key = laneId + ":" + stepIndex;
    const gestureId =
      "playground-" +
      String(++paintCounterRef.current).padStart(6, "0");

    sequencerStore.beginPaintGesture(gestureId);
    paintRef.current = {
      pointerId: event.pointerId,
      desiredOn,
      lastKey: key,
      gestureId,
      mode:
        shiftClickSelection
          ? "shiftSelect"
          : dynamic
            ? "paint"
            : event.pointerType === "mouse"
              ? desiredOn
                ? "paint"
                : "pending"
              : "pending",
      dynamic,
      pointerType: event.pointerType,
      startLaneId: laneId,
      startStepIndex: stepIndex,
      startX: event.clientX,
      startY: event.clientY,
      startVelocity: existingVelocity,
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);

    if (!shiftClickSelection && selectedSteps.length > 0) {
      clearSelection();
    }

    if (dynamic) {
      const painted = sequencerStore.paintStepDynamic(
        laneId,
        stepIndex,
        dynamic,
        gestureId,
      );
      if (!painted) {
        setNotice("Unlock rhythm/dynamics to paint accents");
      } else {
        const voice = SEQUENCER_LANES.find(
          (lane) => lane.id === laneId,
        )?.voice;
        if (voice) {
          triggerVoice(
            voice,
            dynamic === "accent" ? 0.96 : 0.22,
            false,
          );
        }
      }
    } else if (
      desiredOn &&
      event.pointerType === "mouse"
    ) {
      setStep(
        laneId,
        stepIndex,
        true,
        true,
        gestureId,
      );
    }

    event.preventDefault();
  };

  const continuePaint = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const selectionDrag = selectionDragRef.current;
    if (
      selectionDrag &&
      selectionDrag.pointerId === event.pointerId
    ) {
      const target = document
        .elementFromPoint(
          event.clientX,
          event.clientY,
        )
        ?.closest(
          "[data-play-step='true']",
        ) as HTMLButtonElement | null;

      if (target) {
        const laneId = target.dataset.laneId;
        const stepIndex = Number(
          target.dataset.stepIndex,
        );
        if (
          laneId &&
          Number.isInteger(stepIndex)
        ) {
          applySelectionRectangle(
            selectionDrag,
            laneId,
            stepIndex,
          );
        }
      }
      return;
    }

    moveStepContextLongPress(event);
    const gesture = paintRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    if (gesture.mode === "pageSwipe") {
      return;
    }

    if (gesture.mode === "shiftSelect") {
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      if (Math.hypot(dx, dy) < 7) return;

      gesture.mode = "paint";
      gesture.dynamic = "accent";
      gesture.desiredOn = true;
      const painted = sequencerStore.paintStepDynamic(
        gesture.startLaneId,
        gesture.startStepIndex,
        "accent",
        gesture.gestureId,
      );
      if (painted) {
        const voice = SEQUENCER_LANES.find(
          (lane) =>
            lane.id === gesture.startLaneId,
        )?.voice;
        if (voice) {
          triggerVoice(
            voice,
            0.96,
            false,
          );
        }
      }
    }

    if (gesture.mode === "velocity") {
      const startVelocity = gesture.startVelocity ?? 0.76;
      const nextVelocity = Math.max(
        0.05,
        Math.min(
          1,
          startVelocity -
            (event.clientY - gesture.startY) / 96,
        ),
      );
      sequencerStore.setStepVelocity(
        gesture.startLaneId,
        gesture.startStepIndex,
        nextVelocity,
        gesture.gestureId,
      );
      return;
    }

    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest("[data-play-step='true']") as HTMLButtonElement | null;

    if (gesture.mode === "pending") {
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      const distance = Math.hypot(dx, dy);

      const swipeDirection: -1 | 1 =
        dx < 0 ? 1 : -1;
      const canSwipe =
        gesture.pointerType !== "mouse" &&
        pageCount > 1 &&
        stepPage + swipeDirection >= 0 &&
        stepPage + swipeDirection < pageCount;
      const horizontalSwipeIntent =
        canSwipe &&
        Math.abs(dx) >= 7 &&
        Math.abs(dx) > Math.abs(dy) * 1.25;

      if (horizontalSwipeIntent) {
        if (Math.abs(dx) >= 34) {
          gesture.mode = "pageSwipe";
          gesture.swipeDirection = swipeDirection;
        }
        return;
      }

      if (
        gesture.startVelocity !== undefined &&
        distance >= 7 &&
        Math.abs(dy) > Math.abs(dx) * 1.05
      ) {
        gesture.mode = "velocity";
        const startVelocity = gesture.startVelocity;
        const nextVelocity = Math.max(
          0.05,
          Math.min(1, startVelocity - dy / 96),
        );
        sequencerStore.setStepVelocity(
          gesture.startLaneId,
          gesture.startStepIndex,
          nextVelocity,
          gesture.gestureId,
        );
        return;
      }

      if (!target) return;
      const targetLaneId = target.dataset.laneId;
      const targetStepIndex = Number(target.dataset.stepIndex);
      const startKey =
        gesture.startLaneId + ":" + gesture.startStepIndex;
      const targetKey =
        targetLaneId + ":" + targetStepIndex;

      if (
        distance >= 7 &&
        targetLaneId &&
        Number.isInteger(targetStepIndex) &&
        targetKey !== startKey
      ) {
        gesture.mode = "paint";
        setStep(
          gesture.startLaneId,
          gesture.startStepIndex,
          gesture.desiredOn,
          gesture.desiredOn,
          gesture.gestureId,
        );
      } else {
        return;
      }
    }

    if (!target) return;

    const laneId = target.dataset.laneId;
    const stepIndex = Number(target.dataset.stepIndex);
    if (!laneId || !Number.isInteger(stepIndex)) return;

    const key = laneId + ":" + stepIndex;
    if (gesture.lastKey === key) return;

    gesture.lastKey = key;

    if (gesture.dynamic) {
      sequencerStore.paintStepDynamic(
        laneId,
        stepIndex,
        gesture.dynamic,
        gesture.gestureId,
      );
      return;
    }

    setStep(
      laneId,
      stepIndex,
      gesture.desiredOn,
      gesture.desiredOn,
      gesture.gestureId,
    );
  };

  const finishPaint = (
    pointerId: number,
    cancelled = false,
  ) => {
    const selectionDrag = selectionDragRef.current;
    if (
      selectionDrag &&
      selectionDrag.pointerId === pointerId
    ) {
      selectionDragRef.current = null;
      if (!cancelled) {
        pulseHaptic(5);
        setNotice("Selection updated");
      }
      return;
    }

    const pendingContext =
      stepContextPendingRef.current;
    if (pendingContext?.pointerId === pointerId) {
      clearStepContextLongPress();
    }

    const gesture = paintRef.current;
    if (!gesture || gesture.pointerId !== pointerId) return;

    if (!cancelled && gesture.mode === "shiftSelect") {
      const entry = {
        laneId: gesture.startLaneId,
        stepIndex: gesture.startStepIndex,
      };
      if (
        sequencerStore.getStepVelocity(
          entry.laneId,
          entry.stepIndex,
        ) !== undefined
      ) {
        const key = selectionKey(entry);
        setSelectedSteps((current) => {
          const exists = current.some(
            (item) => selectionKey(item) === key,
          );
          return exists
            ? current.filter(
                (item) =>
                  selectionKey(item) !== key,
              )
            : [...current, entry];
        });
        setNotice("Selection updated");
      }
    } else if (!cancelled && gesture.mode === "pending") {
      setStep(
        gesture.startLaneId,
        gesture.startStepIndex,
        gesture.desiredOn,
        gesture.desiredOn,
        gesture.gestureId,
      );
    } else if (
      !cancelled &&
      gesture.mode === "pageSwipe" &&
      gesture.swipeDirection
    ) {
      const direction = gesture.swipeDirection;
      setFollowPlayhead(false);
      setStepPage((current) => {
        const next = Math.max(
          0,
          Math.min(pageCount - 1, current + direction),
        );
        if (next !== current) {
          pulseHaptic(7);
          setNotice(
            "Steps " +
              (next * pageSize + 1) +
              "–" +
              Math.min(
                sequencer.lengthSteps,
                (next + 1) * pageSize,
              ),
          );
        }
        return next;
      });
    }

    if (!cancelled && gesture.mode === "velocity") {
      const velocity =
        sequencerStore.getStepVelocity(
          gesture.startLaneId,
          gesture.startStepIndex,
        ) ?? gesture.startVelocity;
      if (velocity !== undefined) {
        setNotice(
          "Velocity " + Math.round(velocity * 100) + "%",
        );
      }
    } else if (!cancelled && gesture.dynamic) {
      setNotice(
        gesture.dynamic === "accent"
          ? "Accent painted"
          : "Ghost notes painted",
      );
    }

    sequencerStore.endPaintGesture(gesture.gestureId);
    paintRef.current = null;
  };

  const beginGridPointer = (
    event: ReactPointerEvent<HTMLButtonElement>,
    laneId: string,
    stepIndex: number,
  ) => {
    if (
      touchEditMode === "select" ||
      event.ctrlKey ||
      event.metaKey
    ) {
      beginSelection(
        event,
        laneId,
        stepIndex,
      );
      return;
    }

    beginPaint(
      event,
      laneId,
      stepIndex,
    );
  };

  const activateFromKeyboard = (
    laneId: string,
    stepIndex: number,
    dynamic?: "accent" | "ghost",
  ) => {
    if (patternRecordingActive()) {
      setNotice("Stop recording to edit grid steps");
      return;
    }
    if (dynamic) {
      const painted = sequencerStore.paintStepDynamic(
        laneId,
        stepIndex,
        dynamic,
      );
      if (!painted) {
        setNotice("Unlock rhythm/dynamics to paint accents");
        return;
      }
      const voice = SEQUENCER_LANES.find(
        (lane) => lane.id === laneId,
      )?.voice;
      if (voice) {
        triggerVoice(
          voice,
          dynamic === "accent" ? 0.96 : 0.22,
          false,
        );
      }
      return;
    }

    const desiredOn =
      sequencerStore.getStepVelocity(laneId, stepIndex) === undefined;
    setStep(laneId, stepIndex, desiredOn, desiredOn);
  };

  const checkpointCurrentPattern = (
    title: string,
  ) =>
    generationHistoryStore.checkpoint(
      sequencerStore.getSnapshot().pattern,
      title,
    );

  const commitCreativePattern = (
    nextPattern: typeof sequencer.pattern,
    operation: "generateBeat" | "reroll",
    operationLabel: string,
    title: string,
  ) => {
    const sourcePattern =
      sequencerStore.getSnapshot().pattern;
    const prepared =
      generationHistoryStore.prepareCreativePattern(
        sourcePattern,
        nextPattern,
      );

    clearSelection();
    sequencerStore.applyGeneratedPattern(prepared.pattern);
    const appliedPattern =
      sequencerStore.getSnapshot().pattern;
    const node = generationHistoryStore.commitPrepared(
      {
        parentNodeId: prepared.parentNodeId,
        pattern: appliedPattern,
      },
      operation,
      operationLabel,
      title,
    );

    return {
      pattern: appliedPattern,
      node,
      parentNodeId: prepared.parentNodeId,
    };
  };

  const restoreHistoryNode = (
    nodeId: string,
    noticeText: string,
  ) => {
    if (patternRecordingActive()) {
      setNotice("Stop recording before restoring history");
      return;
    }
    clearSelection();
    checkpointCurrentPattern(
      "Before restore · Pattern " + activePatternBank,
    );
    const restored = generationHistoryStore.restore(nodeId);
    sequencerStore.restorePatternSnapshot(restored);
    setLastRemixSourceNodeId(null);
    setNotice(noticeText);
  };

  const switchPatternBank = (
    nextBank: PatternBankId,
  ) => {
    if (patternRecordingActive()) {
      setNotice("Stop recording before switching patterns");
      return;
    }
    if (nextBank === activePatternBank) return;

    clearSelection();
    const restored =
      generationHistoryStore.switchPatternBank(
        nextBank,
        sequencerStore.getSnapshot().pattern,
      );
    sequencerStore.restorePatternSnapshot(restored);
    setLastRemixSourceNodeId(null);
    setNotice("Pattern " + nextBank);
  };

  const duplicatePatternBank = () => {
    if (patternRecordingActive()) {
      setNotice("Stop recording before duplicating patterns");
      return;
    }
    clearSelection();
    const sourceBank = activePatternBank;
    const duplicated =
      generationHistoryStore.duplicateActivePatternBank(
        sequencerStore.getSnapshot().pattern,
      );

    setLastRemixSourceNodeId(null);
    setNotice(
      "Duplicated " +
        sourceBank +
        " → " +
        duplicated.bank,
    );
  };

  const undoLastRemix = () => {
    if (patternRecordingActive()) {
      setNotice("Stop recording before restoring Remix");
      return;
    }
    const sourceNodeId = lastRemixSourceNodeId;
    if (!sourceNodeId) return;

    clearSelection();
    const restored =
      generationHistoryStore.restore(sourceNodeId);
    sequencerStore.restorePatternSnapshot(restored);
    setLastRemixSourceNodeId(null);
    setNotice("Remix undone");
  };

  const applyStyleBeat = (nextStyle: BeatStyleId) => {
    if (patternRecordingActive()) {
      setNotice("Stop recording before changing style");
      return;
    }
    checkpointCurrentPattern("Before style change");
    const generated = generateBeat({
      seed:
        "playground-style:" +
        nextStyle +
        ":" +
        String(remixCounter).padStart(4, "0"),
      style: nextStyle,
      intent: intentForStyle(nextStyle),
      stepCount: sequencer.lengthSteps,
      bpm: transport.bpm,
      meter: transport.meter,
    });

    if (!generated.validation.valid) {
      setNotice("Try that style again.");
      setRemixCounter((value) => value + 1);
      return;
    }

    const committed = commitCreativePattern(
      generated.pattern,
      "generateBeat",
      "STYLE",
      styleLabel(nextStyle) + " / Playground",
    );
    setLastRemixSourceNodeId(null);
    if (!playing) {
      void drumEngine.auditionPattern(
        committed.pattern,
        transport.bpm,
      );
      startVisualAudition(
        sequencer.lengthSteps,
        transport.bpm,
      );
    }
    setRemixCounter((value) => value + 1);
    setRemixPulse((value) => value + 1);
    setNotice(styleLabel(nextStyle) + " beat ready");
  };

  const remix = () => {
    if (patternRecordingActive()) {
      setNotice("Stop recording before Remix");
      return;
    }
    completeFirstUseAction("remix");
    checkpointCurrentPattern("Before Remix");
    const result = rerollBeat({
      source: sequencer.pattern,
      seed:
        "playground-remix:" +
        sequencer.pattern.id +
        ":" +
        String(remixCounter).padStart(4, "0"),
      style,
      intent: intentForStyle(style),
      distance: 0.48,
      bpm: transport.bpm,
    });

    setRemixCounter((value) => value + 1);

    if (!result.accepted) {
      setNotice("Nothing musical changed. Remix again.");
      return;
    }

    const committed = commitCreativePattern(
      result.pattern,
      "reroll",
      "REMIX",
      styleLabel(style) + " Remix",
    );
    setLastRemixSourceNodeId(committed.parentNodeId);
    if (!playing) {
      void drumEngine.auditionPattern(
        committed.pattern,
        transport.bpm,
      );
      startVisualAudition(
        sequencer.lengthSteps,
        transport.bpm,
      );
    }
    setRemixPulse((value) => value + 1);
    pulseHaptic([8, 18, 8]);
    setNotice("Remixed");
  };

  const remixSelectedLane = () => {
    if (patternRecordingActive()) {
      setNotice("Stop recording before lane Remix");
      return;
    }
    const laneId = selectedDefinition.id;
    if (sequencerStore.isLaneRhythmLocked(laneId)) {
      setNotice("Unlock rhythm to remix this lane");
      return;
    }

    checkpointCurrentPattern(
      "Before lane Remix · " +
        displayLaneName(selectedDefinition),
    );

    try {
      const result = rerollBeat({
        source: sequencerStore.getSnapshot().pattern,
        seed:
          "playground-lane-remix:" +
          laneId +
          ":" +
          String(remixCounter).padStart(4, "0"),
        style,
        intent: intentForStyle(style),
        distance: 0.52,
        bpm: transport.bpm,
        targetLaneIds: [laneId],
      });

      setRemixCounter((value) => value + 1);

      if (!result.accepted) {
        setNotice("Lane Remix kept the current rhythm");
        return;
      }

      const committed = commitCreativePattern(
        result.pattern,
        "reroll",
        "LANE REMIX",
        displayLaneName(selectedDefinition) + " Remix",
      );
      setLastRemixSourceNodeId(committed.parentNodeId);
      if (!playing) {
        triggerVoice(selectedVoice, 0.88);
      }
      setRemixPulse((value) => value + 1);
      pulseHaptic([8, 18, 8]);
      setNotice(
        displayLaneName(selectedDefinition) + " remixed",
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Lane Remix failed",
      );
    }
  };

  const tapTempo = () => {
    const now = performance.now();
    const previous = tapTimesRef.current;
    const last = previous[previous.length - 1];

    const next =
      last === undefined || now - last > 2_000
        ? [now]
        : [...previous, now].slice(-5);

    tapTimesRef.current = next;

    if (next.length < 2) {
      setNotice("Tap again");
      return;
    }

    const intervals = next
      .slice(1)
      .map((time, index) => time - next[index])
      .filter((interval) => interval >= 180 && interval <= 2_000);

    if (intervals.length === 0) {
      setNotice("Tap again");
      return;
    }

    const average =
      intervals.reduce((sum, interval) => sum + interval, 0) /
      intervals.length;
    const bpm = 60_000 / average;

    audioTransport.setBpm(bpm);
    setNotice(Math.round(audioTransport.getSnapshot().bpm) + " BPM");
  };

  const resolveSongBankPattern = (
    bank: PlaygroundSongBank,
  ) => {
    if (history.activePatternBank === bank) {
      return sequencer.pattern;
    }

    const nodeId = history.patternBanks[bank];
    return (
      history.nodes.find(
        (node) => node.id === nodeId,
      )?.pattern ?? sequencer.pattern
    );
  };

  const syncPlaygroundSongPatterns = () => {
    if (!playgroundSong) return;

    arrangementStore.upsertPattern(
      cloneForPlaygroundSong(
        resolveSongBankPattern("A"),
        "A",
      ),
    );
    arrangementStore.upsertPattern(
      cloneForPlaygroundSong(
        resolveSongBankPattern("B"),
        "B",
      ),
    );
  };

  const buildPlaygroundSong = () => {
    if (patternRecordingActive()) {
      setNotice(
        "Stop recording before building the song",
      );
      return;
    }

    generationHistoryStore.checkpoint(
      sequencerStore.getSnapshot().pattern,
      "Pattern " + history.activePatternBank,
    );
    const freshHistory =
      generationHistoryStore.getSnapshot();
    const current =
      sequencerStore.getSnapshot().pattern;

    const resolve = (
      bank: PlaygroundSongBank,
    ) => {
      if (
        freshHistory.activePatternBank === bank
      ) {
        return current;
      }
      const nodeId =
        freshHistory.patternBanks[bank];
      return (
        freshHistory.nodes.find(
          (node) => node.id === nodeId,
        )?.pattern ?? current
      );
    };

    const created = createPlaygroundSong({
      bankA: resolve("A"),
      bankB: resolve("B"),
    });

    arrangementPlaybackStore.stop();
    arrangementStore.restoreProjectState({
      blueprint: created.blueprint,
      sourceFoundationId:
        created.blueprint.id,
      selectedSectionId:
        created.blueprint.sections[0]?.id,
      patterns: created.patterns,
      edited: false,
    });
    setNotice("Song ready · A ×4 → B ×4");
  };

  const addSongSection = (
    bank: PlaygroundSongBank,
  ) => {
    if (
      editRecordingLocked ||
      !playgroundSong ||
      !arrangement.blueprint
    ) {
      return;
    }

    const sourceId =
      arrangement.selectedSectionId ??
      arrangement.blueprint.sections[0]?.id;

    arrangementStore.addSectionFromPattern(
      PLAYGROUND_SONG_PATTERN_IDS[bank],
      sourceId,
    );
    setNotice(
      "Added Pattern " + bank + " section",
    );
  };

  const setSongSectionBank = (
    bank: PlaygroundSongBank,
  ) => {
    if (
      editRecordingLocked ||
      !playgroundSong ||
      !selectedSongSection
    ) {
      return;
    }
    arrangementStore.setSectionPattern(
      selectedSongSection.id,
      PLAYGROUND_SONG_PATTERN_IDS[bank],
    );
    setNotice(
      selectedSongSection.label +
        " · Pattern " +
        bank,
    );
  };

  const setSongSectionRole = (
    role: SceneRole,
  ) => {
    if (
      editRecordingLocked ||
      !selectedSongSection
    ) {
      return;
    }
    arrangementStore.setSectionRole(
      selectedSongSection.id,
      role,
    );
    setNotice(
      "Section role · " +
        songRoleLabel(role),
    );
  };

  const changeSongSectionCycles = (
    delta: -1 | 1,
  ) => {
    if (
      editRecordingLocked ||
      !selectedSongSection
    ) {
      return;
    }
    arrangementStore.setSectionCycles(
      selectedSongSection.id,
      selectedSongSection.cycleCount +
        delta,
    );
  };

  const moveSongSection = (
    delta: -1 | 1,
  ) => {
    if (
      editRecordingLocked ||
      !selectedSongSection
    ) {
      return;
    }
    arrangementStore.moveSection(
      selectedSongSection.id,
      delta,
    );
  };

  const duplicateSongSection = () => {
    if (
      editRecordingLocked ||
      !selectedSongSection
    ) {
      return;
    }
    arrangementStore.duplicateSection(
      selectedSongSection.id,
    );
    setNotice("Section duplicated");
  };

  const removeSongSection = () => {
    if (
      editRecordingLocked ||
      !selectedSongSection
    ) {
      return;
    }
    arrangementStore.removeSection(
      selectedSongSection.id,
    );
    setNotice("Section removed");
  };

  const selectOrQueueSongSection = (
    sectionId: string,
  ) => {
    arrangementStore.selectSection(
      sectionId,
    );

    if (
      !arrangementPlayback.engaged ||
      arrangementPlayback.scope !==
        "arrangement" ||
      arrangementPlayback.transportStatus !==
        "running" ||
      arrangementPlayback.currentSectionId ===
        sectionId
    ) {
      return;
    }

    const target =
      arrangementPlaybackStore.queueSection(
        sectionId,
      );
    if (target === undefined) return;

    const section =
      arrangementStore
        .getSnapshot()
        .blueprint?.sections.find(
          (entry) => entry.id === sectionId,
        );
    setNotice(
      "Queued " +
        (section?.label ?? "section") +
        " · next bar",
    );
  };

  const playSong = async (
    sectionOnly = false,
  ) => {
    if (editRecordingLocked) return;

    if (playgroundSong) {
      syncPlaygroundSongPatterns();
    }

    const live =
      arrangementStore.getSnapshot();
    if (
      !live.blueprint ||
      live.occurrences.length === 0
    ) {
      setNotice(
        "Song has no playable sections yet",
      );
      return;
    }

    const liveSelected =
      live.blueprint.sections.find(
        (section) =>
          section.id ===
          live.selectedSectionId,
      ) ??
      live.blueprint.sections[0];

    cancelPatternPreview();
    if (sectionOnly && liveSelected) {
      await arrangementPlaybackStore.start(
        liveSelected.id,
        true,
      );
      setNotice(
        "Playing " +
          liveSelected.label,
      );
    } else {
      await arrangementPlaybackStore.start();
      setNotice("Playing song");
    }
  };

  useEffect(() => {
    if (!playgroundSong) return;

    syncPlaygroundSongPatterns();
  }, [
    playgroundSong,
    history.activePatternBank,
    history.patternBanks.A,
    history.patternBanks.B,
    sequencer.revision,
  ]);

  const addPatternBar = () => {
    if (patternRecordingActive()) {
      setNotice("Stop recording before changing bars");
      return;
    }
    if (atBarLimit) {
      setNotice("Pattern limit · 8 bars");
      return;
    }

    cancelPatternPreview();
    checkpointCurrentPattern("Before add bar");
    const currentLength = sequencer.lengthSteps;
    const nextLength =
      currentLength < pageSize
        ? pageSize
        : currentLength + pageSize;
    const changed = sequencerStore.addBar();
    if (!changed) {
      setNotice("Could not add a bar");
      return;
    }

    setFollowPlayhead(false);
    setStepPage(
      Math.max(0, Math.ceil(nextLength / pageSize) - 1),
    );
    setNotice(
      "Added bar " +
        Math.ceil(nextLength / pageSize) +
        " · " +
        nextLength +
        " steps",
    );
  };

  const duplicatePatternBar = () => {
    if (patternRecordingActive()) {
      setNotice("Stop recording before changing bars");
      return;
    }
    if (!wholeBarPattern || atBarLimit) {
      setNotice(
        atBarLimit
          ? "Pattern limit · 8 bars"
          : "Use a full-bar pattern to duplicate bars",
      );
      return;
    }

    cancelPatternPreview();
    clearSelection();
    checkpointCurrentPattern(
      "Before duplicate bar " + (stepPage + 1),
    );
    const changed =
      sequencerStore.duplicateBar(stepPage);
    if (!changed) {
      setNotice("Could not duplicate this bar");
      return;
    }

    setFollowPlayhead(false);
    setStepPage(stepPage + 1);
    setNotice(
      "Duplicated bar " +
        (stepPage + 1) +
        " → " +
        (stepPage + 2),
    );
  };

  const clearPatternBar = () => {
    if (patternRecordingActive()) {
      setNotice("Stop recording before changing bars");
      return;
    }
    if (!wholeBarPattern) {
      setNotice("Use a full-bar pattern to clear a bar");
      return;
    }

    cancelPatternPreview();
    clearSelection();
    checkpointCurrentPattern(
      "Before clear bar " + (stepPage + 1),
    );
    if (!sequencerStore.clearBar(stepPage)) {
      setNotice("Could not clear this bar");
      return;
    }
    setNotice("Cleared bar " + (stepPage + 1));
  };

  const deletePatternBar = () => {
    if (patternRecordingActive()) {
      setNotice("Stop recording before changing bars");
      return;
    }
    if (!wholeBarPattern || pageCount <= 1) {
      setNotice("A pattern needs at least one bar");
      return;
    }

    cancelPatternPreview();
    clearSelection();
    checkpointCurrentPattern(
      "Before delete bar " + (stepPage + 1),
    );
    if (!sequencerStore.deleteBar(stepPage)) {
      setNotice("Could not delete this bar");
      return;
    }

    setFollowPlayhead(false);
    const nextPage = Math.min(
      stepPage,
      pageCount - 2,
    );
    setStepPage(Math.max(0, nextPage));
    setNotice("Deleted bar " + (stepPage + 1));
  };

  const editSelectedLane = (
    action:
      | "shiftLeft"
      | "shiftRight"
      | "reverse"
      | "densityHalf"
      | "densityDouble"
      | "copy"
      | "paste"
      | "clear"
      | "fillHalf"
      | "fillQuarter"
      | "fillEighth"
      | "fillSixteenth",
  ) => {
    if (patternRecordingActive()) {
      setNotice("Stop recording before editing the lane");
      return;
    }
    clearSelection();
    const laneId = selectedDefinition.id;
    let changed = false;

    if (action === "copy") {
      const copied = sequencerStore.copyLane(laneId);
      if (!copied) {
        setNotice("Nothing to copy");
        return;
      }
      laneClipboardRef.current = copied;
      const label =
        displayLaneName(selectedDefinition);
      setLaneClipboardLabel(label);
      setNotice(label + " copied");
      return;
    }

    if (action === "paste") {
      const clipboard = laneClipboardRef.current;
      if (!clipboard) {
        setNotice("Copy a lane first");
        return;
      }
      checkpointCurrentPattern(
        "Before lane paste · " +
          displayLaneName(selectedDefinition),
      );
      changed = sequencerStore.pasteLane(
        laneId,
        clipboard,
      );
    } else if (action === "shiftLeft") {
      changed = sequencerStore.shiftLane(laneId, -1);
    } else if (action === "shiftRight") {
      changed = sequencerStore.shiftLane(laneId, 1);
    } else if (action === "reverse") {
      checkpointCurrentPattern(
        "Before reverse · " +
          displayLaneName(selectedDefinition),
      );
      changed = sequencerStore.reverseLane(laneId);
    } else if (action === "densityHalf") {
      checkpointCurrentPattern(
        "Before density half · " +
          displayLaneName(selectedDefinition),
      );
      changed = sequencerStore.scaleLaneDensity(
        laneId,
        0.5,
      );
    } else if (action === "densityDouble") {
      checkpointCurrentPattern(
        "Before density double · " +
          displayLaneName(selectedDefinition),
      );
      changed = sequencerStore.scaleLaneDensity(
        laneId,
        2,
      );
    } else if (action === "clear") {
      checkpointCurrentPattern(
        "Before clear · " +
          displayLaneName(selectedDefinition),
      );
      changed = sequencerStore.clearLane(laneId);
    } else {
      checkpointCurrentPattern(
        "Before fill · " +
          displayLaneName(selectedDefinition),
      );
      const interval =
        action === "fillHalf"
          ? 8
          : action === "fillQuarter"
            ? 4
            : action === "fillEighth"
              ? 2
              : 1;
      changed = sequencerStore.fillLaneRange(
        laneId,
        pageStart,
        Math.min(
          pageSize,
          sequencer.lengthSteps - pageStart,
        ),
        interval as 1 | 2 | 4 | 8,
      );
    }

    if (!changed) {
      setNotice("Unlock rhythm to edit this lane");
      return;
    }

    const label =
      action === "shiftLeft"
        ? "Rotated left"
        : action === "shiftRight"
          ? "Rotated right"
          : action === "reverse"
            ? "Lane reversed"
            : action === "densityHalf"
              ? "Density halved"
              : action === "densityDouble"
                ? "Density doubled"
                : action === "paste"
                  ? "Pasted " +
                    (laneClipboardLabel ?? "lane")
                  : action === "clear"
                    ? "Lane cleared"
                    : action === "fillHalf"
                      ? "Half-note fill · bar " + (stepPage + 1)
                      : action === "fillQuarter"
                        ? "Quarter-note fill · bar " + (stepPage + 1)
                        : action === "fillEighth"
                          ? "Eighth-note fill · bar " + (stepPage + 1)
                          : "Sixteenth-note fill · bar " + (stepPage + 1);
    setNotice(label);
  };

  const chooseSound = async (
    voice: DrumVoiceId,
    nextIndex: number,
  ) => {
    cancelPatternPreview();
    const preset = SOUND_PRESETS[voice][nextIndex];
    if (!preset) return;

    try {
      const sourceMode = soundPresetSource(preset);
      if (preset.bundledSampleId) {
        await audioTransport.unlockAudio();
        const sample = bundledSampleById(
          preset.bundledSampleId,
        );
        if (!sample || sample.voice !== voice) {
          throw new Error(
            "Built-in sound metadata is unavailable.",
          );
        }

        setSoundLoading(sample.id);
        await applyBundledSample(sample);

        if (sourceMode === "hybrid") {
          const base = DRUM_DEFAULT_SPECS[voice];
          drumSoundStore.setSpec(voice, {
            ...base,
            ...(preset.spec ?? {}),
            voice,
            engineVersion: base.engineVersion,
          });
          drumSoundStore.setHybridSynthGainDb(
            voice,
            preset.synthGainDb ?? -9,
          );
          drumSoundStore.setSourceMode(
            voice,
            "hybrid",
          );
        } else {
          drumSoundStore.setSourceMode(
            voice,
            "sample",
          );
        }
      } else {
        const base = DRUM_DEFAULT_SPECS[voice];
        drumSoundStore.setSourceMode(voice, "synth");
        drumSoundStore.setSpec(voice, {
          ...base,
          ...(preset.spec ?? {}),
          voice,
          engineVersion: base.engineVersion,
        });
      }

      setSoundIndex((current) => ({
        ...current,
        [voice]: nextIndex,
      }));
      recordSoundUse(voice, nextIndex);
      completeFirstUseAction("sound");
      triggerVoice(voice, 0.9, false);
      setNotice(
        (DRUM_PADS.find((pad) => pad.voice === voice)?.label ?? voice) +
          " · " +
          preset.label,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Sound could not be loaded.",
      );
    } finally {
      setSoundLoading(null);
    }
  };

  const cycleSound = (
    voice: DrumVoiceId,
    direction: -1 | 1,
  ) => {
    const presets = SOUND_PRESETS[voice];
    if (presets.length === 0 || soundLoading) return;

    const current = soundIndex[voice];
    const normalized = current >= 0 ? current : 0;
    const next =
      (normalized + direction + presets.length) %
      presets.length;

    void chooseSound(voice, next);
  };

  const toggleSelectedSoundPicker = () => {
    setSoundPickerVoice((current) =>
      current === selectedVoice
        ? null
        : selectedVoice,
    );
    pulseHaptic(6);
    window.requestAnimationFrame(() => {
      focusRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    });
  };

  const commitProjectName = () => {
    projectStore.rename(projectNameDraft);
    setProjectNameDraft(
      projectStore.getSnapshot().name,
    );
  };

  const prepareProjectSwitch = () => {
    cancelCountIn();
    clearPadRepeat();
    clearPadLongPress();
    sequencerStore.clearTransientMonitoring();
    setMomentaryMonitor(null);
    setSoundPickerVoice(null);
  };

  const createFreshProject = async () => {
    if (patternRecordingActive()) {
      setNotice("Stop recording before creating a project");
      return;
    }
    if (projectBusy) return;
    setProjectBusy("new");

    try {
      prepareProjectSwitch();
      const id = await projectStore.createNewProject(
        "New Beat",
      );
      if (id) {
        setSelectedVoice("kick");
        setMixLaneId("lane-kick");
        setStepPage(0);
        setFollowPlayhead(true);
        setTouchEditMode("draw");
        setProjectMenuOpen(false);
        setNotice("New beat ready");
      } else {
        setNotice(
          projectStore.getSnapshot().lastError ??
            "New beat could not be created",
        );
      }
    } finally {
      setProjectBusy(null);
    }
  };

  const duplicateCurrentProject = async () => {
    if (patternRecordingActive()) {
      setNotice("Stop recording before duplicating the project");
      return;
    }
    if (projectBusy) return;
    setProjectBusy("duplicate");

    try {
      const id = await projectStore.saveAsNew(
        project.name + " Copy",
      );
      if (id) {
        setProjectMenuOpen(false);
        setNotice("Duplicate ready");
      } else {
        setNotice(
          projectStore.getSnapshot().lastError ??
            "Project could not be duplicated",
        );
      }
    } finally {
      setProjectBusy(null);
    }
  };

  const createRecoverySnapshot = async () => {
    if (projectBusy) return;
    setProjectBusy("snapshot");

    try {
      const label =
        "Recovery " +
        new Intl.DateTimeFormat(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date());
      const version =
        await projectStore.createVersion(label);
      setNotice(
        version
          ? "Recovery snapshot saved"
          : projectStore.getSnapshot().lastError ??
              "Snapshot could not be saved",
      );
    } finally {
      setProjectBusy(null);
    }
  };

  const shareOrExportProject = async () => {
    if (projectBusy) return;
    setProjectBusy("share");

    try {
      const backup = await projectStore.exportBackup();
      if (!backup) {
        setNotice(
          projectStore.getSnapshot().lastError ??
            "Backup could not be created",
        );
        return;
      }

      const file = new File(
        [backup.blob],
        backup.filename,
        {
          type:
            backup.blob.type ||
            "application/zip",
        },
      );
      const shareData: ShareData = {
        title: project.name,
        files: [file],
      };

      let nativeShareAvailable =
        typeof navigator.share === "function";
      if (
        nativeShareAvailable &&
        typeof navigator.canShare === "function"
      ) {
        try {
          nativeShareAvailable =
            navigator.canShare(shareData);
        } catch {
          nativeShareAvailable = false;
        }
      }

      if (nativeShareAvailable) {
        try {
          await navigator.share(shareData);
          setNotice("Project shared");
          return;
        } catch (error) {
          if (
            error instanceof DOMException &&
            error.name === "AbortError"
          ) {
            setNotice("Share cancelled");
            return;
          }
          // Native sharing can still reject at runtime.
          // Fall back to a portable download below.
        }
      }

      triggerBlobDownload(
        backup.blob,
        backup.filename,
      );
      setNotice("Project backup exported");
    } finally {
      setProjectBusy(null);
    }
  };

  const openRecentProject = async (
    projectId: string,
  ) => {
    if (patternRecordingActive()) {
      setNotice("Stop recording before opening another project");
      return;
    }
    if (projectBusy || projectId === project.projectId) {
      setProjectMenuOpen(false);
      return;
    }

    setProjectBusy("open");
    try {
      prepareProjectSwitch();
      const opened =
        await projectStore.openProject(projectId);
      if (opened) {
        setProjectMenuOpen(false);
        setNotice("Project opened");
      } else {
        setNotice(
          projectStore.getSnapshot().lastError ??
            "Project could not be opened",
        );
      }
    } finally {
      setProjectBusy(null);
    }
  };

  return (
    <section className="playground-surface" aria-label="Synth musical playground">
      <header className="playground-topbar">
        <div className="playground-brand" aria-label="Synth">
          <span className="playground-brand__mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <strong>SYNTH</strong>
        </div>

        <div className="playground-topbar__center">
          <label className="playground-style">
            <span>Style</span>
            <select
              value={style}
              disabled={editRecordingLocked}
              aria-label="Beat style"
              onChange={(event) => {
                const nextStyle = event.currentTarget.value as BeatStyleId;
                setStyle(nextStyle);
                applyStyleBeat(nextStyle);
              }}
            >
              {!PLAY_STYLES.includes(style) ? (
                <option value={style}>
                  {styleLabel(style)} · Studio
                </option>
              ) : null}
              {PLAY_STYLES.map((styleId) => (
                <option key={styleId} value={styleId}>
                  {styleLabel(styleId)}
                </option>
              ))}
            </select>
          </label>

          <div className="playground-tempo" aria-label="Tempo">
            <button
              type="button"
              className="playground-tempo__scale"
              onClick={() =>
                audioTransport.setBpm(transport.bpm * 0.5)
              }
              aria-label="Half tempo"
              title="Half tempo"
            >
              ½
            </button>
            <button
              type="button"
              onClick={() => audioTransport.setBpm(transport.bpm - 2)}
              aria-label="Decrease tempo"
            >
              −
            </button>
            <button
              type="button"
              className="playground-tempo__tap"
              onClick={tapTempo}
              aria-label={
                "Tap tempo. Current tempo " +
                Math.round(transport.bpm) +
                " BPM"
              }
              title="Tap repeatedly to set tempo"
            >
              <strong>{Math.round(transport.bpm)}</strong>
              <small>BPM · TAP</small>
            </button>
            <button
              type="button"
              onClick={() => audioTransport.setBpm(transport.bpm + 2)}
              aria-label="Increase tempo"
            >
              +
            </button>
            <button
              type="button"
              className="playground-tempo__scale"
              onClick={() =>
                audioTransport.setBpm(transport.bpm * 2)
              }
              aria-label="Double tempo"
              title="Double tempo"
            >
              ×2
            </button>
          </div>
        </div>

        <div className="playground-topbar__actions">
          <ProjectHealthAlert onOpenStudio={openStudio} />

          <button
            type="button"
            className="playground-history-button"
            onClick={undoPattern}
            disabled={
              !sequencer.canUndo ||
              editRecordingLocked
            }
            aria-label="Undo"
            title="Undo · Ctrl/Cmd-Z"
            data-tip="Undo · Ctrl/Cmd-Z"
          >
            ↶
          </button>
          <button
            type="button"
            className="playground-history-button"
            onClick={redoPattern}
            disabled={
              !sequencer.canRedo ||
              editRecordingLocked
            }
            aria-label="Redo"
            title="Redo · Ctrl/Cmd-Shift-Z"
            data-tip="Redo · Ctrl/Cmd-Shift-Z"
          >
            ↷
          </button>
          <button
            ref={helpButtonRef}
            type="button"
            className="playground-help-button"
            onClick={() => {
              setProjectMenuOpen(false);
              if (finishOpen) {
                renderStore.cancel();
              }
              setFinishOpen(false);
              setStepContext(null);
              setSoundPickerVoice(null);
              setHelpOpen(true);
            }}
            aria-label="Open Playground help"
            data-tip="Help & shortcuts · ?"
          >
            ?
          </button>
          <button
            type="button"
            className="playground-studio-button"
            onClick={openStudio}
            aria-label="Open Studio"
            data-tip="Open advanced Studio"
          >
            Studio
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </header>

      <section
        className="playground-session-bar"
        aria-label="Project session"
      >
        <div className="playground-session-identity">
          <button
            type="button"
            className={
              currentProjectFavorite
                ? "playground-session-favorite is-active"
                : "playground-session-favorite"
            }
            onClick={() => {
              if (project.projectId) {
                projectStore.toggleFavoriteProject(
                  project.projectId,
                );
                pulseHaptic(5);
              }
            }}
            disabled={!project.projectId}
            aria-pressed={currentProjectFavorite}
            aria-label={
              currentProjectFavorite
                ? "Remove project from favorites"
                : "Add project to favorites"
            }
            title={
              currentProjectFavorite
                ? "Favorite project"
                : "Add to favorites"
            }
          >
            ★
          </button>

          <label className="playground-project-name">
            <span className="sr-only">Project name</span>
            <input
              value={projectNameDraft}
              maxLength={80}
              disabled={
                !project.initialized ||
                Boolean(projectBusy)
              }
              onChange={(event) =>
                setProjectNameDraft(
                  event.currentTarget.value,
                )
              }
              onBlur={commitProjectName}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitProjectName();
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  setProjectNameDraft(project.name);
                  event.currentTarget.blur();
                }
              }}
            />
          </label>

          <span
            className={
              "playground-save-state playground-save-state--" +
              project.saveStatus
            }
            title={
              project.lastError ??
              (project.lastSavedAt
                ? "Last saved " +
                  shortProjectTime(
                    project.lastSavedAt,
                  )
                : undefined)
            }
          >
            <i aria-hidden="true" />
            {projectSaveLabel(
              project.saveStatus,
              project.dirty,
            )}
          </span>
        </div>

        <div className="playground-session-actions">
          <button
            type="button"
            onClick={() => void createFreshProject()}
            disabled={
              Boolean(projectBusy) ||
              !project.initialized ||
              !project.supported
            }
          >
            <span aria-hidden="true">＋</span>
            New
          </button>
          <button
            type="button"
            onClick={() =>
              void duplicateCurrentProject()
            }
            disabled={
              Boolean(projectBusy) ||
              !project.initialized ||
              !project.supported
            }
          >
            <span aria-hidden="true">⧉</span>
            Duplicate
          </button>
          <button
            type="button"
            onClick={() =>
              void createRecoverySnapshot()
            }
            disabled={
              Boolean(projectBusy) ||
              !project.initialized ||
              !project.supported ||
              project.saveStatus === "conflict"
            }
          >
            <span aria-hidden="true">◇</span>
            Snapshot
          </button>
          <button
            type="button"
            className={
              finishOpen ? "is-active" : ""
            }
            onClick={() => {
              setProjectMenuOpen(false);
              if (finishOpen) {
                renderStore.cancel();
              }
              setFinishOpen((current) => !current);
            }}
            disabled={
              Boolean(projectBusy) ||
              !project.initialized
            }
            aria-expanded={finishOpen}
            aria-haspopup="dialog"
          >
            <span aria-hidden="true">↓</span>
            Finish
          </button>
          <button
            type="button"
            className={
              projectMenuOpen ? "is-active" : ""
            }
            onClick={() => {
              if (finishOpen) {
                renderStore.cancel();
              }
              setFinishOpen(false);
              setProjectMenuOpen((current) => !current);
            }
            aria-expanded={projectMenuOpen}
            aria-haspopup="dialog"
          >
            <span aria-hidden="true">▤</span>
            Projects
          </button>
        </div>

        {projectMenuOpen ? (
          <div
            className="playground-project-menu"
            role="dialog"
            aria-label="Recent projects"
          >
            <header>
              <div>
                <small>PROJECTS</small>
                <strong>Recent beats</strong>
              </div>
              <button
                type="button"
                onClick={() =>
                  setProjectMenuOpen(false)
                }
                aria-label="Close project menu"
              >
                ×
              </button>
            </header>

            {recentProjects.length > 0 ? (
              <div className="playground-project-menu__list">
                {recentProjects.map((summary) => {
                  const active =
                    summary.id === project.projectId;
                  const favorite =
                    favoriteProjectIds.includes(
                      summary.id,
                    );

                  return (
                    <div
                      key={summary.id}
                      className={
                        active
                          ? "playground-project-menu__row is-active"
                          : "playground-project-menu__row"
                      }
                    >
                      <button
                        type="button"
                        className={
                          favorite
                            ? "playground-project-menu__star is-active"
                            : "playground-project-menu__star"
                        }
                        onClick={() =>
                          projectStore.toggleFavoriteProject(
                            summary.id,
                          )
                        }
                        aria-pressed={favorite}
                        aria-label={
                          favorite
                            ? "Unfavorite " +
                              summary.name
                            : "Favorite " +
                              summary.name
                        }
                      >
                        ★
                      </button>

                      <button
                        type="button"
                        className="playground-project-menu__open"
                        disabled={
                          Boolean(projectBusy) ||
                          active
                        }
                        onClick={() =>
                          void openRecentProject(
                            summary.id,
                          )
                        }
                      >
                        <span>
                          <strong>
                            {summary.name}
                          </strong>
                          <small>
                            {shortProjectTime(
                              summary.updatedAt,
                            )}
                            {" · "}
                            REV {summary.revision}
                          </small>
                        </span>
                        <b>
                          {active
                            ? "Current"
                            : "Open"}
                        </b>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="playground-project-menu__empty">
                No saved projects yet.
              </p>
            )}

            <footer>
              <span>
                Full project library, versions and
                imports are available in Studio.
              </span>
              <button
                type="button"
                onClick={openStudio}
              >
                Open Studio ↗
              </button>
            </footer>
          </div>
        ) : null}
      </section>

      {finishOpen ? (
        <PlaygroundFinishPanel
          projectName={project.name}
          songAvailable={Boolean(
            arrangement.blueprint &&
              arrangement.totalTicks > 0
          )}
          songName={arrangement.blueprint?.name}
          onClose={() => setFinishOpen(false)}
          onNotice={setNotice}
          onProjectBackup={shareOrExportProject}
          onOpenStudio={openStudio}
          projectBackupAvailable={Boolean(
            project.supported &&
              project.projectId
          )}
        />
      ) : null}

      <div className="playground-hero">
        <div>
          <p>MAKE A BEAT</p>
          <h1>Tap. Draw. Play.</h1>
        </div>

        <div className="playground-actions">
          <button
            type="button"
            className={
              playing
                ? "playground-play is-playing"
                : "playground-play"
            }
            onClick={togglePlaybackFlow}
            aria-label={
              countInBeat !== null
                ? "Cancel count-in"
                : playing
                  ? "Pause transport"
                  : countInEnabled
                    ? "Start transport with count-in"
                    : "Start transport"
            }
          >
            <span aria-hidden="true">
              {countInBeat !== null
                ? countInBeat
                : playing
                  ? "Ⅱ"
                  : "▶"}
            </span>
            {countInBeat !== null
              ? "Count " + countInBeat
              : playing
                ? "Pause"
                : "Play"}
          </button>

          <button
            type="button"
            className="playground-remix"
            onClick={remix}
            disabled={editRecordingLocked}
          >
            <span aria-hidden="true">✦</span>
            Remix
          </button>
        </div>
      </div>

      {firstUseHintVisible ? (
        <aside
          className="playground-coach"
          aria-label="Quick start"
        >
          <div>
            <strong>Start anywhere.</strong>
            <span>
              Tap a pad · draw a few steps · long-press a pad for sounds.
            </span>
          </div>
          <span className="playground-coach__desktop">
            Shift-click selects · Shift-drag accents · V toggles Select mode
          </span>
          <button
            type="button"
            onClick={dismissFirstUseHint}
            aria-label="Dismiss quick start"
          >
            ×
          </button>
        </aside>
      ) : null}

      <section
        className="playground-experiment-bar"
        aria-label="Pattern experimentation controls"
      >
        <div className="playground-pattern-banks">
          <span>Pattern</span>
          {(["A", "B"] as const).map((bank) => (
            <button
              type="button"
              key={bank}
              className={
                activePatternBank === bank
                  ? "is-active"
                  : ""
              }
              onClick={() => switchPatternBank(bank)}
              disabled={editRecordingLocked}
              aria-pressed={activePatternBank === bank}
              title={
                patternBanks[bank]
                  ? "Switch to Pattern " + bank
                  : "Create Pattern " + bank + " from current beat"
              }
            >
              {bank}
            </button>
          ))}
          <button
            type="button"
            className="playground-pattern-duplicate"
            onClick={duplicatePatternBank}
            disabled={editRecordingLocked}
            title={
              "Duplicate current beat into Pattern " +
              (activePatternBank === "A" ? "B" : "A")
            }
          >
            Duplicate →
            {activePatternBank === "A" ? "B" : "A"}
          </button>
        </div>

        <div className="playground-remix-safety">
          {lastRemixSourceNodeId ? (
            <button
              type="button"
              className="playground-undo-remix"
              onClick={undoLastRemix}
            >
              ↶ Undo Remix
            </button>
          ) : null}

          {recentRemixes.length > 0 ? (
            <div
              className="playground-remix-history"
              aria-label="Recent remix history"
            >
              <span>Recent</span>
              {recentRemixes.map((node) => (
                <button
                  type="button"
                  key={node.id}
                  className={
                    history.activeNodeId === node.id
                      ? "is-active"
                      : ""
                  }
                  onClick={() =>
                    restoreHistoryNode(
                      node.id,
                      "Restored remix " + node.ordinal,
                    )
                  }
                  title={node.title}
                  aria-label={
                    "Restore recent remix " +
                    node.ordinal +
                    ": " +
                    node.title
                  }
                >
                  R{node.ordinal}
                </button>
              ))}
            </div>
          ) : (
            <span className="playground-safety-note">
              Remix creates a recoverable snapshot automatically
            </span>
          )}
        </div>
      </section>

      <PlaygroundFeelStrip
        disabled={editRecordingLocked}
        onNotice={setNotice}
      />

      <section
        className="playground-flow-bar"
        aria-label="Playback and creative flow"
      >
        <button
          type="button"
          className={countInEnabled ? "is-active" : ""}
          onClick={() => {
            setCountInEnabled((current) => !current);
            pulseHaptic(5);
          }}
          aria-pressed={countInEnabled}
          aria-label="Toggle one bar count-in"
        >
          <span>Count-in</span>
          <b>
            {countInBeat !== null
              ? countInBeat + "/" + transport.meter.numerator
              : countInEnabled
                ? "1 bar"
                : "Off"}
          </b>
        </button>

        <button
          type="button"
          onClick={restartPlayback}
          aria-label="Return playback to step one"
          title="Restart · R"
        >
          <span>Restart</span>
          <b>↺ Step 1</b>
        </button>

        <button
          type="button"
          className={followPlayhead ? "is-active" : ""}
          onClick={() => {
            const next = !followPlayhead;
            setFollowPlayhead(next);
            if (
              next &&
              activeStep !== undefined &&
              pageCount > 1
            ) {
              setStepPage(
                Math.floor(activeStep / pageSize),
              );
            }
            pulseHaptic(5);
            setNotice(
              next
                ? "Playhead follow on"
                : "Playhead follow locked off",
            );
          }}
          aria-pressed={followPlayhead}
        >
          <span>Follow</span>
          <b>{followPlayhead ? "Playhead" : "Page lock"}</b>
        </button>

        <button
          type="button"
          className={
            padRepeatDivision > 0 ? "is-active" : ""
          }
          onClick={cyclePadRepeatDivision}
          aria-label={
            "Pad hold repeat " + repeatLabel
          }
        >
          <span>Hold repeat</span>
          <b>{repeatLabel}</b>
        </button>
      </section>

      <section
        className={[
          "playground-record-bar",
          gridRecord.status === "recording"
            ? "is-recording"
            : "",
          gridRecord.status === "armed"
            ? "is-armed"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="Grid recording"
      >
        <button
          type="button"
          className="playground-record-button"
          disabled={melodicMidiRecording}
          onClick={(event) => {
            event.currentTarget.blur();
            void toggleGridRecording();
          }}
          aria-label={
            gridRecord.status === "recording"
              ? "Stop grid recording"
              : gridRecord.status === "armed"
                ? "Cancel armed recording"
                : "Start grid recording"
          }
          aria-pressed={
            gridRecord.status !== "idle"
          }
        >
          <span aria-hidden="true">
            {gridRecord.status === "recording"
              ? "■"
              : "●"}
          </span>
          <b>
            {gridRecord.status === "recording"
              ? "Stop"
              : gridRecord.status === "armed"
                ? "Armed"
                : "Record"}
          </b>
        </button>

        <div
          className="playground-record-modes"
          aria-label="Recording mode"
        >
          {(["overdub", "erase"] as const).map(
            (mode) => (
              <button
                type="button"
                key={mode}
                className={
                  gridRecord.mode === mode
                    ? "is-active"
                    : ""
                }
                onClick={() =>
                  setGridRecordMode(mode)
                }
                disabled={melodicMidiRecording}
                aria-pressed={
                  gridRecord.mode === mode
                }
              >
                {mode === "overdub"
                  ? "Overdub"
                  : "Erase"}
              </button>
            ),
          )}
        </div>

        <div
          className="playground-record-quantize"
          aria-label="Recording quantize"
        >
          <span>Quantize</span>
          {(
            ["off", "1/16", "1/8", "1/4"] as const
          ).map((quantize) => (
            <button
              type="button"
              key={quantize}
              className={
                gridRecord.quantize === quantize
                  ? "is-active"
                  : ""
              }
              disabled={
                gridRecord.status === "recording"
              }
              onClick={() =>
                setGridRecordQuantize(quantize)
              }
              aria-pressed={
                gridRecord.quantize === quantize
              }
            >
              {quantize === "off"
                ? "Off"
                : quantize}
            </button>
          ))}
        </div>

        {midi.supported ? (
          <button
            type="button"
            className={[
              "playground-record-midi",
              midi.status === "ready"
                ? "is-active"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => void enablePlaygroundMidi()}
            disabled={
              midi.status === "requesting" ||
              midi.status === "ready"
            }
            aria-label={
              midi.status === "ready"
                ? "MIDI input ready"
                : "Enable MIDI input"
            }
            title={
              midi.selectedInputName ??
              "Enable MIDI controller input"
            }
          >
            <span>MIDI</span>
            <b>
              {midi.status === "requesting"
                ? "…"
                : midi.status === "ready"
                  ? "Ready"
                  : "Enable"}
            </b>
          </button>
        ) : null}

        <output
          className="playground-record-status"
          aria-live="polite"
        >
          <strong>
            {melodicMidiRecording
              ? "MELO REC"
              : gridRecord.status === "recording"
                ? "REC"
                : gridRecord.status === "armed"
                  ? "ARMED"
                  : "READY"}
          </strong>
          <span>
            {melodicMidiRecording
              ? "MIDI · " +
                (selectedMelodicDefinition?.name ??
                  "melodic")
              : gridRecord.status === "recording"
                ? gridRecord.hitCount +
                  (gridRecord.hitCount === 1
                    ? " hit"
                    : " hits")
                : "Pads · keys · MIDI"}
          </span>
        </output>
      </section>

      <div className="playground-workbench">
        {remixPulse > 0 ? (
          <span
            key={remixPulse}
            className="playground-remix-wave"
            aria-hidden="true"
          />
        ) : null}

        <section
          className="playground-pad-grid"
          aria-label="Playable instruments"
        >
          {lanes.map(({ definition, lane }) => {
            if (!lane) return null;

            const voice = definition.voice;
            const color = LANE_COLORS[voice];
            const pad = DRUM_PADS.find(
              (entry) => entry.voice === voice,
            );
            const currentSound =
              SOUND_PRESETS[voice][soundIndex[voice]]
                ?.label ?? "Custom";
            const selected = voice === selectedVoice;
            const laneIsPlaying =
              visualStep !== undefined &&
              sequencerStore.getStepVelocity(
                definition.id,
                visualStep,
              ) !== undefined;

            return (
              <article
                key={definition.id}
                className={[
                  "playground-beat-pad",
                  selected ? "is-selected" : "",
                  laneIsPlaying ? "is-playing" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={
                  {
                    "--lane-color": color,
                  } as CSSProperties
                }
              >
                {laneIsPlaying && visualStep !== undefined ? (
                  <span
                    key={
                      definition.id +
                      "-hit-" +
                      visualStep
                    }
                    className="playground-beat-pad__hit"
                    aria-hidden="true"
                  />
                ) : null}
                <button
                  type="button"
                  className="playground-beat-pad__trigger"
                  onPointerDown={(event) =>
                    beginPadLongPress(event, voice)
                  }
                  onPointerMove={movePadLongPress}
                  onPointerUp={endPadLongPress}
                  onPointerCancel={endPadLongPress}
                  onContextMenu={(event) =>
                    event.preventDefault()
                  }
                  onClick={() => {
                    if (
                      suppressPadClickRef.current === voice
                    ) {
                      suppressPadClickRef.current = null;
                      return;
                    }
                    selectDrumTrack(voice);
                    setSoundPickerVoice(null);
                    triggerVoice(voice);
                  }}
                  aria-pressed={selected}
                  aria-label={
                    "Play " +
                    displayLaneName(definition) +
                    (selected ? ", selected" : "")
                  }
                >
                  <span
                    className="playground-beat-pad__key"
                    aria-hidden="true"
                  >
                    {pad?.key ?? definition.code}
                  </span>
                  <strong>
                    {displayLaneName(definition)}
                  </strong>
                  <span
                    className="playground-mini-pattern"
                    aria-hidden="true"
                    style={{
                      gridTemplateColumns:
                        "repeat(" +
                        Math.min(
                          pageSize,
                          sequencer.lengthSteps - pageStart,
                        ) +
                        ", minmax(0, 1fr))",
                    }}
                  >
                    {Array.from(
                      {
                        length: Math.min(
                          pageSize,
                          sequencer.lengthSteps - pageStart,
                        ),
                      },
                      (_, offset) => {
                        const stepIndex =
                          pageStart + offset;
                        const on =
                          sequencerStore.getStepVelocity(
                            definition.id,
                            stepIndex,
                          ) !== undefined;
                        return (
                          <i
                            key={stepIndex}
                            className={[
                              on ? "is-on" : "",
                              visualStep === stepIndex
                                ? "is-current"
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          />
                        );
                      },
                    )}
                  </span>
                  {padPulse.voice === voice ? (
                    <span
                      key={padPulse.serial}
                      className="playground-pad__pulse"
                      aria-hidden="true"
                    />
                  ) : null}
                </button>

                <button
                  type="button"
                  className="playground-beat-pad__sound"
                  onClick={() => {
                    selectDrumTrack(voice);
                    setSoundPickerVoice((current) =>
                      current === voice ? null : voice,
                    );
                  }}
                  aria-label={
                    "Open " +
                    displayLaneName(definition) +
                    " sounds. Current sound " +
                    currentSound
                  }
                >
                  {currentSound}
                  <span aria-hidden="true">›</span>
                </button>
              </article>
            );
          })}
        </section>

        {selectedLane ? (
          <section
            ref={focusRef}
            className="playground-focus"
            aria-label={
              "Whole pattern editor. Selected track tools: " +
              displayLaneName(selectedDefinition)
            }
            style={
              {
                "--lane-color":
                  LANE_COLORS[selectedVoice],
              } as CSSProperties
            }
          >
            <header className="playground-focus__header">
              <div className="playground-focus__identity">
                <span
                  className="playground-focus__swatch"
                  aria-hidden="true"
                />
                <div>
                  <small>
                    EDIT THE WHOLE BEAT · SELECTED TOOLS:{" "}
                    {displayLaneName(selectedDefinition)}
                  </small>
                  <strong>ALL TRACKS</strong>
                </div>
              </div>

              <div className="playground-focus__tools">
                <div
                  className="playground-bar-control"
                  aria-label="Pattern bars"
                >
                  <button
                    type="button"
                    className="playground-bar-control__remove"
                    onClick={deletePatternBar}
                    disabled={
                      editRecordingLocked ||
                      !wholeBarPattern ||
                      pageCount <= 1
                    }
                    aria-label="Delete current bar"
                    title="Delete current bar"
                  >
                    −
                  </button>
                  <div className="playground-bar-tabs">
                    {Array.from(
                      { length: pageCount },
                      (_, index) => (
                        <button
                          type="button"
                          key={index}
                          className={
                            stepPage === index
                              ? "is-active"
                              : ""
                          }
                          onClick={() => {
                            setFollowPlayhead(false);
                            setStepPage(index);
                          }}
                          aria-pressed={
                            stepPage === index
                          }
                          aria-label={"Bar " + (index + 1)}
                        >
                          {index + 1}
                        </button>
                      ),
                    )}
                  </div>
                  <button
                    type="button"
                    className="playground-bar-control__add"
                    onClick={addPatternBar}
                    disabled={
                      editRecordingLocked ||
                      atBarLimit
                    }
                    aria-label="Add bar"
                    title="Add a blank bar"
                  >
                    ＋
                  </button>
                </div>

                <div
                  className="playground-bar-actions"
                  aria-label="Current bar actions"
                >
                  <button
                    type="button"
                    onClick={duplicatePatternBar}
                    disabled={
                      editRecordingLocked ||
                      !wholeBarPattern ||
                      atBarLimit
                    }
                    aria-label="Duplicate current bar"
                    title="Insert a copy after this bar"
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={clearPatternBar}
                    disabled={
                      editRecordingLocked ||
                      !wholeBarPattern
                    }
                    aria-label="Clear current bar"
                    title="Remove all notes from this bar"
                  >
                    Clear
                  </button>
                </div>

                <div
                  className="playground-sound-cycle"
                  aria-label={
                    displayLaneName(selectedDefinition) +
                    " sound selector"
                  }
                >
                  <button
                    type="button"
                    onClick={() =>
                      cycleSound(selectedVoice, -1)
                    }
                    disabled={Boolean(soundLoading)}
                    aria-label="Previous sound"
                    title="Previous sound"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="playground-focus__sound"
                    onClick={toggleSelectedSoundPicker}
                    disabled={Boolean(soundLoading)}
                    aria-label={
                      "Change " +
                      displayLaneName(selectedDefinition) +
                      " sound. Current sound " +
                      selectedSound
                    }
                  >
                    <span>{selectedSound}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      cycleSound(selectedVoice, 1)
                    }
                    disabled={Boolean(soundLoading)}
                    aria-label="Next sound"
                    title="Next sound"
                  >
                    ›
                  </button>
                </div>
              </div>
            </header>

            <div
              className={[
                "playground-selection-bar",
                selectedSteps.length > 0
                  ? "has-selection"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-label="Note selection tools"
            >
              <div className="playground-selection-status">
                <span>SELECT</span>
                <strong>
                  {selectedSteps.length > 0
                    ? selectedSteps.length +
                      (selectedSteps.length === 1
                        ? " note"
                        : " notes")
                    : "Batch edit"}
                </strong>
              </div>

              <div
                className="playground-selection-scope"
                aria-label="Selection scope"
              >
                <button
                  type="button"
                  onClick={selectCurrentBar}
                  disabled={editRecordingLocked}
                  aria-label="Select current bar notes"
                >
                  Bar
                </button>
                <button
                  type="button"
                  onClick={selectCurrentTrack}
                  disabled={editRecordingLocked}
                  aria-label="Select current track notes"
                >
                  Track
                </button>
                <button
                  type="button"
                  onClick={selectAllNotes}
                  disabled={editRecordingLocked}
                  aria-label="Select all pattern notes"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearSelection();
                    setNotice("Selection cleared");
                  }}
                  disabled={
                      editRecordingLocked ||
                      selectedSteps.length === 0
                    }
                  aria-label="Clear note selection"
                >
                  Clear
                </button>
              </div>

              {selectedSteps.length > 0 ? (
                <div
                  className="playground-selection-actions"
                  aria-label="Selected note actions"
                >
                  <button
                    type="button"
                    onClick={batchDeleteSelection}
                    disabled={
                      editRecordingLocked ||
                      selectedSteps.length === 0
                    }
                    aria-label="Delete selected notes"
                    title="Delete · Delete/Backspace"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={batchCopySelection}
                    disabled={
                      editRecordingLocked ||
                      selectedSteps.length === 0
                    }
                    aria-label="Copy selected notes"
                    title="Copy · Ctrl/Cmd-C"
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={batchPasteSelection}
                    disabled={
                      editRecordingLocked ||
                      !selectionClipboard
                    }
                    aria-label="Paste copied notes to current bar"
                    title="Paste at current bar · Ctrl/Cmd-V"
                  >
                    Paste
                  </button>
                  <button
                    type="button"
                    onClick={batchDuplicateSelection}
                    disabled={
                      editRecordingLocked ||
                      selectedSteps.length === 0
                    }
                    aria-label="Duplicate selected notes"
                    title="Duplicate · Ctrl/Cmd-D"
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      batchMoveSelection(-1)
                    }
                    disabled={
                      editRecordingLocked ||
                      selectedSteps.length === 0
                    }
                    aria-label="Move selected notes left one step"
                    title="Move left · ←"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      batchMoveSelection(1)
                    }
                    disabled={
                      editRecordingLocked ||
                      selectedSteps.length === 0
                    }
                    aria-label="Move selected notes right one step"
                    title="Move right · →"
                  >
                    →
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      batchAdjustVelocity(-0.08)
                    }
                    disabled={
                      editRecordingLocked ||
                      selectedSteps.length === 0
                    }
                    aria-label="Make selected notes softer"
                    title="Velocity down · ["
                  >
                    Vel−
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      batchAdjustVelocity(0.08)
                    }
                    disabled={
                      editRecordingLocked ||
                      selectedSteps.length === 0
                    }
                    aria-label="Make selected notes louder"
                    title="Velocity up · ]"
                  >
                    Vel＋
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      batchSetDynamic("ghost")
                    }
                    disabled={
                      editRecordingLocked ||
                      selectedSteps.length === 0
                    }
                    aria-label="Make selected notes ghost notes"
                    title="Ghost · 1"
                  >
                    Ghost
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      batchSetDynamic("normal")
                    }
                    disabled={
                      editRecordingLocked ||
                      selectedSteps.length === 0
                    }
                    aria-label="Make selected notes normal"
                    title="Normal · 2"
                  >
                    Normal
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      batchSetDynamic("accent")
                    }
                    disabled={
                      editRecordingLocked ||
                      selectedSteps.length === 0
                    }
                    aria-label="Accent selected notes"
                    title="Accent · 3"
                  >
                    Accent
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      batchNudgeTiming(-5_000)
                    }
                    disabled={
                      editRecordingLocked ||
                      selectedSteps.length === 0
                    }
                    aria-label="Move selected notes earlier"
                    title="Timing earlier · ,"
                  >
                    Early
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      batchNudgeTiming(5_000)
                    }
                    disabled={
                      editRecordingLocked ||
                      selectedSteps.length === 0
                    }
                    aria-label="Move selected notes later"
                    title="Timing later · ."
                  >
                    Late
                  </button>
                  <button
                    type="button"
                    className="playground-selection-variation"
                    onClick={cycleSelectedChance}
                    disabled={
                      editRecordingLocked ||
                      selectedSteps.length === 0
                    }
                    aria-label="Cycle selected note chance"
                    title="Chance: 100 → 75 → 50 → 25%"
                  >
                    Chance{" "}
                    {selectedVariation.probability === null
                      ? "Mix"
                      : Math.round(
                          selectedVariation.probability * 100,
                        ) + "%"}
                  </button>
                  <button
                    type="button"
                    className="playground-selection-variation"
                    onClick={cycleSelectedRepeat}
                    disabled={
                      editRecordingLocked ||
                      selectedSteps.length === 0
                    }
                    aria-label="Cycle selected note repeat"
                    title="Repeat: ×1 → ×2 → ×3 → ×4"
                  >
                    Repeat{" "}
                    {selectedVariation.ratchetCount === null
                      ? "Mix"
                      : "×" +
                        Math.round(
                          selectedVariation.ratchetCount,
                        )}
                  </button>
                  <button
                    type="button"
                    className="playground-selection-variation"
                    onClick={cycleSelectedFlam}
                    disabled={
                      editRecordingLocked ||
                      selectedSteps.length === 0
                    }
                    aria-label="Cycle selected note flam"
                    title="Flam: Off → 15 ms → 30 ms"
                  >
                    Flam{" "}
                    {selectedVariation.flamOffsetUs === null
                      ? "Mix"
                      : selectedVariation.flamOffsetUs <= 0
                        ? "Off"
                        : Math.round(
                            selectedVariation.flamOffsetUs /
                              1000,
                          ) + "ms"}
                  </button>
                </div>
              ) : (
                <div className="playground-selection-hint">
                  Shift-click notes · Ctrl/Cmd-drag a region · V = Select
                </div>
              )}
            </div>

            <div
              className="playground-multitrack"
              aria-label="All track pattern editor"
              onPointerMove={continuePaint}
              onPointerUp={(event) =>
                finishPaint(event.pointerId)
              }
              onPointerCancel={(event) =>
                finishPaint(event.pointerId, true)
              }
            >
              <div className="playground-multitrack__ruler">
                <div className="playground-multitrack__corner">
                  <span>TRACK</span>
                  <b>
                    BAR {stepPage + 1}/{pageCount}
                  </b>
                </div>
                <div
                  className="playground-multitrack__numbers"
                  style={{
                    gridTemplateColumns:
                      "repeat(" +
                      Math.min(
                        pageSize,
                        sequencer.lengthSteps - pageStart,
                      ) +
                      ", minmax(0, 1fr))",
                  }}
                >
                  {Array.from(
                    {
                      length: Math.min(
                        pageSize,
                        sequencer.lengthSteps - pageStart,
                      ),
                    },
                    (_, offset) => {
                      const stepIndex = pageStart + offset;
                      return (
                        <span
                          key={stepIndex}
                          className={
                            offset % 4 === 0
                              ? "is-beat"
                              : ""
                          }
                        >
                          {stepIndex + 1}
                        </span>
                      );
                    },
                  )}
                </div>
              </div>

              {lanes.map(({ definition, lane }) => {
                if (!lane) return null;

                const voice = definition.voice;
                const selected = voice === selectedVoice;
                const currentSound =
                  SOUND_PRESETS[voice][soundIndex[voice]]
                    ?.label ?? "Custom";
                const visibleSteps = Math.min(
                  pageSize,
                  sequencer.lengthSteps - pageStart,
                );

                return (
                  <div
                    key={definition.id}
                    className={[
                      "playground-track-row",
                      selected ? "is-selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={
                      {
                        "--lane-color": LANE_COLORS[voice],
                      } as CSSProperties
                    }
                  >
                    <div className="playground-track-head">
                      <button
                        type="button"
                        className="playground-track-select"
                        onClick={() => {
                          selectDrumTrack(voice);
                          setSoundPickerVoice(null);
                        }}
                        aria-pressed={selected}
                        aria-label={
                          "Select " +
                          displayLaneName(definition) +
                          " tools"
                        }
                      >
                        <span
                          className="playground-track-swatch"
                          aria-hidden="true"
                        />
                        <span>
                          <strong>
                            {displayLaneName(definition)}
                          </strong>
                          <small>{currentSound}</small>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="playground-track-sound"
                        onClick={() => {
                          selectDrumTrack(voice);
                          setSoundPickerVoice((current) =>
                            current === voice ? null : voice,
                          );
                        }}
                        aria-label={
                          "Change " +
                          displayLaneName(definition) +
                          " sound"
                        }
                        title={"Sound · " + currentSound}
                      >
                        ♪
                      </button>
                    </div>

                    <div
                      className="playground-steps playground-steps--lane"
                      style={{
                        gridTemplateColumns:
                          "repeat(" +
                          visibleSteps +
                          ", minmax(0, 1fr))",
                      }}
                    >
                      {Array.from(
                        { length: visibleSteps },
                        (_, offset) => {
                          const stepIndex = pageStart + offset;
                          const velocity =
                            sequencerStore.getStepVelocity(
                              definition.id,
                              stepIndex,
                            );
                          const stepEvent =
                            lane.events.find(
                              (event) =>
                                Math.round(
                                  event.tick /
                                    FOUNDATION_STEP_TICKS,
                                ) === stepIndex,
                            );
                          const stepProbability =
                            stepEvent?.probability ?? 1;
                          const stepRatchet = Math.max(
                            1,
                            stepEvent?.ratchetCount ?? 1,
                          );
                          const stepFlamUs = Math.max(
                            0,
                            stepEvent?.flamOffsetUs ?? 0,
                          );
                          const variationLabel = [
                            stepProbability < 0.995
                              ? Math.round(
                                  stepProbability * 100,
                                ) + "%"
                              : "",
                            stepRatchet > 1
                              ? "×" + stepRatchet
                              : "",
                            stepFlamUs > 0
                              ? "F"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ");
                          const on = velocity !== undefined;
                          const current =
                            visualStep === stepIndex;
                          const recordedNow =
                            gridRecord.status === "recording" &&
                            gridRecord.lastVoice === voice &&
                            gridRecord.lastStepIndex === stepIndex;

                          return (
                            <button
                              type="button"
                              key={stepIndex}
                              className={[
                                "playground-step",
                                on ? "is-on" : "",
                                velocity !== undefined &&
                                velocity >= 0.85
                                  ? "is-accent"
                                  : "",
                                velocity !== undefined &&
                                velocity <= 0.3
                                  ? "is-ghost"
                                  : "",
                                current
                                  ? "is-current"
                                  : "",
                                recordedNow
                                  ? "is-recorded-now"
                                  : "",
                                selectedStepKeys.has(
                                  definition.id +
                                    ":" +
                                    stepIndex,
                                )
                                  ? "is-selected"
                                  : "",
                                variationLabel
                                  ? "has-variation"
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              style={
                                {
                                  "--step-strength":
                                    velocity === undefined
                                      ? 0
                                      : Math.max(
                                          0.3,
                                          velocity,
                                        ),
                                  "--step-opacity":
                                    velocity === undefined
                                      ? 1
                                      : 0.56 +
                                        velocity * 0.44,
                                  "--step-indicator-scale":
                                    velocity === undefined
                                      ? 0.72
                                      : 0.62 +
                                        velocity * 0.38,
                                } as CSSProperties
                              }
                              data-play-step="true"
                              data-lane-id={definition.id}
                              data-step-index={stepIndex}
                              aria-pressed={on}
                              aria-label={
                                displayLaneName(definition) +
                                " step " +
                                (stepIndex + 1) +
                                (on
                                  ? ", on, velocity " +
                                    Math.round(
                                      (velocity ?? 0) * 100,
                                    ) +
                                    " percent" +
                                    (stepProbability < 0.995
                                      ? ", chance " +
                                        Math.round(
                                          stepProbability * 100,
                                        ) +
                                        " percent"
                                      : "") +
                                    (stepRatchet > 1
                                      ? ", repeat " +
                                        stepRatchet +
                                        " times"
                                      : "") +
                                    (stepFlamUs > 0
                                      ? ", flam " +
                                        Math.round(
                                          stepFlamUs / 1000,
                                        ) +
                                        " milliseconds"
                                      : "") +
                                    (selectedStepKeys.has(
                                      definition.id +
                                        ":" +
                                        stepIndex,
                                    )
                                      ? ", selected for batch editing"
                                      : "") +
                                    ". Click to remove; drag vertically for velocity"
                                  : ", off. Click to add")
                              }
                              onPointerDown={(event) => {
                                selectDrumTrack(voice);
                                if (
                                  soundPickerVoice !== null &&
                                  soundPickerVoice !== voice
                                ) {
                                  setSoundPickerVoice(null);
                                }
                                beginGridPointer(
                                  event,
                                  definition.id,
                                  stepIndex,
                                );
                              }}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                clearStepContextLongPress();
                                openStepContext(
                                  definition.id,
                                  stepIndex,
                                  event.clientX,
                                  event.clientY,
                                );
                              }}
                              onClick={(event) => {
                                if (event.detail !== 0) return;
                                selectDrumTrack(voice);
                                activateFromKeyboard(
                                  definition.id,
                                  stepIndex,
                                  event.altKey
                                    ? "ghost"
                                    : event.shiftKey
                                      ? "accent"
                                      : undefined,
                                );
                              }}
                            >
                              <span aria-hidden="true" />
                              {variationLabel ? (
                                <small
                                  className="playground-step__variation"
                                  aria-hidden="true"
                                >
                                  {variationLabel}
                                </small>
                              ) : null}
                            </button>
                          );
                        },
                      )}
                    </div>
                  </div>
                );
              })}

              {melodicLanes.map(
                ({ definition, lane }) => {
                  if (!lane) return null;

                  const selected =
                    selectedMelodicLaneId ===
                    definition.id;
                  const presets =
                    MELODIC_PRESETS[
                      definition.track
                    ];
                  const preset =
                    presets.find(
                      (entry) =>
                        entry.id ===
                        lane.instrumentPresetId,
                    ) ?? presets[0];
                  const visibleSteps = Math.min(
                    pageSize,
                    sequencer.lengthSteps -
                      pageStart,
                  );

                  return (
                    <div
                      key={definition.id}
                      className={[
                        "playground-track-row",
                        "playground-track-row--melodic",
                        selected
                          ? "is-selected"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={
                        {
                          "--lane-color":
                            MELODIC_COLORS[
                              definition.track
                            ],
                        } as CSSProperties
                      }
                    >
                      <div className="playground-track-head">
                        <button
                          type="button"
                          className="playground-track-select"
                          onClick={() =>
                            selectMelodicTrack(
                              definition.id,
                            )
                          }
                          aria-pressed={selected}
                          aria-label={
                            "Open " +
                            definition.name +
                            " piano roll"
                          }
                        >
                          <span
                            className="playground-track-swatch"
                            aria-hidden="true"
                          />
                          <span>
                            <strong>
                              {definition.name}
                            </strong>
                            <small>
                              {preset?.label ??
                                "Synth"}
                            </small>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="playground-track-sound"
                          onClick={() => {
                            setSelectedMelodicLaneId(
                              definition.id,
                            );
                            setMixLaneId(
                              definition.id,
                            );
                            cycleMelodicPreset(
                              definition,
                              1,
                            );
                          }}
                          aria-label={
                            "Change " +
                            definition.name +
                            " instrument"
                          }
                          title={
                            "Instrument · " +
                            (preset?.label ??
                              "Synth")
                          }
                        >
                          ♫
                        </button>
                      </div>

                      <div
                        className="playground-steps playground-steps--lane playground-steps--melodic"
                        style={{
                          gridTemplateColumns:
                            "repeat(" +
                            visibleSteps +
                            ", minmax(0, 1fr))",
                        }}
                      >
                        {Array.from(
                          {
                            length:
                              visibleSteps,
                          },
                          (_, offset) => {
                            const stepIndex =
                              pageStart + offset;
                            const started =
                              lane.events.find(
                                (event) =>
                                  Math.round(
                                    event.tick /
                                      FOUNDATION_STEP_TICKS,
                                  ) ===
                                  stepIndex,
                              );
                            const held =
                              !started
                                ? lane.events.find(
                                    (event) => {
                                      const start =
                                        Math.round(
                                          event.tick /
                                            FOUNDATION_STEP_TICKS,
                                        );
                                      const duration =
                                        Math.max(
                                          1,
                                          Math.round(
                                            (event.durationTicks ??
                                              FOUNDATION_STEP_TICKS) /
                                              FOUNDATION_STEP_TICKS,
                                          ),
                                        );
                                      return (
                                        start <
                                          stepIndex &&
                                        start +
                                          duration >
                                          stepIndex
                                      );
                                    },
                                  )
                                : undefined;
                            const source =
                              started ?? held;
                            const pitch =
                              source?.pitchMidi ??
                              definition.defaultPitchMidi;
                            const isCurrent =
                              visualStep ===
                              stepIndex;

                            return (
                              <button
                                type="button"
                                key={
                                  definition.id +
                                  "-" +
                                  stepIndex
                                }
                                className={[
                                  "playground-step",
                                  "playground-step--melodic",
                                  started
                                    ? "is-on"
                                    : "",
                                  held
                                    ? "is-held"
                                    : "",
                                  isCurrent
                                    ? "is-current"
                                    : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                                aria-label={
                                  started
                                    ? definition.name +
                                      " " +
                                      midiNoteLabel(
                                        pitch,
                                      ) +
                                      " at step " +
                                      (stepIndex + 1) +
                                      ". Open piano roll"
                                    : held
                                      ? definition.name +
                                        " " +
                                        midiNoteLabel(
                                          pitch,
                                        ) +
                                        " held from step " +
                                        (Math.round(
                                          held.tick /
                                            FOUNDATION_STEP_TICKS,
                                        ) +
                                          1) +
                                        ". Open piano roll"
                                      : "Add " +
                                        definition.name +
                                        " note at step " +
                                        (stepIndex +
                                          1)
                                }
                                onClick={() => {
                                  setSelectedMelodicLaneId(
                                    definition.id,
                                  );
                                  setMixLaneId(
                                    definition.id,
                                  );

                                  if (source) {
                                    const sourceStep =
                                      Math.round(
                                        source.tick /
                                          FOUNDATION_STEP_TICKS,
                                      );
                                    setSelectedMelodicNote({
                                      laneId:
                                        definition.id,
                                      stepIndex:
                                        sourceStep,
                                    });
                                    setMelodicPitchCursor(
                                      (current) => ({
                                        ...current,
                                        [definition.track]:
                                          source.pitchMidi ??
                                          definition.defaultPitchMidi,
                                      }),
                                    );
                                    auditionMelodic(
                                      definition,
                                      melodicEventPitches(
                                        definition,
                                        source,
                                      ),
                                      Math.max(
                                        1,
                                        Math.round(
                                          (source.durationTicks ??
                                            FOUNDATION_STEP_TICKS) /
                                            FOUNDATION_STEP_TICKS,
                                        ),
                                      ),
                                      source.velocity,
                                    );
                                  } else {
                                    createMelodicNoteAt(
                                      definition.id,
                                      stepIndex,
                                      melodicPitchCursor[
                                        definition
                                          .track
                                      ],
                                    );
                                  }
                                }}
                              >
                                {started ? (
                                  <span>
                                    {midiNoteLabel(
                                      pitch,
                                    )}
                                  </span>
                                ) : null}
                              </button>
                            );
                          },
                        )}
                      </div>
                    </div>
                  );
                },
              )}
            </div>

            <PlaygroundMixStrip
              laneId={mixLaneId}
              onNotice={setNotice}
            />

            {selectedMelodicDefinition &&
            selectedMelodicLane ? (
              <section
                className="playground-piano"
                aria-label={
                  selectedMelodicDefinition.name +
                  " piano roll"
                }
                style={
                  {
                    "--lane-color":
                      MELODIC_COLORS[
                        selectedMelodicDefinition
                          .track
                      ],
                  } as CSSProperties
                }
              >
                <header className="playground-piano__toolbar">
                  <div className="playground-piano__identity">
                    <span>MELODIC</span>
                    <strong>
                      {
                        selectedMelodicDefinition.name
                      }
                    </strong>
                  </div>

                  <div
                    className="playground-piano__preset"
                    aria-label="Melodic instrument preset"
                  >
                    <button
                      type="button"
                      disabled={melodicMidiRecording}
                      onClick={() =>
                        cycleMelodicPreset(
                          selectedMelodicDefinition,
                          -1,
                        )
                      }
                      aria-label="Previous melodic instrument"
                    >
                      ‹
                    </button>
                    <b>
                      {selectedMelodicPreset?.label ??
                        "Synth"}
                    </b>
                    <button
                      type="button"
                      disabled={melodicMidiRecording}
                      onClick={() =>
                        cycleMelodicPreset(
                          selectedMelodicDefinition,
                          1,
                        )
                      }
                      aria-label="Next melodic instrument"
                    >
                      ›
                    </button>
                  </div>

                  <label className="playground-piano__select">
                    <span>Sound</span>
                    <select
                      aria-label="Choose melodic instrument"
                      disabled={melodicMidiRecording}
                      value={
                        selectedMelodicPreset?.id ?? ""
                      }
                      onChange={(event) =>
                        chooseMelodicPreset(
                          selectedMelodicDefinition,
                          event.currentTarget.value,
                        )
                      }
                    >
                      {MELODIC_PRESETS[
                        selectedMelodicDefinition.track
                      ].map((preset) => (
                        <option
                          key={preset.id}
                          value={preset.id}
                        >
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    className={[
                      "playground-piano__midi-record",
                      melodicMidiRecording
                        ? "is-active"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() =>
                      void toggleMelodicMidiRecording()
                    }
                    aria-pressed={
                      melodicMidiRecording
                    }
                    aria-label={
                      melodicMidiRecording
                        ? "Stop melodic MIDI recording"
                        : "Start melodic MIDI recording"
                    }
                    title={
                      midi.status === "ready"
                        ? "Record notes and held lengths from MIDI"
                        : "Enable MIDI and record this melodic track"
                    }
                  >
                    {melodicMidiRecording
                      ? "■ MIDI REC"
                      : "● MIDI REC"}
                  </button>

                  <label className="playground-piano__select">
                    <span>Key</span>
                    <select
                      aria-label="Melodic key"
                      disabled={melodicMidiRecording}
                      value={
                        harmonicContext.rootPitchClass
                      }
                      onChange={(event) =>
                        setMelodicHarmony({
                          rootPitchClass:
                            Number(
                              event.currentTarget
                                .value,
                            ),
                        })
                      }
                    >
                      {KEY_OPTIONS.map(
                        (option) => (
                          <option
                            key={option.value}
                            value={option.value}
                          >
                            {option.label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>

                  <label className="playground-piano__select">
                    <span>Scale</span>
                    <select
                      aria-label="Melodic scale"
                      disabled={melodicMidiRecording}
                      value={
                        harmonicContext.scaleId
                      }
                      onChange={(event) =>
                        setMelodicHarmony({
                          scaleId:
                            event.currentTarget
                              .value as ScaleId,
                        })
                      }
                    >
                      {SCALE_OPTIONS.map(
                        (option) => (
                          <option
                            key={option.id}
                            value={option.id}
                          >
                            {option.label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>

                  <button
                    type="button"
                    className={[
                      "playground-piano__scale-lock",
                      harmonicContext.lockToScale
                        ? "is-active"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() =>
                      setMelodicHarmony({
                        lockToScale:
                          !harmonicContext.lockToScale,
                      })
                    }
                    aria-pressed={
                      harmonicContext.lockToScale
                    }
                    disabled={melodicMidiRecording}
                    aria-label="Lock melodic notes to scale"
                  >
                    Scale Lock
                  </button>

                  <div
                    className="playground-piano__duration"
                    aria-label="New note length"
                  >
                    {[1, 2, 4, 8, 16].map(
                      (steps) => (
                        <button
                          type="button"
                          key={steps}
                          className={
                            melodicDurationSteps ===
                            steps
                              ? "is-active"
                              : ""
                          }
                          disabled={melodicMidiRecording}
                          onClick={() => {
                            if (melodicMidiRecording) {
                              return;
                            }
                            setMelodicDurationSteps(
                              steps,
                            );
                            if (
                              selectedMelodicNote &&
                              selectedMelodicEvent
                            ) {
                              sequencerStore.setMelodicDurationSteps(
                                selectedMelodicNote.laneId,
                                selectedMelodicNote.stepIndex,
                                steps,
                              );
                            }
                          }}
                          aria-pressed={
                            melodicDurationSteps ===
                            steps
                          }
                        >
                          {melodicDurationLabel(
                            steps,
                          )}
                        </button>
                      ),
                    )}
                  </div>

                  <div className="playground-piano__octave">
                    <button
                      type="button"
                      onClick={() =>
                        setMelodicOctaveShift(
                          (current) => ({
                            ...current,
                            [selectedMelodicDefinition.track]:
                              Math.max(
                                -2,
                                current[
                                  selectedMelodicDefinition
                                    .track
                                ] - 1,
                              ),
                          }),
                        )
                      }
                      aria-label="Piano roll octave down"
                    >
                      Oct−
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setMelodicOctaveShift(
                          (current) => ({
                            ...current,
                            [selectedMelodicDefinition.track]:
                              Math.min(
                                2,
                                current[
                                  selectedMelodicDefinition
                                    .track
                                ] + 1,
                              ),
                          }),
                        )
                      }
                      aria-label="Piano roll octave up"
                    >
                      Oct＋
                    </button>
                  </div>
                </header>

                {selectedMelodicDefinition.track ===
                "chords" ? (
                  <div
                    className="playground-piano__chords"
                    aria-label="Chord shape"
                  >
                    {CHORD_SHAPES.map(
                      (shape) => (
                        <button
                          type="button"
                          key={shape.id}
                          className={
                            chordShape ===
                            shape.id
                              ? "is-active"
                              : ""
                          }
                          onClick={() =>
                            applyChordShape(
                              shape.id,
                            )
                          }
                          aria-pressed={
                            chordShape ===
                            shape.id
                          }
                        >
                          {shape.label}
                        </button>
                      ),
                    )}
                  </div>
                ) : null}

                <div className="playground-piano__note-tools">
                  <span>
                    {selectedMelodicEvent
                      ? melodicEventPitches(
                          selectedMelodicDefinition,
                          selectedMelodicEvent,
                        )
                          .map(midiNoteLabel)
                          .join(" / ")
                      : "Click the roll to add a note"}
                  </span>
                  <button
                    type="button"
                    className={
                      selectedMelodicLane.muted
                        ? "is-active"
                        : ""
                    }
                    onClick={() => {
                      if (melodicMidiRecording) {
                        setNotice("Stop recording before changing mute");
                        return;
                      }
                      sequencerStore.toggleMute(
                        selectedMelodicDefinition.id,
                      );
                    }}
                    disabled={melodicMidiRecording}
                    aria-pressed={
                      selectedMelodicLane.muted ??
                      false
                    }
                    aria-label="Mute selected melodic track"
                  >
                    Mute
                  </button>
                  <button
                    type="button"
                    className={
                      selectedMelodicLane.solo
                        ? "is-active"
                        : ""
                    }
                    onClick={() => {
                      if (melodicMidiRecording) {
                        setNotice("Stop recording before changing solo");
                        return;
                      }
                      sequencerStore.toggleSolo(
                        selectedMelodicDefinition.id,
                      );
                    }}
                    disabled={melodicMidiRecording}
                    aria-pressed={
                      selectedMelodicLane.solo ??
                      false
                    }
                    aria-label="Solo selected melodic track"
                  >
                    Solo
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      changeSelectedMelodicPitch(
                        -1,
                      )
                    }
                    disabled={
                      !selectedMelodicEvent
                    }
                    aria-label="Move selected melodic note down"
                  >
                    Pitch−
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      changeSelectedMelodicPitch(
                        1,
                      )
                    }
                    disabled={
                      !selectedMelodicEvent
                    }
                    aria-label="Move selected melodic note up"
                  >
                    Pitch＋
                  </button>
                  <button
                    type="button"
                    onClick={
                      removeSelectedMelodicNote
                    }
                    disabled={
                      !selectedMelodicEvent
                    }
                    aria-label="Delete selected melodic note"
                  >
                    Delete
                  </button>
                </div>

                <div className="playground-piano__viewport">
                  <div
                    className="playground-piano__ruler"
                    aria-hidden="true"
                  >
                    <span />
                    {Array.from(
                      {
                        length: Math.min(
                          pageSize,
                          sequencer.lengthSteps -
                            pageStart,
                        ),
                      },
                      (_, offset) => (
                        <b
                          key={
                            pageStart +
                            offset
                          }
                        >
                          {pageStart +
                            offset +
                            1}
                        </b>
                      ),
                    )}
                  </div>

                  {melodicPitchRows.map(
                    (pitch) => {
                      const visibleSteps =
                        Math.min(
                          pageSize,
                          sequencer.lengthSteps -
                            pageStart,
                        );
                      const pageEnd =
                        pageStart +
                        visibleSteps;
                      const events =
                        selectedMelodicLane.events.filter(
                          (event) => {
                            const pitches =
                              melodicEventPitches(
                                selectedMelodicDefinition,
                                event,
                              );
                            if (
                              !pitches.includes(
                                pitch,
                              )
                            ) {
                              return false;
                            }
                            const start =
                              Math.round(
                                event.tick /
                                  FOUNDATION_STEP_TICKS,
                              );
                            const duration =
                              Math.max(
                                1,
                                Math.round(
                                  (event.durationTicks ??
                                    FOUNDATION_STEP_TICKS) /
                                    FOUNDATION_STEP_TICKS,
                                ),
                              );
                            return (
                              start <
                                pageEnd &&
                              start +
                                duration >
                                pageStart
                            );
                          },
                        );
                      const inScale =
                        pitchIsInScale(
                          pitch,
                          harmonicContext.rootPitchClass,
                          harmonicContext.scaleId,
                        );
                      const isRoot =
                        pitch % 12 ===
                        harmonicContext.rootPitchClass;

                      return (
                        <div
                          key={pitch}
                          className={[
                            "playground-piano-row",
                            inScale
                              ? "is-in-scale"
                              : "",
                            isRoot
                              ? "is-root"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <button
                            type="button"
                            className="playground-piano-key"
                            onClick={() => {
                              setMelodicPitchCursor(
                                (current) => ({
                                  ...current,
                                  [selectedMelodicDefinition.track]:
                                    pitch,
                                }),
                              );
                              auditionMelodic(
                                selectedMelodicDefinition,
                                selectedMelodicDefinition.track ===
                                  "chords"
                                  ? chordPitchesForRoot(
                                      pitch,
                                    )
                                  : [pitch],
                                1,
                              );
                            }}
                            aria-label={
                              "Audition " +
                              midiNoteLabel(
                                pitch,
                              )
                            }
                          >
                            {midiNoteLabel(
                              pitch,
                            )}
                          </button>

                          <div
                            className="playground-piano-grid"
                            style={{
                              gridTemplateColumns:
                                "repeat(" +
                                visibleSteps +
                                ", minmax(36px, 1fr))",
                            }}
                          >
                            {Array.from(
                              {
                                length:
                                  visibleSteps,
                              },
                              (_, offset) => {
                                const stepIndex =
                                  pageStart +
                                  offset;
                                return (
                                  <button
                                    type="button"
                                    key={
                                      pitch +
                                      "-" +
                                      stepIndex
                                    }
                                    className={
                                      offset %
                                        4 ===
                                      0
                                        ? "playground-piano-cell is-beat"
                                        : "playground-piano-cell"
                                    }
                                    onClick={() =>
                                      createMelodicNoteAt(
                                        selectedMelodicDefinition.id,
                                        stepIndex,
                                        pitch,
                                      )
                                    }
                                    aria-label={
                                      "Add " +
                                      selectedMelodicDefinition.name +
                                      " " +
                                      midiNoteLabel(
                                        pitch,
                                      ) +
                                      " at step " +
                                      (stepIndex +
                                        1)
                                    }
                                  />
                                );
                              },
                            )}

                            {events.map(
                              (event) => {
                                const start =
                                  Math.round(
                                    event.tick /
                                      FOUNDATION_STEP_TICKS,
                                  );
                                const duration =
                                  Math.max(
                                    1,
                                    Math.round(
                                      (event.durationTicks ??
                                        FOUNDATION_STEP_TICKS) /
                                        FOUNDATION_STEP_TICKS,
                                    ),
                                  );
                                const visibleStart =
                                  Math.max(
                                    start,
                                    pageStart,
                                  );
                                const visibleEnd =
                                  Math.min(
                                    start +
                                      duration,
                                    pageEnd,
                                  );
                                const left =
                                  ((visibleStart -
                                    pageStart) /
                                    visibleSteps) *
                                  100;
                                const width =
                                  ((visibleEnd -
                                    visibleStart) /
                                    visibleSteps) *
                                  100;
                                const selected =
                                  selectedMelodicNote?.laneId ===
                                    selectedMelodicDefinition.id &&
                                  selectedMelodicNote.stepIndex ===
                                    start;
                                const isRootBlock =
                                  (event.pitchMidi ??
                                    selectedMelodicDefinition.defaultPitchMidi) ===
                                  pitch;

                                return (
                                  <button
                                    type="button"
                                    key={
                                      event.id +
                                      "-" +
                                      pitch
                                    }
                                    className={[
                                      "playground-piano-note",
                                      selected
                                        ? "is-selected"
                                        : "",
                                      isRootBlock
                                        ? "is-root-note"
                                        : "",
                                    ]
                                      .filter(Boolean)
                                      .join(" ")}
                                    style={{
                                      left:
                                        left +
                                        "%",
                                      width:
                                        width +
                                        "%",
                                    }}
                                    onClick={(
                                      eventClick,
                                    ) => {
                                      eventClick.stopPropagation();
                                      setSelectedMelodicNote({
                                        laneId:
                                          selectedMelodicDefinition.id,
                                        stepIndex:
                                          start,
                                      });
                                      setMelodicDurationSteps(
                                        duration,
                                      );
                                      setMelodicPitchCursor(
                                        (current) => ({
                                          ...current,
                                          [selectedMelodicDefinition.track]:
                                            event.pitchMidi ??
                                            pitch,
                                        }),
                                      );
                                      auditionMelodic(
                                        selectedMelodicDefinition,
                                        melodicEventPitches(
                                          selectedMelodicDefinition,
                                          event,
                                        ),
                                        duration,
                                        event.velocity,
                                      );
                                    }}
                                    aria-label={
                                      selectedMelodicDefinition.name +
                                      " note " +
                                      midiNoteLabel(
                                        pitch,
                                      ) +
                                      " step " +
                                      (start +
                                        1) +
                                      ", length " +
                                      melodicDurationLabel(
                                        duration,
                                      )
                                    }
                                  >
                                    {isRootBlock ? (
                                      <span>
                                        {midiNoteLabel(
                                          event.pitchMidi ??
                                            pitch,
                                        )}
                                      </span>
                                    ) : null}
                                    {isRootBlock ? (
                                      <i
                                        className="playground-piano-note__resize"
                                        onPointerDown={(
                                          resizeEvent,
                                        ) =>
                                          beginMelodicResize(
                                            resizeEvent,
                                            selectedMelodicDefinition.id,
                                            start,
                                          )
                                        }
                                        onPointerMove={
                                          moveMelodicResize
                                        }
                                        onPointerUp={(
                                          resizeEvent,
                                        ) =>
                                          finishMelodicResize(
                                            resizeEvent.pointerId,
                                          )
                                        }
                                        onPointerCancel={(
                                          resizeEvent,
                                        ) =>
                                          finishMelodicResize(
                                            resizeEvent.pointerId,
                                          )
                                        }
                                        aria-hidden="true"
                                      />
                                    ) : null}
                                  </button>
                                );
                              },
                            )}
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>
              </section>
            ) : null}

            <div
              className={
                !editRecordingLocked
                  ? "playground-lane-toolbar"
                  : "playground-lane-toolbar is-recording-locked"
              }
              aria-label="Selected lane quick actions"
            >
              <span>Transform</span>
              <button
                type="button"
                onClick={remixSelectedLane}
                aria-label="Remix selected lane only"
                title="Remix only this instrument"
              >
                ✦
              </button>
              <button
                type="button"
                onClick={() => editSelectedLane("shiftLeft")}
                aria-label="Rotate lane one step left"
                title="Rotate one step left"
              >
                ↶
              </button>
              <button
                type="button"
                onClick={() => editSelectedLane("shiftRight")}
                aria-label="Rotate lane one step right"
                title="Rotate one step right"
              >
                ↷
              </button>
              <button
                type="button"
                onClick={() => editSelectedLane("reverse")}
                aria-label="Reverse selected lane"
                title="Reverse rhythm"
              >
                Rev
              </button>
              <button
                type="button"
                onClick={() => editSelectedLane("densityHalf")}
                aria-label="Halve selected lane density"
                title="Keep roughly half the hits"
              >
                ½D
              </button>
              <button
                type="button"
                onClick={() => editSelectedLane("densityDouble")}
                aria-label="Double selected lane density"
                title="Add hits to roughly double density"
              >
                ×2D
              </button>
              <button
                type="button"
                onClick={() => editSelectedLane("copy")}
                aria-label="Copy selected lane rhythm"
                title="Copy lane"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={() => editSelectedLane("paste")}
                disabled={!laneClipboardLabel}
                aria-label={
                  laneClipboardLabel
                    ? "Paste copied " +
                      laneClipboardLabel +
                      " rhythm into selected lane"
                    : "Paste lane rhythm"
                }
                title={
                  laneClipboardLabel
                    ? "Paste " + laneClipboardLabel
                    : "Copy a lane first"
                }
              >
                Paste
              </button>
              <i aria-hidden="true" />
              <span>Fill</span>
              <button
                type="button"
                onClick={() => editSelectedLane("fillHalf")}
                aria-label="Fill lane with half notes"
                title="Fill half notes"
              >
                ½
              </button>
              <button
                type="button"
                onClick={() => editSelectedLane("fillQuarter")}
                aria-label="Fill lane with quarter notes"
                title="Fill quarter notes"
              >
                ¼
              </button>
              <button
                type="button"
                onClick={() => editSelectedLane("fillEighth")}
                aria-label="Fill lane with eighth notes"
                title="Fill eighth notes"
              >
                ⅛
              </button>
              <button
                type="button"
                onClick={() => editSelectedLane("fillSixteenth")}
                aria-label="Fill lane with sixteenth notes"
                title="Fill sixteenth notes"
              >
                1/16
              </button>
              <i aria-hidden="true" />
              <button
                type="button"
                className={
                  momentaryMonitor === "mute"
                    ? "playground-lane-toolbar__monitor is-active"
                    : "playground-lane-toolbar__monitor"
                }
                onPointerDown={(event) =>
                  beginMomentaryMonitor(event, "mute")
                }
                onPointerUp={endMomentaryMonitor}
                onPointerCancel={endMomentaryMonitor}
                aria-label="Hold to momentarily mute selected lane"
                title="Hold to mute"
              >
                Hold M
              </button>
              <button
                type="button"
                className={
                  momentaryMonitor === "solo"
                    ? "playground-lane-toolbar__monitor is-active"
                    : "playground-lane-toolbar__monitor"
                }
                onPointerDown={(event) =>
                  beginMomentaryMonitor(event, "solo")
                }
                onPointerUp={endMomentaryMonitor}
                onPointerCancel={endMomentaryMonitor}
                aria-label="Hold to momentarily solo selected lane"
                title="Hold to solo"
              >
                Hold S
              </button>
              <button
                type="button"
                className={
                  selectedLane?.lock.sound
                    ? "playground-lane-toolbar__lock is-active"
                    : "playground-lane-toolbar__lock"
                }
                onClick={() =>
                  sequencerStore.toggleLaneSoundLock(
                    selectedDefinition.id,
                  )
                }
                aria-pressed={Boolean(selectedLane?.lock.sound)}
                aria-label={
                  selectedLane?.lock.sound
                    ? "Unlock selected sound"
                    : "Lock selected sound"
                }
                title="Protect this sound from generated kit changes"
              >
                {selectedLane?.lock.sound ? "Sound locked" : "Lock sound"}
              </button>
              <button
                type="button"
                className="playground-lane-toolbar__clear"
                onClick={() => editSelectedLane("clear")}
                aria-label="Clear selected lane"
              >
                Clear
              </button>
            </div>



            {soundPickerVoice === selectedVoice ? (
              <section
                className="playground-sound-drawer"
                role="region"
                aria-label={
                  displayLaneName(selectedDefinition) +
                  " sounds"
                }
              >
                <header className="playground-sound-drawer__header">
                  <div>
                    <span
                      className="playground-sound-drawer__dot"
                      aria-hidden="true"
                    />
                    <div>
                      <small>
                        {displayLaneName(
                          selectedDefinition,
                        )}
                      </small>
                      <strong>Choose a sound</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setSoundPickerVoice(null)
                    }
                    aria-label="Close sound choices"
                  >
                    ×
                  </button>
                </header>

                {favoriteSoundIndices.length > 0 ||
                recentSoundIndices.length > 0 ? (
                  <div className="playground-sound-shortcuts">
                    {favoriteSoundIndices.length > 0 ? (
                      <div>
                        <span>Favorites</span>
                        <div>
                          {favoriteSoundIndices.map((index) => {
                            const preset =
                              SOUND_PRESETS[selectedVoice][index];
                            if (!preset) return null;
                            return (
                              <button
                                type="button"
                                key={"fav-" + index}
                                onClick={() =>
                                  void chooseSound(
                                    selectedVoice,
                                    index,
                                  )
                                }
                              >
                                ★ {preset.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {recentSoundIndices.length > 0 ? (
                      <div>
                        <span>Recent</span>
                        <div>
                          {recentSoundIndices.map((index) => {
                            const preset =
                              SOUND_PRESETS[selectedVoice][index];
                            if (!preset) return null;
                            return (
                              <button
                                type="button"
                                key={"recent-" + index}
                                onClick={() =>
                                  void chooseSound(
                                    selectedVoice,
                                    index,
                                  )
                                }
                              >
                                {preset.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="playground-sound-choices">
                  {SOUND_PRESETS[selectedVoice].map(
                    (preset, index) => {
                      const active =
                        soundIndex[selectedVoice] === index;
                      const favorite =
                        favoriteSoundIndices.includes(index);

                      return (
                        <div
                          key={preset.label}
                          className={
                            active
                              ? "playground-sound-choice is-active"
                              : "playground-sound-choice"
                          }
                        >
                          <button
                            type="button"
                            className="playground-sound-choice__main"
                            aria-pressed={active}
                            onClick={() =>
                              void chooseSound(
                                selectedVoice,
                                index,
                              )
                            }
                            disabled={Boolean(soundLoading)}
                            aria-busy={
                              preset.bundledSampleId ===
                              soundLoading
                                ? true
                                : undefined
                            }
                            aria-label={
                              preset.label +
                              " " +
                              displayLaneName(
                                selectedDefinition,
                              ) +
                              " sound"
                            }
                          >
                            <span aria-hidden="true" />
                            {preset.bundledSampleId ===
                            soundLoading
                              ? "Loading…"
                              : preset.label}
                            <small
                              style={{
                                color:
                                  "var(--pg-muted)",
                                fontSize: ".45rem",
                                fontWeight: 850,
                                letterSpacing: ".05em",
                              }}
                            >
                              {soundPresetSourceLabel(
                                preset,
                              )}
                            </small>
                          </button>
                          <button
                            type="button"
                            className={
                              favorite
                                ? "playground-sound-choice__star is-active"
                                : "playground-sound-choice__star"
                            }
                            onClick={() =>
                              toggleFavoriteSound(
                                selectedVoice,
                                index,
                              )
                            }
                            aria-pressed={favorite}
                            aria-label={
                              favorite
                                ? "Remove " +
                                  preset.label +
                                  " from favorite sounds"
                                : "Favorite " +
                                  preset.label +
                                  " sound"
                            }
                            data-tip={
                              favorite
                                ? "Remove favorite"
                                : "Favorite sound"
                            }
                          >
                            ★
                          </button>
                        </div>
                      );
                    },
                  )}
                </div>
              </section>
            ) : null}
          </section>
        ) : null}
      </div>

      <section
        className="playground-song"
        style={SONG_PANEL_STYLE}
        aria-label="Song arrangement"
      >
        <header
          className="playground-song__header"
          style={SONG_HEADER_STYLE}
        >
          <div
            style={{
              display: "grid",
              gap: 2,
              marginRight: "auto",
            }}
          >
            <span
              style={{
                color: "var(--pg-muted)",
                fontSize: ".48rem",
                fontWeight: 900,
                letterSpacing: ".09em",
              }}
            >
              SONG
            </span>
            <strong>
              {arrangement.blueprint
                ? arrangement.blueprint.name
                : "Turn A/B into a song"}
            </strong>
            <small
              style={{
                color: "var(--pg-muted)",
                fontSize: ".54rem",
              }}
            >
              {arrangement.blueprint
                ? Math.max(
                    1,
                    Math.round(songTotalBars * 10) /
                      10,
                  ) + " bars"
                : "Arrange sections without leaving Playground"}
            </small>
          </div>

          {!arrangement.blueprint ? (
            <button
              type="button"
              className="playground-song__build"
              style={SONG_BUTTON_STYLE}
              onClick={buildPlaygroundSong}
              disabled={editRecordingLocked}
              aria-label="Build song from Pattern A and B"
            >
              Build A/B Song
            </button>
          ) : (
            <div
              className="playground-song__transport"
              style={{ display: "flex", gap: 5 }}
            >
              <button
                type="button"
                onClick={() => void playSong(false)}
                disabled={
                  editRecordingLocked ||
                  arrangement.occurrences.length === 0
                }
                style={SONG_BUTTON_STYLE}
                aria-label="Play full song"
              >
                ▶ Song
              </button>
              <button
                type="button"
                onClick={() => void playSong(true)}
                disabled={
                  editRecordingLocked ||
                  !selectedSongSection
                }
                style={SONG_BUTTON_STYLE}
                aria-label="Play selected song section"
              >
                ▶ Section
              </button>
              <button
                type="button"
                onClick={() =>
                  void arrangementPlaybackStore.toggle()
                }
                disabled={
                  !arrangementPlayback.engaged
                }
                style={SONG_BUTTON_STYLE}
                aria-label={
                  arrangementPlayback.transportStatus ===
                  "running"
                    ? "Pause song playback"
                    : "Resume song playback"
                }
              >
                {arrangementPlayback.transportStatus ===
                "running"
                  ? "Ⅱ"
                  : "▶"}
              </button>
              <button
                type="button"
                onClick={() =>
                  arrangementPlaybackStore.stop()
                }
                disabled={
                  !arrangementPlayback.engaged
                }
                style={SONG_BUTTON_STYLE}
                aria-label="Stop song playback"
              >
                ■
              </button>
            </div>
          )}

          {arrangement.blueprint &&
          playgroundSong ? (
            <div
              className="playground-song__add"
              style={{ display: "flex", gap: 5 }}
            >
              <button
                type="button"
                onClick={() =>
                  addSongSection("A")
                }
                disabled={editRecordingLocked}
                style={SONG_BUTTON_STYLE}
                aria-label="Add Pattern A song section"
              >
                ＋ A
              </button>
              <button
                type="button"
                onClick={() =>
                  addSongSection("B")
                }
                disabled={editRecordingLocked}
                style={SONG_BUTTON_STYLE}
                aria-label="Add Pattern B song section"
              >
                ＋ B
              </button>
            </div>
          ) : null}
        </header>

        {arrangement.blueprint ? (
          <>
            <div
              className="playground-song__timeline"
              style={SONG_TIMELINE_STYLE}
            >
              {arrangementPlayback.engaged ? (
                <i
                  className="playground-song__playhead"
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    zIndex: 5,
                    top: 2,
                    bottom: 2,
                    width: 2,
                    borderRadius: 2,
                    background: "#fff",
                    boxShadow:
                      "0 0 10px rgba(255,255,255,.55)",
                    pointerEvents: "none",
                    left:
                      songProgress * 100 +
                      "%",
                  }}
                />
              ) : null}

              {arrangement.blueprint.sections.map(
                (section, index) => {
                  const sectionBank =
                    playgroundSong
                      ? playgroundSongBankForPatternId(
                          section
                            .patternSequence[0],
                        )
                      : undefined;
                  const selected =
                    section.id ===
                    arrangement.selectedSectionId;
                  const active =
                    arrangementPlayback.engaged &&
                    arrangementPlayback.currentSectionId ===
                      section.id;
                  const queued =
                    arrangementPlayback.engaged &&
                    arrangementPlayback.queuedSectionId ===
                      section.id;

                  return (
                    <button
                      type="button"
                      key={section.id}
                      className={[
                        "playground-song-section",
                        selected
                          ? "is-selected"
                          : "",
                        active
                          ? "is-playing"
                          : "",
                        queued
                          ? "is-queued"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={{
                        flexGrow: Math.max(
                          1,
                          section.lengthTicks,
                        ),
                        flexBasis: 120,
                        minWidth: 110,
                        minHeight: 64,
                        display: "grid",
                        alignContent: "center",
                        gap: 2,
                        padding: "7px 10px",
                        border:
                          "1px solid " +
                          (active
                            ? "rgba(99,222,244,.75)"
                            : queued
                              ? "rgba(255,216,74,.72)"
                              : selected
                                ? "rgba(165,139,255,.65)"
                                : "rgba(255,255,255,.08)"),
                        borderRadius: 11,
                        background: active
                          ? "rgba(99,222,244,.11)"
                          : queued
                            ? "rgba(255,216,74,.10)"
                            : selected
                              ? "rgba(165,139,255,.10)"
                              : "rgba(255,255,255,.035)",
                        boxShadow: queued
                          ? "inset 0 -2px 0 rgba(255,216,74,.75)"
                          : "none",
                        color: "var(--pg-text)",
                        textAlign: "left",
                        cursor: editRecordingLocked
                          ? "default"
                          : "pointer",
                      }}
                      draggable={
                        !editRecordingLocked
                      }
                      onDragStart={(event) => {
                        setSongDraggingSectionId(
                          section.id,
                        );
                        event.dataTransfer.effectAllowed =
                          "move";
                      }}
                      onDragOver={(event) => {
                        if (
                          songDraggingSectionId &&
                          songDraggingSectionId !==
                            section.id
                        ) {
                          event.preventDefault();
                          event.dataTransfer.dropEffect =
                            "move";
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (
                          songDraggingSectionId &&
                          songDraggingSectionId !==
                            section.id
                        ) {
                          arrangementStore.moveSectionTo(
                            songDraggingSectionId,
                            section.id,
                          );
                        }
                        setSongDraggingSectionId(
                          null,
                        );
                      }}
                      onDragEnd={() =>
                        setSongDraggingSectionId(
                          null,
                        )
                      }
                      onClick={() =>
                        selectOrQueueSongSection(
                          section.id,
                        )
                      }
                      aria-pressed={selected}
                      aria-label={
                        section.label +
                        ", section " +
                        (index + 1) +
                        " of " +
                        arrangement.blueprint!
                          .sections.length +
                        ", " +
                        (sectionBank
                          ? "Pattern " +
                            sectionBank
                          : section.role) +
                        ", " +
                        songRoleLabel(
                          section.role,
                        ) +
                        ", " +
                        section.cycleCount +
                        " repeats" +
                        (active
                          ? ", playing"
                          : queued
                            ? ", queued for next bar"
                            : "")
                      }
                    >
                      <span>
                        {active
                          ? "▶"
                          : queued
                            ? "Q"
                            : String(index + 1).padStart(
                                2,
                                "0",
                              )}
                      </span>
                      <strong>
                        {songRoleLabel(
                          section.role,
                        ).toUpperCase()}
                        {sectionBank
                          ? " · " + sectionBank
                          : ""}
                      </strong>
                      <small>
                        {section.cycleCount}× ·{" "}
                        {Math.max(
                          1,
                          Math.round(
                            (section.lengthTicks /
                              Math.max(
                                1,
                                songBarTicks,
                              )) *
                              10,
                          ) / 10,
                        )}{" "}
                        bars
                      </small>
                    </button>
                  );
                },
              )}
            </div>

            {selectedSongSection ? (
              <div
                className="playground-song__editor"
                style={SONG_EDITOR_STYLE}
                aria-label="Selected song section controls"
              >
                <strong>
                  {selectedSongSection.label}
                </strong>

                <label
                  className="playground-song__role"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    minHeight: 44,
                    padding: "0 8px",
                    border: "1px solid rgba(255,255,255,.08)",
                    borderRadius: 9,
                    background: "rgba(255,255,255,.035)",
                  }}
                >
                  <span
                    style={{
                      color: "var(--pg-muted)",
                      fontSize: ".52rem",
                      fontWeight: 850,
                    }}
                  >
                    Role
                  </span>
                  <select
                    aria-label="Song section role"
                    value={
                      selectedSongSection.role
                    }
                    disabled={
                      editRecordingLocked
                    }
                    onChange={(event) =>
                      setSongSectionRole(
                        event.currentTarget
                          .value as SceneRole,
                      )
                    }
                    style={{
                      border: 0,
                      background: "transparent",
                      color: "var(--pg-text)",
                      font: "inherit",
                      fontSize: ".58rem",
                      fontWeight: 800,
                    }}
                  >
                    {SONG_ROLE_OPTIONS.map(
                      (option) => (
                        <option
                          key={option.id}
                          value={option.id}
                        >
                          {option.label}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                {playgroundSong ? (
                  <div
                    className="playground-song__banks"
                    style={{ display: "flex", alignItems: "center", gap: 4 }}
                    aria-label="Section pattern"
                  >
                    {(["A", "B"] as const).map(
                      (bank) => (
                        <button
                          type="button"
                          key={bank}
                          className={
                            selectedSongBank ===
                            bank
                              ? "is-active"
                              : ""
                          }
                          onClick={() =>
                            setSongSectionBank(
                              bank,
                            )
                          }
                          disabled={
                            editRecordingLocked
                          }
                          style={{
                            ...SONG_BUTTON_STYLE,
                            minWidth: 38,
                            borderColor:
                              selectedSongBank === bank
                                ? "#a58bff"
                                : "rgba(255,255,255,.08)",
                          }}
                          aria-pressed={
                            selectedSongBank ===
                            bank
                          }
                          aria-label={
                            "Use Pattern " +
                            bank +
                            " in selected section"
                          }
                        >
                          {bank}
                        </button>
                      ),
                    )}
                  </div>
                ) : null}

                <div className="playground-song__cycles"
                    style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button
                    type="button"
                    onClick={() =>
                      changeSongSectionCycles(-1)
                    }
                    disabled={
                      editRecordingLocked ||
                      selectedSongSection.cycleCount <=
                        1
                    }
                    style={SONG_BUTTON_STYLE}
                    aria-label="Decrease section repeats"
                  >
                    −
                  </button>
                  <span>
                    {selectedSongSection.cycleCount}×
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      changeSongSectionCycles(1)
                    }
                    disabled={
                      editRecordingLocked ||
                      selectedSongSection.cycleCount >=
                        16
                    }
                    style={SONG_BUTTON_STYLE}
                    aria-label="Increase section repeats"
                  >
                    ＋
                  </button>
                </div>

                <div className="playground-song__moves"
                    style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button
                    type="button"
                    onClick={() =>
                      moveSongSection(-1)
                    }
                    disabled={
                      editRecordingLocked ||
                      arrangement.blueprint.sections[0]
                        ?.id ===
                        selectedSongSection.id
                    }
                    style={SONG_BUTTON_STYLE}
                    aria-label="Move song section left"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      moveSongSection(1)
                    }
                    disabled={
                      editRecordingLocked ||
                      arrangement.blueprint.sections.at(
                        -1,
                      )?.id ===
                        selectedSongSection.id
                    }
                    style={SONG_BUTTON_STYLE}
                    aria-label="Move song section right"
                  >
                    →
                  </button>
                  <button
                    type="button"
                    onClick={
                      duplicateSongSection
                    }
                    disabled={editRecordingLocked}
                    style={SONG_BUTTON_STYLE}
                    aria-label="Duplicate selected song section"
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={removeSongSection}
                    disabled={
                      editRecordingLocked ||
                      arrangement.blueprint.sections
                        .length <= 1
                    }
                    style={SONG_BUTTON_STYLE}
                    aria-label="Delete selected song section"
                  >
                    Delete
                  </button>
                </div>

                <div className="playground-song__history"
                    style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button
                    type="button"
                    onClick={() =>
                      arrangementStore.undo()
                    }
                    disabled={
                      editRecordingLocked ||
                      !arrangement.canUndo
                    }
                    style={SONG_BUTTON_STYLE}
                    aria-label="Undo song arrangement edit"
                  >
                    ↶
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      arrangementStore.redo()
                    }
                    disabled={
                      editRecordingLocked ||
                      !arrangement.canRedo
                    }
                    style={SONG_BUTTON_STYLE}
                    aria-label="Redo song arrangement edit"
                  >
                    ↷
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {stepContext ? (
        <>
          <button
            type="button"
            className="playground-context-dismiss"
            onClick={() => setStepContext(null)}
            aria-label="Close step actions"
          />
          <div
            className="playground-step-context"
            role="menu"
            tabIndex={-1}
            onKeyDown={(event) => {
              if (
                event.key !== "ArrowDown" &&
                event.key !== "ArrowUp" &&
                event.key !== "Home" &&
                event.key !== "End"
              ) {
                return;
              }

              const items = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "[role='menuitem']",
                ),
              );
              if (items.length === 0) return;
              const current = items.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? items.length - 1
                    : event.key === "ArrowDown"
                      ? (current + 1 + items.length) % items.length
                      : (current - 1 + items.length) % items.length;

              event.preventDefault();
              items[next]?.focus();
            }}
            aria-label={
              "Step " +
              (stepContext.stepIndex + 1) +
              " actions"
            }
            style={{
              left: stepContext.x,
              top: stepContext.y,
            }}
          >
            <header>
              <span>
                Step {stepContext.stepIndex + 1}
              </span>
              <strong>
                {sequencerStore.getStepVelocity(
                  stepContext.laneId,
                  stepContext.stepIndex,
                ) === undefined
                  ? "Empty"
                  : "Hit"}
              </strong>
            </header>
            <button
              type="button"
              role="menuitem"
              autoFocus
              onClick={() =>
                applyStepContextAction("normal")
              }
            >
              <b>●</b>
              Normal hit
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() =>
                applyStepContextAction("accent")
              }
            >
              <b>!</b>
              Accent
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() =>
                applyStepContextAction("ghost")
              }
            >
              <b>○</b>
              Ghost
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() =>
                applyStepContextAction("toggle")
              }
            >
              <b>×</b>
              {sequencerStore.getStepVelocity(
                stepContext.laneId,
                stepContext.stepIndex,
              ) === undefined
                ? "Add hit"
                : "Clear step"}
            </button>
            {contextStepEvent ? (
              <>
                <div
                  className="playground-step-context__divider"
                  role="separator"
                />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() =>
                    applyStepContextVariation(
                      "chance",
                    )
                  }
                >
                  <b>?</b>
                  Chance{" "}
                  {Math.round(
                    (contextStepEvent.probability ??
                      1) * 100,
                  )}
                  %
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() =>
                    applyStepContextVariation(
                      "repeat",
                    )
                  }
                >
                  <b>↻</b>
                  Repeat ×
                  {Math.max(
                    1,
                    contextStepEvent.ratchetCount ??
                      1,
                  )}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() =>
                    applyStepContextVariation(
                      "flam",
                    )
                  }
                >
                  <b>≋</b>
                  Flam{" "}
                  {(contextStepEvent.flamOffsetUs ??
                    0) > 0
                    ? Math.round(
                        (contextStepEvent.flamOffsetUs ??
                          0) / 1000,
                      ) + "ms"
                    : "Off"}
                </button>
              </>
            ) : null}
          </div>
        </>
      ) : null}

      {helpOpen ? (
        <div
          className="playground-help-backdrop"
          onPointerDown={(event) => {
            if (event.currentTarget === event.target) {
              setHelpOpen(false);
            }
          }}
        >
          <section
            ref={helpDialogRef}
            className="playground-help"
            role="dialog"
            tabIndex={-1}
            aria-modal="true"
            aria-label="Playground help and shortcuts"
          >
            <header>
              <div>
                <small>PLAYGROUND HELP</small>
                <strong>Fast ways to make a beat</strong>
              </div>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                aria-label="Close help"
              >
                ×
              </button>
            </header>

            <div className="playground-help__grid">
              <div>
                <h3>Play</h3>
                <p><kbd>Space</kbd> Play / pause</p>
                <p><kbd>R</kbd> Restart · <kbd>Shift</kbd>+<kbd>R</kbd> Record</p>
                <p><kbd>Shift</kbd>+<kbd>Space</kbd> Restart</p>
                <p><kbd>A S D F J K L ;</kbd> Play pads</p>
              </div>
              <div>
                <h3>Draw</h3>
                <p>Click / drag empty steps to add hits.</p>
                <p><kbd>Shift</kbd>-click selects notes · <kbd>Ctrl/Cmd</kbd>-drag selects regions.</p>
                <p><kbd>V</kbd> toggles Select mode · drag an active hit vertically for velocity.</p>
                <p><kbd>Shift</kbd>-drag Accent · <kbd>Alt</kbd>-drag Ghost</p>
              </div>
              <div>
                <h3>Touch</h3>
                <p>Swipe the step grid to change pages.</p>
                <p>Select mode lets you drag-select notes across tracks.</p>
                <p>Long-press a pad for its sound picker.</p>
                <p>Long-press a step for quick step actions.</p>
              </div>
              <div>
                <h3>Experiment</h3>
                <p>Remix is reversible and keeps recent versions.</p>
                <p>A/B patterns let you compare two directions.</p>
                <p>Right-click or long-press a hit for Normal / Accent / Ghost plus Chance, Repeat and Flam.</p>
              </div>
            </div>

            <footer>
              <span>
                Most actions are undoable. Advanced controls stay in Studio.
              </span>
              <button
                type="button"
                onClick={() => {
                  dismissFirstUseHint();
                  setHelpOpen(false);
                }}
              >
                Got it
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      <nav
        className="playground-mobile-dock"
        aria-label="Mobile beat controls"
      >
        <button
          type="button"
          className={
            playing || countInBeat !== null
              ? "is-active"
              : ""
          }
          onClick={() => {
            pulseHaptic(7);
            togglePlaybackFlow();
          }}
          aria-label={
            countInBeat !== null
              ? "Cancel count-in"
              : playing
                ? "Pause beat"
                : "Play beat"
          }
        >
          <b aria-hidden="true">
            {countInBeat !== null
              ? countInBeat
              : playing
                ? "Ⅱ"
                : "▶"}
          </b>
          <span>
            {countInBeat !== null
              ? "Count"
              : playing
                ? "Pause"
                : "Play"}
          </span>
        </button>

        <button
          type="button"
          onClick={remix}
          aria-label="Remix beat"
        >
          <b aria-hidden="true">✦</b>
          <span>Remix</span>
        </button>

        <button
          type="button"
          onClick={() => {
            pulseHaptic(5);
            undoPattern();
          }}
          disabled={
            !sequencer.canUndo ||
            editRecordingLocked
          }
          aria-label="Undo"
        >
          <b aria-hidden="true">↶</b>
          <span>Undo</span>
        </button>

        <button
          type="button"
          className={
            soundPickerVoice === selectedVoice
              ? "is-active"
              : ""
          }
          onClick={toggleSelectedSoundPicker}
          aria-label={
            "Change " +
            displayLaneName(selectedDefinition) +
            " sound"
          }
        >
          <b aria-hidden="true">◉</b>
          <span>Sound</span>
        </button>

        <button
          type="button"
          className={
            touchEditMode === "draw"
              ? ""
              : "is-active"
          }
          onClick={cycleTouchEditMode}
          aria-label={
            "Touch edit mode: " + touchEditMode
          }
          title="Cycle Draw, Select, Accent, and Ghost touch modes"
        >
          <b aria-hidden="true">
            {touchEditMode === "draw"
              ? "✎"
              : touchEditMode === "select"
                ? "□"
                : touchEditMode === "accent"
                  ? "!"
                  : "○"}
          </b>
          <span>
            {touchEditMode === "draw"
              ? "Draw"
              : touchEditMode === "select"
                ? "Select"
                : touchEditMode === "accent"
                  ? "Accent"
                  : "Ghost"}
          </span>
        </button>

        <button
          type="button"
          className={
            padRepeatDivision > 0 ? "is-active" : ""
          }
          onClick={cyclePadRepeatDivision}
          aria-label={
            "Pad hold repeat " + repeatLabel
          }
        >
          <b aria-hidden="true">↻</b>
          <span>
            {padRepeatDivision > 0
              ? repeatLabel
              : "Repeat"}
          </span>
        </button>

        <button
          type="button"
          className={hapticsEnabled ? "is-active" : ""}
          onClick={toggleHaptics}
          disabled={!hapticsSupported}
          aria-pressed={hapticsEnabled}
          aria-label={
            hapticsSupported
              ? hapticsEnabled
                ? "Disable haptics"
                : "Enable haptics"
              : "Haptics unavailable"
          }
        >
          <b aria-hidden="true">≈</b>
          <span>Haptic</span>
        </button>
      </nav>

      <footer className="playground-footer">
        <p className="playground-hint">
          Tap pad · long-press = sounds when Repeat is off · Hold Repeat = tempo-synced pad rolls · Space = play · R = restart · Shift+R = record
        </p>
        <output className="playground-notice" aria-live="polite">
          {notice}
        </output>
      </footer>
    </section>
  );
}
