# Synth

**Synth** is a local-first generative beat workstation built around one creative loop:

> Generate → Lock → Reroll → Mutate → Evolve → Arrange → Perform → Export

Synth is not intended to be a general-purpose DAW or a drum-practice application. Its job is to help a user reach interesting, coherent, original beats quickly while preserving enough control to shape the result deeply.

## Current status

- **Phase 0 — Product Constitution & Architecture Freeze:** complete
- **Phase 1 — Pulse Architecture UI Foundation:** complete
- **Phase 2 — Core Audio Clock & Transport:** complete
- **Phase 3 — Drum Engine V1:** complete
- **Phase 4 — Rhythm Matrix Sequencer V1:** complete
- **Phase 5 — Beat Generator V1:** complete
- **Phase 6 — Beat Reactor: Lock / Reroll / Similarity:** complete
- **Phase 7 — Rhythm Glyph System:** complete
- **Phase 8 — Groove & Humanization Engine:** complete
- **Phase 9 — Groove Field & Musical Mutation:** complete
- **Phase 10 — Generation History & Evolution Tree:** complete
- **Next: Phase 11 — Drum Synthesis Engine V2**

Synth now has a real Web Audio transport, an eight-voice local synthesized drum engine, an editable domain-backed sequencer, deterministic style-aware beat generation, lock-aware iterative rerolling, Pattern-derived visual rhythm identity, deterministic groove/humanization, semantic musical mutation, and branching creative lineage. React remains outside musical timing, canonical pattern state, generator logic, glyph derivation, groove transformation, mutation logic, and history ownership.

## Run locally

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## Product pillars

1. **Good beats fast** — a useful musical result should appear within seconds.
2. **Assisted, not automatic-only** — generation creates material; the user decides what survives.
3. **Musical controls over engineering controls** — prefer “harder”, “sparser”, “funkier”, and spatial groove controls over exposing dozens of low-level parameters by default.
4. **Deterministic creativity** — every generated result is reproducible from versioned inputs and a seed.
5. **Local-first** — core creation, playback, saving, and export must not depend on a server.
6. **Instrument, not dashboard** — Synth uses the Pulse Architecture visual language and should feel like musical hardware in a browser.
7. **Deep when wanted** — manual sequencing and synthesis exist, but they are never prerequisites for making a good beat.

## Implemented foundation

### Phase 1 — Pulse Architecture

- Pulse Spine
- Beat Reactor
- Rhythm Glyph
- Instrument Strips
- Signal Rails
- Groove Field
- machine-style mutation controls
- responsive CREATE surface
- dedicated desktop/tablet/mobile layout behavior
- CREATE / SEQUENCE / SOUND / ARRANGE / LIVE / ARCHIVE shell

See [Phase 1 implementation notes](docs/phase-1/PHASE_1.md).

### Phase 2 — Core Audio Clock & Transport

- lazy user-gesture AudioContext
- Web Audio time as musical source of truth
- play / pause / stop
- BPM 30–300
- meter switching
- 1 / 2 / 4 / 8 / 16-bar loop lengths
- 960 PPQ runtime positioning
- bar / beat / tick readout
- look-ahead scheduling contract
- suspension/visibility recovery
- real clock-driven Pulse Spine
- Space keyboard transport shortcut

See [Phase 2 implementation notes](docs/phase-2/PHASE_2.md).

### Phase 3 — Drum Engine V1

- synthesized kick, snare, clap, closed/open hats, tom, percussion, and crash
- direct playable pads with keyboard mappings
- transport-scheduled foundation beat
- shared visible/audio pattern source
- velocity-aware synthesis
- open-hat choke behavior
- deterministic noise and room impulse generation
- bounded voice tracking/polyphony
- master compression, gain, and final output limiting
- PUNCH / TONE / DECAY / GRIT / SPACE macros
- stale scheduled voice cancellation on transport epoch changes

See [Phase 3 implementation notes](docs/phase-3/PHASE_3.md).

### Phase 4 — Rhythm Matrix Sequencer V1

- editable 8-lane domain Pattern
- 4 / 8 / 16-step pattern lengths
- velocity encoded as hit geometry
- per-step velocity editor
- lane mute and solo
- direct lane audition
- clear / reset / duplicate
- 100-state undo/redo history
- velocity-drag history coalescing
- Cmd/Ctrl-Z history shortcuts
- hot-edit scheduler invalidation
- CREATE strips and Drum Engine share sequencer state
- responsive sticky-lane Rhythm Matrix

See [Phase 4 implementation notes](docs/phase-4/PHASE_4.md).

### Phase 5 — Beat Generator V1

- real Beat Reactor generation
- seven style rule sets: Rock / Funk / Hip-Hop / House / Trap / Breakbeat / Electronic
- Energy / Density / Complexity / Syncopation / Swing intent controls
- deterministic seeded PRNG with no ambient Math.random()
- versioned generator provenance
- candidate quality scoring and deterministic retry
- rejected candidates never replace the active pattern
- generated Pattern becomes normal editable sequencer state
- generated velocity drives synthesis and matrix geometry
- generated Swing stored in the Pattern groove profile and applied by the Web Audio scheduler
- generation is one undoable editor action
- hot generation reschedules already queued Web Audio events safely
- Phase 6 lock controls remain visibly disabled until implemented

See [Phase 5 implementation notes](docs/phase-5/PHASE_5.md).

