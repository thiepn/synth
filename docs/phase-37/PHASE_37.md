# Phase 37 — Architecture Consolidation & Product Simplification

Status: implemented.

## Purpose

Phases 0–36 built the complete product surface.

Phase 37 deliberately adds no new creative feature. Its purpose is to reduce architectural ambiguity before adversarial QA and release certification.

The consolidation rule is:

> One concept should have one canonical owner, one mutation path, and one runtime interpretation.

## Net code movement

The Phase 37 consolidation is net-negative despite adding architecture regression checks.

At the consolidation checkpoint:

~~~text
lines added:   ~1,171
lines removed: ~1,562
~~~

A large part of the additions is the architecture contract itself.

## Canonical Pattern cloning

Pattern deep-copy behavior had accumulated independently across:

- Sequencer
- Generation History
- Beat Family
- Beat Morph
- EVOLVE
- Song Architect
- ARRANGE
- Sample Lab
- Resample
- render snapshots
- generation helpers

That was dangerous because every future Pattern field had to be remembered in many places.

Phase 37 establishes:

~~~text
src/domain/patternClone.ts
├── cloneStepEvent()
├── clonePatternLane()
├── cloneGenerationProvenance()
└── clonePattern()
~~~

All major Pattern consumers now use that one contract.

The canonical clone preserves:

- meter
- lanes
- events
- generator tags
- groove baselines
- generation locks
- region locks
- groove role offsets
- provenance style
- provenance intent

## Canonical ARRANGE cloning

ARRANGE blueprint cloning now lives in:

~~~text
src/domain/arrangementClone.ts
├── cloneScene()
├── cloneSectionBlueprint()
└── cloneArrangementBlueprint()
~~~

ARRANGE Store and Song Architect no longer maintain independent blueprint-copy logic.

## Canonical Beat Family cloning

Beat Family identity/provenance cloning now lives in:

~~~text
src/domain/familyClone.ts
└── cloneBeatFamily()
~~~

Generation/runtime stores reuse the same family-copy semantics.

## Canonical React store subscription

Feature-local hooks previously repeated the same useSyncExternalStore wiring.

Phase 37 establishes:

~~~text
src/ui/store/useStoreSnapshot.ts
~~~

Feature hooks remain convenient public APIs, but subscription semantics have one implementation.

Migrated systems include:

- transport
- Sequencer
- DrumEngine
- DrumSoundStore
- SampleAssetStore
- Beat Family
- ARRANGE
- ARRANGE foundation
- Generation History
- Beat Morph
- CHAOS
- EVOLVE
- Song Architect
- LIVE performance
- mixer
- mastering
- modulation
- MIDI
- project persistence
- PWA
- Freeze
- Resample
- Sample Lab

## Canonical mode model

Mode identity was previously owned by a visual primitives module.

It now lives at the application layer:

~~~text
src/app/modeModel.ts
├── ModeId
├── ModeDefinition
└── MODES
~~~

UI primitives may re-export compatibility types, but they no longer own product navigation identity.

The implemented mode set remains:

1. CREATE
2. SEQUENCE
3. SOUND
4. ARRANGE
5. LIVE
6. MIX
7. EXPORT

## Dead ModePlaceholder removal

All seven modes are implemented.

The old generic ModePlaceholder path therefore represented dead phase-era compatibility code.

Phase 37 removes:

~~~text
src/ui/surfaces/ModePlaceholder.tsx
~~~

App rendering now uses one exhaustive mode-to-lazy-surface registry.

## Canonical playback command routing

Transport behavior had been encoded independently in:

- App mode switching
- transport header controls
- Space-key lifecycle
- external/MIDI transport actions

Phase 37 establishes:

~~~text
src/playback/PlaybackCoordinator.ts
~~~

The coordinator owns:

- current playback mode
- Pattern vs ARRANGE target resolution
- Play/Pause routing
- Stop routing
- external transport routing
- mode-change cleanup

This removes separate arrangement-vs-pattern decision logic from UI and input systems.

## Canonical creative Pattern resolver

CHAOS/Morph playback previously had two owners:

1. React CreativePlaybackBridge generated a Sequencer runtime preview for CREATE/LIVE.
2. DrumEngine independently resolved CHAOS/Morph for arrangement performance.

Phase 37 removes that split.

The canonical owner is:

~~~text
src/playback/CreativePatternResolver.ts
~~~

It resolves:

### Sequencer playback
- CREATE CHAOS
- LIVE Morph
- LIVE CHAOS

### ARRANGE performance playback
- LIVE Morph when the morph source matches the arrangement Pattern
- LIVE CHAOS while performance mode is active

Resolution is cached using stable Pattern object identity plus relevant store revisions.

