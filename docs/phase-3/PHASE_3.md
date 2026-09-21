# Phase 3 — Drum Engine V1

## Status

Implemented.

## Objective

Phase 3 turns Synth from a silent transport prototype into an actual playable drum instrument. The first engine is synthesis-first and dependency-free: every core voice is generated locally with Web Audio.

## Signal architecture

```text
scheduled drum voice
      ↓
voice envelope / filter
      ↓
voice kill gain
      ↓
DRUM INPUT ────────┬──── drive ────┐
                   │                │
                   └── convolver ─ wet
                                    │
                              compressor
                                    │
                               master gain
                                    │
                              audio output
```

## Voices

Implemented:

- kick
- snare
- clap
- closed hi-hat
- open hi-hat
- tom
- percussion
- crash

All are synthesized with Web Audio oscillators, deterministic noise buffers, filters, envelopes, and modulation.

## Drum synthesis

### Kick
- sine body
- fast pitch sweep
- velocity-aware envelope
- Punch macro influences transient/body impact

### Snare
- triangle body
- filtered deterministic noise
- independent body/noise envelopes

### Clap
- filtered noise
- three short burst envelope
- longer decay tail

### Hats
- high-passed / band-passed noise
- separate closed/open decay
- real open-hat choke behavior when a closed hat arrives

### Tom
- sine resonant body
- downward pitch envelope

### Percussion
- FM-style carrier/modulator pair
- short resonant envelope

### Crash
- bright filtered noise
- long decay
- subtle shared room response

## Master bus

Implemented:

- drum input bus
- controllable waveshaping grit
- short deterministic convolution room
- wet amount
- compressor
- master gain
- final fast output limiter

The compressor shapes the drum bus while the final limiter provides a separate last-stage ceiling before the browser audio destination.

## Macros

Live engine controls:

- MASTER
- PUNCH
- TONE
- DECAY
- GRIT
- SPACE

Macros intentionally map to multiple low-level synthesis/routing parameters rather than exposing a plugin-style wall of technical controls.

## Polyphony and cleanup

- maximum 48 tracked voices
- ended voices are pruned
- oldest voices are stolen when the limit is reached
- transport-scheduled sources carry scheduler epochs
- obsolete future voices are cancelled after tempo/transport changes
- Pause/Stop choke transport-owned voices
- direct pad audition is not accidentally killed by transport state changes

## Shared pattern source

`foundationPattern.ts` is now the single source for both:

1. the visible Instrument Strip rhythm, and
2. transport-scheduled playback.

The UI cannot silently drift away from what is actually heard.

The base four strips drive kick, snare, closed hat, and percussion. Lightweight orchestration adds:

- crash at the beginning
- clap reinforcement
- selected open hats
- final-bar tom transition

This remains a foundation beat, not the later generative engine.

## Direct instrument mode

Eight pads are playable immediately:

```text
A   Kick
S   Snare
D   Clap
F   Closed Hat
J   Open Hat
K   Tom
L   Percussion
;   Crash
```

Shift + key uses full velocity.

Pad interaction unlocks/resumes Web Audio without forcing transport playback.

## Transport integration

The Drum Engine subscribes directly to Phase 2 scheduled pulses.

```text
AudioTransport
   ↓ future sixteenth pulse with AudioContext timestamp
DrumEngine
   ↓ map pulse → pattern hits
voice synthesis
   ↓
Web Audio start(audioTime)
```

React is not in the scheduling path.

## Deterministic noise

Synthesized noise and room impulse buffers use seeded xorshift generators rather than ambient `Math.random()`. This keeps engine behavior stable and aligned with Synth's deterministic architecture.

## Phase boundary

Phase 3 does not yet implement:

- editable sequencer events
- per-step probability
- sophisticated synthesized kit designer
- generated kits
- sample import
- Beat Generator
- groove/microtiming engine

Those arrive in later phases.

## Acceptance

- [x] all eight V1 drum voices are audible and locally synthesized
- [x] direct pads can unlock audio without starting transport
- [x] foundation beat is scheduled from Phase 2 future timestamps
- [x] visible rhythm data and playback share one source
- [x] open hats choke correctly
- [x] master routing has saturation, space, compression, gain, and a final limiter
- [x] engine macros affect real DSP/synthesis parameters
- [x] stale future transport voices are cancelable through scheduler epochs
- [x] transport stop/pause clears transport-owned voice tails
- [x] engine has bounded tracked polyphony

## Next phase

**Phase 4 — Rhythm Matrix Sequencer V1**

The next phase should replace the static foundation pattern with editable domain pattern data, allow step toggling and velocity changes, and make the visible Rhythm Matrix the source of scheduled playback.
