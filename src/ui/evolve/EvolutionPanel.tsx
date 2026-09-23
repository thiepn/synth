import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { audioTransport } from "../../audio/AudioTransport";
import { drumEngine } from "../../audio/DrumEngine";
import { useTransportSnapshot } from "../../audio/useTransport";
import type {
  BeatGenerationIntent,
  BeatStyleId,
} from "../../generation/beatGenerator";
import {
  type EvolutionArcId,
  type EvolutionBars,
  type EvolutionSegmentRole,
} from "../../generation/evolutionEngine";
import { beatFamilyStore } from "../../family/BeatFamilyStore";
import { evolutionStore } from "../../evolve/EvolutionStore";
import { useEvolutionSnapshot } from "../../evolve/useEvolution";
import { generationHistoryStore } from "../../history/GenerationHistoryStore";
import { sequencerStore } from "../../sequencer/SequencerStore";
import { deriveRhythmGlyph } from "../../visual/rhythmGlyph";
import {
  MachineButton,
  RhythmGlyph,
  SignalRail,
} from "../pulse/Primitives";

const BAR_OPTIONS: EvolutionBars[] = [4, 8, 16, 32, 64];

const ARC_OPTIONS: ReadonlyArray<{
  id: EvolutionArcId;
  label: string;
  code: string;
}> = [
  { id: "steady", label: "Steady", code: "STD" },
  { id: "rise", label: "Rise", code: "RIS" },
  { id: "wave", label: "Wave", code: "WAV" },
  { id: "contrast", label: "Contrast", code: "CON" },
];

function roleCode(role: EvolutionSegmentRole): string {
  switch (role) {
    case "anchor": return "ANC";
    case "variation": return "VAR";
    case "build": return "BLD";
    case "breakdown": return "BRK";
    case "drop": return "DRP";
    case "fill": return "FIL";
    case "return": return "RTN";
  }
}

