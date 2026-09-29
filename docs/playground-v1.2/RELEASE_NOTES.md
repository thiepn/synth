# Synth v1.2.0

Synth v1.2.0 is the completion and hardening release for the post-v1.1 Playground program. It turns the fast-editing Playground into a complete local-first path from first beat to finished song while preserving the deeper Studio for advanced work.

The release focus is not feature count. It is workflow continuity:

> Open Synth → make something → shape it → turn it into a song → perform/tweak it → export it.

v1.2.0 keeps the existing project/backup storage compatibility line and does not introduce a backend requirement.

## Headline changes

- a canonical Playground song timeline connected to Studio Arrange
- stronger melodic/drum presets and expressive synthesis
- simple per-track mix controls with live/offline parity
- one-surface Finish, rendering and export
- Feel/Groove and micro-variation controls
- live Jam and recovery checkpoints
- one-tap musical starter kits and song drafts
- Motion automation in the Playground workflow
- consolidated Playground controls and contextual Studio handoffs
- substantially better Arrange editing
- improved default generation/fill/transition musicality
- final phone/tablet ergonomics
- permanent adversarial product QA across project, recording, persistence and export boundaries

## P5 — Simple song timeline

The Playground gained a direct song-building layer on top of canonical arrangement state:

- Pattern A/B song material synchronization
- touch-safe section timeline
- atomic section insertion and undo/redo
- musical-boundary section queuing
- semantic section roles and stable labels
- shared arrangement ownership rather than a duplicate Playground-only song model

## P6 — Sound quality and instrument presets

Instrument quality and preset depth were upgraded substantially:

- expanded melodic instrument presets
- improved bass, chord and lead synthesis
- hybrid drum preset choices
- velocity-sensitive expression and stereo voicing
- matching realtime and offline-render behavior
- permanent sound-quality release contracts

## P7 — Simple mix controls

Playground mixing became direct and musical without exposing the full Studio mixer:

- selected-track level, pan and space
- drum and melodic mix parity
- sensible drum space defaults
- shared canonical mixer state
- monitoring/master safety hardening
- live and offline render parity

## P8 — Finish and export

Finishing a beat/song became a single focused workflow:

- dedicated Finish surface
- beat/song export targeting
- render analysis and clipping feedback
- prepared-share invalidation when the project changes
- cancellation safety when leaving Finish/Studio
- touch/mobile and accessibility certification

## P9 — Feel and Groove

Musical feel became a first-class Playground control:

- simple Feel presets
- clear straight-vs-swing semantics
- responsive Groove controls
- accessible labels and permanent regression coverage

## P10 — Micro variation

Fast human variation is available directly from steps and selections:

- quick micro-variation actions
- visible timing/dynamic feedback
- selection and single-step integration
- viewport-safe contextual actions

## P11 — Live Jam

Playground gained a compact live-performance layer:

- simple Jam controls
- performance lifecycle integration
- mobile reachability
- clean shutdown across project changes
- permanent live-Jam browser certification

## P12 — Recovery checkpoints

Project safety became accessible from the main workflow:

- explicit recovery checkpoints
- safe restore flow
- storage/recovery helpers
- Jam-safe recovery transitions
- dedicated recovery regression gate

## P13 — Musical starter kits

One action can establish a coherent musical starting point:

- deterministic starter definitions
- coordinated pattern, sound and mix application
- responsive starter chooser
- reproducible unlocked sound/mix baseline
- lock preservation

## P14 — One-tap song drafts

Playground can turn a beat into a useful song structure immediately:

- deterministic song-draft structures
- multiple draft choices
- one-tap canonical arrangement creation
- safe audio activation and playback handling

## P15 — Motion

Simple modulation/automation is now part of the core Playground path:

- compact Motion controls
- canonical applied-state ownership
- responsive UI
- stale-share/export invalidation when Motion changes the project
- permanent Motion certification

## P16 — Workflow and UI consolidation

P16 reduced feature fragmentation instead of adding another subsystem:

- one Creative Controls region
- contextual handoffs to Arrange, Sound/modulation and export
- safe Studio routing
- project/recovery alerts routed to the relevant advanced workspace
- cleanup of duplicate or detached controls

## P17 — Arrangement and song editing polish

Studio Arrange now works as the advanced editor for the same song built in Playground:

- Playground songs are preserved when entering Arrange
- song and section naming
- section role and pattern reassignment
- quick section insertion
- 1× / 2× / 4× / 8× section-length presets
- Play From Here
- responsive/mobile Arrange polish

## P18 — Musical quality audit

The generator and starter path were tuned for better default results:

- Beat Generator v3
- Beat Family Generator v3
- open/closed hi-hat exclusivity
- deterministic multi-bar phrase development
- fills carve breathing room rather than simply stacking
- cleaner transition endings
- stable starter sound/mix baselines
- narrow bass imaging retained for low-end stability

## P19 — Mobile and tablet final polish

Responsive behavior was certified as an instrument, not only as a shrinking desktop UI:

- compact Style + Tempo phone layout
- true 44×44 px bar/editor targets
- 64 px mobile export actions
- bottom performance dock through 900 px tablet widths
- 390×844, 768×1024 and 1024×768 breakpoint QA
- CSS consolidation without raising the production bundle budget

## P20 — Full adversarial product audit

P20 tested Synth across feature boundaries and fixed failures that isolated feature tests could miss:

- project switches clear transient edit/export state
- old-project session persistence is synchronously suspended during New/Open transitions
- restored drum selection explicitly restores the matching mixer lane
- New/Duplicate/Snapshot respect active-recording boundaries
- Studio/Finish navigation safely settles active or armed recording
- full starter → multibar → melodic → song → Motion → save/reload → WAV export workflow is permanently covered

A dedicated adversarial CI stage now runs in addition to the normal Playground, production-browser and soak suites.

## P21 — v1.2 release cut

P21 freezes the product for release:

- package, lockfile and visible product identity are synchronized to 1.2.0
- release-freeze contracts cover the complete P16–P21 hardening line
- the GitHub Release publisher targets v1.2.0 only after successful merged-main CI
- Pages deployment remains gated by a successful production build
- no new product subsystem is introduced in the release cut

## Compatibility

v1.2.0 preserves:

- ProjectDocument schema: v1
- backup package format: v1
- IndexedDB database version: v2
- existing v1.0/v1.1 local projects and backups
- the existing advanced Studio architecture
- local-first creation, playback, saving, recovery and export

P18 intentionally advances deterministic Beat Generator and Beat Family provenance to version 3 because identical seeds can now produce musically improved phrase/fill behavior. This does not change the ProjectDocument schema.

## Release certification

The release is gated in this order:

1. exact dependency installation from the lockfile
2. all P1–P21 static/architecture/release contracts
3. TypeScript
4. production Vite build
5. hard bundle budgets
6. full Playground browser QA
7. P20 adversarial product QA
8. full production browser QA
9. release-candidate soak
10. merged-main SHA verification
11. v1.2.0 tag/GitHub Release publication
12. GitHub Pages deployment and post-deploy verification

The publisher refuses to release a stale CI SHA and refuses an existing v1.2.0 tag that points at a different commit.

## Local-first behavior

Core music creation, editing, performance, projects, recovery, backups, offline/PWA use and rendering do not require a Synth backend service. Imported sample bytes and project documents remain local unless the user explicitly exports or shares them.