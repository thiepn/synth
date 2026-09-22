# Phase 21 — Beat Morph & Remix Engine

## Status

Implemented.

## Objective

Phase 21 makes Pattern identity continuously transformable without introducing a second Pattern format.

~~~text
BEAT A  ←──────── MORPH ────────→  BEAT B

RHYTHM
DYNAMICS
TIMING
GROOVE
STYLE DNA
~~~

A/B capture, Remix derivation and Morph preview are non-destructive. Only explicit COMMIT creates canonical Sequencer/Evolution state.

## Core engine

Implemented:

~~~text
src/generation/beatMorphEngine.ts
~~~

Engine IDs:

- beat-morph V1
- beat-remix V1

## Morph dimensions

Beat Morph exposes five independent normalized dimensions.

### Rhythm

Controls structural movement from A to B.

For events present in both endpoints, probability interpolates between A and B.

For A-only events:

~~~text
probability = A probability × (1 - Rhythm)
~~~

For B-only events:

~~~text
probability = B probability × Rhythm
~~~

This creates continuous structural fading rather than every hit abruptly appearing at one global 50% threshold.

Rhythm also controls structural metadata such as lane loop length, ratchet/flam choice, Kit-slot routing and endpoint monitoring state.

### Dynamics

Interpolates shared-event velocity independently from structural presence.

Intermediate accents are re-derived from the resulting velocity while exact endpoints retain endpoint accent metadata.

### Timing

Interpolates shared-event microtiming offsets independently from Groove and Dynamics.

### Groove

Interpolates Pattern-level:

- Swing
- Humanization
- Groove personality transition
- role timing offsets
- ghost-note amount

Groove personality itself is categorical and switches near the midpoint while numeric parameters interpolate continuously.

### Style DNA

Interpolates the StyleVector between A and B.

When Rhythm and Style DNA are moved independently, the Style DNA dimension also audibly reweights event probability according to the two endpoint genre profiles.

Examples of DNA-aware probability tendencies include:

- off-grid Kick activity
- Snare/ghost vocabulary
- Clap contribution
- sixteenth Hats
- Open Hats
- Percussion
- Toms
- Cymbals/Crash

The bias is calculated relative to the current Rhythm position. Therefore when all five dimensions move together, Style DNA does not double-apply the structural genre change already represented by the A/B event sets.

## Master Morph

MORPH ALL moves all five dimensions together.

If individual dimensions are later changed separately, the workspace reports CUSTOM VECTOR rather than pretending one master value still describes the state.

## Endpoint compatibility

Phase 21 requires A and B to share:

- PPQ
- meter
- Pattern length
- semantic lane IDs

This keeps continuous morph semantics deterministic and avoids hidden time-warping or meter conversion.

Different-length/meter transformation remains a later capability.

## Endpoint fidelity

With no constraining locks:

~~~text
ALL = 0   → audible A endpoint
ALL = 100 → audible B endpoint
~~~

Shared and unique event metadata, lane loop behavior, Kit-slot selection and Mute/Solo state all resolve to the respective endpoint.

## Generation-lock behavior

A-side generation locks constrain automated morph dimensions.

- Rhythm lock keeps that lane's A structure.
- Dynamics lock keeps A velocity.
- Timing lock keeps A event timing.
- Sound lock keeps A Kit-slot routing.

Because Swing is a Pattern-global timing parameter, any A-side Timing lock conservatively holds the global Groove morph at A to avoid violating the protected lane through shared swing.

Locks therefore take priority over exact B endpoint reproduction.

Direct manual editing continues to follow the existing explicit-override semantics.

## Deterministic advanced metadata

Ratchet count, Flam offset, event duration and lane loop metadata are categorical rather than safely numeric.

They switch A→B at deterministic per-event/per-lane thresholds derived from the Morph seed, avoiding every advanced property flipping simultaneously.

## Style lineage

At exact A or B Style-DNA endpoints, provenance stores the endpoint Style DNA ID/version.

At intermediate style morph positions, the StyleVector stores the actual A/B blend and styleDnaId is intentionally omitted rather than falsely claiming one exact profile.

## Morph provenance

Committed Morph Patterns store:

- A source Pattern as sourceEntityId
- B Pattern ID
- Rhythm amount
- Dynamics amount
- Timing amount
- Groove amount
- Style DNA amount

inside deterministic Morph provenance.

The Evolution Tree renders this simply as MORPH instead of exposing raw IDs.

## Remix engine

REMIX → B derives a related B endpoint from A using the existing lock-aware Beat Variation engine.

Inputs:

- source A Pattern
- selected Style DNA target
- current CREATE intent
- Remix Strength
- BPM
- deterministic seed

Remix Strength moves from RELATED toward REBUILD.

The generated candidate keeps A's Pattern length/meter, making it immediately Morph-compatible.

## Cross-style Remix

The selected Phase 20 Style DNA profile is the Remix target.

Examples:

~~~text
FUNK A → TECHNO REMIX B
ROCK A → WORSHIP REMIX B
HIP-HOP A → DNB REMIX B
AFROBEAT A → EXPERIMENTAL REMIX B
~~~

The Remix engine inherits target rhythm grammar, Groove DNA and Style lineage through the normal V2 Beat Generator/Reroll path.

## Remix lineage

Remix provenance stores:

- source Pattern ID
- target Style DNA
- Style DNA version
- Remix strength in mutationDistance
- deterministic seed
- blended StyleVector when source and target differ

