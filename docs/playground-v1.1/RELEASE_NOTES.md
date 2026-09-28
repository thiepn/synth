# Synth v1.1.0

Synth v1.1.0 is the Playground release: a major usability, composition and performance update built on the certified v1.0.0 engine, local-first persistence, Studio, rendering and PWA foundation.

The release keeps ProjectDocument schema v1, backup package v1 and IndexedDB v2. Existing v1.0 projects and backups remain loadable. The Pattern contract is extended backward-compatibly with optional melodic/harmonic fields and automatic migration of older patterns.

## Headline change

The default experience is now a focused musical Playground:

> Tap → draw → perform → select → arrange → add melody → export.

The seven-mode Studio remains available for advanced synthesis, sequencing, arrangement, performance, mixing and export.

## Playground Q1–Q8 foundation

The original Playground program delivered:

- faster step editing, velocity gestures, fills, rotate/reverse and sound cycling
- persistent Pattern A/B banks, Remix safety checkpoints and recent Remix history
- Accent/Ghost painting and lane-level transformations
- safe-area-aware mobile controls, page swiping, long-press sound choice and haptics
- count-in, restart, playhead following, repeat pads and momentary monitoring
- fast New Beat, Duplicate/Save As, recovery versions, project switching and sharing
- Help/shortcut discovery, contextual step actions and sound favorites/recents
- accessibility, modal/focus hardening, release contracts, browser QA and release-freeze protection

## P1 — Multi-track and bar editing

The drum sequencer was rebuilt around whole-pattern editing:

- all drum tracks visible together
- one-click note add/remove without switching instruments
- natural 1–8 bar patterns instead of a fixed 16-step mental model
- Add, Delete, Duplicate and Clear bar actions
- bar navigation integrated directly into the main editor
- half-, quarter-, eighth- and sixteenth-note fills scoped to the current bar
- pattern lengths supported up to 128 steps
- bar insertion/deletion shifts later musical material while preserving event metadata

## P2 — Fast performance → grid recording

Performance can now be captured directly into the visible grid:

- on-screen pads, computer drum keys and MIDI feed one canonical recorder
- Overdub and Erase modes
- Off / 1/16 / 1/8 / 1/4 quantize
- selected-bar recording start
- one-bar count-in integration
- live recorded-cell feedback
- one complete take = one Undo/Redo unit
- direct MIDI enablement from Playground
- Shift+R recording shortcut
- recording isolation prevents conflicting pattern/history mutations during a take

## P3 — Selection and batch editing

The grid now has a first-class note selection layer:

- Shift-click individual selection
- Ctrl/Cmd-drag region selection
- mobile Select mode
- Bar / Track / All scopes
- Delete, Duplicate and Move
- velocity changes
- Ghost / Normal / Accent batch dynamics
- timing Earlier / Later
- metadata-preserving Copy/Paste between bars
- keyboard shortcuts for the full batch workflow
- atomic lock handling and stale-selection cleanup

## P4 — Melodic tracks and note-length editing

Synth now supports first-class pitched material alongside drums:

- three canonical melodic lanes: BASS, CHORDS and LEAD
- optional MIDI pitch and chord-pitch data on melodic events
- sustained note durations
- compact piano-roll editor inside Playground
- click-to-create melodic notes
- drag note edges to resize duration
- 1/16, 1/8, 1/4, 1/2 and 1-bar duration presets
- octave navigation
- persistent key, scale and Scale Lock
- Major, Minor, 7, m7, sus2 and sus4 chord shapes
- bass/lead monophonic flow with automatic overlap truncation
- chord voicing preservation across key/scale changes
- per-track melodic presets for bass, chords and lead
- melodic Mute/Solo
- live MIDI note-on/note-off recording with held durations and velocity
- one melodic MIDI take = one Undo unit
- drum fallback notes are suppressed while melodic MIDI capture owns the controller
- live melodic voices route through Synth's master audio path
- melodic notes survive drum Style/Remix generation
- melodic material is included in master offline rendering/export

## Audio, sound-bank and persistence hardening

The release also includes:

- curated CC0 TR-808 samples as built-in Playground sound choices
- build-time sample download pinned to a specific upstream commit with verification
- documented third-party audio provenance
- PWA precaching of bundled sample files
- safe bundled/user asset identity handling
- persistence of only referenced bundled audio
- orphaned bundled-audio garbage collection without deleting user audio
- historical-version protection for referenced bundled samples
- more natural tom/percussion synthesis and default materials
- melodic-pattern migration for older projects/history snapshots
- master-render parity for new melodic tracks

## Compatibility

v1.1.0 keeps:

- ProjectDocument schema: v1
- backup package format: v1
- IndexedDB database version: v2
- the seven advanced Studio modes
- existing v1.0 local projects and backups

The canonical Pattern model is extended, not replaced. New optional fields include harmonic context, melodic pitch/chord data and melodic instrument preset data. Older stored patterns are upgraded in memory by adding empty melodic lanes and safe default harmonic context, so old projects continue to load without a schema-version migration.

Playground-only preferences continue to use lightweight browser metadata rather than changing the ProjectDocument schema.

## Release certification

The published release is gated by merged-main CI:

1. exact dependency installation from the lockfile
2. interaction contracts
3. Playground release contracts
4. performance contracts
5. architecture contracts
6. release-freeze contract
7. TypeScript
8. production Vite build
9. bundle budget
10. focused Playground Playwright QA
11. full production browser QA
12. release-candidate soak

The certified P4 product head passed all of these gates, including 26/26 Playground tests, 38/38 production-browser tests and 6/6 soak tests.

## Local-first behavior

Core creation, playback, melodic editing, projects, snapshots, backups, offline use and export continue to work without a Synth backend service.

Imported sample bytes and project documents stay local to the browser unless the user explicitly shares or exports them.
