import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTransportSnapshot } from "../../audio/useTransport";
import { eventTargetConsumesKeyboard } from "../../input/domInputGuards";
import { arrangementPlaybackStore } from "../../arrange/ArrangementPlaybackStore";
import { arrangementStore } from "../../arrange/ArrangementStore";
import {
  useArrangementPlaybackSnapshot,
  useArrangementSnapshot,
} from "../../arrange/useArrangement";
import { useArrangementFoundationSnapshot } from "../../arrange/useArrangementFoundation";
import { chaosStore } from "../../chaos/ChaosStore";
import { useChaosSnapshot } from "../../chaos/useChaos";
import { useBeatFamilySnapshot } from "../../family/useBeatFamily";
import { beatMorphStore } from "../../morph/BeatMorphStore";
import { useBeatMorphSnapshot } from "../../morph/useBeatMorph";
import {
  performanceStore,
  type PerformanceMomentaryId,
} from "../../performance/PerformanceStore";
import { usePerformanceSnapshot } from "../../performance/usePerformance";
import { SEQUENCER_LANES } from "../../music/foundationPattern";
import { MachineButton, SignalRail } from "../pulse/Primitives";
import {
  TransportPulseSpine,
  TransportStatusLabel,
} from "../transport/TransportUI";
import { MidiPanel } from "../midi/MidiPanel";

function MomentaryPad({
  action,
  label,
}: {
  action: PerformanceMomentaryId;
  label: string;
}) {
  const performance = usePerformanceSnapshot();
  const interaction = useRef<"pointer" | "keyboard" | null>(null);
  const armed = performance.windows.some(
    (window) => window.id === action && window.endTick === undefined,
  );

  const releaseAction = () => {
    performanceStore.releaseMomentary(action);
  };

  const releasePointer = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    releaseAction();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already have been released by the browser.
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
          ? "performance-pad performance-pad--momentary is-active"
          : "performance-pad performance-pad--momentary"
      }
      aria-pressed={armed}
      aria-label={label + ". Hold to keep the performance action active."}
      onPointerDown={(event) => {
        interaction.current = "pointer";
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        performanceStore.pressMomentary(action);
      }}
      onPointerUp={releasePointer}
      onPointerCancel={releasePointer}
      onKeyDown={(event) => {
        if (
          event.repeat ||
          (event.key !== " " && event.key !== "Enter")
        ) {
          return;
        }
        interaction.current = "keyboard";
        event.preventDefault();
        performanceStore.pressMomentary(action);
      }}
      onKeyUp={(event) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        releaseAction();
      }}
      onBlur={() => {
        releaseAction();
        interaction.current = null;
      }}
      onClick={() => {
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
      <span>{label}</span>
      <small>HOLD</small>
    </button>
  );
}

