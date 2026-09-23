import type { ChangeEvent } from "react";
import {
  audioTransport,
  TRANSPORT_SCHEDULER_CONFIG,
  type TransportStatus,
} from "../../audio/AudioTransport";
import {
  useTransportLifecycle,
  useTransportSnapshot,
} from "../../audio/useTransport";
import { PPQ, type Meter } from "../../domain/contracts";
import {
  arrangementPlaybackStore,
} from "../../arrange/ArrangementPlaybackStore";
import {
  useArrangementPlaybackSnapshot,
  useArrangementSnapshot,
} from "../../arrange/useArrangement";
import type { ModeDefinition } from "../pulse/Primitives";
import { PulseSpine } from "../pulse/Primitives";

const METERS: Meter[] = [
  { numerator: 3, denominator: 4 },
  { numerator: 4, denominator: 4 },
  { numerator: 5, denominator: 4 },
  { numerator: 6, denominator: 8 },
  { numerator: 7, denominator: 8 },
  { numerator: 9, denominator: 8 },
  { numerator: 12, denominator: 8 },
];

const LOOP_BAR_OPTIONS = [1, 2, 4, 8, 16];

function statusLabel(status: TransportStatus): string {
  switch (status) {
    case "running":
      return "RUN";
    case "paused":
      return "PAUSE";
    case "suspended":
      return "SUSP";
    case "error":
      return "ERROR";
    default:
      return "READY";
  }
}

const toggleArrangeFromKeyboard = () => {
  void arrangementPlaybackStore.toggle();
};

export function TransportLifecycle({
  mode,
}: {
  mode: ModeDefinition;
}): null {
  const arrangementPlayback = useArrangementPlaybackSnapshot();
  const arrangement = useArrangementSnapshot();
  const arrangementTransport =
    mode.id === "arrange" ||
    ((mode.id === "mix" || mode.id === "archive") &&
      Boolean(arrangement.blueprint)) ||
    (mode.id === "live" && arrangementPlayback.engaged);

  useTransportLifecycle(
    arrangementTransport
      ? toggleArrangeFromKeyboard
      : undefined,
  );
  return null;
}

