# Phase 4 — Rhythm Matrix Sequencer V1

## Status

Implemented.

## Objective

Phase 4 replaces Synth's hard-coded demonstration beat with editable domain pattern state. The visible matrix, CREATE strip previews, and Drum Engine now all consume the same Pattern data.

## Architecture

```text
SequencerStore
   │
   ├── Pattern domain state
   ├── edit commands
   ├── mute / solo
   ├── length
   └── undo / redo
          │
          ├────────► SEQUENCE Rhythm Matrix
          ├────────► CREATE Instrument Strips
          └────────► DrumEngine
                         │
                         ▼
                    Web Audio
```

React never becomes the pattern source of truth.

## Domain pattern

The initial foundation beat is now only a seed used to create a real `Pattern` object.

Each lane contains editable `StepEvent` objects with:

- stable event ID
- tick
- velocity
- probability
- timing offset
- accent classification

Pattern lanes now also support optional mute and solo state.

## Lanes

The V1 Rhythm Matrix exposes all eight Drum Engine voices:

- kick
- snare
- clap
- closed hi-hat
- open hi-hat
- tom
- percussion
- crash

The four compact strips in CREATE read their current values from the same sequencer state.

## Step editing

Supported:

- add step
- remove step
- select step
- velocity editing
- Shift-click velocity cycling
- live playhead highlighting
- per-lane audition

Velocity is encoded visually as hit height rather than a checkbox state.

Interaction:

- empty step click → add + select
- active unselected step click → select
- selected active step click → remove
- Shift-click → cycle velocity

The Step Editor also provides an explicit ON/OFF control and velocity rail.

## Pattern length

V1 supports:

- 4 steps
- 8 steps
- 16 steps

The pattern repeats independently inside the global transport loop.

Reducing the pattern length removes events beyond the new boundary. The operation is undoable.

## Duplicate

`DUP ×2` copies the current phrase into the next half:

- 4 → 8 steps
- 8 → 16 steps
- at 16 steps, steps 1–8 replace steps 9–16

This keeps Phase 4 bounded to a maximum of 16 steps. 32/64-step sequencing remains a later feature.

## Mute and solo

Each lane has M/S controls.

Playback rules:

- muted lanes never schedule
- if any lane is soloed, only soloed non-muted lanes schedule
- mute/solo changes apply to already-running playback through scheduler invalidation

## History

Implemented:

- Undo
- Redo
- Cmd/Ctrl-Z
- Shift-Cmd/Ctrl-Z
- Ctrl/Cmd-Y
- up to 100 pattern history snapshots

Continuous velocity rail changes on the same step are coalesced into one undoable edit window rather than generating dozens of history entries.

## Pattern actions

Implemented:

- clear all steps
- reset to foundation beat
- duplicate
- change pattern length

All are undoable.

## Hot-edit scheduling

The Phase 2 transport now exposes explicit future-event invalidation.

When pattern state changes while playback is running:

```text
Pattern edit
    ↓
new sequencer revision
    ↓
transport scheduler epoch changes
    ↓
old future voices cancelled
    ↓
current look-ahead window refilled
    ↓
new pattern is heard
```

This prevents a deleted or muted hit from playing merely because it was scheduled before the edit.

## Responsive behavior

Desktop:

- sticky lane identity column
- 16-step full matrix
- compact pattern/history rail
- persistent Step Editor

Mobile:

- lane identity remains sticky
- matrix scrolls horizontally
- 44 px step columns
- toolbar reflows vertically
- Step Editor stacks under the matrix

The matrix is intentionally allowed to scroll locally instead of shrinking steps below useful touch sizes.

## Phase boundary

Phase 4 does not yet add:

- beat generation
- probability editing
- flam/ratchet UI
- per-step microtiming editing
- swing editing inside the matrix
- 32/64-step patterns
- polymeters
- multiple pattern banks
- persistence to IndexedDB

These remain later phases.

## Acceptance

- [x] editable Pattern domain state replaces hard-coded playback
- [x] all eight drum voices have sequencer lanes
- [x] step add/remove changes real scheduled audio
- [x] velocity changes affect synthesis playback
- [x] mute and solo affect real scheduled audio
- [x] CREATE strips reflect sequencer edits
- [x] live playhead follows the Web Audio transport
- [x] pattern length supports 4/8/16 steps
- [x] duplicate, clear, and reset are implemented
- [x] undo/redo covers musical edits
- [x] continuous velocity edits are history-coalesced
- [x] hot edits invalidate stale scheduled future voices
- [x] mobile keeps usable touch targets through local horizontal scrolling

## Next phase

**Phase 5 — Beat Generator V1**

Phase 5 should generate actual editable Pattern state using style-aware musical rules, then hand that generated pattern to this sequencer rather than creating a parallel playback representation.
