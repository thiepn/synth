# Phase 38 — Comprehensive Product Audit & Adversarial QA

Status: implemented.

## Purpose

Phase 37 froze Synth's product architecture.

Phase 38 treats that architecture as hostile input and audits the product through production-browser behavior rather than adding new creative features.

The rule for this phase is:

> A failing adversarial flow is a product defect until evidence proves otherwise.

No architecture rewrite is introduced unless a concrete blocking defect requires one.

## Production browser certification

Phase 38 adds Playwright against the actual Vite production build.

CI now performs:

~~~text
npm install
npm run build
playwright install Chromium
npm run qa:e2e
~~~

The browser suite runs with:

- production dist/
- Chromium
- Service Workers enabled
- downloads enabled
- Web Audio autoplay allowed for test automation
- one worker for deterministic local-state tests
- one CI retry
- retained trace + screenshot on failure

Failure evidence is uploaded as a GitHub Actions artifact for seven days.

## Final browser matrix

The certified Phase 38 head runs 14 tests.

### 1. Complete mode shell

Every implemented mode must lazy-load successfully:

1. CREATE
2. SEQUENCE
3. SOUND
4. ARRANGE
5. LIVE
6. MIX
7. EXPORT

The test also fails on browser pageerror or console error.

### 2. Keyboard navigation + transport

Validates:

- Skip to workspace
- mode-rail roving focus
- Arrow navigation
- Home / End mode navigation
- transport Play
- transport Pause
- transport Stop

### 3. Project persistence + version + backup

Validates:

- project rename
- explicit save
- named snapshot
- backup download
- browser reload restore
- backup import as a new project

### 4. Corrupt backup rejection

An invalid ZIP must:

- show a project error
- leave the active project unchanged
- not crash the app

### 5. Cross-tab revision conflict

Two tabs editing the same project must detect revision conflict.

The stale tab can:

- see CONFLICT
- see the newer remote revision state
- reload the newer revision
- return to a clean state

### 6. Named-version Pattern rollback

The browser suite:

1. captures a named version
2. changes a canonical Sequencer step
3. restores the named version
4. verifies the exact step state returns

This verifies version restore affects canonical musical state rather than only Library metadata.

### 7. Sample cache remove/re-import

The same content-addressed WAV is:

1. imported
2. decoded
3. removed
4. re-imported with the same hash
5. decoded again

The second decode must return to USE/ready state.

This guards decoded/reversed AudioContext cache eviction.

### 8. Corrupt IndexedDB fail-closed recovery

The active persisted ProjectDocument is deliberately mutated to an unsupported schema version.

After reload Synth must:

- keep rendering
- report SAVE ERROR
- expose the schema failure
- preserve an in-memory recovery session
- allow SAVE AS to create a valid replacement
- reload successfully from the replacement

### 9. Rapid mode/transport churn

With transport active, the suite repeatedly cycles across:

- ARRANGE
- CREATE
- LIVE
- MIX
- SEQUENCE
- EXPORT
- SOUND

It verifies final canonical mode state and zero runtime errors.

### 10. Conflict-preserving Save As

A stale tab:

1. creates a named version
2. receives a newer remote revision conflict
3. confirms version RESTORE is disabled during the unresolved conflict
4. edits canonical Pattern state locally
5. uses SAVE AS
6. reloads the local copy
7. verifies the local Pattern edit survived
8. verifies the remote writer project was not overwritten

### 11. Shared-asset GC

A decoded sample is saved in a project.

That project is duplicated, so both projects reference the same content-addressed audio record.

Deleting the duplicate must:

- complete without IndexedDB transaction errors
- remove the duplicate project
- retain the shared audio record for the active project

### 12. IndexedDB unavailable fallback

The browser starts with IndexedDB deliberately unavailable.

Synth must:

- remain usable
- render CREATE
- report SESSION ONLY
- expose LOCAL STORAGE UNAVAILABLE
- avoid a startup crash

### 13. True offline lazy-mode runtime

The test verifies every generated JS/CSS asset from asset-manifest.json exists in Cache Storage.

Then Chromium is switched offline before EXPORT has been visited.

Synth must:

- lazy-load EXPORT entirely from Service Worker cache
- produce zero runtime errors
- produce zero failed asset requests
- reload the whole app offline
- lazy-load another mode offline after reload

### 14. Mobile shell reachability

At 390×844 touch/mobile emulation:

- all seven modes remain visible
- project control remains visible
- transport remains visible
- document width does not exceed viewport width

## Defects found and fixed

Phase 38 found concrete product defects.

### Defect 1 — removed samples survived in AudioContext caches

Problem:

