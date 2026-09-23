# Phase 36 — Performance, Battery & Scale Hardening

Status: implemented.

## Purpose

Phase 36 hardens Synth for a larger product surface without changing the musical clock or creative semantics.

The main goals are:

- reduce initial application work
- separate musical scheduling from visual refresh cost
- move CPU-heavy analysis off the UI thread
- prevent autosave from rewriting large immutable data unnecessarily
- keep offline PWA behavior correct after code splitting
- bound long-session memory growth
- turn performance assumptions into CI-enforced budgets

## Measured production result

Before Phase 36, the production build emitted one primary JavaScript bundle of roughly:

~~~text
795 KB
~~~

The Phase 36 certified build reports:

~~~text
entry JS:    478.6 KB
largest JS:  478.6 KB
total JS:    794.8 KB
JS chunks:   16
total CSS:   169.3 KB
~~~

The important change is not pretending total product code disappeared.

Instead, startup JavaScript is substantially reduced and mode-specific work is deferred until needed.

## Transport timing architecture

Phase 36 keeps the existing musical scheduler contract:

~~~text
scheduler cadence: 25 ms
look-ahead:        100 ms
musical clock:     Web Audio time
~~~

React remains outside timing.

### UI publication cap

Transport visual snapshots are now capped at approximately:

~~~text
30 Hz
~~~

This reduces:

- React render pressure
- layout/paint churn
- battery use from 60 Hz position publications

without changing audio scheduling precision.

### Scheduler Worker

The scheduler wake-up interval now prefers a dedicated Web Worker.

The Worker only wakes the main audio scheduler.

It does not become the source of musical truth.

Flow:

~~~text
Worker timer
    ↓
scheduleWindow()
    ↓
Web Audio currentTime
    ↓
100 ms look-ahead
    ↓
ScheduledTransportPulse
~~~

If Worker construction fails or Workers are unavailable, Synth falls back to the existing main-thread interval timer.

## Mode workspace code splitting

The seven mode workspaces are now lazy-loaded:

- CREATE
- SEQUENCE
- SOUND
- ARRANGE
- LIVE
- MIX
- EXPORT

The shell, project system, transport and navigation load first.

Mode bundles are requested only when needed.

### Intent preloading

To avoid visible navigation latency, a mode is preloaded when its mode button receives:

- keyboard focus
- pointer hover

The user therefore gets reduced startup work without making ordinary navigation feel delayed.

## Lazy workspace fallback

Suspense uses a dedicated Pulse-style workspace loading surface.

The fallback:

- identifies the destination mode
- remains visually consistent with Synth
- supports reduced-motion mode

## Offline code-splitting compatibility

Code splitting introduces a PWA risk: an unvisited lazy chunk would normally be absent from the Phase 34 app-shell cache.

Phase 36 solves that explicitly.

### Build asset manifest

Vite now emits:

~~~text
asset-manifest.json
~~~

containing all generated JavaScript and CSS chunk names for the build.

### Service Worker precache

The Service Worker reads the build asset manifest during installation and precaches every same-scope generated JS/CSS asset.

Therefore:

- startup loads less JS
- unvisited modes still work offline
- Worker chunks remain available offline
- code splitting does not weaken the local-first PWA contract

## Project transient dependency decoupling

ProjectStore previously statically imported transient workspaces solely to clear them during project switching.

That forced feature modules into the startup dependency graph.

Phase 36 introduces:

~~~text
transientResetRegistry
~~~

Transient feature stores register their cleanup function only when their module is loaded.

Registered transient systems include:

- ARRANGE playback
- Beat Morph
- CHAOS
- EVOLVE
- Song Architect
- LIVE performance
- Sample Lab
- Render
- Resample / Freeze

When a project changes:

~~~text
ProjectStore
    ↓
resetLoadedProjectTransientState()
    ↓
only modules that actually loaded are reset
~~~

An unloaded feature has no transient state to clear.

This removes a class of artificial startup coupling without weakening project isolation.

## Long-sample analysis Worker

Sample Lab waveform/transient analysis can be CPU-heavy for long audio files.

Phase 36 splits the pure analysis function from AudioBuffer/browser ownership.

### Short samples

Samples under the worker threshold stay synchronous to avoid Worker setup/copy overhead.

### Long samples

Longer samples:

1. copy decoded channel data
2. transfer the copied ArrayBuffers to a Web Worker
3. calculate waveform peaks / RMS / peak / transient detection off-thread
4. return plain analysis data

The original AudioBuffer remains owned by the audio runtime.

## Stale Sample Lab results

