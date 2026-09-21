# Phase 0 — Acceptance Gate

Phase 0 is complete only when every item below is true.

## Product

- [x] Synth has one primary product promise.
- [x] Core creative loop is defined.
- [x] 1.0 scope is explicitly bounded.
- [x] DAW/practice/social scope creep is explicitly rejected.
- [x] Steadybar relationship is defined without implementing integration.

## Domain

- [x] canonical timing unit selected
- [x] PPQ selected
- [x] stable entity IDs required
- [x] project schema is versioned
- [x] rhythm lanes are decoupled from concrete sounds through kit slots
- [x] projects support multiple kits with one active kit
- [x] generation provenance is modeled
- [x] generation locks are domain state
- [x] style blending is possible in the domain model
- [x] history supports branching across typed creative artifacts

## Generation

- [x] deterministic seed contract defined
- [x] generator versions required
- [x] production generation may not use ambient Math.random()
- [x] derived results retain parent lineage
- [x] locked data must survive mutation unchanged

## Audio

- [x] Web Audio clock owns playback timing
- [x] React render timing is explicitly excluded from audio scheduling
- [x] offline rendering is architecturally possible
- [x] audio state is separated from serialized project state

## Persistence

- [x] local-first persistence is required
- [x] schema migrations are required
- [x] binary assets use stable asset IDs
- [x] invalid imports are validated before activation

## UI/UX

- [x] Pulse Architecture is named and defined
- [x] signature primitives are frozen
- [x] color semantics are defined
- [x] motion semantics are defined
- [x] banned generic UI defaults are documented
- [x] desktop/mobile/tablet are not assumed to share one compressed layout
- [x] musical information-as-interface rule is explicit

## Engineering

- [x] module boundaries are defined
- [x] dependency direction is defined
- [x] domain layer is framework-independent
- [x] generation layer is testable without audio/UI
- [x] visual derivations can be tested deterministically
- [x] architecture change triggers are documented

## Result

**Status: PASS**

Phase 1 may begin without reopening product scope or core architecture unless a concrete implementation constraint proves one of these decisions invalid.
