# Phase 31 — MIDI, Pad Performance & External Control

Status: implemented.

## What shipped

### Explicit Web MIDI activation
Synth never requests MIDI permission on startup.

The user explicitly chooses ENABLE MIDI.

If Web MIDI is unavailable, Synth remains fully usable with:
- touch
- mouse
- keyboard
- on-screen pads
- all non-MIDI creation/production systems

### Input discovery and hot-plug
The MIDI layer supports:
- input enumeration
- explicit input selection
- automatic single-device connection
- reconnect by remembered device name during the session
- disconnect cleanup
- Web MIDI state-change refresh
- optional channel filter: ALL or channels 1–16

Old input message handlers are detached when switching devices.

Where supported, the previous device is closed before another input is selected.

### Default drum-pad mapping
Standard drum notes work without MIDI Learn:

- 36 Kick
- 38 Snare
- 39 Clap
- 42 Closed Hat
- 46 Open Hat
- 45 Tom
- 37 Percussion
- 49 Crash

MIDI pads trigger the current configured Synth sound, including:
- V2 synth
- imported sample
- hybrid source
- Sample Lab slice assignments

They do not bypass Kit/slot resolution.

### MIDI Learn
Learnable action targets include:

#### Pads
- all eight drum voices

#### LIVE macros
- Energy
- Density
- Filter
- Space
- Drive
- Morph
- Chaos

#### LIVE actions
- Fill
- Drop
- Break
- Build
- Repeat
- Stutter

#### Transport
- Play/Pause
- Stop

#### ARRANGE scenes
Every current section can become a learned Scene launch target.

#### Parameters
Every registered Phase 24 parameter can be controlled by hardware.

Parameter learn supports:
- Note
- CC
- Pitch Bend
- Channel Pressure
- Poly Aftertouch

Action learn intentionally accepts only Note/CC so continuous pressure/bend messages cannot accidentally become one-shot transport or scene triggers.

### Shared input action router
External actions route through one InputActionRouter rather than each subsystem parsing MIDI independently.

Targets reuse existing systems:

~~~text
MIDI
  ↓
InputActionRouter
  ├── DrumEngine
  ├── PerformanceStore
  ├── ChaosStore
  ├── ArrangementPlaybackStore
  └── AudioTransport
~~~

This keeps MIDI semantics aligned with the same actions available in the UI.

### Hardware parameter control
Hardware control values enter Phase 24 through External modulation sources.

The route uses replace mode:

~~~text
MIDI CC / Bend / Pressure
      ↓
External ModulationSource
      ↓
Phase 24 parameter registry
      ↓
replace route
      ↓
normal target bounds
~~~

No second parameter system is introduced.

### MIDI message coverage
Supported incoming channel messages:
- Note On
- Note Off
- CC
- Pitch Bend
- Channel Pressure
- Poly Aftertouch

Supported system real-time messages:
- MIDI Start
- MIDI Continue
- MIDI Stop
- MIDI Clock

### MIDI Clock
Clock following is optional.

When enabled:
- MIDI Clock pulses are measured at 24 PPQN
- invalid pulse gaps reset the estimator
- a trimmed rolling interval window rejects timing outliers
- BPM is bounded to Synth's 30–300 range
- transport BPM is updated at a bounded cadence
- UI clock diagnostics are throttled

Start/Continue/Stop messages can control transport independently.

### Pad recording
Hardware drum performance can be committed directly into the current Pattern.

Record quantize:
- OFF
- 1/16
- 1/8
- 1/4

OFF preserves sub-grid performance using bounded Sequencer microtiming.

Recording modes:
- OVERDUB
- REPLACE affected lanes

A completed take:
- uses the existing Pattern model
- preserves unaffected lanes
- stores velocity
- preserves bounded microtiming when quantize is OFF
- creates one Sequencer action
- creates one Generation History node with midiRecord provenance

### Controller profiles
A session can save up to 12 controller profiles.

A profile stores:
- name
- preferred input name
- channel filter
- learned bindings

Loading a profile reconstructs hardware parameter External sources/routes as needed.

Profiles are session-local in Phase 31. Later persistence work can serialize these plain data structures without changing MIDI semantics.

### LIVE controller surface
LIVE now exposes:
- Enable MIDI
- input selector
- channel filter
- MIDI Clock follow
- latest incoming message
- drum-pad learn grid
- performance/action learn grid
- Scene learn grid
- parameter target learn
- MIDI record controls
- binding inspector/removal
- controller profile save/load/delete

The surface is responsive across desktop/tablet/mobile.

## Recording architecture

~~~text
hardware Note On
      ↓
MidiStore
      ├── immediate DrumEngine trigger
      └── optional RecordedMidiHit
                ↓
          stopRecording()
                ↓
          quantize / microtiming
                ↓
          ordinary Pattern
                ↓
      SequencerStore + GenerationHistory
~~~

React never participates in hit timing.

The exact performance tick is read from AudioTransport's Web Audio clock.

## Safety invariants

- MIDI permission is opt-in
- SysEx is disabled
- unsupported browsers degrade cleanly
- changing inputs detaches the previous message handler
- Note Off releases momentary learned actions
- one-shot drum pads remain one-shot
- pitch/pressure hardware learn is restricted to parameters
- parameter hardware values remain bounded by the Phase 24 registry
- controller profiles do not create duplicate parameter systems
- MIDI recording commits an ordinary editable Pattern
- MIDI recording is stopped before ARRANGE recording conflicts can occur
- external clock following is optional and bounded
- MIDI UI timing never drives musical scheduling
