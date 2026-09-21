import { useEffect } from "react";
import { drumEngine } from "../../audio/DrumEngine";
import { useDrumEngineSnapshot } from "../../audio/useDrumEngine";
import {
  DRUM_PADS,
  type DrumVoiceId,
} from "../../music/foundationPattern";
import { SignalRail } from "../pulse/Primitives";

const KEY_TO_VOICE = new Map(
  DRUM_PADS.map((pad) => [pad.key.toLowerCase(), pad.voice]),
);

function shouldIgnoreKeyboardTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.matches("input, textarea, select, button, [role='slider']"))
  );
}

export function DrumEnginePanel() {
  const snapshot = useDrumEngineSnapshot();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || shouldIgnoreKeyboardTarget(event.target)) return;

      const voice = KEY_TO_VOICE.get(event.key.toLowerCase());
      if (!voice) return;

      event.preventDefault();
      void drumEngine.triggerNow(voice, event.shiftKey ? 1 : 0.82);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const trigger = (voice: DrumVoiceId) => {
    void drumEngine.triggerNow(voice, 0.86);
  };

  return (
    <section className="drum-engine-panel" aria-labelledby="drum-engine-title">
      <div className="machine-section-label">
        <span id="drum-engine-title">DRUM / ENGINE V1</span>
        <span>
          {snapshot.status.toUpperCase()} · {snapshot.activeVoiceCount
            .toString()
            .padStart(2, "0")} VOICES
        </span>
      </div>

      <div className="drum-engine-panel__body">
        <div className="drum-pad-grid" aria-label="Playable drum pads">
          {DRUM_PADS.map((pad) => (
            <button
              type="button"
              key={pad.voice}
              className={[
                "drum-pad",
                "drum-pad--" + pad.tone,
                snapshot.lastVoice === pad.voice ? "is-last" : "",
              ].join(" ")}
              onClick={() => trigger(pad.voice)}
              aria-label={pad.label + " drum pad. Keyboard " + pad.key}
            >
              <span className="drum-pad__code">{pad.code}</span>
              <strong>{pad.label}</strong>
              <span className="drum-pad__key">{pad.key}</span>
            </button>
          ))}
        </div>

        <div className="drum-macros">
          <div className="drum-macros__status">
            <span>MASTER / SYNTH BUS</span>
            <span>{snapshot.lastError ?? "SYNTHESIZED / LOCAL"}</span>
          </div>

          <SignalRail
            label="MASTER"
            value={snapshot.master * 100}
            onChange={(value) => drumEngine.setMaster(value / 100)}
          />
          <SignalRail
            label="PUNCH"
            value={snapshot.macros.punch * 100}
            tone="heat"
            onChange={(value) => drumEngine.setMacro("punch", value / 100)}
          />
          <SignalRail
            label="TONE"
            value={snapshot.macros.tone * 100}
            tone="ice"
            onChange={(value) => drumEngine.setMacro("tone", value / 100)}
          />
          <SignalRail
            label="DECAY"
            value={snapshot.macros.decay * 100}
            onChange={(value) => drumEngine.setMacro("decay", value / 100)}
          />
          <SignalRail
            label="GRIT"
            value={snapshot.macros.grit * 100}
            tone="heat"
            onChange={(value) => drumEngine.setMacro("grit", value / 100)}
          />
          <SignalRail
            label="SPACE"
            value={snapshot.macros.space * 100}
            tone="ice"
            onChange={(value) => drumEngine.setMacro("space", value / 100)}
          />
        </div>
      </div>

      <p className="drum-engine-panel__hint">
        Pads: A S D F · J K L ; &nbsp; Shift + key = full velocity. Transport
        playback uses the same visible foundation pattern.
      </p>
    </section>
  );
}
