# Phase 0 — Pulse Architecture

Pulse Architecture is Synth's canonical UI/visual language.

## 1. Design objective

Synth must look and behave like a purpose-built generative musical instrument, not a generic web dashboard.

A screenshot with the logo hidden should still be recognizable as Synth.

## 2. Signature primitives

### Pulse Spine
A recurring line representing time, signal, progress, and structural position.

### Beat Reactor
The primary generation/mutation control. It replaces the generic “Generate” CTA.

### Rhythm Glyph
A deterministic visual signature derived from musical structure.

### Instrument Strips
Continuous embedded tracks instead of card-per-instrument UI.

### Signal Rails
Calibrated parameter controls instead of generic slider styling.

### Groove Fields
2D musical spaces for manipulating related high-level properties.

### Evolution Tree
Visible lineage of generations and mutations.

### Energy Sculpture
Direct manipulation of arrangement intensity over musical time.

### Phosphor Traces
Brief signal persistence used to show musical activity, not decoration.

## 3. Surface language

- matte
- machined
- low-radius
- etched divisions
- restrained depth
- compact information density
- clipped/notched details only when consistent

Avoid decorative surface stacking.

## 4. Color semantics

Structural neutrals:

- VOID
- GRAPHITE
- CARBON
- METAL
- ETCH
- BONE
- ASH

Signal colors:

- PHOSPHOR — active / selected / playing
- HEAT — impact / energy / transient
- ICE — timing / modulation / movement
- ERROR — destructive/error/clipping only

Signal colors communicate meaning and are not general decoration.

## 5. Typography

- compact grotesk/condensed labels
- uppercase control labels where appropriate
- monospaced numerical/readout layer
- terse machine-style metadata

Examples:

```text
03 / SOUND
128.0 BPM
SYN-7F2-A14
GROOVE / DENSITY
```

Avoid oversized marketing-style headings inside the instrument.

## 6. Motion semantics

Animation must map to a real state:

- hit → compression / short phosphor persistence
- generation → signal propagation
- lock → mechanical snap
- mutation → deformation/transition from old state
- scene transition → energy flow
- playback → Web Audio-clock-derived movement

No meaningless floating, bobbing, or ambient motion.

## 7. Layout rules

### Desktop
- compact utility/transport rail
- large musical workspace
- bottom or chassis-style mode rail
- contextual controls appear near selected material
- no permanent generic sidebar

### Mobile
A deliberate pocket groovebox composition. Do not scale the desktop canvas down.

### Tablet
Treat touch, XY fields, pads, and sequencer manipulation as first-class.

## 8. Canonical modes

```text
01 / CREATE
02 / SEQUENCE
03 / SOUND
04 / ARRANGE
05 / LIVE
06 / ARCHIVE
```

Each mode may have a distinct composition but shares the same visual grammar.

## 9. Banned defaults

Do not introduce these without a specific justified exception:

- dashboard metric cards
- giant rounded cards
- glassmorphism
- purple/blue AI gradients
- floating blobs
- pill-shaped everything
- generic sparkle/AI iconography
- permanent desktop hamburger navigation
- permanent settings sidebar
- card-per-parameter layouts
- decorative waveforms unrelated to audio
- generic skeleton cards
- generic loading spinners when a signal/progress representation is available

## 10. Information-as-interface rule

Where possible, the musical information itself becomes the control.

Examples:

- velocity changes hit geometry
- microtiming changes horizontal position
- density is editable as a profile
- energy is edited as an arrangement body
- pattern lineage is navigated as an evolution tree
- generated rhythm creates its own Glyph

This rule takes priority over wrapping data in conventional UI components.