Evolution Tree displays REMIX <STYLE>.

## Non-destructive workspace

Implemented:

~~~text
src/morph/BeatMorphStore.ts
src/morph/useBeatMorph.ts
~~~

The store owns immutable session snapshots for:

- endpoint A
- endpoint B
- endpoint origins
- five morph dimensions
- current derived preview

It does not import or command SequencerStore or GenerationHistoryStore.

Moving a slider therefore creates no Sequencer Undo entry and no Evolution node.

## Capture A

CAPTURE A snapshots the current canonical Pattern.

If an existing B endpoint is no longer compatible with the new A length/meter, B is automatically cleared rather than retained in an invalid workspace.

## Capture B

CAPTURE B snapshots any compatible current Pattern.

This allows workflows such as:

1. capture A
2. generate/edit another beat
3. capture that as B
4. morph between them

## Remix as B

If no A exists when REMIX → B is pressed, the current Pattern is automatically captured as A first.

A successful Remix becomes B with origin REMIX.

## Swap

A ↔ B swaps endpoint snapshots and inverts every dimension:

~~~text
new amount = 1 - old amount
~~~

This preserves approximately the same musical preview from the opposite endpoint perspective.

## Audition

A, B and current Morph preview can each be auditioned for one Pattern loop without restoring them.

Audition uses the existing Drum Engine and therefore preserves:

- probability
- polymeter
- ratchets
- flams
- microtiming
- Groove/Swing
- configured Synth/Sample/Hybrid Kit routing

Audition is disabled while the main transport is running.

## Rhythm Glyph feedback

The Morph machine renders:

- A Rhythm Glyph
- current Morph Rhythm Glyph
- B Rhythm Glyph

It also reports Rhythm Glyph distance from the preview to A and B plus shared-event count.

## Commit Morph

COMMIT MORPH promotes only the current preview into canonical state.

It:

1. prepares creative lineage from endpoint A
2. restores the preview as a normal Pattern
3. preserves current monitoring through existing restore semantics
4. creates one Evolution node with operation beatMorph / MORPH

After commit, the resulting Pattern remains fully editable in SEQUENCE and usable by Family/ARRANGE exactly like any generated or manually edited Pattern.

## Commit Remix

When B was derived through REMIX → B, COMMIT REMIX can promote B directly without first using Morph.

It creates one Evolution node with operation remix / REMIX.

## History operations

HistoryOperation now includes:

- beatMorph
- remix

No new special history artifact type is required because committed outputs remain Patterns.

## CREATE UI

CREATE now includes a BEAT / MORPH + REMIX machine between the Groove Engine and Beat Family systems.

It exposes:

- Capture A
- Capture B
- A/B Style labels
- A/B Glyphs
- Morph All
- Rhythm
- Dynamics
- Timing
- Groove
- Style DNA
- Swap
- A/B/Morph audition
- target Style DNA
- Remix Strength
- Remix → B
- Commit Morph
- Commit Remix
- Clear workspace

## Persistence boundary

The A/B Morph workspace is session-local.

Committed Morph and Remix Patterns require no special persistence because they are canonical Pattern objects with generation provenance.

Future project persistence therefore only needs to persist ordinary Patterns/history to preserve committed results.

Persisting an uncommitted A/B workspace is deferred.

## Determinism

Structural fades use probability interpolation; categorical switches use seeded thresholds; Remix uses the seeded V2 variation/generation system.

Phase 21 introduces no ambient Math.random().

## Phase boundary

Phase 21 does not yet add:

- different-length Pattern morphing
- meter/tempo time warping
- crossfade between two different Kits/Sample assets
- persistent uncommitted Morph workspaces
- live-performance Morph macros
- multi-endpoint morph surfaces
- automatic source-beat analysis from audio

Those belong to later performance/remix/persistence phases.

## Acceptance

- [x] Beat Morph engine
- [x] Remix engine
- [x] non-destructive A/B workspace
- [x] Capture A
- [x] Capture B
- [x] deterministic Remix → B
- [x] Master Morph
- [x] independent Rhythm morph
- [x] independent Dynamics morph
- [x] independent Timing morph
- [x] independent Groove morph
- [x] independent audible Style DNA morph
- [x] probability-based structural fades
- [x] shared-event velocity interpolation
- [x] shared-event microtiming interpolation
- [x] deterministic ratchet/flam switches
- [x] lane-loop morphing
- [x] lock-aware morph constraints
- [x] endpoint A/B audition
- [x] Morph audition
- [x] A/B/preview Rhythm Glyphs
- [x] distance-to-A/B feedback
- [x] endpoint swap
- [x] Beat Morph lineage provenance
- [x] Remix lineage provenance
- [x] beatMorph history operation
- [x] remix history operation
- [x] Commit Morph
- [x] Commit Remix
- [x] committed output remains normal Pattern
- [x] no preview history pollution
- [x] no Sequencer Undo pollution from sliders
- [x] Phase 19 Synth/Sample/Hybrid audition compatibility
- [x] Phase 20 Style DNA cross-morphing
- [x] no ambient randomness introduced

## Next phase

**Phase 22 — Chaos Engine & Controlled Randomness**

Phase 22 should add bounded musical chaos as a first-class generative dimension: repeatable chaos seeds, per-domain chaos amounts, freeze/lock masks, controlled event mutation, entropy visualization, and safe escalation from subtle instability to intentionally wild but still playable patterns.