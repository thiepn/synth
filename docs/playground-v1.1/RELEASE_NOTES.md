# Synth v1.1.0

Synth v1.1.0 is the Playground release: a substantial usability and workflow update built on the certified v1.0.0 engine, persistence, Studio, rendering, PWA and project-format foundation.

The release keeps ProjectDocument schema v1, backup package v1 and IndexedDB v2. Existing v1.0 projects remain on the same persisted data contract.

## Headline change

The default Synth experience is now a focused musical Playground rather than exposing the complete Studio dashboard immediately.

The goal is:

> Tap → draw → hear → transform → remix → keep what works.

The seven-mode Studio remains available for advanced sequencing, synthesis, arrangement, performance, mixing and export.

## Playground Q1–Q8

### Q1 — Interaction speed

- vertical velocity dragging on active steps
- one-click lane clear and musical fills
- lane rotation shortcuts
- previous/next sound cycling
- tap tempo
- half/double tempo controls
- coalesced gesture Undo behavior

### Q2 — Experimentation safety

- persistent Pattern A/B banks
- current-pattern duplication into the alternate bank
- exact pre-Remix recovery
- recent Remix history
- automatic safety checkpoints before destructive transformations
- sound locks exposed in Playground
- A/B state stored through the existing project history model

### Q3 — Fast musical transformations

- selected-lane Remix
- density half/double
- reverse and rotate
- lane copy/paste
- Shift-drag Accent painting
- Alt-drag Ghost painting
- touch-visible Accent/Ghost state

### Q4 — Mobile & touch polish

- fixed safe-area-aware mobile action dock
- touch-safe tap / swipe / velocity gesture resolution
- 16-step page swiping
- long-press pad → sound picker
- mobile Draw / Accent / Ghost modes
- optional haptic feedback
- hardened coarse-pointer targets

### Q5 — Playback & creative flow

- optional one-bar count-in
- restart from step 1
- automatic long-pattern playhead page following
- manual page-lock behavior
- tempo-synchronized pad hold-repeat
- momentary lane mute/solo
- continuous editing while transport keeps running
- Space / Shift+Space / R transport shortcuts

### Q6 — Project & session flow

- fast New Beat
- Duplicate / Save As
- inline project naming
- visible autosave state
- recovery snapshots using the existing version system
- native Share with portable-backup download fallback
- recent-project switcher
- local project favorites
- per-project Playground UI resume state

### Q7 — Discoverability & everyday polish

- ? Help / shortcut overlay
- disappearing first-use guidance
- fine-pointer contextual tooltips
- right-click / long-press step actions
- sound favorites
- recent sounds
- useful empty-lane guidance
- deduplicated quieter notices

### Q8 — Final Playground QA & release polish

- Help modal focus trap and focus restoration
- modal scroll locking
- keyboard-operable step context menu
- narrow-mobile overflow hardening
- stale style cleanup
- safe native-share capability handling
- dedicated Q1–Q8 static release contracts
- focused Playwright Playground certification
- Playground QA wired into normal CI
- release-freeze protection for the v1.1 certification path

## Compatibility

v1.1.0 intentionally does not change:

- ProjectDocument schema: v1
- backup package format: v1
- IndexedDB database version: v2
- the canonical Pattern model
- the seven advanced Studio modes
- existing v1.0 local projects and backups

Playground-only preferences such as favorite sounds, favorite projects, discovery dismissal and per-project UI position use lightweight browser metadata rather than modifying the project schema.

## Release certification

A v1.1.0 GitHub Release may be published only from a successful merged-main CI run.

The required pipeline includes:

1. exact dependency installation from the lockfile
2. interaction contracts
3. Playground Q1–Q8 release contracts
4. performance contracts
5. architecture contracts
6. v1.1 release-freeze contract
7. TypeScript
8. production Vite build
9. bundle budget
10. focused Playground Playwright QA
11. full production browser QA
12. release-candidate soak

No browser-test result is claimed by this document before CI reports it.

## Local-first behavior

Core beat creation, playback, projects, snapshots, backups, offline use and export continue to work without a Synth backend service.

Imported sample bytes and project documents stay local to the browser unless the user explicitly shares or exports them.
