# Phase 0 — Domain & Data Contracts

This document specifies the conceptual v1 domain model. TypeScript source contracts live in `src/domain/contracts.ts`.

## 1. Units

Canonical units are explicit:

- tempo: BPM
- musical position: integer ticks
- velocity: normalized 0..1
- probability: normalized 0..1
- pan: -1..1
- timing offset: integer microseconds relative to the grid
- sample trim: seconds
- sample gain: dB
- time signature: numerator + denominator

Floating-point seconds are runtime audio values except for sample-local trim positions. Musical positions are never serialized as browser-clock seconds.

## 2. PPQ

The canonical project timing grid uses **960 PPQ**.

Why:

- clean subdivision of common duple/triplet values
- enough precision for groove offsets
- interoperable with MIDI-oriented workflows
- avoids encoding musical structure as browser-clock seconds

## 3. IDs

Creative entities use opaque stable IDs, not array position.

Examples:

- project ID
- pattern ID
- lane ID
- kit/kit-slot ID
- sound ID
- scene ID
- asset ID
- history node ID

Human-readable short machine IDs such as `7F2` are display aliases, not primary keys.

## 4. Project

A project contains:

- metadata
- transport defaults
- kits + active kit
- sounds
- patterns
- scenes
- arrangement
- history lineage
- asset references
- schema version

## 5. Pattern

A pattern defines:

- meter
- length in ticks
- lane collection
- optional groove profile
- generation provenance

Patterns store editable musical events, not rendered audio.

## 6. Rhythm/sound decoupling

A rhythm lane does **not** reference a concrete sound directly.

```text
Pattern Lane
   ↓
Kit Slot
   ↓
Sound
```

This is required so the same rhythm can immediately audition another kit without rewriting the pattern.

A kit slot has:

- stable ID
- semantic instrument role
- optional label
- sound reference

A kit is an ordered collection of slots. A project can contain multiple kits and has one active kit.

Generated drum kits reuse the exact semantic kit-slot IDs already referenced by Pattern lanes. Runtime playback resolves `Pattern Lane → Kit Slot → Sound → source voice`, with semantic fallback when no generated Kit is active.

Generated Kit identity may also include shared Kit DNA with normalized Brightness, Weight, Tightness, Roughness, Synthetic, Depth, Air, and Variance dimensions.

## 7. Lane

A lane has:

- stable ID
- semantic role
- kit-slot reference
- events
- optional independent loop length in ticks for polymetric playback
- optional mute/solo state
- generation lock state

Locks are granular enough to protect rhythm independently from sound.

## 8. Event

An event contains:

- stable ID
- tick
- duration where meaningful
- velocity
- deterministic per-lane-cycle probability
- signed microtiming offset
- optional ratchet count
- optional flam offset
- optional semantic accent
- optional generator tags
- optional groove baseline used to make humanization re-applicable and resettable

Advanced Sequencer V2 supports Pattern lengths up to 64 sixteenth-note steps. A lane may loop at any shorter integer step length without duplicating events. Probability decisions are reproducible from Pattern/lane/event identity plus the lane cycle index.

## 9. Sound

A sound is a versioned specification, not an AudioNode graph.

Supported conceptual sources:

- synth
- sample
- hybrid

Drum Synthesis V2 uses a serializable material specification that maps into `SynthSoundSpec.params`. Current normalized drum-material dimensions are Impact, Body, Noise, Air, Tone, Decay, Pitch, and Character; Character is interpreted by voice type.

The runtime Drum Engine consumes those specifications and constructs transient AudioNodes only when a hit is scheduled.

Kit generation creates real versioned `Kit` and `Sound` domain objects. Each generated Sound stores a V2 `SynthSoundSpec` plus generation provenance; the Kit links semantic slots to those Sound IDs.

A hybrid may reference a sample asset plus synthesis layers.

## 10. Groove profile

Groove is explicit and reusable:

- swing
- timing personality
- humanization amount
- optional per-role timing offsets
- optional ghost-note amount
- optional deterministic groove seed
- optional groove-engine version

Swing is stored at Pattern level and applied at playback time. Human feel such as role timing, correlated drift, and local jitter is materialized into event microtiming. Events may retain a groove baseline so repeated feel changes are deterministic rather than cumulative.

## 11. Generation provenance

Every generated entity can record:

- seed
- generator ID
- generator version
- source ID
- source history node
- mutation operation
- requested style vector
- requested intent vector

This supports exact recreation and evolution trees.

## 12. Locks

Locks are creative constraints, not UI-only toggles.

A lock can protect:

- rhythm
- sound
- dynamics
- timing
- entire lane
- selected region

Generator operations must consume lock state as an input and prove that protected data remains unchanged.

The sound lock dimension is now active in Kit generation/mutation/morphing: `PatternLane.lock.sound` protects the lane's current V2 material during those generative operations while direct manual sound editing remains an explicit user override.

## 13. Style representation

Genres are not exclusive enum presets at the deepest layer.

The canonical generator input supports a weighted style vector, for example:

```json
{
  "funk": 0.65,
  "hipHop": 0.25,
  "electronic": 0.10
}
```

Early UI may expose one primary style; the domain must not block later blending.

## 14. Musical intent controls

Normalized intent controls should remain orthogonal where feasible:

- energy
- density
- complexity
- syncopation
- space
- swing
- humanization
- mutation distance

A style generator interprets these values contextually.

## 15. History lineage

A generated/mutated node stores conceptually:

- stable history-node ID
- parent node ID
- operation
- operation parameters
- seed / provenance
- affected/result artifact references
- optional favorite/name
- an immutable creative snapshot or durable reference to one

