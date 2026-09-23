# Phase 22 — Chaos Engine & Controlled Randomness

Status: implemented.

## Shipped behavior

- deterministic keyed entropy independent across domains
- master Subtle → Unstable → Wild intensity
- rhythm entropy with bounded move / remove / ghost-add operations
- dynamics entropy with correlated lane/group contours
- timing entropy using bounded sequencer microtiming
- probability entropy
- ornament entropy using ratchets and flams
- compatible-role instrumentation swaps
- Pattern locks and region locks remain authoritative
- temporary lane/domain Chaos freeze masks
- region/domain freeze data model for sequencer-selection integration
- reusable/editable Chaos seed and New Variation workflow
- non-destructive base/result workspace
- live transport preview through a SequencerStore runtime overlay
- bypass without destroying Chaos configuration
- Base / Chaos one-loop audition while transport is stopped
- structured mutation diff
- Commit Chaos to an ordinary editable Pattern
- one-step Sequencer Undo on commit
- Generation History node using the `chaos` operation
- zero-intensity identity behavior
- event validation for bounds, probability, velocity, timing, ratchets and flams
- responsive CREATE UI

## Architecture

```
canonical Pattern
      ↓
ChaosStore base
      ↓
generateChaos(base, config)
      ↓
ChaosResult
      ├── Pattern preview
      └── ChaosDiff
      ↓
Sequencer runtime preview
      ↓
Commit
      ↓
ordinary canonical Pattern
```

Runtime preview never enters Sequencer Undo/history. It changes only the Pattern used by normal playback. Bypass, reset, leaving CREATE, committing another Pattern edit, or committing Chaos clears the runtime overlay.

## Determinism

Chaos uses keyed hashing rather than a sequential random stream:

```
seed | domain | lane | event/step | property
```

This means disabling Dynamics does not reroll Rhythm, and freezing one lane does not shift random decisions in unrelated lanes.

## Precedence

```
Pattern GenerationLock
↓
Pattern region lock
↓
Chaos freeze mask
↓
candidate mutation
↓
validation
```

## Product boundary

Phase 22 does not create a second Pattern type, scheduler, or audio path. It reuses the canonical Pattern model, SequencerStore, DrumEngine scheduling invalidation, and Generation History.
