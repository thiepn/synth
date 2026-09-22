# Phase 20 — Style DNA & Genre Expansion

## Status

Implemented.

## Objective

Phase 20 replaces the public seven-style preset list with versioned musical behavior profiles.

~~~text
STYLE NAME
    ↓
STYLE DNA
├── rhythm archetype
├── kick grammar
├── backbeat grammar
├── subdivision vocabulary
├── instrumentation tendencies
├── ghost vocabulary
├── pocket / humanization
├── fill vocabulary
├── sound-material tendencies
└── arrangement energy
~~~

The original seven generators remain internal rhythm archetypes. They are no longer the public genre model.

## Versioned registry

Implemented:

~~~text
src/style/styleDNA.ts
~~~

Current registry version:

~~~text
STYLE_DNA_VERSION = 1
~~~

Generation provenance may now store styleDnaId and styleDnaVersion so generated Patterns, Kits, Beat Families and arrangement foundations can be interpreted against the exact musical profile version that produced them.

## Genre library

Phase 20 expands Synth to 25 public Style DNA profiles.

### Band / Human

- Rock
- Punk
- Metal
- Blues
- Jazz
- Shuffle
- Funk
- Gospel
- Worship

### Hip-Hop / Urban

- Hip-Hop
- Lo-Fi
- Trap

### Club / Electronic

- House
- Disco
- Techno
- Garage
- Drum & Bass
- Breakbeat
- Electronic

### Roots / Global

- Reggae
- Afrobeat
- Latin

### Cinematic / Experimental

- Industrial
- Cinematic
- Experimental

## Internal rhythm archetypes

The 25 profiles map onto seven reusable low-level rhythm engines:

- Rock
- Funk
- Hip-Hop
- House
- Trap
- Breakbeat
- Electronic

This preserves mature generator code while allowing multiple genres to share a structural ancestry and still differ through Style DNA transforms.

For example, House, Disco and Techno can share a four-on-floor archetype while differing in humanization, hats, percussion, sound material and arrangement energy.

## Rhythm DNA

Every profile stores normalized behavior for:

- four-on-floor tendency
- kick syncopation
- backbeat strength
- half-time tendency
- clap blend
- sixteenth-hat activity
- open-hat activity
- percussion activity
- tom activity
- crash activity
- ghost vocabulary
- ratchet vocabulary
- flam vocabulary

Beat Generator first creates an archetypal beat and then applies the selected profile's deterministic rhythm grammar.

## Subdivision vocabulary

Profiles also declare one dominant subdivision vocabulary:

- Quarter
- Eighth
- Sixteenth
- Shuffle
- Broken
- Rolling

This affects both generated event behavior and validation.

Trap, for example, uses Rolling vocabulary; DnB uses Sixteenth; Blues/Jazz/Shuffle use Shuffle; Garage uses Shuffle on a Breakbeat archetype.

## Half-time grammar

Half-time profiles are no longer forced through the old fixed backbeat validator.

Style DNA determines the expected backbeat location. Trap can therefore center its backbeat on the half-time pulse without being incorrectly rejected for missing conventional 2/4 backbeats.

## DNA-aware validation

Beat validation now uses the selected Style DNA.

It checks:

- whether that style requires a strong backbeat
- whether a four-on-floor profile retained quarter-note kick foundation
- whether a rolling profile has enough subdivision activity
- whether a highly syncopated kick grammar actually contains syncopated kick movement
- style-dependent minimum subdivision density
- style-dependent upper density tolerance

Old hard-coded House/Funk/Trap quality rules have been replaced by profile-based checks.

## Advanced event vocabulary

Style DNA can author Advanced Sequencer metadata during generation.

Depending on the profile, generated hats/fill voices may receive:

- ratchets
- flams

These are deterministic and remain normal editable StepEvent data.

## Audible pocket

Style DNA is not metadata-only.

Fresh beat generation now runs the generated Pattern through the existing Groove Engine using the profile's:

- groove personality
- humanization amount
- ghost-note amount
- base swing

Examples include tight Techno, laid-back Lo-Fi/Reggae, deep Funk/Hip-Hop, loose Jazz/Experimental and pushing Punk.

The manual Groove Engine controls remain available afterward as explicit user overrides.

## Intent vs Style DNA

Style DNA provides the genre baseline. CREATE's Energy, Density, Complexity, Syncopation and Swing controls remain user intent.

That means selecting Funk does not lock the user into one preset beat; the profile defines the vocabulary while intent controls how strongly/busily the current result expresses it.

## Generator versioning

Because generated musical behavior changed materially:

- Beat Generator is now V2
- Beat Variation is now V2
- Musical Mutation is now V2
- Kit Generator is now V2
- Beat Family Generator is now V2
- Scene / Section Generator is now V2

Generated artifacts carry Style DNA ID/version where relevant.

## Reroll and mutation

Reroll accepts every Style DNA ID because BeatStyleId now aliases StyleDNAId.

Reroll-generated candidates therefore use the same Style DNA grammar as fresh generation.

Musical Mutation also preserves Style DNA provenance. The intentional FUNKIER command still temporarily derives through the Funk profile because that command explicitly asks for Funk vocabulary.

## Style sound DNA

Every Style DNA profile includes sound-material tendencies:

- Kit direction
- Weight
- Brightness
- Roughness
- Synthetic character
- Tightness

