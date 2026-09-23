# Phase 26 — Song Architect & Long-Form Arrangement Generation

Status: implemented.

## What shipped

### Song candidate generation
- Compact / Standard / Extended song shapes
- Auto / Beat Family / EVOLVE source selection
- deterministic Song seed
- Try Another candidate workflow
- existing Phase 17 Scene/Section generator remains the structural engine
- existing ARRANGE model remains the only committed song timeline

### EVOLVE as source material
When EVOLVE is available, AUTO prefers it.

Song Architect projects the EVOLVE plan back into the existing Beat Family roles:
- core
- A / B variations
- build
- breakdown
- drop
- fills
- transition fallback

This means Song Architect can use long-form evolved material without introducing a new Pattern family format.

### Candidate workspace
- non-destructive candidate generation
- candidate source identity
- coherence score
- exact preview duration including appended transitions
- selected section inspection
- per-section energy arc
- Fill / Transition route visibility

### Section locks
- any candidate section can be locked
- locked sections survive full Regenerate / Try Another
- locks are source-lineage-aware
- changing to a different Beat Family / Evolution source cannot preserve stale Pattern references from an unrelated source

### Targeted section reroll
- REROLL regenerates one unlocked section
- every other section is temporarily protected
- explicit user locks remain after the operation
- section reroll has its own deterministic derived seed

### Whole-song preview
Preview priority:

```
committed ARRANGE playback
        ↓
Song Architect candidate
        ↓
EVOLVE preview
        ↓
current Sequencer Pattern
```

Song candidates resolve directly from AudioTransport absolute ticks through DrumEngine.

No second transport is created.

### Commit to ARRANGE
COMMIT TO ARRANGE:
1. stops temporary Song / EVOLVE preview
2. promotes the candidate's Beat Family into BeatFamilyStore
3. stores the candidate as the Arrangement Foundation
4. loads the same blueprint + Patterns into ArrangementStore
5. leaves all sections editable in normal ARRANGE

The candidate ceases to be a special Song Architect runtime once committed.

## Transition parity

Phase 17 blueprints store a transition Pattern separately from the main section Pattern sequence.

Song Architect normalizes preview occurrences so an appended transition contributes to:
- section length
- next section start
- total song duration

This matches ArrangementStore's committed playback semantics.

## Architecture

```
Beat Family or EVOLVE
        ↓
Song Architect source adapter
        ↓
existing Scene/Section Generator
        ↓
Song candidate
├── Blueprint
├── source Beat Family
├── preview occurrences
├── section locks
└── deterministic seed
        ↓
non-destructive preview
        ↓
COMMIT TO ARRANGE
        ↓
existing ArrangementFoundationStore
        ↓
existing ArrangementStore
```

## Safety invariants

- candidate generation does not mutate ARRANGE
- preview does not mutate ARRANGE
- locked section material cannot be replaced by Try Another
- section locks never carry stale Pattern IDs across unrelated sources
- source Patterns remain ordinary editable Patterns
- no second persistent song timeline
- committed songs use the existing ARRANGE editor and playback engine
