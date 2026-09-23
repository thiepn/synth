import { useEffect, useMemo, useState } from "react";
import type { Pattern } from "../../domain/contracts";
import { drumEngine } from "../../audio/DrumEngine";
import { useTransportSnapshot } from "../../audio/useTransport";
import {
  CHAOS_DOMAINS,
  type ChaosDiff,
  type ChaosDomainId,
} from "../../generation/chaosEngine";
import { generationHistoryStore } from "../../history/GenerationHistoryStore";
import { SEQUENCER_LANES } from "../../music/foundationPattern";
import { sequencerStore } from "../../sequencer/SequencerStore";
import { chaosStore } from "../../chaos/ChaosStore";
import { useChaosSnapshot } from "../../chaos/useChaos";
import { deriveRhythmGlyph } from "../../visual/rhythmGlyph";
import {
  MachineButton,
  RhythmGlyph,
  SignalRail,
} from "../pulse/Primitives";

function levelLabel(value: number): string {
  if (value <= 0.001) return "OFF";
  if (value < 0.34) return "SUBTLE";
  if (value < 0.71) return "UNSTABLE";
  return "WILD";
}

function diffSummary(diff: ChaosDiff): string {
  const parts: string[] = [];
  if (diff.rhythm.moved) parts.push(diff.rhythm.moved + " MOVED");
  if (diff.rhythm.added) parts.push(diff.rhythm.added + " ADDED");
  if (diff.rhythm.removed) parts.push(diff.rhythm.removed + " REMOVED");
  if (diff.dynamics.modified) {
    parts.push(diff.dynamics.modified + " DYN");
  }
  if (diff.timing.modified) parts.push(diff.timing.modified + " TIM");
  if (diff.probability.modified) {
    parts.push(diff.probability.modified + " PRB");
  }
  if (diff.ornament.modified) {
    parts.push(diff.ornament.modified + " ORN");
  }
  if (diff.instrumentation.modified) {
    parts.push(diff.instrumentation.modified + " INS");
  }
  return parts.length > 0 ? parts.join(" · ") : "NO MUTATIONS";
}

