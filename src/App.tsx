import { useMemo, useState } from "react";
import { CreateSurface } from "./ui/surfaces/CreateSurface";
import { ModePlaceholder } from "./ui/surfaces/ModePlaceholder";
import { SequenceSurface } from "./ui/surfaces/SequenceSurface";
import { SoundSurface } from "./ui/surfaces/SoundSurface";
import { ArrangeSurface } from "./ui/surfaces/ArrangeSurface";
import { audioTransport } from "./audio/AudioTransport";
import { arrangementPlaybackStore } from "./arrange/ArrangementPlaybackStore";
import {
  MODES,
  type ModeDefinition,
  type ModeId,
} from "./ui/pulse/Primitives";
import {
  TransportControls,
  TransportLifecycle,
} from "./ui/transport/TransportUI";

export function App() {
  const [modeId, setModeId] = useState<ModeId>("create");

  const mode = useMemo(
    () => MODES.find((entry) => entry.id === modeId) ?? MODES[0],
    [modeId],
  );

  return (
    <div className="synth-app">
      <TransportLifecycle mode={mode} />
      <UtilityRail mode={mode} />

      <main className="synth-workspace">
        {modeId === "create" ? (
          <CreateSurface />
        ) : modeId === "sequence" ? (
          <SequenceSurface />
        ) : modeId === "sound" ? (
          <SoundSurface />
        ) : modeId === "arrange" ? (
          <ArrangeSurface />
        ) : (
          <ModePlaceholder mode={mode} />
        )}
      </main>

      <ModeRail
        active={modeId}
        onChange={(next) => {
          if (next === modeId) return;

          if (modeId === "arrange") {
            arrangementPlaybackStore.stop();
          } else if (next === "arrange") {
            audioTransport.stop();
          }

          setModeId(next);
        }}
      />
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

      <TransportControls mode={mode} />
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
        <span>PHASE 18</span>
      </div>
    </nav>
  );
}
