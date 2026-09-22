# Phase 16 — Beat Families, Fills & Transitions

## Status

Implemented.

## Objective

Phase 16 expands Synth from one Pattern into a coherent family of section-ready related Patterns.

The family is generated from the current core Pattern without replacing it.

```text
CURRENT CORE
     ↓
BEAT FAMILY
├── CORE
├── A VAR
├── B VAR
├── BUILD
├── BREAKDOWN
├── DROP
├── FILL 1
├── FILL 2
└── TRANSITION
```

Every member remains a normal editable Pattern.

## Domain model

Phase 16 adds first-class serialized family contracts:

```ts
BeatFamilyRole
BeatFamilyMember
BeatFamily
```

Roles:

- core
- aVariation
- bVariation
- build
- breakdown
- drop
- fill1
- fill2
- transition

A BeatFamily stores Pattern references plus semantic role, energy, and member kind.

Generated member Patterns additionally record:

- familyId
- familyRole
- sourceEntityId
- deterministic seed
- generator version
- style vector
- intent vector

## Non-destructive generation

GENERATE FAMILY does not replace the current sequencer Pattern.

It creates a session family workspace containing nine immutable Pattern snapshots.

This intentionally avoids:

- changing playback unexpectedly
- adding nine Undo states
- polluting the Evolution Tree simply because alternatives were requested

Only an explicit USE operation places a family member into SEQUENCE.

## Shared Groove DNA

All family members inherit the core Pattern's GrooveProfile:

- Swing
- Humanization
- Personality
- role timing offsets
- ghost-note amount
- deterministic groove seed

Section identity is created by structural/dynamic changes around the same pocket rather than assigning unrelated groove personalities.

## Lock behavior

Family generation respects existing generation locks.

### Rhythm locks

Prevent:

- structural additions
- structural removals
- rerolled rhythm changes

### Dynamics locks

Prevent family transformations from scaling velocity in that lane.

If every rhythm lane is locked, family generation is quality-rejected rather than pretending nine identical Patterns form a useful family.

Manual editing remains unaffected.

## A Variation

A VAR uses the existing deterministic Beat Variation engine at a small distance.

Target:

- recognizable Core identity
- subtle structural/dynamic difference
- useful repeated-section alternative

Nominal variation distance:

```text
~0.18
```

## B Variation

B VAR uses a larger related derivation.

Target:

- clearly more distinct than A
- still recognizable as the same beat family

Nominal variation distance:

```text
~0.34
```

The family coherence gate penalizes a B variation that is less distinct than A.

## Build

BUILD raises section energy through coordinated changes:

- stronger Kick/Snare dynamics where unlocked
- denser late-phrase Closed Hat motion
- Snare/Percussion buildup material
- late ratchet possibility

The existing groove remains unchanged.

## Breakdown

BREAKDOWN opens space through deterministic reduction:

- fewer hats
- fewer percussion/toms
- reduced clap support
- selectively reduced kick activity
- softer Kick/Snare dynamics where allowed

Core foundation is retained when possible.

## Drop

DROP creates the family peak:

- stronger Kick
- stronger Snare/Clap
- phrase-opening Crash
- additional Open Hat support

Its nominal energy exceeds BUILD.

## Fill 1

FILL 1 is a compact phrase-ending fill.

It alternates:

- Tom
- Percussion

near the phrase boundary and may finish with a Flam.

## Fill 2

FILL 2 is a larger alternate fill.

It uses:

- Snare
- Tom
- Percussion
- ×2/×3 ratchet behavior near the ending

This relies directly on Advanced Sequencer V2 metadata.

## Transition

TRANSITION combines:

- phrase-end fill movement
- late Kick-space creation
- Open Hat lift
- final Crash marker

It is intended as connective material for the later arrangement engine.

## Polymetric compatibility

Family transforms understand per-lane loop lengths.

When a target lane loops shorter than the global Pattern:

```text
Pattern LEN 16
Tom LEN 5
```

family additions map into the audible five-step Tom cycle instead of writing silent events into global steps 6–16.

Removal/scaling transforms affect only active loop material.

Dormant out-of-loop events remain untouched.

## Monitoring independence

Family members do not inherit temporary editor monitoring state.

Generated snapshots set:

- muted = false
- solo = false

