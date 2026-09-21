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
- gain parameters: normalized domain values unless explicitly dB
- time signature: numerator + denominator

Floating-point seconds are runtime audio values, not canonical project positions.

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
- sound ID
- scene ID
- asset ID
- history node ID

Human-readable short machine IDs such as `7F2` are display aliases, not primary keys.

## 4. Project

A project contains:

- metadata
- transport defaults
- kit
- patterns
- scenes
- arrangement
- history lineage
- asset references
- generator metadata
- schema version

## 5. Pattern

A pattern defines:

- meter
- length in ticks
- lane collection
- optional groove profile
- generation provenance

Patterns store editable musical events, not rendered audio.

## 6. Lane

A lane has:

- stable ID
- role (kick/snare/hat/etc.)
- sound reference
- mute/solo defaults when musically relevant
- events
- generation lock state

Locks are granular enough to protect rhythm independently from sound.

## 7. Event

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

## 8. Sound

A sound is a versioned specification, not an AudioNode graph.

Supported conceptual sources:

- synth
- sample
- hybrid

A hybrid may reference a sample asset plus synthesis layers.

## 9. Groove profile

Groove is explicit and reusable:

- swing
- timing personality
- humanization amount
- velocity personality
- optional per-role offsets

Generated microtiming may be materialized into events while retaining provenance.

## 10. Generation provenance

Every generated entity can record:

- seed
- generator ID
- generator version
- source ID
- mutation operation
- requested style vector
- requested control vector

This supports exact recreation and evolution trees.

## 11. Locks

Locks are creative constraints, not UI-only toggles.

A lock can protect:

- rhythm
- sound
- dynamics
- timing
- entire lane
- selected region

Generator operations must consume lock state as an input and prove that protected data remains unchanged.

## 12. Style representation

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

## 13. Musical intent controls

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

## 14. History lineage

A generated/mutated beat node stores:

- parent node ID
- operation
- operation parameters
- seed
- resulting pattern references
- timestamp
- optional favorite/name

Branching is first-class. Undo history and creative lineage may share infrastructure but are not assumed to be identical user concepts.

## 15. Serialization

Project serialization:

- uses plain structured data
- contains a schema version
- never stores functions
- never stores AudioNodes
- never depends on React component shape
- references binary sample data by asset ID
- validates all external/imported values
