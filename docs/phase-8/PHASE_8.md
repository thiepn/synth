# Phase 8 — Groove & Humanization Engine

## Status

Implemented.

## Objective

Phase 8 turns Synth grooves from grid-quantized patterns with basic swing into deterministic musical feel.

The feel system operates on the same editable Pattern used by generation, reroll, SEQUENCE, Rhythm Glyph, and Drum Engine playback.

```text
Pattern
  + personality
  + humanization
  + ghost amount
  + swing
  + deterministic seed
        ↓
Groove Engine
        ↓
velocity contour
role microtiming
correlated beat drift
local timing variation
ghost-note vocabulary
        ↓
editable Pattern
        ↓
Web Audio / Matrix / Glyph
```

## Groove personalities

Implemented:

- Mechanical
- Tight
- Deep
- Laid-back
- Pushing
- Loose
- Human

Each personality defines a different combination of:

- role timing offsets
- timing-variation scale
- velocity-variation scale
- ghost-note tendency

The profiles are not names for the same random jitter amount.

### Mechanical
No human timing or velocity variation.

### Tight
Very small offsets with controlled dynamics.

### Deep
Kick slightly forward, backbeat later, stronger pocket, more ghost-note vocabulary.

### Laid-back
Most voices—especially snare/clap—sit later.

### Pushing
Kick, hats, and backbeat lean ahead of the grid.

### Loose
Largest correlated timing/velocity movement.

### Human
Balanced musical variation without the stronger identity of Deep/Laid-back/Pushing.

## Deterministic humanization

Humanization uses Synth's seeded PRNG.

There is no ambient `Math.random()`.

Deterministic seeds are derived for:

- each beat group
- each lane/event
- velocity variation
- ghost-note decisions

Applying the same:

- source Pattern
- groove seed
- personality
- humanization
- ghost amount
- swing

produces the same result.

## Correlated timing

Timing is not independent ±N ms jitter.

The engine combines:

1. role-specific personality offset
2. shared beat-group drift
3. smaller event-local timing variation

Events within the same beat therefore move together slightly rather than behaving like unrelated random points.

Example Deep pocket:

```text
kick       slightly early
snare      clearly late
closed hat near center
percussion slightly late
```

## Velocity behavior

Humanization also shapes dynamics.

Role-aware contours include:

- stronger quarter-position hats
- softer inner sixteenths
- stable but slightly varied kick accents
- backbeat emphasis
- percussion alternation

Variation strength is controlled by Humanize and the selected personality.

Velocity changes affect both:

- Drum Engine synthesis
- Rhythm Matrix hit height

## Ghost-note vocabulary

Ghost notes can be generated deterministically on musically plausible empty subdivisions.

V1 ghost vocabulary is intentionally restrained:

- snare ghost positions around the backbeat
- percussion on selected off-grid sixteenth positions
- closed-hat inner subdivision notes

Claps do not receive snare-style ghost vocabulary.

Generated ghost notes are:

- low velocity
- explicitly tagged as ghost accents
- deterministic
- removable by lowering Ghosts and reapplying
- removable by Reset Feel

Manually edited former ghost notes stop being treated as generated groove material.

## Non-cumulative feel

Humanization is re-applicable rather than cumulative.

Events may retain:

```ts
grooveBase: {
  velocity,
  timingOffsetUs,
  accent
}
```

The engine recalculates from that baseline whenever feel settings change.

This prevents repeated Apply Feel operations from drifting further and further away from the musical source.

Manual velocity editing clears that event's stored groove baseline so the manual value becomes the new source.

## Swing ownership

Swing now belongs to the Pattern groove profile.

It is not baked into generated event timing.

```text
Pattern.groove.swing
      ↓
Drum Engine scheduler
      ↓
odd sixteenth delay
      ↓
Web Audio timestamp
```

Per-event `timingOffsetUs` is therefore reserved for:

- role timing
- correlated human drift
- local microtiming
- future manual timing edits

This avoids double-swing.

## Web Audio integration

For every scheduled event:

```text
transport pulse audioTime
 + Pattern swing offset
 + event human timingOffsetUs
 = final Web Audio start time
```

