# Phase 18 — ARRANGE Mode, Energy Sculpture & Arrangement Playback

## Status

Implemented.

## Objective

Phase 18 activates `04 / ARRANGE` on top of the Scene and Section data generated in Phase 17.

The architecture remains layered:

```text
BeatFamily
   ↓
Scene / Section Foundation
   ↓
editable Arrangement
   ↓
Arrangement Playback
   ↓
shared Pattern playback resolver
   ↓
Drum Engine / Web Audio
```

ARRANGE does not become a second sequencer or a second audio engine.

## 04 / ARRANGE

ARRANGE is now an active top-level mode rather than a placeholder.

Its workspace contains:

- arrangement transport
- proportional section timeline
- effective Pattern-cycle display
- section editor
- fill/transition placement
- Energy Sculpture
- arrangement playhead
- arrangement Undo/Redo
- reset-to-foundation workflow

## Canonical editable arrangement store

Implemented:

```text
src/arrange/ArrangementStore.ts
src/arrange/useArrangement.ts
```

The store loads an immutable copy of the Phase 17 ArrangementBlueprint and owns the editable session arrangement.

It also owns an immutable Pattern catalog copied from the BeatFamily so playback is not coupled to whichever Pattern happens to be active in SEQUENCE.

## Arrangement occurrences

The editable Section model is compiled into a flat playback occurrence list.

Each occurrence contains:

- Section ID
- Pattern ID
- cumulative start tick
- exact Pattern duration
- cycle index
- occurrence kind

Occurrence kinds:

- pattern
- fill
- transition

This is the source used by arrangement playback.

## Section editing

ARRANGE supports:

- select Section
- move left
- move right
- desktop drag reorder
- duplicate Section
- remove Section
- change cycle count from 1–16
- edit Energy Start
- edit Energy End
- toggle Fill placement
- cycle Transition placement

Every structural edit recalculates:

- Section start ticks
- Section lengths
- occurrence positions
- total arrangement length

## Drag reorder

Desktop timeline blocks support native drag-and-drop reordering.

Touch/mobile retains explicit MOVE controls because HTML drag behavior is unreliable on many touch devices.

Both paths mutate the same ArrangementStore.

## Fill placement

SectionBlueprint now supports:

```ts
fillPlacement?: "off" | "last"
```

OFF keeps the normal Scene-derived final Pattern.

LAST replaces the final main cycle with the configured family Fill Pattern.

This also works for one-cycle Sections.

## Transition placement

SectionBlueprint now supports:

```ts
transitionPlacement?: "off" | "replaceLast" | "append"
```

### OFF

No transition Pattern is used.

### REPLACE LAST

The transition replaces the Section's final normal occurrence.

### APPEND

The transition becomes an additional occurrence after the Section's normal cycles.

APPEND therefore increases Section duration and shifts every following Section automatically.

## Effective sequence display

The ARRANGE UI displays the actual occurrence plan consumed by playback.

This means it reflects:

- Fill OFF/LAST
- Transition OFF/REPLACE/APPEND
- cycle-count edits
- duplicated/reordered Sections

The visible sequence and the audible sequence share the same source.

## Shared Pattern playback engine

Phase 18 extracts the advanced Pattern hit resolver into:

```text
src/sequencer/patternPlayback.ts
```

Both normal SEQUENCE playback and ARRANGE playback use this function.

Therefore ARRANGE automatically preserves:

- per-lane loop lengths
- polymeter
- mute/solo stored in the Pattern snapshot
- deterministic probability
- ratchets
- flams
- event microtiming
- semantic Kit-slot routing

No simplified arrangement-only playback grammar exists.

## Arrangement playback controller

Implemented:

```text
src/arrange/ArrangementPlaybackStore.ts
```

The store owns:

- playback engaged state
- full-arrangement vs section-only scope
- arrangement start offset
- arrangement playhead
- current Section
- current occurrence
- current Pattern
- current interpolated energy
- playback end boundary

It commands the existing AudioTransport rather than creating another clock.

## PLAY ALL