For the current Pattern-focused Evolution Tree, each node stores an immutable Pattern snapshot plus its deterministic Rhythm Glyph signature.

Artifact references remain typed and may later point to kits, sounds, scenes, or arrangement results. The lineage model therefore supports future sound and arrangement evolution rather than assuming all history is pattern-only.

Pattern provenance may also store `sourceHistoryNodeId` so the generated artifact itself knows the creative history node it descended from.

Generated Kit/Sound provenance may use `sourceEntityId` plus `mutationId` for sound-evolution lineage, including whole-Kit mutations, per-voice mutations, and committed A/B morphs. A/B morph capture itself is session workspace state rather than a persisted domain entity at the current phase.

Branching is first-class. Undo history and creative lineage are separate concepts: Undo reverses editor state, while Evolution history preserves alternatives for restoration and further branching.

## 16. Serialization

Project serialization:

- uses plain structured data
- contains a schema version
- never stores functions
- never stores AudioNodes
- never depends on React component shape
- references binary sample data by asset ID
- validates all external/imported values


## 17. Rhythm Exchange — Advanced Sequencer

Rhythm Exchange preserves Advanced Sequencer event behavior:

- lane loop length
- probability
- ratchet count
- flam offset
- timing offset
- velocity/accent

This prevents polymetric or probabilistic patterns from collapsing into plain on/off steps during interchange.


## 18. Beat Families

A BeatFamily is a serialized semantic grouping of related Pattern artifacts around one core Pattern.

Family members carry:

- semantic role
- Pattern ID
- member label
- normalized energy
- member kind: core / variation / section / fill / transition

Generated family Patterns store familyId and familyRole in generation provenance. BeatFamily provides the stable bridge from Pattern generation into future Scene/Arrangement systems.


## 19. Scenes & Arrangement Blueprints

A Scene is a reusable semantic section state derived from one BeatFamily.

Generated Scenes may carry:

- Scene role
- source family ID
- ordered eligible Pattern IDs
- fill Pattern route
- transition Pattern route
- normalized energy
- generation provenance

A SectionBlueprint is one concrete arrangement occurrence. It stores:

- semantic role / label
- Scene reference
- ordered Pattern sequence
- cycle count
- cumulative start tick
- exact length ticks
- energy start/end
- optional fill/transition Pattern routes

An ArrangementBlueprint groups generated Scenes and SectionBlueprints under one arrangement shape (Compact / Standard / Extended). It is planning data for the later editable ARRANGE timeline, not rendered audio or browser-clock state.


## 20. Editable Arrangement & Playback

Phase 18 promotes ArrangementBlueprint from planning data into editable session state.

SectionBlueprint may additionally store:

- fillPlacement: off / last
- transitionPlacement: off / replaceLast / append

The editable Arrangement compiles Sections into concrete ordered Pattern occurrences with exact cumulative start/length ticks. Playback resolves those occurrences back to canonical Pattern objects and reuses the same advanced Pattern playback rules as SEQUENCE.

Energy Start/End are arrangement-level macro dynamics. They are interpolated over a Section and currently scale event velocity during arrangement playback without mutating source Pattern events.

Arrangement editor Undo/Redo is separate from Pattern Undo and from the Pattern-focused Evolution Tree. Persistent multi-artifact history may later record Arrangement artifacts using the existing arrangement HistoryArtifactKind.

## 21. Sample Assets & Hybrid Voices

Audio sample assets are content-addressed local resources. AssetReference may store SHA-256 contentHash plus decoded metadata such as duration, sample rate and channel count, while raw bytes and AudioBuffer objects remain outside serialized domain state.

SampleSoundSpec references an asset by stable assetId and stores non-destructive trim, gain, pitch and reverse parameters.

HybridSoundSpec combines one SampleSoundSpec with one or more SynthSoundSpec layers and an explicit synthGainDb.

Runtime source selection remains independent from Pattern lanes: Pattern Lane → Kit Slot → SoundSpec → Synth/Sample/Hybrid playback.

Current sample bytes/cache persistence is session-local. Future persistence should store raw bytes under the deterministic asset ID rather than embedding AudioBuffer/runtime objects in project JSON.
## 22. Style DNA

Style DNA is a versioned application-level registry referenced by stable style ID rather than embedded wholesale inside every artifact.

GenerationProvenance may store styleDnaId and styleDnaVersion alongside the existing StyleVector. The vector remains useful for future blends; the explicit ID/version identifies the primary profile that generated the artifact.

A Style DNA profile describes rhythm archetype, subdivision vocabulary, kick/backbeat/instrument tendencies, groove defaults, fill vocabulary, sound-material tendencies, BPM reference range and arrangement Scene energy.

Pattern, Kit, BeatFamily and Arrangement provenance can therefore preserve one coherent style lineage without duplicating the full registry profile into serialized artifacts.
## 23. Beat Morph & Remix

Beat Morph previews are derived session state rather than a new serialized musical artifact. A committed Morph or Remix is an ordinary Pattern with GenerationProvenance.

HistoryOperation includes beatMorph and remix so Pattern lineage can distinguish committed transformations without introducing a Morph-specific artifact kind.

Intermediate Style-DNA morphs are represented by the existing StyleVector. styleDnaId may be omitted when no single exact Style DNA profile describes the committed blend; styleDnaVersion still identifies the registry semantics.

Morph provenance uses sourceEntityId for endpoint A and encodes endpoint B plus the five requested dimension values in mutationId. The uncommitted A/B workspace remains session-local.