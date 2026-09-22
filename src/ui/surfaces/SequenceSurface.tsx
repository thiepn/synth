import {
  type CSSProperties,
  useEffect,
  useMemo,
  useState,
} from "react";
import { TRANSPORT_SCHEDULER_CONFIG } from "../../audio/AudioTransport";
import { drumEngine } from "../../audio/DrumEngine";
import { useTransportSnapshot } from "../../audio/useTransport";
import type { StepEvent } from "../../domain/contracts";
import { swingOffsetUsForStep } from "../../groove/grooveEngine";
import {
  SEQUENCER_LANES,
  laneDefinitionById,
} from "../../music/foundationPattern";
import {
  SEQUENCER_LENGTH_OPTIONS,
  sequencerStore,
  type SequencerLengthSteps,
} from "../../sequencer/SequencerStore";
import { useSequencerSnapshot } from "../../sequencer/useSequencer";
import { deriveRhythmGlyph } from "../../visual/rhythmGlyph";
import {
  MachineButton,
  RhythmGlyph,
  SignalRail,
} from "../pulse/Primitives";
import {
  TransportPulseSpine,
  TransportStatusLabel,
} from "../transport/TransportUI";

interface Selection {
  laneId: string;
  stepIndex: number;
}

function stepEvent(
  pattern: ReturnType<typeof sequencerStore.getSnapshot>["pattern"],
  laneId: string,
  stepIndex: number,
): StepEvent | undefined {
  const lane = pattern.lanes.find((entry) => entry.id === laneId);
  if (!lane) return undefined;
  const tick = stepIndex * TRANSPORT_SCHEDULER_CONFIG.pulseTicks;
  return lane.events.find((event) => event.tick === tick);
}

function stepVelocity(
  pattern: ReturnType<typeof sequencerStore.getSnapshot>["pattern"],
  laneId: string,
  stepIndex: number,
): number | undefined {
  return stepEvent(pattern, laneId, stepIndex)?.velocity;
}

function visualTimingOffsetPx(timingOffsetUs: number): number {
  return Math.max(-10, Math.min(10, timingOffsetUs / 2500));
}

