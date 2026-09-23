# Phase 32 — Project Document & Local Persistence Foundation

Status: implemented.

## Purpose

Phases 0–31 built substantial creative and production systems, but the app still behaved like one volatile browser session.

Phase 32 establishes one durable project truth that survives reloads and can be safely restored without replaying UI actions or reaching into store internals.

## ProjectDocument v1

A Synth project now serializes:

- project identity / name / timestamps / revision
- BPM / meter / loop length
- current Pattern
- DrumEngine master + Punch / Tone / Decay / Grit / Space macros
- drum material specs
- per-voice synth / sample / hybrid source state
- generated Kit state + sound morph endpoints
- mixer state + auto-mix locks
- modulation sources / routes / automation lanes
- mastering state
- Beat Family state
- ARRANGE foundation
- ARRANGE blueprint + full Pattern catalog
- creative Generation History lineage
- MIDI mappings / profiles / record settings / preferred input name
- referenced local sample asset IDs

Temporary performance/generation previews are deliberately excluded.

## Explicit restore boundaries

Canonical stores now expose project-restore APIs.

The persistence layer does not:
- mutate private fields
- parse React state
- replay hundreds of UI actions
- rebuild state indirectly from visual components

Restore boundaries exist for:

- Sequencer
- DrumEngine
- DrumSoundStore
- MixerStore
- ModulationStore
- MasteringStore
- BeatFamilyStore
- ArrangementFoundationStore
- ArrangementStore
- GenerationHistoryStore
- MidiStore
- SampleAssetStore

Restore operations clear transient previews and local Undo/Redo stacks where appropriate.

## ARRANGE persistence

ARRANGE persistence includes more than the visible blueprint.

It stores:

~~~text
ArrangementProjectState
├── blueprint
├── sourceFoundationId
├── selectedSectionId
├── complete Pattern catalog
└── edited flag
~~~

This prevents a reloaded arrangement from referencing Pattern IDs that no longer exist.

## Creative history persistence

Generation History stores the entire node graph:

- root node
- active node
- selected node
- parent relationships
- operations
- titles
- favorite flags
- ordinals
- full Pattern snapshots

The next ordinal is reconstructed from the highest restored ordinal.

## MIDI persistence

MIDI permission and live device handles are never persisted.

Persisted controller state includes:

- preferred input name
- channel filter
- learned mappings
- controller profiles
- record quantize
- overdub mode
- MIDI-clock preference

Parameter mappings reconstruct Phase 24 External modulation sources/routes during hydration.

External live values are reset to zero rather than serialized as project truth.

## IndexedDB v1

Local storage uses three object stores:

~~~text
projects
assets
meta
~~~

### projects
Stores versioned ProjectDocument records.

### assets
Stores content-addressed sample metadata + raw ArrayBuffer bytes.

### meta
Stores the active-project pointer.

## Audio storage model

Audio bytes are not embedded inside ProjectDocument JSON.

Instead:

~~~text
ProjectDocument.assetIds
      ↓
IndexedDB assets store
      ↓
content-addressed audio records
~~~

Project + referenced assets are written inside one IndexedDB write transaction.

This avoids repeatedly embedding large sample data inside project documents and provides a clean foundation for later dependency-safe Library/version handling.

## Asset hydration

On project load:

1. all transient playback/edit workspaces are stopped/cleared
2. current in-memory project assets are cleared
3. referenced raw sample assets are restored
4. transport and canonical sound/production state are restored
5. ARRANGE / Pattern / history state is restored
6. MIDI mappings are reconstructed
7. the project becomes active

Assets are restored before sound state so sample-backed voices never hydrate against missing bytes.

Persisted decoded AudioBuffers are never stored. They are rebuilt lazily from raw bytes.

## Transient-state isolation

The following state is intentionally not part of durable ProjectDocument truth and is reset when a project opens:

