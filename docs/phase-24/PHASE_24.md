# Phase 24 — Modulation, Automation & Parameter Routing

Status: implemented.

## What shipped

### Canonical target registry
- one target registry for runtime-modulatable engine and drum-material parameters
- engine targets: Master, Punch, Tone, Decay, Grit, Space, Filter
- all eight drum voices expose Impact / Body / Noise / Air / Tone / Decay / Pitch / Character
- target IDs are stable and independent from UI labels

### Modulation sources
- tempo-synced LFO
- Envelope
- Sample & Hold
- Smooth Random
- Step Mod
- deterministic seeded random sources
- bipolar / unipolar operation
- source enable/disable
- musical-rate control in beats
- phase control
- LFO sine / triangle / square / saw shapes
- envelope attack shaping
- editable 8-step Step Mod sequence

### Routing matrix
- any source can route to any registered visible target
- multiple sources can target the same parameter
- bipolar route depth from -100% to +100%
- routes can be enabled, disabled, or removed independently
- source removal automatically removes its routes
- routing never mutates the saved base drum spec

### Automation
- per-target automation lane
- Hold / Linear / Smooth interpolation
- pointer/touch drawing
- point coalescing while drawing
- click a point to remove it
- loopable automation length
- lane enable/disable
- live playhead visualization
- resolved value readout showing Base / Automation / Modulation

### Audio integration
Parameter resolution order:

```
saved base value
      ↓
automation lane
      ↓
modulation routes
      ↓
temporary LIVE performance overlay
      ↓
safety clamp
      ↓
audio engine
```

Drum material values resolve at scheduled musical pulses instead of continuously rewriting DrumSoundStore.

Master/filter/space/drive modulation uses the existing DrumEngine graph.

### Runtime guarantees
- no Pattern mutations
- no DrumSoundStore mutations from modulation
- no Sequencer Undo pollution
- no ambient Math.random()
- deterministic random sources from source seed + source identity + musical cycle
- disabled routes/sources produce no target contribution
- output values remain inside registered target bounds

## Architecture

```
Parameter Registry
      ↓
ModulationStore
├── Sources
├── Routes
└── Automation Lanes
      ↓
resolveTarget(targetId, baseValue, tick)
      ↓
DrumEngine
```

The store is intentionally runtime/session-local at this phase. Later project persistence phases can serialize its plain source/route/lane structures without changing the evaluation model.

## Automation semantics

Automation values are normalized 0–1 against each target's registered range.

If a lane has a loop length, transport ticks are folded into that loop before interpolation.

Without a lane, the saved base value remains authoritative.

## Modulation semantics

Routes apply a bounded modulation offset after automation.

LFO and random sources can be bipolar. Envelope and step sources can be switched between unipolar and bipolar behavior.

Structural systems such as CHAOS remain separate rather than being rebuilt at control-rate frequency.