## React playback side effects removed

The following obsolete path is deleted:

~~~text
src/performance/CreativePlaybackBridge.tsx
~~~

React no longer owns musical preview mutation.

## Sequencer runtime-preview side channel removed

SequencerStore no longer stores:

~~~text
runtimePreview
setRuntimePreview()
~~~

Sequencer state is canonical editor Pattern state only.

Playback transformation happens at the playback resolver boundary.

This removes:

- preview-only state from the editor store
- JSON comparison of runtime Patterns
- extra Sequencer publishes
- a hidden playback mutation path

## CHAOS base synchronization

CHAOS base Pattern synchronization previously happened from React.

It is now owned by CreativePatternResolver.

When canonical Sequencer Pattern state changes:

~~~text
SequencerStore
    ↓
CreativePatternResolver
    ↓
ChaosStore.setBasePattern()
~~~

No UI component owns this synchronization.

## Canonical keyboard target guard

Several surfaces independently checked whether global keyboard shortcuts should ignore:

- inputs
- textareas
- selects
- buttons
- sliders
- editable content

That logic now lives in:

~~~text
src/input/domInputGuards.ts
└── eventTargetConsumesKeyboard()
~~~

Transport, Sequencer, LIVE and Sample Lab reuse it.

## Canonical error normalization

Unknown runtime exceptions previously used repeated variants of:

~~~text
error instanceof Error ? error.message : String(error)
~~~

Phase 37 establishes:

~~~text
src/runtime/errors.ts
└── errorMessage()
~~~

Migrated runtime systems include:

- AudioTransport
- ProjectStore
- PWA runtime
- RenderStore
- ResampleStore
- SampleAssetStore
- MidiStore

Empty/unknown errors now also receive a stable fallback message.

## Canonical project schema version

ProjectDocument and the general domain schema previously exposed separate version constants with the same value.

ProjectDocument now sources its version from:

~~~text
PROJECT_SCHEMA_VERSION
~~~

The ProjectDocument-specific constant remains only as a compatibility alias.

## Preview/history boundaries intentionally not over-generalized

Phase 37 explicitly does not force unrelated stores into one generic abstraction when semantics differ.

Examples:

- Mixer Undo includes automation lanes.
- Mastering Undo does not.
- EVOLVE and Song Architect have different candidate structures.
- Render and Resample have different task/result lifecycles.

Consolidation is applied where behavior is truly the same, not merely where method names look similar.

## Architecture regression contract

Production builds now run:

~~~text
npm run check:architecture
~~~

The contract scans the source tree and fails when consolidation regresses.

It currently enforces:

- no local clonePattern implementations outside the canonical domain module
- no local ARRANGE blueprint clone implementations
- no local BeatFamily clone implementations
- no mode identity imports from UI primitives
- no direct feature-local useSyncExternalStore wrappers
- ModeId owned by app/modeModel
- no obsolete ModePlaceholder path/file
- App shell does not bypass PlaybackCoordinator
- Transport UI uses PlaybackCoordinator
- external transport actions use PlaybackCoordinator
- ProjectDocument uses the canonical schema version
- SequencerStore has no runtimePreview side channel
- no callers of setRuntimePreview remain
- CHAOS base Pattern synchronization has one owner
- CreativePlaybackBridge no longer exists
- DrumEngine uses CreativePatternResolver instead of a local performance-pattern resolver

## Build validation

The final Phase 37 architecture head passes:

- interaction contract
- performance contract
- architecture contract
- TypeScript
- Vite production build
- bundle budget

## Phase boundary

Phase 37 is the final architecture-changing phase before release QA.

The next phase is:

# Phase 38 — Comprehensive Product Audit & Adversarial QA

Phase 38 should assume the architecture is frozen and attack the product through:

- feature-by-feature functional audits
- cross-feature interaction matrices
- project persistence/reload tests
- audio/playback edge cases
- offline/PWA behavior
- mobile/keyboard/accessibility regressions
- malformed/corrupt data
- race conditions
- rapid interaction
- long-session state
- import/export/backup failures
- error recovery
- regression repair

Architectural rewrites should not be introduced in Phase 38 unless a concrete blocking defect proves them necessary.

## Safety invariants

- Pattern state has one deep-copy contract
- ARRANGE blueprint state has one deep-copy contract
- Beat Family state has one deep-copy contract
- mode identity is not UI-owned
- playback command routing has one owner
- creative Pattern playback transformation has one owner
- React does not mutate playback-only Pattern state
- SequencerStore contains editor truth, not transient playback overlays
- project schema version has one source of truth
- global keyboard guards have one source of truth
- runtime error normalization has one source of truth
- architecture regressions fail the production build
