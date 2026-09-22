# Phase 13 — Sound Morphing & Kit Mutation

## Status

Implemented.

## Objective

Phase 13 makes Synth's sound system iterative in the same way Phases 6–10 made rhythm generation iterative.

The workflow is now:

```text
Generate Kit
    ↓
Lock sounds worth keeping
    ↓
Choose semantic sound mutation
    ↓
Very Similar / Similar / Different / Wild
    ↓
Mutate whole Kit or one voice
    ↓
Capture A / Capture B
    ↓
Morph continuously
    ↓
Commit new Kit
```

All committed results remain real versioned `Kit` and `Sound` domain objects.

## Semantic sound mutations

Implemented:

- Darker
- Brighter
- Heavier
- Cleaner
- Dirtier
- Tighter
- Bigger
- Stranger

These are deterministic material transformations, not labels applied to a fresh random kit.

### Darker

Coordinates:

- lower Tone
- lower Air
- slightly stronger Body
- lower Kick/Tom pitch tendency

### Brighter

Coordinates:

- higher Tone
- higher Air
- slightly stronger Impact
- higher cymbal/hat pitch tendency

### Heavier

Coordinates:

- higher Body
- stronger Impact
- slightly longer Decay
- lower Kick/Tom tuning
- more low-end Character

### Cleaner

Coordinates:

- lower Noise
- lower rough Character
- clearer Impact
- modest tonal definition

### Dirtier

Coordinates:

- more Noise
- more Character
- more material irregularity

This changes the synthesized source material itself rather than merely turning up the existing master Grit macro.

### Tighter

Coordinates:

- shorter Decay
- stronger Impact
- slightly reduced Body tails

### Bigger

Coordinates:

- more Body
- longer Decay
- more Air
- stronger Impact

### Stranger

Uses larger deterministic changes to:

- Pitch
- Character
- Tone
- Decay
- Noise

while still passing kit-coherence validation.

## Similarity levels

Four explicit distances are implemented:

- Very Similar
- Similar
- Different
- Wild

Approximate mutation distances:

```text
VERY SIMILAR  0.14
SIMILAR       0.30
DIFFERENT     0.58
WILD          0.88
```

Low-distance transformations preserve the current kit identity.

At larger distances, whole-kit semantic mutations may transition the kit's primary direction identity—for example a Wild DARKER mutation can become a Dark kit.

This avoids rejecting subtle mutations merely because they do not instantly become an extreme target preset.

## Deterministic retry

Whole-kit and per-voice mutations use deterministic retry.

Maximum attempts:

```text
8
```

Each attempt receives a derived deterministic seed.

The best candidate is retained if all attempts fail the quality gate.

Rejected candidates never replace the current sound state.

## Whole-kit mutation

MUTATE KIT applies the selected semantic operation to every unlocked voice.

The result then passes:

- hat-family coherence
- open/closed decay hierarchy
- low-end validation
- cymbal Air validation
- tonal/material spread checks
- appropriate direction validation

Accepted mutation creates:

- new Kit ID
- eight new Sound IDs
- new mutation provenance
- new effective seed
- inferred post-mutation Kit DNA

The result is applied atomically.

## Individual-voice mutation

MUTATE XX applies the same semantic command only to the currently selected voice.

Every other voice is preserved exactly.

Per-voice mutation validates **kit coherence** without requiring one changed sound to make the entire kit satisfy a new global direction.

Example:

```text
Current Kit = TIGHT

Selected voice = SNARE
Command = DARKER

→ only Snare material changes
→ Kit remains TIGHT lineage
→ full kit coherence still checked
```

## Sound locks

Phase 13 activates the existing domain lock dimension:

```ts
PatternLane.lock.sound
```

Locks are available for all eight semantic lanes:

- Kick
- Snare
- Clap
- Closed Hat
- Open Hat
- Tom
- Percussion
- Crash

Sound locks protect a voice from:

