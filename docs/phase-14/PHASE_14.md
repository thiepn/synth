# Phase 14 — Advanced Sequencer V2

## Status

Implemented.

## Objective

Phase 14 deepens Synth's Rhythm Matrix without turning it into a miniature DAW.

The sequencer remains automation-first, but individual events and lanes can now express substantially richer rhythmic behavior.

```text
Pattern
  ├── 4 / 8 / 16 / 32 / 64 steps
  ├── independent lane loops
  └── StepEvent
       ├── velocity
       ├── probability
       ├── microtiming
       ├── ratchets
       └── flam
             ↓
deterministic playback rules
             ↓
Web Audio scheduler
```

## Pattern length

Supported Pattern lengths are now:

- 4
- 8
- 16
- 32
- 64 sixteenth-note steps

DUP ×2 doubles the current phrase until 64 steps.

At 64 steps, DUP ×2 copies the first 32 steps over the second 32-step half.

Shrinking a Pattern removes events beyond the new Pattern boundary and clamps any lane loop that exceeded it.

All length changes remain undoable.

## Beat Generator compatibility

Generate and Reroll now accept the full Sequencer V2 length contract:

- 4
- 8
- 16
- 32
- 64

The existing style generator remains built around a 16-step vocabulary.

For 32/64-step generation, Phase 14 deterministically extends the initial 16-step motif into later blocks while preserving full-length subdivision activity already produced by the generator.

This keeps long patterns creatively usable without pretending Phase 14 also rewrote the composition generator.

## Per-lane loop lengths

Each PatternLane may store:

```ts
loopLengthTicks?: Tick
```

If omitted, the lane follows the full Pattern length.

If present, the lane cycles independently.

Example:

```text
Pattern: 16 steps

Kick:   16
Snare:  16
Hat:     7
Perc:    5
```

The transport remains on one shared clock while each lane maps the absolute transport step into its own local lane step.

This is the foundation for polymetric rhythm.

Lane lengths can be changed from 1 step up to the current Pattern length through the lane − / + controls.

## Dormant events

Reducing a lane loop does not destructively delete events beyond the lane boundary.

Those events become dormant.

They:

- do not play
- are visually de-emphasized
- do not affect the audible Rhythm Glyph
- become available again if the lane loop is lengthened later

Pattern-length reduction remains destructive beyond the global Pattern boundary, as before.

## Deterministic probability

Each event may use:

```ts
probability: 0..1
```

Probability is evaluated once per event/lane cycle.

The decision seed combines:

- Pattern ID
- lane ID
- event ID
- lane-cycle index
- probability value

There is no ambient `Math.random()`.

Therefore:

- the event can vary between loop cycles
- replay from the same transport origin is reproducible
- short polymetric lanes receive their own probability-cycle sequence

Probability applies to the complete event; ratchet/flam sub-hits do not roll probability separately.

## Ratchets

Each StepEvent may use:

```ts
ratchetCount?: 1 | 2 | 3 | 4
```

A ratchet subdivides the step's audible trigger window.

The transport grid itself never changes.

Ratchet behavior:

- 1 = normal single trigger
- 2–4 = repeated hit cluster
- later hits receive a small deterministic velocity taper
- the cluster remains inside approximately 82% of the sixteenth window

Ratchets are scheduled with exact Web Audio timestamps.

## Flam

Each StepEvent may use:

```ts
flamOffsetUs?: Microseconds
```

Phase 14 exposes:

```text
0–40 ms
```

The first hit plays at the event's normal time.

A secondary lower-velocity strike follows at the flam offset.

The 40 ms ceiling stays inside one sixteenth even at Synth's maximum 300 BPM transport range.

Flam may be combined with a ratchet; it applies to the first ratchet strike.

## Manual per-step timing

The selected Step Editor exposes signed manual microtiming:

```text
-50 ms ... 0 ... +50 ms
```

This value lives in:

```ts
StepEvent.timingOffsetUs
```

Playback combines:

```text
transport pulse
+ Pattern swing
+ event timingOffsetUs
= scheduled event time
```

Editing timing manually clears that event's stored Groove Engine baseline/tag state, making the manual timing the new explicit source rather than allowing a prior humanization pass to overwrite it.

## Advanced editor

The selected-step editor now exposes:

- Velocity
- Probability
- signed Microtime
- Ratchet ×1 / ×2 / ×3 / ×4
- Flam 0–40 ms
- Step On/Off
- Audition

