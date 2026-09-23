import { useMemo, useState } from "react";
import { useDrumEngineSnapshot } from "../../audio/useDrumEngine";
import { useTransportSnapshot } from "../../audio/useTransport";
import { useArrangementSnapshot } from "../../arrange/useArrangement";
import {
  generateMasterPlan,
} from "../../generation/masteringEngine";
import {
  MASTERING_LIMITS,
  type MasterPresetId,
  type MasteringState,
} from "../../master/masteringModel";
import { masteringStore } from "../../master/MasteringStore";
import { useMasteringSnapshot } from "../../master/useMastering";
import { ticksPerBeat } from "../../audio/transportMath";
import {
  renderStore,
} from "../../render/RenderStore";
import { useRenderTaskSnapshot } from "../../render/useRenderTask";
import type {
  RenderOptions,
  RenderSnapshotRequest,
  RenderTailMode,
} from "../../render/renderTypes";
import {
  triggerBlobDownload,
  type WavBitDepth,
} from "../../render/wavEncoder";
import {
  MachineButton,
  SignalRail,
} from "../pulse/Primitives";
import {
  TransportPulseSpine,
  TransportStatusLabel,
} from "../transport/TransportUI";

const PRESETS: ReadonlyArray<{
  id: MasterPresetId;
  code: string;
  label: string;
}> = [
  { id: "clean", code: "CLN", label: "Clean" },
  { id: "punchy", code: "PNC", label: "Punchy" },
  { id: "dynamic", code: "DYN", label: "Dynamic" },
  { id: "loud", code: "LD", label: "Loud" },
];

type ExportRange = "pattern" | "arrangement" | "section" | "custom";
type ExportMasterMode = "premaster" | "master";

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function normalize(value: number, min: number, max: number): number {
  return ((clamp(value, min, max) - min) / (max - min)) * 100;
}

function denormalize(value: number, min: number, max: number): number {
  return min + (clamp(value, 0, 100) / 100) * (max - min);
}

function signed(value: number, digits = 1): string {
  const output = value.toFixed(digits);
  return value > 0 ? "+" + output : output;
}

function MasterControl({
  label,
  value,
  stateKey,
  min,
  max,
  suffix,
  disabled,
}: {
  label: string;
  value: number;
  stateKey: Exclude<keyof MasteringState, "enabled">;
  min: number;
  max: number;
  suffix: string;
  disabled: boolean;
}) {
  return (
    <label className="master-control">
      <span>{label}</span>
      <input
        type="range"
        min="0"
        max="100"
        value={normalize(value, min, max)}
        disabled={disabled}
        onChange={(event) =>
          masteringStore.setValue(
            stateKey,
            denormalize(
              Number(event.currentTarget.value),
              min,
              max,
            ),
          )
        }
        aria-label={label}
      />
      <b>
        {suffix === "%"
          ? Math.round(value * 100) + "%"
          : signed(value) + suffix}
      </b>
    </label>
  );
}

