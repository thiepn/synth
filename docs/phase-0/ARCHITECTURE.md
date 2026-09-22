# Phase 0 — Technical Architecture

## 1. Architectural principle

Real-time audio and deterministic music logic must not depend on UI render timing.

```text
UI / React
   │ commands + projections
   ▼
Application Layer
   ├──────────────► History / Commands
   ├──────────────► Persistence
   ├──────────────► Generation
   └──────────────► Audio Facade
                         │
                         ▼
                   Web Audio Engine
```

React is a view/controller layer, not the music engine.

## 2. Target stack

- TypeScript
- React for application UI
- Vite-class browser build tooling
- Web Audio API for synthesis/playback
- AudioWorklet where deterministic low-latency DSP or scheduling requires it
- Web Workers for expensive non-audio computation where useful
- IndexedDB for local durable project storage
- Service Worker/PWA layer later for offline application delivery

Exact package versions are intentionally not frozen in Phase 0. Stable versions are selected when implementation begins.

## 3. Module boundaries

```text
src/
  app/              routing, boot, app composition
  domain/           pure musical/domain contracts
  generation/       deterministic beat/kit/variation generators
  audio/            clocks, scheduler, voices, DSP, rendering
  commands/         user operations + reversible mutations
  persistence/      IndexedDB repositories, migrations, autosave
  export/           WAV, stems, MIDI, project bundles
  visual/           Rhythm Glyph and music-derived visualization logic
  ui/               React surfaces and Pulse Architecture components
  interop/          neutral import/export adapters
```

Dependency direction:

```text
ui ───────► application ───────► domain
                 │
generation ──────┤
audio ───────────┤
persistence ─────┤
visual ──────────┘

domain imports none of them.
```

## 4. Rhythm/sound separation

Pattern lanes target semantic **kit slots**, not concrete sound objects:

```text
Pattern lane → Kit slot → Sound specification → Runtime voice
```

This is a frozen architectural decision. It allows kit swaps, kit generation, sound locking, and rhythm reuse without mutating event data.

## 5. Audio ownership

The audio system owns:

- AudioContext lifecycle
- master transport clock
- look-ahead scheduling
- note/event scheduling
- voices
- synthesis
- FX
- master routing
- offline rendering

The UI may request transport changes but may not emulate transport time using timers or animation frames.

## 6. Generation ownership

Generator functions must be:

- deterministic
- side-effect free where practical
- versioned
- parameterized by explicit inputs
- testable without Web Audio or React

Conceptual API:

```ts
generateBeat(request, seed, generatorVersion) -> GeneratedBeat
mutateBeat(source, mutation, seed, generatorVersion) -> GeneratedBeat
generateVariation(source, distance, seed, generatorVersion) -> GeneratedBeat
```

No generator may rely on ambient `Math.random()` in production logic.

## 7. Command/history model

Creative operations become semantic commands, e.g.:

- GenerateBeat
- RerollLane
- LockLane
- SetGrooveField
- ApplyMutation
- GenerateVariation
- GenerateKit
- ReplaceSound
- EditStep
- GenerateTransition
- SculptEnergy

Commands should retain enough metadata for undo, replay, and lineage.

Editor Undo/Redo and creative lineage are distinct systems:

- Undo/Redo is short-horizon reversible editor state.
- Evolution history stores branchable creative snapshots and explicit ancestry.

History nodes refer to typed creative artifacts rather than only patterns, allowing kit, sound, scene, and arrangement branches to participate in the evolution model.

For the current Pattern-focused implementation, Evolution nodes own immutable Pattern snapshots and stamp child Pattern provenance with the parent history-node ID.

The user-facing Evolution Tree is derived from this history model rather than maintained as unrelated UI state.

## 8. Project persistence

Projects are versioned domain documents.

Persistence rules:

- schema version required
- autosave must be transactional
- imported project data is validated before activation
- migrations are explicit and testable
- missing optional assets degrade gracefully
- imported sample blobs are referenced by stable asset IDs
- no domain object stores transient AudioNode references

## 9. State categories

Keep these separate:

### Domain state
Musical truth: patterns, sounds, kits, arrangement, locks, lineage.

### Runtime/audio state
AudioContext, scheduled events, active voices, playback position.

### UI state
Open panel, hover/focus, viewport mode, transient selection.

### Durable preferences
Theme/accessibility/audio-device preferences and application settings.

Do not persist transient UI state inside core project data unless it has creative meaning.

## 10. Performance rules

- transport timing uses Web Audio time
- UI visualization may lag gracefully; audio may not
- expensive generation can leave the main thread
- audio callback paths must avoid avoidable allocations
- visual animation must degrade before audio quality does
- reduced-motion mode does not alter the musical engine
- playback must remain valid if React temporarily stalls

## 11. Determinism contract

A generated artifact records at minimum:

- seed
- generator family
- generator version
- input style parameters
- source lineage ID if derived
- mutation operation if derived

Given the same compatible engine version and identical inputs, generation should reproduce the same musical result.

When generator behavior intentionally changes, increment the relevant generator version rather than silently changing historical seed meaning.

## 12. Error boundaries

Failures should be localized:

- UI failure must not corrupt a project
- visualization failure must not stop audio
- one invalid sample must not invalidate a whole project
- export failure must not mutate project state
- persistence failure must surface clearly and keep the in-memory project intact
- AudioContext suspension must be recoverable

## 13. Testing strategy

### Pure unit tests
- generator determinism
- mutation constraints
- data migrations
- pattern transforms
- Rhythm Glyph determinism

### Property tests
- no invalid step indices
- velocities remain bounded
- mutation preserves locked elements
- kit swapping does not mutate pattern events
- generation stays within requested meter/length

### Integration tests
- transport + scheduler
- persistence round trips
- project import/export
- history replay

### Musical certification
Later phases add corpus-level generation analysis and human listening audits.

## 14. Architecture freeze rule

Changes to the following require an explicit architecture decision:

- project root schema
- event timing representation
- pattern → kit-slot → sound relationship
- seed/version contract
- asset identity model
- history lineage semantics
- Steadybar interchange format
- UI/audio ownership boundary
