import { useMemo, useState } from "react";
import { useDrumEngineSnapshot } from "../../audio/useDrumEngine";
import { useDrumSoundSnapshot } from "../../audio/useDrumSounds";
import { useTransportSnapshot } from "../../audio/useTransport";
import { useArrangementSnapshot } from "../../arrange/useArrangement";
import {
  generateMixPlan,
  type MixDirectionId,
} from "../../generation/mixArchitect";
import {
  MIXER_EQ_MAX_DB,
  MIXER_EQ_MIN_DB,
  MIXER_GAIN_MAX_DB,
  MIXER_GAIN_MIN_DB,
  type MixerChannelState,
} from "../../mix/mixerModel";
import {
  mixerStore,
  type MixerNumericParameter,
} from "../../mix/MixerStore";
import { useMixerSnapshot } from "../../mix/useMixer";
import {
  DRUM_PADS,
  type DrumVoiceId,
} from "../../music/foundationPattern";
import { useSequencerSnapshot } from "../../sequencer/useSequencer";
import {
  MachineButton,
  SignalRail,
} from "../pulse/Primitives";
import {
  TransportPulseSpine,
  TransportStatusLabel,
} from "../transport/TransportUI";

const DIRECTIONS: ReadonlyArray<{
  id: MixDirectionId;
  code: string;
  label: string;
}> = [
  { id: "balanced", code: "BAL", label: "Balanced" },
  { id: "punchy", code: "PNC", label: "Punchy" },
  { id: "wide", code: "WID", label: "Wide" },
  { id: "spacious", code: "SPC", label: "Spacious" },
  { id: "raw", code: "RAW", label: "Raw" },
];

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return ((clamp(value, min, max) - min) / (max - min)) * 100;
}

function denormalize(value: number, min: number, max: number): number {
  const normalized = clamp(value, 0, 100) / 100;
  return min + normalized * (max - min);
}

function signed(value: number, digits = 1): string {
  const fixed = value.toFixed(digits);
  return value > 0 ? "+" + fixed : fixed;
}

function panLabel(value: number): string {
  if (Math.abs(value) < 0.015) return "C";
  const amount = Math.round(Math.abs(value) * 100);
  return (value < 0 ? "L" : "R") + amount;
}

function ChannelParameter({
  label,
  value,
  parameter,
  voice,
  min = 0,
  max = 1,
  disabled,
}: {
  label: string;
  value: number;
  parameter: MixerNumericParameter;
  voice: DrumVoiceId;
  min?: number;
  max?: number;
  disabled: boolean;
}) {
  return (
    <label className="mix-channel-param">
      <span>{label}</span>
      <input
        type="range"
        min="0"
        max="100"
        value={normalize(value, min, max)}
        disabled={disabled}
        aria-label={
          voice +
          " " +
          label +
          (disabled ? " preview locked" : "")
        }
        onChange={(event) =>
          mixerStore.setChannelValue(
            voice,
            parameter,
            denormalize(
              Number(event.currentTarget.value),
              min,
              max,
            ),
          )
        }
      />
      <b>
        {parameter === "pan"
          ? panLabel(value)
          : min < 0
            ? signed(value)
            : String(Math.round(value * 100))}
      </b>
    </label>
  );
}

