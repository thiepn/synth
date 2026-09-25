# Phase 40 — v1.0.0 Production Release & Maintenance Baseline

Status: production promotion certified on the release PR.

## Purpose

Phase 40 promotes the frozen Phase 39 release candidate to the first production release:

```
Synth v1.0.0
```

No product implementation feature is added in this phase.

The rule is:

> The exact frozen release candidate is promoted only after the production version itself passes the same certification matrix.

## Promotion changes

Allowed changes from the certified `1.0.0-rc.1` head are limited to:

- package version: `1.0.0`
- package-lock root version: `1.0.0`
- production release-freeze expectations
- Phase 40 release documentation
- README / shell release marker
- post-CI tag/release publishing workflow

No musical, persistence, rendering, MIDI, PWA, interaction, or architecture behavior is reopened.

## Frozen production values

```
package version:       1.0.0
Project schema:        1
backup package:        1
IndexedDB version:     2
Node build runtime:    22
React:                 19.3.0
React DOM:             19.3.0
TypeScript:            7.0.2
Vite:                  8.3.0
Playwright:            1.63.0
```

Direct dependencies remain exactly pinned by `package-lock.json`.

## Required final certification

The production promotion must pass the exact Phase 39 matrix:

1. `npm ci`
2. interaction contract
3. performance contract
4. architecture contract
5. production release-freeze contract
6. TypeScript
7. Vite production build
8. bundle budget
9. Chromium install
10. production adversarial QA repeated twice with zero retries
11. release soak suite repeated twice with zero retries

Expected browser execution counts:

```
Production QA: 28 executions
Soak QA:        6 executions
Retries:        0
```

## Publish order

Production publication is deliberately ordered:

```
release/v1.0.0 PR
        ↓
full CI certification
        ↓
merge to main
        ↓
full CI certification on merged main
        ↓
Publish v1.0.0 workflow
        ↓
v1.0.0 Git tag + GitHub Release
```

The release workflow listens to successful `CI` workflow completion on `main`.

It does not publish from a pull request or a failing/uncertified commit.

## Idempotent release publication

If `v1.0.0` already exists, the release workflow exits successfully without creating a duplicate release.

This makes re-running the workflow safe.

## GitHub Pages

Pages deployment remains independent from release tagging.

The repository already reports Pages enabled. The existing Pages workflow continues to:

- build from `main`
- use `npm ci`
- deploy only when Pages is enabled

The PWA install/update contract therefore continues unchanged at release.

## Maintenance baseline

After v1.0.0, maintenance work should follow this baseline:

### Patch releases

`1.0.x` is appropriate for:

- release-blocking bug fixes
- security fixes
- data-loss/corruption fixes
- browser/runtime compatibility fixes
- narrowly scoped accessibility regressions
- narrowly scoped performance regressions

### Minor releases

`1.x.0` may contain backward-compatible product improvements after the Phase 40 freeze is explicitly lifted.

### Schema discipline

ProjectDocument schema changes require:

- explicit schema-version change
- migration path
- backward-compatibility test coverage
- backup/import compatibility review

No silent reinterpretation of ProjectDocument v1 is allowed.

### Regression discipline

Permanent v1 maintenance gates remain:

- interaction contracts
- performance contracts
- architecture contracts
- release-freeze/version contract as applicable
- production Playwright QA
- soak coverage for lifecycle/data changes

## Release evidence

Phase 39 RC evidence remains the baseline immediately before promotion:

```
Production QA: 28 passed / 0 failed / 0 retries
Soak QA:        6 passed / 0 failed / 0 retries
Entry JS:       281.5 KB
Total JS:       781.8 KB / 19 chunks
CSS:            168.1 KB
```

The production v1.0.0 release-PR head passed the frozen matrix:

```
Production QA: 28 passed / 0 failed / 0 retries
Production QA time: 49.7 s
Soak QA: 6 passed / 0 failed / 0 retries
Soak QA time: 25.3 s
Entry JS: 281.5 KB
Largest JS: 281.5 KB
Total JS: 781.8 KB / 19 chunks
CSS: 168.1 KB
```

This evidence is from the production package version itself, not from the preceding RC version.

The exact documentation-complete head is recertified before merge. After merge, the same CI workflow runs on `main`; only that successful merged-main run can trigger the tag/GitHub Release publisher.

## Phase boundary

Phase 40 is the final planned implementation phase for Synth v1.

After the production tag/release is created:

- the 40-phase implementation roadmap is complete
- feature development is no longer part of the v1.0.0 release task
- subsequent work begins from the maintenance baseline above

## Safety invariants

- no feature work enters the production promotion
- package/package-lock versions agree exactly
- dependencies stay locked
- Project schema stays v1
- no retry masks browser failures
- the production version is tested, not merely the RC version
- the tag/release is created only after merged-main CI succeeds
- release publication is idempotent
- release notes come from the certified repository commit
