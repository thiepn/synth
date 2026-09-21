import { useMemo, useState } from "react";
import { CreateSurface } from "./ui/surfaces/CreateSurface";
import { ModePlaceholder } from "./ui/surfaces/ModePlaceholder";
import {
  MODES,
  type ModeDefinition,
  type ModeId,
} from "./ui/pulse/Primitives";

export function App() {
  const [modeId, setModeId] = useState<ModeId>("create");

  const mode = useMemo(
    () => MODES.find((entry) => entry.id === modeId) ?? MODES[0],
    [modeId],
  );

  return (
    <div className="synth-app">
      <UtilityRail mode={mode} />

      <main className="synth-workspace">
        {modeId === "create" ? <CreateSurface /> : <ModePlaceholder mode={mode} />}
      </main>

      <ModeRail active={modeId} onChange={setModeId} />
    </div>
  );
}

function UtilityRail({ mode }: { mode: ModeDefinition }) {
  return (
    <header className="utility-rail">
      <div className="brand-lockup">
        <span className="brand-lockup__word">SYNTH</span>
        <span className="brand-lockup__signal" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>

      <div className="project-readout">
        <span>PROJECT / FOUNDATION</span>
        <strong>SYN-7F2</strong>
      </div>

      <div className="transport-readout" aria-label="Transport preview; audio engine not online yet">
        <button type="button" disabled title="Audio engine arrives in Phase 2" aria-label="Play disabled until Phase 2">
          ▶
        </button>
        <button type="button" disabled title="Audio engine arrives in Phase 2" aria-label="Stop disabled until Phase 2">
          ■
        </button>
        <span><b>128.0</b> BPM</span>
        <span><b>4/4</b></span>
        <span className="transport-readout__mode">{mode.number} / {mode.label}</span>
      </div>
    </header>
  );
}

function ModeRail({
  active,
  onChange,
}: {
  active: ModeId;
  onChange: (mode: ModeId) => void;
}) {
  return (
    <nav className="mode-rail" aria-label="Synth modes">
      {MODES.map((mode) => (
        <button
          type="button"
          key={mode.id}
          className={active === mode.id ? "mode-rail__button is-active" : "mode-rail__button"}
          onClick={() => onChange(mode.id)}
          aria-current={active === mode.id ? "page" : undefined}
        >
          <span className="mode-rail__number">{mode.number}</span>
          <span className="mode-rail__label">{mode.label}</span>
        </button>
      ))}
      <div className="mode-rail__system">
        <span className="status-lamp" />
        <span>PHASE 01</span>
      </div>
    </nav>
  );
}