function ChannelStrip({
  voice,
  channel,
  meter,
  locked,
  previewLocked,
}: {
  voice: DrumVoiceId;
  channel: MixerChannelState;
  meter: number;
  locked: boolean;
  previewLocked: boolean;
}) {
  const pad = DRUM_PADS.find((entry) => entry.voice === voice);
  const faderValue = normalize(
    channel.gainDb,
    MIXER_GAIN_MIN_DB,
    MIXER_GAIN_MAX_DB,
  );

  return (
    <article
      className={[
        "mix-channel",
        channel.muted ? "is-muted" : "",
        channel.solo ? "is-solo" : "",
        locked ? "is-locked" : "",
      ].join(" ")}
    >
      <div className="mix-channel__head">
        <span>{pad?.code ?? voice.slice(0, 3).toUpperCase()}</span>
        <strong>{pad?.label ?? voice}</strong>
        <button
          type="button"
          className={locked ? "is-active" : undefined}
          onClick={() => mixerStore.toggleChannelLock(voice)}
          aria-pressed={locked}
          title="Protect this channel from Mix Architect"
        >
          {locked ? "LOCK" : "FREE"}
        </button>
      </div>

      <div className="mix-channel__meter-fader">
        <div className="mix-meter" aria-label={voice + " measured level"}>
          <i style={{ height: Math.round(meter * 100) + "%" }} />
        </div>
        <label className="mix-fader">
          <input
            type="range"
            min="0"
            max="100"
            value={faderValue}
            disabled={previewLocked}
            onChange={(event) =>
              mixerStore.setChannelValue(
                voice,
                "gainDb",
                denormalize(
                  Number(event.currentTarget.value),
                  MIXER_GAIN_MIN_DB,
                  MIXER_GAIN_MAX_DB,
                ),
              )
            }
            aria-label={voice + " gain"}
          />
          <b>{signed(channel.gainDb)} dB</b>
        </label>
      </div>

      <div className="mix-channel__switches">
        <button
          type="button"
          className={channel.muted ? "is-active is-danger" : undefined}
          disabled={previewLocked}
          onClick={() =>
            mixerStore.setChannelMute(voice, !channel.muted)
          }
          aria-pressed={channel.muted}
        >
          M
        </button>
        <button
          type="button"
          className={channel.solo ? "is-active" : undefined}
          disabled={previewLocked}
          onClick={() =>
            mixerStore.setChannelSolo(voice, !channel.solo)
          }
          aria-pressed={channel.solo}
        >
          S
        </button>
      </div>

      <ChannelParameter
        label="PAN"
        value={channel.pan}
        parameter="pan"
        voice={voice}
        min={-1}
        max={1}
        disabled={previewLocked}
      />

      <div className="mix-channel__eq">
        <ChannelParameter
          label="LOW"
          value={channel.lowDb}
          parameter="lowDb"
          voice={voice}
          min={MIXER_EQ_MIN_DB}
          max={MIXER_EQ_MAX_DB}
          disabled={previewLocked}
        />
        <ChannelParameter
          label="MID"
          value={channel.midDb}
          parameter="midDb"
          voice={voice}
          min={MIXER_EQ_MIN_DB}
          max={MIXER_EQ_MAX_DB}
          disabled={previewLocked}
        />
        <ChannelParameter
          label="HIGH"
          value={channel.highDb}
          parameter="highDb"
          voice={voice}
          min={MIXER_EQ_MIN_DB}
          max={MIXER_EQ_MAX_DB}
          disabled={previewLocked}
        />
      </div>

      <div className="mix-channel__processing">
        <ChannelParameter
          label="COMP"
          value={channel.compression}
          parameter="compression"
          voice={voice}
          disabled={previewLocked}
        />
        <ChannelParameter
          label="SAT"
          value={channel.saturation}
          parameter="saturation"
          voice={voice}
          disabled={previewLocked}
        />
        <ChannelParameter
          label="VERB"
          value={channel.reverbSend}
          parameter="reverbSend"
          voice={voice}
          disabled={previewLocked}
        />
        <ChannelParameter
          label="SIDE"
          value={channel.sidechain}
          parameter="sidechain"
          voice={voice}
          disabled={previewLocked}
        />
      </div>
    </article>
  );
}