- fresh Kit generation
- whole-Kit mutation
- per-voice mutation
- A/B morphing

If all sounds are locked:

- fresh Kit generation is disabled
- whole-kit mutation is rejected
- A/B morph is rejected

A selected locked voice cannot be individually mutated.

### Manual override semantics

Sound locks are creative-generator constraints.

Direct manual editing of a material Signal Rail remains allowed even when that sound is locked.

This mirrors Synth's general lock philosophy:

```text
lock
= generator/mutation protection

manual edit
= explicit user override
```

Rhythm, sound, dynamics, and timing locks remain independent.

## Lock-aware fresh generation

Phase 12 Kit generation now consumes Phase 13 sound locks.

Locked voice specs are copied into every candidate before validation.

The generator must make the remaining unlocked voices coherent around the protected sounds.

If the locks make the requested direction impossible, the quality gate rejects the candidate rather than changing protected material.

Shared Kit DNA is inferred from the actual mixed locked/unlocked result when locks are active.

## Lock invariant

Kit mutation includes an explicit invariant:

Every material dimension of every locked voice must remain exact.

Protected dimensions:

- Impact
- Body
- Noise
- Air
- Tone
- Decay
- Pitch
- Character

Any violation throws before the result can be applied.

## Mutation lineage

Mutated kits and sounds use:

```text
generatorId: kit-mutation
generatorVersion: 1
sourceEntityId: <source Kit ID>
mutationId: kit:darker
```

Individual voice example:

```text
mutationId: voice:kick:heavier
```

Provenance also stores:

- seed
- style/direction vector
- post-mutation IntentVector
- mutation distance

This establishes sound lineage without pretending the Phase 10 Pattern Evolution Tree already supports Kit artifacts.

## A/B morph snapshots

The sound store owns two immutable session snapshots:

- A
- B

A snapshot contains:

- complete eight-voice material specs
- active generated Kit metadata when available
- generated Sound metadata when available
- source direction/DNA when valid

Capturing A/B does not depend on React-local object identity.

Snapshots are deep-cloned before exposure.

## Modified-kit capture

If a generated kit has been manually modified, its old generator DNA is no longer treated as exact truth.

When such a kit is used as a mutation or morph source, DNA is inferred from the **live material specs**.

This prevents stale generated DNA from describing a sound that has since been manually changed.

## Continuous A ↔ B morph

Every unlocked material parameter is linearly interpolated:

```text
A Impact    → B Impact
A Body      → B Body
A Noise     → B Noise
A Air       → B Air
A Tone      → B Tone
A Decay     → B Decay
A Pitch     → B Pitch
A Character → B Character
```

The slider therefore performs a true material interpolation rather than crossfading two rendered audio streams.

That matters because the interpolated state remains a valid editable V2 synthesis specification.

## Morph locks

Locked voices do not interpolate.

They remain at their protected live material values throughout the complete A→B movement.

Morph change counts exclude locked voices.

## Morph preview

Moving the A/B rail applies a live material preview.

Preview:

- updates all unlocked V2 specs atomically
- marks current generated Kit state MOD
- uses existing 32 ms scheduler invalidation coalescing
- allows the user to hear the interpolated material immediately
- does not yet replace Kit/Sound provenance with a committed morph

The quality readout still evaluates the preview.

## Morph validation

A morph midpoint is not forced to pretend it is fully A's direction or fully B's direction.

Morph validation therefore checks structural Kit coherence while **not requiring direction-fit scoring**.

It still checks:

- hat family
- hat decay hierarchy
- low-end foundation
- cymbal Air
- excessive tonal spread
- excessive material spread

This permits musically valid in-between states.

## Commit Morph

COMMIT MORPH turns the current interpolated sound into real new domain artifacts:

- new Kit
- eight new Sounds
- new inferred/interpolated Kit DNA
- new seed
- Kit-mutation provenance
- morph mutation ID referencing A and B Kit IDs when available

