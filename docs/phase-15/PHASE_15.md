# Phase 15 — Pattern Painting & Advanced Sequencer Gestures

## Status

Implemented.

## Objective

Phase 15 makes Advanced Sequencer V2 fast to shape.

Phase 14 added deep event/lane behavior. Phase 15 adds higher-level editing gestures so 32/64-step Patterns do not require note-by-note programming.

```text
SELECT / SCROLL
      or
PATTERN BRUSH
      ↓
drag across Matrix
      ↓
one live gesture
      ↓
one Undo action
```

and:

```text
selected lane
  ↓
GENERATE / VARIATE / SIMPLIFY / HUMANIZE
  ↓
rapid lane-level phrase shaping
```

## Editing modes

SEQUENCE now has an explicit mode boundary.

### SELECT / SCROLL

Default mode.

Preserves existing behavior:

- click to select/add/remove steps
- Shift-click velocity cycling
- horizontal matrix scrolling
- full mobile scrolling behavior
- Step Editor interaction

### PAINT mode

Activated by choosing any Pattern Brush.

In paint mode:

- pointer/touch movement paints continuously across step cells
- horizontal matrix scrolling is intentionally suspended during the active paint workflow
- returning to SELECT restores normal scrolling
- the complete stroke is grouped as one Undo action

This prevents paint gestures from fighting mobile horizontal navigation.

## Pattern brushes

Implemented:

- Draw
- Density
- Kick
- Hat
- Perc
- Fill
- Ghost
- Silence

A separate Brush Density control shapes probabilistic/role-aware brush behavior.

## Draw brush

DRAW paints normal hits into the physically touched lane.

Velocity is role-aware:

- kicks emphasize structural pulses
- snares/claps emphasize backbeats
- hats use alternating subdivision dynamics
- tom/percussion values remain lighter and more varied
- cymbals use stronger structural accents

DRAW is a direct manual edit and therefore may override a rhythm lock.

## Density brush

DENSITY treats the dragged area as an occupancy target rather than merely adding notes.

For every touched step it deterministically decides:

- keep/add a hit
- or clear the step

using:

- Brush Density
- lane instrument role
- musical grid position
- deterministic stroke seed

This enables fast sparse↔busy reshaping across long Patterns.

## Semantic brushes

### Kick

KICK routes the gesture to the semantic Kick lane.

Its role weighting favors:

- downbeats
- even subdivisions
- lower-probability syncopated positions

### Hat

HAT routes to Closed Hat.

It favors:

- even sixteenths
- stronger quarter/eighth structure
- density-controlled inner subdivisions

### Perc

PERC routes to Percussion.

It favors syncopated/offbeat activity and may use reduced event probability at low density.

### Fill

FILL routes material between:

- Tom
- Percussion

according to phrase position.

It may create:

- short ratchets
- small flams
- rising fill dynamics

using the Advanced Sequencer V2 event model.

### Ghost

GHOST paints low-velocity ghost events in the touched lane.

Typical velocity:

```text
0.14–0.28
```

Ghost events receive an explicit Ghost accent and reduced probability.

### Silence

SILENCE removes events touched by the gesture without changing:

- Pattern length
- lane loop length
- dormant material outside the active lane loop

## Determinism

Brush behavior uses Synth's seeded PRNG.

A stroke seed is derived from:

- Pattern ID
- Pattern revision at stroke start
- brush type
- starting lane
- starting step

Each touched step then derives its own deterministic decision.

There is no ambient `Math.random()`.

## Gesture transaction / Undo

A drag gesture is live: every newly traversed cell updates immediately.

However, `SequencerStore` maintains an active gesture transaction key.

```text
pointer down
  ↓
beginPaintGesture
  ↓
step 1
step 2
step 3
...
  ↓
pointer up / cancel
  ↓
endPaintGesture
```

Only the first musical change pushes the pre-gesture Pattern onto Undo history.

Subsequent changes using the same gesture key coalesce regardless of stroke duration.

Therefore:

```text
one drag
=
one Undo
```

even for long 64-step strokes.

## Pointer lifecycle

Paint traversal is tracked through global Pointer Events plus `document.elementFromPoint`.