PLAY ALL starts at arrangement tick 0 and automatically stops when the final occurrence ends.

## PLAY SECTION

PLAY SECTION starts at the selected Section's start tick and stops exactly at that Section's current end.

If the Section is resized while it is playing, the playback boundary follows the edited Section.

## Pause / resume / stop

ARRANGE supports:

- Pause
- Resume
- Stop

using the shared AudioTransport state.

Stopping ARRANGE fully disengages arrangement routing so subsequent CREATE/SEQUENCE playback immediately returns to the active Sequencer Pattern.

## Global transport integration

The top utility transport is mode-aware.

When `04 / ARRANGE` is active:

- Play/Pause commands ArrangementPlaybackStore
- Stop stops Arrangement playback
- Spacebar uses Arrangement playback
- LOOP is disabled and displays `ARR / FULL`
- position readout switches to arrangement beat notation

Entering ARRANGE stops normal Pattern playback.

Leaving ARRANGE stops arrangement playback.

This prevents hidden playback-mode leakage between workspaces.

## Drum Engine integration

Drum Engine inspects the arrangement controller on every scheduled transport pulse.

When ARRANGE is engaged:

1. translate transport tick to arrangement tick
2. resolve Section occurrence
3. resolve local Pattern tick
4. feed that Pattern into the shared Pattern hit resolver
5. apply Pattern Swing
6. schedule ratchets/flams/microtiming
7. resolve Kit Slot → Sound → runtime voice
8. apply arrangement Energy Sculpture dynamics

When ARRANGE is not engaged, the old SequencerStore playback path remains unchanged.

## Probability across repeated occurrences

The shared Pattern resolver accepts a probability-cycle offset.

ARRANGE derives this from occurrence index.

Repeated uses of the same Pattern in a song therefore do not necessarily repeat the identical probability realization on every occurrence, while remaining deterministic.

## Energy Sculpture

Phase 17 established `energyStart` and `energyEnd`.

Phase 18 makes them editable and audible.

Every Section appears as one energy line segment in the Energy Sculpture.

Selected Section controls:

- ENERGY START
- ENERGY END

The arrangement controller linearly interpolates energy across the Section.

## Audible energy behavior

Current energy modifies scheduled hit dynamics only during ARRANGE playback.

The bounded scale is approximately:

```text
0% energy   → 0.68× event velocity
100% energy → 1.10× event velocity
```

Output is clamped to valid velocity.

This gives the Section arc an audible macro-dynamic effect without rewriting source Patterns.

Energy Sculpture does not yet regenerate density, Kit timbre, FX, or orchestration.

Those may be added in later arrangement/performance phases.

## Energy visualization

The Energy Sculpture renders:

- all Section ramps
- selected segment
- start/end handles
- arrangement playhead

Both rising and falling energy curves are supported.

## Arrangement playhead

ARRANGE displays its playhead in:

- transport rail
- active Section block
- Energy Sculpture
- top utility transport

No React timer advances playback.

All playhead state derives from AudioTransport.

## Editable timeline

Section blocks are proportionally sized from exact Section duration.

Every block displays:

- ordinal
- label
- Scene role
- effective Pattern occurrences
- Fill/Transition state
- cycle count
- energy range

The timeline is horizontally scrollable when needed.

## Arrangement Undo / Redo

Arrangement editing has its own session Undo/Redo stack.

Supported edits include:

- reorder
- duplicate
- remove
- cycle-count change
- fill placement
- transition placement
- Energy Sculpture edits

Energy slider movements are coalesced so continuous dragging does not create one Undo state per pixel.

History limit:

```text
60 arrangement states
```

Keyboard shortcuts while ARRANGE is mounted:

- Cmd/Ctrl-Z → Undo
- Cmd/Ctrl-Shift-Z → Redo
- Cmd/Ctrl-Y → Redo

This is independent from the Sequencer Pattern Undo stack.

## Selection vs musical revisions

ArrangementStore maintains both:

- UI revision
- musicalRevision

Selecting a Section changes UI state only.