Example:

```text
mutationId:
morph:kit-A:kit-B
```

Committed morph state becomes CLEAN because it is now a new canonical generated sound state rather than an uncommitted preview.

## Morph endpoint behavior

CAP A and CAP B may capture:

- generated clean kits
- generated modified kits
- manually shaped custom V2 specs

The endpoint label reflects the captured live source.

CLEAR A/B clears both stored endpoints but intentionally leaves the current audible material where it is.

RESET ALL clears:

- V2 specs
- generated Kit identity
- A endpoint
- B endpoint
- local morph preview/status

## Runtime integration

Phase 12's real runtime chain remains active:

```text
Pattern Lane
   ↓
Kit Slot
   ↓
Sound
   ↓
sourceVoice
   ↓
V2 material spec
   ↓
Drum Engine
```

Mutation/morph commits therefore affect actual scheduled playback without rewriting Pattern rhythm data.

## Scheduler behavior

The sound store publishes one complete spec set for:

- accepted Kit mutation
- per-voice mutation commit
- each morph preview position
- committed morph

The Drum Engine coalesces rapid sound updates into 32 ms scheduler invalidation windows.

Already-ringing voices continue naturally.

Future queued hits are rescheduled using the latest sound material.

## SOUND UI

03 / SOUND now contains three major creative layers:

### KIT / GENERATOR

Creates coherent new kits.

### SOUND / EVOLVE

Provides:

- eight semantic sound-mutation commands
- four similarity levels
- MUTATE KIT
- MUTATE selected voice
- eight sound locks
- A/B capture
- continuous morph rail
- COMMIT MORPH
- CLEAR A/B
- quality and changed-voice readouts

### VOICE / MATERIAL

Retains direct V2 editing for the selected sound.

## Session/history boundary

Phase 13 sound mutation lineage is stored in Kit/Sound provenance.

A/B snapshots are session-local.

The Phase 10 Evolution Tree remains Pattern-focused.

Phase 13 does **not** fake Kit nodes into that tree.

A future persistent artifact-history system can consume the provenance already created here.

## Phase boundary

Phase 13 does not yet add:

- persistent Kit library
- visible Kit Evolution Tree
- named morph snapshots beyond A/B
- multi-point morphing
- sample-aware morphing
- sample import
- sample+synth hybrid morphing
- per-material lock dimensions
- automatic mixing changes during mutation
- morph automation over Arrangement time

Those remain later phases.

## Acceptance

- [x] eight semantic sound mutations implemented
- [x] four similarity levels implemented
- [x] whole-kit mutation implemented
- [x] per-voice mutation implemented
- [x] deterministic 8-attempt quality retry
- [x] no ambient randomness
- [x] sound locks use domain PatternLane.lock.sound
- [x] sound locks protect fresh Kit generation
- [x] sound locks protect whole-kit mutation
- [x] sound locks protect individual mutation
- [x] sound locks protect A/B morph
- [x] all-locked generation/mutation/morph is blocked
- [x] direct manual editing remains an explicit lock override
- [x] exact locked-spec invariant enforced
- [x] mutation results create real Kit/Sound artifacts
- [x] mutation provenance references source Kit
- [x] modified kits infer live DNA
- [x] immutable A/B snapshots are owned by sound store
- [x] A/B material interpolation implemented
- [x] morph preview is live
- [x] morph validation is coherence-aware without false direction-fit rejection
- [x] committed morph creates real Kit/Sound artifacts
- [x] morph lineage records A/B source IDs
- [x] RESET ALL clears A/B workspace
- [x] runtime Kit-slot routing remains active
- [x] rapid live morphing uses scheduler coalescing

## Next phase

**Phase 14 — Advanced Sequencer V2**

Phase 14 should deepen the rhythm engine with probability, flam, ratchets, per-step timing control, longer 32/64-step patterns, and the foundations for polymeter/per-lane length while preserving the current automation-first workflow.
