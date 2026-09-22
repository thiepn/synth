# Phase 9 — Groove Field & Musical Mutation

## Status

Implemented.

## Objective

Phase 9 makes Synth's high-level musical language operational.

The user can now transform the current beat by musical intent rather than manually editing many independent parameters.

```text
Current Pattern
      +
semantic command
      +
mutation strength
      ↓
baseline musical transform
      ↓
quality gate
      ↓
current pocket reapplied
      ↓
new editable Pattern
```

The resulting Pattern remains the same canonical state consumed by CREATE, SEQUENCE, Rhythm Glyph, and Drum Engine.

## 3×3 mutation deck

Implemented commands:

- HARDER
- SPACE
- FUNKIER
- PUSH
- DRAG
- DIRTY
- BREAK
- WEIRD
- THIN

Reactor SAME ↔ WILD distance is reused as mutation strength.

This avoids adding another generic strength slider.

## Multi-dimensional semantics

Mutation verbs are not aliases for a single existing parameter.

### HARDER

Coordinates:

- stronger kick/snare/clap/tom dynamics
- selective additional kick reinforcement
- possible clap reinforcement
- crash reinforcement
- increased Energy
- modest Density/Complexity increase
- slightly tighter feel when starting from Mechanical

### SPACE

Coordinates:

- removal of busy closed-hat activity
- reduced percussion/tom/clap support
- lower Density
- lower Complexity
- reduced generated ghost-note amount
- occasional open-hat tail to create air rather than simple emptiness

### FUNKIER

Uses a controlled Funk-derived candidate and then merges it with the source beat.

Coordinates:

- increased syncopation
- increased complexity
- stronger swing tendency
- Deep groove personality
- increased humanization
- increased ghost-note vocabulary
- Funk style lineage

Locked rhythm lanes retain their structure.

### PUSH

Coordinates:

- Pushing groove personality
- stronger forward timing
- modest kick/hat velocity lift
- increased Energy
- higher humanization floor

This is primarily a pocket transformation, not arbitrary note movement.

### DRAG

Coordinates:

- Laid-back groove personality
- later backbeat/hat feel
- softer hat/percussion forward energy
- slightly reduced Energy
- increased swing tendency
- humanization floor appropriate for laid-back feel

### DIRTY

DIRTY in Phase 9 means **rhythmic/dynamic dirt**, not audio saturation.

Coordinates:

- Loose personality
- greater velocity contrast
- stronger accents
- quieter weak notes
- more low-velocity percussion possibility
- more ghosts
- more humanization
- increased complexity/syncopation

Actual sound dirt/saturation remains part of SOUND/kit evolution phases.

### BREAK

Creates a transitional drum-break interpretation:

- selectively removes non-anchor kicks
- thins busy hats
- adds tom movement near the phrase ending
- adds percussion transition material
- slightly reduces Density
- raises local Complexity
- retains kick/backbeat safety

For House, BREAK is explicitly allowed to relax four-on-floor identity while still preserving the broader safety floor.

### WEIRD

Uses a controlled high-distance derivation rather than raw randomization.

Coordinates:

- high syncopation
- higher complexity
- larger structural variation
- Loose personality
- more humanization
- more ghost-note possibility

The normal quality gate still applies with a wider acceptable creative range.

### THIN

Strips secondary orchestration while protecting the core groove:

- clap/open-hat/tom/percussion/crash reduction
- inner closed-hat reduction
- lower Density
- lower Complexity
- fewer generated ghosts

THIN differs from SPACE: THIN removes layers; SPACE opens rhythmic breathing room while still allowing an airy open-hat response.

## Groove Field mutation

The Groove Field is now a real musical transform surface.

Axes:

```text
vertical:
SPARSE ↕ DENSE

horizontal:
STRAIGHT ↔ SYNCOPATED
```

Dragging only updates the visual target while the pointer is moving.

The Pattern mutation is committed once on release.

This avoids:

- hundreds of history entries
- constant scheduler invalidation
- unstable audio while dragging

Keyboard arrow interaction commits one deliberate move per key action.

## Field derivation

The field compares:

- current Pattern density
- current primary-instrument syncopation

against the selected target.

The distance between current and target determines how strongly a new style-aware candidate is merged into the source Pattern.

Small moves stay closely related.

Large moves permit more structural change.

The current groove personality/pocket is reapplied after the structural field transformation.

## Baseline-first mutation

Semantic commands do not transform already-humanized values cumulatively.

