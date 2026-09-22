# Phase 17 — Scene & Section Generator / Arrange Foundation

## Status

Implemented.

## Objective

Phase 17 converts a BeatFamily into arrangement-ready semantic Scenes and concrete Section blueprints.

It does **not** activate the final ARRANGE editor yet.

```text
BeatFamily
   ↓
Scene Generator
   ↓
INTRO / VERSE / PRE / CHORUS / BREAK / BUILD / DROP / OUTRO
   ↓
Section Blueprint Generator
   ↓
ordered Pattern cycles
+ duration
+ energy ramp
+ fill routing
+ transition routing
+ cumulative placement
```

Phase 18 can now build the actual editable arrangement timeline on top of real data instead of inventing arrangement semantics inside the UI.

## Domain additions

Phase 17 adds:

```ts
SceneRole
ArrangementShapeId
SectionBlueprint
ArrangementBlueprint
```

Existing `Scene` is extended with:

- semantic role
- source family ID
- ordered Pattern candidates
- optional fill Pattern
- optional transition Pattern
- energy target
- generation provenance

`SynthProject` may now optionally store ArrangementBlueprint artifacts.

## Scene roles

Implemented reusable Scene roles:

- Intro
- Verse
- Pre-Chorus
- Chorus
- Breakdown
- Build
- Drop
- Outro

Each Scene contains a deterministic ordered set of suitable BeatFamily Patterns.

Example mappings:

```text
INTRO      → BREAKDOWN / CORE / A
VERSE      → CORE / A / B
PRE        → A / BUILD / CORE
CHORUS     → DROP / B / A
BREAKDOWN  → BREAKDOWN / A / CORE
BUILD      → BUILD / A / FILL 1
DROP       → DROP / B / CORE
OUTRO      → BREAKDOWN / CORE / A
```

Scenes also carry fill and transition routes when appropriate.

## Arrangement shapes

Three deterministic high-level shapes are implemented.

### Compact

Short-form arc:

```text
INTRO
VERSE
CHORUS
BREAKDOWN
BUILD
DROP
OUTRO
```

7 sections.

### Standard

Full song arc:

```text
INTRO
VERSE 1
PRE-CHORUS 1
CHORUS 1
VERSE 2
PRE-CHORUS 2
CHORUS 2
BREAKDOWN
BUILD
DROP
OUTRO
```

11 sections.

### Extended

Long-form development:

```text
INTRO
VERSE 1
PRE-CHORUS 1
CHORUS 1
VERSE 2
PRE-CHORUS 2
CHORUS 2
BREAKDOWN
BUILD
DROP
FINAL CHORUS
OUTRO
```

12 sections.

Cycle counts are larger than Standard to create a longer arrangement arc.

## Deterministic Pattern selection

Each Section receives a concrete ordered Pattern sequence.

Selection is deterministic from:

- source BeatFamily ID
- arrangement shape
- generation counter/seed
- section index
- Scene role
- cycle index

No ambient `Math.random()` is used.

Rules constrain selection musically.

Examples:

- Chorus regularly anchors on DROP.
- Build progressively favors BUILD.
- Breakdown opens with BREAKDOWN.
- Intro begins from BREAKDOWN.
- Outro gravitates toward BREAKDOWN.
- Drop regularly returns to DROP.

Randomness only chooses among musically valid family-role candidates.

## Fill placement

Sections may declare:

```ts
fillPatternId
```

For Sections with a fill route, the final normal cycle is replaced with that fill Pattern.

Examples:

- Verse → Fill 1
- Pre-Chorus → Fill 1 / Fill 2
- Chorus → Fill 2
- Build → Fill 2
- Drop → Fill 2

The resulting `patternSequence` therefore represents concrete playback-ready section cycles.

## Transition routing

Some Sections declare:

```ts
transitionPatternId
```

Typical transition boundaries include:

- Intro exit
- Pre-Chorus exit
- Breakdown exit
- Build exit
- Outro ending

The transition Pattern is stored separately from the normal section sequence.

This lets Phase 18 decide whether the transition:

- occupies an explicit timeline cycle
- replaces a final cycle
- overlays a section boundary
- is skipped by the user

without regenerating section semantics.

## Section duration

Every SectionBlueprint stores:

- cycle count
- start tick
- length ticks

Length is calculated from the exact Pattern sequence rather than assuming every family member has the same duration.

Cumulative start ticks are generated contiguously.

Validation rejects:

- gaps
- overlaps
- zero-duration Sections
- inconsistent cycle counts

## Energy targets

Every Section stores:

```ts
energyStart
energyEnd
```

Examples:

```text
VERSE       42 → 54
PRE         58 → 74
CHORUS      80 → 90
BREAKDOWN   34 → 22
BUILD       52 → 86
DROP        94 → 98
OUTRO       42 → 14
```

This establishes the data Phase 18's Energy Sculpture will manipulate.

Scene-level energy also establishes semantic hierarchy.

Validation checks:

- Chorus > Verse
- Drop > Build
- Breakdown < Build

## Scene provenance

