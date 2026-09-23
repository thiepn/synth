import { useMemo } from "react";
import { useSequencerSnapshot } from "../../sequencer/useSequencer";
import { deriveRhythmGlyph } from "../../visual/rhythmGlyph";
import type { ModeDefinition } from "../pulse/Primitives";
import { PulseSpine, RhythmGlyph } from "../pulse/Primitives";

interface ModePlaceholderProps {
  mode: ModeDefinition;
}

const copy: Record<ModeDefinition["id"], string> = {
  create: "",
  sequence: "The rhythm matrix will expose precise structure without turning Synth into a spreadsheet.",
  sound: "Synthesis will be presented as material construction, signal flow, and morphable character.",
  arrange: "Sections will be sculpted as energy and musical transitions rather than a generic DAW timeline.",
  live: "The editor disappears here. Large performance controls will turn Synth into a playable instrument.",
  mix: "The production console shapes balance, space, dynamics, stereo placement, and section-aware mix movement.",
  archive: "Projects, branches, kits, and beats will be identified by their signal signatures rather than cover cards.",
};

export function ModePlaceholder({ mode }: ModePlaceholderProps) {
  const sequencer = useSequencerSnapshot();
  const geometry = useMemo(
    () => deriveRhythmGlyph(sequencer.pattern),
    [sequencer.pattern],
  );

  return (
    <section className="offline-surface" aria-labelledby={"mode-" + mode.id}>
      <div className="offline-surface__index" aria-hidden="true">
        {mode.number}
      </div>
      <div className="offline-surface__body">
        <p className="eyebrow">
          {mode.number} / {mode.label}
        </p>
        <h1 id={"mode-" + mode.id}>{mode.label} is not online yet.</h1>
        <p>{copy[mode.id]}</p>
        <PulseSpine density={42 + Number(mode.number) * 5} />
        <div className="offline-surface__signature">
          <RhythmGlyph
            geometry={geometry}
            label={
              mode.label +
              " preview using current rhythm glyph " +
              geometry.signature
            }
          />
          <span>
            {"RG-" + geometry.signature.slice(0, 6)} · {mode.phase}
          </span>
        </div>
      </div>
    </section>
  );
}
