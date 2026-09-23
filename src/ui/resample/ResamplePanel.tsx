import { useMemo, useState } from "react";
import { ticksPerBeat } from "../../audio/transportMath";
import { useTransportSnapshot } from "../../audio/useTransport";
import { useArrangementSnapshot } from "../../arrange/useArrangement";
import {
  DRUM_PADS,
  type DrumVoiceId,
} from "../../music/foundationPattern";
import { freezeStore } from "../../resample/FreezeStore";
import { useFreezeSnapshot } from "../../resample/useFreeze";
import {
  resampleStore,
  type ResampleArtifactKind,
} from "../../resample/ResampleStore";
import { useResampleSnapshot } from "../../resample/useResample";
import type {
  RenderSnapshotRequest,
  RenderTailMode,
} from "../../render/renderTypes";
import { MachineButton } from "../pulse/Primitives";

type ResampleRange =
  | "pattern"
  | "arrangement"
  | "section"
  | "selection";

type ResampleStage = "premaster" | "master";

function seconds(value: number): string {
  return value.toFixed(value < 10 ? 2 : 1) + "s";
}

function db(value: number): string {
  if (value <= 0.000001) return "-∞";
  return (20 * Math.log10(value)).toFixed(1) + "dB";
}

export function ResamplePanel() {
  const resample = useResampleSnapshot();
  const freeze = useFreezeSnapshot();
  const arrangement = useArrangementSnapshot();
  const transport = useTransportSnapshot();

  const [range, setRange] = useState<ResampleRange>("pattern");
  const [sectionId, setSectionId] = useState(
    arrangement.selectedSectionId ??
      arrangement.blueprint?.sections[0]?.id ??
      "",
  );
  const [startBar, setStartBar] = useState(1);
  const [endBar, setEndBar] = useState(4);
  const [stage, setStage] = useState<ResampleStage>("premaster");
  const [tailMode, setTailMode] =
    useState<RenderTailMode>("auto");
  const [fixedTailSeconds, setFixedTailSeconds] = useState(2);
  const [voice, setVoice] = useState<DrumVoiceId>("kick");
  const [openInLab, setOpenInLab] = useState(true);
  const [status, setStatus] = useState(
    "RENDER COPY PRESERVES THE EDITABLE SOURCE",
  );

  const busy =
    resample.status === "rendering" ||
    resample.status === "freezing" ||
    resample.status === "flattening";

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

  const rangeRequest = (): RenderSnapshotRequest => {
    if (range === "pattern") return { kind: "pattern" };
    if (range === "arrangement") return { kind: "arrangement" };
    if (range === "section") {
      return {
        kind: "section",
        sectionId:
          sectionId ||
          arrangement.selectedSectionId ||
          arrangement.blueprint?.sections[0]?.id,
      };
    }

    const from = Math.max(
      1,
      Math.min(arrangementBars, Math.round(startBar)),
    );
    const to = Math.max(
      from,
      Math.min(arrangementBars, Math.round(endBar)),
    );

    return {
      kind: "custom",
      startTick: (from - 1) * barTicks,
      endTick: Math.min(arrangement.totalTicks, to * barTicks),
    };
  };

  const rangeLabel = (): string => {
    if (range === "pattern") return "Pattern";
    if (range === "arrangement") return "Arrangement";
    if (range === "section") {
      return (
        arrangement.blueprint?.sections.find(
          (entry) => entry.id === sectionId,
        )?.label ?? "Section"
      );
    }
    return "Bars " + startBar + "–" + endBar;
  };

  const renderCopy = async (
    kindOverride?: ResampleArtifactKind,
    voiceOverride?: DrumVoiceId,
    masterOverride?: boolean,
    tailOverride?: RenderTailMode,
  ) => {
    const selectedVoice = voiceOverride;
    const includeMastering =
      masterOverride ?? stage === "master";
    const kind: ResampleArtifactKind =
      kindOverride ??
      (selectedVoice
        ? "track"
        : includeMastering
          ? "master"
          : tailMode !== "none"
            ? "fx"
            : range === "section"
              ? "section"
              : range === "selection"
                ? "selection"
                : "pattern");
    const label =
      "Resample " +
      rangeLabel() +
      (selectedVoice ? " - " + selectedVoice : "") +
      (includeMastering ? " - Master" : " - Pre-Master");

    const artifact = await resampleStore.renderCopy({
      range: rangeRequest(),
      kind,
      label,
      voice: selectedVoice,
      includeMastering,
      tailMode: tailOverride ?? tailMode,
      fixedTailSeconds:
        (tailOverride ?? tailMode) === "fixed"
          ? fixedTailSeconds
          : undefined,
      openInSampleLab: openInLab,
    });

    if (artifact) {
      setStatus(
        artifact.label +
          " READY / " +
          seconds(artifact.durationSeconds),
      );
    }
  };

  const freezePattern = async () => {
    const ok = await resampleStore.freezePattern();
    if (ok) {
      setStatus(
        "PATTERN FROZEN / SOURCE REMAINS EDITABLE / MASTERING STAYS LIVE",
      );
    }
  };

  const flatten = async (
    mode: "flatten" | "replace",
  ) => {
    const artifact = await resampleStore.flattenPattern(mode);
    if (artifact) {
      setStatus(
        (mode === "flatten" ? "FLATTENED" : "REPLACED") +
          " / RECOVERY SNAPSHOT AVAILABLE",
      );
    }
  };

  return (
    <section className="resample-panel" aria-labelledby="resample-title">
      <div className="machine-section-label">
        <span id="resample-title">
          RESAMPLE / BOUNCE / FREEZE
        </span>
        <span>{resample.phaseLabel}</span>
      </div>

      <div className="resample-principles">
        <div>
          <span>RENDER COPY</span>
          <strong>NEW ASSET · SOURCE UNCHANGED</strong>
        </div>
        <div>
          <span>FREEZE</span>
          <strong>REVERSIBLE CPU CACHE</strong>
        </div>
        <div>
          <span>FLATTEN</span>
          <strong>AUDIO BECOMES PATTERN SOURCE</strong>
        </div>
        <div>
          <span>REPLACE</span>
          <strong>EXPLICIT AUDIO REPLACEMENT + RECOVERY</strong>
        </div>
      </div>

      <div className="resample-grid">
        <div className="resample-source">
          <div className="resample-subhead">
            <span>RENDER SOURCE</span>
            <strong>{range.toUpperCase()}</strong>
          </div>

          <label>
            <span>RANGE</span>
            <select
              value={range}
              disabled={busy}
              onChange={(event) =>
                setRange(event.currentTarget.value as ResampleRange)
              }
            >
              <option value="pattern">Current Pattern</option>
              {arrangement.blueprint ? (
                <>
                  <option value="arrangement">Full Arrangement</option>
                  <option value="section">Section</option>
                  <option value="selection">Custom Bars</option>
                </>
              ) : null}
            </select>
          </label>

          {range === "section" && arrangement.blueprint ? (
            <label>
              <span>SECTION</span>
              <select
                value={sectionId}
                disabled={busy}
                onChange={(event) =>
                  setSectionId(event.currentTarget.value)
                }
              >
                {arrangement.blueprint.sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {range === "selection" ? (
            <div className="resample-bar-range">
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

          <label>
            <span>STAGE</span>
            <select
              value={stage}
              disabled={busy}
              onChange={(event) =>
                setStage(event.currentTarget.value as ResampleStage)
              }
            >
              <option value="premaster">Pre-Master</option>
              <option value="master">Final Master</option>
            </select>
          </label>

          <label>
            <span>TAIL</span>
            <select
              value={tailMode}
              disabled={busy}
              onChange={(event) =>
                setTailMode(
                  event.currentTarget.value as RenderTailMode,
                )
              }
            >
              <option value="none">None / exact range</option>
              <option value="auto">Auto</option>
              <option value="fixed">Fixed</option>
            </select>
          </label>

          {tailMode === "fixed" ? (
            <label>
              <span>TAIL SEC</span>
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

          <label className="resample-check">
            <input
              type="checkbox"
              checked={openInLab}
              disabled={busy}
              onChange={(event) =>
                setOpenInLab(event.currentTarget.checked)
              }
            />
            <span>OPEN RESULT IN SAMPLE LAB</span>
          </label>

          <MachineButton
            disabled={busy}
            onClick={() => void renderCopy()}
          >
            RENDER COPY
          </MachineButton>
        </div>

        <div className="resample-track">
          <div className="resample-subhead">
            <span>TRACK / STEM BOUNCE</span>
            <strong>{voice.toUpperCase()}</strong>
          </div>

          <label>
            <span>VOICE</span>
            <select
              value={voice}
              disabled={busy}
              onChange={(event) =>
                setVoice(event.currentTarget.value as DrumVoiceId)
              }
            >
              {DRUM_PADS.map((pad) => (
                <option key={pad.voice} value={pad.voice}>
                  {pad.label}
                </option>
              ))}
            </select>
          </label>

          <MachineButton
            disabled={busy}
            onClick={() =>
              void renderCopy("track", voice, false)
            }
          >
            BOUNCE TRACK → SAMPLE
          </MachineButton>

          <MachineButton
            compact
            disabled={busy || !arrangement.blueprint}
            onClick={() =>
              void renderCopy("section", undefined, false)
            }
          >
            BOUNCE SECTION
          </MachineButton>

          <MachineButton
            compact
            disabled={busy}
            onClick={() =>
              void renderCopy("fx", undefined, false, "auto")
            }
          >
            BOUNCE FX + TAIL
          </MachineButton>

          <MachineButton
            compact
            disabled={busy}
            onClick={() =>
              void renderCopy("master", undefined, true, "auto")
            }
          >
            BOUNCE MASTER
          </MachineButton>
        </div>

        <div className="resample-destructive">
          <div className="resample-subhead">
            <span>IN-PLACE / CPU</span>
            <strong>
              {freeze.active
                ? "FROZEN"
                : resample.recovery
                  ? resample.recovery.mode.toUpperCase()
                  : "LIVE SOURCE"}
            </strong>
          </div>

          {freeze.active ? (
            <div className="resample-freeze-state">
              <span>
                {freeze.active.patternId}
              </span>
              <strong>
                {seconds(freeze.active.durationSeconds)}
                {" · "}
                {freeze.active.bpm.toFixed(1)} BPM
              </strong>
              <MachineButton
                compact
                onClick={() => resampleStore.unfreeze()}
              >
                UNFREEZE
              </MachineButton>
            </div>
          ) : (
            <MachineButton
              disabled={busy || Boolean(resample.recovery)}
              onClick={() => void freezePattern()}
            >
              FREEZE PATTERN
            </MachineButton>
          )}

          {freeze.lastInvalidation ? (
            <p className="resample-warning">
              FREEZE INVALIDATED / {freeze.lastInvalidation}
            </p>
          ) : null}

          <MachineButton
            compact
            disabled={
              busy ||
              Boolean(freeze.active) ||
              Boolean(resample.recovery)
            }
            onClick={() => void flatten("flatten")}
          >
            FLATTEN PATTERN
          </MachineButton>

          <MachineButton
            compact
            disabled={
              busy ||
              Boolean(freeze.active) ||
              Boolean(resample.recovery)
            }
            onClick={() => void flatten("replace")}
          >
            REPLACE WITH AUDIO
          </MachineButton>

          {resample.recovery ? (
            <div className="resample-recovery">
              <span>
                RECOVERY / {resample.recovery.mode.toUpperCase()}
              </span>
              <strong>
                SOURCE {resample.recovery.sourcePatternId}
              </strong>
              <MachineButton
                compact
                onClick={() => {
                  const ok = resampleStore.revertFlatten();
                  if (ok) {
                    setStatus("EDITABLE SOURCE RESTORED");
                  }
                }}
              >
                REVERT TO EDITABLE SOURCE
              </MachineButton>
            </div>
          ) : null}

          <p>
            Freeze leaves Pattern state untouched. Flatten/Replace create one
            pre-master rendered-clip event and keep a recovery point.
          </p>
        </div>
      </div>

      {resample.lastError ? (
        <p className="resample-error" aria-live="polite">
          {resample.lastError}
        </p>
      ) : null}

      {resample.artifacts.length > 0 ? (
        <div className="resample-artifacts">
          <div className="resample-subhead">
            <span>INTERNAL AUDIO / RECENT</span>
            <strong>{resample.artifacts.length}</strong>
          </div>

          {[...resample.artifacts].reverse().map((artifact) => (
            <div key={artifact.id} className="resample-artifact">
              <span>{artifact.kind.toUpperCase()}</span>
              <div>
                <strong>{artifact.label}</strong>
                <small>
                  {seconds(artifact.durationSeconds)}
                  {" · PEAK "}
                  {db(artifact.analysis.peak)}
                  {artifact.voice
                    ? " · " + artifact.voice.toUpperCase()
                    : ""}
                </small>
              </div>
              <button
                type="button"
                onClick={() =>
                  void resampleStore.openArtifactInSampleLab(
                    artifact.id,
                  )
                }
              >
                LAB
              </button>
              <button
                type="button"
                onClick={() =>
                  resampleStore.removeArtifact(artifact.id)
                }
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <p className="resample-status" aria-live="polite">
        {busy ? resample.phaseLabel : status}
      </p>
    </section>
  );
}
