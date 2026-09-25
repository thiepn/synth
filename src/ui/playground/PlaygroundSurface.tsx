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
import {
  applyBundledSample,
  bundledSampleForVoice,
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
import { eventTargetConsumesKeyboard } from "../../input/domInputGuards";
import {
  DRUM_PADS,
  SEQUENCER_LANES,
  type DrumVoiceId,
  type SequencerLaneDefinition,
} from "../../music/foundationPattern";
import { playbackCoordinator } from "../../playback/PlaybackCoordinator";
import { sequencerStore } from "../../sequencer/SequencerStore";
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
    { label: "808 Classic", bundledSampleId: "tr808-kick" },
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
    { label: "808 Snare", bundledSampleId: "tr808-snare" },
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
    { label: "808 Open", bundledSampleId: "tr808-open-hat" },
  ],
  tom: [
    { label: "Core", spec: {} },
    { label: "Round", spec: { body: 0.96, impact: 0.58, tone: 0.42, decay: 0.64 } },
    { label: "Deep", spec: { pitch: 0.28, body: 0.92, decay: 0.72 } },
    { label: "Tight", spec: { impact: 0.82, decay: 0.28, body: 0.7 } },
    { label: "Big", spec: { body: 0.98, decay: 0.86, character: 0.58 } },
    { label: "High", spec: { pitch: 0.8, body: 0.72, impact: 0.7, decay: 0.42 } },
    { label: "Soft", spec: { impact: 0.42, body: 0.7, noise: 0.06, decay: 0.52 } },
    { label: "Tribal", spec: { impact: 0.68, body: 0.9, pitch: 0.52, character: 0.7 } },
    { label: "808 Tom", bundledSampleId: "tr808-tom" },
  ],
  percussion: [
    { label: "Core", spec: {} },
    { label: "Wood", spec: { body: 0.7, noise: 0.08, tone: 0.44, character: 0.34 } },
    { label: "Click", spec: { impact: 0.92, body: 0.28, decay: 0.18, pitch: 0.72 } },
    { label: "Warm", spec: { body: 0.74, tone: 0.38, character: 0.48 } },
    { label: "Odd", spec: { character: 0.98, pitch: 0.76, noise: 0.34 } },
    { label: "Metal", spec: { character: 0.94, air: 0.56, pitch: 0.72, noise: 0.3 } },
    { label: "Hollow", spec: { body: 0.82, tone: 0.3, decay: 0.5, pitch: 0.46 } },
    { label: "Sharp", spec: { impact: 0.94, decay: 0.18, pitch: 0.82, air: 0.46 } },
    { label: "808 Rim", bundledSampleId: "tr808-percussion" },
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
    { label: "808 Cymbal", bundledSampleId: "tr808-crash" },
  ],
};

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

