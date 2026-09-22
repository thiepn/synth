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
- optional mute/solo state
- generation lock state

Locks are granular enough to protect rhythm independently from sound.

## 8. Event

An event contains:

- stable ID
- tick
- duration where meaningful
- velocity
- probability
- microtiming offset
- optional ratchet/flam metadata
- optional semantic accent
- optional generator tags
- optional groove baseline used to make humanization re-applicable and resettable

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
