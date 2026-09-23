import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { drumEngine } from "../../audio/DrumEngine";
import { sampleAssetStore } from "../../audio/SampleAssetStore";
import { useSampleAssetSnapshot } from "../../audio/useSampleAssets";
import { useTransportSnapshot } from "../../audio/useTransport";
import { drumSoundStore } from "../../audio/drumSoundModel";
import {
  DRUM_PADS,
  type DrumVoiceId,
} from "../../music/foundationPattern";
import {
  renderSampleSpecToAsset,
  sampleLabPlayer,
} from "../../sample/sampleLabAudio";
import {
  SAMPLE_LAB_PAD_BANK_SIZE,
  sampleLabStore,
  type SampleSlice,
  type SampleSliceMode,
} from "../../sample/SampleLabStore";
import { useSampleLabSnapshot } from "../../sample/useSampleLab";
import { MachineButton, SignalRail } from "../pulse/Primitives";

const MODES: ReadonlyArray<{
  id: SampleSliceMode;
  code: string;
  label: string;
}> = [
  { id: "transient", code: "TRN", label: "Transient" },
  { id: "equal", code: "EQL", label: "Equal" },
  { id: "beat", code: "BTS", label: "Beat" },
  { id: "manual", code: "MAN", label: "Manual" },
];

function eventTargetIsInput(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.matches("input, textarea, select, button, [role='slider']"))
  );
}

function seconds(value: number): string {
  return value.toFixed(value < 10 ? 3 : 2) + "s";
}

function signed(value: number, suffix = ""): string {
  const output = value.toFixed(1);
  return (value > 0 ? "+" : "") + output + suffix;
}

function waveformPath(
  values: readonly number[],
  startFraction: number,
  endFraction: number,
): string {
  const startIndex = Math.max(
    0,
    Math.min(values.length - 1, Math.floor(startFraction * values.length)),
  );
  const endIndex = Math.max(
    startIndex + 1,
    Math.min(values.length, Math.ceil(endFraction * values.length)),
  );
  const visible = values.slice(startIndex, endIndex);

  if (visible.length === 0) return "";

  const top = visible
    .map((peak, index) => {
      const x = (index / Math.max(1, visible.length - 1)) * 1000;
      const y = 160 - Math.max(1, peak * 145);
      return (index === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2);
    })
    .join(" ");
  const bottom = [...visible]
    .reverse()
    .map((peak, reverseIndex) => {
      const index = visible.length - 1 - reverseIndex;
      const x = (index / Math.max(1, visible.length - 1)) * 1000;
      const y = 160 + Math.max(1, peak * 145);
      return "L" + x.toFixed(2) + " " + y.toFixed(2);
    })
    .join(" ");

  return top + " " + bottom + " Z";
}

function Pad({
  slice,
  index,
  selected,
  onTrigger,
  onSelect,
}: {
  slice?: SampleSlice;
  index: number;
  selected: boolean;
  onTrigger: () => void;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        "sample-lab-pad",
        slice ? "has-slice" : "",
        selected ? "is-selected" : "",
      ].join(" ")}
      disabled={!slice}
      onPointerDown={(event) => {
        event.preventDefault();
        onSelect();
        onTrigger();
      }}
    >
      <span>{index + 1}</span>
      <strong>{slice?.label ?? "EMPTY"}</strong>
      <small>
        {slice
          ? seconds(slice.endSeconds - slice.startSeconds)
          : "—"}
      </small>
    </button>
  );
}

