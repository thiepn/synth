import { useMemo, useState } from "react";
import { useTransportSnapshot } from "../../audio/useTransport";
import {
  FOUNDATION_LANES,
  FOUNDATION_STEP_COUNT,
} from "../../music/foundationPattern";
import { DrumEnginePanel } from "../drums/DrumEngineUI";
import {
  BeatReactor,
  GrooveField,
  InstrumentStrip,
  MachineButton,
  RhythmGlyph,
  SignalRail,
} from "../pulse/Primitives";
import {
  TransportPulseSpine,
  TransportStatusLabel,
} from "../transport/TransportUI";

const seedSequence = ["7F2", "A14", "C83", "19E", "D4B", "6C9"];

const mutationKeys = ["HARD", "SPACE", "FUNK", "PUSH", "DIRTY", "BREAK", "WEIRD", "THIN"];

export function CreateSurface() {
  const transport = useTransportSnapshot();
  const [seedIndex, setSeedIndex] = useState(0);
  const [pulseVersion, setPulseVersion] = useState(0);
  const [similarity, setSimilarity] = useState(38);
  const [energy, setEnergy] = useState(67);
  const [density, setDensity] = useState(54);
  const [groove, setGroove] = useState({ x: 61, y: 46 });
  const [locked, setLocked] = useState<Record<string, boolean>>({
    KICK: true,
    SNARE: true,
    HATS: false,
    PERC: false,
  });
  const [activeMutation, setActiveMutation] = useState("FUNK");

  const currentSeed = seedSequence[seedIndex % seedSequence.length];
  const activeStep =
    transport.status === "running"
      ? Math.floor(transport.position.absoluteTick / 240) % FOUNDATION_STEP_COUNT
      : undefined;

  const glyphVariant = useMemo(
    () => seedIndex + Math.round(groove.x / 34),
    [seedIndex, groove.x],
  );

  const pulseReactor = () => {
    setSeedIndex((value) => (value + 1) % seedSequence.length);
    setPulseVersion((value) => value + 1);
  };

  return (
    <section className="create-surface" aria-labelledby="create-title">
      <div className="surface-heading">
        <div>
          <p className="eyebrow">01 / CREATE</p>
          <h1 id="create-title">Shape the signal.</h1>
        </div>
        <TransportStatusLabel />
      </div>

      <TransportPulseSpine />

      <div className="create-machine">
        <div className="create-machine__intent">
          <div className="machine-section-label">
            <span>A / INTENT</span>
            <span>STYLE VECTOR PREVIEW</span>
          </div>

          <div className="style-vector">
            <div className="style-vector__axis">
              <span>FUNK</span>
              <span>BREAKS</span>
            </div>
            <div className="style-vector__line">
              <span className="style-vector__position" style={{ left: "36%" }} />
            </div>
            <div className="style-vector__axis">
              <span>HIP-HOP</span>
              <span>ELECTRONIC</span>
            </div>
          </div>

          <SignalRail label="ENERGY" value={energy} tone="heat" onChange={setEnergy} />
          <SignalRail label="DENSITY" value={density} onChange={setDensity} />
          <SignalRail
            label="SYNCOPATION"
            value={Math.round(groove.x)}
            tone="ice"
            onChange={(next) => setGroove((value) => ({ ...value, x: next }))}
          />
        </div>

        <div className="create-machine__reactor">
          <BeatReactor
            seed={currentSeed}
            similarity={similarity}
            pulseVersion={pulseVersion}
            onPulse={pulseReactor}
            onSimilarityChange={setSimilarity}
          />

          <div className="reactor-locks" aria-label="Generation lock preview">
            {FOUNDATION_LANES.map((strip) => (
              <button
                type="button"
                key={strip.name}
                className={locked[strip.name] ? "reactor-lock is-on" : "reactor-lock"}
                onClick={() =>
                  setLocked((value) => ({
                    ...value,
                    [strip.name]: !value[strip.name],
                  }))
                }
                aria-pressed={locked[strip.name]}
              >
                <span>{strip.code}</span>
                <span className="reactor-lock__lamp" />
              </button>
            ))}
          </div>
        </div>

        <div className="create-machine__glyph">
          <div className="machine-section-label">
            <span>B / SIGNATURE</span>
            <span>SYN-{currentSeed}-01</span>
          </div>

          <div className="glyph-stage">
            <RhythmGlyph variant={glyphVariant} label={"Rhythm glyph for " + currentSeed} />
            <div className="glyph-stage__scan" aria-hidden="true" />
          </div>

          <dl className="signal-readout">
            <div>
              <dt>ENERGY</dt>
              <dd>{Math.round(energy).toString().padStart(2, "0")}</dd>
            </div>
            <div>
              <dt>DENSITY</dt>
              <dd>{Math.round(density).toString().padStart(2, "0")}</dd>
            </div>
            <div>
              <dt>MOTION</dt>
              <dd>{Math.round(groove.y).toString().padStart(2, "0")}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="groove-and-mutate">
        <GrooveField
          x={groove.x}
          y={groove.y}
          onChange={(x, y) => setGroove({ x, y })}
        />

        <div className="mutation-bank">
          <div className="machine-section-label">
            <span>MUTATION / VERBS</span>
            <span>UI STATE ONLY</span>
          </div>
          <div className="mutation-bank__grid">
            {mutationKeys.map((mutation) => (
              <MachineButton
                key={mutation}
                active={activeMutation === mutation}
                onClick={() => setActiveMutation(mutation)}
              >
                {mutation}
              </MachineButton>
            ))}
          </div>
          <p className="mutation-bank__note">
            Active intent: <strong>{activeMutation}</strong>. Musical mutations connect in Phase 9.
          </p>
        </div>
      </div>

      <DrumEnginePanel />

      <div className="strip-bank">
        <div className="machine-section-label">
          <span>INSTRUMENT / STRIPS</span>
          <span>{transport.status === "running" ? "LIVE FOUNDATION BEAT" : "RHYTHM / AUDIO SOURCE"}</span>
        </div>
        {FOUNDATION_LANES.map((strip) => (
          <InstrumentStrip
            key={strip.name}
            code={strip.code}
            name={strip.name}
            values={strip.values}
            accent={strip.accent}
            detail={strip.detail}
            activeStep={activeStep}
            locked={locked[strip.name]}
            onToggleLock={() =>
              setLocked((value) => ({
                ...value,
                [strip.name]: !value[strip.name],
              }))
            }
          />
        ))}
      </div>
    </section>
  );
}