SampleAssetStore.remove() removed metadata/raw bytes but did not evict already decoded/reversed buffers from known AudioContexts.

Consequence:

Re-importing the same content-addressed sample could return a stale cached buffer without updating the new asset state to decoded/ready.

Fix:

SampleAssetStore now tracks known AudioContexts and evicts the removed asset from:

- decoded cache
- reversed cache
- decode-promise cache

Regression coverage:

sample cache is evicted when content-addressed audio is removed and reimported

### Defect 2 — asset garbage collection could outlive its IndexedDB transaction

Problem:

Garbage collection mixed asynchronous reads with a transaction whose lifetime could end before later operations.

Consequence:

Real browsers could produce TransactionInactiveError or incomplete cleanup.

Fix:

GC now uses explicit separate transactions:

1. read projects + versions
2. compute dependency set
3. read asset keys
4. open a fresh write transaction
5. delete only unreferenced keys

Corrupt dependency truth still fails safe and deletes nothing.

Regression coverage:

shared audio survives duplicate-project deletion and garbage collection

### Defect 3 — named-version restore was allowed during unresolved revision conflict

Problem:

A stale tab could attempt RESTORE while a newer project revision existed elsewhere.

Consequence:

Historical state could be applied on top of an unresolved multi-tab ownership conflict.

Fix:

Both layers now block it:

- ProjectStore rejects restore while status is CONFLICT
- Project Library disables RESTORE with an explanatory title

Regression coverage:

conflicted tab can preserve local Pattern work with Save As

### Defect 4 — offline lazy modules were cached but still failed to load

Observed evidence:

Cache diagnostics showed:

- current Service Worker controlled the page
- all generated assets existed in Cache Storage
- no asset was missing

But offline dynamic import still failed and React went blank.

Playwright trace showed Service Worker-side network fallback:

~~~text
MasterExportSurface-....js
net::ERR_INTERNET_DISCONNECTED
SampleLabStore-....js
net::ERR_INTERNET_DISCONNECTED
~~~

Root cause:

The Service Worker cached shell assets by URL string, while module requests arrived with request headers such as Origin.

The server response's Vary behavior made cache.match(request) miss even though caches.match(url) found the cached resource.

Fix:

Same-origin immutable app-shell requests now use URL-based Cache API lookup with ignoreVary: true for static/lazy assets and navigation fallback.

Regression coverage:

offline shell reloads and an unvisited lazy mode remains available

## Corruption / failure behavior verified

Phase 38 explicitly validates:

- invalid backup bytes
- unsupported ProjectDocument schema
- missing persistent storage capability
- revision conflicts
- offline network loss
- lazy-module network loss
- stale sample cache lifecycle
- project/version rollback behavior
- project delete + shared asset dependencies

## Static invariant sweep

The audit also checks repository/source invariants for:

- ambient randomness
- unsafe HTML injection
- local/session storage fallback paths
- direct network dependencies in core product logic

No indexed violations were found in the audited head.

Existing build contracts continue to enforce:

- interaction/accessibility architecture
- performance/bundle architecture
- consolidated ownership architecture

## CI evidence

The certified Phase 38 functional head reports:

~~~text
Running 14 tests using 1 worker
14 passed (26.6s)
~~~

The same workflow also passes:

- check:interaction
- check:performance
- check:architecture
- TypeScript
- Vite production build
- bundle budget

## What Phase 38 does not claim

Fourteen production-browser adversarial flows are meaningful coverage, not mathematical proof of absence of defects.

Phase 38 does not claim exhaustive certification across:

- every browser engine
- every physical MIDI controller
- every audio codec
- every mobile device
- multi-hour soak
- repeated suspend/resume cycles
- storage quota exhaustion
- hundreds of project migrations
- arbitrary operating-system interruptions

Those remaining release risks belong to the explicit RC/soak phase.

## Phase boundary

Phase 38 is the broad functional/adversarial audit.

The next phase is:

# Phase 39 — Release Candidate Certification, Soak Testing & Final Bug-Fix Freeze

Phase 39 should:

- stop feature work
- create the RC candidate
- run repeated production suites
- add long-session/visibility/suspend-resume soak
- exercise large project/history/sample state
- test repeated save/reload/version/backup cycles
- verify final PWA update/offline behavior
- fix only release-blocking defects
- freeze dependencies/version/schema
- produce final release checklist/evidence

## Safety invariants

- architecture remains frozen
- QA failures are investigated before tests are weakened
- regression fixes receive browser coverage when practical
- corruption fails closed
- revision conflicts never silently overwrite
- shared assets survive dependency-aware deletion
- offline lazy chunks are served from the correct current cache
- test artifacts are retained on CI failure