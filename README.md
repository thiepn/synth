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
- **Phase 11 — Drum Synthesis Engine V2:** complete
- **Phase 12 — Kit Generator:** complete
- **Phase 13 — Sound Morphing & Kit Mutation:** complete
- **Phase 14 — Advanced Sequencer V2:** complete
- **Phase 15 — Pattern Painting & Advanced Sequencer Gestures:** complete
- **Phase 16 — Beat Families, Fills & Transitions:** complete
- **Phase 17 — Scene & Section Generator / Arrange Foundation:** complete
- **Phase 18 — ARRANGE Mode, Energy Sculpture & Arrangement Playback:** complete
- **Phase 19 — Sample Import & Hybrid Voice Engine:** complete
- **Phase 20 — Style DNA & Genre Expansion:** complete
- **Phase 21 — Beat Morph & Remix Engine:** complete
- **Phase 22 — Chaos Engine & Controlled Randomness:** complete
- **Next: Phase 23 — Performance Engine, Live Macros & Jam Capture**

Synth now has a real Web Audio transport, an eight-voice layered V2 drum synthesizer, local sample/hybrid voice playback, an editable 64-step polymetric sequencer, a versioned 25-profile Style DNA system, deterministic genre-aware beat generation, lock-aware iterative rerolling, continuous five-dimension Beat Morphing, deterministic cross-style Remix derivation, Pattern-derived visual rhythm identity, deterministic groove/humanization, semantic musical mutation, branching creative lineage, a serializable material sound model, Style-DNA-aware coherent Kit generation, lock-aware sound evolution/morphing, deterministic probability/ratchet/flam playback, fast gesture-based Pattern shaping, genre-aware Beat Family generation, Style-DNA-driven Scene/Section foundations, and a fully active editable ARRANGE mode with Energy Sculpture and arrangement playback. React remains outside musical timing, canonical pattern state, generator logic, glyph derivation, groove transformation, mutation logic, history ownership, sound-spec ownership, sample-asset ownership, Kit generation, sound-evolution logic, advanced sequencer playback evaluation, Pattern Painting logic, Beat Family ownership, arrangement-foundation ownership, and arrangement playback ownership.

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

### Phase 11 — Drum Synthesis Engine V2

- serializable eight-parameter material spec per drum voice
- active 03 / SOUND material-engineering mode
- Kick body / sub / click layering
- Snare body / ring / noise / snap layering
- multi-burst Clap with temporal spread and body thickness
- metallic oscillator-bank Closed/Open Hats plus filtered noise
- Tom body, attack texture and pitch-drop synthesis
- FM/resonator/noise Percussion
- metallic oscillator-bank Crash plus filtered noise wash
- existing master Punch / Tone / Decay / Grit / Space macros retained
- V2 specs convert to domain SynthSoundSpec
- live parameter edits coalesce scheduler invalidation
- zero-level optional layers are Web-Audio-safe
- hit-level polyphony raised to 64
- session-local sound-state boundary documented honestly

See [Phase 11 implementation notes](docs/phase-11/PHASE_11.md).

### Phase 12 — Kit Generator

- 11 deterministic kit directions: Tight / Huge / Dark / Bright / Clean / Dirty / Electronic / Hybrid / Vintage / Industrial / Experimental
- shared Kit DNA: Brightness / Weight / Tightness / Roughness / Synthetic / Depth / Air / Variance
- role-aware V2 material derivation for all eight voices
- coherence validation for hat family, decay hierarchy, low end, cymbal air, and cross-voice spread
- requested direction-fit validation
- deterministic retry loop
- real generated Kit + eight Sound domain objects
- generated Sounds contain V2 SynthSoundSpec and provenance
- generated Kit slots reuse the sequencer's exact semantic kit-slot IDs
- runtime playback now resolves Pattern Lane → Kit Slot → Sound → Voice
- atomic eight-voice kit application
- generated-kit CLEAN/MOD state tracking
- manual voice edits mark generated kits modified
- RESET ALL clears generated-kit identity
- SOUND exposes shared Kit DNA and generation quality
- coherent Kit generation establishes shared multi-voice material identity; Phase 19 later adds true sample+synth HYBRID sources
- generated Kit/Sound snapshots are deep-cloned

