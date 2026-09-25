import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type LazyExoticComponent,
} from "react";
import { projectStore } from "./project/ProjectStore";
import { pwaStore } from "./pwa/PwaStore";
import { ProjectControl } from "./ui/project/ProjectControl";
import { PwaControl } from "./ui/pwa/PwaControl";
import { AccessibilityBridge } from "./accessibility/AccessibilityBridge";
import {
  MODES,
  type ModeDefinition,
  type ModeId,
} from "./app/modeModel";
import {
  playbackCoordinator,
} from "./playback/PlaybackCoordinator";
import {
  TransportControls,
  TransportLifecycle,
} from "./ui/transport/TransportUI";

type Experience = "playground" | "studio";

const loadPlaygroundSurface = () =>
  import("./ui/playground/PlaygroundSurface").then((module) => ({
    default: module.PlaygroundSurface,
  }));
const loadCreateSurface = () =>
  import("./ui/surfaces/CreateSurface").then((module) => ({
    default: module.CreateSurface,
  }));
const loadSequenceSurface = () =>
  import("./ui/surfaces/SequenceSurface").then((module) => ({
    default: module.SequenceSurface,
  }));
const loadSoundSurface = () =>
  import("./ui/surfaces/SoundSurface").then((module) => ({
    default: module.SoundSurface,
  }));
const loadArrangeSurface = () =>
  import("./ui/surfaces/ArrangeSurface").then((module) => ({
    default: module.ArrangeSurface,
  }));
const loadPerformanceSurface = () =>
  import("./ui/surfaces/PerformanceSurface").then((module) => ({
    default: module.PerformanceSurface,
  }));
const loadMixSurface = () =>
  import("./ui/surfaces/MixSurface").then((module) => ({
    default: module.MixSurface,
  }));
const loadMasterExportSurface = () =>
  import("./ui/surfaces/MasterExportSurface").then((module) => ({
    default: module.MasterExportSurface,
  }));

const PlaygroundSurface = lazy(loadPlaygroundSurface);
const CreateSurface = lazy(loadCreateSurface);
const SequenceSurface = lazy(loadSequenceSurface);
const SoundSurface = lazy(loadSoundSurface);
const ArrangeSurface = lazy(loadArrangeSurface);
const PerformanceSurface = lazy(loadPerformanceSurface);
const MixSurface = lazy(loadMixSurface);
const MasterExportSurface = lazy(loadMasterExportSurface);

const MODE_SURFACES: Record<
  ModeId,
  LazyExoticComponent<ComponentType>
> = {
  create: CreateSurface,
  sequence: SequenceSurface,
  sound: SoundSurface,
  arrange: ArrangeSurface,
  live: PerformanceSurface,
  mix: MixSurface,
  archive: MasterExportSurface,
};

const MODE_PRELOADERS: Partial<Record<ModeId, () => Promise<unknown>>> = {
  create: loadCreateSurface,
  sequence: loadSequenceSurface,
  sound: loadSoundSurface,
  arrange: loadArrangeSurface,
  live: loadPerformanceSurface,
  mix: loadMixSurface,
  archive: loadMasterExportSurface,
};

function preloadModeSurface(modeId: ModeId): void {
  void MODE_PRELOADERS[modeId]?.();
}

function WorkspaceLoading({
  mode,
}: {
  mode: ModeDefinition;
}) {
  return (
    <section className="workspace-loading" aria-live="polite">
      <span>{mode.number} / {mode.label}</span>
      <strong>LOADING WORKSPACE…</strong>
    </section>
  );
}

function PlaygroundLoading() {
  return (
    <section className="playground-loading" aria-live="polite">
      <span className="playground-loading__pulse" aria-hidden="true" />
      <strong>SYNTH</strong>
    </section>
  );
}

export function App() {
  const [modeId, setModeId] = useState<ModeId>("create");
  const [experience, setExperience] =
    useState<Experience>("playground");

  useEffect(() => {
    void projectStore.initialize();
    void pwaStore.initialize();
  }, []);

  const mode = useMemo(
    () => MODES.find((entry) => entry.id === modeId) ?? MODES[0],
    [modeId],
  );
  const ActiveSurface = MODE_SURFACES[modeId];
  const transportMode =
    experience === "playground" ? MODES[0] : mode;

  const openPlayground = () => {
    playbackCoordinator.prepareModeChange(modeId, "create");
    setModeId("create");
    setExperience("playground");
  };

  return (
    <div className={"synth-app synth-app--" + experience}>
      <a className="skip-link" href="#synth-main">
        Skip to workspace
      </a>
      <AccessibilityBridge
        modeLabel={
          experience === "playground"
            ? "PLAYGROUND"
            : mode.label
        }
      />
      <TransportLifecycle mode={transportMode} />

      {experience === "playground" ? (
        <main
          id="synth-main"
          className="synth-workspace synth-workspace--playground"
          tabIndex={-1}
        >
          <Suspense fallback={<PlaygroundLoading />}>
            <PlaygroundSurface
              onOpenStudio={() => setExperience("studio")}
            />
          </Suspense>
        </main>
      ) : (
        <>
          <UtilityRail
            mode={mode}
            onOpenPlayground={openPlayground}
          />

          <main
            id="synth-main"
            className="synth-workspace"
            tabIndex={-1}
          >
            <Suspense fallback={<WorkspaceLoading mode={mode} />}>
              <ActiveSurface />
            </Suspense>
          </main>

          <ModeRail
            active={modeId}
            onChange={(next) => {
              if (next === modeId) return;

              playbackCoordinator.prepareModeChange(
                modeId,
                next,
              );
              setModeId(next);
            }}
          />
        </>
      )}
    </div>
  );
}

function UtilityRail({
  mode,
  onOpenPlayground,
}: {
  mode: ModeDefinition;
  onOpenPlayground: () => void;
}) {
  return (
    <header className="utility-rail">
      <div className="brand-lockup">
        <button
          type="button"
          className="studio-playground-return"
          onClick={onOpenPlayground}
          aria-label="Return to Playground"
        >
          ← PLAY
        </button>
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
          onFocus={() => preloadModeSurface(mode.id)}
          onPointerEnter={() => preloadModeSurface(mode.id)}
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
        <span>v1.0.0</span>
      </div>
    </nav>
  );
}