export function PlaygroundSurface({
  onOpenStudio,
}: PlaygroundSurfaceProps) {
  const sequencer = useSequencerSnapshot();
  const transport = useTransportSnapshot();
  const [style, setStyle] = useState<BeatStyleId>("funk");
  const [remixCounter, setRemixCounter] = useState(0);
  const [soundIndex, setSoundIndex] =
    useState<Record<DrumVoiceId, number>>(INITIAL_SOUND_INDEX);
  const [notice, setNotice] = useState("Click a pad. Draw a beat.");
  const [padPulse, setPadPulse] = useState({
    voice: null as DrumVoiceId | null,
    serial: 0,
  });
  const [soundPickerVoice, setSoundPickerVoice] =
    useState<DrumVoiceId | null>(null);
  const [soundLoading, setSoundLoading] =
    useState<BundledSampleId | null>(null);
  const paintRef = useRef<{
    pointerId: number;
    desiredOn: boolean;
    lastKey: string;
  } | null>(null);

  useEffect(() => {
    const stopPaint = () => {
      paintRef.current = null;
    };
    window.addEventListener("pointerup", stopPaint);
    window.addEventListener("pointercancel", stopPaint);
    return () => {
      window.removeEventListener("pointerup", stopPaint);
      window.removeEventListener("pointercancel", stopPaint);
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

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
    if (!styleVector) return;

    const strongest = Object.entries(styleVector).sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0] as BeatStyleId | undefined;

    if (strongest && PLAY_STYLES.includes(strongest)) {
      setStyle(strongest);
    }
  }, [sequencer.pattern.provenance]);

  const activeStep =
    transport.status === "running"
      ? Math.floor(
          transport.position.absoluteTick /
            TRANSPORT_SCHEDULER_CONFIG.pulseTicks,
        ) % sequencer.lengthSteps
      : undefined;

  const playing = playbackCoordinator.isPlayingForMode(
    "create",
    transport,
  );

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

  const triggerVoice = (
    voice: DrumVoiceId,
    velocity = 0.88,
  ) => {
    setPadPulse((current) => ({
      voice,
      serial: current.serial + 1,
    }));
    void drumEngine.triggerNow(voice, velocity);
  };

  const setStep = (
    laneId: string,
    stepIndex: number,
    desiredOn: boolean,
    audition = false,
  ) => {
    const isOn =
      sequencerStore.getStepVelocity(laneId, stepIndex) !== undefined;
    if (isOn === desiredOn) return;

    sequencerStore.toggleStep(laneId, stepIndex);

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

    const desiredOn =
      sequencerStore.getStepVelocity(laneId, stepIndex) === undefined;
    const key = laneId + ":" + stepIndex;
    paintRef.current = {
      pointerId: event.pointerId,
      desiredOn,
      lastKey: key,
    };
    setStep(laneId, stepIndex, desiredOn, desiredOn);
    event.preventDefault();
  };

  const continuePaint = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const gesture = paintRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest("[data-play-step='true']") as HTMLButtonElement | null;
    if (!target) return;

    const laneId = target.dataset.laneId;
    const stepIndex = Number(target.dataset.stepIndex);
    if (!laneId || !Number.isInteger(stepIndex)) return;

    const key = laneId + ":" + stepIndex;
    if (gesture.lastKey === key) return;

    gesture.lastKey = key;
    setStep(laneId, stepIndex, gesture.desiredOn, false);
  };

  const activateFromKeyboard = (
    laneId: string,
    stepIndex: number,
  ) => {
    const desiredOn =
      sequencerStore.getStepVelocity(laneId, stepIndex) === undefined;
    setStep(laneId, stepIndex, desiredOn, desiredOn);
  };

  const applyStyleBeat = (nextStyle: BeatStyleId) => {
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

    sequencerStore.applyGeneratedPattern(generated.pattern);
    if (!playing) {
      void drumEngine.auditionPattern(
        generated.pattern,
        transport.bpm,
      );
    }
    setRemixCounter((value) => value + 1);
    setNotice(styleLabel(nextStyle) + " beat ready");
  };

  const remix = () => {
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

    sequencerStore.applyGeneratedPattern(result.pattern);
    if (!playing) {
      void drumEngine.auditionPattern(
        result.pattern,
        transport.bpm,
      );
    }
    setNotice("Remixed");
  };

  const chooseSound = async (
    voice: DrumVoiceId,
    nextIndex: number,
  ) => {
    const preset = SOUND_PRESETS[voice][nextIndex];
    if (!preset) return;

    try {
      if (preset.bundledSampleId) {
        await audioTransport.unlockAudio();
        const sample = bundledSampleForVoice(voice);
        if (
          !sample ||
          sample.id !== preset.bundledSampleId
        ) {
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
      setSoundPickerVoice(null);
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
              onClick={() => audioTransport.setBpm(transport.bpm - 2)}
              aria-label="Decrease tempo"
            >
              −
            </button>
            <span>
              <strong>{Math.round(transport.bpm)}</strong>
              <small>BPM</small>
            </span>
            <button
              type="button"
              onClick={() => audioTransport.setBpm(transport.bpm + 2)}
              aria-label="Increase tempo"
            >
              +
            </button>
          </div>
        </div>

        <button
          type="button"
          className="playground-studio-button"
          onClick={onOpenStudio}
          aria-label="Open Studio"
        >
          Studio
          <span aria-hidden="true">↗</span>
        </button>
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
            onClick={() =>
              void playbackCoordinator.toggleForMode("create")
            }
            aria-label={
              playing ? "Pause transport" : "Start transport"
            }
          >
            <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
            {playing ? "Pause" : "Play"}
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

      <div className="playground-beat" aria-label="Beat sequencer">
        {lanes.map(({ definition, lane }) => {
          if (!lane) return null;

          const voice = definition.voice;
          const color = LANE_COLORS[voice];
          const pad = DRUM_PADS.find(
            (entry) => entry.voice === voice,
          );
          const currentSound =
            SOUND_PRESETS[voice][soundIndex[voice]]?.label ?? "Core";
          const laneIsPlaying =
            activeStep !== undefined &&
            sequencerStore.getStepVelocity(
              definition.id,
              activeStep,
            ) !== undefined;

          return (
            <article
              key={definition.id}
              className={
                laneIsPlaying
                  ? "playground-lane is-playing"
                  : "playground-lane"
              }
              style={
                {
                  "--lane-color": color,
                } as CSSProperties
              }
            >
              <div className="playground-instrument">
                <button
                  type="button"
                  className="playground-pad"
                  onClick={() => triggerVoice(voice)}
                  aria-label={"Play " + displayLaneName(definition)}
                >
                  <span className="playground-pad__icon" aria-hidden="true">
                    {pad?.key ?? definition.code}
                  </span>
                  <strong>{displayLaneName(definition)}</strong>
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
                  className="playground-sound-cycle"
                  onClick={() => setSoundPickerVoice(voice)}
                  aria-label={
                    "Change " +
                    displayLaneName(definition) +
                    " sound. Current sound " +
                    currentSound
                  }
                  title="Choose a sound"
                >
                  <span>{currentSound}</span>
                  <b aria-hidden="true">›</b>
                </button>
              </div>

              <div
                className="playground-steps"
                onPointerMove={continuePaint}
                onPointerUp={() => {
                  paintRef.current = null;
                }}
                onPointerCancel={() => {
                  paintRef.current = null;
                }}
              >
                {Array.from(
                  { length: sequencer.lengthSteps },
                  (_, stepIndex) => {
                    const velocity = sequencerStore.getStepVelocity(
                      definition.id,
                      stepIndex,
                    );
                    const on = velocity !== undefined;
                    const current = activeStep === stepIndex;

                    return (
                      <button
                        type="button"
                        key={stepIndex}
                        className={[
                          "playground-step",
                          on ? "is-on" : "",
                          current ? "is-current" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={
                          {
                            "--step-strength":
                              velocity === undefined
                                ? 0
                                : Math.max(0.3, velocity),
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
                          (on ? ", on" : ", off")
                        }
                        onPointerDown={(event) =>
                          beginPaint(
                            event,
                            definition.id,
                            stepIndex,
                          )
                        }
                        onClick={(event) => {
                          if (event.detail !== 0) return;
                          activateFromKeyboard(
                            definition.id,
                            stepIndex,
                          );
                        }}
                      >
                        <span aria-hidden="true" />
                      </button>
                    );
                  },
                )}
              </div>
            </article>
          );
        })}
      </div>

      {soundPickerVoice ? (
        <section
          className="playground-sound-drawer"
          role="region"
          aria-label={
            (DRUM_PADS.find(
              (pad) => pad.voice === soundPickerVoice,
            )?.label ?? soundPickerVoice) + " sounds"
          }
          style={
            {
              "--lane-color":
                LANE_COLORS[soundPickerVoice],
            } as CSSProperties
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
                  {DRUM_PADS.find(
                    (pad) => pad.voice === soundPickerVoice,
                  )?.label ?? soundPickerVoice}
                </small>
                <strong>Choose a sound</strong>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSoundPickerVoice(null)}
              aria-label="Close sound choices"
            >
              ×
            </button>
          </header>

          <div className="playground-sound-choices">
            {SOUND_PRESETS[soundPickerVoice].map(
              (preset, index) => (
                <button
                  type="button"
                  key={preset.label}
                  className={
                    soundIndex[soundPickerVoice] === index
                      ? "is-active"
                      : ""
                  }
                  onClick={() =>
                    void chooseSound(soundPickerVoice, index)
                  }
                  disabled={Boolean(soundLoading)}
                  aria-busy={
                    preset.bundledSampleId === soundLoading
                      ? true
                      : undefined
                  }
                  aria-label={
                    preset.label +
                    " " +
                    (DRUM_PADS.find(
                      (pad) => pad.voice === soundPickerVoice,
                    )?.label ?? soundPickerVoice) +
                    " sound"
                  }
                >
                  <span aria-hidden="true" />
                  {preset.bundledSampleId === soundLoading
                    ? "Loading…"
                    : preset.label}
                </button>
              ),
            )}
          </div>
        </section>
      ) : null}

      <footer className="playground-footer">
        <p className="playground-hint">
          Click a pad to hear it · click or drag the beat to draw · space = play
        </p>
        <output className="playground-notice" aria-live="polite">
          {notice}
        </output>
      </footer>
    </section>
  );
}
