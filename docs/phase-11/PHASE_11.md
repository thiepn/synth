# Phase 11 — Drum Synthesis Engine V2

## Status

Implemented.

## Objective

Phase 11 replaces the original proof-of-concept drum recipes with a deeper, serializable synthesis architecture that can support future kit generation without coupling sound design to React or runtime AudioNodes.

```text
serializable material spec
        ↓
voice-specific synthesis recipe
        ↓
voice signal layers
        ↓
shared drum bus / space / compression / limiter
```

## V2 material model

Every drum voice now owns the same normalized material dimensions:

- Impact
- Body
- Noise
- Air
- Tone
- Decay
- Pitch
- Character

The meaning is interpreted musically per voice rather than forcing identical DSP.

Examples:

- Kick Character = Sub
- Snare Character = Snap
- Clap Character = Spread
- Hats Character = Metal
- Tom Character = Pitch Drop
- Percussion Character = FM
- Crash Character = Metal

The model is framework-independent and serializable.

## Sound store

Implemented:

```text
src/audio/drumSoundModel.ts
```

The store owns V2 sound material specs for:

- Kick
- Snare
- Clap
- Closed Hat
- Open Hat
- Tom
- Percussion
- Crash

React only subscribes to snapshots.

The Drum Engine reads the current sound specification at trigger/schedule time.

## Domain compatibility

Every V2 material definition can convert into the existing domain:

```ts
SynthSoundSpec
```

with:

- voice kind
- engine version
- parameter map

This is the compatibility bridge Phase 12 can use to construct real generated Kit / Sound domain objects.

Phase 11 does not yet bind the session sound store into project persistence.

## Kick V2

Layers:

- pitched body oscillator
- independent sub oscillator
- filtered click/noise transient
- pitch-drop envelope
- low-pass body shaping

Material controls affect:

- transient pitch movement
- body level
- sub level
- click intensity
- brightness
- tuning
- decay

## Snare V2

Layers:

- pitched body oscillator
- secondary ring oscillator
- filtered noise body
- separate high-frequency snap/wire transient

Material controls affect:

- body/ring balance
- noise amount
- snap
- tuning
- wire brightness
- decay
- impact

## Clap V2

Layers:

- filtered broadband noise
- three-burst clap envelope
- controllable inter-burst spread
- low tonal thickness layer

Character controls temporal Spread rather than pretending to be stereo width.

## Hat V2

Closed and open hats now use:

- six-oscillator inharmonic metallic bank
- high-passed filtered noise
- separate metallic/noise envelopes
- brightness/tuning/material controls
- existing real open-hat choking

This replaces the V1 noise-only hat model.

## Tom V2

Layers:

- resonant body oscillator
- configurable downward pitch movement
- filtered attack noise

Material controls shape:

- body
- tuning
- attack
- pitch drop
- brightness
- decay

## Percussion V2

Layers:

- FM carrier/modulator
- resonant band-pass shaping
- optional noise texture

Character controls FM depth/range.

This provides a much wider synthetic percussion range than V1.

## Crash V2

Layers:

- six-oscillator inharmonic metallic bank
- filtered noise wash
- high-frequency air shaping
- long material decay

This replaces the V1 filtered-noise-only crash.

## Existing master macros retained

The existing master creative macros still affect V2:

- Punch
- Tone
- Decay
- Grit
- Space
- Master

Local V2 material parameters and global macros combine rather than duplicate ownership.

Examples:

- local Impact defines the voice
- global Punch influences the kit-level attack character
- local Tone defines source timbre
- global Tone provides broad kit coloration

## Master path

V2 keeps the established safe output path:

```text
voice layers
   ↓
drum input
   ├── drive
   └── convolution room
        ↓
compression
   ↓
master gain
   ↓
fast limiter
   ↓
browser output
```

## SOUND mode

03 / SOUND is now active.

It includes:

- eight-voice selector
- direct voice trigger
- per-voice reset
- deterministic material scope visualization
- Impact / Body / Noise / Air block visualization
- eight material Signal Rails
- voice-specific labels
- explicit voice signal path
- reset-all control

The interface follows Pulse Architecture and avoids a generic plug-in knob wall.

## Live editing

Changing a V2 sound parameter during playback triggers transport scheduler invalidation.

Already-scheduled future hits are cancelled and refilled with the new material specification.

Current ringing voices are not destructively rewritten.

This gives responsive sound editing while preserving Web Audio scheduling correctness.

## Zero-level safety

Several V2 layers may legitimately be set to zero.

Web Audio exponential ramps cannot safely ramp from an exact zero source value.

All optional envelope peaks therefore clamp to Synth's small positive minimum gain before exponential decay.

Extreme SOUND settings remain valid rather than throwing browser AudioParam errors.

## Polyphony

Tracked hit-level polyphony increased from 48 to 64.

A single hit may contain multiple oscillator/noise layers, but it is tracked as one musical voice for stealing and lifecycle management.

Existing:

- voice pruning
- oldest-voice stealing
- transport epoch cancellation
- hat choking
- audition cancellation

remain active.

## Determinism

Noise and room impulse generation remain seeded and deterministic.

Phase 11 introduces no ambient `Math.random()`.

The visual material scope is also deterministically derived from the sound spec.

## Session persistence boundary

V2 sound material state is currently session-local.

This is intentional and explicit.

Phase 11 establishes the sound specification and runtime engine first.

Phase 12 should generate coherent Kits and bind sound specs into real project Kit / Sound entities, after which later project persistence can serialize them with the rest of Synth.

History nodes from Phase 10 still store Pattern lineage only, so historical Pattern audition uses the **current** V2 sound material.

Sound-history lineage is not faked in Phase 11.

## Phase boundary

Phase 11 does not yet add:

- generated kits
- kit morphing
- multiple saved kits
- sound lineage/history
- sample import
- hybrid sample+synth voices
- per-voice mixer channels
- convolution room presets
- automatic mixing

Those belong to later phases.

## Acceptance

- [x] eight voices use V2 synthesis recipes
- [x] sound state is independent of React
- [x] sound specs are serializable
- [x] V2 specs convert to domain SynthSoundSpec
- [x] kick has body/sub/click layers
- [x] snare has body/ring/noise/snap layers
- [x] clap has multi-burst spread and body thickness
- [x] hats use metallic oscillator banks plus noise
- [x] open-hat choke remains functional
- [x] tom includes pitch-drop body and attack texture
- [x] percussion has FM/resonator synthesis
- [x] crash uses metallic bank plus noise wash
- [x] all eight material parameters reach audible DSP
- [x] global master macros still affect V2
- [x] output compression and limiting remain active
- [x] zero-value layers are Web-Audio-safe
- [x] live sound edits reschedule queued future hits
- [x] SOUND mode is active and responsive
- [x] no ambient random source is introduced
- [x] session-local persistence boundary is explicit

## Next phase

**Phase 12 — Kit Generator**

Phase 12 should generate coherent multi-voice kits from the V2 material model, with directions such as Tight, Huge, Dark, Bright, Clean, Dirty, Electronic, Hybrid, Vintage, Industrial, and Experimental while preserving per-voice musical relationships.
