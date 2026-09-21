import {
  GROOVE_PERSONALITIES,
  type GrooveApplyResult,
  type GroovePersonalityId,
} from "../../groove/grooveEngine";
import { MachineButton, SignalRail } from "../pulse/Primitives";

interface GrooveEnginePanelProps {
  personality: GroovePersonalityId;
  humanization: number;
  ghostNotes: number;
  swing: number;
  lastResult: GrooveApplyResult | null;
  onPersonalityChange: (next: GroovePersonalityId) => void;
  onHumanizationChange: (next: number) => void;
  onGhostNotesChange: (next: number) => void;
  onSwingChange: (next: number) => void;
  onApply: () => void;
  onReset: () => void;
}

export function GrooveEnginePanel({
  personality,
  humanization,
  ghostNotes,
  swing,
  lastResult,
  onPersonalityChange,
  onHumanizationChange,
  onGhostNotesChange,
  onSwingChange,
  onApply,
  onReset,
}: GrooveEnginePanelProps) {
  return (
    <section className="groove-engine-panel" aria-labelledby="groove-engine-title">
      <div className="machine-section-label">
        <span id="groove-engine-title">GROOVE / ENGINE</span>
        <span>FEEL V1 / DETERMINISTIC</span>
      </div>

      <div className="groove-engine-panel__body">
        <div className="groove-personality-bank">
          {GROOVE_PERSONALITIES.map((profile) => (
            <button
              type="button"
              key={profile.id}
              className={
                profile.id === personality
                  ? "groove-personality-key is-active"
                  : "groove-personality-key"
              }
              onClick={() => onPersonalityChange(profile.id)}
              aria-pressed={profile.id === personality}
            >
              <span>{profile.code}</span>
              <strong>{profile.label}</strong>
            </button>
          ))}
        </div>

        <div className="groove-engine-controls">
          <SignalRail
            label="HUMANIZE"
            value={humanization}
            onChange={onHumanizationChange}
          />
          <SignalRail
            label="GHOSTS"
            value={ghostNotes}
            tone="heat"
            onChange={onGhostNotesChange}
          />
          <SignalRail
            label="SWING"
            value={swing}
            tone="ice"
            onChange={onSwingChange}
          />
        </div>

        <div className="groove-engine-actions">
          <MachineButton onClick={onApply}>APPLY FEEL</MachineButton>
          <MachineButton onClick={onReset}>RESET FEEL</MachineButton>

          <dl className="groove-engine-readout">
            <div>
              <dt>EVENTS</dt>
              <dd>{lastResult ? lastResult.changedEventCount : "--"}</dd>
            </div>
            <div>
              <dt>GHOSTS</dt>
              <dd>{lastResult ? lastResult.ghostNotesAdded : "--"}</dd>
            </div>
            <div>
              <dt>MAX µs</dt>
              <dd>{lastResult ? lastResult.maxTimingOffsetUs : "--"}</dd>
            </div>
          </dl>
        </div>
      </div>

      <p className="groove-engine-panel__note">
        Timing is correlated by beat and instrument role. Rhythm locks block
        new ghost hits but still allow existing hits to receive feel. The same
        settings and seed are reproducible.
      </p>
    </section>
  );
}