export function SampleLabPanel({
  selectedVoice,
}: {
  selectedVoice: DrumVoiceId;
}) {
  const lab = useSampleLabSnapshot();
  const assets = useSampleAssetSnapshot();
  const transport = useTransportSnapshot();
  const fileRef = useRef<HTMLInputElement>(null);
  const waveformRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("LOAD A SAMPLE TO OPEN THE LAB");

  const analysis = lab.analysis;
  const region = lab.region;
  const duration = analysis?.durationSeconds ?? 1;
  const viewSpan = 1 / Math.max(1, zoom);
  const viewStart = Math.max(
    0,
    Math.min(1 - viewSpan, pan * (1 - viewSpan)),
  );
  const viewEnd = Math.min(1, viewStart + viewSpan);
  const path = useMemo(
    () =>
      waveformPath(
        analysis?.waveform ?? [],
        viewStart,
        viewEnd,
      ),
    [analysis?.waveform, viewStart, viewEnd],
  );

  const selectedSlice = lab.slices.find(
    (slice) => slice.id === lab.selectedSliceId,
  );
  const bankStart = lab.bankIndex * SAMPLE_LAB_PAD_BANK_SIZE;
  const bank = lab.slices.slice(
    bankStart,
    bankStart + SAMPLE_LAB_PAD_BANK_SIZE,
  );
  const bankCount = Math.max(
    1,
    Math.ceil(lab.slices.length / SAMPLE_LAB_PAD_BANK_SIZE),
  );

  const xForSeconds = (value: number): number => {
    const fraction = value / Math.max(0.001, duration);
    return ((fraction - viewStart) / viewSpan) * 1000;
  };

  const secondsFromPointer = (
    event: ReactPointerEvent<SVGSVGElement>,
  ): number => {
    const node = waveformRef.current;
    if (!node) return 0;
    const rect = node.getBoundingClientRect();
    const local = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)),
    );
    return (viewStart + local * viewSpan) * duration;
  };

  const loadAsset = async (assetId: string) => {
    setBusy("load");
    try {
      await sampleLabStore.loadAsset(assetId);
      setZoom(1);
      setPan(0);
      setStatus("SAMPLE LOADED / SOURCE REMAINS IMMUTABLE");
    } catch (error) {
      setStatus(
        "LOAD FAILED / " +
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setBusy(null);
    }
  };

  const importFile = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setBusy("import");
    try {
      const asset = await sampleAssetStore.importFile(file);
      await sampleLabStore.loadAsset(asset.reference.id);
      setZoom(1);
      setPan(0);
      setStatus("IMPORTED / " + asset.reference.name);
    } catch (error) {
      setStatus(
        "IMPORT FAILED / " +
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setBusy(null);
    }
  };

  const playSpec = async (
    spec: ReturnType<typeof sampleLabStore.sliceSpec>,
    padIndex?: number,
    loop = false,
  ) => {
    if (!spec) return;
    if (padIndex !== undefined) {
      sampleLabStore.recordPad(padIndex, 0.92);
    }
    try {
      await sampleLabPlayer.play(spec, 0.92, loop);
    } catch (error) {
      setStatus(
        "AUDITION FAILED / " +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  };

  useEffect(
    () => () => {
      sampleLabPlayer.stop();
    },
    [],
  );

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.repeat || eventTargetIsInput(event.target)) return;
      const index = Number(event.key) - 1;
      if (index < 0 || index >= SAMPLE_LAB_PAD_BANK_SIZE) return;

      const slice = bank[index];
      const spec = slice ? sampleLabStore.sliceSpec(slice) : undefined;
      if (!slice || !spec) return;

      event.preventDefault();
      sampleLabStore.selectSlice(slice.id);
      void playSpec(spec, index);
    };

    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [lab.bankIndex, lab.slices, lab.region]);

  const assignSelected = () => {
    if (!selectedSlice) return;
    const spec = sampleLabStore.sliceSpec(selectedSlice);
    if (!spec) return;
    drumSoundStore.assignSampleSpec(selectedVoice, spec, "sample");
    setStatus(
      selectedSlice.label +
        " → " +
        selectedVoice.toUpperCase(),
    );
  };

  const renderSelected = async () => {
    const spec = selectedSlice
      ? sampleLabStore.sliceSpec(selectedSlice)
      : sampleLabStore.regionSpec();
    if (!spec) return;

    setBusy("render");
    try {
      const sourceName =
        assets.assets.find(
          (asset) => asset.reference.id === lab.activeAssetId,
        )?.reference.name.replace(/.[^.]+$/, "") ?? "Sample";
      const suffix = selectedSlice?.label ?? "Region";
      const id = await renderSampleSpecToAsset(
        spec,
        sourceName + " - " + suffix,
      );
      await sampleLabStore.loadAsset(id);
      setZoom(1);
      setPan(0);
      setStatus("RENDERED NEW SAMPLE / ORIGINAL PRESERVED");
    } catch (error) {
      setStatus(
        "RENDER FAILED / " +
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setBusy(null);
    }
  };

  const toggleRecord = () => {
    if (lab.recording) {
      const take = sampleLabStore.stopRecording();
      setStatus(
        take
          ? "CHOP TAKE CAPTURED / " + take.events.length + " HITS"
          : "EMPTY TAKE DISCARDED",
      );
    } else {
      sampleLabStore.startRecording();
      setStatus("RECORDING CHOP PADS / KEYS 1–8");
    }
  };

  return (
    <section className="sample-lab-panel" aria-labelledby="sample-lab-title">
      <div className="machine-section-label">
        <span id="sample-lab-title">SAMPLE LAB / CHOPPING</span>
        <span>NON-DESTRUCTIVE REGIONS / V1</span>
      </div>

      <div className="sample-lab-toolbar">
        <input
          ref={fileRef}
          className="sample-file-input"
          type="file"
          accept="audio/*,.wav,.mp3,.ogg,.oga,.m4a,.aac,.flac,.webm"
          onChange={(event) => void importFile(event)}
        />
        <MachineButton
          compact
          disabled={Boolean(busy)}
          onClick={() => fileRef.current?.click()}
        >
          IMPORT
        </MachineButton>

        <select
          value={lab.activeAssetId ?? ""}
          disabled={Boolean(busy) || assets.assets.length === 0}
          onChange={(event) =>
            void loadAsset(event.currentTarget.value)
          }
          aria-label="Sample Lab source asset"
        >
          <option value="">SELECT SAMPLE</option>
          {assets.assets.map((asset) => (
            <option
              key={asset.reference.id}
              value={asset.reference.id}
            >
              {asset.reference.name}
            </option>
          ))}
        </select>

        <div className="sample-lab-metrics">
          <span>
            DUR {analysis ? seconds(analysis.durationSeconds) : "—"}
          </span>
          <span>
            PEAK{" "}
            {analysis && analysis.peak > 0
              ? (20 * Math.log10(analysis.peak)).toFixed(1) + "dB"
              : "—"}
          </span>
          <span>
            TRN {analysis?.transientsSeconds.length ?? 0}
          </span>
          <span>SL {lab.slices.length}</span>
        </div>
      </div>

      {analysis && region ? (
        <>
          <div className="sample-lab-wave-shell">
            <svg
              ref={waveformRef}
              className="sample-lab-wave"
              viewBox="0 0 1000 320"
              preserveAspectRatio="none"
              role="img"
              aria-label="Editable Sample Lab waveform"
              onPointerDown={(event) => {
                if (lab.sliceMode !== "manual") return;
                event.preventDefault();
                sampleLabStore.toggleManualCut(
                  secondsFromPointer(event),
                );
              }}
            >
              <line x1="0" x2="1000" y1="160" y2="160" />
              <path className="sample-lab-wave__shape" d={path} />

              {analysis.transientsSeconds.map((value, index) => {
                const x = xForSeconds(value);
                if (x < 0 || x > 1000) return null;
                return (
                  <line
                    key={"t-" + index}
                    className="sample-lab-wave__transient"
                    x1={x}
                    x2={x}
                    y1="0"
                    y2="320"
                  />
                );
              })}

              {lab.slices.slice(1).map((slice) => {
                const x = xForSeconds(slice.startSeconds);
                if (x < 0 || x > 1000) return null;
                return (
                  <line
                    key={slice.id}
                    className="sample-lab-wave__slice"
                    x1={x}
                    x2={x}
                    y1="0"
                    y2="320"
                  />
                );
              })}

              <rect
                className="sample-lab-wave__outside"
                x="0"
                y="0"
                width={Math.max(0, xForSeconds(region.startSeconds))}
                height="320"
              />
              <rect
                className="sample-lab-wave__outside"
                x={Math.min(1000, xForSeconds(region.endSeconds))}
                y="0"
                width={Math.max(
                  0,
                  1000 - xForSeconds(region.endSeconds),
                )}
                height="320"
              />

              {selectedSlice ? (
                <rect
                  className="sample-lab-wave__selection"
                  x={Math.max(0, xForSeconds(selectedSlice.startSeconds))}
                  y="0"
                  width={Math.max(
                    1,
                    xForSeconds(selectedSlice.endSeconds) -
                      xForSeconds(selectedSlice.startSeconds),
                  )}
                  height="320"
                />
              ) : null}

              <line
                className="sample-lab-wave__region"
                x1={xForSeconds(region.startSeconds)}
                x2={xForSeconds(region.startSeconds)}
                y1="0"
                y2="320"
              />
              <line
                className="sample-lab-wave__region"
                x1={xForSeconds(region.endSeconds)}
                x2={xForSeconds(region.endSeconds)}
                y1="0"
                y2="320"
              />
            </svg>

            <div className="sample-lab-view-controls">
              <SignalRail
                label="ZOOM"
                value={((zoom - 1) / 7) * 100}
                minLabel="1×"
                maxLabel="8×"
                tone="ice"
                onChange={(value) =>
                  setZoom(1 + (value / 100) * 7)
                }
              />
              <SignalRail
                label="PAN"
                value={pan * 100}
                minLabel="START"
                maxLabel="END"
                onChange={(value) => setPan(value / 100)}
              />
            </div>
          </div>

          <div className="sample-lab-editor-grid">
            <div className="sample-lab-region-editor">
              <div className="sample-lab-subhead">
                <span>REGION / EDIT</span>
                <strong>
                  {seconds(region.startSeconds)}
                  {" → "}
                  {seconds(region.endSeconds)}
                </strong>
              </div>

              <label>
                <span>TRIM IN</span>
                <input
                  type="range"
                  min="0"
                  max={Math.max(0.001, region.endSeconds - 0.001)}
                  step="0.001"
                  value={region.startSeconds}
                  onChange={(event) =>
                    sampleLabStore.setRegion(
                      Number(event.currentTarget.value),
                      region.endSeconds,
                    )
                  }
                />
                <b>{seconds(region.startSeconds)}</b>
              </label>

              <label>
                <span>TRIM OUT</span>
                <input
                  type="range"
                  min={region.startSeconds + 0.001}
                  max={duration}
                  step="0.001"
                  value={region.endSeconds}
                  onChange={(event) =>
                    sampleLabStore.setRegion(
                      region.startSeconds,
                      Number(event.currentTarget.value),
                    )
                  }
                />
                <b>{seconds(region.endSeconds)}</b>
              </label>

              <label>
                <span>FADE IN</span>
                <input
                  type="range"
                  min="0"
                  max={Math.max(
                    0.001,
                    (region.endSeconds - region.startSeconds) * 0.45,
                  )}
                  step="0.001"
                  value={region.fadeInSeconds}
                  onChange={(event) =>
                    sampleLabStore.setFades(
                      Number(event.currentTarget.value),
                      region.fadeOutSeconds,
                    )
                  }
                />
                <b>{seconds(region.fadeInSeconds)}</b>
              </label>

              <label>
                <span>FADE OUT</span>
                <input
                  type="range"
                  min="0"
                  max={Math.max(
                    0.001,
                    (region.endSeconds - region.startSeconds) * 0.45,
                  )}
                  step="0.001"
                  value={region.fadeOutSeconds}
                  onChange={(event) =>
                    sampleLabStore.setFades(
                      region.fadeInSeconds,
                      Number(event.currentTarget.value),
                    )
                  }
                />
                <b>{seconds(region.fadeOutSeconds)}</b>
              </label>

              <label>
                <span>GAIN</span>
                <input
                  type="range"
                  min="-36"
                  max="18"
                  step="0.5"
                  value={region.gainDb}
                  onChange={(event) =>
                    sampleLabStore.setGainDb(
                      Number(event.currentTarget.value),
                    )
                  }
                />
                <b>{signed(region.gainDb, "dB")}</b>
              </label>

              <label>
                <span>PITCH</span>
                <input
                  type="range"
                  min="-24"
                  max="24"
                  step="1"
                  value={region.pitchSemitones}
                  onChange={(event) =>
                    sampleLabStore.setPitchSemitones(
                      Number(event.currentTarget.value),
                    )
                  }
                />
                <b>{signed(region.pitchSemitones, "st")}</b>
              </label>

              <label>
                <span>RATE</span>
                <input
                  type="range"
                  min="0.25"
                  max="4"
                  step="0.05"
                  value={region.playbackRate}
                  onChange={(event) =>
                    sampleLabStore.setPlaybackRate(
                      Number(event.currentTarget.value),
                    )
                  }
                />
                <b>{region.playbackRate.toFixed(2)}×</b>
              </label>

              <div className="sample-lab-region-actions">
                <MachineButton
                  compact
                  active={region.normalize}
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void sampleLabStore.setNormalize(!region.normalize)
                  }
                >
                  {region.normalize
                    ? "NORMALIZED " +
                      signed(region.normalizeGainDb, "dB")
                    : "NORMALIZE"}
                </MachineButton>
                <MachineButton
                  compact
                  active={region.reversed}
                  onClick={() =>
                    sampleLabStore.setReversed(!region.reversed)
                  }
                >
                  {region.reversed ? "REVERSED" : "REVERSE"}
                </MachineButton>
                <MachineButton
                  compact
                  active={lab.loopPreview}
                  onClick={() =>
                    sampleLabStore.setLoopPreview(!lab.loopPreview)
                  }
                >
                  {lab.loopPreview ? "LOOP ON" : "LOOP OFF"}
                </MachineButton>
                <MachineButton
                  compact
                  onClick={() =>
                    void playSpec(
                      sampleLabStore.regionSpec(),
                      undefined,
                      lab.loopPreview,
                    )
                  }
                >
                  ▶ REGION
                </MachineButton>
                <MachineButton
                  compact
                  onClick={() => sampleLabPlayer.stop()}
                >
                  ■ STOP
                </MachineButton>
              </div>
            </div>

            <div className="sample-lab-slicer">
              <div className="sample-lab-subhead">
                <span>SLICE / MODE</span>
                <strong>{lab.sliceMode.toUpperCase()}</strong>
              </div>

              <div className="sample-lab-mode-bank">
                {MODES.map((mode) => (
                  <button
                    type="button"
                    key={mode.id}
                    className={
                      lab.sliceMode === mode.id ? "is-active" : undefined
                    }
                    onClick={() => sampleLabStore.setSliceMode(mode.id)}
                    title={mode.label}
                  >
                    <span>{mode.code}</span>
                    <strong>{mode.label}</strong>
                  </button>
                ))}
              </div>

              {lab.sliceMode === "equal" ? (
                <label>
                  <span>SLICES</span>
                  <input
                    type="range"
                    min="1"
                    max="32"
                    value={lab.equalCount}
                    onChange={(event) =>
                      sampleLabStore.setEqualCount(
                        Number(event.currentTarget.value),
                      )
                    }
                  />
                  <b>{lab.equalCount}</b>
                </label>
              ) : null}

              {lab.sliceMode === "transient" ? (
                <label>
                  <span>MAX SLICES</span>
                  <input
                    type="range"
                    min="1"
                    max="32"
                    value={lab.transientMaxSlices}
                    onChange={(event) =>
                      sampleLabStore.setTransientMaxSlices(
                        Number(event.currentTarget.value),
                      )
                    }
                  />
                  <b>{lab.transientMaxSlices}</b>
                </label>
              ) : null}

              {lab.sliceMode === "beat" ? (
                <>
                  <label>
                    <span>BPM</span>
                    <input
                      type="number"
                      min="30"
                      max="300"
                      value={lab.beatBpm}
                      onChange={(event) =>
                        sampleLabStore.setBeatSlicing(
                          Number(event.currentTarget.value),
                          lab.beatsPerSlice,
                        )
                      }
                    />
                    <b>{lab.beatBpm}</b>
                  </label>
                  <label>
                    <span>BEATS / SLICE</span>
                    <select
                      value={lab.beatsPerSlice}
                      onChange={(event) =>
                        sampleLabStore.setBeatSlicing(
                          lab.beatBpm,
                          Number(event.currentTarget.value),
                        )
                      }
                    >
                      <option value={0.25}>1/4 beat</option>
                      <option value={0.5}>1/2 beat</option>
                      <option value={1}>1 beat</option>
                      <option value={2}>2 beats</option>
                      <option value={4}>4 beats</option>
                    </select>
                    <b>{lab.beatsPerSlice}</b>
                  </label>
                </>
              ) : null}

              {lab.sliceMode === "manual" ? (
                <div className="sample-lab-manual-note">
                  <span>CLICK WAVEFORM TO TOGGLE CUTS</span>
                  <strong>{lab.manualCuts.length} CUTS</strong>
                  <MachineButton
                    compact
                    disabled={lab.manualCuts.length === 0}
                    onClick={() => sampleLabStore.clearManualCuts()}
                  >
                    CLEAR CUTS
                  </MachineButton>
                </div>
              ) : null}

              <div className="sample-lab-slice-list">
                {lab.slices.map((slice) => (
                  <button
                    type="button"
                    key={slice.id}
                    className={
                      lab.selectedSliceId === slice.id
                        ? "is-selected"
                        : undefined
                    }
                    onClick={() => sampleLabStore.selectSlice(slice.id)}
                    onDoubleClick={() =>
                      void playSpec(sampleLabStore.sliceSpec(slice))
                    }
                  >
                    <span>
                      {String(slice.index + 1).padStart(2, "0")}
                    </span>
                    <strong>{slice.label}</strong>
                    <small>
                      {seconds(slice.startSeconds)}
                      {"–"}
                      {seconds(slice.endSeconds)}
                    </small>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="sample-lab-pad-section">
            <div className="sample-lab-subhead">
              <span>CHOP / PAD BANK</span>
              <strong>
                BANK {lab.bankIndex + 1}/{bankCount}
              </strong>
            </div>

            <div className="sample-lab-bank-actions">
              <MachineButton
                compact
                disabled={lab.bankIndex <= 0}
                onClick={() =>
                  sampleLabStore.setBankIndex(lab.bankIndex - 1)
                }
              >
                ← PREV
              </MachineButton>
              <MachineButton
                compact
                disabled={lab.bankIndex >= bankCount - 1}
                onClick={() =>
                  sampleLabStore.setBankIndex(lab.bankIndex + 1)
                }
              >
                NEXT →
              </MachineButton>
              <MachineButton
                compact
                onClick={() => {
                  const count =
                    sampleLabStore.applyCurrentBankToVoices();
                  setStatus(
                    "PAD BANK → DRUM KIT / " + count + " VOICES",
                  );
                }}
              >
                BANK → KIT
              </MachineButton>
              <MachineButton
                compact
                disabled={!selectedSlice}
                onClick={assignSelected}
              >
                SLICE → {selectedVoice.toUpperCase()}
              </MachineButton>
              <MachineButton
                compact
                disabled={!selectedSlice && !region}
                onClick={() => void renderSelected()}
              >
                RENDER NEW SAMPLE
              </MachineButton>
            </div>

            <div className="sample-lab-pads">
              {Array.from(
                { length: SAMPLE_LAB_PAD_BANK_SIZE },
                (_, index) => {
                  const slice = bank[index];
                  return (
                    <Pad
                      key={index}
                      index={index}
                      slice={slice}
                      selected={
                        Boolean(slice) &&
                        lab.selectedSliceId === slice?.id
                      }
                      onSelect={() =>
                        slice
                          ? sampleLabStore.selectSlice(slice.id)
                          : undefined
                      }
                      onTrigger={() =>
                        void playSpec(
                          slice
                            ? sampleLabStore.sliceSpec(slice)
                            : undefined,
                          index,
                        )
                      }
                    />
                  );
                },
              )}
            </div>

            <div className="sample-lab-record">
              <MachineButton
                active={lab.recording}
                onClick={toggleRecord}
              >
                {lab.recording
                  ? "■ STOP CHOP TAKE"
                  : "● RECORD CHOP TAKE"}
              </MachineButton>
              <span>
                {lab.recording
                  ? lab.currentEventCount + " EVENTS · KEYS 1–8"
                  : lab.takes.length + " TAKES"}
              </span>
            </div>

            {lab.takes.length > 0 ? (
              <div className="sample-lab-takes">
                {[...lab.takes].reverse().map((take) => (
                  <div key={take.id}>
                    <span>
                      {take.id.toUpperCase()} · {take.events.length} HITS ·{" "}
                      {take.durationSeconds.toFixed(2)}s
                    </span>
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          const pattern =
                            sampleLabStore.commitTakeToPattern(
                              take.id,
                              transport.bpm,
                            );
                          setStatus(
                            pattern
                              ? "CHOP TAKE → PATTERN / " + pattern.name
                              : "TAKE COMMIT FAILED",
                          );
                        }}
                      >
                        → PATTERN
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          sampleLabStore.deleteTake(take.id)
                        }
                      >
                        DELETE
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <div className="sample-lab-empty">
          <strong>NO SAMPLE LOADED</strong>
          <span>
            Import or select a local sample. Sample Lab edits are metadata until
            you explicitly render a new sample.
          </span>
        </div>
      )}

      <p className="sample-lab-status" aria-live="polite">
        {busy ? busy.toUpperCase() + "…" : status}
      </p>
    </section>
  );
}