export function MixSurface() {
  const mixer = useMixerSnapshot();
  const engine = useDrumEngineSnapshot();
  const sound = useDrumSoundSnapshot();
  const sequencer = useSequencerSnapshot();
  const arrangement = useArrangementSnapshot();
  const transport = useTransportSnapshot();

  const [direction, setDirection] =
    useState<MixDirectionId>("balanced");
  const [intensity, setIntensity] = useState(72);
  const [seedCounter, setSeedCounter] = useState(0);
  const [seed, setSeed] = useState("MIX-0001");
  const [error, setError] = useState<string | null>(null);

  const previewLocked = Boolean(mixer.preview);
  const displayState =
    mixer.previewActive && mixer.preview
      ? mixer.preview.state
      : mixer.state;

  const lockedVoices = useMemo(
    () =>
      DRUM_PADS.filter(
        (pad) => mixer.locks.channels[pad.voice],
      ).map((pad) => pad.voice),
    [mixer.locks],
  );

  const generate = () => {
    try {
      const plan = generateMixPlan({
        seed,
        direction,
        intensity: intensity / 100,
        pattern: sequencer.pattern,
        soundSpecs: sound.specs,
        current: mixer.state,
        arrangement: arrangement.blueprint,
        lockedVoices,
        masterLocked: mixer.locks.master,
      });
      mixerStore.setPreview(plan);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : String(caught),
      );
    }
  };

  const newSeed = () => {
    const nextCounter = seedCounter + 1;
    setSeedCounter(nextCounter);
    setSeed(
      "MIX-" +
        String(nextCounter + 1).padStart(4, "0"),
    );
  };

  const commit = () => {
    const plan = mixerStore.commitPreview();
    if (!plan) return;
    setError(null);
  };

  return (
    <section className="mix-surface" aria-labelledby="mix-title">
      <div className="surface-heading">
        <div>
          <p className="eyebrow">06 / MIX</p>
          <h1 id="mix-title">Shape the production.</h1>
        </div>
        <TransportStatusLabel />
      </div>

      <TransportPulseSpine />

      <section className="mix-architect-panel">
        <div className="machine-section-label">
          <span>MIX / ARCHITECT</span>
          <span>
            {mixer.preview
              ? mixer.previewActive
                ? "PREVIEW / LEVEL MATCHED"
                : "ORIGINAL / CANDIDATE READY"
              : "ROLE-AWARE AUTO-MIX / V1"}
          </span>
        </div>

        <div className="mix-architect-controls">
          <div className="mix-direction-bank">
            {DIRECTIONS.map((entry) => (
              <button
                type="button"
                key={entry.id}
                className={
                  direction === entry.id ? "is-active" : undefined
                }
                onClick={() => setDirection(entry.id)}
                aria-pressed={direction === entry.id}
                title={entry.label}
              >
                <span>{entry.code}</span>
                <strong>{entry.label}</strong>
              </button>
            ))}
          </div>

          <SignalRail
            label="MIX AMOUNT"
            value={intensity}
            minLabel="SUBTLE"
            maxLabel="FULL"
            tone="ice"
            onChange={setIntensity}
          />

          <label className="mix-seed">
            <span>SEED</span>
            <input
              value={seed}
              onChange={(event) => setSeed(event.currentTarget.value)}
              aria-label="Mix Architect seed"
            />
          </label>

          <div className="mix-architect-actions">
            <MachineButton onClick={generate}>
              {mixer.preview ? "TRY ANOTHER MIX" : "QUICK MIX"}
            </MachineButton>
            <MachineButton compact onClick={newSeed}>
              NEW SEED
            </MachineButton>
            <MachineButton
              compact
              active={Boolean(mixer.preview && !mixer.previewActive)}
              disabled={!mixer.preview}
              onClick={() => mixerStore.setPreviewActive(false)}
            >
              A / ORIGINAL
            </MachineButton>
            <MachineButton
              compact
              active={Boolean(mixer.previewActive)}
              disabled={!mixer.preview}
              onClick={() => mixerStore.setPreviewActive(true)}
            >
              B / MIXED
            </MachineButton>
            <MachineButton
              compact
              disabled={!mixer.preview}
              onClick={commit}
            >
              COMMIT MIX
            </MachineButton>
            <MachineButton
              compact
              disabled={!mixer.preview}
              onClick={() => mixerStore.clearPreview()}
            >
              CANCEL
            </MachineButton>
          </div>
        </div>

        {error ? (
          <p className="mix-error" aria-live="polite">
            {error}
          </p>
        ) : null}

        {mixer.preview ? (
          <div className="mix-architect-result">
            <div>
              <span>PLAN</span>
              <strong>
                {mixer.preview.direction.toUpperCase()}
                {" / "}
                {mixer.preview.displaySeed}
              </strong>
            </div>
            <dl>
              <div>
                <dt>HEADROOM</dt>
                <dd>
                  {mixer.preview.metrics.estimatedHeadroomDb.toFixed(1)}
                  {" dB"}
                </dd>
              </div>
              <div>
                <dt>WIDTH</dt>
                <dd>
                  {Math.round(
                    mixer.preview.metrics.stereoSpread * 100,
                  )}
                </dd>
              </div>
              <div>
                <dt>COMP</dt>
                <dd>
                  {Math.round(
                    mixer.preview.metrics.averageCompression * 100,
                  )}
                </dd>
              </div>
              <div>
                <dt>AUTO</dt>
                <dd>
                  {mixer.preview.metrics.automationLaneCount}
                </dd>
              </div>
              <div>
                <dt>A/B MATCH</dt>
                <dd>
                  {signed(mixer.preview.previewLevelMatchDb)}
                  {" dB"}
                </dd>
              </div>
            </dl>
            {mixer.preview.warnings.length > 0 ? (
              <ul>
                {mixer.preview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : (
              <p>No mix warnings.</p>
            )}
          </div>
        ) : null}
      </section>

      <section className="mix-console">
        <div className="machine-section-label">
          <span>CHANNELS / PRODUCTION CONSOLE</span>
          <span>
            {previewLocked
              ? "CANDIDATE IS READ-ONLY · COMMIT OR CANCEL TO EDIT"
              : "MANUAL MIX / AUTOMATABLE"}
          </span>
        </div>

        <div className="mix-channel-scroll">
          {DRUM_PADS.map((pad) => (
            <ChannelStrip
              key={pad.voice}
              voice={pad.voice}
              channel={displayState.channels[pad.voice]}
              meter={engine.channelLevels[pad.voice]}
              locked={mixer.locks.channels[pad.voice]}
              previewLocked={previewLocked}
            />
          ))}

          <article className="mix-master-channel">
            <div className="mix-channel__head">
              <span>MST</span>
              <strong>MASTER</strong>
              <button
                type="button"
                className={mixer.locks.master ? "is-active" : undefined}
                onClick={() => mixerStore.toggleMasterLock()}
                aria-pressed={mixer.locks.master}
                title="Protect master gain from Mix Architect"
              >
                {mixer.locks.master ? "LOCK" : "FREE"}
              </button>
            </div>

            <div className="mix-channel__meter-fader">
              <div className="mix-meter mix-meter--master">
                <i
                  style={{
                    height:
                      Math.round(engine.masterLevel * 100) +
                      "%",
                  }}
                />
              </div>
              <label className="mix-fader">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={normalize(
                    displayState.masterGainDb,
                    MIXER_GAIN_MIN_DB,
                    MIXER_GAIN_MAX_DB,
                  )}
                  disabled={previewLocked}
                  onChange={(event) =>
                    mixerStore.setMasterGainDb(
                      denormalize(
                        Number(event.currentTarget.value),
                        MIXER_GAIN_MIN_DB,
                        MIXER_GAIN_MAX_DB,
                      ),
                    )
                  }
                  aria-label="Mixer master gain"
                />
                <b>{signed(displayState.masterGainDb)} dB</b>
              </label>
            </div>

            <div className="mix-master-actions">
              <MachineButton
                compact
                disabled={previewLocked || !mixer.canUndo}
                onClick={() => mixerStore.undo()}
              >
                UNDO
              </MachineButton>
              <MachineButton
                compact
                disabled={previewLocked || !mixer.canRedo}
                onClick={() => mixerStore.redo()}
              >
                REDO
              </MachineButton>
              <MachineButton
                compact
                disabled={previewLocked}
                onClick={() => mixerStore.reset()}
              >
                RESET MIX
              </MachineButton>
            </div>
          </article>
        </div>
      </section>

      <div className="mix-status">
        <span>
          {arrangement.blueprint
            ? "ARRANGEMENT-AWARE AUTOMATION AVAILABLE"
            : "PATTERN MIX · CREATE/COMMIT AN ARRANGEMENT FOR SECTION AUTOMATION"}
        </span>
        <strong>
          {transport.status.toUpperCase()}
          {" · "}
          {lockedVoices.length}
          {" CHANNEL LOCKS"}
        </strong>
      </div>
    </section>
  );
}
