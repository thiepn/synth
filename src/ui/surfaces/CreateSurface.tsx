import { useEffect, useMemo, useState } from "react";
import { TRANSPORT_SCHEDULER_CONFIG } from "../../audio/AudioTransport";
import { useTransportSnapshot } from "../../audio/useTransport";
import {
  BEAT_STYLES,
  generateBeat,
  validateGeneratedBeat,
  type BeatGenerationResult,
  type BeatStyleId,
} from "../../generation/beatGenerator";
import {
  rerollBeat,
  type BeatVariationResult,
} from "../../generation/beatVariation";
import { shortSeed } from "../../generation/prng";
import {
  applyGroove,
  resetGroove,
  type GrooveApplyResult,
  type GroovePersonalityId,
} from "../../groove/grooveEngine";
import { deriveRhythmGlyph } from "../../visual/rhythmGlyph";
import {
  FOUNDATION_LANES,
  SEQUENCER_LANES,
} from "../../music/foundationPattern";
import { sequencerStore } from "../../sequencer/SequencerStore";
import { useSequencerSnapshot } from "../../sequencer/useSequencer";
import { DrumEnginePanel } from "../drums/DrumEngineUI";
import { GrooveEnginePanel } from "../groove/GrooveEngineUI";
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

type ReactorOperation =
  | {
      kind: "generate";
      result: BeatGenerationResult;
    }
  | {
      kind: "reroll";
      result: BeatVariationResult;
      target: string;
    };

function provenanceStyle(
  styleVector: Record<string, number> | undefined,
): BeatStyleId | undefined {
  if (!styleVector) return undefined;

  const strongest = Object.entries(styleVector).sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0];

  return BEAT_STYLES.some((entry) => entry.id === strongest)
    ? (strongest as BeatStyleId)
    : undefined;
}

