# Synth v1.0 Release Checklist

## Automated certification

- [x] Product architecture frozen after Phase 37
- [x] Comprehensive adversarial audit completed in Phase 38
- [x] Package version frozen at 1.0.0-rc.1
- [x] Direct dependency versions exactly pinned
- [x] package-lock.json committed
- [x] package-lock v3 aligned with package version
- [x] CI uses npm ci
- [x] Pages build uses npm ci
- [x] Project schema frozen at v1
- [x] Interaction contract passes
- [x] Performance contract passes
- [x] Architecture contract passes
- [x] Release-freeze contract passes
- [x] TypeScript passes
- [x] Production Vite build passes
- [x] Bundle budgets pass
- [x] 28/28 repeated adversarial Chromium executions pass
- [x] Production browser retries disabled
- [x] 6/6 repeated soak executions pass
- [x] Soak retries disabled
- [x] Offline unvisited lazy-mode loading passes
- [x] Offline full reload passes
- [x] Cross-tab conflict paths pass
- [x] Conflict-preserving Save As passes
- [x] Corrupt backup rejection passes
- [x] Corrupt ProjectDocument recovery passes
- [x] Shared-asset GC passes
- [x] Repeated sample churn/GC soak passes
- [x] Browser lifecycle freeze recovery passes
- [x] Mobile shell overflow/reachability passes
- [x] Playwright failure artifacts configured

## Frozen release values

- Candidate: `1.0.0-rc.1`
- Project schema: `1`
- Backup package format: `1`
- IndexedDB database version: `2`
- Node build runtime: `22`
- React: `19.3.0`
- React DOM: `19.3.0`
- TypeScript: `7.0.2`
- Vite: `8.3.0`
- Playwright: `1.63.0`

## Final RC evidence

- Production QA: **28 passed / 0 failed / 0 retries**
- Production QA time: **48.4 s**
- Soak QA: **6 passed / 0 failed / 0 retries**
- Soak QA time: **25.0 s**
- Entry JS: **281.5 KB**
- Total JS: **781.8 KB / 19 chunks**
- CSS: **168.1 KB**

## One-time external setup

- [ ] If not already configured: GitHub repository **Settings → Pages → Source → GitHub Actions**

The Pages workflow is intentionally fail-safe until this repository setting is enabled.

## Phase 40 promotion

Before tagging v1.0.0:

- [ ] Change package/package-lock version to 1.0.0
- [ ] Update release-freeze contract for production version
- [ ] Run the exact frozen certification matrix again
- [ ] Confirm no release-blocking changes since RC
- [ ] Update README/release notes
- [ ] Create v1.0.0 tag/release
- [ ] Record maintenance baseline
