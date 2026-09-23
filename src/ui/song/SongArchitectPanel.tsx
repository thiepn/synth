import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { audioTransport } from "../../audio/AudioTransport";
import { arrangementFoundationStore } from "../../arrange/ArrangementFoundationStore";
import { arrangementPlaybackStore } from "../../arrange/ArrangementPlaybackStore";
import { arrangementStore } from "../../arrange/ArrangementStore";
import type { ArrangementShapeId } from "../../domain/contracts";
import { beatFamilyStore } from "../../family/BeatFamilyStore";
import { useBeatFamilySnapshot } from "../../family/useBeatFamily";
import type { BeatFamilyGenerationResult } from "../../generation/beatFamilyGenerator";
import type {
  SongArchitectSourceMode,
} from "../../generation/songArchitect";
import { evolutionStore } from "../../evolve/EvolutionStore";
import { useEvolutionSnapshot } from "../../evolve/useEvolution";
import {
  songArchitectStore,
} from "../../song/SongArchitectStore";
import { useSongArchitectSnapshot } from "../../song/useSongArchitect";
import { useTransportSnapshot } from "../../audio/useTransport";
import { PPQ } from "../../domain/contracts";
import {
  MachineButton,
} from "../pulse/Primitives";

const SHAPES: ReadonlyArray<{
  id: ArrangementShapeId;
  label: string;
  code: string;
}> = [
  { id: "compact", label: "Compact", code: "CMP" },
  { id: "standard", label: "Standard", code: "STD" },
  { id: "extended", label: "Extended", code: "EXT" },
];

const SOURCES: ReadonlyArray<{
  id: SongArchitectSourceMode;
  label: string;
  code: string;
}> = [
  { id: "auto", label: "Auto", code: "AUT" },
  { id: "family", label: "Beat Family", code: "FAM" },
  { id: "evolve", label: "EVOLVE", code: "EVO" },
];

function familyGenerationResult(
  family: ReturnType<typeof useBeatFamilySnapshot>,
): BeatFamilyGenerationResult | undefined {
  if (!family.family || family.patterns.length === 0) {
    return undefined;
  }

  return {
    family: family.family,
    patterns: family.patterns,
    effectiveSeed:
      family.family.provenance?.seed ??
      family.displaySeed ??
      family.family.id,
    displaySeed:
      family.displaySeed ??
      family.family.id.slice(-6).toUpperCase(),
    coherenceScore: family.coherenceScore ?? 80,
    valid: true,
    reasons: [],
  };
}

function sourceAvailable(
  mode: SongArchitectSourceMode,
  hasFamily: boolean,
  hasEvolution: boolean,
): boolean {
  if (mode === "family") return hasFamily;
  if (mode === "evolve") return hasEvolution;
  return hasEvolution || hasFamily;
}