This supports:

- mouse dragging
- pen input
- touch painting while PAINT mode is active

The gesture also closes on:

- pointerup
- pointercancel
- SEQUENCE unmount

so the store cannot remain trapped in an active transaction.

## Repeated-cell protection

Each stroke remembers visited:

```text
laneId : stepIndex
```

pairs.

Crossing the same visual cell repeatedly during one gesture does not continually mutate/re-randomize it.

## Polymetric behavior

Brushes only modify audible cells inside the target lane's current loop length.

If a lane is:

```text
LEN 5
```

inside a 16-step Pattern, painting steps 6–16 does not silently rewrite its dormant events.

Dormant material remains available when the lane loop is expanded later.

Semantic KICK/HAT/PERC/FILL brushes apply the same rule to their routed target lane.

## Manual lock semantics

Pattern Brushes are direct editing gestures.

Like direct step editing, they intentionally override rhythm-generation locks.

A lock means:

```text
protect from generation / reroll / automated transformation
```

not:

```text
prevent the user from directly editing this note
```

Lane automation has different semantics, described below.

## Lane gesture actions

The selected lane now exposes:

- Generate
- Variate
- Simplify
- Humanize

These operate on the lane's active loop material only.

Dormant events outside a shortened lane loop remain untouched and are merged back after the action.

## Lane Generate

GENERATE rebuilds the active portion of the selected lane using a deterministic role grammar.

Role behavior includes:

- Kick: structural downbeats + density-controlled movement
- Snare/Clap: backbeat anchors
- Closed Hat: subdivision motion
- Open Hat: offbeat emphasis
- Tom: phrase-end/fill bias
- Percussion: syncopated activity
- Cymbal: structural phrase accents

Brush Density controls generated occupancy.

A quality floor guarantees that Generate never accidentally returns an empty lane.

### Lock behavior

GENERATE is disabled for a rhythm-locked lane.

## Lane Variate

VARIATE derives a related version of the selected lane.

It coordinates:

- event preservation/removal
- new event insertion
- velocity variation

Anchor-like positions receive higher preservation probability.

The Gesture Amount control determines mutation distance.

If a non-empty source would otherwise collapse to zero events, the strongest source event is retained as a deterministic fallback.

### Groove baseline

If VARIATE changes an event's velocity:

- old Groove Engine baseline metadata is cleared
- Groove Engine tags are removed

The varied value becomes the new explicit musical baseline.

### Lock behavior

VARIATE is disabled for rhythm-locked lanes.

## Lane Simplify

SIMPLIFY removes lower-priority events while preserving the strongest musical structure.

Priority combines:

- event velocity
- role-specific grid importance

Gesture Amount determines how aggressively the lane is reduced.

At least one event survives when the active lane originally contained material.

### Lock behavior

SIMPLIFY is disabled for rhythm-locked lanes.

## Lane Humanize

HUMANIZE performs a fast lane-local manual feel pass.

It can modify:

- velocity
- timing

using deterministic lane/step seeds.

Timing remains clamped to the Sequencer V2 manual range:

```text
-50 ms ... +50 ms
```

This operation is distinct from the global Groove Engine:

- Groove Engine applies a reusable Pattern-wide feel profile.
- Lane Humanize is a direct local editing gesture.

Humanized events become manual baselines by clearing prior Groove Engine baseline metadata.

### Lock behavior

HUMANIZE respects:

- dynamics lock
- timing lock

If both are locked, HUMANIZE is disabled.

A rhythm lock alone does not prevent Humanize because existing hit structure is unchanged.

## Gesture Amount

The Lane Gesture panel contains one GESTURE AMOUNT rail.

It controls:

- Variate distance
- Simplify strength
- Humanize amount

Lane Generate instead uses Brush Density because it represents desired lane occupancy.

## Scheduler performance

Brush painting can publish many Pattern revisions quickly.

Phase 15 therefore adds a dedicated Sequencer edit coalescer inside Drum Engine.

```text
many visual Pattern updates
       ↓
16 ms scheduler invalidation window
       ↓
cancel stale queued future hits once
       ↓
refill current look-ahead window
```

