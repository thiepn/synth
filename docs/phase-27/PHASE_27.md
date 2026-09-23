# Phase 27 — Mix Architect, Auto-Mix & Production Engine

Status: implemented.

## What shipped

### Real eight-channel mixer
Each drum voice now has an actual Web Audio channel strip:

```
voice
↓
3-band EQ
↓
saturation
↓
compression
↓
pan
↓
fader
↓
sidechain duck
├── dry master bus
└── reverb send
```

Supported per-channel controls:
- Gain
- Pan
- Low / Mid / High EQ
- Compression
- Saturation
- Reverb Send
- Kick-triggered Sidechain amount
- Mute
- Solo

The mixer sits in the real audio graph. It is not a post-hoc UI simulation.

### Real metering
- one analyser per drum channel
- one master analyser
- bounded reusable meter buffers
- measured channel/master RMS-style activity
- meter data is runtime-only and never persisted as musical state

### Mix Architect
Directions:
- Balanced
- Punchy
- Wide
- Spacious
- Raw

The planner uses:
- current Pattern density
- current V2 drum-material specs
- current mix state
- selected direction/intensity
- deterministic seeded decisions
- ARRANGE section energy when available

Generated plans include:
- channel balance
- stereo placement
- EQ shaping
- compression
- saturation
- reverb sends
- sidechain amounts
- master headroom
- optional section-aware automation
- warnings and factual mix metrics

### Lock-aware generation
Each channel can be locked against Mix Architect.

Master gain can be locked independently.

Locks affect auto-mix only. Manual editing remains available after preview is committed/cancelled.

### Non-destructive A/B
Mix Architect generates a candidate without immediately changing the canonical mixer.

A / ORIGINAL and B / MIXED switch the live graph between:
- current committed mix
- generated candidate

B is preview-level-matched to A using a deterministic loudness proxy.

The level-match offset exists only during comparison. It is not committed, so real mix headroom is preserved.

### Commit / cancel
- COMMIT MIX makes the candidate canonical
- generated mixer automation is promoted to the existing modulation/automation system
- CANCEL leaves the current mix unchanged
- commit is one MixerStore history step
- manual mixer changes support bounded Undo/Redo
- preview is cleared automatically when manual state is changed

### Section-aware production automation
When an ARRANGE blueprint exists, Mix Architect can create automation for:
- support/cymbal channel gain across section energy
- ambience/reverb-send movement across sections

MIX mode automatically uses full ARRANGE transport when an arrangement exists so this automation is auditioned in actual song context.

### Modulation integration
Phase 24's parameter registry now exposes mixer parameters:
- channel gain
- pan
- three EQ bands
- compression
- saturation
- reverb send
- sidechain
- mixer master gain

All mixer parameters therefore use the same automation/modulation evaluation infrastructure rather than a second automation engine.

## Mix resolution order

```
committed MixerState
      ↓
Mix Architect candidate (preview only)
      ↓
mixer automation
      ↓
Phase 24 modulation routes
      ↓
mute / solo resolution
      ↓
Web Audio channel graph
      ↓
preview-only A/B level compensation
      ↓
master graph
```

## Sidechain

Kick hits trigger bounded gain ducking on non-kick channel duck nodes.

Each target channel controls its own duck amount.

Sidechain timing is scheduled from the same Web Audio transport pulse that schedules the kick; no UI timer participates.

## Product boundary

Phase 27 is mixing, not mastering.

It intentionally does not:
- chase final loudness
- add final master tonal processing
- export files
- normalize finished audio
- duplicate the Phase 28 render/master path

The committed mix leaves deliberate headroom for the next production phase.

## Safety invariants

- Mix Architect preview does not mutate canonical mixer state
- A/B compensation is preview-only
- locked channels are copied unchanged into generated plans
- locked channels receive no generated section automation
- master lock preserves master gain
- manual edits invalidate stale previews
- mixer Undo/Redo restores mixer-generated automation with state
- meter data is runtime-only
- mixer nodes are reused instead of rebuilt for ordinary parameter changes
- no ambient random source is introduced
