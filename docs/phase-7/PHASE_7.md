# Phase 7 — Rhythm Glyph System

## Status

Implemented.

## Objective

Phase 7 replaces Synth's placeholder glyph artwork with a deterministic visual fingerprint derived directly from the active musical Pattern.

The glyph is no longer decorative.

```text
Pattern
  ├── hit placement
  ├── instrument roles
  ├── velocity
  ├── syncopation
  ├── swing
  └── microtiming
       ↓
Rhythm Glyph geometry
       ↓
CREATE / SEQUENCE / future surfaces
```

## Visual concept

The Rhythm Glyph is a **musical sigil** built around a central spine.

### Main spine
The center line reacts to the balance between:

- kick
- backbeat
- hats
- percussion

### Upper contour
Primarily expresses:

- snare / clap activity
- hi-hat activity
- cymbal energy

### Lower contour
Primarily expresses:

- kick weight
- tom / percussion activity
- cymbal mass

### Kick nodes
Kick hits create rotated square/diamond anchors below the spine.

### Backbeat nodes
Snare and clap hits create upper circular anchors.

### Accent nodes
Dense/high-velocity moments create smaller central signal nodes.

### Hat teeth
Hi-hat events extend upward as narrow signal teeth.

### Percussion branches
Tom and percussion activity extends diagonally from the lower contour.

### Cymbal bars
Cymbal events create short horizontal upper bars.

The result remains abstract enough to function as a brand symbol while still being structurally connected to the rhythm.

## Pure visual derivation

Core implementation:

```text
src/visual/rhythmGlyph.ts
```

`deriveRhythmGlyph(pattern)` is:

- framework-independent
- deterministic
- side-effect free
- independent of Web Audio
- independent of React
- independent of generator provenance

It returns serializable SVG geometry and musical metrics.

## Signature identity

Each Pattern receives a deterministic glyph signature.

The signature hashes canonical musical data including:

- PPQ
- pattern length
- meter
- groove swing
- lane roles
- event ticks
- velocity
- probability
- microtiming
- accent / flam / ratchet metadata when present

It deliberately ignores:

- Pattern ID
- Pattern name
- generation seed
- provenance metadata
- mute state
- solo state
- rhythm lock state

Therefore two Patterns containing the same musical structure receive the same Rhythm Glyph signature even when they came from different editor/history contexts.

The signature is displayed as:

```text
RG-12AB34
```

The short UI label is derived from the full 32-bit deterministic signature.

## Musical similarity

Visual similarity does **not** rely on the hash.

Geometry is generated continuously from musical features, so related Patterns naturally remain visually related.

For example:

- adding one kick changes one lower anchor/contour region
- increasing hat density adds teeth rather than rebuilding the whole symbol
- stronger backbeats deepen upper contour peaks
- swing shifts timed event geometry horizontally
- velocity edits change node/contour magnitude

This is crucial: the hash identifies exact equality; the geometry communicates similarity.

## Metrics

The derivation engine calculates normalized metrics:

- density
- syncopation
- mean velocity
- velocity contrast
- swing
- kick activity
- backbeat activity
- hat activity
- percussion activity
- microtiming amount

SEQUENCE currently exposes:

- DENS
- SYNC
- SWNG
- VEL

alongside the live glyph.

## Timing geometry

Event timing offsets subtly move their step geometry horizontally.

The amount is deliberately bounded so:

- swing is visible
- pushed/late events can eventually be represented
- the glyph remains readable
- microtiming cannot destroy overall structure

## Determinism contract

Same musical Pattern:

```text
deriveRhythmGlyph(A)
===
deriveRhythmGlyph(A clone)
```

even if IDs and provenance differ.

An edit to musical data changes the signature and corresponding geometry.

Monitoring/editor-only changes such as mute, solo, or generation locks do not.

## Similarity utility

Added:

```text
src/visual/rhythmGlyphSimilarity.ts
```

This compares glyph feature vectors across:

- density
- syncopation
- velocity
- swing
- instrumentation
- microtiming

It returns a normalized distance rather than comparing SVG strings or hashes.

This is groundwork for later features such as:

- “similar beats”
- Archive filtering
- Beat Morphing
- Groove DNA comparisons

Phase 7 does not expose that search UI yet.

## CREATE integration

CREATE now displays the active Pattern's actual Rhythm Glyph.

The signature heading uses:

```text
RG-xxxxxx
```

rather than the generation seed.

This distinction matters:

- Synth generation seed identifies how a beat was created
- Rhythm Glyph signature identifies the actual musical structure currently present

Manual editing therefore changes the Glyph even when generator provenance remains unchanged.

## SEQUENCE integration

SEQUENCE now contains a compact live Rhythm Glyph diagnostic strip above the matrix.

Every manual edit immediately updates:

- geometry
- signature
- density
- syncopation
- swing
- velocity metric

The matrix and glyph therefore show two views of the same Pattern:

```text
Rhythm Matrix = exact editable detail
Rhythm Glyph  = compressed structural identity
```

## Future-mode integration

SOUND / ARRANGE / LIVE / ARCHIVE placeholders previously displayed fake pre-authored glyph variants.

Those placeholders now render the current real Pattern Glyph.

There is no remaining decorative Rhythm Glyph pathway.

## Visual language

The SVG renderer uses semantic Synth colors:

- PHOSPHOR — main rhythm spine / accents
- HEAT — kick contour and kick nodes
- ICE — upper/hats contour
- BONE — cymbal traces
- ETCH — structural axis

The glyph uses SVG-native stroke values for cross-browser reliability.

## Responsive behavior

The same geometry is reusable at any display size.

- CREATE uses the larger signature stage.
- SEQUENCE uses a compact form.
- future-mode previews use the normal glyph.
- later Archive rows can reuse the compact SVG without regenerating artwork.

No raster thumbnail assets are required.

## Phase boundary

Phase 7 does not yet add:

- visible generation branching
- glyph-based search UI
- beat-family views
- glyph morph animation
- export artwork
- Archive implementation
- similarity recommendation UI

Those belong to later phases.

## Acceptance

- [x] placeholder glyph paths removed from active UI
- [x] glyph is derived from actual Pattern data
- [x] exact musical clones produce the same signature
- [x] IDs/provenance do not affect the signature
- [x] mute/solo/lock state does not affect musical identity
- [x] kick structure affects lower geometry
- [x] backbeat affects upper geometry
- [x] hats create distinct teeth/activity
- [x] percussion creates branch geometry
- [x] velocity affects magnitude
- [x] swing/microtiming affect horizontal geometry
- [x] CREATE updates after generation/reroll/manual edits
- [x] SEQUENCE updates immediately after editing
- [x] future-mode placeholders use real current Pattern glyph
- [x] similarity is feature-based rather than hash-based
- [x] SVG rendering avoids browser-fragile CSS arithmetic

## Next phase

**Phase 8 — Groove & Humanization Engine**

Phase 8 should turn groove from basic generated swing into a full musical feel system: correlated velocity behavior, ghost-note vocabulary, role-specific microtiming, groove personalities, and humanized timing that remains deterministic and visually represented in both Rhythm Matrix and Rhythm Glyph.