Before structural mutation:

```text
current humanized Pattern
        ↓
recover musical baseline
        ↓
perform semantic transform
        ↓
reapply current/new pocket
```

This keeps mutation behavior stable across repeated operations.

## Groove-generated ghosts and locks

A subtle integration rule is required for Phase 8 compatibility.

For unlocked lanes:

- Groove Engine ghost notes are treated as feel-layer material
- baseline mutation removes/rebuilds them as needed

For rhythm-locked lanes:

- the complete hit structure is retained
- Groove-generated ghosts remain structurally present
- their generated-ghost identity is preserved for future Reset Feel behavior

This prevents a mutation from silently deleting a ghost note inside a protected lane.

## Lock semantics

Rhythm locks prevent structural mutation.

Direct structural commands skip locked lanes.

FUNKIER / WEIRD derivation also respects Phase 6 lock constraints.

Global groove changes such as PUSH or DRAG may still alter the feel of existing locked hits because rhythm locks are intentionally separate from timing/dynamics locks.

The domain already contains independent timing and dynamics lock dimensions for later UI.

## Quality gates

All semantic mutations pass quality validation.

The floor is relative to the source Pattern rather than requiring every creative transformation to satisfy fresh-generation standards.

Critical protections normally include:

- kick foundation
- backbeat
- House four-on-floor

Command-aware exceptions:

- BREAK may intentionally relax House four-on-floor
- WEIRD receives a wider quality drop budget while retaining core safeguards

Rejected mutations never replace the active Pattern.

A rejected Groove Field move also restores the UI field position to the current Pattern metrics so controls never imply an uncommitted musical state.

## Determinism

Mutation uses seeded deterministic randomness.

Inputs include:

- source Pattern
- source style
- mutation command or field target
- mutation strength
- current generator intent
- BPM
- generator version

There is no ambient `Math.random()`.

## Lineage

Every accepted mutation records provenance:

- generator ID: `musical-mutation`
- generator version
- deterministic effective seed
- source Pattern ID
- mutation ID
- style vector
- target intent vector
- mutation distance/strength

Examples:

```text
mutation:harder
mutation:funkier
mutation:push
field:72:43
```

Each mutation also assigns a new stable Pattern ID.

This is direct groundwork for Phase 10's Evolution Tree.

## Current-style context

Semantic commands operate in the actual current Pattern style.

The STYLE selector remains a future-generation/reroll target.

This prevents a manually selected future style from accidentally changing how HARDER or a Groove Field movement validates the current beat.

FUNKIER intentionally changes style lineage to Funk.

## Undo / hot playback

Every accepted command or field gesture is one normal Pattern transform.

Therefore it supports:

- Undo
- Redo
- scheduler epoch invalidation
- cancellation of stale future voices
- immediate hot playback of the mutated Pattern

## UI

The mutation area is now a 3×3 hardware-style deck.

The active/last command is phosphor-highlighted.

The status area displays:

- mutation ID
- validation score
- changed step count

Mutation errors are shown separately from Beat Reactor generation/reroll errors.

## Phase boundary

Phase 9 does not yet add:

- free-form text commands
- automated beat families
- visible lineage/evolution history
- region-scoped semantic mutation
- independent sound mutation
- per-lane mutation amount
- probability/flam/ratchet mutation
- arbitrary semantic command composition

Those remain later phases.

## Acceptance

- [x] all nine semantic mutation controls are functional
- [x] commands alter multiple coordinated dimensions
- [x] mutation strength reuses Reactor distance
- [x] mutations are deterministic
- [x] ambient randomization is not used
- [x] locked lane structure is preserved
- [x] locked Groove ghost structure is preserved
- [x] current pocket is reapplied after structural mutation
- [x] FUNKIER uses style-aware derivation
- [x] PUSH / DRAG operate as pocket transformations
- [x] BREAK supports intentional House breakdowns
- [x] WEIRD remains quality-gated
- [x] Groove Field commits one mutation per pointer gesture
- [x] rejected field transforms restore truthful UI state
- [x] mutation results are undoable
- [x] hot mutation invalidates stale scheduled audio
- [x] source lineage metadata is stored
- [x] mutation UI reflects resulting intent/groove state

## Next phase

**Phase 10 — Generation History & Evolution Tree**

Phase 10 should make the lineage already recorded by Generate, Reroll, and Mutation visible and navigable as a branching creative history with audition, restore, favorite, rename, and branch operations.