for audition purposes.

USE restores creative Pattern state through the normal history/sequencer path while preserving the current editor's monitoring state according to existing restore semantics.

## Quality and coherence validation

Every member is validated by the existing Beat Validator.

Family-level coherence also checks:

- A variation differs from Core
- B is at least as distinct as A
- Build energy exceeds Breakdown
- Drop energy exceeds Build
- no member introduces catastrophic missing-foundation failures

The family exposes one overall coherence score.

Rejected families do not replace the currently stored family.

## Session Beat Family store

Implemented:

```text
src/family/BeatFamilyStore.ts
src/family/useBeatFamily.ts
```

The store owns:

- current BeatFamily
- immutable member Pattern snapshots
- selected member role
- coherence score
- display seed

The workspace is session-local until later project persistence.

## Beat Family UI

CREATE now contains a BEAT / FAMILY machine.

Each member shows:

- semantic role
- Rhythm Glyph
- RG signature
- energy
- quality score
- AUD
- USE

Member types are visually differentiated:

- variation
- section
- fill
- transition

## Audition

AUD plays one family member loop without restoring it.

Audition uses the same Phase 14 playback path:

- polymetric lanes
- probability
- ratchets
- flams
- Swing
- microtiming
- current Kit/Sound routing

Audition is disabled while the main transport is already running.

## USE

USE explicitly promotes a family member into the active creative workflow.

It:

1. prepares the member against the current Evolution source
2. restores it into the sequencer
3. preserves current monitoring through existing restore semantics
4. creates an Evolution node

History operation:

- ordinary family members → variation
- fills/transitions → generateTransition

This makes family alternatives branchable without generating history noise before the user chooses one.

## Rhythm Glyph integration

No separate family visualization engine is needed.

Each member is an actual Pattern, so Phase 7 Rhythm Glyphs naturally reflect:

- member density
- fills
- ratchets
- flams
- timing
- polymeter
- groove

## Arrangement foundation

BeatFamily is intentionally designed as input to later ARRANGE phases.

A future arrangement engine can select members by semantic role instead of guessing from arbitrary Pattern names.

Examples:

```text
VERSE       → CORE / A
PRE-CHORUS  → BUILD
CHORUS      → DROP / B
BREAK       → BREAKDOWN
BAR END     → FILL 1 / FILL 2
SECTION CUT → TRANSITION
```

Phase 16 does not activate the full 04 / ARRANGE editor yet.

## Persistence boundary

Family contracts are serializable domain data and SynthProject now has an optional BeatFamily collection.

The current BeatFamilyStore remains session-local because project persistence is not implemented yet.

Phase 16 does not pretend families survive reloads.

## Phase boundary

Phase 16 does not yet add:

- arrangement timeline
- auto-arrange
- section duration editor
- scene generation
- Energy Sculpture
- family regeneration of one member only
- favorite family members
- multiple simultaneous saved families
- persistent family library
- section-to-section transition routing

Those belong to the arrangement/persistence phases.

## Acceptance

- [x] BeatFamily domain contract
- [x] nine semantic family roles
- [x] deterministic family seed
- [x] Core snapshot
- [x] A related variation
- [x] B related variation
- [x] Build
- [x] Breakdown
- [x] Drop
- [x] Fill 1
- [x] Fill 2
- [x] Transition
- [x] shared GrooveProfile
- [x] rhythm locks respected
- [x] dynamics locks respected
- [x] all-locked degenerate family rejected
- [x] polymetric lane loops respected
- [x] dormant lane material preserved
- [x] family-member Beat validation
- [x] family coherence score
- [x] non-destructive generation
- [x] immutable session family store
- [x] Rhythm Glyph per member
- [x] non-destructive audition
- [x] explicit USE action
- [x] USE integrates with Evolution history
- [x] fill/transition USE marked as generateTransition
- [x] family generation does not pollute Undo/history
- [x] session-local persistence boundary explicit

## Next phase

**Phase 17 — Scene & Section Generator / Arrange Foundation**

Phase 17 should turn BeatFamily members into semantic scenes and section blueprints—verse, chorus, build, breakdown, drop and transitions—with durations, energy targets, and deterministic member selection. Phase 18 can then activate the full ARRANGE surface and Energy Sculpture on top of that data.
