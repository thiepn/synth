import { useMemo, useState } from "react";
import { useArrangementSnapshot } from "../../arrange/useArrangement";
import type { ExternalActionTarget } from "../../input/InputActionRouter";
import {
  MIDI_DEFAULT_NOTE_MAP,
  midiStore,
  type MidiBinding,
  type MidiBindingTarget,
  type MidiMessageKind,
  type MidiRecordQuantize,
} from "../../midi/MidiStore";
import { useMidiSnapshot } from "../../midi/useMidi";
import {
  MODULATION_TARGETS,
  modulationTarget,
} from "../../modulation/parameterRegistry";
import { DRUM_PADS } from "../../music/foundationPattern";
import {
  MachineButton,
} from "../pulse/Primitives";

const QUANTIZE: MidiRecordQuantize[] = [
  "off",
  "1/16",
  "1/8",
  "1/4",
];

const PERFORMANCE_TARGETS: ReadonlyArray<{
  label: string;
  target: ExternalActionTarget;
}> = [
  { label: "Energy", target: { kind: "macro", macro: "energy" } },
  { label: "Density", target: { kind: "macro", macro: "density" } },
  { label: "Filter", target: { kind: "macro", macro: "filter" } },
  { label: "Space", target: { kind: "macro", macro: "space" } },
  { label: "Drive", target: { kind: "macro", macro: "drive" } },
  { label: "Morph", target: { kind: "macro", macro: "morph" } },
  { label: "Chaos", target: { kind: "chaos" } },
  { label: "Fill", target: { kind: "fill" } },
  { label: "Drop", target: { kind: "momentary", action: "drop" } },
  { label: "Break", target: { kind: "momentary", action: "break" } },
  { label: "Build", target: { kind: "momentary", action: "build" } },
  { label: "Repeat", target: { kind: "momentary", action: "repeat" } },
  { label: "Stutter", target: { kind: "momentary", action: "stutter" } },
  { label: "Play / Pause", target: { kind: "transport", action: "toggle" } },
  { label: "Stop", target: { kind: "transport", action: "stop" } },
];

function kindLabel(kind: MidiMessageKind): string {
  switch (kind) {
    case "cc":
      return "CC";
    case "pitchBend":
      return "PITCH";
    case "channelPressure":
      return "PRESS";
    case "polyAftertouch":
      return "POLY AT";
    case "note":
    default:
      return "NOTE";
  }
}

function targetLabel(target: MidiBindingTarget): string {
  switch (target.kind) {
    case "pad":
      return "Pad / " + target.voice.toUpperCase();
    case "macro":
      return "LIVE / " + target.macro.toUpperCase();
    case "chaos":
      return "LIVE / CHAOS";
    case "momentary":
      return "LIVE / " + target.action.toUpperCase();
    case "fill":
      return "LIVE / FILL";
    case "scene":
      return "SCENE / " + target.sectionId;
    case "transport":
      return "TRANSPORT / " + target.action.toUpperCase();
    case "parameter":
      return (
        "PARAM / " +
        (modulationTarget(target.targetId)?.label ?? target.targetId)
      );
  }
}

function bindingSource(binding: MidiBinding): string {
  const numberSuffix =
    binding.messageKind === "pitchBend" ||
    binding.messageKind === "channelPressure"
      ? ""
      : " " + binding.number;
  return (
    kindLabel(binding.messageKind) +
    numberSuffix +
    " · CH " +
    (binding.channel ?? "ANY")
  );
}

function LearnButton({
  label,
  target,
  activeLabel,
}: {
  label: string;
  target: Parameters<typeof midiStore.beginLearn>[0]["target"];
  activeLabel?: string;
}) {
  const midi = useMidiSnapshot();
  const active =
    midi.learn?.label === (activeLabel ?? label);

  return (
    <button
      type="button"
      className={
        active
          ? "midi-learn-button is-learning"
          : "midi-learn-button"
      }
      disabled={midi.status !== "ready"}
      onClick={() => {
        if (active) {
          midiStore.cancelLearn();
        } else {
          midiStore.beginLearn({
            target,
            label: activeLabel ?? label,
          });
        }
      }}
    >
      <span>{active ? "LEARNING" : "LEARN"}</span>
      <strong>{label}</strong>
    </button>
  );
}

