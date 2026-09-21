# Phase 6 — Beat Reactor: Lock / Reroll / Similarity

## Status

Implemented.

## Objective

Phase 6 turns Synth generation from one-shot replacement into iterative derivation.

The primary workflow is now:

```text
Generate
   ↓
Keep what works
   ↓
Lock lanes
   ↓
Reroll everything else
   ↓
Control change distance
   ↓
Repeat
```

The current editable Pattern remains the source of truth throughout.

## Architecture

Full generation remains separate from derivation:

```text
Beat Generator V1
  intent → fresh Pattern

Beat Variation V1
  source Pattern
      +
  style / intent
      +
  change distance
      +
  lock constraints
      ↓
  derived Pattern
```

This separation preserves deterministic semantics and makes lineage explicit.

## Lane rhythm locks

Every sequencer lane now exposes a real rhythm lock.

A lock is stored in:

```ts
PatternLane.lock.rhythm
```

It is not UI-only state.

Lock controls are available in:

- CREATE Reactor lane bank
- CREATE core Instrument Strips
- SEQUENCE lane controls as `L`

Locked lanes preserve:

- hit placement
- velocity
- probability
- timing offsets
- event structure

during reroll operations.

An internal invariant checks that protected lanes remain musically unchanged before a derived Pattern is accepted.

## Selective reroll

All eight lanes expose a dedicated reroll action:

- Kick
- Snare
- Clap
- Closed Hat
- Open Hat
- Tom
- Percussion
- Crash

Selective reroll changes only the requested lane.

Non-target lanes are treated as protected even when they are not explicitly locked.

Selective reroll also preserves the source Pattern's global groove metadata so changing one lane cannot silently change the timing identity of all other lanes.

## Full reroll

The Beat Reactor center control becomes:

- **GENERATE** for the untouched foundation state
- **REROLL** once the current Pattern becomes a derivation source

Manual edits also qualify the current Pattern as a derivation source.

Full reroll:

- regenerates only unlocked lanes
- preserves all locked lanes
- preserves mute / solo monitoring state
- remains one undoable sequencer operation

If all lanes are locked, reroll is rejected explicitly.

## Similarity / change distance

The Reactor ring is now a real derivation parameter:

```text
SAME ─────────────── WILD
 0                    100
```

The UI also describes broad regions:

- SUBTLE
- RELATED
- MUTATE
- WILD

Internally, distance affects:

- probability that hit presence changes
- velocity interpolation toward a fresh style candidate
- timing interpolation toward candidate microtiming

At distance 0, the source Pattern is preserved.

At distance 100, every unlocked targeted lane converges to the newly generated candidate.

Intermediate values deterministically interpolate between those states.

## Merge behavior

For each editable lane, the variation engine compares source and candidate events step-by-step.

### Same hit exists in both
Velocity and timing move toward the candidate according to distance.

### Hit exists only in source
It may be removed according to structural change probability.

### Hit exists only in candidate
It may be introduced according to structural change probability.

### Locked or non-target lane
Source events are cloned exactly.

If a non-zero reroll would otherwise produce no visible change, the engine may deterministically adopt one valid candidate difference so the interaction remains meaningful.

## Quality gate

Derived beats still pass quality validation.

The validator compares the new result against the source quality baseline.

A reroll is accepted when it:

- stays above a safe relative quality floor
- does not introduce a new critical structural failure

Critical regressions include:

- losing kick foundation
- losing required backbeat
- breaking House four-on-floor identity

This allows rerolling manually edited or imperfect source Patterns without requiring them to meet the stricter fresh-generation threshold first.

## Determinism

Rerolls are deterministic.

Inputs include:

- source Pattern
- reroll seed
- selected style
- intent vector
- distance
- target lanes
- generator versions

The reroll engine derives deterministic candidate and merge seeds.

Production reroll logic uses no ambient `Math.random()`.

## Lineage metadata

Every derived Pattern stores:

- variation generator ID
- variation generator version
- effective seed
- source Pattern ID
- mutation ID
- style vector
- intent vector
- mutation distance

Example:

```text
sourceEntityId: pattern-gen-3A91FE
mutationId: reroll:lane-closed-hat
mutationDistance: 0.42
```

This is the foundation for the later Evolution Tree.

Phase 6 records lineage metadata but does not yet build the visible branching-history UI.

## UI behavior

The Reactor now contains an eight-lane control bank.

Each lane module has:

- lane code
- lock state indicator
- selective reroll action

Locked lanes illuminate and disable their reroll action.

CREATE's compact core Instrument Strips also expose working lock buttons.

SEQUENCE shows M / S / L controls for each lane.

## Undo / hot playback

Lock changes and accepted rerolls use normal SequencerStore history.

Rerolls therefore support Undo / Redo.

During playback, applying a reroll triggers the existing scheduler invalidation path:

```text
derived Pattern
     ↓
Sequencer revision
     ↓
scheduler epoch change
     ↓
cancel old future voices
     ↓
schedule new Pattern
```

No stale notes leak from the previous version.

## Honest boundaries

Phase 6 implements rhythm-lane protection only.

It does not yet implement:

- independent sound locks
- independent velocity-only locks
- independent timing-only locks
- region locks
- individual-step locks
- semantic mutation verbs
- visible Evolution Tree
- beat family generation

Those remain later phases.

## Acceptance

- [x] rhythm locks are real Pattern domain state
- [x] locked lanes survive full reroll unchanged
- [x] selective reroll affects only its target lane
- [x] all eight lanes can be locked
- [x] all eight lanes can be selectively rerolled
- [x] full reroll affects only unlocked lanes
- [x] all-locked reroll is blocked
- [x] SAME preserves the source Pattern
- [x] WILD converges unlocked lanes to a fresh candidate
- [x] intermediate similarity is deterministic
- [x] reroll remains quality-gated
- [x] manual Patterns can become reroll sources
- [x] rerolls are normal undoable editor actions
- [x] selective reroll preserves global source groove metadata
- [x] derived Patterns store source lineage metadata
- [x] protected-lane invariants are checked before acceptance

## Next phase

**Phase 7 — Rhythm Glyph System**

Phase 7 should replace the current placeholder glyph paths with deterministic geometry derived from the actual active Pattern so every beat gets a true visual fingerprint.
