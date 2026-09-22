import { useMemo, useState } from "react";
import { drumEngine } from "../../audio/DrumEngine";
import {
  DRUM_MATERIAL_LABELS,
  DRUM_MATERIAL_PARAMS,
  drumSoundStore,
  type DrumMaterialParam,
} from "../../audio/drumSoundModel";
import { useDrumSoundSnapshot } from "../../audio/useDrumSounds";
import {
  DRUM_SYNTH_ENGINE_VERSION,
  type DrumMaterialSpec,
} from "../../domain/contracts";
import {
  KIT_DIRECTIONS,
  generateKit,
  type GeneratedKitResult,
  type KitDirectionId,
} from "../../generation/kitGenerator";
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
      <path className="sound-material-scope__ghost" d={path} />
      <path className="sound-material-scope__wave" d={path} />
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

function DnaMeter({
  label,
  value,
}: {
  label: string;
  value: number | undefined;
}) {
  const normalized = value ?? 0;

  return (
    <div className="kit-dna-meter">
      <span>{label}</span>
      <div className="kit-dna-meter__track">
        <i style={{ width: normalized * 100 + "%" }} />
      </div>
      <b>{value === undefined ? "--" : Math.round(normalized * 100)}</b>
    </div>
  );
}

export function SoundSurface() {
  const snapshot = useDrumSoundSnapshot();
  const [selectedVoice, setSelectedVoice] =
    useState<DrumVoiceId>("kick");
  const [direction, setDirection] =
    useState<KitDirectionId>("tight");
  const [variation, setVariation] = useState(48);
  const [kitCounter, setKitCounter] = useState(0);
  const [lastKitResult, setLastKitResult] =
    useState<GeneratedKitResult | null>(null);
  const [kitError, setKitError] = useState<string | null>(null);

  const spec = snapshot.specs[selectedVoice];
  const activeKit = snapshot.activeKit;
  const dna = activeKit?.dna;
  const activeDirection = activeKit?.direction ?? direction;

  const audition = () => {
    void drumEngine.triggerNow(selectedVoice, 0.9);
  };

  const generateCurrentKit = () => {
    const result = generateKit({
      seed:
        "sound-kit:" +
        direction +
        ":" +
        String(kitCounter).padStart(4, "0"),
      direction,
      intensity: variation / 100,
    });

    setKitCounter((value) => value + 1);
    setLastKitResult(result);

    if (!result.validation.valid) {
      setKitError(
        "Kit rejected · Q" +
          result.validation.score +
          " · " +
          (result.validation.reasons[0] ?? "coherence gate failed"),
      );
      return;
    }

    drumSoundStore.applyGeneratedKit({
      specs: result.specs,
      kit: result.kit,
      sounds: result.sounds,
      direction: result.direction,
      seed: result.effectiveSeed,
      dna: result.dna,
    });
    setKitError(null);
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

      <section className="kit-generator-panel" aria-labelledby="kit-generator-title">
        <div className="machine-section-label">
          <span id="kit-generator-title">KIT / GENERATOR</span>
          <span>COHERENCE ENGINE / V1</span>
        </div>

        <div className="kit-generator-panel__body">
          <div className="kit-direction-bank">
            {KIT_DIRECTIONS.map((entry) => (
              <button
                type="button"
                key={entry.id}
                className={
                  direction === entry.id
                    ? "kit-direction-key is-active"
                    : "kit-direction-key"
                }
                onClick={() => setDirection(entry.id)}
                aria-pressed={direction === entry.id}
              >
                <span>{entry.code}</span>
                <strong>{entry.label}</strong>
              </button>
            ))}
          </div>

          <div className="kit-generator-core">
            <div className="kit-generator-core__identity">
              <span>
                {activeKit
                  ? activeKit.kit.id.toUpperCase()
                  : "NO GENERATED KIT"}
              </span>
              <strong>
                {activeKit
                  ? activeKit.kit.name
                  : "Choose a direction"}
              </strong>
              <small>
                {activeKit
                  ? activeDirection.toUpperCase() +
                    (activeKit.modified ? " · MOD" : " · CLEAN")
                  : "8 VOICES / V2 SYNTH"}
              </small>
            </div>

            <SignalRail
              label="VARIATION"
              value={variation}
              tone="ice"
              onChange={setVariation}
            />

            <button
              type="button"
              className="kit-generate-key"
              onClick={generateCurrentKit}
            >
              <span>GENERATE KIT</span>
              <strong>
                {KIT_DIRECTIONS.find((entry) => entry.id === direction)?.code}
              </strong>
            </button>

            <div
              className={
                kitError
                  ? "kit-generator-result is-error"
                  : "kit-generator-result"
              }
              aria-live="polite"
            >
              <span>
                {kitError
                  ? "REJECTED"
                  : lastKitResult
                    ? "ACCEPTED"
                    : "READY"}
              </span>
              <strong>
                {kitError ??
                  (lastKitResult
                    ? "Q" +
                      lastKitResult.validation.score +
                      " / " +
                      lastKitResult.attempts +
                      " TRY / " +
                      lastKitResult.displaySeed
                    : "DETERMINISTIC")}
              </strong>
            </div>
          </div>

          <div className="kit-dna">
            <div className="kit-dna__header">
              <span>SHARED / KIT DNA</span>
              <strong>
                {activeKit
                  ? activeKit.kit.slots.length + " SLOTS / " +
                    activeKit.sounds.length + " SOUNDS"
                  : "WAITING"}
              </strong>
            </div>
            <DnaMeter label="BRIGHT" value={dna?.brightness} />
            <DnaMeter label="WEIGHT" value={dna?.weight} />
            <DnaMeter label="TIGHT" value={dna?.tightness} />
            <DnaMeter label="ROUGH" value={dna?.roughness} />
            <DnaMeter label="SYNTH" value={dna?.synthetic} />
            <DnaMeter label="DEPTH" value={dna?.depth} />
            <DnaMeter label="AIR" value={dna?.air} />
            <DnaMeter label="VAR" value={dna?.variance} />
          </div>
        </div>

        <p className="kit-generator-panel__note">
          One shared DNA shapes all eight voices. HYBRID currently means a
          synthesized acoustic↔electronic material balance; sample layering
          begins later with the sample/hybrid engine.
        </p>
      </section>

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
              <strong>
                {DRUM_PADS.find((pad) => pad.voice === selectedVoice)?.code}
              </strong>
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
            <span>
              {activeKit?.modified ? "KIT MODIFIED" : "VOICE SPEC / SERIALIZABLE"}
            </span>
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
          Generated kits are real Kit + Sound domain objects, but project
          persistence is still session-local until the later Archive/persistence
          phases.
        </span>
        <button type="button" onClick={() => drumSoundStore.resetAll()}>
          RESET ALL VOICES
        </button>
      </div>
    </section>
  );
}