export function EvolutionPanel({
  pattern,
  style,
  intent,
  bpm,
}: {
  pattern: ReturnType<typeof sequencerStore.getSnapshot>["pattern"];
  style: BeatStyleId;
  intent: BeatGenerationIntent;
  bpm: number;
}) {
  const evolution = useEvolutionSnapshot();
  const transport = useTransportSnapshot();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    evolutionStore.setSource(pattern);
  }, [pattern]);

  useEffect(
    () => () => {
      evolutionStore.setPreviewActive(false);
    },
    [],
  );

  const selected =
    evolution.plan?.segments[evolution.selectedIndex] ??
    evolution.plan?.segments[0];

  const selectedGeometry = useMemo(
    () => (selected ? deriveRhythmGlyph(selected.pattern) : undefined),
    [selected],
  );

  const playingIndex =
    evolution.previewActive && evolution.plan && evolution.plan.totalTicks > 0
      ? evolution.plan.segments.findIndex((segment) => {
          const planTick =
            transport.position.absoluteTick % evolution.plan!.totalTicks;
          return (
            planTick >= segment.startTick &&
            planTick < segment.startTick + segment.lengthTicks
          );
        })
      : -1;

  const generate = () => {
    try {
      evolutionStore.generate(style, intent, bpm);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : String(caught),
      );
    }
  };

  const togglePreview = () => {
    if (!evolution.plan) return;

    const next = !evolution.previewActive;
    evolutionStore.setPreviewActive(next);

    if (next && transport.status !== "running") {
      void audioTransport.start();
    }
  };

  const useSelected = () => {
    if (!selected) return;

    const current = sequencerStore.getSnapshot().pattern;
    const prepared =
      generationHistoryStore.prepareCreativePattern(
        current,
        selected.pattern,
      );

    evolutionStore.setPreviewActive(false);
    sequencerStore.restorePatternSnapshot(prepared.pattern);
    const applied = sequencerStore.getSnapshot().pattern;

    generationHistoryStore.commitPrepared(
      {
        parentNodeId: prepared.parentNodeId,
        pattern: applied,
      },
      "evolve",
      "EVOLVE / BAR " + String(selected.index + 1).padStart(2, "0"),
      applied.name,
    );

    setError(null);
  };

  const auditionSelected = () => {
    if (!selected || transport.status === "running") return;
    void drumEngine.auditionPattern(selected.pattern, bpm);
  };

  const useFamily = () => {
    if (!evolution.plan) return;
    beatFamilyStore.apply(evolution.plan.family);
    setError(null);
  };

  return (
    <section className="evolution-panel" aria-labelledby="evolution-title">
      <div className="machine-section-label">
        <span id="evolution-title">EVOLVE / LONG-FORM DEVELOPMENT</span>
        <span>DETERMINISTIC MULTI-BAR PLAN / V1</span>
      </div>

      <div className="evolution-controls">
        <div className="evolution-bank">
          <span>BARS</span>
          <div>
            {BAR_OPTIONS.map((bars) => (
              <button
                type="button"
                key={bars}
                className={
                  evolution.config.bars === bars ? "is-active" : undefined
                }
                onClick={() => evolutionStore.setBars(bars)}
              >
                {bars}
              </button>
            ))}
          </div>
        </div>

        <div className="evolution-bank">
          <span>ARC</span>
          <div>
            {ARC_OPTIONS.map((arc) => (
              <button
                type="button"
                key={arc.id}
                className={
                  evolution.config.arc === arc.id ? "is-active" : undefined
                }
                onClick={() => evolutionStore.setArc(arc.id)}
                title={arc.label}
              >
                {arc.code}
              </button>
            ))}
          </div>
        </div>

        <SignalRail
          label="EVOLUTION"
          value={evolution.config.intensity * 100}
          minLabel="STABLE"
          maxLabel="DEVELOP"
          tone="ice"
          onChange={(value) =>
            evolutionStore.setIntensity(value / 100)
          }
        />

        <label className="evolution-seed">
          <span>SEED</span>
          <input
            value={evolution.config.seed}
            onChange={(event) =>
              evolutionStore.setSeed(event.currentTarget.value)
            }
            aria-label="Evolution seed"
          />
        </label>

        <div className="evolution-actions">
          <MachineButton onClick={generate}>
            {evolution.plan ? "REGENERATE" : "GENERATE EVOLUTION"}
          </MachineButton>
          <MachineButton
            compact
            onClick={() => evolutionStore.newSeed()}
          >
            NEW SEED
          </MachineButton>
          <MachineButton
            compact
            active={evolution.previewActive}
            disabled={!evolution.plan}
            onClick={togglePreview}
          >
            {evolution.previewActive ? "STOP PREVIEW" : "▶ PREVIEW PLAN"}
          </MachineButton>
          <MachineButton
            compact
            disabled={!evolution.plan}
            onClick={() => evolutionStore.clear()}
          >
            CLEAR
          </MachineButton>
        </div>
      </div>

      {error ? (
        <p className="evolution-error" aria-live="polite">
          {error}
        </p>
      ) : null}

      {evolution.plan ? (
        <>
          <div className="evolution-summary">
            <div>
              <span>PLAN</span>
              <strong>{evolution.plan.name}</strong>
              <small>SEED {evolution.plan.displaySeed}</small>
            </div>
            <dl>
              <div>
                <dt>BARS</dt>
                <dd>{evolution.plan.bars}</dd>
              </div>
              <div>
                <dt>ARC</dt>
                <dd>{evolution.plan.arc.toUpperCase()}</dd>
              </div>
              <div>
                <dt>COHERENCE</dt>
                <dd>{evolution.plan.coherenceScore}</dd>
              </div>
            </dl>
          </div>

          <div className="evolution-strip">
            {evolution.plan.segments.map((segment) => {
              const selectedState =
                evolution.selectedIndex === segment.index;
              const playing = playingIndex === segment.index;

              return (
                <button
                  type="button"
                  key={segment.id}
                  className={[
                    "evolution-segment",
                    selectedState ? "is-selected" : "",
                    playing ? "is-playing" : "",
                    "is-" + segment.role,
                  ].join(" ")}
                  onClick={() => evolutionStore.select(segment.index)}
                >
                  <span>
                    {String(segment.index + 1).padStart(2, "0")}
                  </span>
                  <strong>{roleCode(segment.role)}</strong>
                  <i
                    style={{
                      height:
                        12 +
                        Math.round(segment.energy * 28) +
                        "px",
                    }}
                  />
                  <small>
                    E{Math.round(segment.energy * 100)}
                  </small>
                </button>
              );
            })}
          </div>

          {selected ? (
            <div className="evolution-selected">
              <div className="evolution-selected__glyph">
                {selectedGeometry ? (
                  <RhythmGlyph
                    geometry={selectedGeometry}
                    compact
                    label={"Evolution bar " + (selected.index + 1)}
                  />
                ) : null}
              </div>

              <div className="evolution-selected__meta">
                <span>
                  BAR {String(selected.index + 1).padStart(2, "0")}
                  {" / "}
                  {roleCode(selected.role)}
                </span>
                <strong>{selected.pattern.name}</strong>
                <dl>
                  <div>
                    <dt>ENERGY</dt>
                    <dd>{Math.round(selected.energy * 100)}</dd>
                  </div>
                  <div>
                    <dt>NOVELTY</dt>
                    <dd>{Math.round(selected.novelty * 100)}</dd>
                  </div>
                  <div>
                    <dt>QUALITY</dt>
                    <dd>{selected.validation.score}</dd>
                  </div>
                  <div>
                    <dt>Δ STEPS</dt>
                    <dd>{selected.changedStepCount}</dd>
                  </div>
                </dl>
              </div>

              <div className="evolution-selected__actions">
                <MachineButton
                  compact
                  disabled={transport.status === "running"}
                  onClick={auditionSelected}
                >
                  ▶ AUDITION
                </MachineButton>
                <MachineButton compact onClick={useSelected}>
                  USE THIS BAR
                </MachineButton>
                <MachineButton compact onClick={useFamily}>
                  USE SOURCE FAMILY
                </MachineButton>
              </div>
            </div>
          ) : null}

          <p className="evolution-note">
            Preview resolves each bar through the normal transport. Returns and
            phrase fills are explicit plan segments. USE THIS BAR commits only
            the selected ordinary Pattern; the full preview remains
            non-destructive.
          </p>
        </>
      ) : (
        <div className="evolution-empty">
          <span>NO EVOLUTION PLAN</span>
          <strong>
            Generate a deterministic multi-bar development from the current
            Pattern.
          </strong>
        </div>
      )}
    </section>
  );
}