Generated Scenes receive generation provenance:

- deterministic seed
- generator ID/version
- source BeatFamily ID
- arrangement shape mutation ID
- family ID
- inherited style vector
- inherited intent vector

ArrangementBlueprint itself receives equivalent provenance.

## Blueprint validation

Before application, the generator proves:

- section starts are contiguous
- section durations are positive
- every Section references a generated Scene
- cycle count matches Pattern sequence length
- every Pattern belongs to the source BeatFamily
- fill routes remain inside the source BeatFamily
- transition routes remain inside the source BeatFamily
- required Verse/Chorus/Build/Drop roles exist
- energy hierarchy is musically sensible

Invalid blueprints do not replace the current foundation workspace.

## Arrangement Foundation store

Implemented:

```text
src/arrange/ArrangementFoundationStore.ts
src/arrange/useArrangementFoundation.ts
```

The store owns:

- current ArrangementBlueprint
- selected Section ID
- coherence score
- display seed
- total duration in ticks

All exposed Scene/Section/provenance data is deep-cloned.

## Source-family invalidation

The foundation belongs to one specific BeatFamily.

If a different BeatFamily becomes active, the old foundation is automatically cleared.

This prevents:

```text
Family B
+
stale Sections from Family A
```

from coexisting in the UI.

## ARRANGE / FOUNDATION UI

CREATE now includes a dedicated arrangement-foundation machine.

It exposes:

- Compact / Standard / Extended shape selection
- Generate Foundation
- Clear
- source family identity
- section count
- Scene count
- total quarter-note duration readout
- quality score
- Scene roster
- ordered Section blueprint rows
- Pattern sequence per Section
- fill/transition routing
- energy start/end
- cycle count
- selected Section inspector

The UI is inspection/generation only.

It does not yet act as the final arrangement timeline.

## Scene roster

The foundation panel renders all eight reusable Scenes with:

- role code
- Scene name
- Scene energy
- eligible family Pattern labels

This makes the Scene layer visible rather than hiding it inside Section generation.

## Section rows

Every generated Section row displays:

- ordinal
- label
- Scene role
- concrete Pattern cycle sequence
- fill/transition route
- energy ramp
- cycle count

Rows are selectable for inspection.

## Descending energy

Energy visualization supports both increasing and decreasing ramps.

Examples:

```text
BUILD       52 → 86
BREAKDOWN   34 → 22
OUTRO       42 → 14
```

Descending ranges render correctly rather than producing invalid negative-width rails.

## Non-destructive behavior

Generating the Arrange Foundation does not:

- replace the active Pattern
- change transport playback
- create Sequencer Undo history
- create Evolution Tree nodes
- activate arrangement playback

It only creates Scene/Section planning data.

## BeatFamily dependency

Phase 17 requires an active BeatFamily.

If no family exists:

```text
GENERATE FOUNDATION
→ disabled / explanatory error
```

This keeps the architecture explicit:

```text
Pattern
→ BeatFamily
→ Scene/Section Foundation
→ Arrangement
```

rather than bypassing intermediate musical structure.

## Session persistence boundary

ArrangementBlueprint is serializable domain data and SynthProject can store blueprint collections.

The current ArrangementFoundationStore is still session-local because project persistence is not yet implemented.

Phase 17 does not pretend the foundation survives reload.

## Phase boundary

Phase 17 does not yet add:

- editable arrangement timeline
- arrangement transport/playback
- drag/reorder Sections
- duplicate/remove Sections
- Scene editing
- manual Section length editing
- transition placement editor
- Energy Sculpture editing
- auto-replanning after manual arrangement edits
- arrangement history lineage
- arrangement export

Those belong primarily to Phase 18 and later persistence/export phases.

## Acceptance

- [x] SceneRole domain contract
- [x] ArrangementShapeId domain contract
- [x] SectionBlueprint domain contract
- [x] ArrangementBlueprint domain contract
- [x] Scene provenance
- [x] Compact shape
- [x] Standard shape
- [x] Extended shape
- [x] deterministic Pattern selection
- [x] no ambient randomness
- [x] reusable Scene generation
- [x] concrete Pattern sequences
- [x] section cycle counts
- [x] cumulative start ticks
- [x] exact section length ticks
- [x] fill placement
- [x] transition routing
- [x] energy targets
- [x] energy hierarchy validation
- [x] section timeline continuity validation
- [x] Scene reference validation
- [x] family Pattern reference validation
- [x] fill/transition family validation
- [x] immutable Arrangement Foundation store
- [x] source-family invalidation
- [x] Scene roster UI
- [x] Section blueprint UI
- [x] descending energy visualization
- [x] selected Section inspection
- [x] non-destructive generation
- [x] full ARRANGE remains deferred to Phase 18

## Next phase

**Phase 18 — ARRANGE Mode, Energy Sculpture & Arrangement Playback**

Phase 18 can now activate 04 / ARRANGE on top of real Scene/Section data: editable Section timeline, arrangement transport, section duplication/reordering, transition placement, and Energy Sculpture using the `energyStart/energyEnd` targets established here.
