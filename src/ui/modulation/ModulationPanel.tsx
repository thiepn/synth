import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useDrumEngineSnapshot } from "../../audio/useDrumEngine";
import { useDrumSoundSnapshot } from "../../audio/useDrumSounds";
import { useTransportSnapshot } from "../../audio/useTransport";
import type { DrumMaterialParam } from "../../audio/drumSoundModel";
import {
  evaluateModulationSource,
  type AutomationCurve,
  type LfoShape,
  type ModulationSourceKind,
} from "../../modulation/modulationEngine";
import { modulationStore } from "../../modulation/ModulationStore";
import {
  MODULATION_TARGETS,
  modulationTarget,
} from "../../modulation/parameterRegistry";
import { useModulationSnapshot } from "../../modulation/useModulation";
import { useSequencerSnapshot } from "../../sequencer/useSequencer";
import type { DrumVoiceId } from "../../music/foundationPattern";
import { MachineButton, SignalRail } from "../pulse/Primitives";

const SOURCE_TYPES: ReadonlyArray<{
  kind: ModulationSourceKind;
  code: string;
  label: string;
}> = [
  { kind: "lfo", code: "LFO", label: "LFO" },
  { kind: "envelope", code: "ENV", label: "Envelope" },
  { kind: "sampleHold", code: "S&H", label: "Sample & Hold" },
  { kind: "randomSmooth", code: "RND", label: "Random Smooth" },
  { kind: "step", code: "STP", label: "Step Mod" },
];

const LFO_SHAPES: LfoShape[] = ["sine", "triangle", "square", "saw"];
const AUTOMATION_CURVES: AutomationCurve[] = ["hold", "linear", "smooth"];

function rateFromRail(value: number): number {
  const normalized = Math.max(0, Math.min(1, value / 100));
  return 0.125 * Math.pow(128, normalized);
}

function railFromRate(rate: number): number {
  const safe = Math.max(0.125, Math.min(16, rate));
  return (Math.log(safe / 0.125) / Math.log(128)) * 100;
}

function rateLabel(rate: number): string {
  if (rate < 1) {
    const denominator = Math.round(1 / rate);
    return "1/" + denominator + " BEAT";
  }
  return rate.toFixed(rate < 2 ? 2 : 1) + " BEATS";
}

function targetBaseValue(
  targetId: string,
  voiceSpecs: ReturnType<typeof useDrumSoundSnapshot>["specs"],
  engine: ReturnType<typeof useDrumEngineSnapshot>,
): number {
  const target = modulationTarget(targetId);
  if (!target) return 0.5;

  if (target.scope === "voice" && target.voice && target.param) {
    return voiceSpecs[target.voice][target.param];
  }

  switch (targetId) {
    case "engine.master":
      return engine.master;
    case "engine.punch":
      return engine.macros.punch;
    case "engine.tone":
      return engine.macros.tone;
    case "engine.decay":
      return engine.macros.decay;
    case "engine.grit":
      return engine.macros.grit;
    case "engine.space":
      return engine.macros.space;
    case "engine.filter":
      return 1;
    default:
      return target.defaultValue;
  }
}

function sourcePath(
  source: NonNullable<
    ReturnType<typeof useModulationSnapshot>["sources"][number]
  >,
): string {
  const points = Array.from({ length: 64 }, (_, index) => {
    const phaseTick = (index / 63) * source.rateBeats * 4 * 960;
    const value = evaluateModulationSource(source, phaseTick);
    const normalized = source.bipolar ? (value + 1) / 2 : value;
    const x = (index / 63) * 100;
    const y = 100 - Math.max(0, Math.min(1, normalized)) * 100;
    return [x, y] as const;
  });

  return points
    .map(
      ([x, y], index) =>
        (index === 0 ? "M" : "L") +
        x.toFixed(2) +
        " " +
        y.toFixed(2),
    )
    .join(" ");
}

