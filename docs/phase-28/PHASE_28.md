# Phase 28 — Mastering, Rendering & Export Engine

Status: implemented.

## What shipped

### Mastering
A dedicated final-output stage now follows the committed Phase 27 mix.

Quick Master directions:
- Clean
- Punchy
- Dynamic
- Loud

Master parameters:
- Input Trim
- Low shelf
- High shelf
- Glue compression
- Stereo Width
- Output Gain
- Limiter Ceiling
- Bypass / Enable

Quick Master is non-destructive until committed.

A / ORIGINAL and B / MASTERED use preview-only level matching so louder candidates are not automatically perceived as better. The level-match offset is never committed.

Manual master changes support bounded Undo/Redo.

### Live master signal chain

```
Phase 27 mix bus
      ↓
engine master
      ↓
input trim
      ↓
low shelf
      ↓
high shelf
      ↓
glue compressor
      ↓
stereo width matrix
      ↓
output gain
      ↓
ceiling limiter
      ↓
output meter
```

When mastering is bypassed, the extra processing stages are neutral while Synth's existing safety limiter remains active.

### Immutable render snapshot
Every export begins by freezing:
- BPM / meter
- render range
- Pattern or ARRANGE occurrences
- section energy envelopes
- V2 drum material specs
- resolved synth/sample/hybrid slot sounds
- raw bytes for referenced local sample assets
- mixer state
- modulation sources / routes / automation lanes
- engine master/macros
- committed mastering state

Edits made after render begins therefore cannot leak into that render.

### Render ranges
- Current Pattern
- Full ARRANGE timeline
- One ARRANGE section
- Custom ARRANGE bar range
- Exact Pattern Loop

### Offline PCM renderer
The renderer uses OfflineAudioContext and produces floating-point AudioBuffer output before external encoding.

It supports:
- deterministic Pattern probability
- swing
- microtiming
- ratchets
- flams
- section energy
- V2 synth/sample/hybrid playback
- sample trim / pitch / reverse / gain
- Phase 24 modulation + automation
- Phase 27 channel mix
- sidechain
- room send
- committed mastering
- one-beat pre-roll for automation/effect state
- bounded none / auto / fixed tails
- optional per-voice stem scope
- render analysis

Internal PCM remains independent from WAV encoding so later bounce/resample workflows can consume it directly.

### WAV encoder
Supported:
- 16-bit PCM
- 24-bit PCM
- 32-bit float
- 44.1 kHz
- 48 kHz
- optional deterministic TPDF dither for integer PCM only

Dither is automatically disabled for 32-bit float.

### Stem export
All eight drum voices can be rendered sequentially and packaged into one dependency-free ZIP.

Stems are exported pre-master by design.

Each stem still uses its channel processing and shared production model. Because nonlinear shared-bus processing is evaluated independently per stem, processed stems are intended for transfer/further production rather than guaranteed sample-null reconstruction of the stereo mix.

### Render tasks
One RenderStore owns:
- prepare
- render
- encode
- stem iteration
- ZIP packaging
- completed/error/cancelled state

Cancellation is logical: OfflineAudioContext cannot reliably abort an active native startRendering call, so a cancelled job discards that result and prevents encoding/download/subsequent stems.

### Analysis
Finished stereo renders report:
- Duration
- Peak
- RMS
- approximate loudness indicator
- samples above full scale

The displayed loudness value is an estimate, not a standards-certified integrated LUFS meter.

## Export semantics

### PRE-MASTER
Includes the committed mixer and engine processing but bypasses the optional MasteringStore processing.

### FINAL MASTER
Includes committed mastering.

An uncommitted master candidate cannot be exported. The user must Commit or Cancel first so exported state is unambiguous and reproducible.

### LOOP
Pattern range with no tail. Render length is tied to the exact requested musical range.

### TAIL
- None: no requested post-range tail
- Auto: bounded room/sample decay estimate
- Fixed: user-selected seconds, bounded to 10 seconds

## Architecture

```
live project stores
      ↓
createRenderSnapshot()
      ↓
immutable RenderSnapshot
      ↓
renderSnapshot()
      ↓
floating-point AudioBuffer
      ├── future internal resample/bounce
      └── encodeWav()
              ↓
         WAV / STEM ZIP
```

This is the one render infrastructure later phases should reuse.

## Safety invariants
- source project is not mutated by rendering
- export reads one immutable snapshot
- missing referenced sample bytes fail before rendering
- render ranges are bounded
- auto tail is bounded
- final master uses committed state only
- 32-bit float never receives dither
- filenames are sanitized
- object URLs are revoked after download
- stem renders are sequential to control memory pressure
- stale/cancelled render results cannot trigger download
