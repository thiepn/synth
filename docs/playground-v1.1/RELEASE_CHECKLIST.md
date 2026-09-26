# Synth v1.1.0 — Playground Release Checklist

This checklist certifies the post-v1.0 Playground release line without rewriting the historical Phase-40 v1.0.0 evidence.

## Identity

- [x] package version is `1.1.0`
- [x] package-lock root version matches `1.1.0`
- [x] visible Studio version marker is `v1.1.0`
- [x] README identifies Synth v1.1.0
- [x] v1.0.0 Phase-40 documents remain unchanged historical evidence

## Compatibility

- [x] ProjectDocument schema remains v1
- [x] backup package remains v1
- [x] IndexedDB remains v2
- [x] Q1–Q8 metadata additions do not require a project migration
- [x] existing v1.0 projects continue through the same restore path

## Q1–Q8 product freeze

- [x] Q1 interaction speed
- [x] Q2 experimentation safety
- [x] Q3 fast musical transformations
- [x] Q4 mobile & touch polish
- [x] Q5 playback & creative flow
- [x] Q6 project & session flow
- [x] Q7 discoverability & everyday polish
- [x] Q8 final Playground QA & release polish

After this checklist, Playground implementation is feature-frozen for v1.1.0. Only release-blocking defects may change before publication.

## Required static certification

Run:

```bash
npm ci --no-audit --no-fund
npm run check:interaction
npm run check:playground
npm run check:performance
npm run check:architecture
npm run check:release
npx tsc --noEmit
npm run build
```

The normal `npm run build` already executes the contract checks before TypeScript and Vite, then the bundle budget runs as postbuild.

## Required browser certification

Run:

```bash
npm run qa:e2e:install
npm run qa:playground
npm run qa:e2e
npm run qa:soak
```

The focused Playground suite must cover Q1–Q8 interaction-critical behavior in addition to the existing full-product production/soak suites.

## CI / publication gate

The merged-main CI sequence must include:

```
Production build
→ Playground release QA
→ Production browser QA
→ Release-candidate soak
```

The release publisher must:

- run only after successful `CI` completion on `main`
- verify package version `1.1.0`
- re-run the release-freeze contract
- publish tag `v1.1.0`
- use `docs/playground-v1.1/RELEASE_NOTES.md`
- remain idempotent if the release already exists

## Evidence rule

Do not record Playwright/build pass counts here until the actual CI run is available. Source-level contract checks are not a substitute for an executed production build and browser suite.
