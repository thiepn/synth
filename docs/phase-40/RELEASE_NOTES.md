# Synth v1.0.0

Synth v1.0.0 is the first production release of the local-first generative beat workstation built around:

> Generate → Lock → Reroll → Mutate → Evolve → Arrange → Perform → Export

## Included

- deterministic beat generation across 25 Style DNA profiles
- lock-aware reroll, mutation, groove, morph, remix and controlled chaos
- 64-step polymetric sequencer with probability, ratchets, flams and microtiming
- eight-voice V2 drum synthesis plus local sample/hybrid voices
- coherent Kit generation and sound morphing
- Beat Families, fills and transitions
- ARRANGE timeline with Scene/Section generation and energy sculpture
- long-form EVOLVE and Song Architect generation
- LIVE performance macros, momentary actions, scenes and jam capture
- modulation/automation parameter routing
- production mixer, auto-mix and mastering
- deterministic offline rendering, WAV/stem export and internal resampling
- Sample Lab chopping and creative sampling
- MIDI pads, learn, recording and external control
- local ProjectDocument persistence, autosave, named versions and verified backups
- installable/offline PWA
- keyboard/mobile/contrast accessibility hardening
- startup/runtime performance hardening
- architecture consolidation and adversarial browser QA

## Release certification baseline

The frozen v1.0.0 release is required to pass:

- all static interaction/performance/architecture/release contracts
- TypeScript
- production Vite build
- bundle budgets
- 28 repeated adversarial production-browser executions
- 6 repeated soak executions
- zero Playwright retries

## Data formats

- ProjectDocument schema: v1
- Backup package: v1
- IndexedDB database: v2

## Local-first behavior

Core creation, playback, saving, backup, offline use and export do not require a Synth backend service.

Imported sample bytes and project documents remain local to the browser unless the user explicitly exports a backup or audio file.

## Repository

This GitHub Release is produced automatically only after the v1.0.0 commit has passed the full merged-main CI matrix.