See [Phase 12 implementation notes](docs/phase-12/PHASE_12.md).

### Phase 13 — Sound Morphing & Kit Mutation

- eight deterministic semantic sound mutations: Darker / Brighter / Heavier / Cleaner / Dirtier / Tighter / Bigger / Stranger
- four relatedness levels: Very Similar / Similar / Different / Wild
- deterministic 8-attempt Kit mutation retry
- whole-kit mutation
- selected-voice mutation
- real sound locks using PatternLane.lock.sound
- fresh Kit generation honors sound locks
- mutation and morph enforce exact locked-voice invariants
- modified kits infer DNA from live material specs
- immutable A/B morph snapshots owned by DrumSoundStore
- continuous material-spec A↔B morph preview
- coherence-only morph validation avoids false direction rejection at midpoints
- committed morph creates new Kit + eight Sound artifacts
- Kit/Sound provenance stores source Kit + mutation/morph IDs
- live morphing uses the existing 32 ms sound scheduler coalescing
- RESET ALL clears the A/B workspace
- direct manual material edits intentionally remain explicit lock overrides

See [Phase 13 implementation notes](docs/phase-13/PHASE_13.md).

### Phase 14 — Advanced Sequencer V2

- 4 / 8 / 16 / 32 / 64-step Patterns
- Generate/Reroll compatibility at 32/64 steps
- independent per-lane loop lengths as the polymeter foundation
- dormant events preserved outside shortened lane loops
- deterministic per-lane-cycle probability
- ×1 / ×2 / ×3 / ×4 ratchets
- tempo-safe 0–40 ms flams
- signed ±50 ms per-step microtiming
- advanced Step Editor for probability / timing / ratchet / flam
- local lane playheads follow independent loop lengths
- Matrix shows probability / ratchet / flam / dormant-loop state
- Create strips render effective repeated lane loops
- historical Pattern audition honors polymeter/probability/ratchets/flams
- Rhythm Glyph identity/geometry reflects lane loops and advanced event metadata
- creative history identity includes loop/ratchet/flam changes
- Rhythm Exchange preserves lane loops, probability, ratchets, and flams
- mobile sticky lane hardware remains touch-usable

See [Phase 14 implementation notes](docs/phase-14/PHASE_14.md).

### Phase 15 — Pattern Painting & Advanced Sequencer Gestures

- explicit SELECT / SCROLL vs PAINT modes
- Draw / Density / Kick / Hat / Perc / Fill / Ghost / Silence brushes
- deterministic brush decisions with no ambient randomness
- live pointer/touch drag painting
- one complete drag stroke = one Undo action
- repeated-cell protection inside a stroke
- Brush Density control
- semantic brush routing to Kick / Hat / Perc / Tom+Perc fill lanes
- brush edits respect active polymetric lane boundaries and preserve dormant material
- lane Generate / Variate / Simplify / Humanize actions
- lane Generate cannot return an accidentally empty phrase
- lane Variate preserves fallback material when needed
- lane automation lock semantics aligned with rhythm/timing/dynamics locks
- lane Humanize remains inside ±50 ms timing limits
- Fill brush can author Advanced Sequencer ratchets/flams
- scheduler invalidation coalesced to 16 ms during rapid Pattern edits
- SELECT mode preserves mobile horizontal scrolling; PAINT mode reserves touch movement for painting
- all gesture results remain canonical Pattern state observed by CREATE / Glyph / history

See [Phase 15 implementation notes](docs/phase-15/PHASE_15.md).

### Phase 16 — Beat Families, Fills & Transitions