Loading Sample A and then Sample B while A is still being analyzed must never apply A's late Worker result to B.

SampleLabStore now uses a monotonically increasing load serial.

A result is committed only when its serial still matches the current load generation.

Project reset/clear also invalidates outstanding analysis generations.

## Sample-analysis Worker lifetime

The Sample Analysis Worker is not kept alive indefinitely.

After the pending request set becomes empty, it terminates after approximately:

~~~text
30 seconds
~~~

of inactivity.

A later long-sample analysis creates a fresh Worker.

## Incremental immutable asset persistence

Sample assets are content-addressed and immutable.

Before Phase 36, routine project autosave captured and rewrote every referenced sample byte payload on every project edit.

Phase 36 tracks which asset IDs are already persisted for the active project.

Normal autosave now writes:

~~~text
ProjectDocument
+
only newly introduced sample assets
~~~

It does not repeatedly copy/write unchanged imported audio.

Full in-memory rollback bundles still capture all current assets because rollback correctness has different requirements from routine persistence cost.

## Idle-time autosave

The existing 750 ms debounce remains.

After the debounce, routine autosave prefers:

~~~text
requestIdleCallback(..., { timeout: 1000 })
~~~

where supported.

This reduces competition between:

- active editing
- rendering
- UI work
- ProjectDocument serialization

Explicit Save and lifecycle-triggered save paths remain immediate.

Browsers without requestIdleCallback fall back to the normal save path.

## Bounded creative history

Generation History stores full Pattern snapshots.

That graph was the main unbounded long-session in-memory collection.

Phase 36 sets a conservative limit:

~~~text
512 history nodes
~~~

Pruning is leaf-only.

The following are protected:

- root
- current active node
- current selected node
- active ancestry
- selected ancestry
- favorites
- favorite ancestry
- the newly created node

Only the oldest unprotected leaves are removed.

If no safe leaf exists, Synth stops pruning rather than deleting protected creative history.

## Existing bounded systems retained

The audit confirmed several high-churn runtime systems already had explicit bounds:

- active DrumEngine voices: bounded
- LIVE takes: bounded
- Sample Lab takes: bounded
- resample artifacts: bounded
- decoded/reversed sample caches: cleared on project replacement

Phase 36 does not add duplicate cleanup systems where existing limits already work.

## Bundle performance budgets

Every production build now checks:

- entry JavaScript size
- largest JavaScript chunk
- total JavaScript size
- total CSS size
- minimum JS chunk count

Current budgets:

~~~text
entry JS       ≤ 700 KB
any JS chunk   ≤ 750 KB
total JS       ≤ 2.5 MB
total CSS      ≤ 240 KB
JS chunks      ≥ 5
~~~

The current measured build is comfortably inside those thresholds.

The budgets are intentionally guardrails, not optimization targets.

## Runtime performance regression contract

Before TypeScript/Vite build, CI verifies that key architecture guarantees still exist:

- lazy mode workspaces
- 30 Hz visual transport publication
- Worker transport wake-up path
- Worker Sample Lab analysis
- incremental immutable asset persistence
- idle autosave
- lazy transient reset registry
- bounded Generation History
- Service Worker lazy-chunk precache
- Vite asset-manifest generation

This prevents future refactors from silently collapsing Phase 36 back into the old architecture.

## GitHub Actions runtime update

CI and Pages workflows now use current action runtimes:

- actions/checkout@v7
- actions/setup-node@v7

The project build itself remains on Node 22.

This removes the deprecated Node-action-runtime warnings that appeared in earlier builds.

## Phase boundary

Phase 36 is performance and scale hardening.

It deliberately does not:

- rewrite DrumEngine architecture
- change musical timing semantics
- introduce a second scheduler
- change generation algorithms
- optimize by deleting features
- hide performance regressions by increasing warning thresholds

The next phase is:

# Phase 37 — Architecture Consolidation & Product Simplification

Phase 37 will remove duplicate engines/wrappers/dead paths and consolidate state, transport, scheduling, Patterns, parameters, modulation, preview, rendering, workers, persistence, errors and UI before the final audit/certification sequence.

## Safety invariants

- Web Audio time remains the musical source of truth
- 30 Hz is visual publication only, not musical timing resolution
- Worker scheduler has a safe timer fallback
- Worker sample analysis has a synchronous fallback
- stale Worker results cannot replace the current sample
- lazy mode chunks remain precached for offline use
- project switching still clears every loaded transient workspace
- routine autosave never needs to rewrite unchanged sample bytes
- explicit saves remain available
- history pruning never removes protected lineage/favorites/root
- build budgets fail CI instead of hiding regressions
