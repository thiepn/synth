# Synth

**Synth** is a local-first generative beat workstation built around one creative loop:

> Generate → Lock → Reroll → Mutate → Evolve → Arrange → Perform → Export

Synth is not intended to be a general-purpose DAW or a drum-practice application. Its job is to help a user reach interesting, coherent, original beats quickly while preserving enough control to shape the result deeply.

## Product pillars

1. **Good beats fast** — a useful musical result should appear within seconds.
2. **Assisted, not automatic-only** — generation creates material; the user decides what survives.
3. **Musical controls over engineering controls** — prefer “harder”, “sparser”, “funkier”, and spatial groove controls over exposing dozens of low-level parameters by default.
4. **Deterministic creativity** — every generated result is reproducible from versioned inputs and a seed.
5. **Local-first** — core creation, playback, saving, and export must not depend on a server.
6. **Instrument, not dashboard** — Synth uses the Pulse Architecture visual language and should feel like musical hardware in a browser.
7. **Deep when wanted** — manual sequencing and synthesis exist, but they are never prerequisites for making a good beat.

## Phase 0

Phase 0 freezes the product boundaries, architecture, domain contracts, visual language, and future interoperability rules before implementation begins.

See:

- [Product Constitution](docs/phase-0/PRODUCT_CONSTITUTION.md)
- [Technical Architecture](docs/phase-0/ARCHITECTURE.md)
- [Domain & Data Contracts](docs/phase-0/DATA_CONTRACTS.md)
- [Pulse Architecture](docs/phase-0/PULSE_ARCHITECTURE.md)
- [Steadybar Interoperability Contract](docs/phase-0/STEADYBAR_INTEROP.md)
- [Phase 0 Acceptance Gate](docs/phase-0/ACCEPTANCE.md)

## Planned top-level product modes

- **01 / CREATE** — generation, locking, rerolling, groove shaping, mutation.
- **02 / SEQUENCE** — detailed rhythm matrix and region editing.
- **03 / SOUND** — drum synthesis, kit generation, sound morphing.
- **04 / ARRANGE** — beat families, fills, transitions, energy sculpture.
- **05 / LIVE** — scene triggering and performance transformations.
- **06 / ARCHIVE** — projects, beats, kits, snapshots, and generation lineage.

## Architectural rule

The audio engine, generation engine, domain model, persistence, and export pipeline must remain independent of the React rendering layer. UI state may observe and command these systems; it must never become their source of truth.

---

Phase 0 status: **architecture frozen for implementation**.