export function ModulationPanel({
  selectedVoice,
}: {
  selectedVoice: DrumVoiceId;
}) {
  const modulation = useModulationSnapshot();
  const transport = useTransportSnapshot();
  const sequencer = useSequencerSnapshot();
  const sounds = useDrumSoundSnapshot();
  const engine = useDrumEngineSnapshot();
  const laneRef = useRef<HTMLDivElement | null>(null);
  const [curve, setCurve] = useState<AutomationCurve>("smooth");

  const selectedSource =
    modulation.sources.find(
      (source) => source.id === modulation.selectedSourceId,
    ) ?? modulation.sources[0];

  const visibleTargets = useMemo(
    () =>
      MODULATION_TARGETS.filter(
        (target) =>
          target.scope === "engine" ||
          target.voice === selectedVoice,
      ),
    [selectedVoice],
  );

  const selectedTarget =
    modulationTarget(modulation.selectedTargetId) ??
    visibleTargets[0];

  const targetId =
    selectedTarget &&
    visibleTargets.some((target) => target.id === selectedTarget.id)
      ? selectedTarget.id
      : visibleTargets[0]?.id ?? "engine.filter";

  const target = modulationTarget(targetId);
  const baseValue = targetBaseValue(targetId, sounds.specs, engine);
  const resolved = modulationStore.resolveTarget(
    targetId,
    baseValue,
    transport.position.absoluteTick,
  );

  const lane = modulation.automationLanes.find(
    (entry) => entry.targetId === targetId,
  );
  const loopTicks =
    lane?.loopLengthTicks ??
    Math.max(1, sequencer.pattern.lengthTicks);
  const sourceRoutes = selectedSource
    ? modulation.routes.filter(
        (route) => route.sourceId === selectedSource.id,
      )
    : [];

  const previewPath = selectedSource
    ? sourcePath(selectedSource)
    : "";

  const drawAutomation = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const node = laneRef.current;
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
    const tick = Math.round(x * loopTicks);
    const value = 1 - y;

    if (!lane?.loopLengthTicks) {
      modulationStore.setAutomationLoopLength(targetId, loopTicks);
    }
    modulationStore.addAutomationPoint(
      targetId,
      tick,
      value,
      curve,
      Math.max(1, Math.round(loopTicks / 64)),
    );
  };

  const selectTarget = (nextTargetId: string) => {
    modulationStore.selectTarget(nextTargetId);
  };

  return (
    <section className="modulation-panel" aria-labelledby="modulation-title">
      <div className="machine-section-label">
        <span id="modulation-title">MOTION / MODULATION + AUTOMATION</span>
        <span>RUNTIME PARAMETER LAYER / V1</span>
      </div>

      <div className="modulation-layout">
        <div className="modulation-sources">
          <div className="modulation-subhead">
            <span>SOURCES</span>
            <strong>{modulation.sources.length}</strong>
          </div>

          <div className="modulation-source-add">
            {SOURCE_TYPES.map((entry) => (
              <button
                type="button"
                key={entry.kind}
                onClick={() => modulationStore.addSource(entry.kind)}
                title={"Add " + entry.label}
              >
                {entry.code}
              </button>
            ))}
          </div>

          <div className="modulation-source-list">
            {modulation.sources.map((source, index) => (
              <button
                type="button"
                key={source.id}
                className={
                  selectedSource?.id === source.id ? "is-active" : undefined
                }
                onClick={() => modulationStore.selectSource(source.id)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{source.name}</strong>
                <small>{source.kind.toUpperCase()}</small>
              </button>
            ))}
          </div>

          {selectedSource ? (
            <>
              <div className="modulation-source-scope">
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label={selectedSource.name + " modulation shape"}
                >
                  <path d="M0 50 H100 M25 0 V100 M50 0 V100 M75 0 V100" />
                  <path className="is-signal" d={previewPath} />
                </svg>
              </div>

              <div className="modulation-source-controls">
                {selectedSource.kind === "external" ? (
                  <>
                    <SignalRail
                      label="HARDWARE VALUE"
                      value={(selectedSource.externalValue ?? 0) * 100}
                      minLabel="0"
                      maxLabel="127"
                      tone="ice"
                      disabled
                    />
                    <div className="modulation-value-readout">
                      EXTERNAL / MIDI-OWNED SOURCE
                    </div>
                  </>
                ) : (
                  <>
                    <SignalRail
                      label="RATE"
                      value={railFromRate(selectedSource.rateBeats)}
                      minLabel="1/8"
                      maxLabel="16B"
                      tone="ice"
                      onChange={(value) =>
                        modulationStore.updateSource(selectedSource.id, {
                          rateBeats: rateFromRail(value),
                        })
                      }
                    />
                    <div className="modulation-value-readout">
                      {rateLabel(selectedSource.rateBeats)}
                    </div>

                    <SignalRail
                      label="PHASE"
                      value={selectedSource.phase * 100}
                      onChange={(value) =>
                        modulationStore.updateSource(selectedSource.id, {
                          phase: value / 100,
                        })
                      }
                    />
                  </>
                )}

                {selectedSource.kind === "lfo" ? (
                  <div className="modulation-choice-row">
                    {LFO_SHAPES.map((shape) => (
                      <button
                        type="button"
                        key={shape}
                        className={
                          selectedSource.shape === shape
                            ? "is-active"
                            : undefined
                        }
                        onClick={() =>
                          modulationStore.updateSource(selectedSource.id, {
                            shape,
                          })
                        }
                      >
                        {shape.toUpperCase()}
                      </button>
                    ))}
                  </div>
                ) : null}

                {selectedSource.kind === "envelope" ? (
                  <SignalRail
                    label="ATTACK"
                    value={selectedSource.attack * 100}
                    tone="heat"
                    onChange={(value) =>
                      modulationStore.updateSource(selectedSource.id, {
                        attack: value / 100,
                      })
                    }
                  />
                ) : null}

                {selectedSource.kind === "step" ? (
                  <div className="modulation-step-editor">
                    {selectedSource.stepValues.map((value, index) => (
                      <label key={index}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={value * 100}
                          onChange={(event) => {
                            const next = [...selectedSource.stepValues];
                            next[index] =
                              Number(event.currentTarget.value) / 100;
                            modulationStore.updateSource(
                              selectedSource.id,
                              { stepValues: next },
                            );
                          }}
                          aria-label={"Step modulation value " + (index + 1)}
                        />
                      </label>
                    ))}
                  </div>
                ) : null}

                <div className="modulation-source-actions">
                  <MachineButton
                    compact
                    active={selectedSource.enabled}
                    onClick={() =>
                      modulationStore.updateSource(selectedSource.id, {
                        enabled: !selectedSource.enabled,
                      })
                    }
                  >
                    {selectedSource.enabled ? "ON" : "OFF"}
                  </MachineButton>
                  <MachineButton
                    compact
                    active={selectedSource.bipolar}
                    onClick={() =>
                      modulationStore.updateSource(selectedSource.id, {
                        bipolar: !selectedSource.bipolar,
                      })
                    }
                  >
                    {selectedSource.bipolar ? "BIPOLAR" : "UNIPOLAR"}
                  </MachineButton>
                  <MachineButton
                    compact
                    disabled={
                      modulation.sources.length <= 1 ||
                      selectedSource.kind === "external"
                    }
                    onClick={() =>
                      modulationStore.removeSource(selectedSource.id)
                    }
                  >
                    {selectedSource.kind === "external"
                      ? "MIDI OWNED"
                      : "DELETE"}
                  </MachineButton>
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="modulation-routes">
          <div className="modulation-subhead">
            <span>ROUTING</span>
            <strong>{sourceRoutes.length} ROUTES</strong>
          </div>

          <label className="modulation-target-select">
            <span>TARGET</span>
            <select
              value={targetId}
              onChange={(event) => selectTarget(event.currentTarget.value)}
            >
              {visibleTargets.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>

          <MachineButton
            compact
            disabled={!selectedSource}
            onClick={() =>
              selectedSource
                ? modulationStore.addRoute(
                    selectedSource.id,
                    targetId,
                    0.5,
                  )
                : undefined
            }
          >
            + ROUTE SELECTED SOURCE
          </MachineButton>

          <div className="modulation-route-list">
            {sourceRoutes.length > 0 ? (
              sourceRoutes.map((route) => {
                const routeTarget = modulationTarget(route.targetId);
                return (
                  <div className="modulation-route" key={route.id}>
                    <div>
                      <span>{routeTarget?.shortLabel ?? route.targetId}</span>
                      <strong>
                        {route.depth >= 0 ? "+" : ""}
                        {Math.round(route.depth * 100)}
                      </strong>
                    </div>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={route.depth * 100}
                      onChange={(event) =>
                        modulationStore.updateRoute(route.id, {
                          depth:
                            Number(event.currentTarget.value) / 100,
                        })
                      }
                      aria-label={
                        (routeTarget?.label ?? route.targetId) +
                        " modulation depth"
                      }
                    />
                    <button
                      type="button"
                      className={route.enabled ? "is-active" : undefined}
                      onClick={() =>
                        modulationStore.updateRoute(route.id, {
                          enabled: !route.enabled,
                        })
                      }
                    >
                      {route.enabled ? "ON" : "OFF"}
                    </button>
                    <button
                      type="button"
                      onClick={() => modulationStore.removeRoute(route.id)}
                    >
                      ×
                    </button>
                  </div>
                );
              })
            ) : (
              <p className="modulation-empty">
                Add a route from the selected source to the selected target.
              </p>
            )}
          </div>

          <div className="modulation-resolution">
            <span>LIVE VALUE</span>
            <strong>{Math.round(resolved.value * 100)}</strong>
            <small>
              BASE {Math.round(resolved.baseValue * 100)}
              {" · AUTO "}
              {Math.round(resolved.automatedValue * 100)}
              {" · MOD "}
              {resolved.modulationOffset >= 0 ? "+" : ""}
              {Math.round(resolved.modulationOffset * 100)}
            </small>
          </div>
        </div>

        <div className="automation-editor">
          <div className="modulation-subhead">
            <span>AUTOMATION / {target?.shortLabel ?? targetId}</span>
            <strong>
              {lane?.points.length ?? 0} POINTS
            </strong>
          </div>

          <div className="automation-toolbar">
            <div className="modulation-choice-row">
              {AUTOMATION_CURVES.map((entry) => (
                <button
                  type="button"
                  key={entry}
                  className={curve === entry ? "is-active" : undefined}
                  onClick={() => setCurve(entry)}
                >
                  {entry.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                modulationStore.setAutomationLaneEnabled(
                  targetId,
                  !(lane?.enabled ?? true),
                )
              }
            >
              {lane?.enabled === false ? "AUTO OFF" : "AUTO ON"}
            </button>
            <button
              type="button"
              onClick={() => modulationStore.clearAutomation(targetId)}
              disabled={!lane || lane.points.length === 0}
            >
              CLEAR
            </button>
          </div>

          <div
            ref={laneRef}
            className={
              lane?.enabled === false
                ? "automation-lane is-disabled"
                : "automation-lane"
            }
            role="application"
            aria-label={"Draw automation for " + (target?.label ?? targetId)}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              drawAutomation(event);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
                return;
              }
              drawAutomation(event);
            }}
            onPointerUp={(event) => {
              drawAutomation(event);
              try {
                event.currentTarget.releasePointerCapture(event.pointerId);
              } catch {
                // Pointer capture may already be released.
              }
            }}
            onPointerCancel={(event) => {
              try {
                event.currentTarget.releasePointerCapture(event.pointerId);
              } catch {
                // Pointer capture may already be released.
              }
            }}
          >
            <div className="automation-lane__grid" aria-hidden="true" />
            <div
              className="automation-lane__playhead"
              style={{
                left:
                  ((transport.position.absoluteTick % loopTicks) /
                    loopTicks) *
                    100 +
                  "%",
              }}
              aria-hidden="true"
            />
            {(lane?.points ?? []).map((point) => (
              <button
                type="button"
                key={point.id}
                className="automation-point"
                style={{
                  left: (point.tick / loopTicks) * 100 + "%",
                  top: (1 - point.value) * 100 + "%",
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  modulationStore.removeAutomationPoint(
                    targetId,
                    point.id,
                  );
                }}
                title={
                  "Tick " +
                  point.tick +
                  " · " +
                  Math.round(point.value * 100) +
                  " · click to remove"
                }
                aria-label={
                  "Automation point " +
                  Math.round(point.value * 100) +
                  " percent. Click to remove."
                }
              />
            ))}
          </div>

          <div className="automation-axis">
            <span>0</span>
            <span>
              LOOP {Math.round(loopTicks / 960)} BEATS
            </span>
            <span>100</span>
          </div>

          <p className="modulation-empty">
            Drag across the lane to write automation. Nearby points coalesce
            automatically; click an existing point to remove it.
          </p>
        </div>
      </div>
    </section>
  );
}