export function SequenceSurface() {
  const sequencer = useSequencerSnapshot();
  const transport = useTransportSnapshot();
  const [selection, setSelection] = useState<Selection>({
    laneId: "lane-kick",
    stepIndex: 0,
  });

  useEffect(() => {
    if (selection.stepIndex < sequencer.lengthSteps) return;
    setSelection((current) => ({
      ...current,
      stepIndex: Math.max(0, sequencer.lengthSteps - 1),
    }));
  }, [selection.stepIndex, sequencer.lengthSteps]);

  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.matches("input, textarea, select, [role='slider']"))
      ) {
        return;
      }

      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) return;

      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          sequencerStore.redo();
        } else {
          sequencerStore.undo();
        }
      } else if (key === "y") {
        event.preventDefault();
        sequencerStore.redo();
      }
    };

    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  }, []);

  const selectedDefinition = laneDefinitionById(selection.laneId);
  const selectedEvent = stepEvent(
    sequencer.pattern,
    selection.laneId,
    selection.stepIndex,
  );
  const selectedVelocity = selectedEvent?.velocity;
  const selectedProbability = selectedEvent?.probability ?? 1;
  const selectedRatchet = Math.max(1, selectedEvent?.ratchetCount ?? 1);
  const selectedFlamMs = Math.round((selectedEvent?.flamOffsetUs ?? 0) / 1000);
  const selectedManualTimingMs = Math.round(
    (selectedEvent?.timingOffsetUs ?? 0) / 1000,
  );
  const selectedOn = selectedEvent !== undefined;
  const selectedTimingUs =
    (selectedEvent?.timingOffsetUs ?? 0) +
    swingOffsetUsForStep(
      selection.stepIndex,
      transport.bpm,
      sequencer.pattern.groove?.swing ?? 0,
    );

  const activeStep =
    transport.status === "running"
      ? Math.floor(
          transport.position.absoluteTick /
            TRANSPORT_SCHEDULER_CONFIG.pulseTicks,
        ) % sequencer.lengthSteps
      : undefined;

  const glyphGeometry = useMemo(
    () => deriveRhythmGlyph(sequencer.pattern),
    [sequencer.pattern],
  );

  const beatColumns = useMemo(
    () =>
      Array.from({ length: sequencer.lengthSteps }, (_, index) => ({
        index,
        label: String(index + 1).padStart(2, "0"),
        major: index % 4 === 0,
      })),
    [sequencer.lengthSteps],
  );

  const handleStep = (
    laneId: string,
    stepIndex: number,
    isOn: boolean,
    shiftKey: boolean,
  ) => {
    const isSelected =
      selection.laneId === laneId &&
      selection.stepIndex === stepIndex;

    setSelection({ laneId, stepIndex });

    if (shiftKey) {
      sequencerStore.cycleStepVelocity(laneId, stepIndex);
      return;
    }

    if (!isOn || isSelected) {
      sequencerStore.toggleStep(laneId, stepIndex);
    }
  };

  const auditionSelected = () => {
    if (!selectedDefinition) return;
    void drumEngine.triggerNow(
      selectedDefinition.voice,
      selectedVelocity ?? 0.8,
    );
  };

  return (
    <section
      className="sequence-surface"
      aria-labelledby="sequence-title"
    >
      <div className="surface-heading">
        <div>
          <p className="eyebrow">02 / SEQUENCE</p>
          <h1 id="sequence-title">Rhythm matrix.</h1>
        </div>
        <TransportStatusLabel />
      </div>

      <TransportPulseSpine />

      <div className="sequence-toolbar">
        <div className="sequence-toolbar__identity">
          <span>PATTERN / 01</span>
          <strong>{sequencer.pattern.name}</strong>
          <span>REV {String(sequencer.revision).padStart(3, "0")}</span>
        </div>

        <div className="sequence-toolbar__length" aria-label="Pattern length">
          <span>STEPS</span>
          {SEQUENCER_LENGTH_OPTIONS.map((length) => (
            <button
              type="button"
              key={length}
              className={
                sequencer.lengthSteps === length
                  ? "sequence-mini-key is-active"
                  : "sequence-mini-key"
              }
              onClick={() =>
                sequencerStore.setLengthSteps(
                  length as SequencerLengthSteps,
                )
              }
              aria-pressed={sequencer.lengthSteps === length}
            >
              {length}
            </button>
          ))}
        </div>

        <div className="sequence-toolbar__history">
          <MachineButton
            compact
            disabled={!sequencer.canUndo}
            onClick={() => sequencerStore.undo()}
          >
            UNDO
          </MachineButton>
          <MachineButton
            compact
            disabled={!sequencer.canRedo}
            onClick={() => sequencerStore.redo()}
          >
            REDO
          </MachineButton>
          <MachineButton compact onClick={() => sequencerStore.duplicate()}>
            DUP ×2
          </MachineButton>
          <MachineButton compact onClick={() => sequencerStore.clearPattern()}>
            CLEAR
          </MachineButton>
          <MachineButton compact onClick={() => sequencerStore.resetPattern()}>
            RESET
          </MachineButton>
        </div>
      </div>

      <div className="sequence-glyph-strip">
        <div className="sequence-glyph-strip__identity">
          <span>RHYTHM / GLYPH</span>
          <strong>{"RG-" + glyphGeometry.signature.slice(0, 6)}</strong>
          <span>
            {(sequencer.pattern.groove?.personality ?? "mechanical")
              .replace("laidBack", "laid-back")
              .toUpperCase()}
          </span>
        </div>

        <div className="sequence-glyph-strip__glyph">
          <RhythmGlyph
            geometry={glyphGeometry}
            compact
            label={"Rhythm glyph " + glyphGeometry.signature}
          />
        </div>

        <dl className="sequence-glyph-strip__metrics">
          <div>
            <dt>DENS</dt>
            <dd>{Math.round(glyphGeometry.metrics.density * 100)}</dd>
          </div>
          <div>
            <dt>SYNC</dt>
            <dd>{Math.round(glyphGeometry.metrics.syncopation * 100)}</dd>
          </div>
          <div>
            <dt>SWNG</dt>
            <dd>{Math.round(glyphGeometry.metrics.swing * 100)}</dd>
          </div>
          <div>
            <dt>VEL</dt>
            <dd>{Math.round(glyphGeometry.metrics.meanVelocity * 100)}</dd>
          </div>
          <div>
            <dt>HUMN</dt>
            <dd>
              {Math.round(
                (sequencer.pattern.groove?.humanization ?? 0) * 100,
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div className="rhythm-matrix-shell">
        <div
          className="rhythm-matrix"
          style={{
            "--matrix-steps": sequencer.lengthSteps,
          } as CSSProperties}
        >
          <div className="rhythm-matrix__corner">
            <span>LANE</span>
            <span>M / S / L / LEN</span>
          </div>

          <div className="rhythm-matrix__step-header">
            {beatColumns.map((column) => (
              <span
                key={column.index}
                className={[
                  "rhythm-matrix__step-number",
                  column.major ? "is-major" : "",
                  activeStep === column.index ? "is-current" : "",
                ].join(" ")}
              >
                {column.label}
              </span>
            ))}
          </div>

          {SEQUENCER_LANES.map((definition) => {
            const lane = sequencer.pattern.lanes.find(
              (entry) => entry.id === definition.id,
            );
            if (!lane) return null;

            const muted = Boolean(lane.muted);
            const solo = Boolean(lane.solo);
            const locked = Boolean(lane.lock.rhythm);
            const laneLength = sequencerStore.getLaneLengthSteps(definition.id);
            const laneActiveStep =
              transport.status === "running"
                ? Math.floor(
                    transport.position.absoluteTick /
                      TRANSPORT_SCHEDULER_CONFIG.pulseTicks,
                  ) % laneLength
                : undefined;
            const suppressed =
              sequencer.soloLaneCount > 0 && !solo;

            return (
              <div
                className={[
                  "rhythm-matrix__row",
                  muted ? "is-muted" : "",
                  solo ? "is-solo" : "",
                  suppressed ? "is-suppressed" : "",
                  locked ? "is-locked" : "",
                  "rhythm-matrix__row--" + definition.accent,
                ].join(" ")}
                key={definition.id}
              >
                <div className="rhythm-matrix__lane">
                  <button
                    type="button"
                    className="rhythm-matrix__audition"
                    onClick={() =>
                      void drumEngine.triggerNow(definition.voice, 0.82)
                    }
                    aria-label={"Audition " + definition.name}
                  >
                    <span>{definition.code}</span>
                    <strong>{definition.name}</strong>
                    <small>LEN {laneLength}</small>
                  </button>

                  <div className="rhythm-matrix__lane-switches">
                    <button
                      type="button"
                      className={muted ? "is-active" : ""}
                      onClick={() => sequencerStore.toggleMute(definition.id)}
                      aria-pressed={muted}
                      aria-label={"Mute " + definition.name}
                    >
                      M
                    </button>
                    <button
                      type="button"
                      className={solo ? "is-active" : ""}
                      onClick={() => sequencerStore.toggleSolo(definition.id)}
                      aria-pressed={solo}
                      aria-label={"Solo " + definition.name}
                    >
                      S
                    </button>
                    <button
                      type="button"
                      className={locked ? "is-active" : ""}
                      onClick={() =>
                        sequencerStore.toggleLaneRhythmLock(definition.id)
                      }
                      aria-pressed={locked}
                      aria-label={(locked ? "Unlock " : "Lock ") + definition.name}
                      title="Protect this lane from Beat Reactor rerolls"
                    >
                      L
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        sequencerStore.setLaneLengthSteps(
                          definition.id,
                          laneLength - 1,
                        )
                      }
                      disabled={laneLength <= 1}
                      aria-label={"Shorten " + definition.name + " lane loop"}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        sequencerStore.setLaneLengthSteps(
                          definition.id,
                          laneLength + 1,
                        )
                      }
                      disabled={laneLength >= sequencer.lengthSteps}
                      aria-label={"Lengthen " + definition.name + " lane loop"}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="rhythm-matrix__steps">
                  {beatColumns.map(({ index, major }) => {
                    const event = stepEvent(
                      sequencer.pattern,
                      definition.id,
                      index,
                    );
                    const velocity = event?.velocity;
                    const isOn = event !== undefined;
                    const probability = event?.probability ?? 1;
                    const ratchet = Math.max(1, event?.ratchetCount ?? 1);
                    const flam = event?.flamOffsetUs ?? 0;
                    const beyondLoop = index >= laneLength;
                    const timingUs =
                      (event?.timingOffsetUs ?? 0) +
                      swingOffsetUsForStep(
                        index,
                        transport.bpm,
                        sequencer.pattern.groove?.swing ?? 0,
                      );
                    const timingPx = visualTimingOffsetPx(timingUs);
                    const isSelected =
                      selection.laneId === definition.id &&
                      selection.stepIndex === index;

                    return (
                      <button
                        type="button"
                        key={index}
                        className={[
                          "sequence-step",
                          isOn ? "is-on" : "",
                          isSelected ? "is-selected" : "",
                          laneActiveStep === index ? "is-current" : "",
                          major ? "is-major" : "",
                          beyondLoop ? "is-beyond-loop" : "",
                          probability < 1 ? "is-probabilistic" : "",
                          event?.accent === "ghost" ? "is-ghost" : "",
                        ].join(" ")}
                        style={{
                          "--step-velocity": velocity ?? 0,
                          "--step-offset": timingPx + "px",
                          "--step-probability": probability,
                        } as CSSProperties}
                        onClick={(event) =>
                          handleStep(
                            definition.id,
                            index,
                            isOn,
                            event.shiftKey,
                          )
                        }
                        aria-pressed={isOn}
                        aria-label={
                          definition.name +
                          " step " +
                          (index + 1) +
                          (isOn
                            ? ", velocity " +
                              Math.round((velocity ?? 0) * 100) +
                              ", timing " +
                              Math.round(timingUs / 1000) +
                              " milliseconds"
                            : ", off")
                        }
                      >
                        <span className="sequence-step__rail" aria-hidden="true" />
                        <span className="sequence-step__hit" aria-hidden="true" />
                        {isOn && (ratchet > 1 || flam > 0 || probability < 1) ? (
                          <span className="sequence-step__meta" aria-hidden="true">
                            {ratchet > 1
                              ? "×" + ratchet
                              : flam > 0
                                ? "F"
                                : Math.round(probability * 100)}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="step-editor">
        <div className="step-editor__identity">
          <span>STEP / EDITOR</span>
          <strong>
            {selectedDefinition?.code ?? "--"} ·
            {String(selection.stepIndex + 1).padStart(2, "0")}
          </strong>
          <span>
            {selectedOn
              ? (selectedEvent?.accent ?? "normal").toUpperCase() +
                " · " +
                (selectedTimingUs >= 0 ? "+" : "") +
                Math.round(selectedTimingUs / 1000) +
                "ms"
              : "EMPTY"}
          </span>
        </div>

        <div className="step-editor__toggle">
          <MachineButton
            active={selectedOn}
            onClick={() =>
              sequencerStore.toggleStep(
                selection.laneId,
                selection.stepIndex,
              )
            }
          >
            {selectedOn ? "STEP ON" : "STEP OFF"}
          </MachineButton>
          <MachineButton onClick={auditionSelected}>AUDITION</MachineButton>
        </div>

        <div className="step-editor__velocity">
          <SignalRail
            label="VELOCITY"
            value={(selectedVelocity ?? 0.76) * 100}
            tone={selectedDefinition?.accent ?? "phosphor"}
            onChange={(value) =>
              sequencerStore.setStepVelocity(
                selection.laneId,
                selection.stepIndex,
                value / 100,
              )
            }
          />
        </div>

        <div className="step-editor__advanced">
          <label>
            <span>PROB</span>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(selectedProbability * 100)}
              onChange={(event) =>
                sequencerStore.setStepProbability(
                  selection.laneId,
                  selection.stepIndex,
                  Number(event.currentTarget.value) / 100,
                )
              }
            />
            <b>{Math.round(selectedProbability * 100)}%</b>
          </label>

          <label>
            <span>TIME</span>
            <input
              type="range"
              min="-50"
              max="50"
              value={selectedManualTimingMs}
              onChange={(event) =>
                sequencerStore.setStepTimingOffsetUs(
                  selection.laneId,
                  selection.stepIndex,
                  Number(event.currentTarget.value) * 1000,
                )
              }
            />
            <b>{selectedManualTimingMs >= 0 ? "+" : ""}{selectedManualTimingMs}ms</b>
          </label>

          <div className="step-editor__ratchets">
            <span>RATCHET</span>
            {[1, 2, 3, 4].map((count) => (
              <button
                type="button"
                key={count}
                className={selectedRatchet === count ? "is-active" : ""}
                onClick={() =>
                  sequencerStore.setStepRatchetCount(
                    selection.laneId,
                    selection.stepIndex,
                    count,
                  )
                }
              >
                ×{count}
              </button>
            ))}
          </div>

          <label>
            <span>FLAM</span>
            <input
              type="range"
              min="0"
              max="60"
              step="5"
              value={selectedFlamMs}
              onChange={(event) =>
                sequencerStore.setStepFlamOffsetUs(
                  selection.laneId,
                  selection.stepIndex,
                  Number(event.currentTarget.value) * 1000,
                )
              }
            />
            <b>{selectedFlamMs}ms</b>
          </label>
        </div>
      </div>

      <p className="sequence-hint">
        Empty step: click to add. Active step: first click selects, click the
        selected step again to remove. Shift-click cycles velocity. DUP ×2
        doubles the current phrase up to 64 steps. Probability is deterministic
        per lane cycle; ratchets and flams stay inside the transport grid. Lane
        −/+ controls establish independent loop lengths for polymetric playback.
        Cmd/Ctrl-Z handles history.
      </p>
    </section>
  );
}