### Phase 6 — Beat Reactor: Lock / Reroll / Similarity

- real rhythm locks stored in Pattern lane state
- lock controls in CREATE and SEQUENCE
- full reroll of unlocked lanes
- selective reroll for all eight drum lanes
- SAME ↔ WILD derivation distance
- deterministic structural / velocity / timing interpolation
- manual beats can become reroll sources
- all-locked rerolls are blocked explicitly
- selective reroll preserves non-target lanes and global groove metadata
- protected-lane invariants verify locked material is unchanged
- quality-gated derived beats
- sourceEntityId / mutationId lineage metadata
- rerolls remain undoable and hot-playback safe

See [Phase 6 implementation notes](docs/phase-6/PHASE_6.md).

### Phase 7 — Rhythm Glyph System

- deterministic Pattern-derived musical sigils
- exact-structure RG signatures independent of IDs/provenance
- continuous geometry rather than hash-driven artwork
- kick anchors and lower contour
- backbeat upper anchors
- hi-hat signal teeth
- percussion branches
- cymbal traces
- velocity-sensitive geometry
- swing and microtiming displacement
- density / syncopation / velocity / instrumentation metrics
- live CREATE glyph identity
- live SEQUENCE glyph diagnostic strip
- future modes use the actual current Pattern glyph
- reusable feature-distance utility for later similar-beat workflows

See [Phase 7 implementation notes](docs/phase-7/PHASE_7.md).

### Phase 8 — Groove & Humanization Engine

- Mechanical / Tight / Deep / Laid-back / Pushing / Loose / Human personalities
- deterministic correlated timing rather than independent random jitter
- role-specific pocket offsets
- beat-group timing drift + local microtiming
- velocity contour humanization
- deterministic snare/percussion/hat ghost-note vocabulary
- non-cumulative groove baselines
- Apply Feel / Reset Feel as undoable Pattern transforms
- Pattern-level Swing applied exactly once at Web Audio scheduling time
- generated and rerolled beats inherit the active feel
- Rhythm Matrix shows actual timing displacement and ghost notes
- Rhythm Glyph reflects swing, human microtiming, dynamics, and ghosts
- SEQUENCE exposes active personality and Humanization

See [Phase 8 implementation notes](docs/phase-8/PHASE_8.md).

### Phase 9 — Groove Field & Musical Mutation

- functional HARDER / SPACE / FUNKIER / PUSH / DRAG / DIRTY / BREAK / WEIRD / THIN mutation deck
- Reactor distance reused as semantic mutation strength
- commands alter coordinated rhythm, dynamics, intent, and/or groove dimensions
- deterministic mutation engine with no ambient randomness
- baseline-first transformation prevents cumulative humanization artifacts
- current groove personality/pocket is reapplied after structural mutation
- Groove Field is a real density/syncopation transformation surface
- one field mutation is committed per pointer gesture
- rhythm locks protect structural material
- Groove-generated ghosts inside locked lanes remain protected
- command-aware quality validation including intentional House BREAK behavior
- mutations preserve hot-playback scheduling safety and editor undo
- mutation provenance stores source Pattern, mutation ID, target intent, and strength
- accepted mutation state updates CREATE controls to match the resulting Pattern

See [Phase 9 implementation notes](docs/phase-9/PHASE_9.md).

### Phase 10 — Generation History & Evolution Tree

- separate creative lineage from editor Undo/Redo
- immutable Pattern snapshots per creative node
- automatic nodes for Generate / Reroll / Mutation / Groove Field
- manual EDIT checkpoints only when manual changes become creative branch sources
- explicit sourceHistoryNodeId stamping
- active vs selected node distinction
- recursive spatial branch connectors
- compact Rhythm Glyph per node
- one-loop non-destructive history audition
- Restore and explicit BRANCH operations
- favorites and inline rename
- CUT removes a branch and all descendants
- active-branch deletion falls back safely
- restore preserves current mute/solo monitoring while restoring creative locks
- history audition cannot overlap the main transport
- session-local persistence boundary documented honestly

See [Phase 10 implementation notes](docs/phase-10/PHASE_10.md).

## Phase 0 architecture

See:

- [Product Constitution](docs/phase-0/PRODUCT_CONSTITUTION.md)
- [Technical Architecture](docs/phase-0/ARCHITECTURE.md)
- [Domain & Data Contracts](docs/phase-0/DATA_CONTRACTS.md)
- [Pulse Architecture](docs/phase-0/PULSE_ARCHITECTURE.md)
- [Steadybar Interoperability Contract](docs/phase-0/STEADYBAR_INTEROP.md)
- [Phase 0 Acceptance Gate](docs/phase-0/ACCEPTANCE.md)

## Top-level product modes

- **01 / CREATE** — generation, locking, rerolling, groove shaping, mutation.
- **02 / SEQUENCE** — detailed rhythm matrix and region editing.
- **03 / SOUND** — drum synthesis, kit generation, sound morphing.
- **04 / ARRANGE** — beat families, fills, transitions, energy sculpture.
- **05 / LIVE** — scene triggering and performance transformations.
- **06 / ARCHIVE** — projects, beats, kits, snapshots, and generation lineage.

## Architectural rule

The audio engine, generation engine, domain model, persistence, and export pipeline remain independent of the React rendering layer. UI state may observe and command these systems; it must never become their source of truth.