- Beat Morph working endpoints/preview workspace
- CHAOS preview state
- EVOLVE candidate/preview
- Song Architect candidate/preview
- LIVE performance overlay, mutes, takes and active recording
- Sample Lab working region/slices/takes
- active render job
- Freeze cache
- Resample artifacts/recovery workspace
- active ARRANGE playback
- transport playhead

This prevents state from Project A leaking into Project B.

## Sequencer restore validation

Project and History Pattern restores share one shape validator.

A restored Pattern must satisfy:

- matching PPQ
- supported Pattern length
- all canonical lanes present

Project restore does not create an Undo step.

## Autosave

After hydration, authoritative persistent stores are observed and changes are debounced.

Default delay:

~~~text
750 ms
~~~

The save state exposed to UI is:

- STARTING
- LOADING
- UNSAVED
- SAVING
- SAVED
- SAVE ERROR
- SESSION ONLY

## Autosave filtering

Not every store publication represents a persistent edit.

Phase 32 explicitly prevents autosave loops from:

- transport animation / playhead frame updates
- scheduler pulse counters
- DrumEngine meters / trigger counters
- live MIDI CC / pressure / pitch-bend values
- external MIDI-clock diagnostics

Persistence signatures track only durable subsets such as:

- BPM / meter / loop bars
- DrumEngine master/macros
- static modulation definitions
- MIDI mapping/profile settings

## Save concurrency

Every durable mutation increments a change serial.

A save remembers the serial at start.

If new edits arrive while IndexedDB is writing:

~~~text
save begins at serial N
new edit → serial N+1
save completes
→ project remains DIRTY
→ another autosave is scheduled
~~~

This prevents edits made during an in-flight save from being falsely marked as saved.

## Lifecycle saves

Dirty projects attempt an immediate save when:

- document becomes hidden
- page receives pagehide

The normal debounced autosave remains the primary persistence path.

## Project switching

Opening another project:

1. saves the current project if dirty
2. captures an in-memory rollback bundle
3. loads/validates the requested IndexedDB bundle
4. hydrates it
5. updates the active-project pointer

If load/hydration fails, Synth attempts to restore the rollback bundle and reports the original error.

## Save As

SAVE AS:

- first saves the current project if dirty
- creates a new project ID
- preserves the current complete state
- resets document revision
- writes a new local project record
- makes the new project active

The source project remains stored unchanged.

## Header project control

The old static display:

~~~text
PROJECT / FOUNDATION
SYN-7F2
~~~

has been replaced with a real project controller showing:

- project name
- saved / unsaved / saving / error status
- rename
- explicit Save Now
- Save As
- local project list
- Open project
- revision + asset count

The mobile version becomes a fixed-width popover suitable for the compact app shell.

## Unsupported storage fallback

If IndexedDB is unavailable:

- Synth remains usable
- the project UI reports SESSION ONLY
- no fake persistence claim is made

## Schema/version boundary

ProjectDocument contains:

~~~text
schemaVersion: 1
~~~

Unsupported schema versions are rejected rather than guessed/mutated.

Phase 32 does not implement migration chains yet; it establishes the boundary that later schema migrations must use.

## Phase boundary

Phase 32 establishes durable local project truth.

It deliberately does not yet implement:

- user-managed project folders/collections
- named snapshots/version history
- project-package backup export/import
- dependency-safe asset garbage collection
- delete/duplicate project workflows
- cross-tab writer conflict detection
- corruption/fault-injection UI
- storage quota dashboards

Those belong to the next data-resilience layer rather than the core persistence foundation.

## Safety invariants

- raw sample bytes are authoritative; decoded AudioBuffers are cache only
- a project never loads against unresolved referenced assets
- transient state is cleared before hydration
- unsupported schemas fail closed
- failed project opening attempts rollback
- autosave ignores high-frequency runtime-only updates
- changes during a save remain dirty
- project restore does not pollute Undo history
- MIDI permission is never requested by project hydration
- local storage failure never prevents session-only Synth usage