export function SongArchitectPanel() {
  const family = useBeatFamilySnapshot();
  const evolution = useEvolutionSnapshot();
  const song = useSongArchitectSnapshot();
  const transport = useTransportSnapshot();
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      songArchitectStore.setPreviewActive(false);
    },
    [],
  );

  const familyResult = useMemo(
    () => familyGenerationResult(family),
    [
      family.family,
      family.patterns,
      family.coherenceScore,
      family.displaySeed,
    ],
  );

  const candidate = song.candidate;
  const blueprint = candidate?.result.blueprint;
  const locked = new Set(song.lockedSectionIndexes);
  const selected =
    blueprint?.sections[song.selectedSectionIndex] ??
    blueprint?.sections[0];

  const playingSectionIndex =
    song.previewActive && candidate && candidate.totalTicks > 0
      ? candidate.occurrences.find((occurrence) => {
          const tick =
            transport.position.absoluteTick %
            candidate.totalTicks;
          return (
            tick >= occurrence.startTick &&
            tick < occurrence.startTick + occurrence.lengthTicks
          );
        })?.sectionIndex ?? -1
      : -1;

  const inputs = () => ({
    family: familyResult,
    evolution: evolution.plan,
  });

  const generate = () => {
    try {
      songArchitectStore.generate(inputs());
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : String(caught),
      );
    }
  };

  const tryAnother = () => {
    try {
      songArchitectStore.tryAnother(inputs());
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : String(caught),
      );
    }
  };

  const regenerateSection = (index: number) => {
    try {
      songArchitectStore.regenerateSection(index, inputs());
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : String(caught),
      );
    }
  };

  const togglePreview = () => {
    if (!candidate) return;
    const next = !song.previewActive;

    if (next) {
      evolutionStore.setPreviewActive(false);
      songArchitectStore.setPreviewActive(true);
      if (transport.status !== "running") {
        void audioTransport.start();
      }
    } else {
      songArchitectStore.setPreviewActive(false);
    }
  };

  const commit = () => {
    if (!candidate) return;

    songArchitectStore.setPreviewActive(false);
    evolutionStore.setPreviewActive(false);
    arrangementPlaybackStore.stop();

    beatFamilyStore.apply(candidate.family);
    arrangementFoundationStore.apply(candidate.result);
    arrangementStore.loadFromFoundation(
      candidate.result.blueprint,
      candidate.family.patterns,
    );
    songArchitectStore.markCommitted();

    setError(null);
  };

  const hasFamily = Boolean(familyResult);
  const hasEvolution = Boolean(evolution.plan);
  const canGenerate = sourceAvailable(
    song.config.sourceMode,
    hasFamily,
    hasEvolution,
  );

  return (
    <section className="song-architect-panel" aria-labelledby="song-architect-title">
      <div className="machine-section-label">
        <span id="song-architect-title">SONG / ARCHITECT</span>
        <span>EVOLVE + FAMILY → ARRANGE / V1</span>
      </div>

      <div className="song-architect-controls">
        <div className="song-control-bank">
          <span>SOURCE</span>
          <div>
            {SOURCES.map((source) => {
              const available = sourceAvailable(
                source.id,
                hasFamily,
                hasEvolution,
              );
              return (
                <button
                  type="button"
                  key={source.id}
                  className={
                    song.config.sourceMode === source.id
                      ? "is-active"
                      : undefined
                  }
                  onClick={() =>
                    songArchitectStore.setSourceMode(source.id)
                  }
                  disabled={!available && source.id !== "auto"}
                  title={source.label}
                >
                  {source.code}
                </button>
              );
            })}
          </div>
        </div>

        <div className="song-control-bank">
          <span>SHAPE</span>
          <div>
            {SHAPES.map((shape) => (
              <button
                type="button"
                key={shape.id}
                className={
                  song.config.shape === shape.id
                    ? "is-active"
                    : undefined
                }
                onClick={() => songArchitectStore.setShape(shape.id)}
                title={shape.label}
              >
                {shape.code}
              </button>
            ))}
          </div>
        </div>

        <label className="song-seed">
          <span>SONG SEED</span>
          <input
            value={song.config.seed}
            onChange={(event) =>
              songArchitectStore.setSeed(event.currentTarget.value)
            }
            aria-label="Song Architect seed"
          />
        </label>

        <div className="song-architect-actions">
          <MachineButton
            disabled={!canGenerate}
            onClick={generate}
          >
            {candidate ? "REGENERATE SONG" : "MAKE SONG"}
          </MachineButton>
          <MachineButton
            compact
            disabled={!canGenerate}
            onClick={() => {
              songArchitectStore.newSeed();
              setError(null);
            }}
          >
            NEW SEED
          </MachineButton>
          <MachineButton
            compact
            disabled={!candidate}
            onClick={tryAnother}
          >
            TRY ANOTHER
          </MachineButton>
          <MachineButton
            compact
            active={song.previewActive}
            disabled={!candidate}
            onClick={togglePreview}
          >
            {song.previewActive ? "STOP PREVIEW" : "▶ PREVIEW SONG"}
          </MachineButton>
          <MachineButton
            compact
            disabled={!candidate}
            onClick={commit}
          >
            COMMIT TO ARRANGE
          </MachineButton>
        </div>
      </div>

      {error ? (
        <p className="song-architect-error" aria-live="polite">
          {error}
        </p>
      ) : null}

      {!candidate ? (
        <div className="song-architect-empty">
          <span>NO SONG CANDIDATE</span>
          <strong>
            {hasEvolution
              ? "EVOLVE plan detected. AUTO will use evolved material."
              : hasFamily
                ? "Beat Family detected. Generate a complete song candidate."
                : "Generate a Beat Family or EVOLVE plan first."}
          </strong>
        </div>
      ) : (
        <>
          <div className="song-candidate-summary">
            <div>
              <span>
                {candidate.sourceMode.toUpperCase()} / {candidate.displaySeed}
              </span>
              <strong>{candidate.result.blueprint.name}</strong>
              <small>
                {candidate.result.blueprint.sections.length} SECTIONS ·{" "}
                {Math.round(candidate.totalTicks / PPQ)} BEATS · Q
                {candidate.result.coherenceScore}
              </small>
            </div>
            <div>
              <span>LOCKED</span>
              <strong>{song.lockedSectionIndexes.length}</strong>
            </div>
          </div>

          <div className="song-section-list">
            {candidate.result.blueprint.sections.map(
              (section, index) => {
                const isLocked = locked.has(index);
                const isSelected =
                  song.selectedSectionIndex === index;
                const isPlaying =
                  playingSectionIndex === index;

                return (
                  <article
                    key={section.id}
                    className={[
                      "song-section",
                      isLocked ? "is-locked" : "",
                      isSelected ? "is-selected" : "",
                      isPlaying ? "is-playing" : "",
                    ].join(" ")}
                    onClick={() =>
                      songArchitectStore.selectSection(index)
                    }
                  >
                    <div className="song-section__identity">
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{section.label}</strong>
                      <small>{section.role.toUpperCase()}</small>
                    </div>

                    <div className="song-section__energy">
                      <i
                        style={{
                          width:
                            Math.round(section.energyStart * 100) +
                            "%",
                        }}
                      />
                      <i
                        style={{
                          width:
                            Math.round(section.energyEnd * 100) +
                            "%",
                        }}
                      />
                    </div>

                    <div
                      className="song-section__actions"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        className={isLocked ? "is-active" : undefined}
                        onClick={() =>
                          songArchitectStore.toggleSectionLock(index)
                        }
                        aria-pressed={isLocked}
                      >
                        {isLocked ? "LOCKED" : "LOCK"}
                      </button>
                      <button
                        type="button"
                        disabled={isLocked}
                        onClick={() => regenerateSection(index)}
                      >
                        REROLL
                      </button>
                    </div>
                  </article>
                );
              },
            )}
          </div>

          {selected ? (
            <div className="song-selected-section">
              <div>
                <span>SELECTED SECTION</span>
                <strong>{selected.label}</strong>
                <small>
                  {selected.patternSequence.length} CYCLES · E
                  {Math.round(selected.energyStart * 100)}
                  {"→"}
                  {Math.round(selected.energyEnd * 100)}
                </small>
              </div>
              <div>
                <span>ROUTES</span>
                <strong>
                  {selected.fillPatternId ? "FILL " : ""}
                  {selected.transitionPatternId ? "TRANSITION" : ""}
                  {!selected.fillPatternId &&
                  !selected.transitionPatternId
                    ? "CORE"
                    : ""}
                </strong>
              </div>
            </div>
          ) : null}

          <p className="song-architect-note">
            Locked sections survive TRY ANOTHER and full regeneration.
            REROLL changes only the selected unlocked section. COMMIT TO
            ARRANGE promotes the candidate's source family and writes the
            candidate into the existing editable ARRANGE system.
          </p>
        </>
      )}
    </section>
  );
}