export function MidiPanel() {
  const midi = useMidiSnapshot();
  const arrangement = useArrangementSnapshot();
  const [profileName, setProfileName] = useState("My Controller");
  const [parameterTargetId, setParameterTargetId] = useState(
    MODULATION_TARGETS[0]?.id ?? "engine.filter",
  );
  const [status, setStatus] = useState(
    "MIDI PERMISSION IS REQUESTED ONLY WHEN YOU ENABLE IT",
  );

  const defaultNotes = useMemo(
    () =>
      DRUM_PADS.map((pad) => ({
        pad,
        note: Object.entries(MIDI_DEFAULT_NOTE_MAP).find(
          ([, voice]) => voice === pad.voice,
        )?.[0],
      })),
    [],
  );

  const enable = async () => {
    await midiStore.enable();
    const next = midiStore.getSnapshot();
    setStatus(
      next.status === "ready"
        ? "MIDI READY / " + next.inputs.length + " INPUTS"
        : next.status === "unsupported"
          ? "WEB MIDI IS NOT AVAILABLE IN THIS BROWSER"
          : next.lastError ?? "MIDI CONNECTION FAILED",
    );
  };

  const toggleRecording = async () => {
    if (midi.recording) {
      const count = midiStore.stopRecording();
      setStatus(
        count > 0
          ? "MIDI TAKE COMMITTED / " + count + " HITS"
          : "EMPTY MIDI TAKE",
      );
    } else {
      await midiStore.startRecording();
      setStatus("MIDI RECORDING / PLAY DRUM PADS");
    }
  };

  const saveProfile = () => {
    const profile = midiStore.saveProfile(profileName);
    setStatus(
      profile
        ? "PROFILE SAVED / " + profile.name.toUpperCase()
        : "ENTER A PROFILE NAME",
    );
  };

  return (
    <section className="midi-panel" aria-labelledby="midi-title">
      <div className="machine-section-label">
        <span id="midi-title">MIDI / EXTERNAL CONTROL</span>
        <span>
          {midi.status.toUpperCase()}
          {midi.selectedInputName
            ? " · " + midi.selectedInputName.toUpperCase()
            : ""}
        </span>
      </div>

      {!midi.supported ? (
        <div className="midi-unsupported">
          <strong>WEB MIDI UNAVAILABLE</strong>
          <span>
            Synth remains fully usable with touch, mouse, keyboard, and the
            on-screen pads. Use a browser with Web MIDI support for hardware
            controllers.
          </span>
        </div>
      ) : (
        <>
          <div className="midi-connection">
            <div className="midi-connection__actions">
              <MachineButton
                active={midi.status === "ready"}
                disabled={midi.status === "requesting"}
                onClick={() => void enable()}
              >
                {midi.status === "ready"
                  ? "MIDI ENABLED"
                  : midi.status === "requesting"
                    ? "REQUESTING…"
                    : "ENABLE MIDI"}
              </MachineButton>

              <select
                value={midi.selectedInputId ?? ""}
                disabled={midi.status !== "ready"}
                onChange={(event) =>
                  void midiStore.selectInput(
                    event.currentTarget.value || undefined,
                  )
                }
                aria-label="MIDI input"
              >
                <option value="">NO INPUT</option>
                {midi.inputs.map((input) => (
                  <option key={input.id} value={input.id}>
                    {input.name}
                    {input.manufacturer
                      ? " · " + input.manufacturer
                      : ""}
                  </option>
                ))}
              </select>

              <label>
                <span>CHANNEL</span>
                <select
                  value={midi.channelFilter ?? "all"}
                  disabled={midi.status !== "ready"}
                  onChange={(event) =>
                    midiStore.setChannelFilter(
                      event.currentTarget.value === "all"
                        ? null
                        : Number(event.currentTarget.value),
                    )
                  }
                >
                  <option value="all">ALL</option>
                  {Array.from({ length: 16 }, (_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {index + 1}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                className={
                  midi.clockSync
                    ? "midi-clock is-active"
                    : "midi-clock"
                }
                disabled={midi.status !== "ready"}
                onClick={() =>
                  midiStore.setClockSync(!midi.clockSync)
                }
                aria-pressed={midi.clockSync}
              >
                <span>MIDI CLOCK</span>
                <strong>
                  {midi.clockSync
                    ? midi.externalClockBpm
                      ? midi.externalClockBpm.toFixed(1) + " BPM"
                      : "FOLLOW"
                    : "OFF"}
                </strong>
              </button>
            </div>

            <div className="midi-connection__status">
              <span>{midi.lastMessage ?? status}</span>
              {midi.lastError ? (
                <strong>{midi.lastError}</strong>
              ) : null}
            </div>
          </div>

          <div className="midi-grid">
            <div className="midi-learn-bank">
              <div className="midi-subhead">
                <span>DRUM PADS</span>
                <strong>DEFAULT GM + LEARN</strong>
              </div>
              <div className="midi-pad-learn-grid">
                {defaultNotes.map(({ pad, note }) => (
                  <LearnButton
                    key={pad.voice}
                    label={
                      pad.label +
                      (note ? " / N" + note : "")
                    }
                    activeLabel={"PAD " + pad.voice}
                    target={{
                      kind: "pad",
                      voice: pad.voice,
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="midi-learn-bank">
              <div className="midi-subhead">
                <span>LIVE / ACTIONS</span>
                <strong>NOTE OR CC</strong>
              </div>
              <div className="midi-action-learn-grid">
                {PERFORMANCE_TARGETS.map((entry) => (
                  <LearnButton
                    key={entry.label}
                    label={entry.label}
                    activeLabel={"LIVE " + entry.label}
                    target={entry.target}
                  />
                ))}
              </div>
            </div>

            <div className="midi-learn-bank">
              <div className="midi-subhead">
                <span>SCENES</span>
                <strong>
                  {arrangement.blueprint?.sections.length ?? 0}
                </strong>
              </div>
              {arrangement.blueprint ? (
                <div className="midi-scene-learn-grid">
                  {arrangement.blueprint.sections.map((section) => (
                    <LearnButton
                      key={section.id}
                      label={section.label}
                      activeLabel={"SCENE " + section.id}
                      target={{
                        kind: "scene",
                        sectionId: section.id,
                      }}
                    />
                  ))}
                </div>
              ) : (
                <p className="midi-empty">
                  Create an ARRANGE song to expose scene-launch targets.
                </p>
              )}
            </div>

            <div className="midi-parameter-learn">
              <div className="midi-subhead">
                <span>PARAMETER LEARN</span>
                <strong>CC / BEND / PRESSURE</strong>
              </div>
              <select
                value={parameterTargetId}
                disabled={midi.status !== "ready"}
                onChange={(event) =>
                  setParameterTargetId(event.currentTarget.value)
                }
              >
                {MODULATION_TARGETS.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.label}
                  </option>
                ))}
              </select>
              <LearnButton
                label={
                  modulationTarget(parameterTargetId)?.label ??
                  parameterTargetId
                }
                activeLabel={"PARAM " + parameterTargetId}
                target={{
                  kind: "parameter",
                  targetId: parameterTargetId,
                }}
              />
              <p>
                Hardware values enter Phase 24 as External modulation sources
                in replace mode, so they use the same parameter registry and
                bounds as automation.
              </p>
            </div>
          </div>

          <div className="midi-record-panel">
            <div className="midi-subhead">
              <span>MIDI / RECORD</span>
              <strong>
                {midi.recording
                  ? midi.recordingHitCount + " HITS"
                  : "PATTERN CAPTURE"}
              </strong>
            </div>

            <div className="midi-record-controls">
              <div className="midi-quantize-bank">
                {QUANTIZE.map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={
                      midi.recordQuantize === value
                        ? "is-active"
                        : undefined
                    }
                    disabled={midi.recording}
                    onClick={() => midiStore.setRecordQuantize(value)}
                  >
                    {value.toUpperCase()}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className={
                  midi.overdub ? "midi-overdub is-active" : "midi-overdub"
                }
                disabled={midi.recording}
                onClick={() => midiStore.setOverdub(!midi.overdub)}
                aria-pressed={midi.overdub}
              >
                {midi.overdub ? "OVERDUB" : "REPLACE LANES"}
              </button>

              <MachineButton
                active={midi.recording}
                disabled={midi.status !== "ready"}
                onClick={() => void toggleRecording()}
              >
                {midi.recording ? "■ STOP MIDI TAKE" : "● RECORD MIDI"}
              </MachineButton>
            </div>

            <p>
              OFF preserves sub-step timing as bounded microtiming. Quantized
              modes commit to the selected grid. A completed take is one normal
              Pattern + one History action.
            </p>
          </div>

          <div className="midi-bindings-panel">
            <div className="midi-subhead">
              <span>MAPPINGS</span>
              <strong>{midi.bindings.length}</strong>
            </div>

            {midi.bindings.length > 0 ? (
              <div className="midi-binding-list">
                {midi.bindings.map((binding) => (
                  <div key={binding.id} className="midi-binding">
                    <span>{bindingSource(binding)}</span>
                    <strong>{targetLabel(binding.target)}</strong>
                    <small>
                      {binding.inputName ?? "ANY INPUT"}
                    </small>
                    <button
                      type="button"
                      onClick={() =>
                        midiStore.removeBinding(binding.id)
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="midi-empty">
                No learned mappings. Default drum-note mapping still works.
              </p>
            )}

            <div className="midi-binding-actions">
              <MachineButton
                compact
                disabled={midi.bindings.length === 0}
                onClick={() => midiStore.clearBindings()}
              >
                CLEAR MAPPINGS
              </MachineButton>
              {midi.learn ? (
                <MachineButton
                  compact
                  active
                  onClick={() => midiStore.cancelLearn()}
                >
                  CANCEL LEARN / {midi.learn.label}
                </MachineButton>
              ) : null}
            </div>
          </div>

          <div className="midi-profiles">
            <div className="midi-subhead">
              <span>CONTROLLER PROFILES</span>
              <strong>{midi.profiles.length}/12</strong>
            </div>

            <div className="midi-profile-save">
              <input
                value={profileName}
                maxLength={48}
                onChange={(event) =>
                  setProfileName(event.currentTarget.value)
                }
                aria-label="MIDI controller profile name"
              />
              <MachineButton
                compact
                disabled={midi.status !== "ready"}
                onClick={saveProfile}
              >
                SAVE PROFILE
              </MachineButton>
            </div>

            {midi.profiles.length > 0 ? (
              <div className="midi-profile-list">
                {[...midi.profiles].reverse().map((profile) => (
                  <div key={profile.id}>
                    <span>{profile.name}</span>
                    <small>
                      {profile.bindings.length} MAPS
                      {profile.inputName
                        ? " · " + profile.inputName
                        : ""}
                    </small>
                    <button
                      type="button"
                      onClick={() => {
                        const ok = midiStore.loadProfile(profile.id);
                        setStatus(
                          ok
                            ? "PROFILE LOADED / " +
                                profile.name.toUpperCase()
                            : "PROFILE LOAD FAILED",
                        );
                      }}
                    >
                      LOAD
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        midiStore.deleteProfile(profile.id)
                      }
                    >
                      DELETE
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <p className="midi-profile-note">
              Profiles are session-local in Phase 31. The later persistence
              phase serializes this plain profile data without changing MIDI
              semantics.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
