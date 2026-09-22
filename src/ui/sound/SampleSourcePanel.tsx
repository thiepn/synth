import {
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { drumEngine } from "../../audio/DrumEngine";
import {
  sampleAssetStore,
  type SampleAssetState,
} from "../../audio/SampleAssetStore";
import { useSampleAssetSnapshot } from "../../audio/useSampleAssets";
import {
  drumSoundStore,
  type DrumSourceMode,
} from "../../audio/drumSoundModel";
import { useDrumSoundSnapshot } from "../../audio/useDrumSounds";
import type { DrumVoiceId } from "../../music/foundationPattern";

interface SampleSourcePanelProps {
  voice: DrumVoiceId;
}

function formatBytes(value: number | undefined): string {
  if (!value) return "--";
  if (value < 1024 * 1024) {
    return Math.max(1, Math.round(value / 1024)) + " KB";
  }
  return (value / (1024 * 1024)).toFixed(1) + " MB";
}

function formatSeconds(value: number | undefined): string {
  return value === undefined ? "--" : value.toFixed(3) + "s";
}

function Waveform({ asset }: { asset?: SampleAssetState }) {
  const waveform = asset?.waveform ?? [];

  if (waveform.length === 0) {
    return (
      <div className="sample-waveform sample-waveform--empty">
        <span>
          {asset?.decodeStatus === "error"
            ? "DECODE ERROR"
            : asset
              ? "PRESS USE TO DECODE"
              : "NO SAMPLE ASSIGNED"}
        </span>
      </div>
    );
  }

  return (
    <svg
      className="sample-waveform"
      viewBox="0 0 192 70"
      preserveAspectRatio="none"
      role="img"
      aria-label="Sample waveform"
    >
      <line
        className="sample-waveform__axis"
        x1="0"
        x2="192"
        y1="35"
        y2="35"
      />
      {waveform.map((peak, index) => {
        const x = (index / Math.max(1, waveform.length - 1)) * 190 + 1;
        const height = Math.max(1, peak * 31);
        return (
          <line
            key={index}
            className="sample-waveform__bar"
            x1={x}
            x2={x}
            y1={35 - height}
            y2={35 + height}
          />
        );
      })}
    </svg>
  );
}

export function SampleSourcePanel({
  voice,
}: SampleSourcePanelProps) {
  const assets = useSampleAssetSnapshot();
  const sounds = useDrumSoundSnapshot();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyAssetId, setBusyAssetId] = useState<string | null>(null);

  const source = sounds.sourceStates[voice];
  const sample = source.sample;
  const activeAsset = sample
    ? assets.assets.find(
        (asset) => asset.reference.id === sample.assetId,
      )
    : undefined;
  const duration =
    activeAsset?.reference.durationSeconds ??
    sample?.trimEndSeconds ??
    1;
  const trimStart = Math.min(
    Math.max(0, sample?.trimStartSeconds ?? 0),
    Math.max(0, duration - 0.001),
  );
  const trimEnd = Math.min(
    duration,
    Math.max(
      trimStart + 0.001,
      sample?.trimEndSeconds ?? duration,
    ),
  );

  const importSample = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    try {
      await sampleAssetStore.importFile(file);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : String(caught),
      );
    }
  };

  const useAsset = async (assetId: string) => {
    setBusyAssetId(assetId);
    try {
      await drumEngine.prepareSampleAsset(assetId);
      const prepared = sampleAssetStore.getAsset(assetId);
      drumSoundStore.assignSample(
        voice,
        assetId,
        prepared?.reference.durationSeconds,
      );
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : String(caught),
      );
    } finally {
      setBusyAssetId(null);
    }
  };

  const selectMode = (mode: DrumSourceMode) => {
    const accepted = drumSoundStore.setSourceMode(voice, mode);
    if (!accepted) {
      setError("Assign a decoded sample before selecting this source mode.");
    } else {
      setError(null);
    }
  };

  const removeAsset = (assetId: string) => {
    drumSoundStore.detachSampleAsset(assetId);
    sampleAssetStore.remove(assetId);
    setError(null);
  };

  return (
    <section
      className="sample-source-panel"
      aria-labelledby="sample-source-title"
    >
      <div className="machine-section-label">
        <span id="sample-source-title">SAMPLE / HYBRID</span>
        <span>LOCAL ASSET ENGINE / V1</span>
      </div>

      <div className="sample-source-panel__body">
        <div className="sample-library">
          <div className="sample-source-subhead">
            <span>ASSET / LIBRARY</span>
            <strong>{assets.assets.length} LOCAL</strong>
          </div>

          <input
            ref={fileRef}
            className="sample-file-input"
            type="file"
            accept="audio/*,.wav,.mp3,.ogg,.oga,.m4a,.aac,.flac,.webm"
            onChange={(event) => void importSample(event)}
          />

          <button
            type="button"
            className="sample-import-key"
            onClick={() => fileRef.current?.click()}
          >
            <span>IMPORT SAMPLE</span>
            <strong>＋ AUDIO</strong>
          </button>

          <div className="sample-library__list">
            {assets.assets.length === 0 ? (
              <div className="sample-library__empty">
                Local audio stays in this browser session.
              </div>
            ) : (
              assets.assets.map((asset) => {
                const assigned =
                  source.sample?.assetId === asset.reference.id;
                const busy = busyAssetId === asset.reference.id;

                return (
                  <div
                    className={[
                      "sample-library__row",
                      assigned ? "is-assigned" : "",
                    ].join(" ")}
                    key={asset.reference.id}
                  >
                    <button
                      type="button"
                      className="sample-library__select"
                      onClick={() =>
                        void useAsset(asset.reference.id)
                      }
                      disabled={busy}
                    >
                      <span>
                        {busy
                          ? "DEC"
                          : asset.decodeStatus === "ready"
                            ? "USE"
                            : "PREP"}
                      </span>
                      <strong>{asset.reference.name}</strong>
                      <small>
                        {formatSeconds(
                          asset.reference.durationSeconds,
                        )}{" "}
                        · {formatBytes(asset.reference.byteLength)}
                      </small>
                    </button>
                    <button
                      type="button"
                      className="sample-library__remove"
                      onClick={() => removeAsset(asset.reference.id)}
                      aria-label={
                        "Remove sample " + asset.reference.name
                      }
                    >
                      ×
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="sample-source-editor">
          <div className="sample-source-subhead">
            <span>SOURCE / {voice.toUpperCase()}</span>
            <strong>{source.mode.toUpperCase()}</strong>
          </div>

          <div className="sample-source-modes">
            {(["synth", "sample", "hybrid"] as const).map((mode) => (
              <button
                type="button"
                key={mode}
                className={
                  source.mode === mode ? "is-active" : ""
                }
                disabled={mode !== "synth" && !sample}
                onClick={() => selectMode(mode)}
              >
                {mode.toUpperCase()}
              </button>
            ))}
          </div>

          <Waveform asset={activeAsset} />

          <div className="sample-source-editor__identity">
            <span>
              {activeAsset?.reference.name ?? "NO SAMPLE"}
            </span>
            <strong>
              {activeAsset
                ? formatSeconds(
                    activeAsset.reference.durationSeconds,
                  )
                : "SYNTH ONLY"}
            </strong>
            <small>
              {activeAsset?.reference.contentHash
                ? activeAsset.reference.contentHash.slice(0, 10)
                : "---"}
            </small>
          </div>

          {sample && activeAsset ? (
            <div className="sample-source-controls">
              <label>
                <span>TRIM IN</span>
                <input
                  type="range"
                  min="0"
                  max={Math.max(0.001, trimEnd - 0.001)}
                  step="0.001"
                  value={trimStart}
                  onChange={(event) =>
                    drumSoundStore.setSampleTrim(
                      voice,
                      Number(event.currentTarget.value),
                      trimEnd,
                    )
                  }
                />
                <b>{trimStart.toFixed(3)}s</b>
              </label>

              <label>
                <span>TRIM OUT</span>
                <input
                  type="range"
                  min={Math.min(duration, trimStart + 0.001)}
                  max={Math.max(0.001, duration)}
                  step="0.001"
                  value={trimEnd}
                  onChange={(event) =>
                    drumSoundStore.setSampleTrim(
                      voice,
                      trimStart,
                      Number(event.currentTarget.value),
                    )
                  }
                />
                <b>{trimEnd.toFixed(3)}s</b>
              </label>

              <label>
                <span>GAIN</span>
                <input
                  type="range"
                  min="-36"
                  max="12"
                  step="0.5"
                  value={sample.gainDb}
                  onChange={(event) =>
                    drumSoundStore.setSampleGainDb(
                      voice,
                      Number(event.currentTarget.value),
                    )
                  }
                />
                <b>{sample.gainDb.toFixed(1)}dB</b>
              </label>

              <label>
                <span>PITCH</span>
                <input
                  type="range"
                  min="-24"
                  max="24"
                  step="1"
                  value={sample.pitchSemitones}
                  onChange={(event) =>
                    drumSoundStore.setSamplePitchSemitones(
                      voice,
                      Number(event.currentTarget.value),
                    )
                  }
                />
                <b>
                  {sample.pitchSemitones >= 0 ? "+" : ""}
                  {sample.pitchSemitones}st
                </b>
              </label>

              {source.mode === "hybrid" ? (
                <label>
                  <span>SYNTH</span>
                  <input
                    type="range"
                    min="-24"
                    max="6"
                    step="0.5"
                    value={source.synthGainDb}
                    onChange={(event) =>
                      drumSoundStore.setHybridSynthGainDb(
                        voice,
                        Number(event.currentTarget.value),
                      )
                    }
                  />
                  <b>{source.synthGainDb.toFixed(1)}dB</b>
                </label>
              ) : null}

              <div className="sample-source-controls__actions">
                <button
                  type="button"
                  className={sample.reversed ? "is-active" : ""}
                  onClick={() =>
                    drumSoundStore.setSampleReversed(
                      voice,
                      !sample.reversed,
                    )
                  }
                >
                  {sample.reversed ? "REVERSED" : "REVERSE"}
                </button>
                <button
                  type="button"
                  onClick={() => void drumEngine.triggerNow(voice, 0.9)}
                >
                  ▶ AUDITION
                </button>
                <button
                  type="button"
                  onClick={() =>
                    drumSoundStore.clearVoiceSample(voice)
                  }
                >
                  DETACH
                </button>
              </div>
            </div>
          ) : (
            <div className="sample-source-controls sample-source-controls--empty">
              <span>
                Choose USE/PREP on a local asset to assign it to this voice.
              </span>
            </div>
          )}
        </div>
      </div>

      {error ? (
        <p className="sample-source-error" aria-live="polite">
          {error}
        </p>
      ) : null}

      <p className="sample-source-note">
        Source mode is per voice. Kit generation and sound mutation continue
        shaping the V2 synth layer underneath; assigned sample layers remain
        attached until you detach them.
      </p>
    </section>
  );
}