export function PerformanceSurface() {
  const transport = useTransportSnapshot();
  const performance = usePerformanceSnapshot();
  const chaos = useChaosSnapshot();
  const morph = useBeatMorphSnapshot();
  const foundation = useArrangementFoundationSnapshot();
  const family = useBeatFamilySnapshot();
  const arrangement = useArrangementSnapshot();
  const playback = useArrangementPlaybackSnapshot();
  const xyRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState(
    "LIVE READY / PLAY THE BEAT, THEN SHAPE IT",
  );

  useEffect(() => {
    performanceStore.setActive(true);
    return () => {
      performanceStore.setActive(false);
    };
  }, []);

  useEffect(() => {
    const blueprint = foundation.blueprint;
    if (!blueprint || !family.family) return;
    if (blueprint.familyId !== family.family.id) return;

    if (arrangement.sourceFoundationId !== blueprint.id) {
      arrangementStore.loadFromFoundation(
        blueprint,
        family.patterns,
      );
    }
  }, [
    foundation.blueprint?.id,
    family.family?.id,
    family.revision,
    arrangement.sourceFoundationId,
  ]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.repeat || eventTargetConsumesKeyboard(event.target)) return;

      const action =
        event.key.toLowerCase() === "d"
          ? "drop"
          : event.key.toLowerCase() === "b"
            ? "build"
            : event.key.toLowerCase() === "r"
              ? "repeat"
              : event.key.toLowerCase() === "x"
                ? "break"
                : null;

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        performanceStore.triggerFill();
        setStatus("FILL QUEUED / PHRASE END");
        return;
      }

      if (action) {
        event.preventDefault();
        performanceStore.pressMomentary(action);
      }
    };

    const keyup = (event: KeyboardEvent) => {
      if (eventTargetConsumesKeyboard(event.target)) return;

      const action =
        event.key.toLowerCase() === "d"
          ? "drop"
          : event.key.toLowerCase() === "b"
            ? "build"
            : event.key.toLowerCase() === "r"
              ? "repeat"
              : event.key.toLowerCase() === "x"
                ? "break"
                : null;

      if (action) {
        performanceStore.releaseMomentary(action);
      }
    };

    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
    };
  }, []);

  const sections = arrangement.blueprint?.sections ?? [];
  const muted = new Set(performance.trackMutes);
  const latestTakes = [...performance.takes].reverse().slice(0, 4);

  const morphReady = Boolean(morph.a && morph.b && morph.preview);
  const xyPosition = useMemo(
    () => ({
      x: chaos.config.intensity * 100,
      y: (1 - performance.macros.energy) * 100,
    }),
    [chaos.config.intensity, performance.macros.energy],
  );

  const nudgeXY = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    let chaosValue = chaos.config.intensity;
    let energyValue = performance.macros.energy;

    if (event.key === "ArrowLeft") {
      chaosValue -= step;
    } else if (event.key === "ArrowRight") {
      chaosValue += step;
    } else if (event.key === "ArrowDown") {
      energyValue -= step;
    } else if (event.key === "ArrowUp") {
      energyValue += step;
    } else {
      return;
    }

    event.preventDefault();
    chaosStore.setIntensity(
      Math.max(0, Math.min(1, chaosValue)),
    );
    performanceStore.setMacro(
      "energy",
      Math.max(0, Math.min(1, energyValue)),
    );
  };

  const updateXY = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const node = xyRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const x = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left) / rect.width),
    );
    const y = Math.max(
      0,
      Math.min(1, (event.clientY - rect.top) / rect.height),
    );

    chaosStore.setIntensity(x);
    performanceStore.setMacro("energy", 1 - y);
  };

  const launchSection = (sectionId: string) => {
    const scheduled = arrangementPlaybackStore.queueSection(sectionId);
    const tick =
      scheduled ??
      Math.max(0, transport.position.absoluteTick);
    performanceStore.recordSceneLaunch(sectionId, tick);
    setStatus(
      scheduled === 0
        ? "SCENE START / " + sectionId.toUpperCase()
        : "SCENE QUEUED / " + sectionId.toUpperCase(),
    );
  };

  return (
    <section className="performance-surface" aria-labelledby="perform-title">
      <div className="surface-heading">
        <div>
          <p className="eyebrow">05 / LIVE</p>
          <h1 id="perform-title">Play the machine.</h1>
        </div>
        <TransportStatusLabel />
      </div>

      <TransportPulseSpine />

      <div className="performance-scenes">
        <div className="machine-section-label">
          <span>SCENES / QUANTIZED LAUNCH</span>
          <span>
            {playback.queuedSectionId
              ? "QUEUED / " + playback.queuedSectionId.toUpperCase()
              : playback.currentSectionId
                ? "ACTIVE / " + playback.currentSectionId.toUpperCase()
                : sections.length > 0
                  ? "READY"
                  : "NO ARRANGEMENT"}
          </span>
        </div>

        {sections.length > 0 ? (
          <div className="performance-scene-grid">
            {sections.map((section, index) => {
              const active =
                playback.currentSectionId === section.id;
              const queued =
                playback.queuedSectionId === section.id;
              return (
                <button
                  type="button"
                  key={section.id}
                  className={[
                    "performance-scene",
                    active ? "is-active" : "",
                    queued ? "is-queued" : "",
                  ].join(" ")}
                  onClick={() => launchSection(section.id)}
                  aria-pressed={active}
                >
                  <span>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <strong>{section.label}</strong>
                  <small>
                    {Math.round(section.energyStart * 100)}
                    {"→"}
                    {Math.round(section.energyEnd * 100)}
                  </small>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="performance-empty">
            Create an ARRANGE foundation to unlock quantized Scene launching.
            Pattern performance controls below work without one.
          </p>
        )}
      </div>

      <div className="performance-grid">
        <div className="performance-macros">
          <div className="machine-section-label">
            <span>PERFORMANCE / MACROS</span>
            <span>REALTIME OVERLAY</span>
          </div>

          <SignalRail
            label="ENERGY"
            value={performance.macros.energy * 100}
            tone="heat"
            onChange={(value) =>
              performanceStore.setMacro("energy", value / 100)
            }
          />
          <SignalRail
            label="DENSITY"
            value={performance.macros.density * 100}
            onChange={(value) =>
              performanceStore.setMacro("density", value / 100)
            }
          />
          <SignalRail
            label="FILTER"
            value={performance.macros.filter * 100}
            tone="ice"
            onChange={(value) =>
              performanceStore.setMacro("filter", value / 100)
            }
          />
          <SignalRail
            label="SPACE"
            value={performance.macros.space * 100}
            onChange={(value) =>
              performanceStore.setMacro("space", value / 100)
            }
          />
          <SignalRail
            label="DRIVE"
            value={performance.macros.drive * 100}
            tone="heat"
            onChange={(value) =>
              performanceStore.setMacro("drive", value / 100)
            }
          />
          <SignalRail
            label="MORPH"
            value={performance.macros.morph * 100}
            minLabel="A"
            maxLabel="B"
            tone="ice"
            onChange={(value) => {
              const normalized = value / 100;
              performanceStore.setMacro("morph", normalized);
              if (morphReady) beatMorphStore.setAll(normalized);
            }}
          />
          <SignalRail
            label="CHAOS"
            value={chaos.config.intensity * 100}
            minLabel="STABLE"
            maxLabel="WILD"
            tone="heat"
            onChange={(value) =>
              chaosStore.setIntensity(value / 100)
            }
          />

          <p className="performance-note">
            {morphReady
              ? "MORPH A/B READY · CHAOS RUNS AFTER MORPH"
              : "CAPTURE MORPH A/B IN CREATE TO ENABLE LIVE MORPH"}
          </p>
        </div>

        <div className="performance-xy-shell">
          <div className="machine-section-label">
            <span>XY / CHAOS × ENERGY</span>
            <span>TOUCH + POINTER</span>
          </div>

          <div
            ref={xyRef}
            className="performance-xy"
            role="group"
            aria-label={
              "Chaos and Energy XY performance pad. " +
              "Left and right change Chaos. Up and down change Energy. " +
              "Hold Shift for larger steps."
            }
            tabIndex={0}
            onKeyDown={nudgeXY}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              updateXY(event);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
                return;
              }
              updateXY(event);
            }}
            onPointerUp={(event) => {
              updateXY(event);
              try {
                event.currentTarget.releasePointerCapture(event.pointerId);
              } catch {
                // Browser may release pointer capture first.
              }
            }}
            onPointerCancel={(event) => {
              try {
                event.currentTarget.releasePointerCapture(event.pointerId);
              } catch {
                // Browser may release pointer capture first.
              }
            }}
          >
            <span className="performance-xy__axis performance-xy__axis--x">
              CHAOS →
            </span>
            <span className="performance-xy__axis performance-xy__axis--y">
              ENERGY ↑
            </span>
            <span
              className="performance-xy__cursor"
              style={{
                left: xyPosition.x + "%",
                top: xyPosition.y + "%",
              }}
              aria-hidden="true"
            />
          </div>

          <div className="performance-reset">
            <MachineButton
              compact
              onClick={() => {
                performanceStore.resetMacros();
                chaosStore.setIntensity(0);
                if (morphReady) beatMorphStore.setAll(0);
                setStatus("PERFORMANCE MACROS RESET");
              }}
            >
              RESET MACROS
            </MachineButton>
          </div>
        </div>

        <div className="performance-actions">
          <div className="machine-section-label">
            <span>MOMENTARY / ACTIONS</span>
            <span>BEAT-QUANTIZED</span>
          </div>

          <div className="performance-pad-grid">
            <button
              type="button"
              className="performance-pad performance-pad--fill"
              onClick={() => {
                performanceStore.triggerFill();
                setStatus("FILL QUEUED / FINAL BEAT OF NEXT BAR");
              }}
            >
              <span>FILL</span>
              <small>F</small>
            </button>
            <MomentaryPad action="drop" label="DROP" />
            <MomentaryPad action="break" label="BREAK" />
            <MomentaryPad action="build" label="BUILD" />
            <MomentaryPad action="repeat" label="REPEAT" />
            <MomentaryPad action="stutter" label="STUTTER" />
          </div>

          <div className="performance-lane-mutes">
            <span>PERFORMANCE MUTES</span>
            <div>
              {SEQUENCER_LANES.map((lane) => (
                <button
                  type="button"
                  key={lane.id}
                  className={muted.has(lane.id) ? "is-muted" : undefined}
                  aria-pressed={muted.has(lane.id)}
                  onClick={() =>
                    performanceStore.toggleTrackMute(lane.id)
                  }
                >
                  {lane.code}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="performance-recorder">
        <div className="machine-section-label">
          <span>JAM / CAPTURE</span>
          <span>
            {performance.recording
              ? performance.currentEventCount + " EVENTS"
              : latestTakes.length + " TAKES"}
          </span>
        </div>

        <div className="performance-recorder__controls">
          <MachineButton
            active={performance.recording}
            onClick={() => {
              if (performance.recording) {
                const take = performanceStore.stopRecording();
                setStatus(
                  take
                    ? "TAKE CAPTURED / " +
                        take.events.length +
                        " EVENTS"
                    : "TAKE EMPTY / NOTHING CAPTURED",
                );
              } else {
                performanceStore.startRecording();
                setStatus("RECORDING PERFORMANCE ACTIONS");
              }
            }}
          >
            {performance.recording ? "■ STOP TAKE" : "● RECORD TAKE"}
          </MachineButton>
          <MachineButton
            compact
            onClick={() => {
              performanceStore.clearTransient();
              setStatus("TEMPORARY PERFORMANCE STATE CLEARED");
            }}
          >
            CLEAR TEMP
          </MachineButton>
        </div>

        {latestTakes.length > 0 ? (
          <div className="performance-takes">
            {latestTakes.map((take) => (
              <div key={take.id} className="performance-take">
                <div>
                  <strong>{take.id.toUpperCase()}</strong>
                  <span>
                    {take.events.length} EVENTS · Δ
                    {Math.round(take.durationTicks)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => performanceStore.deleteTake(take.id)}
                >
                  DELETE
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <MidiPanel />

      <p className="performance-status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