export function ChaosPanel({
  pattern,
  bpm,
}: {
  pattern: Pattern;
  bpm: number;
}) {
  const chaos = useChaosSnapshot();
  const transport = useTransportSnapshot();
  const [status, setStatus] = useState(
    "MOVE THE CHAOS CONTROL TO CREATE A DETERMINISTIC VARIATION",
  );
  const previewPattern = chaos.result?.pattern;

  useEffect(() => {
    chaosStore.setBasePattern(pattern);
  }, [pattern]);

  const previewGeometry = useMemo(
    () => (previewPattern ? deriveRhythmGlyph(previewPattern) : undefined),
    [previewPattern],
  );

  const frozenLanes = new Set(chaos.config.freezeMask.laneIds);
  const frozenDomains = new Set(chaos.config.freezeMask.domains);

  const audition = (target: Pattern | undefined, label: string) => {
    if (!target || transport.status === "running") return;
    void drumEngine.auditionPattern(target, bpm);
    setStatus("AUDITION / " + label);
  };

  const commit = () => {
    if (!previewPattern || !chaos.active) return;

    const source = chaos.basePattern ?? pattern;
    const prepared =
      generationHistoryStore.prepareCreativePattern(
        source,
        previewPattern,
      );

    sequencerStore.setRuntimePreview(undefined);
    sequencerStore.restorePatternSnapshot(prepared.pattern);
    const applied = sequencerStore.getSnapshot().pattern;

    generationHistoryStore.commitPrepared(
      {
        parentNodeId: prepared.parentNodeId,
        pattern: applied,
      },
      "chaos",
      "CHAOS",
      applied.name,
    );

    chaosStore.finishCommit(applied);
    setStatus(
      "CHAOS COMMITTED / RG-" +
        deriveRhythmGlyph(applied).signature.slice(0, 6),
    );
  };

  const toggleDomain = (domain: ChaosDomainId) => {
    chaosStore.setDomainEnabled(
      domain,
      !chaos.config.domains[domain].enabled,
    );
  };

  return (
    <section className="chaos-panel" aria-labelledby="chaos-title">
      <div className="machine-section-label">
        <span id="chaos-title">CHAOS / CONTROLLED RANDOMNESS</span>
        <span>DETERMINISTIC OVERLAY / V1</span>
      </div>

      <div className="chaos-machine">
        <div className="chaos-machine__control">
          <div className="chaos-headline">
            <div>
              <span>INTENSITY</span>
              <strong>{levelLabel(chaos.config.intensity)}</strong>
            </div>
            <b>
              {String(Math.round(chaos.config.intensity * 100)).padStart(
                3,
                "0",
              )}
            </b>
          </div>

          <SignalRail
            label="SUBTLE → UNSTABLE → WILD"
            value={chaos.config.intensity * 100}
            minLabel="SUBTLE"
            maxLabel="WILD"
            tone="heat"
            onChange={(value) =>
              chaosStore.setIntensity(value / 100)
            }
          />

          <label className="chaos-seed">
            <span>CHAOS SEED</span>
            <input
              value={chaos.config.seed}
              onChange={(event) =>
                chaosStore.setSeed(event.currentTarget.value)
              }
              aria-label="Chaos seed"
            />
          </label>

          <div className="chaos-actions">
            <MachineButton compact onClick={() => chaosStore.newSeed()}>
              NEW VARIATION
            </MachineButton>
            <MachineButton
              compact
              active={chaos.bypass}
              onClick={() => chaosStore.setBypass(!chaos.bypass)}
            >
              {chaos.bypass ? "BASE ACTIVE" : "BYPASS"}
            </MachineButton>
            <MachineButton
              compact
              disabled={!chaos.active}
              onClick={commit}
            >
              COMMIT CHAOS
            </MachineButton>
          </div>
        </div>

        <div className="chaos-machine__domains">
          <div className="chaos-subhead">
            <span>ENTROPY DOMAINS</span>
            <button
              type="button"
              onClick={() => chaosStore.clearFreezes()}
              disabled={
                frozenLanes.size === 0 &&
                frozenDomains.size === 0 &&
                chaos.config.freezeMask.regions.length === 0
              }
            >
              CLEAR FREEZE
            </button>
          </div>

          <div className="chaos-domain-grid">
            {CHAOS_DOMAINS.map((domain) => {
              const domainConfig = chaos.config.domains[domain.id];
              const frozen = frozenDomains.has(domain.id);

              return (
                <div
                  className={
                    frozen
                      ? "chaos-domain is-frozen"
                      : domainConfig.enabled
                        ? "chaos-domain is-enabled"
                        : "chaos-domain"
                  }
                  key={domain.id}
                >
                  <button
                    type="button"
                    className="chaos-domain__toggle"
                    onClick={() => toggleDomain(domain.id)}
                    aria-pressed={domainConfig.enabled}
                  >
                    <span>{domain.code}</span>
                    <strong>{domain.label}</strong>
                  </button>
                  <button
                    type="button"
                    className="chaos-domain__freeze"
                    onClick={() =>
                      chaosStore.toggleDomainFreeze(domain.id)
                    }
                    aria-pressed={frozen}
                    title={"Freeze " + domain.label + " entropy"}
                  >
                    {frozen ? "FROZEN" : "FREEZE"}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(domainConfig.amount * 100)}
                    disabled={!domainConfig.enabled || frozen}
                    aria-label={domain.label + " chaos amount"}
                    onChange={(event) =>
                      chaosStore.setDomainAmount(
                        domain.id,
                        Number(event.currentTarget.value) / 100,
                      )
                    }
                  />
                </div>
              );
            })}
          </div>

          <div className="chaos-lane-freeze">
            <span>FREEZE LANES</span>
            <div>
              {SEQUENCER_LANES.map((lane) => {
                const frozen = frozenLanes.has(lane.id);
                return (
                  <button
                    type="button"
                    key={lane.id}
                    className={frozen ? "is-frozen" : undefined}
                    onClick={() => chaosStore.toggleLaneFreeze(lane.id)}
                    aria-pressed={frozen}
                    title={
                      (frozen ? "Unfreeze " : "Freeze ") + lane.name
                    }
                  >
                    {lane.code}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="chaos-machine__preview">
          <div className="chaos-preview-head">
            <span>
              {chaos.bypass ? "BASE" : "CHAOS"} /{" "}
              {chaos.result?.displaySeed ?? "---"}
            </span>
            <strong>
              {chaos.result?.diff.totalChanges ?? 0} CHANGES
            </strong>
          </div>

          <div className="chaos-glyph">
            {previewGeometry ? (
              <RhythmGlyph
                geometry={previewGeometry}
                compact
                label="Chaos Pattern preview"
              />
            ) : (
              <span>NO PREVIEW</span>
            )}
          </div>

          <p className="chaos-diff">
            {chaos.result
              ? diffSummary(chaos.result.diff)
              : "NO MUTATIONS"}
          </p>

          <div className="chaos-preview-actions">
            <MachineButton
              compact
              disabled={transport.status === "running"}
              onClick={() => audition(chaos.basePattern, "BASE")}
            >
              ▶ BASE
            </MachineButton>
            <MachineButton
              compact
              disabled={
                !previewPattern || transport.status === "running"
              }
              onClick={() => audition(previewPattern, "CHAOS")}
            >
              ▶ CHAOS
            </MachineButton>
          </div>
        </div>
      </div>

      <p className="chaos-status" aria-live="polite">
        {transport.status === "running" && chaos.active
          ? chaos.bypass
            ? "LIVE / BASE · CHAOS CONFIG PRESERVED"
            : "LIVE / CHAOS OVERLAY · COMMIT WHEN READY"
          : status}
      </p>
    </section>
  );
}
