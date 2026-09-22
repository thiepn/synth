# Phase 12 — Kit Generator

## Status

Implemented.

## Objective

Phase 12 generates coherent eight-voice drum kits from the Phase 11 V2 material model.

The generator does not create eight unrelated random sounds.

```text
direction
+ deterministic seed
+ variation amount
        ↓
shared Kit DNA
        ↓
role-aware voice derivation
        ↓
coherence + direction validation
        ↓
Kit + 8 Sound objects
        ↓
atomic Sound Store apply
        ↓
Pattern Lane → Kit Slot → Sound → Voice
```

## Directions

Implemented:

- Tight
- Huge
- Dark
- Bright
- Clean
- Dirty
- Electronic
- Hybrid
- Vintage
- Industrial
- Experimental

Each direction defines a shared starting character rather than a label applied after generation.

## Shared Kit DNA

Every generated kit derives one shared normalized DNA vector:

- Brightness
- Weight
- Tightness
- Roughness
- Synthetic
- Depth
- Air
- Variance

This DNA is the common material identity of the kit.

Individual voices receive role-aware deviations around that identity.

The V2 material dimensions remain:

- Impact
- Body
- Noise
- Air
- Tone
- Decay
- Pitch
- Character

## Role-aware derivation

The same Kit DNA means different things to different instruments.

### Kick

Weight and Depth primarily influence:

- Body
- Sub/Character
- low tuning
- decay
- Impact

Brightness/Roughness influence the click rather than simply turning the entire kick bright.

### Snare

Kit DNA coordinates:

- body weight
- noise level
- snap
- wire/air
- tuning
- decay

### Clap

Kit DNA affects:

- noise color
- thickness
- temporal spread
- brightness
- decay

### Hats

Closed and Open Hat are intentionally generated as a family.

They share closely related:

- Tone
- Pitch
- Metallic Character
- Air

while preserving a clear decay hierarchy.

### Tom

Weight/Depth primarily influence:

- body
- tuning
- pitch drop
- decay

### Percussion

Synthetic/Variance influence:

- FM character
- pitch
- resonator behavior
- texture

### Crash

Brightness/Air/Depth drive:

- metallic character
- noise wash
- high-frequency air
- long decay

## Direction character

### Tight

- high Tightness
- shorter decays
- controlled variance
- strong transients

### Huge

- high Weight
- high Depth
- longer bodies and cymbal tails
- strong low-end foundation

### Dark

- low Brightness
- low Air
- strong Weight/Depth
- darker cymbal and transient balance

### Bright

- high Brightness
- high Air
- lighter Weight
- clear upper-frequency character

### Clean

- low Roughness
- controlled variance
- reduced noise
- defined transients

### Dirty

- high Roughness
- more Noise/Character
- larger local material variation

### Electronic

- high Synthetic DNA
- stronger metallic/FM character
- controlled tightness
- slightly broader tuning behavior

### Hybrid

Phase 12 HYBRID is still fully synthesized.

It means a balanced acoustic-like body ↔ electronic material identity inside the V2 synth engine.

It does **not** claim to contain imported samples.

True sample+synth hybrid kits arrive with the later sample/hybrid engine.

### Vintage

- reduced Brightness/Air
- moderate Roughness
- softer material identity
- heavier/older tonal balance

### Industrial

- high Roughness
- high Synthetic
- high Weight
- harder transient and metallic/noise character

### Experimental

- high Variance
- high Synthetic
- intentionally wider pitch/material relationships
- still bounded by coherence validation

## Determinism

The Kit Generator uses the existing seeded PRNG.

There is no ambient `Math.random()`.

Inputs:

- base seed
- direction
- variation amount
- generator version

A deterministic attempt seed is derived for:

- shared Kit DNA
- each individual voice

Given the same inputs and compatible generator version, generation reproduces the same kit.

## Variation control

SOUND exposes one VARIATION rail.

It influences how far individual voices may deviate around the selected direction's shared DNA.

Low values:

- tighter family resemblance
- lower cross-voice variance

High values:

- more individual voice character
- stronger Experimental/Dirty-style differences where appropriate

The coherence validator remains active at every setting.

## Coherence validation

A generated kit is validated before it can replace the active sound state.

Checks include:

- Closed/Open Hat family distance
- Open Hat decay clearly longer than Closed Hat
- low-end Kick/Tom foundation
- cymbal-family Air
- excessive tonal spread
- excessive cross-voice Character spread
- requested direction fit

The generator retries deterministically up to 10 candidates.

Rejected candidates never replace the current kit.

## Direction validation

Coherence alone is not enough.

A kit can be internally consistent while failing its requested direction.

The validator therefore also checks material direction fit.

Examples:

- Tight must remain sufficiently short/impactful.
- Huge must retain enough Body/Decay.
- Dark must remain dark enough.
- Bright must retain upper-frequency character.
- Clean must reduce noise.
- Dirty must increase noise/character.
- Electronic must remain sufficiently synthetic.
- Industrial must retain hard/noisy character.
- Experimental must actually exhibit useful material spread.

