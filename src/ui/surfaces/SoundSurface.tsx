import { useMemo, useState } from "react";
import { drumEngine } from "../../audio/DrumEngine";
import {
  DRUM_MATERIAL_LABELS,
  DRUM_MATERIAL_PARAMS,
  DRUM_SYNTH_ENGINE_VERSION,
  drumSoundStore,
  type DrumMaterialParam,
  type DrumMaterialSpec,
} from "../../audio/drumSoundModel";
import { useDrumSoundSnapshot } from "../../audio/useDrumSounds";
import {
  DRUM_PADS,
  type DrumVoiceId,
} from "../../music/foundationPattern";
import { SignalRail } from "../pulse/Primitives";
import {
  TransportPulseSpine,
  TransportStatusLabel,
} from "../transport/TransportUI";

function paramLabel(
  voice: DrumVoiceId,
  param: DrumMaterialParam,
): string {
  return (
    DRUM_MATERIAL_LABELS[voice][param] ??
    param.toUpperCase()
  );
}

function materialPath(spec: DrumMaterialSpec): string {
  const points = Array.from({ length: 48 }, (_, index) => {
    const t = index / 47;
    const attack = Math.exp(-t * (6 + spec.impact * 8));
    const body =
      Math.sin(t * Math.PI * (2 + spec.pitch * 5)) *
      Math.exp(-t * (1.5 + (1 - spec.decay) * 5)) *
      spec.body;
    const noise =
      Math.sin(t * Math.PI * (17 + spec.character * 19)) *
      Math.exp(-t * (3 + (1 - spec.air) * 7)) *
      spec.noise *
      0.35;
    const value =
      body * 0.7 +
      noise +
      attack * (spec.impact - 0.5) * 0.7;
    const x = 5 + t * 190;
    const y = 50 - value * 33;
    return [x, Math.max(7, Math.min(93, y))] as const;
  });

  return points
    .map(([x, y], index) =>
      (index === 0 ? "M" : "L") +
      x.toFixed(2) +
      " " +
      y.toFixed(2),
    )
    .join(" ");
}

function voiceDescriptor(voice: DrumVoiceId): string {
  switch (voice) {
    case "kick":
      return "BODY / SUB / CLICK";
    case "snare":
      return "BODY / RING / NOISE / SNAP";
    case "clap":
      return "BURST / THICKNESS / SPREAD";
    case "closedHat":
      return "METAL BANK / NOISE / AIR";
    case "openHat":
      return "METAL BANK / WASH / CHOKE";
    case "tom":
      return "BODY / PITCH DROP / ATTACK";
    case "percussion":
      return "FM / RESONATOR / TEXTURE";
    case "crash":
      return "METAL BANK / WASH / AIR";
  }
}

function MaterialScope({
  spec,
}: {
  spec: DrumMaterialSpec;
}) {
  const path = useMemo(() => materialPath(spec), [spec]);

  return (
    <svg
      className="sound-material-scope"
      viewBox="0 0 200 100"
      role="img"
      aria-label={spec.voice + " synthesis material preview"}
    >
      <path
        className="sound-material-scope__grid"
        d="M5 25 H195 M5 50 H195 M5 75 H195 M50 7 V93 M100 7 V93 M150 7 V93"
      />
      <path
        className="sound-material-scope__ghost"
        d={path}
      />
      <path
        className="sound-material-scope__wave"
        d={path}
      />
      <line
        className="sound-material-scope__impact"
        x1="12"
        y1={50 - spec.impact * 30}
        x2="12"
        y2={50 + spec.impact * 30}
      />
    </svg>
  );
}

