# Synth v1.2.0 — Release Checklist

This checklist certifies the P5–P21 hardening line while preserving v1.0.0 and v1.1.0 documents as historical evidence.

## Identity

- [x] package version is `1.2.0`
- [x] package-lock root/package version matches `1.2.0`
- [x] visible Studio version marker is `v1.2.0`
- [x] README identifies Synth v1.2.0
- [x] v1.0/v1.1 release evidence remains unchanged

## Compatibility freeze

- [x] ProjectDocument schema remains v1
- [x] backup package format remains v1
- [x] IndexedDB remains v2
- [x] existing project restore/migration path remains in place
- [x] P16–P20 introduce no new project-schema version
- [x] Beat/Beat Family deterministic provenance changes are versioned rather than silently changing v2 behavior

## Product freeze

- [x] P16 Workflow & UI Consolidation complete
- [x] P17 Arrangement & Song Editing Polish complete
- [x] P18 Musical Quality Audit & Improvement complete
- [x] P19 Mobile & Tablet Final Polish complete
- [x] P20 Full Adversarial Product Audit complete
- [x] P21 contains release/certification work only; no new creative subsystem

After this point, v1.2.0 accepts only release-blocking fixes.

## Required static certification

```bash
npm ci --no-audit --no-fund
npm run build
```

`npm run build` must execute all interaction, Playground, P6–P20 feature, performance, architecture, P21 release-freeze, TypeScript and Vite checks, followed by the hard bundle budget.

## Required browser certification

```bash
npm run qa:e2e:install
npm run qa:playground
npm run qa:adversarial
npm run qa:e2e
npm run qa:soak
```

All suites run with retries disabled where defined. A rerun may diagnose infrastructure/test flakiness, but the release candidate must ultimately pass unchanged.

## CI sequence

```text
Production build
→ Playground release QA
→ P20 adversarial product QA
→ Production browser QA
→ Release-candidate soak
```

## Publisher requirements

The v1.2 publisher must:

- run only after successful CI on `main`
- check out the exact certified CI SHA
- verify that SHA is still current `main` HEAD
- verify package version `1.2.0`
- rerun the release-freeze contract
- refuse an existing `v1.2.0` tag pointing to a different SHA
- create/update GitHub Release `v1.2.0` using `docs/playground-v1.2/RELEASE_NOTES.md`
- remain idempotent when the correct release already exists

## Deployment requirements

GitHub Pages must build from the same merged release source through `.github/workflows/pages.yml`. Deployment must not bypass the production build.

Post-deploy verification must confirm:

- the deployed page loads
- the production bundle is served from the release commit deployment
- the PWA manifest/service worker assets remain reachable
- no release-blocking deployment error is present

## Evidence rule

Do not hard-code final P21 pass counts into this checklist before the actual merged-main certification run. GitHub Actions and the resulting release/tag are the authoritative evidence for the released SHA.