It does not invalidate the Web Audio scheduler.

Only actual arrangement musical edits increment musicalRevision and trigger future-hit rescheduling.

## Live arrangement editing

Structural or Energy edits may be made while ARRANGE is running.

When musicalRevision changes:

- current future schedule is invalidated
- arrangement occurrence plan is rebuilt if necessary
- full-playback end follows the new total length
- section-only playback follows the moved/resized selected Section
- stale future voices are cancelled through the existing transport epoch system

## Source foundation

ARRANGE remembers which Phase 17 foundation created it.

If a different foundation becomes active, ARRANGE reloads from that source rather than mixing incompatible Scene/Pattern catalogs.

RESET TO FOUNDATION:

- stops arrangement playback
- reloads the current Phase 17 blueprint
- clears arrangement Undo/Redo
- clears the edited state

## Mode isolation

Mode switching is explicit.

Entering ARRANGE:

```text
normal AudioTransport playback → STOP
ARRANGE becomes eligible
```

Leaving ARRANGE:

```text
Arrangement playback → STOP
normal Pattern routing restored
```

## Mobile behavior

ARRANGE remains usable on small screens through:

- horizontally scrollable Section timeline
- explicit MOVE controls instead of relying on drag
- scrollable Energy Sculpture
- stacked Section editor
- stacked Energy controls
- responsive arrangement transport

## Persistence boundary

The editable ArrangementStore and ArrangementPlaybackStore are session-local.

ArrangementBlueprint itself is serializable domain data, but project persistence has not yet been implemented.

Phase 18 does not claim arrangement edits survive reload.

## Evolution-history boundary

Phase 10's Evolution Tree remains Pattern-focused.

ARRANGE has local Undo/Redo but does not yet create persistent arrangement-history nodes.

The domain already supports `HistoryArtifactKind = "arrangement"`, so later multi-artifact persistence/history can integrate this without redefining the arrangement model.

## Phase boundary

Phase 18 does not yet add:

- persistent arrangement projects
- per-Section tempo changes
- per-Section meter changes
- editable Scene definitions
- direct Pattern replacement inside an individual cycle
- automation lanes beyond Energy
- density/timbre/mix morph driven by Energy
- arrangement export
- arrangement Evolution Tree
- scene launch/performance controls

Those remain later phases.

## Acceptance

- [x] 04 / ARRANGE is active
- [x] editable ArrangementStore
- [x] foundation → editable arrangement load
- [x] proportional Section timeline
- [x] Section selection
- [x] left/right reorder
- [x] desktop drag reorder
- [x] touch-safe move controls
- [x] Section duplication
- [x] Section removal
- [x] 1–16 cycle editing
- [x] Fill OFF/LAST
- [x] Transition OFF/REPLACE/APPEND
- [x] transition append changes Section duration
- [x] effective playback sequence visible
- [x] Energy Start/End editing
- [x] Energy Sculpture graph
- [x] Energy Sculpture is audible
- [x] arrangement playhead
- [x] Play All
- [x] Play Section
- [x] section-scoped auto-stop
- [x] arrangement-end auto-stop
- [x] Pause/Resume/Stop
- [x] global top transport routes through ARRANGE
- [x] Spacebar routes through ARRANGE
- [x] mode-switch playback isolation
- [x] shared Advanced Pattern playback resolver
- [x] probability preserved
- [x] polymeter preserved
- [x] ratchets/flams preserved
- [x] Kit/Sound routing preserved
- [x] arrangement Undo/Redo
- [x] coalesced Energy edit history
- [x] UI selection does not invalidate audio
- [x] live arrangement edits invalidate future scheduling
- [x] no ambient randomness introduced
- [x] mobile responsive arrangement workspace

## Next phase

**Phase 19 — Sample Import & Hybrid Voice Engine**

Phase 19 should add local audio sample import, deterministic asset identity, trim/gain/pitch/reverse controls, sample drum voices, synth+sample hybrid layering, and Kit Generator compatibility without compromising the current local-first/offline architecture.
