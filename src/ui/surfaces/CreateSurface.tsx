import { useMemo, useState } from "react";
import { TRANSPORT_SCHEDULER_CONFIG } from "../../audio/AudioTransport";
import { useTransportSnapshot } from "../../audio/useTransport";
import {
  BEAT_STYLES,
  generateBeat,
  type BeatGenerationResult,
  type BeatStyleId,
} from "../../generation/beatGenerator";
import { FOUNDATION_LANES } from "../../music/foundationPattern";
import { sequencerStore } from "../../sequencer/SequencerStore";
import { useSequencerSnapshot } from "../../sequencer/useSequencer";
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

const mutationKeys = [
  "HARD",
  "SPACE",
  "FUNK",
  "PUSH",
  "DIRTY",
  "BREAK",
  "WEIRD",
  "THIN",
];

export function CreateSurface() {
  const transport = useTransportSnapshot();
  const sequencer = useSequencerSnapshot();

  const [style, setStyle] = useState<BeatStyleId>("funk");
  const [energy, setEnergy] = useState(67);
  const [density, setDensity] = useState(54);
  const [complexity, setComplexity] = useState(52);
  const [syncopation, setSyncopation] = useState(61);
  const [swing, setSwing] = useState(18);
  const [generationCounter, setGenerationCounter] = useState(0);
  const [generationVersion, setGenerationVersion] = useState(0);
  const [lastGeneration, setLastGeneration] =
    useState<BeatGenerationResult | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const activeStep =
    transport.status === "running"
      ? Math.floor(
          transport.position.absoluteTick /
            TRANSPORT_SCHEDULER_CONFIG.pulseTicks,
        ) % sequencer.lengthSteps
      : undefined;

  const glyphVariant = useMemo(
    () => generationVersion + Math.round(syncopation / 34),
    [generationVersion, syncopation],
  );

  const generateCurrentBeat = () => {
    const baseSeed =
      "create:" +
      style +
      ":" +
      String(generationCounter).padStart(4, "0") +
      ":" +
      sequencer.lengthSteps;

    const result = generateBeat({
      seed: baseSeed,
      style,
      intent: {
        energy: energy / 100,
        density: density / 100,
        complexity: complexity / 100,
        syncopation: syncopation / 100,
        swing: swing / 100,
      },
      stepCount: sequencer.lengthSteps,
      bpm: transport.bpm,
      meter: transport.meter,
    });

    setGenerationCounter((value) => value + 1);
    setGenerationVersion((value) => value + 1);

    if (!result.validation.valid) {
      setGenerationError(
        "Generator rejected candidate · score " +
          result.validation.score +
          " · " +
          (result.validation.reasons[0] ?? "quality gate failed"),
      );
      return;
    }

    try {
      sequencerStore.applyGeneratedPattern(result.pattern);
      setLastGeneration(result);
      setGenerationError(null);
    } catch (error) {
      setGenerationError(
        error instanceof Error ? error.message : String(error),
      );
    }
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
            <span>A / GENERATOR INTENT</span>
            <span>RULE ENGINE / V1</span>
          </div>

          <div className="style-bank" aria-label="Beat style">
            {BEAT_STYLES.map((entry) => (
              <button
                type="button"
                key={entry.id}
                className={
                  style === entry.id
                    ? "style-bank__key is-active"
                    : "style-bank__key"
                }
                onClick={() => setStyle(entry.id)}
                aria-pressed={style === entry.id}
              >
                <span>{entry.code}</span>
                <strong>{entry.label}</strong>
              </button>
            ))}
          </div>

          <SignalRail
            label="ENERGY"
            value={energy}
            tone="heat"
            onChange={setEnergy}
          />
          <SignalRail
            label="DENSITY"
            value={density}
            onChange={setDensity}
          />
          <SignalRail
            label="COMPLEXITY"
            value={complexity}
            tone="phosphor"
            onChange={setComplexity}
          />
          <SignalRail
            label="SYNCOPATION"
            value={syncopation}
            tone="ice"
            onChange={setSyncopation}
          />
          <SignalRail
            label="SWING"
            value={swing}
            tone="ice"
            onChange={setSwing}
          />
        </div>

        <div className="create-machine__reactor">
          <BeatReactor
            seed={lastGeneration?.displaySeed ?? "READY"}
            intensity={complexity}
            generationVersion={generationVersion}
            onGenerate={generateCurrentBeat}
            onIntensityChange={setComplexity}
          />

          <div className="reactor-locks" aria-label="Lane locks activate in Phase 6">
            {FOUNDATION_LANES.map((strip) => (
              <button
                type="button"
                key={strip.name}
                className="reactor-lock"
                disabled
                title="Lock and reroll arrives in Phase 6"
              >
                <span>{strip.code}</span>
                <span className="reactor-lock__lamp" />
              </button>
            ))}
          </div>

          <div
            className={
              generationError
                ? "generation-result is-error"
                : "generation-result"
            }
            aria-live="polite"
          >
            <span>
              {generationError
                ? "REJECTED"
                : lastGeneration
                  ? "ACCEPTED"
                  : "READY"}
            </span>
            <strong>
              {generationError
                ? generationError
                : lastGeneration
                  ? "Q" +
                    String(lastGeneration.validation.score).padStart(2, "0") +
                    " / " +
                    lastGeneration.attempts +
                    " TRY"
                  : "PRESS GENERATE"}
            </strong>
          </div>
        </div>

        <div className="create-machine__glyph">
          <div className="machine-section-label">
            <span>B / SIGNATURE</span>
            <span>
              {lastGeneration
                ? "SYN-" + lastGeneration.displaySeed
                : "NO GENERATION"}
            </span>
          </div>

          <div className="glyph-stage">
            <RhythmGlyph
              variant={glyphVariant}
              label={
                lastGeneration
                  ? "Generated rhythm signature " +
                    lastGeneration.displaySeed
                  : "Waiting for generated rhythm"
              }
            />
            <div className="glyph-stage__scan" aria-hidden="true" />
          </div>

          <dl className="signal-readout">
            <div>
              <dt>STYLE</dt>
              <dd>{BEAT_STYLES.find((entry) => entry.id === style)?.code}</dd>
            </div>
            <div>
              <dt>QUALITY</dt>
              <dd>
                {lastGeneration
                  ? String(lastGeneration.validation.score).padStart(2, "0")
                  : "--"}
              </dd>
            </div>
            <div>
              <dt>TRIES</dt>
              <dd>
                {lastGeneration
                  ? String(lastGeneration.attempts).padStart(2, "0")
                  : "--"}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="groove-and-mutate">
        <GrooveField
          x={syncopation}
          y={density}
          labels={{
            nw: "DENSE",
            ne: "DENSE / SYNC",
            sw: "STRAIGHT",
            se: "SPARSE / SYNC",
          }}
          onChange={(x, y) => {
            setSyncopation(x);
            setDensity(y);
          }}
        />

        <div className="mutation-bank">
          <div className="machine-section-label">
            <span>MUTATION / VERBS</span>
            <span>PHASE 9 / INACTIVE</span>
          </div>
          <div className="mutation-bank__grid">
            {mutationKeys.map((mutation) => (
              <MachineButton key={mutation} disabled>
                {mutation}
              </MachineButton>
            ))}
          </div>
          <p className="mutation-bank__note">
            Beat generation is live. Lock / reroll arrives in Phase 6;
            semantic mutation verbs remain reserved for Phase 9.
          </p>
        </div>
      </div>

      <DrumEnginePanel />

      <div className="strip-bank">
        <div className="machine-section-label">
          <span>INSTRUMENT / STRIPS</span>
          <span>
            {transport.status === "running"
              ? "LIVE GENERATED PATTERN"
              : "EDIT IN 02 / SEQUENCE"}
          </span>
        </div>
        {FOUNDATION_LANES.map((strip) => (
          <InstrumentStrip
            key={strip.name}
            code={strip.code}
            name={strip.name}
            values={sequencerStore.getLaneValues(strip.id)}
            accent={strip.accent}
            detail={strip.detail}
            activeStep={activeStep}
            lockDisabled
          />
        ))}
      </div>
    </section>
  );
}
