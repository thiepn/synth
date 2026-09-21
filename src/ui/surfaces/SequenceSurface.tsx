import {
  type CSSProperties,
  useEffect,
  useMemo,
  useState,
} from "react";
import { TRANSPORT_SCHEDULER_CONFIG } from "../../audio/AudioTransport";
import { drumEngine } from "../../audio/DrumEngine";
import { useTransportSnapshot } from "../../audio/useTransport";
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
import {
  MachineButton,
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

function stepVelocity(
  pattern: ReturnType<typeof sequencerStore.getSnapshot>["pattern"],
  laneId: string,
  stepIndex: number,
): number | undefined {
  const lane = pattern.lanes.find((entry) => entry.id === laneId);
  if (!lane) return undefined;
  const tick = stepIndex * TRANSPORT_SCHEDULER_CONFIG.pulseTicks;
  return lane.events.find((event) => event.tick === tick)?.velocity;
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
  const selectedVelocity = stepVelocity(
    sequencer.pattern,
    selection.laneId,
    selection.stepIndex,
  );
  const selectedOn = selectedVelocity !== undefined;

  const activeStep =
    transport.status === "running"
      ? Math.floor(
          transport.position.absoluteTick /
            TRANSPORT_SCHEDULER_CONFIG.pulseTicks,
        ) % sequencer.lengthSteps
      : undefined;

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

      <div className="rhythm-matrix-shell">
        <div
          className="rhythm-matrix"
          style={{
            "--matrix-steps": sequencer.lengthSteps,
          } as CSSProperties}
        >
          <div className="rhythm-matrix__corner">
            <span>LANE</span>
            <span>M / S</span>
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
            const suppressed =
              sequencer.soloLaneCount > 0 && !solo;

            return (
              <div
                className={[
                  "rhythm-matrix__row",
                  muted ? "is-muted" : "",
                  solo ? "is-solo" : "",
                  suppressed ? "is-suppressed" : "",
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
                  </div>
                </div>

                <div className="rhythm-matrix__steps">
                  {beatColumns.map(({ index, major }) => {
                    const velocity = stepVelocity(
                      sequencer.pattern,
                      definition.id,
                      index,
                    );
                    const isOn = velocity !== undefined;
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
                          activeStep === index ? "is-current" : "",
                          major ? "is-major" : "",
                        ].join(" ")}
                        style={{
                          "--step-velocity": velocity ?? 0,
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
                              Math.round((velocity ?? 0) * 100)
                            : ", off")
                        }
                      >
                        <span className="sequence-step__rail" aria-hidden="true" />
                        <span className="sequence-step__hit" aria-hidden="true" />
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
          <span>{selectedOn ? "ACTIVE" : "EMPTY"}</span>
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
      </div>

      <p className="sequence-hint">
        Empty step: click to add. Active step: first click selects, click the
        selected step again to remove. Shift-click cycles velocity. DUP ×2
        repeats the current phrase into the next half; at 16 steps it copies
        steps 1–8 over 9–16. Cmd/Ctrl-Z handles history. Mute and solo affect
        playback immediately.
      </p>
    </section>
  );
}
