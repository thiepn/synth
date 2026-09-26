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
import {
  DRUM_DEFAULT_SPECS,
  drumSoundStore,
} from "../../audio/drumSoundModel";
import { useTransportSnapshot } from "../../audio/useTransport";
import { useDrumSoundSnapshot } from "../../audio/useDrumSounds";
import { useSampleAssetSnapshot } from "../../audio/useSampleAssets";
import {
  applyBundledSample,
  bundledSampleById,
  type BundledSampleId,
} from "../../audio/bundledSampleLibrary";
import type { DrumMaterialSpec } from "../../domain/contracts";
import {
  BEAT_STYLES,
  generateBeat,
  type BeatGenerationIntent,
  type BeatStyleId,
} from "../../generation/beatGenerator";
import { rerollBeat } from "../../generation/beatVariation";
import {
  generationHistoryStore,
  type PatternBankId,
} from "../../history/GenerationHistoryStore";
import { useGenerationHistorySnapshot } from "../../history/useGenerationHistory";
import { eventTargetConsumesKeyboard } from "../../input/domInputGuards";
import {
  DRUM_PADS,
  SEQUENCER_LANES,
  type DrumVoiceId,
  type SequencerLaneDefinition,
} from "../../music/foundationPattern";
import { playbackCoordinator } from "../../playback/PlaybackCoordinator";
import { useProjectSnapshot } from "../../project/useProject";
import {
  sequencerStore,
  type LaneClipboardData,
} from "../../sequencer/SequencerStore";
import { useSequencerSnapshot } from "../../sequencer/useSequencer";
import { getStyleDNA } from "../../style/styleDNA";

interface PlaygroundSurfaceProps {
  onOpenStudio: () => void;
}