- first-class BeatFamily / BeatFamilyMember domain contracts
- CORE / A VAR / B VAR / BUILD / BREAKDOWN / DROP / FILL 1 / FILL 2 / TRANSITION
- deterministic family seeds and member provenance
- A/B generated through related Beat Variation distances
- role-aware Build / Breakdown / Drop transforms
- Advanced Sequencer ratchet/flam Fill patterns
- dedicated Transition material
- shared GrooveProfile across the family
- rhythm/dynamics lock-aware family transforms
- all-locked degenerate-family rejection
- polymetric lane-loop-aware family edits
- dormant out-of-loop material preserved
- member-level quality validation and family coherence score
- non-destructive family generation
- immutable session BeatFamilyStore
- Rhythm Glyph per member
- one-loop non-destructive audition
- explicit USE promotion into SEQUENCE
- USE creates Evolution variation/transition branches
- family generation itself does not pollute Undo or history
- full ARRANGE UI intentionally remains deferred

See [Phase 16 implementation notes](docs/phase-16/PHASE_16.md).

### Phase 17 — Scene & Section Generator / Arrange Foundation

- first-class SceneRole / ArrangementShapeId / SectionBlueprint / ArrangementBlueprint domain contracts
- Compact / Standard / Extended arrangement shapes
- reusable Intro / Verse / Pre-Chorus / Chorus / Breakdown / Build / Drop / Outro Scenes
- deterministic family-member selection per section/cycle
- concrete ordered Pattern sequences
- exact cumulative start/length ticks
- section cycle counts
- fill placement and transition routing
- Scene and blueprint generation provenance
- section energy start/end targets
- Scene energy hierarchy
- validation for contiguous timing, Scene references, family Pattern references, fill/transition references, and required roles
- immutable session ArrangementFoundationStore
- automatic invalidation when the source BeatFamily changes
- ARRANGE / FOUNDATION inspection UI in CREATE
- Scene roster and selected-section inspector
- descending energy ramps render correctly
- non-destructive generation: no Pattern replacement, Undo pollution, history nodes, or arrangement playback
- full 04 / ARRANGE activation remains Phase 18

See [Phase 17 implementation notes](docs/phase-17/PHASE_17.md).

### Phase 18 — ARRANGE Mode, Energy Sculpture & Arrangement Playback

- active 04 / ARRANGE top-level mode
- editable ArrangementStore loaded from Phase 17 foundation data
- proportional Section timeline
- left/right move plus desktop drag reorder
- Section duplication and removal
- 1–16 cycle editing
- Fill OFF / LAST placement
- Transition OFF / REPLACE / APPEND placement
- exact occurrence/timeline recalculation after edits
- effective audible Pattern sequence shown in the UI
- editable Energy Start / End per Section
- Energy Sculpture graph with live arrangement playhead
- Energy Sculpture audibly scales arrangement hit dynamics
- Play All and true section-scoped Play Section
- arrangement-end and section-end auto-stop
- Pause / Resume / Stop
- shared Pattern resolver preserves polymeter / probability / ratchets / flams / microtiming
- active Kit/Sound routing preserved
- global utility transport and Spacebar route through ARRANGE while the mode is active
- entering/leaving ARRANGE isolates playback modes
- dedicated ARRANGE Undo/Redo with coalesced Energy edits
- UI-only Section selection does not invalidate Web Audio
- live musical arrangement edits safely invalidate future scheduling
- session-local persistence/history boundary documented explicitly

See [Phase 18 implementation notes](docs/phase-18/PHASE_18.md).

### Phase 19 — Sample Import & Hybrid Voice Engine

- local browser-session audio sample import
- SHA-256 content-addressed deterministic asset IDs
- 64 MB per-file import guard
- browser Web Audio decode status and cache
- decoded duration / sample-rate / channel metadata
- normalized waveform generation with trim markers
- per-voice SYNTH / SAMPLE / HYBRID source modes
- non-destructive Trim In / Trim Out
- sample gain from -36 dB to +12 dB
- pitch from -24 to +24 semitones
- reverse of the selected trim region
- true Hybrid synth-layer dB gain
- sample audio passes through the existing drum drive / room / compressor / limiter path
- sample voices participate in polyphony, transport cancellation and open-hat choke
- direct pads, Pattern audition, SEQUENCE and ARRANGE all use configured sample/hybrid sources
- active generated Kit Sound objects synchronize to real Synth/Sample/Hybrid SoundSpecs
- Generate Kit and Kit Mutation preserve assigned sample layers/source mode
- removing an asset detaches every affected voice safely
- imported raw bytes and decode cache are explicitly session-local until the later persistence phase

