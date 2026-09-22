import { drumEngine } from "../../audio/DrumEngine";
import { useTransportSnapshot } from "../../audio/useTransport";
import type { BeatFamilyRole } from "../../domain/contracts";
import {
  beatFamilyStore,
} from "../../family/BeatFamilyStore";
import { useBeatFamilySnapshot } from "../../family/useBeatFamily";
import { generationHistoryStore } from "../../history/GenerationHistoryStore";
import { sequencerStore } from "../../sequencer/SequencerStore";
import { deriveRhythmGlyph } from "../../visual/rhythmGlyph";
import {
  MachineButton,
  RhythmGlyph,
} from "../pulse/Primitives";

interface BeatFamilyPanelProps {
  onGenerate: () => void;
  generationError?: string | null;
}

function roleCode(role: BeatFamilyRole): string {
  switch (role) {
    case "core": return "CORE";
    case "aVariation": return "A";
    case "bVariation": return "B";
    case "build": return "BLD";
    case "breakdown": return "BRK";
    case "drop": return "DRP";
    case "fill1": return "F1";
    case "fill2": return "F2";
    case "transition": return "TRN";
  }
}

export function BeatFamilyPanel({
  onGenerate,
  generationError,
}: BeatFamilyPanelProps) {
  const family = useBeatFamilySnapshot();
  const transport = useTransportSnapshot();
  const selected =
    family.patterns.find((entry) => entry.role === family.selectedRole) ??
    family.patterns[0];

  const audition = (role: BeatFamilyRole) => {
    const entry = beatFamilyStore.getPattern(role);
    if (!entry || transport.status === "running") return;
    beatFamilyStore.select(role);
    void drumEngine.auditionPattern(entry.pattern, transport.bpm);
  };

  const useMember = (role: BeatFamilyRole) => {
    const entry = beatFamilyStore.getPattern(role);
    if (!entry) return;

    const current = sequencerStore.getSnapshot().pattern;
    const prepared = generationHistoryStore.prepareCreativePattern(
      current,
      entry.pattern,
    );

    sequencerStore.restorePatternSnapshot(prepared.pattern);
    const applied = sequencerStore.getSnapshot().pattern;
    const operation =
      entry.kind === "fill" || entry.kind === "transition"
        ? "generateTransition"
        : "variation";

    generationHistoryStore.commitPrepared(
      {
        parentNodeId: prepared.parentNodeId,
        pattern: applied,
      },
      operation,
      "FAMILY / " + entry.label,
      entry.pattern.name,
    );
    beatFamilyStore.select(role);
  };

  return (
    <section className="beat-family-panel" aria-labelledby="beat-family-title">
      <div className="machine-section-label">
        <span id="beat-family-title">BEAT / FAMILY</span>
        <span>
          {family.family
            ? "FAMILY " + (family.displaySeed ?? "---")
            : "RELATED PATTERN ENGINE"}
        </span>
      </div>

      <div className="beat-family-panel__control">
        <div>
          <span>CORE → FAMILY</span>
          <strong>
            {family.family?.name ?? "Generate related section material"}
          </strong>
        </div>
        <div>
          <span>COHERENCE</span>
          <strong>
            {family.coherenceScore === undefined
              ? "--"
              : "Q" + family.coherenceScore}
          </strong>
        </div>
        <MachineButton onClick={onGenerate}>GENERATE FAMILY</MachineButton>
        <MachineButton
          disabled={!family.family}
          onClick={() => beatFamilyStore.clear()}
        >
          CLEAR FAMILY
        </MachineButton>
      </div>

      {generationError ? (
        <p className="beat-family-panel__error" aria-live="polite">
          {generationError}
        </p>
      ) : null}

      {family.patterns.length > 0 ? (
        <div className="beat-family-grid">
          {family.patterns.map((entry) => {
            const geometry = deriveRhythmGlyph(entry.pattern);
            const isSelected = entry.role === family.selectedRole;

            return (
              <article
                key={entry.role}
                className={[
                  "beat-family-member",
                  isSelected ? "is-selected" : "",
                  "is-" + entry.kind,
                ].join(" ")}
                onClick={() => beatFamilyStore.select(entry.role)}
              >
                <div className="beat-family-member__head">
                  <span>{roleCode(entry.role)}</span>
                  <strong>{entry.label}</strong>
                  <i>{"RG-" + geometry.signature.slice(0, 5)}</i>
                </div>

                <div className="beat-family-member__glyph">
                  <RhythmGlyph
                    geometry={geometry}
                    compact
                    label={entry.label + " rhythm glyph"}
                  />
                </div>

                <dl className="beat-family-member__metrics">
                  <div>
                    <dt>ENERGY</dt>
                    <dd>{Math.round(entry.energy * 100)}</dd>
                  </div>
                  <div>
                    <dt>QUALITY</dt>
                    <dd>{entry.validation.score}</dd>
                  </div>
                </dl>

                <div
                  className="beat-family-member__actions"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    disabled={transport.status === "running"}
                    onClick={() => audition(entry.role)}
                  >
                    ▶ AUD
                  </button>
                  <button
                    type="button"
                    onClick={() => useMember(entry.role)}
                  >
                    USE
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="beat-family-empty">
          <span>NO FAMILY GENERATED</span>
          <strong>
            Build A/B variations, section states, fills and a transition from
            the current core Pattern.
          </strong>
        </div>
      )}

      {selected ? (
        <div className="beat-family-selected">
          <span>SELECTED / {selected.label}</span>
          <strong>{selected.pattern.name}</strong>
          <span>
            {selected.kind.toUpperCase()} · E
            {Math.round(selected.energy * 100)} · Q
            {selected.validation.score}
          </span>
        </div>
      ) : null}

      <p className="beat-family-panel__note">
        Generating a family does not replace the current Pattern. AUDITION is
        non-destructive. USE restores the chosen member and records it in the
        Evolution Tree as a variation/transition branch.
      </p>
    </section>
  );
}