export function SoundSurface() {
  const snapshot = useDrumSoundSnapshot();
  const [selectedVoice, setSelectedVoice] =
    useState<DrumVoiceId>("kick");
  const spec = snapshot.specs[selectedVoice];

  const audition = () => {
    void drumEngine.triggerNow(selectedVoice, 0.9);
  };

  return (
    <section className="sound-surface" aria-labelledby="sound-title">
      <div className="surface-heading">
        <div>
          <p className="eyebrow">03 / SOUND</p>
          <h1 id="sound-title">Engineer the material.</h1>
        </div>
        <TransportStatusLabel />
      </div>

      <TransportPulseSpine />

      <div className="sound-machine">
        <div className="sound-voice-bank">
          <div className="machine-section-label">
            <span>A / VOICE</span>
            <span>SYNTH V{DRUM_SYNTH_ENGINE_VERSION}</span>
          </div>

          <div className="sound-voice-bank__grid">
            {DRUM_PADS.map((pad) => (
              <button
                type="button"
                key={pad.voice}
                className={[
                  "sound-voice-key",
                  "sound-voice-key--" + pad.tone,
                  selectedVoice === pad.voice ? "is-active" : "",
                ].join(" ")}
                onClick={() => setSelectedVoice(pad.voice)}
                aria-pressed={selectedVoice === pad.voice}
              >
                <span>{pad.code}</span>
                <strong>{pad.label}</strong>
              </button>
            ))}
          </div>

          <div className="sound-voice-bank__actions">
            <button type="button" onClick={audition}>
              <span>TRIGGER</span>
              <strong>▶</strong>
            </button>
            <button
              type="button"
              onClick={() => drumSoundStore.resetVoice(selectedVoice)}
            >
              <span>RESET</span>
              <strong>{DRUM_PADS.find((pad) => pad.voice === selectedVoice)?.code}</strong>
            </button>
          </div>
        </div>

        <div className="sound-material-stage">
          <div className="machine-section-label">
            <span>B / MATERIAL</span>
            <span>{voiceDescriptor(selectedVoice)}</span>
          </div>

          <div className="sound-material-stage__scope">
            <MaterialScope spec={spec} />
            <div className="sound-material-stage__identity">
              <span>{selectedVoice.toUpperCase()}</span>
              <strong>
                {DRUM_PADS.find((pad) => pad.voice === selectedVoice)?.label}
              </strong>
              <small>
                REV {String(snapshot.revision).padStart(3, "0")}
              </small>
            </div>
          </div>

          <div className="sound-material-blocks">
            <div>
              <span>IMPACT</span>
              <b style={{ height: 12 + spec.impact * 36 }} />
            </div>
            <div>
              <span>BODY</span>
              <b style={{ height: 12 + spec.body * 36 }} />
            </div>
            <div>
              <span>NOISE</span>
              <b style={{ height: 12 + spec.noise * 36 }} />
            </div>
            <div>
              <span>AIR</span>
              <b style={{ height: 12 + spec.air * 36 }} />
            </div>
          </div>
        </div>

        <div className="sound-material-controls">
          <div className="machine-section-label">
            <span>C / SHAPE</span>
            <span>VOICE SPEC / SERIALIZABLE</span>
          </div>

          <div className="sound-material-controls__rails">
            {DRUM_MATERIAL_PARAMS.map((param) => (
              <SignalRail
                key={param}
                label={paramLabel(selectedVoice, param)}
                value={spec[param] * 100}
                tone={
                  param === "impact"
                    ? "heat"
                    : param === "air" || param === "tone"
                      ? "ice"
                      : "phosphor"
                }
                onChange={(value) =>
                  drumSoundStore.setParam(
                    selectedVoice,
                    param,
                    value / 100,
                  )
                }
              />
            ))}
          </div>
        </div>
      </div>

      <div className="sound-signal-path">
        <div className="machine-section-label">
          <span>SIGNAL / PATH</span>
          <span>VOICE → MASTER</span>
        </div>

        <div className="sound-signal-path__rail">
          <span>IMPACT</span>
          <i>+</i>
          <span>BODY</span>
          <i>+</i>
          <span>NOISE</span>
          <i>→</i>
          <span>FILTER</span>
          <i>→</i>
          <span>DRIVE</span>
          <i>→</i>
          <span>SPACE</span>
          <i>→</i>
          <span>LIMIT</span>
        </div>
      </div>

      <div className="sound-reset-all">
        <span>
          SOUND state is session-local. Phase 12 will generate coherent kits
          from these V2 material specifications.
        </span>
        <button type="button" onClick={() => drumSoundStore.resetAll()}>
          RESET ALL VOICES
        </button>
      </div>
    </section>
  );
}