See [Phase 19 implementation notes](docs/phase-19/PHASE_19.md).

### Phase 20 — Style DNA & Genre Expansion

- versioned Style DNA registry with provenance ID/version
- 25 public genre profiles across 5 musical families
- 7 mature rhythm archetypes retained as internal generator primitives
- genre-specific kick / backbeat / half-time / subdivision grammar
- open/closed-hat, percussion, tom, crash and ghost-note tendencies
- deterministic ratchet/flam vocabulary
- Style-DNA-driven Groove Engine pocket, humanization, ghosts and base swing
- DNA-aware Beat validation replacing hard-coded House/Funk/Trap exceptions
- Reroll and Musical Mutation preserve Style DNA lineage
- Style sound DNA biases coherent Kit generation
- explicit GENERATE STYLE KIT action with sound-lock support
- normal SOUND Kit generation inherits the current Pattern Style DNA
- Phase 19 sample/hybrid assignments survive Style Kit generation
- Beat Family Build/Drop/Fill behavior follows genre fill vocabulary
- Beat Family energy follows genre arrangement DNA
- Scene and Section energy targets follow the same Style DNA
- full Style DNA fingerprint machine in CREATE
- old seven-style public bank removed
- BPM ranges remain descriptive; transport BPM stays user-authoritative
- no ambient randomness introduced

See [Phase 20 implementation notes](docs/phase-20/PHASE_20.md).

### Phase 21 — Beat Morph & Remix Engine

- non-destructive A/B Pattern workspace
- Capture A / Capture B from any compatible current Pattern
- deterministic Remix → B using the selected Style DNA target
- Remix Strength from related derivation toward structural rebuild
- independent Rhythm / Dynamics / Timing / Groove / Style DNA dimensions
- Morph All macro with custom-vector detection
- probability-based structural fade between A-only and B-only events
- shared-event velocity / timing / probability interpolation
- deterministic ratchet / flam / loop metadata switching
- audible Style DNA cross-morph through event-probability bias
- Pattern-level Groove interpolation
- A-side Rhythm / Dynamics / Timing / Sound lock constraints
- exact endpoint behavior when unconstrained by locks
- A/B/Morph Rhythm Glyphs and distance feedback
- non-destructive A / B / Morph audition
- endpoint swap with inverted dimensions
- explicit COMMIT MORPH and COMMIT REMIX
- new beatMorph / remix Evolution-history operations
- Morph provenance records B endpoint and all five dimension amounts
- committed results remain ordinary editable Patterns
- preview/slider movement does not pollute Sequencer Undo or Evolution history
- session-local uncommitted workspace boundary documented

See [Phase 21 implementation notes](docs/phase-21/PHASE_21.md).

### Phase 22 — Chaos Engine & Controlled Randomness

- deterministic keyed entropy independent across domains
- Subtle → Unstable → Wild progressive intensity
- rhythm / dynamics / timing / probability / ornament / instrumentation entropy
- Pattern-lock-aware and region-lock-aware mutation filtering
- temporary lane/domain/region Chaos freeze masks
- reusable Chaos seeds and fast New Variation workflow
- non-destructive base/result preview workspace
- live transport preview without modifying canonical Pattern state
- Base / Chaos audition and bypass
- structured mutation diff
- explicit COMMIT CHAOS
- one-step Sequencer Undo on commit
- chaos creative-lineage history node
- committed output remains an ordinary editable Pattern
- zero-intensity identity and bounded event validation

See [Phase 22 implementation notes](docs/phase-22/PHASE_22.md).

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
