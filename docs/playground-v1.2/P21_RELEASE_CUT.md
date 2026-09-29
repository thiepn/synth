# P21 — v1.2 Release Cut & Final Certification

## Scope

P21 is a release-engineering phase only. No creative feature, storage schema, audio engine, sequencer model or project format is added here.

## Frozen candidate

The v1.2 candidate consists of the completed P1–P20 product line with release identity advanced to `1.2.0`.

Release-blocking changes allowed in P21:

- version/release metadata corrections
- certification-gate corrections
- deployment/publisher safety fixes
- defects discovered by the final certification stack

Everything else is deferred beyond v1.2.

## Release invariants

- package, lockfile and visible UI all identify `1.2.0`
- ProjectDocument schema remains v1
- backup package format remains v1
- IndexedDB remains v2
- dependency ranges remain exactly pinned
- hard JS/CSS bundle budgets remain unchanged
- v1.0/v1.1 release documents remain historical evidence
- automatic GitHub Release publication requires successful current-main CI
- automatic Pages deployment requires successful current-main CI
- neither publisher nor deployer may act on a stale certified SHA

## Certification stack

1. `npm ci --no-audit --no-fund`
2. `npm run build`
3. `npm run qa:e2e:install`
4. `npm run qa:playground`
5. `npm run qa:adversarial`
6. `npm run qa:e2e`
7. `npm run qa:soak`

The pull-request candidate must pass this stack before merge. The merged release SHA must then pass the same CI stack on `main` before release publication or automatic Pages deployment.

## Publication

After successful merged-main CI:

- `.github/workflows/release.yml` verifies the certified SHA is still `main` HEAD
- the publisher verifies package version `1.2.0`
- the release-freeze contract is rerun
- an existing `v1.2.0` tag is resolved to its commit and rejected if it differs from the certified SHA
- GitHub Release `v1.2.0` is created or refreshed from the v1.2 release notes

## Deployment

`.github/workflows/pages.yml` is triggered from successful `CI`, checks out the certified SHA, verifies it is still current `main`, rebuilds under production contracts, then deploys the resulting Pages artifact.

## Exit

P21 is complete only after:

- candidate PR CI passes
- the release PR is merged
- merged-main CI passes
- GitHub Release/tag `v1.2.0` points to the certified release SHA
- GitHub Pages deployment succeeds for that certified line
- the deployed site responds successfully

After this exit, planned feature development stops. Further changes should come from actual use, observed defects or a deliberately scoped future release.