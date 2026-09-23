# Phase 25 — EVOLVE: Long-Form Beat Development Engine

Status: implemented.

## What shipped

### Deterministic long-form planning
- 4 / 8 / 16 / 32 / 64-bar evolution plans
- Stable per-plan seed
- Stable per-bar derived seeds
- Steady / Rise / Wave / Contrast energy arcs
- Global Evolution intensity
- Deterministic return points and phrase-end fills
- Explicit anchor / variation / build / breakdown / drop / fill / return roles

### Existing-engine reuse
EVOLVE does not invent a parallel mutation language.

It reuses:
- Beat Family generation for coherent section vocabulary
- Beat Variation / reroll for bounded per-bar novelty
- Style DNA and current Beat Generation intent
- existing Pattern locks and region locks
- existing validation and provenance systems

### Identity preservation
EVOLVE avoids cumulative mutation drift.

Each bar is derived from a coherent family role rather than repeatedly mutating the previous bar.

Returns periodically re-anchor the sequence to the core Pattern family.

### Non-destructive preview
- Full-plan preview uses the normal AudioTransport
- DrumEngine resolves the current Evolution segment from absolute transport tick
- EVOLVE preview loops by total plan length
- no second transport
- no second final song timeline
- disabling preview immediately returns playback to normal Sequencer state
- leaving CREATE disables Evolution preview

### Segment workflow
- bar strip with energy visualization
- playing-bar indicator
- selected segment detail
- Rhythm Glyph inspection
- Energy / Novelty / Quality / changed-step diagnostics
- stopped audition of selected bar
- USE THIS BAR commits the selected ordinary Pattern
- commit is one Sequencer Undo/history action using the `evolve` operation
- USE SOURCE FAMILY promotes EVOLVE's coherent Beat Family into the existing BeatFamilyStore

### Provenance
Every generated EVOLVE Pattern records:
- EVOLVE engine/version
- source Pattern ID
- stable segment seed
- arc
- segment index
- novelty amount
- inherited Style DNA / intent

## Architecture

```
current Pattern
      ↓
Beat Family Generator
      ↓
coherent role vocabulary
      ↓
per-bar deterministic role selection
      ↓
bounded Beat Variation
      ↓
EvolutionPlan
      ├── 4–64 ordinary Patterns
      ├── energy arc
      ├── novelty budget
      └── segment roles
      ↓
non-destructive transport preview
```

The final plan is not stored as an alternative ARRANGE timeline. Phase 26 can consume this plan as source material while ARRANGE remains the eventual committed song timeline.

## Preview resolution

During normal non-ARRANGE playback:

```
AudioTransport.absoluteTick
      ↓
EvolutionStore.resolveAtTick()
      ↓
current Evolution segment Pattern
      ↓
existing Pattern playback evaluator
      ↓
DrumEngine
```

ARRANGE playback remains authoritative whenever it is engaged.

## Safety invariants

- source Pattern is never modified by generation
- locked source material remains protected by reused family/variation engines
- per-bar randomness is keyed to the bar index
- changing one bar's derivation does not shift later random streams
- plan preview does not enter Sequencer Undo
- USE THIS BAR is the only direct Pattern commit action
- committed bars are ordinary editable Patterns
- EVOLVE does not create a second transport or permanent song timeline