export function MasterExportSurface() {
  const mastering = useMasteringSnapshot();
  const renderTask = useRenderTaskSnapshot();
  const engine = useDrumEngineSnapshot();
  const arrangement = useArrangementSnapshot();
  const transport = useTransportSnapshot();

  const [preset, setPreset] = useState<MasterPresetId>("clean");
  const [masterAmount, setMasterAmount] = useState(72);
  const [range, setRange] = useState<ExportRange>(
    arrangement.blueprint ? "arrangement" : "pattern",
  );
  const [sectionId, setSectionId] = useState(
    arrangement.selectedSectionId ??
      arrangement.blueprint?.sections[0]?.id ??
      "",
  );
  const [startBar, setStartBar] = useState(1);
  const [endBar, setEndBar] = useState(4);
  const [masterMode, setMasterMode] =
    useState<ExportMasterMode>("master");
  const [sampleRate, setSampleRate] =
    useState<44_100 | 48_000>(48_000);
  const [bitDepth, setBitDepth] = useState<WavBitDepth>(24);
  const [dither, setDither] = useState(true);
  const [tailMode, setTailMode] =
    useState<RenderTailMode>("auto");
  const [fixedTailSeconds, setFixedTailSeconds] = useState(2);
  const [status, setStatus] = useState(
    "MASTER / EXPORT READY",
  );

  const previewLocked = Boolean(mastering.preview);
  const displayState =
    mastering.previewActive && mastering.preview
      ? mastering.preview.state
      : mastering.state;

  const busy =
    renderTask.status === "preparing" ||
    renderTask.status === "rendering" ||
    renderTask.status === "encoding" ||
    renderTask.status === "packaging";

  const barTicks = useMemo(
    () =>
      ticksPerBeat(transport.meter) *
      Math.max(1, transport.meter.numerator),
    [transport.meter],
  );
  const arrangementBars = Math.max(
    1,
    Math.ceil(arrangement.totalTicks / Math.max(1, barTicks)),
  );

  const generateMaster = () => {
    masteringStore.setPreview(
      generateMasterPlan({
        current: mastering.state,
        preset,
        intensity: masterAmount / 100,
      }),
    );
    setStatus("MASTER CANDIDATE READY / B IS LEVEL MATCHED");
  };

  const rangeRequest = (): RenderSnapshotRequest => {
    if (range === "pattern") {
      return { kind: "pattern" };
    }

    if (range === "arrangement") {
      return { kind: "arrangement" };
    }

    if (range === "section") {
      return {
        kind: "section",
        sectionId:
          sectionId ||
          arrangement.selectedSectionId ||
          arrangement.blueprint?.sections[0]?.id,
      };
    }

    const safeStart = Math.max(1, Math.min(arrangementBars, startBar));
    const safeEnd = Math.max(
      safeStart,
      Math.min(arrangementBars, endBar),
    );

    return {
      kind: "custom",
      startTick: (safeStart - 1) * barTicks,
      endTick: Math.min(
        arrangement.totalTicks,
        safeEnd * barTicks,
      ),
    };
  };

  const renderOptions = (
    includeMastering: boolean,
  ): RenderOptions => ({
    sampleRate,
    includeMastering,
    tailMode,
    fixedTailSeconds:
      tailMode === "fixed" ? fixedTailSeconds : undefined,
  });

  const exportName = () => {
    const rangeLabel =
      range === "pattern"
        ? "Pattern"
        : range === "section"
          ? arrangement.blueprint?.sections.find(
              (entry) => entry.id === sectionId,
            )?.label ?? "Section"
          : range === "custom"
            ? "Bars " + startBar + "-" + endBar
            : arrangement.blueprint?.name ?? "Arrangement";

    return (
      "Synth - " +
      rangeLabel +
      " - " +
      (masterMode === "master" ? "Master" : "Pre-Master")
    );
  };

  const runWav = async () => {
    if (previewLocked) return;

    const artifact = await renderStore.renderWav({
      range: rangeRequest(),
      render: renderOptions(masterMode === "master"),
      wav: {
        bitDepth,
        dither: bitDepth === "32f" ? false : dither,
      },
      filename: exportName(),
    });

    if (!artifact) return;
    triggerBlobDownload(artifact.blob, artifact.filename);
    setStatus("WAV EXPORTED / " + artifact.filename);
  };

  const runLoop = async () => {
    if (previewLocked) return;

    const artifact = await renderStore.renderWav({
      range: { kind: "pattern" },
      render: {
        sampleRate,
        includeMastering: masterMode === "master",
        tailMode: "none",
      },
      wav: {
        bitDepth,
        dither: bitDepth === "32f" ? false : dither,
      },
      filename:
        "Synth - Pattern Loop - " +
        (masterMode === "master" ? "Master" : "Pre-Master"),
    });

    if (!artifact) return;
    triggerBlobDownload(artifact.blob, artifact.filename);
    setStatus("LOOP EXPORTED / EXACT PATTERN LENGTH");
  };

  const runStems = async () => {
    if (previewLocked) return;

    const artifact = await renderStore.renderStems({
      range: rangeRequest(),
      render: {
        sampleRate,
        tailMode,
        fixedTailSeconds:
          tailMode === "fixed" ? fixedTailSeconds : undefined,
      },
      wav: {
        bitDepth,
        dither: bitDepth === "32f" ? false : dither,
      },
      filename:
        "Synth - " +
        (range === "arrangement"
          ? "Arrangement"
          : range === "section"
            ? "Section"
            : range === "custom"
              ? "Custom Range"
              : "Pattern"),
    });

    if (!artifact) return;
    triggerBlobDownload(artifact.blob, artifact.filename);
    setStatus("STEMS EXPORTED / PRE-MASTER ZIP");
  };

  const analysis = renderTask.lastAnalysis;

  return (
    <section
      className="master-export-surface"
      aria-labelledby="master-export-title"
    >
      <div className="surface-heading">
        <div>
          <p className="eyebrow">07 / MASTER + EXPORT</p>
          <h1 id="master-export-title">Finish the signal.</h1>
        </div>
        <TransportStatusLabel />
      </div>

      <TransportPulseSpine />

      <section className="master-panel">
        <div className="machine-section-label">
          <span>MASTER / FINAL OUTPUT</span>
          <span>
            {mastering.preview
              ? mastering.previewActive
                ? "B / LEVEL-MATCHED MASTER"
                : "A / ORIGINAL"
              : displayState.enabled
                ? "MASTER ACTIVE"
                : "MASTER BYPASSED"}
          </span>
        </div>

        <div className="master-preset-row">
          {PRESETS.map((entry) => (
            <button
              type="button"
              key={entry.id}
              className={preset === entry.id ? "is-active" : undefined}
              onClick={() => setPreset(entry.id)}
              aria-pressed={preset === entry.id}
            >
              <span>{entry.code}</span>
              <strong>{entry.label}</strong>
            </button>
          ))}

          <SignalRail
            label="MASTER AMOUNT"
            value={masterAmount}
            minLabel="SUBTLE"
            maxLabel="FULL"
            tone="heat"
            onChange={setMasterAmount}
          />

          <MachineButton onClick={generateMaster}>
            QUICK MASTER
          </MachineButton>
        </div>

        <div className="master-ab-row">
          <MachineButton
            compact
            disabled={!mastering.preview}
            active={Boolean(mastering.preview && !mastering.previewActive)}
            onClick={() => masteringStore.setPreviewActive(false)}
          >
            A / ORIGINAL
          </MachineButton>
          <MachineButton
            compact
            disabled={!mastering.preview}
            active={mastering.previewActive}
            onClick={() => masteringStore.setPreviewActive(true)}
          >
            B / MASTERED
          </MachineButton>
          <MachineButton
            compact
            disabled={!mastering.preview}
            onClick={() => {
              masteringStore.commitPreview();
              setStatus("MASTER COMMITTED");
            }}
          >
            COMMIT MASTER
          </MachineButton>
          <MachineButton
            compact
            disabled={!mastering.preview}
            onClick={() => masteringStore.clearPreview()}
          >
            CANCEL
          </MachineButton>
          <MachineButton
            compact
            active={displayState.enabled}
            disabled={previewLocked}
            onClick={() =>
              masteringStore.setEnabled(!mastering.state.enabled)
            }
          >
            {displayState.enabled ? "MASTER ON" : "BYPASS"}
          </MachineButton>
        </div>

        {mastering.preview ? (
          <div className="master-preview-summary">
            <span>
              {mastering.preview.preset.toUpperCase()}
              {" · "}
              {Math.round(mastering.preview.intensity * 100)}
              {"%"}
            </span>
            <strong>
              A/B MATCH{" "}
              {signed(mastering.preview.previewLevelMatchDb)} dB
            </strong>
            {mastering.preview.warnings.length > 0 ? (
              <ul>
                {mastering.preview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : (
              <small>NO MASTER WARNINGS</small>
            )}
          </div>
        ) : null}

        <div className="master-console">
          <div className="master-meter">
            <i
              style={{
                height: Math.round(engine.masterLevel * 100) + "%",
              }}
            />
            <span>OUT</span>
          </div>

          <div className="master-controls">
            <MasterControl
              label="INPUT"
              value={displayState.inputTrimDb}
              stateKey="inputTrimDb"
              min={MASTERING_LIMITS.inputTrimDb[0]}
              max={MASTERING_LIMITS.inputTrimDb[1]}
              suffix=" dB"
              disabled={previewLocked}
            />
            <MasterControl
              label="LOW"
              value={displayState.lowDb}
              stateKey="lowDb"
              min={MASTERING_LIMITS.eqDb[0]}
              max={MASTERING_LIMITS.eqDb[1]}
              suffix=" dB"
              disabled={previewLocked}
            />
            <MasterControl
              label="HIGH"
              value={displayState.highDb}
              stateKey="highDb"
              min={MASTERING_LIMITS.eqDb[0]}
              max={MASTERING_LIMITS.eqDb[1]}
              suffix=" dB"
              disabled={previewLocked}
            />
            <MasterControl
              label="GLUE"
              value={displayState.glue}
              stateKey="glue"
              min={0}
              max={1}
              suffix="%"
              disabled={previewLocked}
            />
            <MasterControl
              label="WIDTH"
              value={displayState.width}
              stateKey="width"
              min={MASTERING_LIMITS.width[0]}
              max={MASTERING_LIMITS.width[1]}
              suffix="×"
              disabled={previewLocked}
            />
            <MasterControl
              label="OUTPUT"
              value={displayState.outputGainDb}
              stateKey="outputGainDb"
              min={MASTERING_LIMITS.outputGainDb[0]}
              max={MASTERING_LIMITS.outputGainDb[1]}
              suffix=" dB"
              disabled={previewLocked}
            />
            <MasterControl
              label="CEILING"
              value={displayState.ceilingDb}
              stateKey="ceilingDb"
              min={MASTERING_LIMITS.ceilingDb[0]}
              max={MASTERING_LIMITS.ceilingDb[1]}
              suffix=" dB"
              disabled={previewLocked}
            />
          </div>

          <div className="master-history">
            <MachineButton
              compact
              disabled={previewLocked || !mastering.canUndo}
              onClick={() => masteringStore.undo()}
            >
              UNDO
            </MachineButton>
            <MachineButton
              compact
              disabled={previewLocked || !mastering.canRedo}
              onClick={() => masteringStore.redo()}
            >
              REDO
            </MachineButton>
            <MachineButton
              compact
              disabled={previewLocked}
              onClick={() => masteringStore.reset()}
            >
              RESET
            </MachineButton>
          </div>
        </div>
      </section>

      <section className="export-panel">
        <div className="machine-section-label">
          <span>EXPORT / OFFLINE RENDER</span>
          <span>{renderTask.phaseLabel}</span>
        </div>

        <div className="export-grid">
          <div className="export-group">
            <span>RANGE</span>
            <select
              value={range}
              disabled={busy}
              onChange={(event) =>
                setRange(event.currentTarget.value as ExportRange)
              }
            >
              <option value="pattern">Current Pattern</option>
              {arrangement.blueprint ? (
                <>
                  <option value="arrangement">Full Arrangement</option>
                  <option value="section">Selected Section</option>
                  <option value="custom">Custom Bars</option>
                </>
              ) : null}
            </select>

            {range === "section" && arrangement.blueprint ? (
              <select
                value={sectionId}
                disabled={busy}
                onChange={(event) =>
                  setSectionId(event.currentTarget.value)
                }
                aria-label="Export section"
              >
                {arrangement.blueprint.sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.label}
                  </option>
                ))}
              </select>
            ) : null}

            {range === "custom" ? (
              <div className="export-bar-range">
                <label>
                  <span>FROM BAR</span>
                  <input
                    type="number"
                    min="1"
                    max={arrangementBars}
                    value={startBar}
                    disabled={busy}
                    onChange={(event) =>
                      setStartBar(Number(event.currentTarget.value))
                    }
                  />
                </label>
                <label>
                  <span>TO BAR</span>
                  <input
                    type="number"
                    min="1"
                    max={arrangementBars}
                    value={endBar}
                    disabled={busy}
                    onChange={(event) =>
                      setEndBar(Number(event.currentTarget.value))
                    }
                  />
                </label>
              </div>
            ) : null}
          </div>

          <div className="export-group">
            <span>OUTPUT</span>
            <div className="export-toggle-row">
              <button
                type="button"
                className={masterMode === "premaster" ? "is-active" : undefined}
                disabled={busy}
                onClick={() => setMasterMode("premaster")}
              >
                PRE-MASTER
              </button>
              <button
                type="button"
                className={masterMode === "master" ? "is-active" : undefined}
                disabled={busy}
                onClick={() => setMasterMode("master")}
              >
                FINAL MASTER
              </button>
            </div>

            <select
              value={sampleRate}
              disabled={busy}
              onChange={(event) =>
                setSampleRate(
                  Number(event.currentTarget.value) as 44_100 | 48_000,
                )
              }
            >
              <option value={44100}>44.1 kHz</option>
              <option value={48000}>48 kHz</option>
            </select>

            <select
              value={String(bitDepth)}
              disabled={busy}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setBitDepth(
                  value === "32f"
                    ? "32f"
                    : (Number(value) as 16 | 24),
                );
              }}
            >
              <option value="16">16-bit PCM</option>
              <option value="24">24-bit PCM</option>
              <option value="32f">32-bit Float</option>
            </select>

            <label className="export-check">
              <input
                type="checkbox"
                checked={dither && bitDepth !== "32f"}
                disabled={busy || bitDepth === "32f"}
                onChange={(event) =>
                  setDither(event.currentTarget.checked)
                }
              />
              <span>TPDF DITHER</span>
            </label>
          </div>

          <div className="export-group">
            <span>TAIL</span>
            <div className="export-toggle-row">
              {(["none", "auto", "fixed"] as const).map((mode) => (
                <button
                  type="button"
                  key={mode}
                  className={tailMode === mode ? "is-active" : undefined}
                  disabled={busy}
                  onClick={() => setTailMode(mode)}
                >
                  {mode.toUpperCase()}
                </button>
              ))}
            </div>

            {tailMode === "fixed" ? (
              <label>
                <span>SECONDS</span>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  value={fixedTailSeconds}
                  disabled={busy}
                  onChange={(event) =>
                    setFixedTailSeconds(
                      Math.max(
                        0,
                        Math.min(
                          10,
                          Number(event.currentTarget.value),
                        ),
                      ),
                    )
                  }
                />
              </label>
            ) : null}

            <p>
              Pattern + no tail creates an exact loop render. Auto tail is
              bounded and captures room/sample decay.
            </p>
          </div>
        </div>

        {previewLocked ? (
          <p className="export-warning">
            Commit or cancel the Master preview before rendering. Export uses
            committed production state only.
          </p>
        ) : null}

        {renderTask.lastError ? (
          <p className="export-error" aria-live="polite">
            {renderTask.lastError}
          </p>
        ) : null}

        <div className="export-actions">
          <MachineButton
            disabled={busy || previewLocked}
            onClick={() => void runWav()}
          >
            EXPORT WAV
          </MachineButton>
          <MachineButton
            disabled={busy || previewLocked}
            onClick={() => void runLoop()}
          >
            EXPORT LOOP
          </MachineButton>
          <MachineButton
            disabled={busy || previewLocked}
            onClick={() => void runStems()}
          >
            EXPORT STEMS
          </MachineButton>
          <MachineButton
            compact
            disabled={!busy}
            onClick={() => renderStore.cancel()}
          >
            CANCEL TASK
          </MachineButton>
        </div>

        {renderTask.totalStems > 0 ? (
          <div className="export-stem-progress">
            <span>
              STEMS {renderTask.completedStems}/{renderTask.totalStems}
            </span>
            <i
              style={{
                width:
                  (renderTask.completedStems /
                    Math.max(1, renderTask.totalStems)) *
                    100 +
                  "%",
              }}
            />
          </div>
        ) : null}

        {analysis ? (
          <div className="export-analysis">
            <div>
              <span>DURATION</span>
              <strong>{analysis.durationSeconds.toFixed(2)}s</strong>
            </div>
            <div>
              <span>PEAK</span>
              <strong>
                {analysis.peak <= 0
                  ? "-∞"
                  : (20 * Math.log10(analysis.peak)).toFixed(1) + " dBFS"}
              </strong>
            </div>
            <div>
              <span>RMS</span>
              <strong>
                {analysis.rms <= 0
                  ? "-∞"
                  : (20 * Math.log10(analysis.rms)).toFixed(1) + " dBFS"}
              </strong>
            </div>
            <div>
              <span>EST. LUFS</span>
              <strong>{analysis.estimatedLufs.toFixed(1)}</strong>
            </div>
            <div>
              <span>CLIPPED</span>
              <strong>{analysis.clippedSampleCount}</strong>
            </div>
          </div>
        ) : null}
      </section>

      <p className="master-export-status" aria-live="polite">
        {busy ? renderTask.phaseLabel : status}
      </p>
    </section>
  );
}
