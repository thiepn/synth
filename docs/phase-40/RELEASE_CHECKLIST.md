# Synth v1.0.0 Production Release Checklist

## Frozen source

- [x] Phase 37 architecture freeze complete
- [x] Phase 38 adversarial QA complete
- [x] Phase 39 release-candidate soak complete
- [x] RC implementation head introduced no unresolved release blocker
- [x] Production promotion contains no feature work

## Version and dependency freeze

- [x] package.json version = 1.0.0
- [x] package-lock.json version = 1.0.0
- [x] package-lock lockfileVersion = 3
- [x] direct dependencies exactly pinned
- [x] CI uses npm ci
- [x] Pages build uses npm ci
- [x] Project schema remains v1
- [x] Backup format remains v1
- [x] IndexedDB database remains v2

## Production certification

The exact production-head run must confirm:

- [x] interaction contract passes
- [x] performance contract passes
- [x] architecture contract passes
- [x] v1.0.0 release-freeze contract passes
- [x] TypeScript passes
- [x] production Vite build passes
- [x] bundle budgets pass
- [x] 28/28 repeated adversarial Chromium executions pass
- [x] zero adversarial retries
- [x] 6/6 repeated soak executions pass
- [x] zero soak retries

## Certified release-PR evidence

- Production QA: **28 passed / 0 failed / 0 retries**
- Production QA time: **49.7 s**
- Soak QA: **6 passed / 0 failed / 0 retries**
- Soak QA time: **25.3 s**
- Entry JS: **281.5 KB**
- Total JS: **781.8 KB / 19 chunks**
- CSS: **168.1 KB**

## Publication

- [x] release notes committed
- [x] post-CI release workflow committed
- [x] release workflow is gated on successful CI for main
- [x] release publisher is idempotent
- [ ] release PR merged to main
- [ ] merged-main full CI succeeds
- [ ] Git tag v1.0.0 exists
- [ ] GitHub Release v1.0.0 exists
- [ ] release target SHA equals certified merged-main SHA

## Deployment

- [ ] Pages deployment succeeds for the release commit
- [ ] installed/offline PWA remains reachable after production release

## Maintenance baseline

- [x] patch/minor/schema discipline documented
- [x] permanent regression gates retained
- [x] release tag is created only after merged-main certification
