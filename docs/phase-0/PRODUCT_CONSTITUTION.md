# Phase 0 — Product Constitution

## 1. Product statement

Synth is a browser-first, local-first generative beat instrument. It helps users make distinctive drum and percussion music without requiring them to manually program every hit, sound, variation, or transition.

The core product promise is:

> Start with intent, get a musically useful beat quickly, keep what works, and reshape the rest without losing control.

## 2. Primary workflow

```text
OPEN
  ↓
GENERATE
  ↓
AUDITION
  ↓
LOCK GOOD PARTS
  ↓
REROLL / MUTATE
  ↓
SHAPE GROOVE + SOUND
  ↓
CREATE VARIATIONS
  ↓
ARRANGE
  ↓
PERFORM / EXPORT
```

Every major feature must strengthen this loop.

## 3. Product pillars

### 3.1 Beat quality before feature count
A smaller generator that produces consistently useful output is better than a broad generator full of mediocre styles.

### 3.2 Generation with authorship
The user must remain the editor of taste. Synth may propose, derive, vary, and complete material, but it must make retaining, rejecting, and branching ideas immediate.

### 3.3 Progressive depth
The first layer exposes musical intent. Deeper layers expose sequencing, microtiming, synthesis, and routing only when requested.

### 3.4 Local-first reliability
Opening existing projects, generating patterns, playing audio, editing beats, and exporting core formats must work without a backend.

### 3.5 Reproducible generation
Generated artifacts must have enough metadata to recreate them exactly under the same generator version.

### 3.6 Cohesion over randomness
“Random” is not a generator strategy. Style rules, relational pattern logic, constraints, validation, and versioned mutation operations must produce coherent outcomes.

### 3.7 Visual information must be musical
Animation, illumination, density, geometry, and color must communicate time, state, structure, energy, sound, or interaction. Decorative chrome is rejected.

## 4. In scope for Synth 1.0

- beat generation
- deterministic seeds and lineage
- lock / reroll / mutation
- groove and microtiming
- drum synthesis
- coherent kit generation
- manual rhythm sequencing
- beat families and variations
- fills and transitions
- arrangement generation
- live performance transformations
- local samples
- project history and snapshots
- local persistence
- WAV / stems / MIDI / project export
- desktop, tablet, and mobile interfaces
- offline-capable core workflows

## 5. Explicit non-goals

Synth 1.0 will not become:

- a full DAW
- a piano-roll composition suite
- a multitrack recording studio
- a mixing/mastering workstation
- a social network
- a collaboration platform
- a cloud-first project service
- a prompt/chat-centric AI application
- a drum-learning curriculum
- a rudiment trainer
- a practice streak system
- a replacement for Steadybar
- a plugin host
- a marketplace

A requested feature that materially pushes Synth into one of these categories requires an explicit product-scope decision rather than silently entering the roadmap.

## 6. Creative-control hierarchy

### Level 1 — Intent
- style
- energy
- space
- complexity
- syncopation
- similarity
- mutation verbs
- groove fields

### Level 2 — Structure
- lanes
- regions
- beat families
- transitions
- sections
- energy sculpture

### Level 3 — Detail
- individual steps
- velocity
- probability
- microtiming
- synthesis internals
- effects

The application should default to Level 1.

## 7. The Phase 10 gate

Development must not continue into major sound/arrangement expansion until the following workflow is genuinely compelling:

```text
Generate
→ hear a useful beat
→ lock 1–2 parts
→ reroll the remainder
→ mutate the groove
→ branch the result
→ prefer at least one branch over the original
```

If this loop is weak, engineering effort returns to the generator rather than adding features.

## 8. Quality definition

A “good generation” is not merely valid. It should satisfy most of the following:

- perceptible pulse
- plausible kick/snare relationship for its style
- intentional density
- meaningful repetition
- enough variation to avoid obvious monotony
- controlled syncopation
- coherent velocity hierarchy
- no accidental overload
- distinctive relationship to neighboring seeds/branches
- editable structure rather than baked audio

## 9. Naming

Product: **Synth**

Canonical mode names:

- CREATE
- SEQUENCE
- SOUND
- ARRANGE
- LIVE
- ARCHIVE

Canonical visual-system name: **Pulse Architecture**.

## 10. Future Steadybar relationship

Steadybar owns practice. Synth owns creation.

Potential future interoperability is limited to exchanging neutral rhythm data and metadata. Synth must not absorb Steadybar’s training product surface merely because the two applications can eventually communicate.
