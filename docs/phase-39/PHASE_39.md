# Phase 39 — Release Candidate Certification, Soak Testing & Final Bug-Fix Freeze

Status: implemented.

## Release candidate

Phase 39 freezes the application as:

```
Synth 1.0.0-rc.1
```

No new product features are introduced.

The Phase 39 rule is:

> Only release-blocking fixes, certification infrastructure, dependency/schema/version freeze, and release documentation are allowed.

## Frozen dependency graph

Direct dependencies remain exactly pinned.

Phase 39 additionally commits:

```
package-lock.json
lockfileVersion: 3
```

CI and Pages builds now use:

```
npm ci --no-audit --no-fund
```

instead of re-resolving dependencies with `npm install`.

The temporary write-capable lockfile-generation CI path was removed after the lockfile was created.

Repository permissions returned to:

```
contents: read
```

for ordinary CI.

## Release-freeze contract

Every production build now runs:

```
npm run check:release
```

The contract requires:

- package version exactly `1.0.0-rc.1`
- package-lock v3
- package-lock version aligned with package.json
- exact direct dependency versions
- Project schema version remains 1
- ProjectDocument version alias remains present
- adversarial QA script remains present
- soak script remains present
- CI contains the Release-candidate soak gate
- Phase 38 certification evidence remains present

## Production QA freeze

Phase 38's 14 adversarial production-browser flows are not run once in the RC.

They are executed twice:

```
playwright test e2e/production.spec.ts
  --repeat-each=2
  --retries=0
```

This produces:

```
28 tests
0 retries
28 passed
48.4 s
```

The no-retry requirement is deliberate.

A transient failure is therefore visible instead of being hidden by retry success.

## Release-candidate soak

Phase 39 adds `e2e/soak.spec.ts`.

The soak suite is also repeated twice with zero retries.

Final certified evidence:

```
6 tests
0 retries
6 passed
25.0 s
```

### Soak 1 — repeated project lifecycle

Six save/reload cycles per execution:

- rename project
- explicit save
- named snapshot on alternating cycles
- switch CREATE / SEQUENCE / SOUND
- reload browser
- verify restored project identity
- capture runtime errors

This validates repeated hydration/autosave/version interaction rather than a single successful reload.

### Soak 2 — browser lifecycle freeze recovery

The browser:

1. starts transport
2. enters Chromium frozen lifecycle state
3. returns to active
4. repeatedly switches SEQUENCE / LIVE / CREATE
5. stops transport
6. starts transport again
7. verifies running state
8. stops cleanly

This exercises scheduler/transport recovery after lifecycle suspension without changing the Web Audio timing architecture.

### Soak 3 — sample churn + persistence + GC

Each execution:

1. imports six unique WAV assets
2. decodes all six
3. saves the project
4. verifies six persisted asset records
5. removes three samples
6. saves again
7. duplicates the project
8. deletes the duplicate
9. runs dependency-aware GC
10. verifies exactly three live asset records remain
11. verifies no project error surfaced

This combines sample caches, project manifests, duplicate-project dependencies, deletion, and garbage collection in one longer state cycle.

## Full RC CI sequence

The final Phase 39 candidate passes, in order:

1. `npm ci`
2. interaction contract
3. performance contract
4. architecture contract
5. release-freeze contract
6. TypeScript
7. Vite production build
8. bundle budget
9. Chromium install
10. 28 no-retry adversarial production tests
11. 6 no-retry soak tests

Failure evidence remains configured for Playwright traces/screenshots.

## Final bundle evidence

The certified RC build reports:

```
entry JS:   281.5 KB
largest JS: 281.5 KB
total JS:   781.8 KB across 19 chunks
total CSS:  168.1 KB
```

All Phase 36 bundle budgets pass.

## Schema freeze

Project persistence remains:

```
PROJECT_SCHEMA_VERSION = 1
```

No migration/schema feature work is introduced during the RC phase.

## Feature freeze

The following are explicitly frozen for Phase 39:

- musical generators
- Pattern domain semantics
- Drum/Sample/Hybrid playback semantics
- ARRANGE semantics
- LIVE performance semantics
- modulation/automation semantics
- Mix/Master semantics
- render/export semantics
- ProjectDocument v1
- backup package v1
- IndexedDB database version
- MIDI mapping semantics
- PWA cache/update architecture
- seven-mode product shell

Only a proven release blocker may change these.

## Release-blocking defects

The final locked RC head completed the strict QA + soak run with no release-blocking defect discovered.

Phase 38 defects remain covered by permanent production-browser regressions.

## External repository prerequisite

The code-side GitHub Pages workflow is complete and fail-safe.

If repository Pages has not been enabled yet, deployment is intentionally skipped with a notice.

The one-time repository setting remains:

```
Settings → Pages → Source → GitHub Actions
```

This is an external repository configuration prerequisite, not an application defect.

CI/build/installability remain green without it.

## Release checklist

See:

```
docs/phase-39/RELEASE_CHECKLIST.md
```

## Phase boundary

Phase 39 produces the frozen release candidate.

The next and final phase is:

# Phase 40 — v1.0.0 Production Release & Maintenance Baseline

Phase 40 may:

- promote `1.0.0-rc.1` to `1.0.0`
- run the exact frozen certification matrix
- update release documentation
- create the final Git tag/release
- establish the maintenance baseline

It may not reopen feature development.

## Safety invariants

- exact dependency graph is committed
- release builds use npm ci
- no retry masks production test failures
- production QA is repeated
- soak QA is repeated
- project schema is frozen
- architecture remains frozen
- no new feature work enters the RC
- only release blockers may change implementation code
