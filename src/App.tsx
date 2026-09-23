import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { CreateSurface } from "./ui/surfaces/CreateSurface";
import { ModePlaceholder } from "./ui/surfaces/ModePlaceholder";
import { SequenceSurface } from "./ui/surfaces/SequenceSurface";
import { SoundSurface } from "./ui/surfaces/SoundSurface";
import { ArrangeSurface } from "./ui/surfaces/ArrangeSurface";
import { PerformanceSurface } from "./ui/surfaces/PerformanceSurface";
import { MixSurface } from "./ui/surfaces/MixSurface";
import { MasterExportSurface } from "./ui/surfaces/MasterExportSurface";
import { CreativePlaybackBridge } from "./performance/CreativePlaybackBridge";
import { projectStore } from "./project/ProjectStore";
import { pwaStore } from "./pwa/PwaStore";
import { ProjectControl } from "./ui/project/ProjectControl";
import { PwaControl } from "./ui/pwa/PwaControl";
import { AccessibilityBridge } from "./accessibility/AccessibilityBridge";
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

  useEffect(() => {
    void projectStore.initialize();
    void pwaStore.initialize();
  }, []);

  const mode = useMemo(
    () => MODES.find((entry) => entry.id === modeId) ?? MODES[0],
    [modeId],
  );

  return (
    <div className="synth-app">
      <a className="skip-link" href="#synth-main">
        Skip to workspace
      </a>
      <AccessibilityBridge modeLabel={mode.label} />
      <TransportLifecycle mode={mode} />
      <CreativePlaybackBridge mode={modeId} />
      <UtilityRail mode={mode} />

      <main
        id="synth-main"
        className="synth-workspace"
        tabIndex={-1}
      >
        {modeId === "create" ? (
          <CreateSurface />
        ) : modeId === "sequence" ? (
          <SequenceSurface />
        ) : modeId === "sound" ? (
          <SoundSurface />
        ) : modeId === "arrange" ? (
          <ArrangeSurface />
        ) : modeId === "live" ? (
          <PerformanceSurface />
        ) : modeId === "mix" ? (
          <MixSurface />
        ) : modeId === "archive" ? (
          <MasterExportSurface />
        ) : (
          <ModePlaceholder mode={mode} />
        )}
      </main>

      <ModeRail
        active={modeId}
        onChange={(next) => {
          if (next === modeId) return;

          if (
            modeId === "arrange" ||
            modeId === "live" ||
            modeId === "mix" ||
            modeId === "archive"
          ) {
            arrangementPlaybackStore.stop();
          } else if (
            next === "arrange" ||
            next === "mix" ||
            next === "archive"
          ) {
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
        <PwaControl />
      </div>

      <ProjectControl />

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
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const moveFocus = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    let nextIndex = currentIndex;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % MODES.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + MODES.length) % MODES.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = MODES.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const next = MODES[nextIndex];
    if (!next) return;
    onChange(next.id);
    buttons.current[nextIndex]?.focus();
  };

  return (
    <nav className="mode-rail" aria-label="Synth modes">
      {MODES.map((mode, index) => (
        <button
          ref={(node) => {
            buttons.current[index] = node;
          }}
          type="button"
          key={mode.id}
          className={
            active === mode.id
              ? "mode-rail__button is-active"
              : "mode-rail__button"
          }
          tabIndex={active === mode.id ? 0 : -1}
          onClick={() => onChange(mode.id)}
          onKeyDown={(event) => moveFocus(event, index)}
          aria-current={active === mode.id ? "page" : undefined}
          aria-label={
            "Mode " + mode.number + ": " + mode.label
          }
        >
          <span className="mode-rail__number">{mode.number}</span>
          <span className="mode-rail__label">{mode.label}</span>
        </button>
      ))}
      <div className="mode-rail__system" aria-hidden="true">
        <span className="status-lamp" />
        <span>PHASE 35</span>
      </div>
    </nav>
  );
}