These values bias the existing coherent Kit Generator rather than replacing it.

Examples:

- Techno / Trap → strongly electronic/synthetic material
- Rock / Worship / Gospel / Metal → heavier acoustic/hybrid material
- Lo-Fi / Blues / Jazz / Reggae → vintage/darker material
- Industrial → rough/high-synthetic material
- Cinematic → huge/deep material

## GENERATE STYLE KIT

CREATE now exposes an explicit GENERATE STYLE KIT action.

It:

1. reads the selected Style DNA
2. uses the profile's Kit direction
3. blends Style sound DNA into coherent Kit DNA
4. respects existing sound locks
5. applies the generated Kit atomically

Phase 19 sample assignments and Synth/Sample/Hybrid source modes remain attached through this operation.

## SOUND Kit inheritance

The normal SOUND Kit Generator also checks the current Pattern's Style DNA provenance.

When available, manual Tight/Huge/Dark/etc. generation still respects the chosen Kit direction while receiving a secondary material bias from the Pattern's genre.

## Beat Family fill vocabulary

Beat Families now use Style DNA for:

- Build density
- Build ratchet tendency
- Drop Crash tendency
- Drop Open Hat tendency
- Fill Tom/Snare/Percussion balance
- Fill ratchet tendency
- Fill flam tendency

This makes, for example, Gospel fills more expressive/tom-heavy, Trap fills more ratchet-heavy, Afrobeat/Latin fills more percussion-oriented, and Punk fills simpler than Experimental fills.

## Beat Family energy

CORE / A / B / BUILD / BREAKDOWN / DROP / FILL / TRANSITION energy is derived from Style DNA arrangement behavior instead of one global table.

Member Pattern provenance uses the same DNA-derived member energy reported by BeatFamily.

## Arrangement energy DNA

Each profile includes target energy for:

- Intro
- Verse
- Pre-Chorus
- Chorus
- Breakdown
- Build
- Drop
- Outro

Phase 17 Scene generation consumes these values.

Section energy ramps are centered around the genre target while preserving the Compact/Standard/Extended template's rising or falling direction.

Phase 18 Energy Sculpture therefore begins with genre-specific macro dynamics.

## Style DNA UI

CREATE now contains a STYLE / DNA machine above the Beat Reactor.

It groups all genres into five families and exposes the selected profile's:

- archetype
- subdivision vocabulary
- BPM reference range
- pocket/personality
- base swing
- Kit direction
- kick syncopation
- backbeat strength
- sixteenth-hat activity
- percussion activity
- ghost vocabulary
- fill density
- sound weight/brightness/roughness/synthetic/tightness
- complete arrangement-energy fingerprint

The old seven-button style bank has been removed from the public generator UI.

## BPM ranges

Style DNA BPM ranges are descriptive musical metadata in Phase 20.

Selecting a style does not silently change the global transport tempo. The user's current BPM remains authoritative.

## Provenance flow

Style DNA identity is preserved through:

- fresh Beat generation
- Reroll
- Musical Mutation
- Kit generation
- Kit mutation/morph when the source Kit has Style DNA
- Beat Family generation
- Scene generation
- Arrangement Foundation provenance

This allows future archive/remix systems to understand the actual style lineage rather than infer genre from names.

## Determinism

All Style DNA transforms use Synth's existing seeded PRNG.

Phase 20 introduces no ambient Math.random().

## Phase boundary

Phase 20 does not yet add:

- user-authored custom Style DNA profiles
- learned style extraction from imported audio
- automatic BPM changes when selecting a style
- probabilistic blending of multiple Style DNA profiles
- visual two-style morphing
- remix extraction from an arbitrary source Pattern
- Style DNA persistence editor

Those belong to later morph/remix/customization phases.

## Acceptance

- [x] versioned Style DNA registry
- [x] 25 public genre profiles
- [x] 5 genre families
- [x] 7 internal rhythm archetypes
- [x] kick grammar
- [x] backbeat grammar
- [x] half-time grammar
- [x] subdivision vocabulary
- [x] instrumentation tendencies
- [x] ghost vocabulary
- [x] groove personality
- [x] default humanization
- [x] base swing
- [x] fill vocabulary
- [x] sound-material DNA
- [x] arrangement-energy DNA
- [x] Style-DNA-aware Beat Generator
- [x] Style-DNA-aware Beat validation
- [x] Style DNA audible through Groove Engine
- [x] Reroll supports all profiles
- [x] Musical Mutation preserves Style DNA
- [x] Style Kit generation
- [x] sound locks respected by Style Kit
- [x] Phase 19 sample layers preserved by Style Kit
- [x] normal SOUND Kit Generator inherits Pattern Style DNA
- [x] Beat Family fills use Style DNA
- [x] Beat Family energy uses Style DNA
- [x] Scene energy uses Style DNA
- [x] Section energy ramps use Style DNA
- [x] Style DNA ID/version in provenance
- [x] old seven-style public bank removed
- [x] Style DNA fingerprint UI
- [x] no ambient randomness introduced

## Next phase

**Phase 21 — Beat Morph & Remix Engine**

Phase 21 should make Pattern identity continuously transformable: A↔B beat morphing, Style DNA cross-morphing, remix derivation from an existing beat, structural/dynamics/timing morph dimensions, and committed morph states that remain normal editable Patterns with lineage.