Visual matrix feedback remains immediate.

Web Audio scheduler rebuilding is bounded.

The existing 32 ms SOUND-edit coalescer remains independent.

## Advanced event integration

Pattern Brushes operate directly on the existing Sequencer V2 event model.

FILL may author:

- ratchetCount
- flamOffsetUs

PERC/GHOST may author:

- probability

All ordinary advanced fields remain editable afterward in the Step Editor.

## 64-step behavior

Painting scales naturally across 64-step Patterns because a brush gesture addresses step cells rather than assuming a 16-step phrase.

Lane actions operate against the selected lane's loop length:

```text
Pattern LEN 64
Hat LEN 11

Generate Hat
→ only steps 1–11 define the lane phrase
→ phrase repeats polymetrically across 64 steps
```

## Creative history

Brush and lane gestures are ordinary Pattern edits.

They do not create Evolution nodes immediately.

If the edited Pattern later becomes the source of Generate/Reroll/Mutation, Phase 10's existing manual EDIT checkpoint automatically captures the gesture result.

No separate history model is required.

## Rhythm Glyph

No separate Phase 15 Glyph code path is needed.

Because brushes and lane actions modify canonical StepEvents, the existing Rhythm Glyph automatically reflects:

- changed density
- ghosts
- fills
- ratchets
- flams
- humanized timing
- lane-loop context

## UI

Phase 15 adds two hardware areas to SEQUENCE.

### PATTERN / PAINT

Contains:

- SELECT
- DRAW
- DENSITY
- KICK
- HAT
- PERC
- FILL
- GHOST
- SILENCE
- Brush Density

### LANE / GESTURES

Contains:

- selected lane identity
- Generate
- Variate
- Simplify
- Humanize
- Gesture Amount
- operation status

The main Rhythm Matrix remains the dominant surface.

## Mobile behavior

SELECT mode keeps the existing horizontally scrollable 32/64-step matrix.

PAINT mode explicitly disables matrix horizontal scrolling so horizontal touch movement can be interpreted as a brush stroke.

The user can switch back to SELECT immediately to navigate.

This avoids unreliable simultaneous scroll-and-paint gesture interpretation.

## Phase boundary

Phase 15 does not yet add:

- rectangular multi-lane selection
- copy/paste region clipboard
- region transforms
- lasso selection
- velocity painting as a continuous vertical gesture
- probability painting as a dedicated brush
- custom user-authored brush presets
- brush macro recording
- generator-authored polymeter
- arbitrary conditional-event brushes

Those remain later possibilities.

## Acceptance

- [x] explicit Select vs Paint modes
- [x] mouse/pen/touch paint gesture path
- [x] complete drag stroke = one Undo action
- [x] visited cells are not repeatedly mutated in one stroke
- [x] Draw brush
- [x] Density brush
- [x] Kick brush
- [x] Hat brush
- [x] Perc brush
- [x] Fill brush
- [x] Ghost brush
- [x] Silence brush
- [x] deterministic brush decisions
- [x] no ambient randomness
- [x] brushes respect lane loop boundaries
- [x] brush edits preserve dormant polymetric material
- [x] lane Generate
- [x] lane Variate
- [x] lane Simplify
- [x] lane Humanize
- [x] lane Generate/Variate/Simplify respect rhythm lock
- [x] lane Humanize respects timing/dynamics locks
- [x] lane actions preserve dormant events
- [x] lane Generate cannot accidentally produce an empty phrase
- [x] lane Variate retains fallback material when needed
- [x] lane Humanize remains inside ±50 ms timing limits
- [x] Pattern Painting integrates with Advanced StepEvent metadata
- [x] scheduler invalidation is coalesced during drag painting
- [x] CREATE/Glyph/history continue to observe canonical Pattern state
- [x] mobile Select mode preserves scrolling

## Next phase

**Phase 16 — Beat Families, Fills & Transitions**

Phase 16 should generate musically related Pattern families around a core beat: A/B variations, fills, pre-chorus/build variants, drops, breakdown versions, and transition patterns that can later feed ARRANGE without requiring manual duplication.
