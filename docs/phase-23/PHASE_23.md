# Phase 23 — Performance Engine, Live Macros & Jam Capture

Status: implemented.

## What shipped

### LIVE mode
- replaces the previous LIVE placeholder with a functional performance surface
- shares the existing Web Audio transport and DrumEngine
- does not create a second Pattern, scheduler, or audio engine
- temporary performance state disappears when LIVE is exited

### Quantized section launching
- ARRANGE sections become playable Scene-style launch pads
- launching during arrangement playback queues the new section at the next bar boundary
- queued and active section state are visible
- launching with no active arrangement playback starts from the selected section
- section launch actions can be captured in a Performance Take

### Performance macros
- Energy
- Density
- Filter
- Space
- Drive
- Morph
- Chaos
- touch/pointer XY control for Chaos × Energy
- reset-to-neutral performance state

Macros are transient runtime controls. They do not rewrite canonical Pattern data or create Sequencer Undo entries.

### Momentary actions
- Fill
- Drop
- Break
- Build
- Repeat
- Stutter
- beat-quantized press/release windows
- keyboard shortcuts for common actions
- pointer capture for reliable touch/mouse hold behavior

### Track performance mutes
- independent temporary mutes for all eight drum lanes
- do not modify canonical lane mute flags
- apply to generated performance fills as well as source hits

### Creative engine composition
- LIVE Morph reuses the existing Phase 21 Beat Morph workspace
- LIVE Chaos reuses the Phase 22 Chaos configuration
- Chaos is evaluated after Morph
- Pattern transport and arrangement transport both use the same performance overlay contract
- Phase 22 Chaos now defaults to 0% so opening Synth cannot unexpectedly alter playback

### Audio-path performance processing
- transient density filtering
- energy-dependent velocity scaling
- build hi-hat augmentation
- phrase-end fill augmentation
- repeat/stutter hit reuse
- runtime low-pass Filter macro
- Space macro extends the existing room send
- Drive macro extends the existing master drive stage
- normal Pattern edits remain authoritative beneath the overlay

### Jam capture
- Record Take / Stop Take
- captures macro movement
- captures momentary actions
- captures fills
- captures lane performance mutes
- captures section launches
- coalesces dense nearby macro changes
- bounded session take history
- exiting LIVE cancels an active recording instead of leaving a hidden recorder running

Performance Takes are deliberately session-local in Phase 23. Later automation/persistence phases can convert them into durable Arrangement automation without forcing Phase 23 to invent a second automation format.

## State hierarchy

```
canonical Pattern / Arrangement
        ↓
Morph preview (optional)
        ↓
Chaos preview (optional)
        ↓
Performance hit resolver
        ↓
temporary mutes / fills / repeat / macros
        ↓
DrumEngine
```

The canonical musical document remains unchanged until an explicit existing creative commit operation is used.

## Quantization

Momentary performance windows use beat boundaries.

Section launches use bar boundaries.

Fill requests target the final beat before the next eligible bar boundary.

This keeps fast interaction musically safe without adding a second transport clock.

## Safety invariants

- leaving LIVE clears transient momentary state and performance mutes
- leaving LIVE stops active Performance Take recording
- performance overlays do not enter Sequencer Undo
- performance overlays do not mutate saved Pattern lane mutes
- generated Fill/Build hits respect temporary track mutes
- Drop protection also applies to generated fill material
- section jumps reuse ArrangementPlaybackStore and Web Audio scheduler invalidation
- Morph/Chaos reuse their existing deterministic engines
