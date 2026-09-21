# Phase 2 — Core Audio Clock & Transport

## Status

Implemented.

## Objective

Phase 2 makes Synth's transport real without prematurely building the drum synthesizer. Musical time is owned by Web Audio, while React only renders snapshots of that time.

## Architecture

```text
User gesture
   ↓
AudioTransport
   ├── AudioContext lifecycle
   ├── transport state
   ├── tick ↔ audio-time conversion
   ├── 25 ms look-ahead poll
   └── 100 ms schedule horizon
          ↓
 future Web Audio timestamps
          ↓
 Phase 3 voices / later sequencer events

React
   ↑
immutable transport snapshots
   ↑
requestAnimationFrame visual publisher
```

The animation-frame publisher is visual only. It cannot advance musical time.

## Implemented

### Web Audio lifecycle

- lazy AudioContext creation after a user gesture
- interactive latency hint
- safe resume handling
- silent graph priming for browser audio activation
- context-state monitoring
- suspended/interrupted state reporting
- visibility/pageshow recovery attempt
- localized error state

### Transport

- play
- pause
- stop/reset
- keyboard Space play/pause outside editable controls
- BPM 30–300
- common meter selection
- loop length cycling: 1 / 2 / 4 / 8 / 16 bars
- bar / beat / tick readout
- canonical 960 PPQ domain timing

### Musical clock

- absolute playhead represented in ticks
- runtime tick position derived from AudioContext.currentTime
- BPM changes re-anchor at the current tick to prevent playhead jumps
- meter and loop changes reinterpret musical position without changing the underlying clock
- loop wrapping is mathematical; the master clock itself stays monotonic

### Look-ahead scheduler

- 25 ms scheduler polling interval
- 100 ms scheduling horizon
- sixteenth-note pulse grid
- future events expressed in AudioContext time
- scheduler epochs increment after timing/transport changes
- stale/past scheduler windows are skipped after throttling

There is intentionally no audible metronome or drum voice yet. Scheduled pulses are an internal timing contract for Phase 3 and later sequencer playback.

### React integration

`useSyncExternalStore` is used for transport snapshots. React does not own the clock.

Clock subscribers currently drive:

- utility transport readout
- play/pause state
- BPM/meter/loop controls
- bar/beat/tick display
- Pulse Spine position
- transport status indicator

## Pure timing math

`transportMath.ts` isolates:

- BPM clamping
- meter normalization
- ticks per beat/bar/loop
- tick wrapping
- musical-position decomposition
- position formatting

This logic has no React or Web Audio dependency.

## Suspension behavior

If the browser suspends Web Audio:

- scheduling stops
- UI reports SUSPENDED
- the playhead does not drift using wall-clock time
- recovery is attempted when the page becomes visible again
- explicit Play remains available if browser policy requires another gesture

## Phase boundary

Phase 2 does **not** add:

- audible drum voices
- beat sequencing
- synthesized metronome sound
- pattern generation
- sample loading

Those belong to later phases.

## Acceptance

- [x] AudioContext is lazy and user-gesture initiated.
- [x] Web Audio time is the source of truth while playing.
- [x] React timers never advance musical time.
- [x] play/pause/stop work as separate transport states.
- [x] BPM changes preserve current musical position.
- [x] meter and loop length are runtime-editable.
- [x] loop position and bar/beat/tick are derived from 960 PPQ ticks.
- [x] look-ahead scheduling publishes future AudioContext timestamps.
- [x] suspension does not substitute wall-clock timing.
- [x] Pulse Spine follows the real transport clock.

## Next phase

**Phase 3 — Drum Engine V1**

The next phase should connect scheduled transport events to the first actual voices: kick, snare, clap, closed/open hat, tom, percussion, and crash, with a small synthesis/sample hybrid engine and safe master routing.