Editing an advanced parameter on an empty selected step creates that StepEvent using the lane's normal default velocity.

Continuous slider edits use the existing coalesced Undo behavior.

## Matrix visualization

Advanced data remains secondary to the main hit geometry.

The Matrix indicates:

- lower probability through reduced hit certainty/opacity
- ratchet count as ×2 / ×3 / ×4
- flam with F
- probability percentage when it is the only advanced modifier
- manual/groove timing through horizontal displacement
- dormant cells beyond a lane loop through dimmed etched treatment
- per-lane current playhead position using the lane's own loop

The global header still follows the Pattern transport position.

## Mobile behavior

The Matrix remains locally horizontally scrollable for 32/64 steps.

Phase 14 widens the sticky mobile lane hardware area so:

- Mute
- Solo
- Rhythm Lock
- lane −
- lane +

remain individually usable rather than being compressed into tiny controls.

Step columns remain 44 px on mobile.

## Playback model

For each transport pulse:

1. derive absolute sequencer step
2. derive each lane's local step using its loop length
3. derive that lane's cycle index
4. locate the local StepEvent
5. evaluate deterministic probability
6. add Pattern swing and event microtiming
7. resolve Pattern lane → Kit slot → Sound → Drum voice
8. expand ratchets
9. add optional flam
10. schedule exact Web Audio timestamps

React never participates in this timing path.

## Historical audition

Phase 10 Pattern audition now honors Sequencer V2 behavior:

- independent lane loops
- probability
- ratchets
- flam
- swing
- event microtiming
- current active Kit/Sound routing

One historical audition therefore reflects the actual advanced Pattern rather than a simplified V1 rendering.

## Rhythm Glyph

Rhythm Glyph identity now includes:

- lane loop length
- probability
- ratchet count
- flam offset
- existing velocity/timing structure

Glyph geometry repeats audible lane events according to per-lane loops.

Dormant events beyond a shortened lane loop do not affect audible glyph geometry or its musical signature.

## CREATE strip consistency

CREATE's compact Instrument Strips now display the effective repeated lane rhythm across the full Pattern.

A 5-step lane inside a 16-step Pattern therefore visibly repeats rather than appearing empty after step 5.

## Creative history

Phase 10's manual-edit checkpoint signature now includes:

- lane loop length
- probability
- ratchet count
- flam offset

Advanced sequencer edits therefore correctly become part of creative source identity when they later feed a generation branch.

## Rhythm Exchange

Rhythm exchange events now preserve:

- tick
- duration
- velocity
- probability
- microtiming
- accent
- ratchet count
- flam offset

This prevents Advanced Sequencer behavior from being silently discarded in interchange.

## Phase boundary

Phase 14 does not yet add:

- arbitrary event conditions beyond probability
- per-ratchet velocity editor
- per-ratchet timing editor
- dedicated timing-lock UI
- dynamics-lock UI
- lane-specific swing curves
- nested tuplets
- editable PPQ
- independent lane meters
- generator-authored polymeter
- piano-roll style editing

Those remain later capabilities.

## Acceptance

- [x] 32-step Pattern support
- [x] 64-step Pattern support
- [x] Generate/Reroll remain valid at 32/64 steps
- [x] per-lane loop lengths
- [x] independent lane playback cycles
- [x] deterministic per-cycle probability
- [x] no ambient randomness
- [x] 1–4 ratchets
- [x] tempo-safe flam
- [x] signed per-step microtiming
- [x] advanced edits remain undoable
- [x] lane loop edits remain undoable
- [x] dormant out-of-loop events are preserved
- [x] dormant events do not play
- [x] Matrix exposes advanced event state
- [x] Matrix playhead follows local lane loops
- [x] mobile lane controls remain usable
- [x] historical audition supports V2 behavior
- [x] Rhythm Glyph supports polymetric loops
- [x] CREATE strips show effective lane repetition
- [x] creative history identity includes V2 data
- [x] Rhythm Exchange preserves V2 event data

## Next phase

**Phase 15 — Pattern Painting & Advanced Sequencer Gestures**

Phase 15 should build faster automation-first editing on top of the V2 engine: Density Painting, Pattern Brushes, lane Generate/Variate/Simplify/Humanize actions, multi-step gesture editing, and rapid phrase shaping without requiring note-by-note programming.