export function CreateSurface() {
  const transport = useTransportSnapshot();
  const sequencer = useSequencerSnapshot();

  const [style, setStyle] = useState<BeatStyleId>("funk");
  const [energy, setEnergy] = useState(67);
  const [density, setDensity] = useState(54);
  const [complexity, setComplexity] = useState(52);
  const [syncopation, setSyncopation] = useState(61);
  const [swing, setSwing] = useState(18);
  const [personality, setPersonality] =
    useState<GroovePersonalityId>("human");
  const [humanization, setHumanization] = useState(46);
  const [ghostNotes, setGhostNotes] = useState(28);
  const [lastGrooveResult, setLastGrooveResult] =
    useState<GrooveApplyResult | null>(null);
  const [distance, setDistance] = useState(42);
  const [operationCounter, setOperationCounter] = useState(0);
  const [reactorVersion, setReactorVersion] = useState(0);
  const [lastOperation, setLastOperation] =
    useState<ReactorOperation | null>(null);
  const [operationError, setOperationError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const groove = sequencer.pattern.groove;
    if (!groove) return;

    setPersonality(groove.personality);
    setHumanization(Math.round(groove.humanization * 100));
    setGhostNotes(Math.round((groove.ghostNoteAmount ?? 0) * 100));
    setSwing(Math.round(groove.swing * 100));
  }, [sequencer.pattern.id]);

  const lockedLaneIds = useMemo(
    () =>
      sequencer.pattern.lanes
        .filter((lane) => lane.lock.rhythm)
        .map((lane) => lane.id),
    [sequencer.pattern],
  );

  const activeStep =
    transport.status === "running"
      ? Math.floor(
          transport.position.absoluteTick /
            TRANSPORT_SCHEDULER_CONFIG.pulseTicks,
        ) % sequencer.lengthSteps
      : undefined;

  const currentPatternStyle =
    provenanceStyle(sequencer.pattern.provenance?.style) ?? style;
  const currentValidation = useMemo(
    () => validateGeneratedBeat(sequencer.pattern, currentPatternStyle),
    [sequencer.pattern, currentPatternStyle],
  );
  const currentSeed = sequencer.pattern.provenance?.seed
    ? shortSeed(sequencer.pattern.provenance.seed)
    : "MANUAL";
  const canReroll =
    Boolean(sequencer.pattern.provenance) ||
    lockedLaneIds.length > 0 ||
    sequencer.revision > 0;

  const glyphGeometry = useMemo(
    () => deriveRhythmGlyph(sequencer.pattern),
    [sequencer.pattern],
  );

  const grooveRequest = (pattern: typeof sequencer.pattern, seed?: string) => ({
    source: pattern,
    seed:
      seed ??
      pattern.groove?.seed ??
      "groove:" + (pattern.provenance?.seed ?? pattern.id),
    personality,
    humanization: humanization / 100,
    ghostNoteAmount: ghostNotes / 100,
    swing: swing / 100,
  });

  const applyCurrentFeel = () => {
    const result = applyGroove(grooveRequest(sequencer.pattern));
    sequencerStore.applyPatternTransform(result.pattern);
    setLastGrooveResult(result);
  };

  const resetCurrentFeel = () => {
    sequencerStore.applyPatternTransform(resetGroove(sequencer.pattern));
    setPersonality("mechanical");
    setHumanization(0);
    setGhostNotes(0);
    setSwing(0);
    setLastGrooveResult(null);
  };

  const intent = () => ({
    energy: energy / 100,
    density: density / 100,
    complexity: complexity / 100,
    syncopation: syncopation / 100,
    swing: swing / 100,
  });

  const recordFailure = (message: string) => {
    setOperationError(message);
    setReactorVersion((value) => value + 1);
    setOperationCounter((value) => value + 1);
  };

  const generateFreshBeat = () => {
    const result = generateBeat({
      seed:
        "create:" +
        style +
        ":" +
        String(operationCounter).padStart(4, "0") +
        ":" +
        sequencer.lengthSteps,
      style,
      intent: intent(),
      stepCount: sequencer.lengthSteps,
      bpm: transport.bpm,
      meter: transport.meter,
    });

    if (!result.validation.valid) {
      recordFailure(
        "Generator rejected candidate · score " +
          result.validation.score +
          " · " +
          (result.validation.reasons[0] ?? "quality gate failed"),
      );
      return;
    }

    try {
      const grooved = applyGroove(
        grooveRequest(result.pattern, "groove:" + result.effectiveSeed),
      );
      sequencerStore.applyGeneratedPattern(grooved.pattern);
      setLastGrooveResult(grooved);
      setLastOperation({ kind: "generate", result });
      setOperationError(null);
      setReactorVersion((value) => value + 1);
      setOperationCounter((value) => value + 1);
    } catch (error) {
      recordFailure(
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const rerollCurrentBeat = (targetLaneIds?: readonly string[]) => {
    const targetKey =
      targetLaneIds && targetLaneIds.length > 0
        ? targetLaneIds.join("+")
        : "all-unlocked";

    try {
      const result = rerollBeat({
        source: sequencer.pattern,
        seed:
          "reroll:" +
          sequencer.pattern.id +
          ":" +
          targetKey +
          ":" +
          String(operationCounter).padStart(4, "0"),
        style,
        intent: intent(),
        distance: distance / 100,
        bpm: transport.bpm,
        targetLaneIds,
      });

      if (!result.accepted) {
        recordFailure(
          "Reroll rejected · score " +
            result.validation.score +
            " · " +
            (result.validation.reasons[0] ?? "quality gate failed"),
        );
        return;
      }

      const grooved = applyGroove(
        grooveRequest(
          result.pattern,
          sequencer.pattern.groove?.seed ??
            "groove:" + result.effectiveSeed,
        ),
      );
      sequencerStore.applyGeneratedPattern(grooved.pattern);
      setLastGrooveResult(grooved);
      setLastOperation({
        kind: "reroll",
        result,
        target: targetKey,
      });
      setOperationError(null);
      setReactorVersion((value) => value + 1);
      setOperationCounter((value) => value + 1);
    } catch (error) {
      recordFailure(
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  const handleReactorAction = () => {
    if (canReroll) {
      rerollCurrentBeat();
    } else {
      generateFreshBeat();
    }
  };

  const lastStatus =
    lastOperation?.kind === "reroll"
      ? "Δ" +
        String(lastOperation.result.changedStepCount).padStart(2, "0") +
        " / " +
        lastOperation.result.changedLaneIds.length +
        " LANE"
      : lastOperation?.kind === "generate"
        ? "Q" +
          String(lastOperation.result.validation.score).padStart(2, "0") +
          " / " +
          lastOperation.result.attempts +
          " TRY"
        : "PRESS " + (canReroll ? "REROLL" : "GENERATE");

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
            onChange={setComplexity}
          />
          <SignalRail
            label="SYNCOPATION"
            value={syncopation}
            tone="ice"
            onChange={setSyncopation}
          />
        </div>

        <div className="create-machine__reactor">
          <BeatReactor
            seed={currentSeed}
            distance={distance}
            generationVersion={reactorVersion}
            actionLabel={canReroll ? "REROLL" : "GENERATE"}
            onAction={handleReactorAction}
            onDistanceChange={setDistance}
          />

          <div className="reroll-distance-readout">
            <span>CHANGE / DISTANCE</span>
            <strong>
              {distance < 18
                ? "SUBTLE"
                : distance < 48
                  ? "RELATED"
                  : distance < 78
                    ? "MUTATE"
                    : "WILD"}
            </strong>
            <span>{String(Math.round(distance)).padStart(3, "0")}</span>
          </div>

          <div className="reactor-lane-bank" aria-label="Lane lock and reroll controls">
            {SEQUENCER_LANES.map((definition) => {
              const locked = sequencerStore.isLaneRhythmLocked(
                definition.id,
              );

              return (
                <div
                  className={
                    locked
                      ? "reactor-lane-control is-locked"
                      : "reactor-lane-control"
                  }
                  key={definition.id}
                >
                  <button
                    type="button"
                    className="reactor-lane-control__lock"
                    onClick={() =>
                      sequencerStore.toggleLaneRhythmLock(definition.id)
                    }
                    aria-pressed={locked}
                    title={
                      locked
                        ? "Unlock " + definition.name
                        : "Lock " + definition.name + " rhythm"
                    }
                  >
                    <span>{definition.code}</span>
                    <i aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    className="reactor-lane-control__reroll"
                    onClick={() => rerollCurrentBeat([definition.id])}
                    disabled={locked}
                    aria-label={"Reroll " + definition.name}
                    title={
                      locked
                        ? definition.name + " is locked"
                        : "Reroll only " + definition.name
                    }
                  >
                    ↻
                  </button>
                </div>
              );
            })}
          </div>

          <div
            className={
              operationError
                ? "generation-result is-error"
                : "generation-result"
            }
            aria-live="polite"
          >
            <span>
              {operationError
                ? "REJECTED"
                : lastOperation?.kind === "reroll"
                  ? "REROLLED"
                  : lastOperation?.kind === "generate"
                    ? "GENERATED"
                    : canReroll
                      ? "READY / " + lockedLaneIds.length + " LOCK"
                      : "READY"}
            </span>
            <strong>{operationError ?? lastStatus}</strong>
          </div>
        </div>

        <div className="create-machine__glyph">
          <div className="machine-section-label">
            <span>B / SIGNATURE</span>
            <span>{"RG-" + glyphGeometry.signature.slice(0, 6)}</span>
          </div>

          <div className="glyph-stage">
            <RhythmGlyph
              geometry={glyphGeometry}
              label={
                "Rhythm glyph " +
                glyphGeometry.signature +
                " for current pattern"
              }
            />
            <div className="glyph-stage__scan" aria-hidden="true" />
          </div>

          <dl className="signal-readout">
            <div>
              <dt>STYLE</dt>
              <dd>
                {BEAT_STYLES.find(
                  (entry) => entry.id === currentPatternStyle,
                )?.code ?? "--"}
              </dd>
            </div>
            <div>
              <dt>QUALITY</dt>
              <dd>
                {String(currentValidation.score).padStart(2, "0")}
              </dd>
            </div>
            <div>
              <dt>LOCKS</dt>
              <dd>{String(lockedLaneIds.length).padStart(2, "0")}</dd>
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
            Lock and reroll are live. Semantic mutation verbs remain
            reserved for Phase 9.
          </p>
        </div>
      </div>

      <GrooveEnginePanel
        personality={personality}
        humanization={humanization}
        ghostNotes={ghostNotes}
        swing={swing}
        lastResult={lastGrooveResult}
        onPersonalityChange={setPersonality}
        onHumanizationChange={setHumanization}
        onGhostNotesChange={setGhostNotes}
        onSwingChange={setSwing}
        onApply={applyCurrentFeel}
        onReset={resetCurrentFeel}
      />

      <DrumEnginePanel />

      <div className="strip-bank">
        <div className="machine-section-label">
          <span>INSTRUMENT / STRIPS</span>
          <span>
            {transport.status === "running"
              ? "LIVE DERIVED PATTERN"
              : "LOCK / REROLL ACTIVE"}
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
            locked={sequencerStore.isLaneRhythmLocked(strip.id)}
            onToggleLock={() =>
              sequencerStore.toggleLaneRhythmLock(strip.id)
            }
          />
        ))}
      </div>
    </section>
  );
}