export function TransportControls({ mode }: { mode: ModeDefinition }) {
  const snapshot = useTransportSnapshot();
  const arrangementPlayback = useArrangementPlaybackSnapshot();
  const arrangement = useArrangementSnapshot();
  const arrangeMode = mode.id === "arrange";
  const productionArrangementMode =
    (mode.id === "mix" || mode.id === "archive") &&
    Boolean(arrangement.blueprint);
  const arrangementTransport =
    arrangeMode ||
    productionArrangementMode ||
    (mode.id === "live" && arrangementPlayback.engaged);
  const transportPlaying = arrangementTransport
    ? arrangementPlayback.engaged && snapshot.status === "running"
    : snapshot.desiredPlaying;
  const meterValue = `${snapshot.meter.numerator}/${snapshot.meter.denominator}`;

  const changeMeter = (event: ChangeEvent<HTMLSelectElement>) => {
    const [numerator, denominator] = event.currentTarget.value
      .split("/")
      .map(Number);

    audioTransport.setMeter({ numerator, denominator });
  };

  const cycleLoopBars = () => {
    const index = LOOP_BAR_OPTIONS.indexOf(snapshot.loopBars);
    const next = LOOP_BAR_OPTIONS[(index + 1) % LOOP_BAR_OPTIONS.length];
    audioTransport.setLoopBars(next);
  };

  return (
    <div
      className={"transport-readout transport-console transport-console--" + snapshot.status}
      aria-label="Web Audio transport"
    >
      <button
        type="button"
        className={transportPlaying ? "transport-key is-playing" : "transport-key"}
        onClick={() =>
          arrangementTransport
            ? void arrangementPlaybackStore.toggle()
            : void audioTransport.toggle()
        }
        aria-label={transportPlaying ? "Pause transport" : "Start transport"}
        title="Play/Pause · Space"
      >
        <span aria-hidden="true">{transportPlaying ? "Ⅱ" : "▶"}</span>
      </button>

      <button
        type="button"
        className="transport-key"
        onClick={() =>
          arrangementTransport
            ? arrangementPlaybackStore.stop()
            : audioTransport.stop()
        }
        aria-label="Stop and return to loop start"
        title="Stop"
      >
        <span aria-hidden="true">■</span>
      </button>

      <label className="transport-console__tempo">
        <span>BPM</span>
        <input
          type="number"
          min="30"
          max="300"
          step="0.1"
          value={snapshot.bpm}
          onChange={(event) =>
            audioTransport.setBpm(Number(event.currentTarget.value))
          }
          aria-label="Tempo in beats per minute"
        />
      </label>

      <label className="transport-console__meter">
        <span>METER</span>
        <select value={meterValue} onChange={changeMeter} aria-label="Time signature">
          {METERS.map((meter) => {
            const value = `${meter.numerator}/${meter.denominator}`;
            return (
              <option key={value} value={value}>
                {value}
              </option>
            );
          })}
        </select>
      </label>

      <button
        type="button"
        className="transport-console__loop"
        onClick={arrangementTransport ? undefined : cycleLoopBars}
        disabled={arrangementTransport}
        aria-label={
          arrangementTransport
            ? "Arrangement playback does not use transport loop bars."
            : `Loop length ${snapshot.loopBars} bars. Activate to cycle loop length.`
        }
      >
        <span>{arrangementTransport ? "ARR" : "LOOP"}</span>
        <b>{arrangementTransport ? "FULL" : snapshot.loopBars + "B"}</b>
      </button>

      <output
        className="transport-console__position"
        aria-label={"Transport position " + snapshot.positionLabel}
      >
        <span>BAR:BEAT:TICK</span>
        <b>
          {arrangementTransport && arrangementPlayback.engaged
            ? "A:" +
              String(
                Math.floor(arrangementPlayback.playheadTick / PPQ) + 1,
              ).padStart(3, "0")
            : snapshot.positionLabel}
        </b>
      </output>

      <span
        className={"transport-console__clock transport-console__clock--" + snapshot.status}
        title={
          snapshot.lastError ??
          `Scheduler ${TRANSPORT_SCHEDULER_CONFIG.intervalMs}ms / ${Math.round(
            TRANSPORT_SCHEDULER_CONFIG.aheadSeconds * 1000,
          )}ms ahead`
        }
        aria-live="polite"
      >
        <i className="status-lamp" aria-hidden="true" />
        <b>{statusLabel(snapshot.status)}</b>
      </span>

      <span className="transport-readout__mode">
        {mode.number} / {mode.label}
      </span>
    </div>
  );
}

export function TransportPulseSpine() {
  const snapshot = useTransportSnapshot();

  return (
    <div className="transport-spine-shell">
      <PulseSpine
        active={snapshot.status === "running"}
        density={snapshot.position.loopProgress * 100}
      />
      <div className="transport-spine-meta" aria-live="off">
        <span>
          BAR {String(snapshot.position.barIndex + 1).padStart(2, "0")} /
          {String(snapshot.loopBars).padStart(2, "0")}
        </span>
        <span>
          BEAT {String(snapshot.position.beatIndex + 1).padStart(2, "0")} /
          {String(snapshot.meter.numerator).padStart(2, "0")}
        </span>
        <span>{snapshot.contextState.toUpperCase()}</span>
      </div>
    </div>
  );
}

export function TransportStatusLabel() {
  const snapshot = useTransportSnapshot();
  const status =
    snapshot.status === "running"
      ? "CLOCK RUNNING / GENERATOR READY"
      : snapshot.status === "suspended"
        ? "CLOCK SUSPENDED / TAP PLAY"
        : snapshot.status === "error"
          ? "AUDIO ERROR / CHECK TRANSPORT"
          : "CLOCK READY / GENERATOR READY";

  return (
    <div
      className={"surface-heading__status transport-status transport-status--" + snapshot.status}
      title={snapshot.lastError}
    >
      <span className="status-lamp" aria-hidden="true" />
      <span>{status}</span>
    </div>
  );
}
