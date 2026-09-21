# Phase 0 — Future Steadybar Interoperability

This is a compatibility contract only. Phase 0 does **not** implement communication between the applications.

## 1. Ownership boundary

### Synth owns
- beat creation
- sound design
- groove generation
- variation
- arrangement
- live transformation

### Steadybar owns
- practice sessions
- timing exercises
- tempo progression
- skill training
- practice analytics

Neither application should duplicate the other's main product.

## 2. Future exchange model

Communication should use a neutral rhythm document rather than coupling either app to the other's internal project schema.

Conceptual payload:

```text
RhythmExchange
├── schemaVersion
├── title
├── tempo
├── meter
├── ppq
├── lengthTicks
├── lanes
│   ├── semanticRole
│   └── events
├── groove
└── metadata
```

No Synth synthesis graph, UI state, generation tree, or sample asset is required for practice interoperability.

## 3. Synth → Steadybar

Potential future action: **Practice in Steadybar**

Transfer:

- tempo
- meter
- editable rhythm events
- velocity/accent intent when relevant
- groove/swing data
- section or loop length

Steadybar decides how to convert this into exercises.

## 4. Steadybar → Synth

Potential future action: **Open in Synth**

Transfer:

- tempo
- meter
- rhythm/sticking-derived events where musically applicable
- accents
- loop boundaries

Synth decides how to orchestrate, sound-design, vary, and arrange it.

## 5. Compatibility constraints

- use 960 PPQ or losslessly map to it
- semantic lane roles instead of product-specific UI names
- version every exchange payload
- unknown optional fields must be safely ignorable
- never require a cloud service for exchange
- keep the format representable as plain JSON
- transport musical structure, not rendered audio

## 6. Explicit deferral

Do not implement:

- deep links
- shared storage
- cross-app launch APIs
- automatic syncing
- common accounts

until both applications independently have stable v1 data models.