The scheduler remains the source of truth.

React never advances musical time.

## Rhythm locks

Phase 6 rhythm locks remain structural.

A rhythm lock:

- blocks generated ghost-note additions/removals for that lane
- still allows existing hits to receive global feel and human dynamics

This preserves the distinction from the Phase 0 timing and dynamics lock dimensions.

If timing/dynamics locks are activated by later UI, the Groove Engine already respects them.

## Persistent feel through generation/reroll

CREATE treats feel as creative state.

Generating a fresh beat automatically applies the current:

- personality
- Humanize
- Ghosts
- Swing

to the accepted generated Pattern.

Rerolling also reuses the current groove seed and settings, so new material enters the existing pocket instead of snapping back to mechanical timing.

## Apply / Reset Feel

CREATE now exposes:

- personality bank
- Humanize
- Ghosts
- Swing
- Apply Feel
- Reset Feel

Apply Feel is one normal undoable Pattern transform.

Reset Feel:

- restores stored event baselines
- removes Groove Engine ghost notes
- clears human timing
- clears human velocity shaping
- resets swing
- returns the Pattern to Mechanical feel

## Undo / Redo

Groove transforms use the same SequencerStore history as manual editing and generation.

```text
Pattern
  ↓ Apply Feel
Human Pattern
  ↓ Undo
Original Pattern
```

Undo/Redo also resynchronizes the Groove controls to the restored Pattern profile.

Unapplied control tweaks are not discarded by unrelated lane edits or lock changes.

## Rhythm Matrix visualization

SEQUENCE now visualizes actual playback timing.

Each hit moves horizontally according to:

```text
Pattern swing
+
event microtiming
```

The visible offset is bounded for readability but uses the same timing data as the Drum Engine.

Ghost notes are rendered with lower visual weight.

The selected-step readout shows:

- accent type
- signed timing in milliseconds

## Rhythm Glyph integration

Rhythm Glyph geometry now reflects:

- humanized velocity
- ghost-note additions
- per-event microtiming
- Pattern swing

Swing shifts odd-subdivision geometry horizontally, while event microtiming provides finer local displacement.

The Glyph and Matrix therefore display the same feel that is heard.

## SEQUENCE diagnostics

The compact glyph strip now exposes:

- Density
- Syncopation
- Swing
- Mean Velocity
- Humanization

It also displays the active groove personality.

## Domain additions

`GrooveProfile` now supports optional:

- ghost-note amount
- deterministic seed
- groove-engine version
- per-role timing offsets

`StepEvent` supports optional `grooveBase` state for reversible/re-applicable feel.

These remain plain serializable project data.

## Phase boundary

Phase 8 does not yet add:

- semantic mutation commands
- per-step manual timing editor
- timing-lock UI
- dynamics-lock UI
- user-authored groove templates
- extracted grooves from MIDI/audio
- polymetric groove profiles
- swing curve editor
- MPC-style named groove library

Those belong to later phases.

## Acceptance

- [x] seven distinct groove personalities
- [x] deterministic humanization with no ambient randomness
- [x] correlated beat-group timing drift
- [x] role-specific microtiming
- [x] deterministic velocity shaping
- [x] musical ghost-note vocabulary
- [x] ghost amount can be reduced without accumulating old ghosts
- [x] feel changes are recalculated from a stable baseline
- [x] manual velocity edits redefine the groove baseline
- [x] swing is applied exactly once at playback time
- [x] generated beats inherit the current feel
- [x] rerolled beats retain the current pocket
- [x] Apply/Reset Feel are undoable
- [x] Rhythm Matrix displays actual timing displacement
- [x] Rhythm Glyph displays swing and microtiming
- [x] SEQUENCE displays personality and humanization
- [x] hot feel changes reuse existing scheduler invalidation

## Next phase

**Phase 9 — Groove Engine 2.0 / Advanced Sequencing Foundation**

Before semantic mutation commands, the next phase should deepen rhythm behavior with probability, flam, ratchets, richer timing control, per-lane lengths, and more advanced groove-editing primitives while preserving the automation-first workflow.