## Real domain Kit / Sound objects

Accepted generation creates:

- one domain `Kit`
- eight domain `Sound` objects
- eight V2 `DrumMaterialSpec` objects

Each Sound contains a versioned `SynthSoundSpec` plus generation provenance.

Kit and Sound provenance records:

- deterministic seed
- generator ID
- generator version
- direction StyleVector
- DNA-derived IntentVector
- variation amount

## Semantic slot identity

Generated Kit slots are built directly from the existing sequencer lane definitions.

This guarantees exact compatibility with Pattern lane `kitSlotId` values.

The canonical runtime path is now operational:

```text
Pattern Lane
   ↓ kitSlotId
active Kit Slot
   ↓ soundId
Sound
   ↓ sourceVoice
V2 DrumMaterialSpec
   ↓
Drum Engine voice
```

If no generated kit is active, the Drum Engine safely falls back to the original semantic voice mapping.

Historical Pattern audition also resolves through the currently active Kit.

## Atomic application

A generated kit is applied to `DrumSoundStore` in one operation.

All eight voice specs and Kit/Sound metadata change together.

This produces:

- one store publish
- one coalesced scheduler invalidation
- no transient half-old / half-new kit state

Already-ringing hits remain unchanged.

Queued future hits refill using the new kit.

## Generated-kit identity

The SOUND interface displays:

- Kit ID
- Kit name
- direction
- shared DNA
- slot count
- sound count
- coherence score
- attempt count
- short seed

## Manual editing after generation

A generated kit begins in:

```text
CLEAN
```

state.

Changing any individual V2 voice parameter or resetting one voice changes the generated-kit state to:

```text
MOD
```

The original generated Kit/Sound identity remains available as the source description, while the live material specs reflect the user's edits.

RESET ALL clears generated-kit identity and returns to the default V2 material set.

## SOUND UI

03 / SOUND now adds a dedicated KIT / GENERATOR section above the voice editor.

It contains:

- 11-direction hardware bank
- Variation rail
- Generate Kit control
- accepted/rejected quality readout
- generated Kit identity
- Shared Kit DNA meters

The existing per-voice V2 material editor remains available underneath for manual refinement.

## Snapshot safety

Generated Kit and Sound objects exposed through the sound-store snapshot are deep-cloned, including:

- slots
- provenance
- style/intent objects
- SynthSoundSpec parameter maps

React cannot mutate internal kit state by reference.

## Persistence boundary

Generated Kit and Sound objects are real serializable domain data.

However, the current project/persistence layer is still session-local.

Phase 12 does not pretend generated kits survive reload yet.

Later Archive/project persistence should store:

- Kit
- Sounds
- active Kit ID
- current modified material specs

## Evolution-history boundary

Phase 10 currently stores Pattern lineage.

Kit generation does not yet create Kit Evolution nodes.

This is intentional.

Sound/Kit lineage should be added together with sound morphing and persistent artifact history rather than overloading the current Pattern-only tree with an incomplete second artifact model.

## Phase boundary

Phase 12 does not yet add:

- Kit morphing
- Similar / Very Similar / Different / Wild kit mutations
- independent sound locks
- multiple saved Kit library
- Kit history/evolution tree
- sample-based kits
- sample+synth hybrid voices
- Kit persistence across reloads
- automatic mix generation

Those remain later phases.

## Acceptance

- [x] 11 Kit directions implemented
- [x] shared Kit DNA drives all eight voices
- [x] role-aware sound derivation
- [x] generation is deterministic
- [x] no ambient random source
- [x] Closed/Open Hats form a coherent family
- [x] open-hat decay hierarchy validated
- [x] low-end foundation validated
- [x] cymbal Air validated
- [x] excessive tonal/material spread rejected
- [x] requested direction fit validated
- [x] deterministic retry loop
- [x] rejected kits never replace current sound state
- [x] accepted generation creates real Kit domain object
- [x] accepted generation creates eight Sound domain objects
- [x] Sounds use V2 SynthSoundSpec
- [x] generated slots exactly reuse Pattern semantic slot IDs
- [x] Drum Engine resolves Pattern lanes through active Kit/Sound mapping
- [x] generated kit applies atomically
- [x] manual sound edits mark Kit as MOD
- [x] RESET ALL clears generated-kit identity
- [x] UI exposes shared Kit DNA
- [x] HYBRID is not falsely presented as sample-based
- [x] snapshot objects are deep-cloned
- [x] persistence/history limits are explicit

## Next phase

**Phase 13 — Sound Morphing & Kit Mutation**

Phase 13 should make generated sound state evolvable rather than one-shot: Similar / Very Similar / Different / Wild sound variation, whole-kit mutation, individual-voice mutation, morphing between two kit states, and sound-aware lock semantics.