interface SoundPreset {
  label: string;
  spec?: Partial<DrumMaterialSpec>;
  bundledSampleId?: BundledSampleId;
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

function synthPresetMatches(
  voice: DrumVoiceId,
  preset: SoundPreset,
  actual: DrumMaterialSpec,
): boolean {
  if (preset.bundledSampleId) return false;

  return MATERIAL_PARAMS.every((key) => {
    const expected =
      preset.spec?.[key] ??
      DRUM_DEFAULT_SPECS[voice][key];

    return Math.abs(expected - actual[key]) < 0.0001;
  });
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

type TouchEditMode = "draw" | "accent" | "ghost";
type PadRepeatDivision = 0 | 1 | 2 | 4;
type MomentaryMonitorMode = "mute" | "solo";

const HAPTICS_STORAGE_KEY = "synth.playground.haptics";

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

export function PlaygroundSurface({
  onOpenStudio,
}: PlaygroundSurfaceProps) {
  const sequencer = useSequencerSnapshot();
  const transport = useTransportSnapshot();
  const drumSounds = useDrumSoundSnapshot();
  const sampleAssets = useSampleAssetSnapshot();
  const history = useGenerationHistorySnapshot();
  const [style, setStyle] = useState<BeatStyleId>("funk");
  const [remixCounter, setRemixCounter] = useState(0);
  const [remixPulse, setRemixPulse] = useState(0);
  const [auditionStep, setAuditionStep] =
    useState<number | undefined>(undefined);
  const [soundIndex, setSoundIndex] =
    useState<Record<DrumVoiceId, number>>(INITIAL_SOUND_INDEX);
  const [notice, setNotice] = useState("Tap a pad. Draw a beat.");
  const [padPulse, setPadPulse] = useState({
    voice: null as DrumVoiceId | null,
    serial: 0,
  });
  const [selectedVoice, setSelectedVoice] =
    useState<DrumVoiceId>("kick");
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
    mode: "paint" | "pending" | "velocity" | "pageSwipe";
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
  const tapTimesRef = useRef<number[]>([]);
  const focusRef = useRef<HTMLElement | null>(null);
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
          ? "accent"
          : current === "accent"
            ? "ghost"
            : "draw";
      pulseHaptic(7);
      setNotice(
        next === "draw"
          ? "Touch mode · Draw"
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

  const startCountIn = async () => {
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
        void audioTransport.start();
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

  const togglePlaybackFlow = () => {
    if (countInBeat !== null) {
      cancelCountIn();
      setNotice("Count-in cancelled");
      return;
    }

    if (playing) {
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
    cancelPatternPreview();
    onOpenStudio();
  };

  const undoPattern = () => {
    if (!sequencerStore.getSnapshot().canUndo) return;
    cancelPatternPreview();
    sequencerStore.undo();
    setNotice("Undone");
  };

  const redoPattern = () => {
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
    const timer = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const closeTransientUi = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSoundPickerVoice(null);
    };

    window.addEventListener("keydown", closeTransientUi);
    return () =>
      window.removeEventListener(
        "keydown",
        closeTransientUi,
      );
  }, []);

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
          source.mode === "sample" &&
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
              (preset) =>
                preset.bundledSampleId ===
                bundledSampleId,
            );
          } else {
            const assetLabel =
              asset?.reference.name.replace(
                /\.wav$/i,
                "",
              );

            if (assetLabel) {
              resolved = presets.findIndex(
                (preset) =>
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
    const keyToVoice = new Map(
      DRUM_PADS.map((pad) => [
        pad.key.toLowerCase(),
        pad.voice,
      ]),
    );

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        eventTargetConsumesKeyboard(event.target)
      ) {
        return;
      }

      const voice = keyToVoice.get(event.key.toLowerCase());
      if (!voice) return;

      event.preventDefault();
      setSelectedVoice(voice);
      setSoundPickerVoice(null);
      setPadPulse((current) => ({
        voice,
        serial: current.serial + 1,
      }));
      void drumEngine.triggerNow(
        voice,
        event.shiftKey ? 1 : 0.88,
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
    if (playing) {
      stopVisualAudition();
      if (countInBeat !== null) {
        cancelCountIn();
      }
    }
  }, [playing, countInBeat]);

  useEffect(() => {
    const handleFlowShortcut = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        eventTargetConsumesKeyboard(event.target)
      ) {
        return;
      }

      if (event.code === "Space") {
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

      event.preventDefault();
      restartPlayback();
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
    playing,
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

  const pageSize = 16;
  const pageCount = Math.max(
    1,
    Math.ceil(sequencer.lengthSteps / pageSize),
  );
  const pageStart = stepPage * pageSize;
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

  useEffect(() => {
    setStepPage((current) =>
      Math.min(current, pageCount - 1),
    );
  }, [pageCount]);

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
  ) => {
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
    void drumEngine.triggerNow(voice, velocity);
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
      setSelectedVoice(voice);
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
          setPadPulse((current) => ({
            voice,
            serial: current.serial + 1,
          }));
          void drumEngine.triggerNow(voice, 0.82);
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
      setSelectedVoice(voice);
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
      if (voice) triggerVoice(voice, 0.8);
    }
  };

  const beginPaint = (
    event: ReactPointerEvent<HTMLButtonElement>,
    laneId: string,
    stepIndex: number,
  ) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const touchDynamic =
      event.pointerType !== "mouse" &&
      touchEditMode !== "draw"
        ? touchEditMode
        : undefined;
    const dynamic =
      event.altKey
        ? "ghost"
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
        dynamic
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
    const gesture = paintRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    if (gesture.mode === "pageSwipe") {
      return;
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
    const gesture = paintRef.current;
    if (!gesture || gesture.pointerId !== pointerId) return;

    if (!cancelled && gesture.mode === "pending") {
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

  const activateFromKeyboard = (
    laneId: string,
    stepIndex: number,
    dynamic?: "accent" | "ghost",
  ) => {
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
    if (nextBank === activePatternBank) return;

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
    const sourceNodeId = lastRemixSourceNodeId;
    if (!sourceNodeId) return;

    const restored =
      generationHistoryStore.restore(sourceNodeId);
    sequencerStore.restorePatternSnapshot(restored);
    setLastRemixSourceNodeId(null);
    setNotice("Remix undone");
  };

  const applyStyleBeat = (nextStyle: BeatStyleId) => {
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
      | "fillQuarter"
      | "fillEighth"
      | "fillSixteenth",
  ) => {
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
        action === "fillQuarter"
          ? 4
          : action === "fillEighth"
            ? 2
            : 1;
      changed = sequencerStore.fillLane(
        laneId,
        interval as 1 | 2 | 4,
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
                    : action === "fillQuarter"
                      ? "Quarter-note fill"
                      : action === "fillEighth"
                        ? "Eighth-note fill"
                        : "Sixteenth-note fill";
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
      triggerVoice(voice, 0.9);
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
            disabled={!sequencer.canUndo}
            aria-label="Undo"
            title="Undo · Ctrl/Cmd-Z"
          >
            ↶
          </button>
          <button
            type="button"
            className="playground-history-button"
            onClick={redoPattern}
            disabled={!sequencer.canRedo}
            aria-label="Redo"
            title="Redo · Ctrl/Cmd-Shift-Z"
          >
            ↷
          </button>
          <button
            type="button"
            className="playground-studio-button"
            onClick={openStudio}
            aria-label="Open Studio"
          >
            Studio
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </header>

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
          >
            <span aria-hidden="true">✦</span>
            Remix
          </button>
        </div>
      </div>

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
                    setSelectedVoice(voice);
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
                    setSelectedVoice(voice);
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
              displayLaneName(selectedDefinition) +
              " pattern editor"
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
                  <small>DRAW THE RHYTHM</small>
                  <strong>
                    {displayLaneName(selectedDefinition)}
                  </strong>
                </div>
              </div>

              <div className="playground-focus__tools">
                {pageCount > 1 ? (
                  <div
                    className="playground-page-control"
                    aria-label="Pattern page"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setFollowPlayhead(false);
                        setStepPage((page) =>
                          Math.max(0, page - 1),
                        );
                      }}
                      disabled={stepPage === 0}
                      aria-label="Previous 16 steps"
                    >
                      ‹
                    </button>
                    <span>
                      {stepPage + 1}/{pageCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setFollowPlayhead(false);
                        setStepPage((page) =>
                          Math.min(
                            pageCount - 1,
                            page + 1,
                          ),
                        );
                      }}
                      disabled={
                        stepPage === pageCount - 1
                      }
                      aria-label="Next 16 steps"
                    >
                      ›
                    </button>
                  </div>
                ) : null}

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
              className="playground-lane-toolbar"
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

            <div
              className="playground-steps playground-steps--focus"
              style={
                sequencer.lengthSteps < pageSize
                  ? {
                      gridTemplateColumns:
                        "repeat(" +
                        sequencer.lengthSteps +
                        ", minmax(24px, 1fr))",
                    }
                  : undefined
              }
              onPointerMove={continuePaint}
              onPointerUp={(event) =>
                finishPaint(event.pointerId)
              }
              onPointerCancel={(event) =>
                finishPaint(event.pointerId, true)
              }
            >
              {visualStep !== undefined &&
              visualStep >= pageStart &&
              visualStep <
                pageStart +
                  Math.min(
                    pageSize,
                    sequencer.lengthSteps - pageStart,
                  ) ? (
                <span
                  className="playground-playhead"
                  aria-hidden="true"
                  style={{
                    left:
                      ((visualStep - pageStart + 0.5) /
                        Math.min(
                          pageSize,
                          sequencer.lengthSteps - pageStart,
                        )) *
                        100 +
                      "%",
                  }}
                />
              ) : null}

              {Array.from(
                {
                  length: Math.min(
                    pageSize,
                    sequencer.lengthSteps - pageStart,
                  ),
                },
                (_, offset) => {
                  const stepIndex = pageStart + offset;
                  const velocity =
                    sequencerStore.getStepVelocity(
                      selectedDefinition.id,
                      stepIndex,
                    );
                  const on = velocity !== undefined;
                  const current =
                    visualStep === stepIndex;

                  return (
                    <button
                      type="button"
                      key={stepIndex}
                      className={[
                        "playground-step",
                        on ? "is-on" : "",
                        velocity !== undefined && velocity >= 0.85
                          ? "is-accent"
                          : "",
                        velocity !== undefined && velocity <= 0.3
                          ? "is-ghost"
                          : "",
                        current ? "is-current" : "",
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
                              : 0.56 + velocity * 0.44,
                          "--step-indicator-scale":
                            velocity === undefined
                              ? 0.72
                              : 0.62 + velocity * 0.38,
                        } as CSSProperties
                      }
                      data-play-step="true"
                      data-lane-id={
                        selectedDefinition.id
                      }
                      data-step-index={stepIndex}
                      aria-pressed={on}
                      aria-label={
                        displayLaneName(
                          selectedDefinition,
                        ) +
                        " step " +
                        (stepIndex + 1) +
                        (on
                          ? ", on, velocity " +
                            Math.round((velocity ?? 0) * 100) +
                            " percent. Drag vertically to change velocity"
                          : ", off")
                      }
                      onPointerDown={(event) =>
                        beginPaint(
                          event,
                          selectedDefinition.id,
                          stepIndex,
                        )
                      }
                      onClick={(event) => {
                        if (event.detail !== 0) return;
                        activateFromKeyboard(
                          selectedDefinition.id,
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
                    </button>
                  );
                },
              )}
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

                <div className="playground-sound-choices">
                  {SOUND_PRESETS[selectedVoice].map(
                    (preset, index) => (
                      <button
                        type="button"
                        key={preset.label}
                        className={
                          soundIndex[selectedVoice] ===
                          index
                            ? "is-active"
                            : ""
                        }
                        aria-pressed={
                          soundIndex[selectedVoice] ===
                          index
                        }
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
                      </button>
                    ),
                  )}
                </div>
              </section>
            ) : null}
          </section>
        ) : null}
      </div>

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
          disabled={!sequencer.canUndo}
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
          title="Cycle Draw, Accent, and Ghost touch modes"
        >
          <b aria-hidden="true">
            {touchEditMode === "draw"
              ? "✎"
              : touchEditMode === "accent"
                ? "!"
                : "○"}
          </b>
          <span>
            {touchEditMode === "draw"
              ? "Draw"
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
          Tap pad · long-press = sounds when Repeat is off · Hold Repeat = tempo-synced pad rolls · Space = play · Shift+Space/R = restart
        </p>
        <output className="playground-notice" aria-live="polite">
          {notice}
        </output>
      </footer>
    </section>
  );
}
