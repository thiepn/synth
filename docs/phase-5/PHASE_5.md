# Phase 5 — Beat Generator V1

## Status

Implemented.

## Objective

Phase 5 turns Synth's Beat Reactor into a real deterministic beat generator.

The generator does not create a parallel preview representation. It produces the same editable `Pattern` domain object used by SEQUENCE and Drum Engine playback.

```text
Style + Intent + Seed
        ↓
Beat Generator V1
        ↓
Quality Validator
        ↓
editable Pattern
   ├── CREATE strips
   ├── SEQUENCE matrix
   └── Drum Engine
```

## Styles

V1 includes seven rule-driven musical identities:

- Rock
- Funk
- Hip-Hop
- House
- Trap
- Breakbeat
- Electronic

Each style has different structural rules rather than merely different random probabilities.

Examples:

- Rock emphasizes backbeat, eighth-note hats, kick foundation, crash energy, and optional tom endings.
- Funk emphasizes sixteenth motion, ghost snares, syncopated kicks, percussion, and open-hat color.
- Hip-Hop uses a sparser kick vocabulary, backbeat, velocity-shaped hats, and optional clap reinforcement.
- House enforces four-on-floor kick structure with offbeat open hats and clap backbeat.
- Trap emphasizes dense hat subdivision, syncopated kick candidates, clap backbeat, and selective open hats.
- Breakbeat uses broken kick placement, backbeat, hat movement, ghost notes, and percussion.
- Electronic can choose a four-on-floor or broken electronic skeleton depending on energy/density.

## Generator controls

CREATE now exposes real generation controls:

- STYLE
- ENERGY
- DENSITY
- COMPLEXITY
- SYNCOPATION
- SWING

The Beat Reactor's SAFE ↔ WILD ring is synchronized with Complexity.

The Groove Field is also active:

- horizontal axis = syncopation
- vertical axis = density

It updates the same intent values used by the generator.

## Deterministic seed contract

Generation uses `SeededRandom`, backed by a string hash and xorshift PRNG.

Production generation does not call `Math.random()`.

A generation request contains:

- base seed
- style
- intent vector
- step count
- BPM
- meter

The engine derives deterministic attempt seeds:

```text
base seed
  ↓
style + attempt number
  ↓
effective seed
```

The accepted effective seed is stored in pattern provenance.

Given the same generator version, effective seed, style, BPM, meter, length, and intent, the musical result is reproducible.

## Provenance

Generated patterns store:

- generator ID
- generator version
- effective seed
- style vector
- intent vector

Generated events also contain generator tags.

Pattern names use the style identity and a short deterministic seed code.

## Quality validation

Every candidate is scored before it can enter the active sequencer.

Validator checks include:

- kick foundation
- backbeat presence where style-appropriate
- subdivision/hat movement
- minimum useful activity
- excessive density
- stacked simultaneous hits
- House four-on-floor integrity
- Trap hat-layer density
- Funk syncopated-kick identity
- overcrowded backbeat layers

A weak candidate is rejected and the generator deterministically tries another derived seed.

Maximum attempts: 12.

The UI displays:

- accepted/rejected state
- quality score
- number of attempts
- short seed signature

Rejected candidates never replace the active sequencer pattern.

## Undo behavior

A successful generation enters `SequencerStore` as one undoable pattern replacement.

Generation therefore supports the normal editor history:

```text
Generate beat
    ↓
edit / listen
    ↓
Undo
    ↓
previous manually edited or generated pattern restored
```

Mute/solo state is preserved across generation so playback monitoring state does not unexpectedly reset.

## Pattern lengths

Beat Generator V1 supports the same bounded pattern lengths as Sequencer V1:

- 4 steps
- 8 steps
- 16 steps

The generator adapts structural anchors for short loops rather than assuming every pattern is 16 steps.

## Swing

Generated swing is not cosmetic metadata.

The generator stores Swing in the Pattern groove profile, including style-specific base swing.

As of Phase 8, Swing is applied at Web Audio scheduling time rather than baked into each generated event. Per-event `timingOffsetUs` is reserved for human feel and role-specific microtiming.

This avoids double-swing, keeps Swing editable after generation, and still keeps React outside the scheduling path.

## Velocity

Velocity is generated musically rather than as one constant value.

The generator uses:

- style-specific base dynamics
- Energy
- deterministic local variation
- ghost-note ranges
- accent hierarchy

The generated velocities immediately affect Drum Engine synthesis and the Rhythm Matrix hit geometry.

## Hot generation while playing

Applying a generated pattern publishes a new Sequencer revision.

The existing hot-edit path then:

```text
new generated Pattern
      ↓
scheduler epoch invalidated
      ↓
old future voices cancelled
      ↓
look-ahead window rescheduled
      ↓
new beat plays
```

This prevents old scheduled notes from leaking into the newly generated groove.

## Honest phase boundaries

The previous fake controls are no longer presented as active features.

- lane locks are visibly disabled until Phase 6
- mutation verbs are visibly disabled until their later mutation phase

Phase 5 does not pretend these controls affect generation yet.

## Phase boundary

Phase 5 does not yet add:

- lock-aware generation
- per-lane reroll
- partial reroll
- similarity-preserving variation
- beat branching/evolution tree
- generated kits
- advanced humanization
- 32/64-step generation
- polymeter generation
- style blending

These remain later phases.

## Acceptance

- [x] Beat Reactor triggers real pattern generation
- [x] seven style identities have distinct rule sets
- [x] generation is deterministic and versioned
- [x] production generator uses no ambient random source
- [x] generated output is real editable Pattern state
- [x] generated beats immediately appear in SEQUENCE
- [x] generated beats immediately drive Drum Engine playback
- [x] successful generation is undoable as one editor action
- [x] rejected candidates do not replace the current beat
- [x] quality validator retries weak generations
- [x] generated velocity affects sound and visual hit geometry
- [x] generated swing is audible through the Pattern groove profile and Web Audio scheduling
- [x] hot generation invalidates stale future scheduled notes
- [x] Phase 6 locks are not falsely presented as functional

## Next phase

**Phase 6 — Beat Reactor: Lock / Reroll / Similarity**

Phase 6 should let the user keep the parts they like, reroll selected lanes or regions, and control how far the new result moves from the current beat while retaining deterministic lineage.
